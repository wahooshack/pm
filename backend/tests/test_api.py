import json
from copy import deepcopy
from unittest.mock import AsyncMock

import httpx
import pytest

from backend.app import database, main
from backend.app.auth import COOKIE_NAME


def demo_user_id():
    with database.get_connection() as connection:
        return connection.execute("SELECT id FROM users WHERE username = 'user'").fetchone()["id"]


def test_authentication_is_enforced_and_logout_revokes_token(client):
    assert client.get("/api/boards").status_code == 401
    assert client.get("/api/boards/1").status_code == 401
    assert client.post("/api/boards/1", json={}).status_code == 401
    assert client.post("/api/boards/1/ai", json={"prompt": "hello", "revision": 0}).status_code == 401
    assert client.post("/api/login", json={"username": "user", "password": "wrong"}).status_code == 401
    assert client.post("/api/login", json={"username": "nobody", "password": "password"}).status_code == 401
    response = client.post("/api/login", json={"username": "user", "password": "password"})
    assert response.json() == {"id": demo_user_id(), "username": "user", "displayName": "User",
                               "isAdmin": True, "isActive": True}
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=strict" in response.headers["set-cookie"]
    token = client.cookies.get(COOKIE_NAME)
    assert client.get("/api/session").json()["username"] == "user"
    assert client.post("/api/logout", json={}).status_code == 200
    client.cookies.set(COOKIE_NAME, token)
    assert client.get("/api/boards").status_code == 401


def test_browser_write_boundary_and_size_limit(signed_in, board_id):
    assert signed_in.post("/api/logout", json={}, headers={"Origin": "https://other.example"}).status_code == 403
    assert signed_in.post("/api/logout", content="{}").status_code == 415
    assert signed_in.delete(f"/api/boards/{board_id}").status_code == 415
    assert signed_in.post(f"/api/boards/{board_id}", content=b"x" * (main.MAX_BODY_BYTES + 1),
                          headers={"Content-Type": "application/json"}).status_code == 413
    assert signed_in.get("/api/boards").headers["cache-control"] == "no-store"


def test_session_expiration_and_chunked_body_limits(signed_in, board_id):
    chunks = (b"x" * 65536 for _ in range(17))
    assert signed_in.post(f"/api/boards/{board_id}", content=chunks,
                          headers={"Content-Type": "application/json"}).status_code == 413
    with database.get_connection() as connection:
        connection.execute("UPDATE sessions SET expires_at = 0")
    assert signed_in.get(f"/api/boards/{board_id}").status_code == 401


def test_concurrent_writes_have_exactly_one_winner(signed_in, board_id):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    user_id = demo_user_id()
    original = database.load_board(board_id, user_id)
    barrier = Barrier(2)

    def save(title):
        board = deepcopy(original)
        board["columns"][0]["title"] = title
        barrier.wait()
        try:
            return database.save_board(board_id, user_id, board)
        except database.BoardConflict:
            return None

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, ["First", "Second"]))
    winners = [result for result in results if result is not None]
    assert len(winners) == 1
    assert database.load_board(board_id, user_id) == winners[0]


def test_board_roundtrip_revision_and_ownership(signed_in, board_id):
    board = signed_in.get(f"/api/boards/{board_id}").json()
    assert board["revision"] == 0 and board["role"] == "owner" and board["name"] == "Main Board"
    assert len(board["cards"]) == 8
    assert board["cards"]["card-1"] == {"id": "card-1", "title": "Align roadmap themes",
        "details": "Draft quarterly themes with impact statements and metrics.",
        "dueDate": None, "priority": None, "labels": [], "assignee": None}
    board["columns"][0]["title"] = "Sprint Ready"
    response = signed_in.post(f"/api/boards/{board_id}", json={"board": board})
    assert response.status_code == 200
    assert response.json()["revision"] == 1
    assert signed_in.post(f"/api/boards/{board_id}", json={"board": board}).status_code == 409
    assert signed_in.get(f"/api/boards/{board_id}").json() == response.json()
    assert signed_in.post(f"/api/boards/{board_id}", json={"username": "second", "board": response.json()}).status_code == 422


@pytest.mark.parametrize("mutation", [
    lambda b: b["cards"].pop("card-1"),
    lambda b: b["columns"][0]["cardIds"].append("card-1"),
    lambda b: b["columns"][0]["cardIds"].remove("card-1"),
    lambda b: b["columns"].clear(),
    lambda b: b["columns"][1].update(id="col-backlog"),
    lambda b: b["columns"].extend({"id": f"extra-{i}", "title": "X", "cardIds": []} for i in range(16)),
    lambda b: b["columns"][0].update(id="card-2"),
    lambda b: b["cards"]["card-1"].update(id="different"),
    lambda b: b["cards"]["card-1"].update(title=123),
    lambda b: b["columns"][0].update(title=" "),
    lambda b: b.update(revision=True),
    lambda b: b.update(name=""),
    lambda b: b.update(role="admin"),
    lambda b: b["cards"]["card-1"].update(dueDate="2026-02-30"),
    lambda b: b["cards"]["card-1"].update(dueDate="tomorrow"),
    lambda b: b["cards"]["card-1"].update(priority="urgent"),
    lambda b: b["cards"]["card-1"].update(labels=["a"] * 2),
    lambda b: b["cards"]["card-1"].update(labels=["Bug", "bug"]),
    lambda b: b["cards"]["card-1"].update(labels=[f"l{i}" for i in range(11)]),
    lambda b: b["cards"]["card-1"].update(labels=["x" * 31]),
    lambda b: b["cards"]["card-1"].update(assignee="nobody"),
    lambda b: b["cards"]["card-1"].update(assignee="Not Valid"),
])
def test_invalid_board_never_changes_database(signed_in, board_id, mutation):
    original = signed_in.get(f"/api/boards/{board_id}").json()
    board = deepcopy(original)
    mutation(board)
    assert signed_in.post(f"/api/boards/{board_id}", json={"board": board}).status_code == 422
    assert signed_in.get(f"/api/boards/{board_id}").json() == original


def test_boards_share_public_ids_without_collisions(signed_in, board_id):
    user_id = demo_user_id()
    second = signed_in.post("/api/boards", json={"name": "Second"}).json()
    second["cards"] = {"card-1": {"id": "card-1", "title": "Second board's card", "details": ""}}
    second["columns"][0]["cardIds"] = ["card-1"]
    database.save_board(second["id"], user_id, second)
    assert database.load_board(board_id, user_id)["cards"]["card-1"]["title"] == "Align roadmap themes"
    import sqlite3
    with database.get_connection() as connection:
        # The scoped foreign key refuses a column that belongs to a different board.
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("DELETE FROM cards WHERE board_id = ?", (second["id"],))
        connection.execute("DELETE FROM columns WHERE board_id = ?", (second["id"],))
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute("INSERT INTO cards (id,board_id,column_id,title,details,position) VALUES (?,?,?,?,?,?)",
                               ("bad", second["id"], "col-backlog", "Bad", "", 0))


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


def mock_ai(monkeypatch, actions, message="Done."):
    monkeypatch.setattr(main, "call_openrouter", AsyncMock(return_value={"model": "mock", "content":
        json.dumps({"message": message, "actions": actions})}))


def test_ai_commits_authoritative_board(signed_in, board_id, monkeypatch):
    mock_ai(monkeypatch, [{"type": "move_card", "cardId": "card-1", "columnId": "col-done"}], "Moved.")
    response = signed_in.post(f"/api/boards/{board_id}/ai", json={"prompt": "Move first card", "revision": 0})
    assert response.status_code == 200
    board = response.json()["board"]
    assert board["revision"] == 1
    assert "card-1" in board["columns"][4]["cardIds"]
    assert signed_in.get(f"/api/boards/{board_id}").json() == board
    assert signed_in.post(f"/api/boards/{board_id}/ai", json={"prompt": "hi", "revision": 0}).status_code == 409


def test_ai_sets_card_fields_and_manages_columns(signed_in, board_id, new_user, monkeypatch):
    new_user("helper")
    signed_in.post(f"/api/boards/{board_id}/members", json={"username": "helper", "role": "editor"})
    mock_ai(monkeypatch, [
        {"type": "set_card_fields", "cardId": "card-1", "dueDate": "2026-12-01", "priority": "high",
         "labels": "Bug, UI", "assignee": "helper"},
        {"type": "set_card_fields", "cardId": "card-2", "assignee": "stranger"},
        {"type": "set_card_fields", "cardId": "card-2", "priority": "urgent"},
        {"type": "add_column", "title": "Blocked"},
        {"type": "move_card", "cardId": "card-6", "columnId": "col-done"},
        {"type": "delete_column", "columnId": "col-review"},
        {"type": "delete_column", "columnId": "col-progress"},
    ])
    body = signed_in.post(f"/api/boards/{board_id}/ai", json={"prompt": "Organize", "revision": 0}).json()
    card = body["board"]["cards"]["card-1"]
    assert (card["dueDate"], card["priority"], card["labels"], card["assignee"]) == ("2026-12-01", "high", ["Bug", "UI"], "helper")
    assert [column["title"] for column in body["board"]["columns"]][-1] == "Blocked"
    assert "col-review" not in [column["id"] for column in body["board"]["columns"]]
    assert len(body["actions"]) == 4 and len(body["rejectedActions"]) == 3


def test_ai_over_limit_action_is_rejected_without_losing_valid_actions(signed_in, board_id, monkeypatch):
    actions = [{"type": "move_card", "cardId": "card-1", "columnId": "col-done"},
               {"type": "rename_card", "cardId": "card-2", "title": "x" * 201},
               {"type": "update_card_details", "cardId": "card-3", "details": "x" * 5001},
               {"type": "add_card", "columnId": "col-done", "title": "x" * 201}]
    mock_ai(monkeypatch, actions)
    response = signed_in.post(f"/api/boards/{board_id}/ai", json={"prompt": "Update cards", "revision": 0})
    assert response.status_code == 200
    body = response.json()
    assert body["actions"] == actions[:1] and len(body["rejectedActions"]) == 3
    assert "card-1" in signed_in.get(f"/api/boards/{board_id}").json()["columns"][4]["cardIds"]


def test_ai_cannot_commit_a_board_too_large_to_save_manually(signed_in, board_id, monkeypatch):
    # Multi-byte details: the cap is in bytes while the model limits count characters.
    url = f"/api/boards/{board_id}"
    monkeypatch.setattr(main, "MAX_BODY_BYTES", main.board_body_bytes(signed_in.get(url).json()) + 500)
    add = lambda details: AsyncMock(return_value={"model": "mock", "content": json.dumps(
        {"message": "Added.", "actions": [{"type": "add_card", "columnId": "col-done", "title": "Big", "details": details}]})})
    monkeypatch.setattr(main, "call_openrouter", add("é" * 300))
    response = signed_in.post(f"{url}/ai", json={"prompt": "Add a card", "revision": 0})
    assert response.status_code == 422
    assert "too large" in response.json()["detail"]
    assert signed_in.get(url).json()["revision"] == 0
    monkeypatch.setattr(main, "call_openrouter", add("é" * 100))
    board = signed_in.post(f"{url}/ai", json={"prompt": "Add a card", "revision": 0}).json()["board"]
    assert board["revision"] == 1
    # Encode like the browser's JSON.stringify: raw UTF-8, no whitespace.
    body = json.dumps({"board": board}, ensure_ascii=False, separators=(",", ":")).encode()
    assert signed_in.post(url, content=body, headers={"Content-Type": "application/json"}).status_code == 200


@pytest.mark.parametrize("payload", [
    {"prompt": "hi", "revision": 0, "conversation": 1},
    {"prompt": "hi", "revision": 0, "board": "invalid"},
    {"prompt": "hi", "revision": 0, "conversation": [{"role": "system", "content": "bad"}]},
    {"prompt": "x" * 2001, "revision": 0},
    {"prompt": "hi", "revision": 0, "conversation": [{"role": "user", "content": "x"}] * 21},
])
def test_ai_validation_precedes_provider_call(signed_in, board_id, monkeypatch, payload):
    provider = AsyncMock()
    monkeypatch.setattr(main, "call_openrouter", provider)
    assert signed_in.post(f"/api/boards/{board_id}/ai", json=payload).status_code == 422
    provider.assert_not_called()


@pytest.mark.parametrize("error,status", [(httpx.ReadTimeout("timeout"), 504),
    (httpx.ConnectError("network"), 502), (RuntimeError("private provider failure"), 502)])
def test_ai_errors_are_controlled(signed_in, board_id, monkeypatch, error, status):
    monkeypatch.setattr(main, "call_openrouter", AsyncMock(side_effect=error))
    response = signed_in.post(f"/api/boards/{board_id}/ai", json={"prompt": "hi", "revision": 0})
    assert response.status_code == status
    assert "private" not in response.text
    assert signed_in.get(f"/api/boards/{board_id}").json()["revision"] == 0


def test_ai_truncated_reply_is_reported_specifically(signed_in, board_id, monkeypatch):
    from backend.app.ai import AssistantReplyTooLong
    monkeypatch.setattr(main, "call_openrouter", AsyncMock(side_effect=AssistantReplyTooLong("cut off")))
    response = signed_in.post(f"/api/boards/{board_id}/ai", json={"prompt": "hi", "revision": 0})
    assert response.status_code == 502
    assert "too long" in response.json()["detail"]


def test_ai_without_api_key_reports_configuration(signed_in, board_id):
    # conftest removes OPENROUTER_API_KEY, so the real provider wrapper must refuse before any request.
    response = signed_in.post(f"/api/boards/{board_id}/ai", json={"prompt": "hi", "revision": 0})
    assert response.status_code == 503
    assert "OPENROUTER_API_KEY" in response.json()["detail"]


def test_ai_noop_reply_and_revision_check(signed_in, board_id, monkeypatch):
    mock_ai(monkeypatch, [], "Nothing to change.")
    response = signed_in.post(f"/api/boards/{board_id}/ai", json={"prompt": "hi", "revision": 0})
    assert response.json()["response"] == "Nothing to change." and response.json()["board"]["revision"] == 0

    async def intervening_noop(prompt, model=None):
        board = database.load_board(board_id, demo_user_id())
        database.save_board(board_id, demo_user_id(), board)
        return {"model": "mock", "content": '{"message":"Nothing","actions":[]}'}
    monkeypatch.setattr(main, "call_openrouter", intervening_noop)
    assert signed_in.post(f"/api/boards/{board_id}/ai", json={"prompt": "hi", "revision": 0}).status_code == 409


def test_ai_cannot_commit_after_intervening_write_or_logout(signed_in, board_id, monkeypatch):
    user_id = demo_user_id()

    async def intervening_write(prompt, model=None):
        board = database.load_board(board_id, user_id)
        board["cards"]["card-2"]["title"] = "Manual edit"
        database.save_board(board_id, user_id, board)
        return {"model": "mock", "content": '{"message":"Done","actions":[{"type":"delete_card","cardId":"card-1"}]}'}
    monkeypatch.setattr(main, "call_openrouter", intervening_write)
    assert signed_in.post(f"/api/boards/{board_id}/ai", json={"prompt": "delete", "revision": 0}).status_code == 409
    assert signed_in.get(f"/api/boards/{board_id}").json()["cards"]["card-2"]["title"] == "Manual edit"

    async def revoke_session(prompt, model=None):
        with database.get_connection() as connection:
            connection.execute("DELETE FROM sessions")
        return {"model": "mock", "content": '{"message":"Done","actions":[{"type":"delete_card","cardId":"card-1"}]}'}
    monkeypatch.setattr(main, "call_openrouter", revoke_session)
    assert signed_in.post(f"/api/boards/{board_id}/ai", json={"prompt": "delete", "revision": 1}).status_code == 401
    assert "card-1" in database.load_board(board_id, user_id)["cards"]
