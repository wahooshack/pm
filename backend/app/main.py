import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from starlette.concurrency import run_in_threadpool

from .ai import AssistantNotConfigured, AssistantReplyTooLong, call_openrouter, generate_board_ai_response
from . import database
from .auth import COOKIE_NAME, require_admin, require_user, session_hash, start_session
from .models import (AIRequest, AdminUserUpdate, Board, BoardCreate, BoardWrite, Login, MemberAdd, PasswordChange,
                     ProfileUpdate, Register)

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
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH", "DELETE"}:
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
    database.init_db()
    yield


app = FastAPI(title="Project Management", lifespan=lifespan)
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


@app.exception_handler(database.NotFound)
async def not_found(request, exc):
    return JSONResponse({"detail": str(exc)}, status_code=404)


@app.exception_handler(database.Forbidden)
async def forbidden(request, exc):
    return JSONResponse({"detail": str(exc)}, status_code=403)


@app.exception_handler(database.Invalid)
async def invalid(request, exc):
    return JSONResponse({"detail": str(exc)}, status_code=422)


@app.exception_handler(database.UserExists)
async def user_exists(request, exc):
    return JSONResponse({"detail": str(exc)}, status_code=409)


# Users and sessions

@app.post("/api/register")
def register(payload: Register, request: Request, response: Response):
    user = database.create_user(payload.username, payload.displayName, payload.password)
    start_session(user["id"], request, response)
    return user


@app.post("/api/login")
def login(payload: Login, request: Request, response: Response):
    user = database.authenticate(payload.username, payload.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Incorrect username or password.")
    start_session(user["id"], request, response)
    return user


@app.get("/api/session")
def session(user: dict = Depends(require_user)):
    return user


@app.post("/api/logout")
def logout(request: Request, response: Response):
    database.delete_session(session_hash(request))
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@app.post("/api/me")
def update_profile(payload: ProfileUpdate, user: dict = Depends(require_user)):
    return database.update_display_name(user["id"], payload.displayName)


@app.post("/api/me/password")
def change_password(payload: PasswordChange, request: Request, user: dict = Depends(require_user)):
    database.change_password(user["id"], payload.currentPassword, payload.newPassword, session_hash(request))
    return {"ok": True}


@app.get("/api/admin/users")
def admin_users(admin: dict = Depends(require_admin)):
    return database.list_users()


@app.post("/api/admin/users/{username}")
def admin_update_user(username: str, payload: AdminUserUpdate, admin: dict = Depends(require_admin)):
    return database.admin_update_user(admin["id"], username, payload.isActive, payload.isAdmin, payload.password)


# Boards

@app.get("/api/boards")
def boards(user: dict = Depends(require_user)):
    return database.list_boards(user["id"])


@app.post("/api/boards", response_model=Board)
def create_board(payload: BoardCreate, user: dict = Depends(require_user)):
    return database.create_board(user["id"], payload.name)


@app.get("/api/boards/{board_id}", response_model=Board)
def get_board(board_id: int, user: dict = Depends(require_user)):
    return database.load_board(board_id, user["id"])


def commit_board(board_id: int, user_id: int, board: dict, request: Request):
    try:
        return database.save_board(board_id, user_id, board, session_hash(request))
    except database.BoardConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except database.Forbidden:
        raise
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@app.post("/api/boards/{board_id}", response_model=Board)
def save_board(board_id: int, payload: BoardWrite, request: Request, user: dict = Depends(require_user)):
    return commit_board(board_id, user["id"], payload.board.model_dump(), request)


@app.delete("/api/boards/{board_id}")
def delete_board(board_id: int, user: dict = Depends(require_user)):
    database.delete_board(board_id, user["id"])
    return {"ok": True}


@app.get("/api/boards/{board_id}/participants")
def participants(board_id: int, user: dict = Depends(require_user)):
    return database.board_participants(board_id, user["id"])


@app.get("/api/boards/{board_id}/members")
def members(board_id: int, user: dict = Depends(require_user)):
    return database.list_members(board_id, user["id"])


@app.post("/api/boards/{board_id}/members")
def add_member(board_id: int, payload: MemberAdd, user: dict = Depends(require_user)):
    return database.add_member(board_id, user["id"], payload.username, payload.role)


@app.delete("/api/boards/{board_id}/members/{username}")
def remove_member(board_id: int, username: str, user: dict = Depends(require_user)):
    return database.remove_member(board_id, user["id"], username)


@app.post("/api/boards/{board_id}/ai")
async def ai_chat(board_id: int, payload: AIRequest, request: Request, user: dict = Depends(require_user)):
    # SQLite calls run in the threadpool so they never block the event loop.
    board = await run_in_threadpool(database.load_board, board_id, user["id"])
    if board["role"] == "viewer":
        raise HTTPException(status_code=403, detail="You have view-only access to this board.")
    if board["revision"] != payload.revision:
        raise HTTPException(status_code=409, detail="The board changed. Reload before asking again.")
    participants = await run_in_threadpool(database.board_participants, board_id, user["id"])
    try:
        result = await generate_board_ai_response(payload.prompt, board=board,
            conversation=[entry.model_dump() for entry in payload.conversation], openrouter_client=call_openrouter,
            participants=participants)
        Board.model_validate(result["board"])
    except AssistantNotConfigured as exc:
        logger.warning("AI provider not configured: %s", exc)
        raise HTTPException(status_code=503, detail="The assistant is not configured. Set OPENROUTER_API_KEY in .env.") from exc
    except AssistantReplyTooLong as exc:
        logger.warning("AI provider reply truncated at the token limit")
        raise HTTPException(status_code=502,
            detail="The assistant's reply was too long. Ask for fewer changes at once.") from exc
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
        saved = await run_in_threadpool(commit_board, board_id, user["id"], result["board"], request)
    else:
        saved = await run_in_threadpool(database.load_board, board_id, user["id"])
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
