"""
Shared fixtures for the backend test suite.

Each test gets its own temp SQLite file (not the real shift_schedule.db)
so tests can't see each other's data and can't corrupt anything a
developer might be looking at locally. app.py, departments.py and
local_auth.py each resolve their own DB_PATH independently (see each
module) — this fixture monkeypatches all three to the same temp file,
matching how they'd actually behave in a real deployment (one database,
several modules each owning their own tables in it).
"""

import importlib
import os
import sys
import tempfile

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("AUTH_SECRET_KEY", "test-only-secret-never-use-in-prod")


@pytest.fixture()
def client():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.remove(path)  # the init_*_db() calls below create it fresh

    import app as app_module
    import departments as departments_module
    import local_auth as local_auth_module
    import rate_limit

    app_module.DB_PATH = path
    departments_module.DB_PATH = path
    local_auth_module.DB_PATH = path

    app_module.init_db()
    departments_module.init_departments_db()
    local_auth_module.init_users_db()

    # Rate limiters are module-level singletons (see rate_limit.py's own
    # docstring on why) — shared across every test in the same pytest
    # process unless explicitly cleared, which would make one test's
    # login attempts count against the next test's budget. Fresh
    # instances per test keep them independent, same as the DB above.
    rate_limit.login_limiter = rate_limit.RateLimiter(max_attempts=8, window_seconds=300)
    rate_limit.register_limiter = rate_limit.RateLimiter(max_attempts=5, window_seconds=3600)
    local_auth_module.login_limiter = rate_limit.login_limiter
    local_auth_module.register_limiter = rate_limit.register_limiter

    with TestClient(app_module.app) as c:
        yield c

    # The real fix for Windows "file in use" errors was closing the
    # sqlite3 connections properly in each init_*_db() (see those
    # functions) — this retry is just defense in depth, since Windows
    # antivirus/indexing can still grab a brief transient lock on a
    # just-closed file independent of anything our own code does.
    import time
    for attempt in range(5):
        try:
            os.remove(path)
            break
        except PermissionError:
            if attempt == 4:
                raise
            time.sleep(0.2)


@pytest.fixture()
def register_and_login(client):
    """Returns a helper that registers a fresh user and returns
    (email, auth_headers) — the setup nearly every other test needs
    before it can get to the thing it's actually testing."""
    counter = {"n": 0}

    def _make(email=None, password="correctpassword123", name="Test User"):
        counter["n"] += 1
        email = email or f"user{counter['n']}@test.com"
        r = client.post("/api/auth/register", json={"email": email, "password": password, "name": name})
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        return email, {"Authorization": f"Bearer {token}"}

    return _make
