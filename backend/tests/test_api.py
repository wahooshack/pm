import json
from copy import deepcopy
from unittest.mock import AsyncMock

import httpx
import pytest

from backend.app import main, database
from backend.app.auth import COOKIE_NAME


def test_authentication_is_enforced_and_logout_revokes_token(client):
    assert client.get("/api/board").status_code == 401
    assert client.post("/api/board", json={}).status_code == 401
    assert client.post("/api/ai", json={"prompt": "hello", "revision": 0}).status_code == 401
    assert client.post("/api/login", json={"username": "user", "password": "wrong"}).status_code == 401
    response = client.post("/api/login", json={"username": "user", "password": "password"})
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=strict" in response.headers["set-cookie"]
    token = client.cookies.get(COOKIE_NAME)
    assert client.get("/api/board").status_code == 200
    assert client.post("/api/logout", json={}).status_code == 200
    client.cookies.set(COOKIE_NAME, token)
    assert client.get("/api/board").status_code == 401


def test_browser_write_boundary_and_size_limit(signed_in):
    assert signed_in.post("/api/logout", json={}, headers={"Origin": "https://other.example"}).status_code == 403
    assert signed_in.post("/api/logout", content="{}").status_code == 415
    assert signed_in.post("/api/board", content=b"x" * (main.MAX_BODY_BYTES + 1),
                          headers={"Content-Type": "application/json"}).status_code == 413
    assert signed_in.get("/api/board").headers["cache-control"] == "no-store"


def test_session_expiration_and_chunked_body_limits(signed_in):
    chunks = (b"x" * 65536 for _ in range(17))
    assert signed_in.post("/api/board", content=chunks,
                          headers={"Content-Type": "application/json"}).status_code == 413
    with database.get_connection() as connection:
        connection.execute("UPDATE sessions SET expires_at = 0")
    assert signed_in.get("/api/board").status_code == 401


def test_concurrent_writes_have_exactly_one_winner(signed_in):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    original = database.load_board_for_user("user")
    barrier = Barrier(2)

    def save(title):
        board = deepcopy(original)
        board["columns"][0]["title"] = title
        barrier.wait()
        try:
            return database.save_board_for_user("user", board)
        except database.BoardConflict:
            return None

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, ["First", "Second"]))
    winners = [result for result in results if result is not None]
    assert len(winners) == 1
    assert database.load_board_for_user("user") == winners[0]


def test_board_roundtrip_revision_and_ownership(signed_in):
    board = signed_in.get("/api/board").json()
    assert board["revision"] == 0
    assert len(board["cards"]) == 8
    board["columns"][0]["title"] = "Sprint Ready"
    response = signed_in.post("/api/board", json={"board": board})
    assert response.status_code == 200
    assert response.json()["revision"] == 1
    assert signed_in.post("/api/board", json={"board": board}).status_code == 409
    assert signed_in.get("/api/board").json() == response.json()
    assert signed_in.get("/api/board?username=second").json() == response.json()
    assert signed_in.post("/api/board", json={"username": "second", "board": response.json()}).status_code == 422


@pytest.mark.parametrize("mutation", [
    lambda b: b["cards"].pop("card-1"),
    lambda b: b["columns"][0]["cardIds"].append("card-1"),
    lambda b: b["columns"][0]["cardIds"].remove("card-1"),
    lambda b: b["columns"].clear(),
    lambda b: b["columns"][0].update(id="unknown"),
    lambda b: b["cards"]["card-1"].update(id="different"),
    lambda b: b["cards"]["card-1"].update(title=123),
    lambda b: b["columns"][0].update(title=" "),
    lambda b: b.update(revision=True),
])
def test_invalid_board_never_changes_database(signed_in, mutation):
    original = signed_in.get("/api/board").json()
    board = deepcopy(original)
    mutation(board)
    assert signed_in.post("/api/board", json={"board": board}).status_code == 422
    assert signed_in.get("/api/board").json() == original


def test_multiple_users_share_public_ids_without_collisions(signed_in):
    first = database.load_board_for_user("user")
    database.ensure_seed_board("second")
    second = database.load_board_for_user("second")
    assert second == first
    second["cards"]["card-1"]["title"] = "Second user's card"
    database.save_board_for_user("second", second)
    assert database.load_board_for_user("user") == first
    with database.get_connection() as connection:
        board_id = database.ensure_seed_board("second")["id"]
        # The scoped foreign key refuses a column that belongs to a different board.
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("DELETE FROM cards WHERE board_id = ?", (board_id,))
        connection.execute("DELETE FROM columns WHERE board_id = ?", (board_id,))
        import sqlite3
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute("INSERT INTO cards (id,board_id,column_id,title,details,position) VALUES (?,?,?,?,?,?)",
                               ("bad", board_id, "col-backlog", "Bad", "", 0))


def test_static_assets_are_confined(client, tmp_path, monkeypatch):
    export = tmp_path / "out"
    export.mkdir()
    (export / "index.html").write_text("<h1>Login</h1>")
    (export / "asset.js").write_text("console.log('ok')")
    (tmp_path / "private.txt").write_text("private")
    (export / "folder").mkdir()
    monkeypatch.setattr(main, "FRONTEND_DIST_DIR", export)
    assert client.get("/").status_code == 200
    assert client.get("/asset.js").headers["content-type"].startswith("text/javascript")
    for path in ["/%2e%2e/private.txt", "/%2e%2e/%2e%2e/backend/requirements.txt",
                 "/%5c..%5cprivate.txt", "/C:%5cprivate.txt", "/folder/", "/missing.js", "/api/missing"]:
        assert client.get(path).status_code == 404
    try:
        (export / "escape").symlink_to(tmp_path, target_is_directory=True)
    except OSError:
        pass  # Windows may require permission for symlinks; traversal cases still run.
    else:
        assert client.get("/escape/private.txt").status_code == 404


def test_ai_commits_authoritative_board(signed_in, monkeypatch):
    monkeypatch.setattr(main, "call_openrouter", AsyncMock(return_value={"model": "mock", "content":
        '{"message":"Moved.","actions":[{"type":"move_card","cardId":"card-1","columnId":"col-done"}]}'}))
    response = signed_in.post("/api/ai", json={"prompt": "Move first card", "revision": 0})
    assert response.status_code == 200
    board = response.json()["board"]
    assert board["revision"] == 1
    assert "card-1" in board["columns"][4]["cardIds"]
    assert signed_in.get("/api/board").json() == board
    assert signed_in.post("/api/ai", json={"prompt": "hi", "revision": 0}).status_code == 409


def test_ai_over_limit_action_is_rejected_without_losing_valid_actions(signed_in, monkeypatch):
    actions = [{"type": "move_card", "cardId": "card-1", "columnId": "col-done"},
               {"type": "rename_card", "cardId": "card-2", "title": "x" * 201},
               {"type": "update_card_details", "cardId": "card-3", "details": "x" * 5001},
               {"type": "add_card", "columnId": "col-done", "title": "x" * 201}]
    monkeypatch.setattr(main, "call_openrouter", AsyncMock(return_value={"model": "mock", "content":
        json.dumps({"message": "Done.", "actions": actions})}))
    response = signed_in.post("/api/ai", json={"prompt": "Update cards", "revision": 0})
    assert response.status_code == 200
    body = response.json()
    assert body["actions"] == actions[:1] and len(body["rejectedActions"]) == 3
    assert "card-1" in signed_in.get("/api/board").json()["columns"][4]["cardIds"]


def test_ai_cannot_commit_a_board_too_large_to_save_manually(signed_in, monkeypatch):
    # Multi-byte details: the cap is in bytes while the model limits count characters.
    monkeypatch.setattr(main, "MAX_BODY_BYTES", main.board_body_bytes(signed_in.get("/api/board").json()) + 400)
    add = lambda details: AsyncMock(return_value={"model": "mock", "content": json.dumps(
        {"message": "Added.", "actions": [{"type": "add_card", "columnId": "col-done", "title": "Big", "details": details}]})})
    monkeypatch.setattr(main, "call_openrouter", add("é" * 200))
    response = signed_in.post("/api/ai", json={"prompt": "Add a card", "revision": 0})
    assert response.status_code == 422
    assert "too large" in response.json()["detail"]
    assert signed_in.get("/api/board").json()["revision"] == 0
    monkeypatch.setattr(main, "call_openrouter", add("é" * 100))
    board = signed_in.post("/api/ai", json={"prompt": "Add a card", "revision": 0}).json()["board"]
    assert board["revision"] == 1
    # Encode like the browser's JSON.stringify: raw UTF-8, no whitespace.
    body = json.dumps({"board": board}, ensure_ascii=False, separators=(",", ":")).encode()
    assert signed_in.post("/api/board", content=body, headers={"Content-Type": "application/json"}).status_code == 200


@pytest.mark.parametrize("payload", [
    {"prompt": "hi", "revision": 0, "conversation": 1},
    {"prompt": "hi", "revision": 0, "board": "invalid"},
    {"prompt": "hi", "revision": 0, "conversation": [{"role": "system", "content": "bad"}]},
    {"prompt": "x" * 2001, "revision": 0},
    {"prompt": "hi", "revision": 0, "conversation": [{"role": "user", "content": "x"}] * 21},
])
def test_ai_validation_precedes_provider_call(signed_in, monkeypatch, payload):
    provider = AsyncMock()
    monkeypatch.setattr(main, "call_openrouter", provider)
    assert signed_in.post("/api/ai", json=payload).status_code == 422
    provider.assert_not_called()


@pytest.mark.parametrize("error,status", [(httpx.ReadTimeout("timeout"), 504),
    (httpx.ConnectError("network"), 502), (RuntimeError("private provider failure"), 502)])
def test_ai_errors_are_controlled(signed_in, monkeypatch, error, status):
    monkeypatch.setattr(main, "call_openrouter", AsyncMock(side_effect=error))
    response = signed_in.post("/api/ai", json={"prompt": "hi", "revision": 0})
    assert response.status_code == status
    assert "private" not in response.text
    assert signed_in.get("/api/board").json()["revision"] == 0


def test_ai_without_api_key_reports_configuration(signed_in):
    # conftest removes OPENROUTER_API_KEY, so the real provider wrapper must refuse before any request.
    response = signed_in.post("/api/ai", json={"prompt": "hi", "revision": 0})
    assert response.status_code == 503
    assert "OPENROUTER_API_KEY" in response.json()["detail"]


def test_ai_cannot_commit_after_intervening_write_or_logout(signed_in, monkeypatch):
    async def intervening_write(prompt, model=None):
        board = database.load_board_for_user("user")
        board["cards"]["card-2"]["title"] = "Manual edit"
        database.save_board_for_user("user", board)
        return {"model": "mock", "content": '{"message":"Done","actions":[{"type":"delete_card","cardId":"card-1"}]}'}
    monkeypatch.setattr(main, "call_openrouter", intervening_write)
    assert signed_in.post("/api/ai", json={"prompt": "delete", "revision": 0}).status_code == 409
    assert signed_in.get("/api/board").json()["cards"]["card-2"]["title"] == "Manual edit"

    async def revoke_session(prompt, model=None):
        with database.get_connection() as connection:
            connection.execute("DELETE FROM sessions")
        return {"model": "mock", "content": '{"message":"Done","actions":[{"type":"delete_card","cardId":"card-1"}]}'}
    monkeypatch.setattr(main, "call_openrouter", revoke_session)
    assert signed_in.post("/api/ai", json={"prompt": "delete", "revision": 1}).status_code == 401
    assert "card-1" in database.load_board_for_user("user")["cards"]


def test_legacy_migration_preserves_data_and_is_repeatable(tmp_path, monkeypatch):
    import sqlite3
    legacy = tmp_path / "legacy.db"
    monkeypatch.setenv("PM_DB_PATH", str(legacy))
    with sqlite3.connect(legacy) as connection:
        connection.executescript("""
        CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, display_name TEXT, created_at TEXT);
        CREATE TABLE boards (id INTEGER PRIMARY KEY, user_id INTEGER UNIQUE, name TEXT, created_at TEXT, updated_at TEXT);
        CREATE TABLE columns (id TEXT PRIMARY KEY, board_id INTEGER, title TEXT, position INTEGER);
        CREATE TABLE cards (id TEXT PRIMARY KEY, board_id INTEGER, column_id TEXT, title TEXT, details TEXT,
                            position INTEGER, created_at TEXT, updated_at TEXT);
        INSERT INTO users VALUES (1,'user','User','original');
        INSERT INTO boards VALUES (1,1,'Main','original','original');
        """)
        database._write_rows(connection, 1, database.DEFAULT_BOARD)
        connection.execute("UPDATE cards SET title = 'Existing custom title', created_at = 'original', updated_at = 'original'")
    database.init_db()
    before = database.load_board_for_user("user")
    assert before["cards"]["card-1"]["title"] == "Existing custom title"
    database.init_db()
    assert database.load_board_for_user("user") == before
    database.ensure_seed_board("second")
    assert len(database.load_board_for_user("second")["cards"]) == 8
    with database.get_connection() as connection:
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
        assert connection.execute("SELECT created_at FROM cards WHERE board_id=1").fetchone()[0] == "original"
