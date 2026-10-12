import hashlib
import secrets
import time

from fastapi import HTTPException, Request

from .database import ensure_seed_board, get_connection

COOKIE_NAME = "pm_session"
SESSION_SECONDS = 8 * 60 * 60


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(username: str) -> str:
    user_id = ensure_seed_board(username)["user_id"]
    token = secrets.token_urlsafe(32)
    with get_connection() as connection:
        connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
        connection.execute("INSERT INTO sessions VALUES (?, ?, ?)",
                           (token_hash(token), user_id, int(time.time()) + SESSION_SECONDS))
    return token


def require_user(request: Request) -> str:
    with get_connection() as connection:
        row = connection.execute("""SELECT users.username FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE token_hash = ? AND expires_at > ?""",
            (token_hash(request.cookies.get(COOKIE_NAME, "")), int(time.time()))).fetchone()
    if row is None:
        raise HTTPException(status_code=401, detail="Please sign in.")
    return row["username"]


def delete_session(request: Request) -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM sessions WHERE token_hash = ?",
                           (token_hash(request.cookies.get(COOKIE_NAME, "")),))
