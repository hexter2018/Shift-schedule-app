"""
This is the one test file that matters most if it's ever deleted or
broken: it proves that one department's schedule/pattern/holiday data
genuinely can't be read or written by someone who isn't a member of
that department, even if they know (or guess) the exact storage key.
This was a real, exploitable gap once (every storage endpoint was
completely open — see the Phase 5 security audit); these tests exist so
it can't silently regress back to that without a test failing first.
"""


def test_no_auth_token_rejected(client):
    r = client.get("/api/storage/dept:whatever:schedule:2569-10")
    assert r.status_code == 401


def test_non_scoped_key_rejected(client, register_and_login):
    _, headers = register_and_login()
    r = client.get("/api/storage/some-legacy-unscoped-key", headers=headers)
    assert r.status_code == 400


def test_owner_can_read_and_write_own_department_data(client, register_and_login):
    _, headers = register_and_login()
    r = client.post("/api/departments", json={"name": "Dept A"}, headers=headers)
    slug = r.json()["slug"]
    key = f"dept:{slug}:schedule:2569-10"

    r = client.put(f"/api/storage/{key}", json={"value": "my schedule data"}, headers=headers)
    assert r.status_code == 200

    r = client.get(f"/api/storage/{key}", headers=headers)
    assert r.status_code == 200
    assert r.json()["value"] == "my schedule data"


def test_other_user_cannot_read_another_departments_data(client, register_and_login):
    _, headers_a = register_and_login()
    _, headers_b = register_and_login()
    r = client.post("/api/departments", json={"name": "Dept A"}, headers=headers_a)
    slug_a = r.json()["slug"]
    key_a = f"dept:{slug_a}:schedule:2569-10"
    client.put(f"/api/storage/{key_a}", json={"value": "secret dept A data"}, headers=headers_a)

    client.post("/api/departments", json={"name": "Dept B"}, headers=headers_b)  # B has their own dept, not A's

    r = client.get(f"/api/storage/{key_a}", headers=headers_b)
    assert r.status_code == 403


def test_other_user_cannot_write_another_departments_data(client, register_and_login):
    _, headers_a = register_and_login()
    _, headers_b = register_and_login()
    r = client.post("/api/departments", json={"name": "Dept A"}, headers=headers_a)
    slug_a = r.json()["slug"]
    key_a = f"dept:{slug_a}:schedule:2569-10"
    client.put(f"/api/storage/{key_a}", json={"value": "original data"}, headers=headers_a)

    r = client.put(f"/api/storage/{key_a}", json={"value": "HACKED"}, headers=headers_b)
    assert r.status_code == 403

    # and confirm the data was genuinely untouched, not just that the
    # write call itself returned an error
    r = client.get(f"/api/storage/{key_a}", headers=headers_a)
    assert r.json()["value"] == "original data"


def test_other_user_cannot_delete_another_departments_data(client, register_and_login):
    _, headers_a = register_and_login()
    _, headers_b = register_and_login()
    r = client.post("/api/departments", json={"name": "Dept A"}, headers=headers_a)
    slug_a = r.json()["slug"]
    key_a = f"dept:{slug_a}:schedule:2569-10"
    client.put(f"/api/storage/{key_a}", json={"value": "data"}, headers=headers_a)

    r = client.delete(f"/api/storage/{key_a}", headers=headers_b)
    assert r.status_code == 403


def test_member_added_to_department_can_then_access_its_data(client, register_and_login):
    _, headers_a = register_and_login()
    email_b, headers_b = register_and_login()
    r = client.post("/api/departments", json={"name": "Shared Dept"}, headers=headers_a)
    slug = r.json()["slug"]
    key = f"dept:{slug}:schedule:2569-10"
    client.put(f"/api/storage/{key}", json={"value": "shared data"}, headers=headers_a)

    # B can't see it yet
    assert client.get(f"/api/storage/{key}", headers=headers_b).status_code == 403

    # A adds B as a member
    client.post(f"/api/departments/{slug}/members", json={"email": email_b, "role": "editor"}, headers=headers_a)

    # now B can
    r = client.get(f"/api/storage/{key}", headers=headers_b)
    assert r.status_code == 200
    assert r.json()["value"] == "shared data"


def test_storage_list_only_shows_own_departments_keys(client, register_and_login):
    _, headers_a = register_and_login()
    _, headers_b = register_and_login()
    r = client.post("/api/departments", json={"name": "Dept A"}, headers=headers_a)
    slug_a = r.json()["slug"]
    r = client.post("/api/departments", json={"name": "Dept B"}, headers=headers_b)
    slug_b = r.json()["slug"]
    client.put(f"/api/storage/dept:{slug_a}:schedule:2569-10", json={"value": "a"}, headers=headers_a)
    client.put(f"/api/storage/dept:{slug_b}:schedule:2569-10", json={"value": "b"}, headers=headers_b)

    r = client.get("/api/storage", headers=headers_a)
    keys = [k["key"] for k in r.json()["keys"]]
    assert f"dept:{slug_a}:schedule:2569-10" in keys
    assert f"dept:{slug_b}:schedule:2569-10" not in keys


def test_signature_endpoints_require_auth(client):
    r = client.get("/api/admin/signatures")
    assert r.status_code == 401


def test_approval_submit_requires_department_membership(client, register_and_login):
    _, headers_a = register_and_login()
    _, headers_b = register_and_login()
    r = client.post("/api/departments", json={"name": "Dept A"}, headers=headers_a)
    slug_a = r.json()["slug"]
    key_a = f"dept:{slug_a}:schedule:2569-10"

    r = client.post(
        f"/api/schedules/{key_a}/submit",
        json={"sectionManagerEmail": "x@x.com", "divisionManagerEmail": "y@y.com", "createdBy": "hacker"},
        headers=headers_b,
    )
    assert r.status_code == 403
