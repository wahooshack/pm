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
