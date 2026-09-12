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
from contextlib import contextmanager
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

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shift_schedule.db")


def init_db():
    with sqlite3.connect(DB_PATH) as conn:
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


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


app = FastAPI(title="Shift Schedule Storage API")

# Dev-friendly CORS: allow any origin so the static frontend (opened via
# file://, a dev server, or a different host) can reach the API. Tighten
# this to your actual frontend origin(s) before deploying publicly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class StoragePayload(BaseModel):
    value: str


class StorageItem(BaseModel):
    key: str
    value: str


@app.on_event("startup")
def on_startup():
    init_db()


# Approval workflow (OneDrive-folder 2-tier sign-off). Imported after
# on_startup is defined, and its own DB init runs at import time via
# init_approvals_db() inside approvals.py — see that file for why.
from approvals import router as approvals_router, poll_loop  # noqa: E402
app.include_router(approvals_router)


@app.on_event("startup")
async def start_approval_poller():
    import asyncio
    import logging
    import onedrive_folder
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


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/storage/{key}", response_model=StorageItem)
def get_value(key: str):
    with get_conn() as conn:
        row = conn.execute("SELECT key, value FROM storage WHERE key = ?", (key,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="key not found")
    return {"key": row["key"], "value": row["value"]}


@app.put("/api/storage/{key}", response_model=StorageItem)
def set_value(key: str, payload: StoragePayload):
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
def delete_value(key: str):
    with get_conn() as conn:
        cur = conn.execute("DELETE FROM storage WHERE key = ?", (key,))
        conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="key not found")
    return {"key": key, "deleted": True}


@app.get("/api/storage")
def list_keys(prefix: str = ""):
    """Optional admin/debug helper — lists stored keys (not their values)."""
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT key, updated_at FROM storage WHERE key LIKE ? ORDER BY key",
            (f"{prefix}%",),
        ).fetchall()
    return {"keys": [{"key": r["key"], "updated_at": r["updated_at"]} for r in rows]}
