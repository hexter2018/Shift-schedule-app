"""
In-memory rate limiting for the auth endpoints specifically — login and
register have no cost to attempt (no CAPTCHA, no email verification), so
without this, anyone can brute-force a password or spam-create accounts
as fast as the network allows.

Deliberately in-process rather than Redis-backed: this is a small
internal tool running as a single process (see onedrive_folder.py's own
comments on the same philosophy), so a dict with a lock is simpler to
reason about and has nothing extra to deploy. The real cost of that
choice — limits reset if the process restarts, and don't share across
multiple backend instances — is fine here and would need revisiting if
this ever ran as more than one process.
"""

import time
import threading
from collections import defaultdict, deque

from fastapi import HTTPException


class RateLimiter:
    def __init__(self, max_attempts: int, window_seconds: int):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str):
        """Raises 429 if `key` has hit the limit within the window;
        otherwise records this attempt and lets the caller proceed.
        Call this BEFORE doing the expensive/sensitive work (checking a
        password, writing a new row) so a blocked attempt costs as
        little as possible."""
        now = time.time()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > self.window_seconds:
                hits.popleft()
            if len(hits) >= self.max_attempts:
                retry_after = int(self.window_seconds - (now - hits[0])) + 1
                raise HTTPException(
                    429,
                    f"พยายามมากเกินไป กรุณารอ {retry_after} วินาทีแล้วลองใหม่",
                    headers={"Retry-After": str(retry_after)},
                )
            hits.append(now)

    def reset(self, key: str):
        """Called on a SUCCESSFUL login — a legitimate user who mistyped
        their password a couple of times shouldn't still be counted
        against the limit once they get it right."""
        with self._lock:
            self._hits.pop(key, None)


# Tuned for a person, not a script: a few genuine mistyped-password
# retries shouldn't lock anyone out, but a password-guessing script
# hits the ceiling almost immediately.
login_limiter = RateLimiter(max_attempts=8, window_seconds=300)
register_limiter = RateLimiter(max_attempts=5, window_seconds=3600)
