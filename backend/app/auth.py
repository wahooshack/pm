import hashlib
import secrets
import time

from fastapi import HTTPException, Request, Response

from . import database

COOKIE_NAME = "pm_session"
SESSION_SECONDS = 8 * 60 * 60


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def session_hash(request: Request) -> str:
    return token_hash(request.cookies.get(COOKIE_NAME, ""))


def start_session(user_id: int, request: Request, response: Response) -> None:
    database.delete_session(session_hash(request))
    token = secrets.token_urlsafe(32)
    database.create_session(user_id, token_hash(token), int(time.time()) + SESSION_SECONDS)
    response.set_cookie(COOKIE_NAME, token, max_age=SESSION_SECONDS,
                        httponly=True, samesite="strict", secure=request.url.scheme == "https")


def require_user(request: Request) -> dict:
    user = database.user_for_session(session_hash(request))
    if user is None:
        raise HTTPException(status_code=401, detail="Please sign in.")
    return user


def require_admin(request: Request) -> dict:
    user = require_user(request)
    if not user["isAdmin"]:
        raise HTTPException(status_code=403, detail="Administrator access is required.")
    return user
