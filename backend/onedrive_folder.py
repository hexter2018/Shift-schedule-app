"""
Local-filesystem transport for the approval workflow — writes into (and
polls) a folder that OneDrive syncs to the cloud. No Azure AD, no admin
consent, no external HTTP calls: Power Automate reacts to files appearing
in the synced folder ("When a file is created" — OneDrive for Business,
standard/free connector) and writes its outcome back the same way.

Layout under ONEDRIVE_APPROVALS_ROOT (must be a path inside your OneDrive
sync folder — see docs/ONEDRIVE_SETUP.md):

    requests/   <- Python writes {cycle}-request.json here. This is the
                   ONLY folder the Power Automate trigger watches — keeping
                   it single-purpose means the trigger doesn't also fire on
                   the workbook or on result files.
    files/      <- Python writes the pending .xlsx here. Power Automate
                   fetches it by the path named inside the request JSON.
    results/    <- Power Automate writes outcome JSON files here. Python
                   polls this folder. Handled files get moved into
                   results/processed/ so they're never re-read.

Deliberately plain — no library beyond the stdlib. There's nothing here to
authenticate; the "auth" is just that OneDrive is already signed in on
whatever machine runs this backend.
"""

import os
import json
import glob
import shutil
import logging
from datetime import datetime, timezone

logger = logging.getLogger("onedrive_folder")

ROOT = os.environ.get("ONEDRIVE_APPROVALS_ROOT", "")


def _sub(name: str) -> str:
    if not ROOT:
        raise RuntimeError(
            "ONEDRIVE_APPROVALS_ROOT is not set — point it at a folder inside "
            "your OneDrive sync tree (see docs/ONEDRIVE_SETUP.md)."
        )
    path = os.path.join(ROOT, name)
    os.makedirs(path, exist_ok=True)
    return path


def requests_dir() -> str: return _sub("requests")
def files_dir() -> str: return _sub("files")
def results_dir() -> str: return _sub("results")
def processed_dir() -> str: return _sub(os.path.join("results", "processed"))
def ready_for_hr_dir() -> str: return _sub("ready_for_hr")


def is_configured() -> bool:
    return bool(ROOT) and os.path.isdir(ROOT)


def write_pending_workbook(filename: str, wb) -> str:
    """Saves the openpyxl Workbook directly into the synced files/ folder.
    This *is* the upload — no separate API call needed, OneDrive picks up
    the write on its own."""
    path = os.path.join(files_dir(), filename)
    wb.save(path)
    return path


def write_ready_for_hr(filename: str, wb) -> str:
    """Final handoff step, once a cycle is fully approved and signatures
    are injected: save the signed workbook into ready_for_hr/. Python's
    involvement ends here — a second, separate Power Automate flow
    triggers on this folder and sends the email via 'Send an email (V2)'
    (standard Outlook connector). Deliberately no smtplib/SMTP credentials
    anywhere in this backend — the write itself is the entire handoff."""
    path = os.path.join(ready_for_hr_dir(), filename)
    wb.save(path)
    return path


def write_request(cycle_id: int, payload: dict) -> str:
    """The request JSON is what the flow's trigger actually reacts to.
    Written last (after the workbook), so the flow never sees a request
    referencing a file that hasn't finished being written yet."""
    path = os.path.join(requests_dir(), f"cycle-{cycle_id}-request.json")
    _atomic_write_json(path, payload)
    return path


def _atomic_write_json(path: str, payload: dict):
    """Write-then-rename instead of writing directly to the final name —
    avoids a reader (OneDrive's uploader, or our own poller) ever observing
    a half-written file. Plain os.rename is atomic on the same filesystem,
    which a temp file in the same directory guarantees."""
    tmp_path = path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, path)


def _safe_read_json(path: str) -> dict | None:
    """Returns None (meaning "not ready yet, check again next poll")
    instead of raising, for two real scenarios this needs to tolerate:
    (1) OneDrive Files On-Demand can briefly show a placeholder before the
    actual bytes are locally available, and (2) we might read while
    OneDrive itself is still mid-write on this end. A malformed/partial
    JSON parse is treated as "not ready", not as an error."""
    try:
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        if not content.strip():
            return None
        return json.loads(content)
    except (json.JSONDecodeError, OSError) as e:
        logger.debug("Result file %s not ready yet (%s) — will retry next poll", path, e)
        return None


def check_section_approved(cycle_id: int) -> dict | None:
    """Interim marker Power Automate writes right after Section Manager
    approves (before Division has acted) — lets the local status/banner
    advance without waiting for the whole cycle to finish."""
    path = os.path.join(results_dir(), f"cycle-{cycle_id}-section-approved.json")
    data = _safe_read_json(path)
    if data is not None:
        _mark_processed(path)
    return data


def check_final_outcome(cycle_id: int) -> dict | None:
    """The terminal result — approved (both tiers) or rejected (either
    tier)."""
    path = os.path.join(results_dir(), f"cycle-{cycle_id}-outcome.json")
    data = _safe_read_json(path)
    if data is not None:
        _mark_processed(path)
    return data


def _mark_processed(path: str):
    """Move a handled result file out of results/ so it's never re-read on
    a later poll tick — the equivalent of the idempotency check the
    HTTP-webhook and SharePoint-poller versions did in the database; here
    it's simpler to just make the file physically go away from where the
    poller looks."""
    try:
        dest = os.path.join(processed_dir(), os.path.basename(path))
        shutil.move(path, dest)
    except OSError:
        logger.exception("Failed to move processed result file %s — leaving it in place", path)


def cleanup_test_artifacts(cycle_id: int):
    """Used only by the connection-test script."""
    for folder, pattern in (
        (requests_dir(), f"cycle-{cycle_id}-request.json"),
        (files_dir(), f"cycle-{cycle_id}-*"),
        (results_dir(), f"cycle-{cycle_id}-*"),
        (processed_dir(), f"cycle-{cycle_id}-*"),
    ):
        for p in glob.glob(os.path.join(folder, pattern)):
            os.remove(p)
