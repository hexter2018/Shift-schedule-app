def test_create_department_makes_creator_admin(client, register_and_login):
    _, headers = register_and_login()
    r = client.post("/api/departments", json={"name": "Engineering"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


def test_list_my_departments_only_shows_own(client, register_and_login):
    _, headers_a = register_and_login()
    _, headers_b = register_and_login()
    client.post("/api/departments", json={"name": "Dept A"}, headers=headers_a)
    client.post("/api/departments", json={"name": "Dept B"}, headers=headers_b)

    r = client.get("/api/departments", headers=headers_a)
    names = [d["name"] for d in r.json()["departments"]]
    assert names == ["Dept A"]  # not Dept B


def test_non_member_cannot_view_members(client, register_and_login):
    _, headers_a = register_and_login()
    _, headers_b = register_and_login()
    r = client.post("/api/departments", json={"name": "Private Dept"}, headers=headers_a)
    slug = r.json()["slug"]

    r = client.get(f"/api/departments/{slug}/members", headers=headers_b)
    assert r.status_code == 403


def test_admin_can_add_member(client, register_and_login):
    _, headers_a = register_and_login()
    email_b, _ = register_and_login()
    r = client.post("/api/departments", json={"name": "Team"}, headers=headers_a)
    slug = r.json()["slug"]

    r = client.post(f"/api/departments/{slug}/members", json={"email": email_b, "role": "editor"}, headers=headers_a)
    assert r.status_code == 200

    r = client.get(f"/api/departments/{slug}/members", headers=headers_a)
    emails = [m["email"] for m in r.json()["members"]]
    assert email_b in emails


def test_editor_cannot_add_members(client, register_and_login):
    _, headers_a = register_and_login()
    email_b, headers_b = register_and_login()
    email_c, _ = register_and_login()
    r = client.post("/api/departments", json={"name": "Team"}, headers=headers_a)
    slug = r.json()["slug"]
    client.post(f"/api/departments/{slug}/members", json={"email": email_b, "role": "editor"}, headers=headers_a)

    r = client.post(f"/api/departments/{slug}/members", json={"email": email_c, "role": "editor"}, headers=headers_b)
    assert r.status_code == 403


def test_cannot_remove_last_admin(client, register_and_login):
    email_a, headers_a = register_and_login()
    r = client.post("/api/departments", json={"name": "Solo Team"}, headers=headers_a)
    slug = r.json()["slug"]

    r = client.delete(f"/api/departments/{slug}/members/{email_a}", headers=headers_a)
    assert r.status_code == 400


def test_nonexistent_department_404s(client, register_and_login):
    _, headers = register_and_login()
    r = client.get("/api/departments/no-such-slug/members", headers=headers)
    assert r.status_code == 404
