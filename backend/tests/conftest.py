import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PM_DB_PATH", str(tmp_path / "pm.db"))
    with TestClient(app) as client:
        yield client


@pytest.fixture
def signed_in(client):
    assert client.post("/api/login", json={"username": "user", "password": "password"}).status_code == 200
    return client
