from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.ai import call_openrouter, generate_board_ai_response
from app.database import init_db, load_board_for_user, save_board_for_user

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = PROJECT_ROOT / "backend"
STATIC_DIR = BACKEND_DIR / "static"
INDEX_FILE = STATIC_DIR / "index.html"
FRONTEND_DIST_DIR = PROJECT_ROOT / "frontend" / "out"

app = FastAPI(title="Project Management MVP", version="0.1.0")

init_db()

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "project-management-backend"}


@app.get("/api/board")
async def get_board(username: str = "user") -> dict[str, Any]:
    try:
        return load_board_for_user(username)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/board")
async def save_board(payload: dict[str, Any]) -> dict[str, Any]:
    username = str(payload.get("username") or "user")
    board_payload = payload.get("board")
    if board_payload is None:
        board_payload = payload

    if not isinstance(board_payload, dict):
        raise HTTPException(status_code=400, detail="Board payload must be an object.")

    if "columns" not in board_payload or "cards" not in board_payload:
        raise HTTPException(
            status_code=400,
            detail="Board payload must include both 'columns' and 'cards'.",
        )

    if not isinstance(board_payload["columns"], list) or not isinstance(board_payload["cards"], dict):
        raise HTTPException(
            status_code=400,
            detail="Board payload fields 'columns' and 'cards' must be valid types.",
        )

    try:
        return save_board_for_user(username, board_payload)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/ai")
async def ai_chat(payload: dict[str, Any]) -> dict[str, Any]:
    prompt = payload.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required.")

    board = payload.get("board")
    conversation = payload.get("conversation") or []
    user_message = prompt.strip()
    try:
        if board is not None:
            response = await generate_board_ai_response(
                user_message,
                board=board,
                conversation=conversation,
                openrouter_client=call_openrouter,
            )
            return {
                "response": response["message"],
                "model": response["model"],
                "board": response["board"],
                "actions": response["actions"],
            }

        response = await call_openrouter(user_message)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "response": response["content"],
        "model": response["model"],
    }


@app.get("/")
@app.get("/{path:path}")
async def serve_frontend(path: str | None = None) -> Response:
    if path is not None and path.startswith("api"):
        return HTMLResponse(content="", status_code=404)

    if FRONTEND_DIST_DIR.exists():
        target = FRONTEND_DIST_DIR / (path or "index.html")
        if path and target.exists():
            return FileResponse(target)

        index_file = FRONTEND_DIST_DIR / "index.html"
        if index_file.exists():
            return HTMLResponse(content=index_file.read_text(encoding="utf-8"))

    return HTMLResponse(content=INDEX_FILE.read_text(encoding="utf-8"))
