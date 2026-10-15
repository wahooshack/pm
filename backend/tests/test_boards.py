from backend.app import database


def test_create_list_rename_and_delete_boards(signed_in, board_id):
    created = signed_in.post("/api/boards", json={"name": "  Launch  "}).json()
    assert created["name"] == "Launch" and created["role"] == "owner" and created["revision"] == 0
    assert [board["name"] for board in signed_in.get("/api/boards").json()] == ["Main Board", "Launch"]
    created["name"] = "Launch Plan"
    saved = signed_in.post(f"/api/boards/{created['id']}", json={"board": created}).json()
    assert saved["name"] == "Launch Plan" and saved["revision"] == 1
    assert signed_in.post("/api/boards", json={"name": " "}).status_code == 422
    assert signed_in.request("DELETE", f"/api/boards/{created['id']}", json={}).status_code == 200
    assert signed_in.get(f"/api/boards/{created['id']}").status_code == 404
    assert [board["id"] for board in signed_in.get("/api/boards").json()] == [board_id]


def test_custom_columns_roundtrip_in_order(signed_in, board_id):
    board = signed_in.get(f"/api/boards/{board_id}").json()
    board["columns"].reverse()
    board["columns"].append({"id": "col-blocked", "title": "Blocked", "cardIds": []})
    review = next(column for column in board["columns"] if column["id"] == "col-review")
    board["columns"].remove(review)
    board["columns"][0]["cardIds"] += review["cardIds"]
    saved = signed_in.post(f"/api/boards/{board_id}", json={"board": board}).json()
    assert [column["id"] for column in saved["columns"]] == ["col-done", "col-progress", "col-discovery",
                                                            "col-backlog", "col-blocked"]
    assert saved["columns"][0]["cardIds"] == ["card-7", "card-8", "card-6"]


def test_card_fields_roundtrip(signed_in, board_id):
    board = signed_in.get(f"/api/boards/{board_id}").json()
    board["cards"]["card-1"].update(dueDate="2026-11-30", priority="high", labels=["Bug", "Frontend"], assignee="user")
    saved = signed_in.post(f"/api/boards/{board_id}", json={"board": board}).json()
    assert saved["cards"]["card-1"] == {**board["cards"]["card-1"]}
    board = saved
    board["cards"]["card-1"].update(dueDate=None, priority=None, labels=[], assignee=None)
    cleared = signed_in.post(f"/api/boards/{board_id}", json={"board": board}).json()["cards"]["card-1"]
    assert (cleared["dueDate"], cleared["priority"], cleared["labels"], cleared["assignee"]) == (None, None, [], None)


def test_boards_of_other_users_are_invisible(signed_in, board_id, new_user):
    alice = new_user("alice")
    board = signed_in.get(f"/api/boards/{board_id}").json()
    assert alice.get(f"/api/boards/{board_id}").status_code == 404
    assert alice.post(f"/api/boards/{board_id}", json={"board": board}).status_code == 404
    assert alice.request("DELETE", f"/api/boards/{board_id}", json={}).status_code == 404
    assert alice.get(f"/api/boards/{board_id}/participants").status_code == 404
    assert alice.post(f"/api/boards/{board_id}/ai", json={"prompt": "hi", "revision": 0}).status_code == 404
    assert alice.get("/api/boards/999999").status_code == 404
    assert board_id not in [entry["id"] for entry in alice.get("/api/boards").json()]


def test_sharing_roles(signed_in, board_id, new_user):
    editor, viewer = new_user("eddie"), new_user("vera")
    url = f"/api/boards/{board_id}"
    assert signed_in.post(f"{url}/members", json={"username": "eddie", "role": "editor"}).status_code == 200
    members = signed_in.post(f"{url}/members", json={"username": "vera", "role": "viewer"}).json()
    assert members == [{"username": "eddie", "displayName": "Eddie", "role": "editor"},
                       {"username": "vera", "displayName": "Vera", "role": "viewer"}]
    assert signed_in.get(f"{url}/participants").json() == ["eddie", "user", "vera"]
    shared = editor.get("/api/boards").json()
    assert [(entry["name"], entry["role"], entry["owner"]) for entry in shared] == [
        ("My Board", "owner", "eddie"), ("Main Board", "editor", "user")]

    board = editor.get(url).json()
    assert board["role"] == "editor"
    board["cards"]["card-1"]["assignee"] = "vera"
    board = editor.post(url, json={"board": board}).json()
    assert board["revision"] == 1 and board["cards"]["card-1"]["assignee"] == "vera"

    viewed = viewer.get(url).json()
    assert viewed["role"] == "viewer" and viewed["cards"] == board["cards"]
    assert viewer.post(url, json={"board": viewed}).status_code == 403
    assert viewer.post(f"{url}/ai", json={"prompt": "hi", "revision": 1}).status_code == 403
    for client in (editor, viewer):
        assert client.request("DELETE", url, json={}).status_code == 403
        assert client.get(f"{url}/members").status_code == 403
        assert client.post(f"{url}/members", json={"username": "eddie", "role": "viewer"}).status_code == 403

    # Changing a role updates in place.
    signed_in.post(f"{url}/members", json={"username": "vera", "role": "editor"})
    assert viewer.get(url).json()["role"] == "editor"


def test_removing_a_member_revokes_access_and_unassigns_cards(signed_in, board_id, new_user):
    member = new_user("eddie")
    url = f"/api/boards/{board_id}"
    signed_in.post(f"{url}/members", json={"username": "eddie", "role": "editor"})
    board = signed_in.get(url).json()
    board["cards"]["card-1"]["assignee"] = "eddie"
    signed_in.post(url, json={"board": board})
    assert signed_in.request("DELETE", f"{url}/members/eddie", json={}).json() == []
    assert member.get(url).status_code == 404
    after = signed_in.get(url).json()
    assert after["cards"]["card-1"]["assignee"] is None and after["revision"] == 2
    assert signed_in.request("DELETE", f"{url}/members/eddie", json={}).status_code == 404
    assert signed_in.request("DELETE", f"{url}/members/nobody", json={}).status_code == 404


def test_member_validation(signed_in, board_id, new_user):
    url = f"/api/boards/{board_id}/members"
    assert signed_in.post(url, json={"username": "nobody", "role": "editor"}).status_code == 404
    assert signed_in.post(url, json={"username": "user", "role": "editor"}).status_code == 422
    new_user("eddie")
    assert signed_in.post(url, json={"username": "eddie", "role": "owner"}).status_code == 422
    signed_in.post("/api/admin/users/eddie", json={"isActive": False})
    assert signed_in.post(url, json={"username": "eddie", "role": "editor"}).status_code == 404
    assert signed_in.get(url).json() == []


def test_deleting_a_shared_board_removes_memberships(signed_in, new_user):
    member = new_user("eddie")
    board = signed_in.post("/api/boards", json={"name": "Shared"}).json()
    signed_in.post(f"/api/boards/{board['id']}/members", json={"username": "eddie", "role": "viewer"})
    assert [entry["name"] for entry in member.get("/api/boards").json()] == ["My Board", "Shared"]
    signed_in.request("DELETE", f"/api/boards/{board['id']}", json={})
    assert [entry["name"] for entry in member.get("/api/boards").json()] == ["My Board"]
    with database.get_connection() as connection:
        assert connection.execute("SELECT COUNT(*) FROM board_members").fetchone()[0] == 0
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
