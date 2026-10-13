import json
import logging
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from starlette.concurrency import run_in_threadpool

from .ai import AssistantNotConfigured, call_openrouter, generate_board_ai_response
from .auth import COOKIE_NAME, SESSION_SECONDS, create_session, delete_session, require_user, token_hash
from .database import BoardConflict, init_db, load_board_for_user, save_board_for_user
from .models import AIRequest, Board, BoardWrite, Login

PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST_DIR = PROJECT_ROOT / "frontend" / "out"
logger = logging.getLogger(__name__)
MAX_BODY_BYTES = 1024 * 1024


def board_body_bytes(board: dict) -> int:
    """Size of the manual save request the browser would send for this board."""
    return len(json.dumps({"board": board}, ensure_ascii=False, separators=(",", ":")).encode())


class LimitRequestBody:
    """Bound API bodies even when Content-Length is absent or dishonest."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            return await self.app(scope, receive, send)
        chunks = []
        length = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            length += len(chunk)
            if length > MAX_BODY_BYTES:
                response = JSONResponse({"detail": "Request is too large."}, status_code=413)
                return await response(scope, receive, send)
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        body = b"".join(chunks)

        replayed = False

        async def replay():
            nonlocal replayed
            if replayed:
                return await receive()
            replayed = True
            return {"type": "http.request", "body": body, "more_body": False}

        await self.app(scope, replay, send)


@asynccontextmanager
async def lifespan(app):
    init_db()
    yield


app = FastAPI(title="Project Management MVP", lifespan=lifespan)
app.add_middleware(LimitRequestBody)


@app.middleware("http")
async def browser_boundary(request: Request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if (origin and origin != str(request.base_url).rstrip("/")) or request.headers.get("sec-fetch-site") == "cross-site":
            return JSONResponse({"detail": "Cross-origin writes are not allowed."}, status_code=403)
        if request.url.path.startswith("/api/") and not request.headers.get("content-type", "").startswith("application/json"):
            return JSONResponse({"detail": "Use application/json."}, status_code=415)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": "project-management-backend"}


@app.post("/api/login")
def login(payload: Login, request: Request, response: Response):
    if not (secrets.compare_digest(payload.username.encode(), b"user") and
            secrets.compare_digest(payload.password.encode(), b"password")):
        raise HTTPException(status_code=401, detail="Incorrect username or password.")
    delete_session(request)
    response.set_cookie(COOKIE_NAME, create_session("user"), max_age=SESSION_SECONDS,
                        httponly=True, samesite="strict", secure=request.url.scheme == "https")
    return {"username": "user"}


@app.get("/api/session")
def session(username: str = Depends(require_user)):
    return {"username": username}


@app.post("/api/logout")
def logout(request: Request, response: Response):
    delete_session(request)
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@app.get("/api/board", response_model=Board)
def get_board(username: str = Depends(require_user)):
    return load_board_for_user(username)


def commit_board(username: str, board: dict, request: Request):
    try:
        return save_board_for_user(username, board, token_hash(request.cookies.get(COOKIE_NAME, "")))
    except BoardConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@app.post("/api/board", response_model=Board)
def save_board(payload: BoardWrite, request: Request, username: str = Depends(require_user)):
    return commit_board(username, payload.board.model_dump(), request)


@app.post("/api/ai")
async def ai_chat(payload: AIRequest, request: Request, username: str = Depends(require_user)):
    # SQLite calls run in the threadpool so they never block the event loop.
    board = await run_in_threadpool(load_board_for_user, username)
    if board["revision"] != payload.revision:
        raise HTTPException(status_code=409, detail="The board changed. Reload before asking again.")
    try:
        result = await generate_board_ai_response(payload.prompt, board=board,
            conversation=[entry.model_dump() for entry in payload.conversation], openrouter_client=call_openrouter)
        Board.model_validate(result["board"])
    except AssistantNotConfigured as exc:
        logger.warning("AI provider not configured: %s", exc)
        raise HTTPException(status_code=503, detail="The assistant is not configured. Set OPENROUTER_API_KEY in .env.") from exc
    except httpx.TimeoutException as exc:
        logger.warning("AI provider timed out")
        raise HTTPException(status_code=504, detail="The assistant timed out. Please try again.") from exc
    except (httpx.RequestError, RuntimeError, ValueError) as exc:
        logger.warning("AI provider failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=502, detail="The assistant is unavailable or returned an invalid response.") from exc
    # Every stored board must stay saveable through the size-limited manual path.
    if result["actions"] and board_body_bytes(result["board"]) > MAX_BODY_BYTES:
        raise HTTPException(status_code=422,
            detail="The assistant's changes would make the board too large to save. Ask for fewer or shorter cards.")
    await run_in_threadpool(require_user, request)
    if result["actions"]:
        saved = await run_in_threadpool(commit_board, username, result["board"], request)
    else:
        saved = await run_in_threadpool(load_board_for_user, username)
    if not result["actions"] and saved["revision"] != payload.revision:
        raise HTTPException(status_code=409, detail="The board changed while the assistant was working.")
    return {"response": result["message"], "model": result["model"], "board": saved,
            "actions": result["actions"], "rejectedActions": result["rejectedActions"]}


@app.get("/")
@app.get("/{path:path}")
def serve_frontend(path: str = ""):
    if path == "api" or path.startswith("api/") or "\\" in path or ":" in path:
        raise HTTPException(status_code=404)
    root = FRONTEND_DIST_DIR.resolve()
    candidate = (root / (path or "index.html")).resolve()
    if not candidate.is_relative_to(root):
        raise HTTPException(status_code=404)
    if candidate.is_dir():
        candidate = (candidate / "index.html").resolve()
    if not candidate.is_relative_to(root) or not candidate.is_file():
        raise HTTPException(status_code=404, detail="Page not found. Build the frontend before starting the backend.")
    return FileResponse(candidate)
