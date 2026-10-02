"""
Microsoft Graph API client — SharePoint file upload + list item read/write,
using an Azure AD app registration with client-credentials (app-only) auth.
No user sign-in involved; the app registration needs Sites.ReadWrite.All
(application permission, admin-consented) against the target site.

Deliberately raw `requests` calls rather than the msal/office365 SDKs — this
is a small, fixed set of operations and staying dependency-light means
there's less to go wrong. If this grows (multiple sites, delta queries,
large-file upload sessions), reach for msal instead of hand-rolling more of
this.
"""

import os
import time
import threading
import requests

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

TENANT_ID = os.environ.get("GRAPH_TENANT_ID", "")
CLIENT_ID = os.environ.get("GRAPH_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GRAPH_CLIENT_SECRET", "")

# Either set SHAREPOINT_SITE_ID directly (the Graph site id, e.g.
# "contoso.sharepoint.com,<guid>,<guid>"), or set SHAREPOINT_SITE_HOSTNAME +
# SHAREPOINT_SITE_PATH and let resolve_site_id() look it up once at startup.
SITE_ID_ENV = os.environ.get("SHAREPOINT_SITE_ID", "")
SITE_HOSTNAME = os.environ.get("SHAREPOINT_SITE_HOSTNAME", "")  # e.g. "contoso.sharepoint.com"
SITE_PATH = os.environ.get("SHAREPOINT_SITE_PATH", "")          # e.g. "/sites/OperationsTeam"

DRIVE_NAME = os.environ.get("SHAREPOINT_DRIVE_NAME", "Documents")   # doc library display name
UPLOAD_FOLDER = os.environ.get("SHAREPOINT_UPLOAD_FOLDER", "ScheduleApprovals")
LIST_NAME = os.environ.get("SHAREPOINT_LIST_NAME", "Schedule Approvals")

# ---------------------------------------------------------------- auth ----

_token_lock = threading.Lock()
_token_cache = {"access_token": None, "expires_at": 0}


def _get_access_token() -> str:
    with _token_lock:
        if _token_cache["access_token"] and time.time() < _token_cache["expires_at"] - 60:
            return _token_cache["access_token"]

        if not (TENANT_ID and CLIENT_ID and CLIENT_SECRET):
            raise RuntimeError(
                "GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET are not configured"
            )

        resp = requests.post(
            f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token",
            data={
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "scope": "https://graph.microsoft.com/.default",
                "grant_type": "client_credentials",
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        _token_cache["access_token"] = data["access_token"]
        _token_cache["expires_at"] = time.time() + data.get("expires_in", 3600)
        return _token_cache["access_token"]


def _headers(extra: dict | None = None) -> dict:
    h = {"Authorization": f"Bearer {_get_access_token()}"}
    if extra:
        h.update(extra)
    return h


# -------------------------------------------------------- site / drive ----

_site_id_cache: str | None = None
_drive_id_cache: str | None = None
_list_id_cache: str | None = None


def resolve_site_id() -> str:
    """Only needed if SHAREPOINT_SITE_ID isn't set directly. Result is
    cached for the process lifetime — site ids don't change."""
    global _site_id_cache
    if SITE_ID_ENV:
        return SITE_ID_ENV
    if _site_id_cache:
        return _site_id_cache
    if not (SITE_HOSTNAME and SITE_PATH):
        raise RuntimeError(
            "Set SHAREPOINT_SITE_ID, or both SHAREPOINT_SITE_HOSTNAME and SHAREPOINT_SITE_PATH"
        )
    resp = requests.get(
        f"{GRAPH_BASE}/sites/{SITE_HOSTNAME}:{SITE_PATH}", headers=_headers(), timeout=15
    )
    resp.raise_for_status()
    _site_id_cache = resp.json()["id"]
    return _site_id_cache


def _resolve_drive_id(site_id: str) -> str:
    global _drive_id_cache
    if _drive_id_cache:
        return _drive_id_cache
    resp = requests.get(f"{GRAPH_BASE}/sites/{site_id}/drives", headers=_headers(), timeout=15)
    resp.raise_for_status()
    for d in resp.json()["value"]:
        if d["name"] == DRIVE_NAME:
            _drive_id_cache = d["id"]
            return _drive_id_cache
    raise RuntimeError(f"No document library named {DRIVE_NAME!r} found on this site")


def _resolve_list_id(site_id: str) -> str:
    global _list_id_cache
    if _list_id_cache:
        return _list_id_cache
    resp = requests.get(f"{GRAPH_BASE}/sites/{site_id}/lists", headers=_headers(), timeout=15)
    resp.raise_for_status()
    for lst in resp.json()["value"]:
        if lst["displayName"] == LIST_NAME:
            _list_id_cache = lst["id"]
            return _list_id_cache
    raise RuntimeError(
        f"No SharePoint list named {LIST_NAME!r} found on this site — create it first "
        f"(see README for the expected columns)"
    )


# ------------------------------------------------------------- upload -----

def upload_file(filename: str, content: bytes) -> dict:
    """Small-file upload (<4MB — comfortably covers a monthly schedule
    workbook). Returns the driveItem, notably its 'webUrl' for a clickable
    link and 'id' if ever needed. Uploading is purely so approvers can view
    the file via the approval flow — Python never reads this copy back."""
    site_id = resolve_site_id()
    drive_id = _resolve_drive_id(site_id)
    path = f"{UPLOAD_FOLDER}/{filename}"
    resp = requests.put(
        f"{GRAPH_BASE}/drives/{drive_id}/root:/{path}:/content",
        headers=_headers({
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }),
        data=content,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


# --------------------------------------------------------- list items -----

def create_list_item(fields: dict) -> str:
    """Field keys must be the column's *internal* name, which SharePoint
    derives from the display name at column-creation time and does NOT
    update if you rename the column later (e.g. display name "Section
    Manager Email" -> internal name usually "SectionManagerEmail", but
    verify via GET /sites/{id}/lists/{id}/columns rather than assuming)."""
    site_id = resolve_site_id()
    list_id = _resolve_list_id(site_id)
    resp = requests.post(
        f"{GRAPH_BASE}/sites/{site_id}/lists/{list_id}/items",
        headers=_headers({"Content-Type": "application/json"}),
        json={"fields": fields},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["id"]


def get_list_item_fields(item_id: str) -> dict:
    site_id = resolve_site_id()
    list_id = _resolve_list_id(site_id)
    resp = requests.get(
        f"{GRAPH_BASE}/sites/{site_id}/lists/{list_id}/items/{item_id}?expand=fields",
        headers=_headers(),
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["fields"]


def get_list_columns(site_id: str | None = None) -> list[dict]:
    """Returns each column's displayName + internal `name` — the setup
    guide has you run this to confirm the list's actual internal names
    before trusting the ones assumed elsewhere in this module."""
    site_id = site_id or resolve_site_id()
    list_id = _resolve_list_id(site_id)
    resp = requests.get(
        f"{GRAPH_BASE}/sites/{site_id}/lists/{list_id}/columns", headers=_headers(), timeout=15
    )
    resp.raise_for_status()
    return [
        {"displayName": c["displayName"], "name": c["name"]}
        for c in resp.json()["value"]
        if not c.get("readOnly")  # skip built-in/system columns for a cleaner diff against the schema table
    ]


def delete_drive_item(item_id: str):
    site_id = resolve_site_id()
    drive_id = _resolve_drive_id(site_id)
    resp = requests.delete(f"{GRAPH_BASE}/drives/{drive_id}/items/{item_id}", headers=_headers(), timeout=15)
    resp.raise_for_status()


def delete_list_item(item_id: str):
    site_id = resolve_site_id()
    list_id = _resolve_list_id(site_id)
    resp = requests.delete(
        f"{GRAPH_BASE}/sites/{site_id}/lists/{list_id}/items/{item_id}", headers=_headers(), timeout=15
    )
    resp.raise_for_status()
