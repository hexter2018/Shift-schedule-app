"""
Shift schedule tool — backend API.

Provides a small, generic key/value storage API backed by SQLite, matching
the interface the frontend already speaks (get/set by string key, JSON
string value). This keeps the frontend's existing logic untouched — only
the storage transport changed, from window.storage/localStorage to real
HTTP + a database.

Run:
    pip install -r requirements.txt
    uvicorn app:app --reload --port 8000

The database file (shift_schedule.db) is created automatically next to
this script on first run.
"""

import os
import sqlite3
from contextlib import contextmanager, asynccontextmanager
from datetime import datetime, timezone

# Load backend/.env into real process environment variables before
# anything else runs. Without this, only test_onedrive_folder.py (which
# calls load_dotenv() itself) ever sees ONEDRIVE_APPROVALS_ROOT — the
# actual running server would only pick it up if it happened to be set as
# a real OS environment variable in whatever terminal launched uvicorn,
# which is an easy, confusing way to have the test pass and the app fail.
# Must run before the `from approvals import ...` line below, since that
# import chain reads ONEDRIVE_APPROVALS_ROOT at module-import time
# (onedrive_folder.py's top-level `ROOT = os.environ.get(...)`), not
# lazily — an env var set after that import wouldn't be seen.
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shift_schedule.db")


def init_db():
    # sqlite3.connect(...) used as a context manager only commits/rolls
    # back the transaction on exit — it does NOT close the connection
    # (a well-known sqlite3 module gotcha, unlike almost every other
    # Python DB-API). Left open, Linux's looser file locking hides it;
    # Windows enforces file locks strictly enough that a later attempt
    # to touch the same file (our own tests' cleanup included) fails
    # with "file in use". Closing explicitly is correct everywhere,
    # not just a Windows workaround.
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS storage (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Replaces the two separate @app.on_event("startup") handlers this
    # used to be (on_event is deprecated in favor of exactly this
    # pattern — one lifespan context manager, startup code before the
    # yield, shutdown code after). Combined into one function since
    # FastAPI only accepts a single lifespan per app.
    #
    # The imports below are deferred (inside the function body, not at
    # module level) on purpose: this function is defined here, before
    # the router imports further down in this file, but doesn't
    # actually RUN until the app starts — by which point every name it
    # needs has long since finished importing. Moving this function
    # below those imports instead would work too, but would separate it
    # from `app = FastAPI(...)` right below, which is where a reader
    # expects to find it.
    import asyncio
    import logging

    init_db()
    from departments import init_departments_db
    init_departments_db()
    from local_auth import init_users_db
    init_users_db()

    import auth
    if auth.is_using_dev_secret():
        logging.getLogger("auth").warning(
            "AUTH_SECRET_KEY is not set — using an insecure default. Anyone who reads "
            "this source code can forge a login token for any email. Set AUTH_SECRET_KEY "
            "to a long random value before this is reachable by anyone but you."
        )

    import onedrive_folder
    from approvals import poll_loop
    if onedrive_folder.is_configured():
        asyncio.create_task(poll_loop())
    else:
        # Dev-friendly: don't spam errors if ONEDRIVE_APPROVALS_ROOT simply
        # isn't set up yet (e.g. local dev against the storage/schedule
        # endpoints only). Submitting a schedule for approval will still
        # fail loudly with a clear error in that case — this only skips
        # the background poll loop itself.
        logging.getLogger("approvals").warning(
            "ONEDRIVE_APPROVALS_ROOT not set/found — approval poll loop not started"
        )

    yield
    # Nothing to do on shutdown — the poll loop task is daemon-like and
    # the process exiting is enough to stop it; sqlite connections are
    # already opened/closed per-request via get_conn(), not held open
    # across the app's lifetime.


app = FastAPI(title="Shift Schedule Storage API", lifespan=lifespan)

# Imported here (ahead of the approvals import below) because the
# storage routes right below need these as route decorators, which
# Python evaluates at module-load time — same reasoning as the comment
# on the approvals import further down, just for an earlier point in
# the file.
from auth import get_current_user, CurrentUser  # noqa: E402
from departments import require_department_member_for_key, department_slug_from_key, list_my_departments  # noqa: E402

# Wide open (["*"]) by default — fine for local dev (the frontend is
# opened via file://, a dev server, or a different host with no fixed
# origin to allow-list). Set CORS_ALLOWED_ORIGINS to a comma-separated
# list of real origins (e.g. "https://schedule.example.com") before this
# is reachable by anyone but you — this is the CORS layer specifically,
# separate from and in addition to the Bearer-token auth every route
# already requires; auth alone doesn't stop a browser from *asking*
# cross-origin, just from succeeding without a valid token once it does.
_cors_origins_env = os.environ.get("CORS_ALLOWED_ORIGINS", "").strip()
_cors_origins = [o.strip() for o in _cors_origins_env.split(",") if o.strip()] or ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StoragePayload(BaseModel):
    value: str


class StorageItem(BaseModel):
    key: str
    value: str


# Approval workflow (OneDrive-folder 2-tier sign-off). Imported here
# (rather than at the top of the file) because its own DB init runs at
# import time via init_approvals_db() inside approvals.py — see that
# file for why — and because poll_loop is referenced by name inside
# lifespan() above via a deferred import, so this is the first point in
# the file it actually needs to exist as a module-level name (for
# app.include_router below).
from approvals import router as approvals_router, poll_loop  # noqa: E402
app.include_router(approvals_router)

from signatures import router as signatures_router  # noqa: E402
app.include_router(signatures_router)

from departments import router as departments_router  # noqa: E402
app.include_router(departments_router)

from local_auth import router as local_auth_router  # noqa: E402
app.include_router(local_auth_router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/storage/{key}", response_model=StorageItem)
def get_value(key: str, dept=Depends(require_department_member_for_key)):
    with get_conn() as conn:
        row = conn.execute("SELECT key, value FROM storage WHERE key = ?", (key,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="key not found")
    return {"key": row["key"], "value": row["value"]}


@app.put("/api/storage/{key}", response_model=StorageItem)
def set_value(key: str, payload: StoragePayload, dept=Depends(require_department_member_for_key)):
    now = datetime.now(timezone.utc).isoformat()
    with get_conn() as conn:
        conn.execute(
            """
            INSERT INTO storage (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
            """,
            (key, payload.value, now),
        )
        conn.commit()
    return {"key": key, "value": payload.value}


@app.delete("/api/storage/{key}")
def delete_value(key: str, dept=Depends(require_department_member_for_key)):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM storage WHERE key = ?", (key,))
        conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="key not found")
    return {"key": key, "deleted": True}


@app.get("/api/storage")
def list_keys(prefix: str = "", user: CurrentUser = Depends(get_current_user)):
    """Admin/debug helper — lists stored keys (not their values). Only
    within departments the caller is actually a member of, same as every
    other storage endpoint — 'list everything' would otherwise leak which
    departments/schedules exist org-wide to anyone signed in at all."""
    my_slugs = {d["slug"] for d in list_my_departments(user)["departments"]}
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT key, updated_at FROM storage WHERE key LIKE ? ORDER BY key",
            (f"{prefix}%",),
        ).fetchall()
    visible = []
    for r in rows:
        try:
            slug = department_slug_from_key(r["key"])
        except HTTPException:
            continue  # not department-scoped (shouldn't happen going forward) — just omit it
        if slug in my_slugs:
            visible.append({"key": r["key"], "updated_at": r["updated_at"]})
    return {"keys": visible}
