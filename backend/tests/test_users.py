import pytest

from backend.app import database
from backend.app.auth import COOKIE_NAME


def test_register_signs_in_and_creates_a_starter_board(client):
    response = client.post("/api/register", json={"username": "alice", "displayName": " Alice ", "password": "secret-pass"})
    assert response.status_code == 200
    assert response.json()["displayName"] == "Alice" and response.json()["isAdmin"] is False
    assert client.get("/api/session").json()["username"] == "alice"
    boards = client.get("/api/boards").json()
    assert [(board["name"], board["role"], board["owner"]) for board in boards] == [("My Board", "owner", "alice")]
    board = client.get(f"/api/boards/{boards[0]['id']}").json()
    assert [column["title"] for column in board["columns"]] == ["Backlog", "Discovery", "In Progress", "Review", "Done"]
    assert board["cards"] == {}
    client.post("/api/logout", json={})
    assert client.post("/api/login", json={"username": "alice", "password": "secret-pass"}).status_code == 200


@pytest.mark.parametrize("payload", [
    {"username": "ab", "displayName": "A", "password": "secret-pass"},
    {"username": "Alice", "displayName": "A", "password": "secret-pass"},
    {"username": "al ice", "displayName": "A", "password": "secret-pass"},
    {"username": "alice", "displayName": " ", "password": "secret-pass"},
    {"username": "alice", "displayName": "A", "password": "short"},
    {"username": "alice", "displayName": "A", "password": "secret-pass", "isAdmin": True},
])
def test_register_validation(client, payload):
    assert client.post("/api/register", json=payload).status_code == 422
    assert client.get("/api/session").status_code == 401


def test_duplicate_username_is_rejected(client, new_user):
    new_user("alice")
    response = client.post("/api/register", json={"username": "alice", "displayName": "Other", "password": "secret-pass"})
    assert response.status_code == 409
    assert response.json()["detail"] == "That username is taken."
    assert client.post("/api/register", json={"username": "user", "displayName": "X", "password": "secret-pass"}).status_code == 409


def test_profile_and_password_change(signed_in, new_user):
    alice = new_user("alice")
    assert alice.post("/api/me", json={"displayName": "Alice Smith"}).json()["displayName"] == "Alice Smith"
    assert alice.get("/api/session").json()["displayName"] == "Alice Smith"
    second_device = new_user("bob")  # A second cookie jar we will sign in as alice.
    second_device.post("/api/login", json={"username": "alice", "password": "secret-pass"})
    assert second_device.get("/api/session").json()["username"] == "alice"
    wrong = alice.post("/api/me/password", json={"currentPassword": "nope", "newPassword": "another-pass"})
    assert wrong.status_code == 403
    assert alice.post("/api/me/password", json={"currentPassword": "secret-pass", "newPassword": "short"}).status_code == 422
    assert alice.post("/api/me/password", json={"currentPassword": "secret-pass", "newPassword": "another-pass"}).status_code == 200
    # The changing session stays; other sessions for that user end.
    assert alice.get("/api/session").status_code == 200
    assert second_device.get("/api/session").status_code == 401
    assert signed_in.post("/api/login", json={"username": "alice", "password": "secret-pass"}).status_code == 401
    assert signed_in.post("/api/login", json={"username": "alice", "password": "another-pass"}).status_code == 200


def test_admin_routes_require_admin(signed_in, new_user):
    alice = new_user("alice")
    assert alice.get("/api/admin/users").status_code == 403
    assert alice.post("/api/admin/users/user", json={"isActive": False}).status_code == 403
    users = signed_in.get("/api/admin/users").json()
    assert [(user["username"], user["isAdmin"], user["isActive"]) for user in users] == [
        ("alice", False, True), ("user", True, True)]


def test_admin_disable_enable_promote_and_reset(signed_in, new_user):
    alice = new_user("alice")
    disabled = signed_in.post("/api/admin/users/alice", json={"isActive": False})
    assert disabled.json()["isActive"] is False
    assert alice.get("/api/session").status_code == 401
    assert alice.post("/api/login", json={"username": "alice", "password": "secret-pass"}).status_code == 401
    signed_in.post("/api/admin/users/alice", json={"isActive": True, "isAdmin": True})
    assert alice.post("/api/login", json={"username": "alice", "password": "secret-pass"}).json()["isAdmin"] is True
    assert alice.get("/api/admin/users").status_code == 200
    signed_in.post("/api/admin/users/alice", json={"password": "reset-pass1"})
    assert alice.get("/api/session").status_code == 401
    assert alice.post("/api/login", json={"username": "alice", "password": "reset-pass1"}).status_code == 200


def test_admin_cannot_lock_themselves_out(signed_in):
    assert signed_in.post("/api/admin/users/user", json={"isActive": False}).status_code == 403
    assert signed_in.post("/api/admin/users/user", json={"isAdmin": False}).status_code == 403
    assert signed_in.post("/api/admin/users/nobody", json={"isActive": False}).status_code == 404
    assert signed_in.post("/api/admin/users/user", json={"password": "short"}).status_code == 422
    assert signed_in.get("/api/session").json()["isAdmin"] is True


def test_disabling_a_user_blocks_saves_from_an_existing_session(signed_in, new_user):
    alice = new_user("alice")
    board = alice.get(f"/api/boards/{alice.get('/api/boards').json()[0]['id']}").json()
    with database.get_connection() as connection:
        connection.execute("UPDATE users SET is_active = 0 WHERE username = 'alice'")
    assert alice.post(f"/api/boards/{board['id']}", json={"board": board}).status_code == 401
    assert database.authenticate("alice", "secret-pass") is None


def test_password_hashes_are_salted_and_verified():
    first, second = database.hash_password("same-password"), database.hash_password("same-password")
    assert first != second and first.startswith("scrypt$")
    assert database.verify_password("same-password", first)
    assert not database.verify_password("other", first)
    assert not database.verify_password("same-password", "")
    assert not database.verify_password("same-password", "scrypt$zz$zz")


def test_session_cookie_from_another_user_cannot_be_reused_after_logout(client, new_user):
    alice = new_user("alice")
    token = alice.cookies.get(COOKIE_NAME)
    alice.post("/api/logout", json={})
    client.cookies.set(COOKIE_NAME, token)
    assert client.get("/api/session").status_code == 401
