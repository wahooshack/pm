import importlib
import sys
from pathlib import Path
from unittest.mock import AsyncMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient


def test_database_initializes_and_loads_seed_board(tmp_path, monkeypatch):
    db_path = tmp_path / "pm.db"
    monkeypatch.setenv("PM_DB_PATH", str(db_path))

    import app.database as db_module
    importlib.reload(db_module)
    db_module.init_db()

    board = db_module.load_board_for_user("user")

    assert board["columns"][0]["title"] == "Backlog"
    assert len(board["cards"]) == 8
    assert board["cards"]["card-1"]["title"] == "Align roadmap themes"


def test_database_save_round_trip(tmp_path, monkeypatch):
    db_path = tmp_path / "pm.db"
    monkeypatch.setenv("PM_DB_PATH", str(db_path))

    import app.database as db_module
    importlib.reload(db_module)
    db_module.init_db()

    board = db_module.load_board_for_user("user")
    board["columns"][0]["title"] = "Sprint Ready"
    board["cards"]["card-1"]["title"] = "Updated roadmap card"

    saved = db_module.save_board_for_user("user", board)

    assert saved["columns"][0]["title"] == "Sprint Ready"
    assert saved["cards"]["card-1"]["title"] == "Updated roadmap card"


def test_api_get_and_save_board(tmp_path, monkeypatch):
    db_path = tmp_path / "pm.db"
    monkeypatch.setenv("PM_DB_PATH", str(db_path))

    import app.main as main_module
    importlib.reload(main_module)

    client = TestClient(main_module.app)

    response = client.get("/api/board", params={"username": "user"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["columns"][0]["title"] == "Backlog"

    payload["columns"][0]["title"] = "Board Updated"
    payload["cards"]["card-1"]["title"] = "Changed in API"

    update_response = client.post(
        "/api/board",
        json={"username": "user", "board": payload},
    )
    assert update_response.status_code == 200
    assert update_response.json()["columns"][0]["title"] == "Board Updated"
    assert update_response.json()["cards"]["card-1"]["title"] == "Changed in API"


def test_ai_route_calls_openrouter_and_returns_content(tmp_path, monkeypatch):
    db_path = tmp_path / "pm.db"
    monkeypatch.setenv("PM_DB_PATH", str(db_path))
    monkeypatch.setenv("OPENROUTER_API_KEY", "mock-key")

    import app.main as main_module
    importlib.reload(main_module)
    main_module.call_openrouter = AsyncMock(return_value={"model": "mock-model", "content": "4"})

    client = TestClient(main_module.app)
    response = client.post("/api/ai", json={"prompt": "2 + 2"})

    assert response.status_code == 200
    assert response.json() == {"response": "4", "model": "mock-model"}


def test_ai_route_accepts_board_payload_and_applies_actions(tmp_path, monkeypatch):
    db_path = tmp_path / "pm.db"
    monkeypatch.setenv("PM_DB_PATH", str(db_path))
    monkeypatch.setenv("OPENROUTER_API_KEY", "mock-key")

    import app.main as main_module
    importlib.reload(main_module)
    main_module.call_openrouter = AsyncMock(
        return_value={
            "model": "mock-model",
            "content": '{"message":"Moved the card.","actions":[{"type":"move_card","cardId":"card-1","columnId":"col-done"}]}',
        }
    )

    client = TestClient(main_module.app)
    board = {
        "columns": [
            {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1"]},
            {"id": "col-done", "title": "Done", "cardIds": []},
        ],
        "cards": {"card-1": {"id": "card-1", "title": "Alpha", "details": "Test"}},
    }

    response = client.post("/api/ai", json={"prompt": "Move card 1 to done", "board": board})

    assert response.status_code == 200
    payload = response.json()
    assert payload["response"] == "Moved the card."
    assert payload["board"]["columns"][1]["cardIds"] == ["card-1"]
    assert payload["actions"][0]["type"] == "move_card"
