"""
Self-hosted authentication — the backend issues and validates its own
signed tokens (HS256), rather than validating Microsoft-issued ones. This
exists because Azure AD SSO (the originally intended design) needs an App
Registration in the organization's Azure AD, which needs admin rights
nobody currently has — this is the fallback that needs no one else's
permission to stand up.

Same shape as the Azure AD version this replaced (still a get_current_user
FastAPI dependency returning a CurrentUser with .email/.name) specifically
so departments.py, and everything built on top of it, didn't need to
change at all when the auth backend changed underneath.
"""

import os
import time
import logging

import jwt
from fastapi import HTTPException, Header

logger = logging.getLogger("auth")

# MUST be overridden via env var in any real deployment — every server
# process needs the *same* value (so a token issued by one process
# validates on another) and it must not be guessable, since anyone who
# has it can forge a valid login for any email. The literal fallback
# here exists only so local dev doesn't hard-crash with no .env set up;
# is_using_dev_secret() below flags it loudly rather than silently
# running insecurely.
_DEV_SECRET = "dev-only-insecure-secret-change-me"
SECRET_KEY = os.environ.get("AUTH_SECRET_KEY", _DEV_SECRET)
TOKEN_TTL_SECONDS = int(os.environ.get("AUTH_TOKEN_TTL_HOURS", "12")) * 3600


def is_using_dev_secret() -> bool:
    return SECRET_KEY == _DEV_SECRET


def is_configured() -> bool:
    # Unlike the Azure AD version, there's no external prerequisite here —
    # this always works, even with the dev secret. Kept for interface
    # parity with what departments.py etc. might still check.
    return True


def issue_token(email: str, name: str) -> str:
    now = int(time.time())
    payload = {
        "sub": email,
        "name": name,
        "iat": now,
        "exp": now + TOKEN_TTL_SECONDS,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


class CurrentUser:
    """What every protected route gets after Depends(get_current_user) —
    just the two claims anything here actually needs."""
    def __init__(self, email: str, name: str):
        self.email = email
        self.name = name

    def __repr__(self):
        return f"CurrentUser(email={self.email!r}, name={self.name!r})"


async def get_current_user(authorization: str = Header(default="")) -> CurrentUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization[len("Bearer "):]

    try:
        claims = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token has expired — sign in again")
    except jwt.InvalidTokenError as e:
        logger.warning("Rejected invalid token: %s", e)
        raise HTTPException(401, "Invalid token")

    email = (claims.get("sub") or "").lower()
    name = claims.get("name") or email
    if not email:
        raise HTTPException(401, "Token has no subject claim")
    return CurrentUser(email=email, name=name)
