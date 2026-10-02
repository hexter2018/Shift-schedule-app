"""
User accounts for the self-hosted login (see auth.py for why this exists
instead of Azure AD SSO). Self-registration, like departments — anyone
who can reach this backend can create an account. That's an acceptable
trust boundary for an internal tool reachable only from the company
network/VPN, the same boundary the rest of this app already relies on
(there's no public-internet exposure anywhere else in this codebase
either) — but it does mean this endpoint must never be exposed to the
open internet without changing that assumption first.
"""

import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

import bcrypt
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel

from auth import issue_token, get_current_user, CurrentUser
from rate_limit import login_limiter, register_limiter

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shift_schedule.db")

router = APIRouter()

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def init_users_db():
    # See app.py's init_db() for why this needs an explicit close()
    # rather than relying on the with-statement (which only commits for
    # sqlite3, it doesn't close).
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
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


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class RegisterBody(BaseModel):
    email: str
    password: str
    name: str


class LoginBody(BaseModel):
    email: str
    password: str


@router.post("/api/auth/register")
def register(body: RegisterBody, request: Request):
    register_limiter.check(f"ip:{request.client.host}")
    email = body.email.strip().lower()
    name = body.name.strip()
    if not _EMAIL_RE.match(email):
        raise HTTPException(400, "Not a valid email address")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    if not name:
        raise HTTPException(400, "name is required")

    password_hash = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    with get_conn() as conn:
        existing = conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            raise HTTPException(409, "An account with that email already exists — try signing in instead")
        conn.execute(
            "INSERT INTO users (email, password_hash, name, created_at) VALUES (?, ?, ?, ?)",
            (email, password_hash, name, _now()),
        )
        conn.commit()

    # Auto-login on successful registration — one less step than making
    # them immediately turn around and log in with what they just typed.
    token = issue_token(email, name)
    return {"token": token, "email": email, "name": name}


@router.post("/api/auth/login")
def login(body: LoginBody, request: Request):
    email = body.email.strip().lower()
    ip_key = f"ip:{request.client.host}"
    email_key = f"email:{email}"
    # Two separate limiters catch two different attack shapes: one IP
    # trying many emails (credential stuffing) vs many requests — from
    # anywhere — hammering one specific email (targeted brute force).
    login_limiter.check(ip_key)
    login_limiter.check(email_key)

    with get_conn() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    # Same error for "no such account" and "wrong password" — distinguishing
    # them tells an attacker which emails have accounts here at all.
    if not user or not bcrypt.checkpw(body.password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        raise HTTPException(401, "Incorrect email or password")

    login_limiter.reset(ip_key)
    login_limiter.reset(email_key)
    token = issue_token(user["email"], user["name"])
    return {"token": token, "email": user["email"], "name": user["name"]}


@router.get("/api/auth/me")
def me(user: CurrentUser = Depends(get_current_user)):
    return {"email": user.email, "name": user.name}
