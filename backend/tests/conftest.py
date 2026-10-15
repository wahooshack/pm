import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture(autouse=True)
def no_live_provider(monkeypatch):
    # ai.py loads the real .env; remove the key so an unmocked test cannot reach OpenRouter.
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "pm.db"))
    with TestClient(app) as client:
        yield client


@pytest.fixture
def signed_in(client):
    assert client.post("/api/login", json={"username": "user", "password": "password"}).status_code == 200
    return client


@pytest.fixture
def board_id(signed_in):
    return signed_in.get("/api/boards").json()[0]["id"]


@pytest.fixture
def new_user(client):
    """Registers a user in its own cookie jar against the same database."""
    clients = []

    def register(username: str, password: str = "secret-pass"):
        other = TestClient(app)
        clients.append(other)
        response = other.post("/api/register", json={"username": username, "displayName": username.title(),
                                                     "password": password})
        assert response.status_code == 200, response.text
        return other

    yield register
    for other in clients:
        other.close()
