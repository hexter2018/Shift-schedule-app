"""
Manager signature images — one image per manager, keyed by email,
uploaded once and reused on every schedule they approve from then on.

Deliberately dumb storage: a flat directory, filename = normalized email
+ the real extension for whichever format they uploaded. No DB table for
this — the file's mere presence/absence on disk *is* the "does this
manager have a signature on file" answer, so there's nothing that can
drift out of sync between a DB row and the actual file the way there
would be with a path-in-DB / file-on-disk pair.
"""

import os
import re
import logging

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends

from auth import get_current_user, CurrentUser

logger = logging.getLogger("signatures")

router = APIRouter()

SIGNATURES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "signatures")
os.makedirs(SIGNATURES_DIR, exist_ok=True)

# Small — this is a signature stamp on a document, not a photo. 2 MB is
# generous headroom over what a clean signature image actually needs
# (usually tens to low hundreds of KB even for a JPEG scan).
MAX_UPLOAD_BYTES = 2 * 1024 * 1024

# Detected from the file's own bytes, never trusted from the client's
# claimed Content-Type or filename — both are easy to get wrong or fake,
# and openpyxl (via Pillow) needs the *actual* format to embed it
# correctly regardless of what the upload was labeled.
_MAGIC_TO_EXT = {
    b"\x89PNG\r\n\x1a\n": ".png",
    b"\xff\xd8\xff": ".jpg",  # JPEG/JFIF/EXIF all share this 3-byte prefix
}
_KNOWN_EXTS = tuple(_MAGIC_TO_EXT.values())


def _normalize_email(email: str) -> str:
    email = (email or "").strip().lower()
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        raise HTTPException(400, f"Not a valid email address: {email!r}")
    return email


def _detect_ext(data: bytes) -> str | None:
    for magic, ext in _MAGIC_TO_EXT.items():
        if data.startswith(magic):
            return ext
    return None


def signature_path_for(email: str) -> str | None:
    """Returns the image path for this manager if one's been uploaded
    (PNG or JPEG — whichever they last uploaded), else None — callers
    (excel_export's signature injection) must handle the None case by
    falling back to a typed name, not by erroring: a manager who hasn't
    uploaded a signature yet must not block approvals."""
    try:
        normalized = _normalize_email(email)
    except HTTPException:
        return None
    for ext in _KNOWN_EXTS:
        path = os.path.join(SIGNATURES_DIR, f"{normalized}{ext}")
        if os.path.isfile(path):
            return path
    return None


@router.put("/api/admin/signatures/{email}")
async def upload_signature(email: str, file: UploadFile = File(...), user: CurrentUser = Depends(get_current_user)):
    normalized = _normalize_email(email)
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, f"File too large ({len(data)} bytes) — max {MAX_UPLOAD_BYTES}")
    ext = _detect_ext(data)
    if ext is None:
        raise HTTPException(400, "That doesn't look like a PNG or JPEG file (bad file signature)")

    # A manager switching formats (e.g. re-uploading as .jpg after
    # originally uploading a .png) must not leave the old file behind —
    # signature_path_for checks .png before .jpg, so a stale .png would
    # silently keep winning over the new .jpg forever.
    for other_ext in _KNOWN_EXTS:
        if other_ext != ext:
            stale = os.path.join(SIGNATURES_DIR, f"{normalized}{other_ext}")
            if os.path.isfile(stale):
                os.remove(stale)

    path = os.path.join(SIGNATURES_DIR, f"{normalized}{ext}")
    tmp_path = path + ".tmp"
    with open(tmp_path, "wb") as f:
        f.write(data)
    os.replace(tmp_path, path)  # atomic on both POSIX and Windows — no reader ever sees a half-written file
    logger.info("Signature uploaded for %s (%s, %d bytes)", normalized, ext, len(data))
    return {"email": normalized, "format": ext.lstrip("."), "sizeBytes": len(data)}


@router.get("/api/admin/signatures")
def list_signatures(user: CurrentUser = Depends(get_current_user)):
    """Which managers have a signature on file — for a simple admin
    checklist view, not exposed to end users."""
    emails = sorted(
        os.path.splitext(name)[0]
        for name in os.listdir(SIGNATURES_DIR)
        if name.endswith(_KNOWN_EXTS)
    )
    return {"emails": emails}


@router.delete("/api/admin/signatures/{email}")
def delete_signature(email: str, user: CurrentUser = Depends(get_current_user)):
    normalized = _normalize_email(email)
    removed = False
    for ext in _KNOWN_EXTS:
        path = os.path.join(SIGNATURES_DIR, f"{normalized}{ext}")
        if os.path.isfile(path):
            os.remove(path)
            removed = True
    if not removed:
        raise HTTPException(404, "No signature on file for that address")
    return {"deleted": True}
