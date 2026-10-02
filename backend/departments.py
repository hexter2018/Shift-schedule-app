"""
Departments — the multi-tenancy boundary. Every schedule belongs to
exactly one department; a person can only read/edit a schedule if they're
a member of that department. Self-service: any signed-in user can create
a new department (becoming its first admin), rather than requiring a
site-wide superadmin to provision one — this is an internal tool for a
known set of employees, not a public multi-tenant SaaS, so the trust
model can afford to be that open at the "create a department" step while
still being strict about "who can touch THIS department's data" once one
exists.
"""

import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends

from auth import get_current_user, CurrentUser

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shift_schedule.db")

router = APIRouter()


def init_departments_db():
    # See app.py's init_db() for why this needs an explicit close()
    # rather than relying on the with-statement (which only commits for
    # sqlite3, it doesn't close).
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS departments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS department_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
                email TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'editor',
                added_by TEXT,
                added_at TEXT NOT NULL,
                UNIQUE(department_id, email)
            )
        """)
        conn.commit()
    finally:
        conn.close()


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # SQLite has foreign-key ENFORCEMENT off by default on every new
    # connection (unlike almost every other SQL database) — the
    # REFERENCES clause above is otherwise just documentation, silently
    # not enforced. No "delete department" feature exists yet to actually
    # create orphaned member rows today, but this is the kind of thing
    # that's much cheaper to have on from day one than to discover missing
    # once real data (and a delete button) both exist.
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(name: str) -> str:
    # Thai department names don't romanize meaningfully, so the slug is
    # deliberately opaque (a random-ish safe token) rather than derived
    # from the name — it's an internal routing key, never shown to users,
    # so it doesn't need to *mean* anything, just be stable and URL-safe.
    base = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")
    return base or "dept"


def _unique_slug(conn, name: str) -> str:
    base = _slugify(name)
    slug = base
    n = 1
    while conn.execute("SELECT 1 FROM departments WHERE slug = ?", (slug,)).fetchone():
        n += 1
        slug = f"{base}-{n}"
    return slug


def get_department_by_slug(slug: str) -> sqlite3.Row | None:
    with get_conn() as conn:
        return conn.execute("SELECT * FROM departments WHERE slug = ?", (slug,)).fetchone()


def get_membership(department_id: int, email: str) -> sqlite3.Row | None:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM department_members WHERE department_id = ? AND email = ?",
            (department_id, email),
        ).fetchone()


async def require_department_member(slug: str, user: CurrentUser = Depends(get_current_user)) -> sqlite3.Row:
    """FastAPI dependency other routers (schedules, approvals) use to
    gate access to one department's data — raises 403 for anyone not a
    member, 404 if the department itself doesn't exist. Returns the
    department row so callers have its id/name without a second query."""
    dept = get_department_by_slug(slug)
    if not dept:
        raise HTTPException(404, f"No department {slug!r}")
    if not get_membership(dept["id"], user.email):
        raise HTTPException(403, "You're not a member of this department")
    return dept


async def require_department_admin(slug: str, user: CurrentUser = Depends(get_current_user)) -> sqlite3.Row:
    dept = get_department_by_slug(slug)
    if not dept:
        raise HTTPException(404, f"No department {slug!r}")
    member = get_membership(dept["id"], user.email)
    if not member or member["role"] != "admin":
        raise HTTPException(403, "You need to be an admin of this department")
    return dept


def department_slug_from_key(key: str) -> str:
    """Every piece of department-scoped data (schedules, shift patterns,
    holidays, group rotations) shares one key convention:
    'dept:{slug}:whatever-comes-after'. Centralizing the parsing here
    means the storage endpoints, approval endpoints, and anything added
    later all agree on the same format instead of each inventing (and
    possibly getting wrong) their own parsing."""
    parts = key.split(":", 2)
    if len(parts) < 2 or parts[0] != "dept":
        raise HTTPException(
            400,
            f"Key {key!r} isn't department-scoped (expected 'dept:{{slug}}:...') — "
            "this backend no longer accepts un-scoped storage keys.",
        )
    return parts[1]


async def require_department_member_for_key(key: str, user: CurrentUser = Depends(get_current_user)) -> sqlite3.Row:
    """FastAPI dependency for the generic storage endpoints (and anything
    else that's handed a raw key rather than already knowing the
    department slug) — parses the slug out of the key itself, then
    applies the exact same membership check require_department_member
    does explicitly."""
    slug = department_slug_from_key(key)
    return await require_department_member(slug, user)


@router.get("/api/departments")
def list_my_departments(user: CurrentUser = Depends(get_current_user)):
    """What the department picker on the frontend calls — only the
    departments this person can actually access, not every department in
    the system (that would leak which departments exist to everyone)."""
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT d.id, d.name, d.slug, m.role
            FROM departments d
            JOIN department_members m ON m.department_id = d.id
            WHERE m.email = ?
            ORDER BY d.name
        """, (user.email,)).fetchall()
    return {"departments": [dict(r) for r in rows]}


@router.post("/api/departments")
def create_department(body: dict, user: CurrentUser = Depends(get_current_user)):
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name is required")
    with get_conn() as conn:
        slug = _unique_slug(conn, name)
        now = _now()
        cur = conn.execute(
            "INSERT INTO departments (name, slug, created_by, created_at) VALUES (?, ?, ?, ?)",
            (name, slug, user.email, now),
        )
        dept_id = cur.lastrowid
        conn.execute(
            "INSERT INTO department_members (department_id, email, role, added_by, added_at) "
            "VALUES (?, ?, 'admin', ?, ?)",
            (dept_id, user.email, user.email, now),
        )
        conn.commit()
    return {"id": dept_id, "name": name, "slug": slug, "role": "admin"}


@router.get("/api/departments/{slug}/members")
def list_members(dept=Depends(require_department_member)):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT email, role, added_at FROM department_members WHERE department_id = ? ORDER BY added_at",
            (dept["id"],),
        ).fetchall()
    return {"members": [dict(r) for r in rows]}


@router.post("/api/departments/{slug}/members")
def add_member(body: dict, dept=Depends(require_department_admin), user: CurrentUser = Depends(get_current_user)):
    email = (body.get("email") or "").strip().lower()
    role = body.get("role") or "editor"
    if not email:
        raise HTTPException(400, "email is required")
    if role not in ("editor", "admin"):
        raise HTTPException(400, "role must be 'editor' or 'admin'")
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO department_members (department_id, email, role, added_by, added_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(department_id, email) DO UPDATE SET role = excluded.role
        """, (dept["id"], email, role, user.email, _now()))
        conn.commit()
    return {"email": email, "role": role}


@router.delete("/api/departments/{slug}/members/{email}")
def remove_member(email: str, dept=Depends(require_department_admin)):
    with get_conn() as conn:
        # Never allow removing the last admin — a department that ends up
        # with zero admins can't manage itself again without a database
        # edit, which defeats the whole point of self-service departments.
        admins_left = conn.execute(
            "SELECT COUNT(*) c FROM department_members WHERE department_id = ? AND role = 'admin' AND email != ?",
            (dept["id"], email.lower()),
        ).fetchone()["c"]
        target = conn.execute(
            "SELECT role FROM department_members WHERE department_id = ? AND email = ?",
            (dept["id"], email.lower()),
        ).fetchone()
        if target and target["role"] == "admin" and admins_left == 0:
            raise HTTPException(400, "Can't remove the last admin of a department")
        cur = conn.execute(
            "DELETE FROM department_members WHERE department_id = ? AND email = ?",
            (dept["id"], email.lower()),
        )
        conn.commit()
    if cur.rowcount == 0:
        raise HTTPException(404, "That email isn't a member of this department")
    return {"removed": email.lower()}
