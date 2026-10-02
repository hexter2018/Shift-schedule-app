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
    approved/   <- Python writes the final, fully-signed .xlsx here once a
                   cycle completes — the permanent archive copy, inside
                   OneDrive rather than only on local disk so it's backed
                   up and reachable from OneDrive.com/mobile too, the same
                   as everything else this module writes.
    ready_for_hr/ <- A copy of the same file, dropped here purely to
                   trigger the second ("Email Signed Schedule to HR")
                   flow — approved/ is the permanent record, this one is
                   just the hand-off signal for that flow to react to.

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
def approved_dir() -> str: return _sub("approved")


def is_configured() -> bool:
    return bool(ROOT) and os.path.isdir(ROOT)


def atomic_save_workbook(wb, path: str):
    """Write-then-rename instead of wb.save(path) directly — same reasoning
    as _atomic_write_json below, but this one matters more: an .xlsx can
    take a real, measurable fraction of a second to write (more for a
    full month's roster plus embedded signature images), which is a much
    wider window for a reader — OneDrive's own sync uploader, the Power
    Automate flow's re-fetch, or a person double-clicking the file in
    ready_for_hr/ — to catch it mid-write and see a truncated ZIP archive,
    which Excel reports as "corrupt or using a file format that's not
    supported." A temp file in the same directory, renamed only once
    openpyxl has fully finished writing it, means every reader sees either
    the previous complete file or the new complete one — never a partial
    one, since os.replace is atomic on the same filesystem."""
    tmp_path = path + ".tmp"
    wb.save(tmp_path)
    os.replace(tmp_path, path)


def write_pending_workbook(filename: str, wb) -> str:
    """Saves the openpyxl Workbook directly into the synced files/ folder.
    This *is* the upload — no separate API call needed, OneDrive picks up
    the write on its own."""
    path = os.path.join(files_dir(), filename)
    atomic_save_workbook(wb, path)
    return path


def write_ready_for_hr(source_path: str, filename: str) -> str:
    """Final handoff step, once a cycle is fully approved and signatures
    are injected: copy the already-saved, already-signed workbook into
    ready_for_hr/. Python's involvement ends here — a second, separate
    Power Automate flow triggers on this folder and sends the email via
    'Send an email (V2)' (standard Outlook connector). Deliberately no
    smtplib/SMTP credentials anywhere in this backend — the write itself
    is the entire handoff.

    Takes a source *file path* to copy, not an openpyxl Workbook object —
    this used to take `wb` and call wb.save() a second time here (having
    already been saved once to the approved/ path just before this call).
    That crashed in production with `ValueError: I/O operation on closed
    file` inside PIL — openpyxl embeds each signature image by opening it
    via PIL, and the underlying file handle gets closed after the first
    .save() consumes it, so a second .save() on the same Workbook object
    blows up trying to re-read it. A plain byte-for-byte file copy has
    none of that risk — it never touches openpyxl or PIL at all."""
    path = os.path.join(ready_for_hr_dir(), filename)
    tmp_path = path + ".tmp"
    shutil.copy2(source_path, tmp_path)
    os.replace(tmp_path, path)
    return path


def write_request(cycle_id: int, payload: dict) -> str:
    """The request JSON is what the flow's trigger actually reacts to.
    Written last (after the workbook), so the flow never sees a request
    referencing a file that hasn't finished being written yet."""
    path = os.path.join(requests_dir(), f"cycle-{cycle_id}-request.json")
    _atomic_write_json(path, payload)
    return path


def write_section_signed_marker(cycle_id: int) -> str:
    """Written once inject_section_signature has actually been embedded
    and saved — the flow polls for this (small, fast-to-sync JSON) instead
    of guessing how long that takes with a fixed Delay. A fixed Delay has
    to be longer than the *worst* case (poll interval + embed + save +
    OneDrive upload sync, not the typical case) or it fires too early and
    the Division Manager's copy re-fetches before the signature exists;
    POLL_INTERVAL_SECONDS alone defaults to 60s, well past what a 30s
    Delay covers. Polling for this marker instead means the flow waits
    exactly as long as each real run actually takes, not a fixed guess."""
    path = os.path.join(results_dir(), f"cycle-{cycle_id}-section-signed.json")
    _atomic_write_json(path, {"signed": True})
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
