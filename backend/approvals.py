"""
Approval-workflow endpoints — OneDrive-synced-folder version.

Power Automate owns the actual 2-tier review, triggered by a request JSON
file appearing in a folder that OneDrive syncs ("When a file is created" —
OneDrive for Business, standard/free connector), using two sequential
"Start and wait for an approval" actions. Instead of writing back to
SharePoint or calling an HTTP endpoint, it writes outcome JSON files into
another synced folder ("Create file" — also standard/free).

Python never receives a callback and never calls out to any API. A
background poller periodically checks each active cycle's expected result
filenames in that folder.
"""

import os
import json
import logging
import asyncio

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

import onedrive_folder as folder
from approvals_db import (
    init_approvals_db, get_active_cycle, get_cycle, latest_cycle_for_schedule,
    list_active_cycles, create_cycle, delete_cycle, touch_poll,
    advance_to_pending_division, mark_approved, mark_rejected, ACTIVE_STATUSES,
)
from excel_export import build_workbook, inject_approval_signatures, SignatureLayout

logger = logging.getLogger("approvals")

router = APIRouter()

EXPORTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "exports")
APPROVED_DIR = os.path.join(EXPORTS_DIR, "approved")
os.makedirs(APPROVED_DIR, exist_ok=True)

POLL_INTERVAL_SECONDS = int(os.environ.get("APPROVAL_POLL_INTERVAL_SECONDS", "60"))

init_approvals_db()


def _storage_get_json(key: str):
    """Reuse the existing generic storage table from app.py's schema."""
    import sqlite3
    from app import DB_PATH
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute("SELECT value FROM storage WHERE key = ?", (key,)).fetchone()
    if not row:
        return None
    return json.loads(row[0])


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SubmitRequest(_CamelModel):
    section_manager_email: str
    division_manager_email: str
    created_by: str | None = None


# ---------------------------------------------------------------- submit --

@router.post("/api/schedules/{schedule_key}/submit")
def submit_for_approval(schedule_key: str, body: SubmitRequest):
    if get_active_cycle(schedule_key):
        raise HTTPException(409, "This schedule already has an approval in progress.")

    state = _storage_get_json(schedule_key)
    if not state:
        raise HTTPException(404, f"No saved schedule found for {schedule_key}")
    holidays = _storage_get_json("holidays-v1") or []

    wb, layout = build_workbook(state, holidays)
    safe_key = schedule_key.replace(":", "-")
    pending_filename = f"{safe_key}-pending.xlsx"

    # Create the local DB row first — cycle_id becomes the correlation key
    # embedded directly in every filename from here on, so nothing external
    # needs to be created or looked up before we can name the files.
    #
    # pending_file_path is filled in properly below (it depends on
    # ONEDRIVE_APPROVALS_ROOT); create_cycle requires a value, so this
    # two-step dance (insert, then write files, then nothing else to
    # update — the path was already correct) mirrors the excel_export
    # layout, which likewise has to exist before the row can be created.
    if not folder.is_configured():
        raise HTTPException(
            502,
            "ONEDRIVE_APPROVALS_ROOT is not set or doesn't exist — point it at a folder "
            "inside your OneDrive sync tree (see docs/ONEDRIVE_SETUP.md) and restart the backend.",
        )

    cycle_id = create_cycle(
        schedule_key=schedule_key,
        pending_file_path="",  # filled in immediately below
        layout=layout,
        section_manager_email=body.section_manager_email,
        division_manager_email=body.division_manager_email,
        created_by=body.created_by,
    )

    try:
        pending_path = folder.write_pending_workbook(pending_filename, wb)
        # Update the row with the real path now that we know it — cheaper
        # than threading the path through create_cycle before it exists.
        from approvals_db import get_conn
        with get_conn() as conn:
            conn.execute("UPDATE approval_cycles SET pending_file_path = ? WHERE id = ?",
                         (pending_path, cycle_id))
            conn.commit()

        folder.write_request(cycle_id, {
            "cycleId": cycle_id,
            "scheduleKey": schedule_key,
            "department": state.get("department", ""),
            "monthLabel": f"{state['month']:02d}/{state['yearBE']}",
            "sectionManagerEmail": body.section_manager_email,
            "divisionManagerEmail": body.division_manager_email,
            "pendingFileName": pending_filename,
        })
    except Exception as e:
        logger.exception("Failed to write approval-request files for cycle %s", cycle_id)
        delete_cycle(cycle_id)  # nothing durable was written — safe to fully roll back
        raise HTTPException(
            502, f"ส่งเพื่ออนุมัติไม่สำเร็จ (เขียนไฟล์ไม่ได้: {e}) — ตารางยังไม่ถูกล็อก ลองส่งใหม่อีกครั้งได้เลย",
        )

    return {"cycleId": cycle_id, "status": "pending_section"}


# ------------------------------------------------------------- poller -----

def _process_cycle(cycle):
    """Checks one active cycle's expected result files. Order matters: the
    interim marker only makes sense to act on while still pending_section;
    the final outcome can arrive at any active state (a fast approver pair
    could clear both tiers between two poll ticks, so we might see the
    final outcome having never observed the interim one — that's fine,
    mark_approved doesn't depend on advance_to_pending_division having run
    first)."""
    touch_poll(cycle["id"])

    if cycle["status"] == "pending_section":
        interim = folder.check_section_approved(cycle["id"])
        if interim:
            advance_to_pending_division(
                cycle["id"],
                section_name=interim.get("sectionApproverName") or "unknown",
                section_approved_at=interim.get("sectionApprovedAt"),
            )
            logger.info("Cycle %s advanced to pending_division", cycle["id"])

    outcome = folder.check_final_outcome(cycle["id"])
    if not outcome:
        return

    if outcome.get("outcome") == "rejected":
        role = "division" if outcome.get("rejectedStage") == "division" else "section"
        approver_name = (
            outcome.get("divisionManager", {}).get("name") if role == "division"
            else outcome.get("sectionManager", {}).get("name")
        ) or "unknown"
        mark_rejected(
            cycle["id"], role=role, name=approver_name, reason=outcome.get("rejectedReason"),
        )
        logger.info("Cycle %s rejected at %s stage", cycle["id"], role)

    elif outcome.get("outcome") == "approved":
        section = outcome.get("sectionManager", {})
        division = outcome.get("divisionManager", {})
        # sig_cert_row is nullable — a cycle submitted before this feature
        # existed (still pending when this code was deployed) won't have
        # it set. Fall back to "the row right after the date row", which
        # is where a freshly-generated workbook would have put it — but
        # note an *older* physical .xlsx from before this feature has no
        # row reserved/merged there, so the cert line lands in a plain
        # unmerged cell for that edge case (functional, just less
        # polished than the merged version new cycles get).
        cert_row = cycle["sig_cert_row"] or (cycle["sig_date_row"] + 1)
        layout = SignatureLayout(
            sig_line_row=cycle["sig_line_row"], sig_label_row=cycle["sig_label_row"],
            sig_date_row=cycle["sig_date_row"], sig_cert_row=cert_row,
            block1_start=cycle["block1_start"], block2_start=cycle["block2_start"], block_width=4,
        )
        section_approval_id = section.get("approvalId")
        division_approval_id = division.get("approvalId")
        wb = inject_approval_signatures(
            cycle["pending_file_path"], layout,
            section.get("name") or "unknown", section.get("respondedAt"),
            division.get("name") or "unknown", division.get("respondedAt"),
            section_approval_id=section_approval_id,
            division_approval_id=division_approval_id,
        )
        safe_key = cycle["schedule_key"].replace(":", "-")
        approved_filename = f"{safe_key}-cycle{cycle['cycle_number']}-approved.xlsx"
        approved_path = os.path.join(APPROVED_DIR, approved_filename)
        wb.save(approved_path)

        # Final handoff — no smtplib anywhere in this backend. Writing the
        # signed file into ready_for_hr/ is the entire handoff; a second,
        # separate Power Automate flow triggers on this folder and emails
        # it via the standard 'Send an email (V2)' action.
        try:
            folder.write_ready_for_hr(approved_filename, wb)
        except Exception:
            # Don't let a OneDrive-folder write failure undo an otherwise
            # successful approval — the signed file already exists locally
            # and is downloadable from the app; HR handoff can be retried
            # by re-running this write manually if needed. Log loudly
            # rather than silently losing the handoff, though.
            logger.exception(
                "Cycle %s approved and signed locally, but failed to write "
                "to ready_for_hr/ for the HR-email handoff", cycle["id"]
            )

        mark_approved(
            cycle["id"],
            section_name=section.get("name") or "unknown", section_approved_at=section.get("respondedAt"),
            division_name=division.get("name") or "unknown", division_approved_at=division.get("respondedAt"),
            section_approval_id=section_approval_id, division_approval_id=division_approval_id,
            approved_file_path=approved_path,
        )
        logger.info("Cycle %s fully approved, injected -> %s", cycle["id"], approved_path)
    else:
        logger.warning("Cycle %s: outcome file had unrecognized outcome=%r", cycle["id"], outcome.get("outcome"))


def poll_once() -> list[dict]:
    results = []
    for cycle in list_active_cycles():
        try:
            _process_cycle(cycle)
            results.append({"cycleId": cycle["id"]})
        except Exception:
            logger.exception("Failed polling cycle %s", cycle["id"])
            results.append({"cycleId": cycle["id"], "error": True})
    return results


async def poll_loop():
    while True:
        try:
            await asyncio.to_thread(poll_once)
        except Exception:
            logger.exception("Approval poll loop iteration failed")
        await asyncio.sleep(POLL_INTERVAL_SECONDS)


@router.post("/api/admin/poll-approvals-now")
def poll_approvals_now():
    """Manual trigger for testing, and for a 'refresh status' button in the
    UI so a user doesn't have to wait up to POLL_INTERVAL_SECONDS."""
    return {"results": poll_once()}


# ------------------------------------------------------- supporting reads -

@router.get("/api/schedules/{schedule_key}/approval-status")
def approval_status(schedule_key: str):
    cycle = latest_cycle_for_schedule(schedule_key)
    if not cycle:
        return {"status": "none"}
    return {
        "cycleId": cycle["id"],
        "cycleNumber": cycle["cycle_number"],
        "status": cycle["status"],
        "sectionManagerEmail": cycle["section_manager_email"],
        "divisionManagerEmail": cycle["division_manager_email"],
        "sectionApproverName": cycle["section_approver_name"],
        "sectionApprovedAt": cycle["section_approved_at"],
        "divisionApproverName": cycle["division_approver_name"],
        "divisionApprovedAt": cycle["division_approved_at"],
        "sectionApprovalId": cycle["section_approval_id"],
        "divisionApprovalId": cycle["division_approval_id"],
        "rejectedByRole": cycle["rejected_by_role"],
        "rejectedByName": cycle["rejected_by_name"],
        "rejectedReason": cycle["rejected_reason"],
        "rejectedAt": cycle["rejected_at"],
    }


@router.get("/api/schedules/{schedule_key}/approved-file")
def get_approved_file(schedule_key: str):
    cycle = latest_cycle_for_schedule(schedule_key)
    if not cycle or cycle["status"] != "approved" or not cycle["approved_file_path"]:
        raise HTTPException(404, "No approved file for this schedule")
    return FileResponse(
        cycle["approved_file_path"],
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=os.path.basename(cycle["approved_file_path"]),
    )
