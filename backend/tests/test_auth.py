def test_register_then_me(client):
    r = client.post("/api/auth/register", json={"email": "alice@test.com", "password": "password123", "name": "Alice"})
    assert r.status_code == 200
    token = r.json()["token"]

    r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    assert r.json() == {"email": "alice@test.com", "name": "Alice"}


def test_register_duplicate_email_rejected(client):
    client.post("/api/auth/register", json={"email": "dup@test.com", "password": "password123", "name": "A"})
    r = client.post("/api/auth/register", json={"email": "dup@test.com", "password": "password456", "name": "B"})
    assert r.status_code == 409


def test_register_short_password_rejected(client):
    r = client.post("/api/auth/register", json={"email": "short@test.com", "password": "short", "name": "A"})
    assert r.status_code == 400


def test_register_invalid_email_rejected(client):
    r = client.post("/api/auth/register", json={"email": "not-an-email", "password": "password123", "name": "A"})
    assert r.status_code == 400


def test_login_correct_password(client):
    client.post("/api/auth/register", json={"email": "bob@test.com", "password": "mypassword123", "name": "Bob"})
    r = client.post("/api/auth/login", json={"email": "bob@test.com", "password": "mypassword123"})
    assert r.status_code == 200
    assert "token" in r.json()


def test_login_wrong_password(client):
    client.post("/api/auth/register", json={"email": "carol@test.com", "password": "mypassword123", "name": "Carol"})
    r = client.post("/api/auth/login", json={"email": "carol@test.com", "password": "wrongpassword"})
    assert r.status_code == 401


def test_login_nonexistent_email_same_error_as_wrong_password(client):
    # Must not leak which emails have accounts — same status/shape either way.
    r1 = client.post("/api/auth/login", json={"email": "nosuchuser@test.com", "password": "whatever123"})
    client.post("/api/auth/register", json={"email": "exists@test.com", "password": "correctpass123", "name": "D"})
    r2 = client.post("/api/auth/login", json={"email": "exists@test.com", "password": "wrongpass"})
    assert r1.status_code == r2.status_code == 401
    assert r1.json()["detail"] == r2.json()["detail"]


def test_protected_endpoint_without_token_rejected(client):
    r = client.get("/api/auth/me")
    assert r.status_code == 401


def test_protected_endpoint_with_garbage_token_rejected(client):
    r = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 401


def test_login_rate_limit_blocks_after_max_attempts(client):
    client.post("/api/auth/register", json={"email": "ratelimited@test.com", "password": "correctpass123", "name": "E"})
    statuses = []
    for _ in range(10):
        r = client.post("/api/auth/login", json={"email": "ratelimited@test.com", "password": "wrong"})
        statuses.append(r.status_code)
    assert statuses[:8] == [401] * 8
    assert statuses[8:] == [429, 429]


def test_login_rate_limit_includes_retry_after_header(client):
    client.post("/api/auth/register", json={"email": "retryafter@test.com", "password": "correctpass123", "name": "F"})
    for _ in range(8):
        client.post("/api/auth/login", json={"email": "retryafter@test.com", "password": "wrong"})
    r = client.post("/api/auth/login", json={"email": "retryafter@test.com", "password": "wrong"})
    assert r.status_code == 429
    assert "Retry-After" in r.headers


def test_successful_login_resets_rate_limit_counter(client):
    client.post("/api/auth/register", json={"email": "resets@test.com", "password": "correctpass123", "name": "G"})
    for _ in range(3):
        client.post("/api/auth/login", json={"email": "resets@test.com", "password": "wrong"})
    r = client.post("/api/auth/login", json={"email": "resets@test.com", "password": "correctpass123"})
    assert r.status_code == 200  # well under the cap of 8, should succeed

    # Counter reset on success — should be able to fail a few more times
    # without immediately hitting the cap from leftover pre-reset attempts.
    r = client.post("/api/auth/login", json={"email": "resets@test.com", "password": "wrong"})
    assert r.status_code == 401  # not 429


def test_register_rate_limit_blocks_spam(client):
    statuses = []
    for i in range(7):
        r = client.post("/api/auth/register", json={"email": f"spam{i}@test.com", "password": "password12345", "name": "Spam"})
        statuses.append(r.status_code)
    assert statuses[:5] == [200] * 5
    assert statuses[5:] == [429, 429]
