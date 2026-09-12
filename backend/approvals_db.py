"""
Approval-cycle tracking. Power Automate owns the actual 2-tier review
(sequential "Start and wait for an approval" actions, triggered by a file
appearing in a OneDrive-synced folder); this table just needs to (a) not
double-submit a schedule that's already mid-review, and (b) know exactly
where in the workbook to inject signatures later, since that position
shifts month to month depending on employee count and holidays.

No external item-id to correlate against this time — cycle_id itself is
the correlation key, embedded directly in the request/result JSON
filenames (see onedrive_folder.py).
"""

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shift_schedule.db")

ACTIVE_STATUSES = ("pending_section", "pending_division")
TERMINAL_STATUSES = ("approved", "rejected")

# Columns that only existed in earlier iterations of this table (HTTP
# webhook design had `webhook_secret NOT NULL`; the SharePoint/Graph
# design had `sp_item_id`, `sp_last_status`, `pa_run_id`). If any of these
# show up on an existing on-disk table, it predates the current schema.
_OBSOLETE_COLUMNS = {"webhook_secret", "sp_item_id", "sp_last_status", "pa_run_id"}


def _migrate_if_stale(conn):
    """CREATE TABLE IF NOT EXISTS is a no-op against a table that already
    exists — it never applies schema changes to an existing database file.
    Across three redesigns of the approval workflow, approval_cycles'
    columns changed each time; anyone whose shift_schedule.db was created
    under an older design keeps those old columns forever, including
    NOT NULL ones the current code never populates (e.g. webhook_secret) —
    which crashes the very first insert with an IntegrityError instead of
    a clear error message. Detect that and rename the stale table out of
    the way (never delete — old cycle history stays recoverable) so a
    fresh, correctly-shaped table gets created right after this runs."""
    existing = {row[1] for row in conn.execute("PRAGMA table_info(approval_cycles)").fetchall()}
    if not existing or not (existing & _OBSOLETE_COLUMNS):
        return  # table doesn't exist yet, or already matches the current schema
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    legacy_name = f"approval_cycles_legacy_{stamp}"
    conn.execute(f"ALTER TABLE approval_cycles RENAME TO {legacy_name}")
    import logging
    logging.getLogger("approvals_db").warning(
        "approval_cycles had an outdated schema (found obsolete column(s): %s) "
        "— renamed the old table to %r and creating a fresh one. Old cycle "
        "history is preserved there, not lost, but won't show up in the app "
        "(it wasn't fully created under the old design anyway, given this crash).",
        existing & _OBSOLETE_COLUMNS, legacy_name,
    )


def _ensure_columns(conn, table: str, columns: dict):
    """Additive schema evolution — different from _migrate_if_stale above.
    That one handles a column becoming genuinely incompatible (an old
    NOT NULL the current code never populates). This one handles the far
    more common case: a *new*, nullable column being added going forward.
    SQLite's ALTER TABLE ADD COLUMN is safe and simple for that — no
    rename, no data loss, existing rows just get NULL for the new column.
    Policy from here on: new columns are always added nullable, specifically
    so this path (not a rename) is always sufficient — NOT NULL constraints
    on new columns are what caused the original webhook_secret crash."""
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    for col, decl in columns.items():
        if col not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")


def init_approvals_db():
    with sqlite3.connect(DB_PATH) as conn:
        _migrate_if_stale(conn)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS approval_cycles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                schedule_key TEXT NOT NULL,
                cycle_number INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending_section',

                pending_file_path TEXT NOT NULL,
                approved_file_path TEXT,

                -- layout recorded at generation time; see excel_export.SignatureLayout
                sig_line_row INTEGER NOT NULL,
                sig_label_row INTEGER NOT NULL,
                sig_date_row INTEGER NOT NULL,
                sig_cert_row INTEGER,
                block1_start INTEGER NOT NULL,
                block2_start INTEGER NOT NULL,

                section_manager_email TEXT NOT NULL,
                division_manager_email TEXT NOT NULL,
                section_approver_name TEXT,
                section_approved_at TEXT,
                division_approver_name TEXT,
                division_approved_at TEXT,
                section_approval_id TEXT,
                division_approval_id TEXT,

                rejected_by_role TEXT,
                rejected_by_name TEXT,
                rejected_reason TEXT,
                rejected_at TEXT,

                last_polled_at TEXT,

                created_by TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        # Additive migration for databases created before the cert-ID /
        # audit-trail feature existed — see _ensure_columns' docstring for
        # why this is safe (nullable ADD COLUMN, no rename needed).
        _ensure_columns(conn, "approval_cycles", {
            "sig_cert_row": "INTEGER",
            "section_approval_id": "TEXT",
            "division_approval_id": "TEXT",
        })
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_approval_cycles_schedule_key
            ON approval_cycles(schedule_key)
        """)
        # Audit log — append-only, never updated. Separate from the mutable
        # cycle row above so "who did what, when" survives even if the
        # cycle row itself gets superseded by a later resubmission.
        conn.execute("""
            CREATE TABLE IF NOT EXISTS approval_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cycle_id INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                actor_name TEXT,
                actor_role TEXT,
                detail TEXT,
                created_at TEXT NOT NULL
            )
        """)
        conn.commit()


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


def get_active_cycle(schedule_key: str) -> sqlite3.Row | None:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM approval_cycles WHERE schedule_key = ? AND status IN (?, ?) "
            "ORDER BY id DESC LIMIT 1",
            (schedule_key, *ACTIVE_STATUSES),
        ).fetchone()


def get_cycle(cycle_id: int) -> sqlite3.Row | None:
    with get_conn() as conn:
        return conn.execute("SELECT * FROM approval_cycles WHERE id = ?", (cycle_id,)).fetchone()


def latest_cycle_for_schedule(schedule_key: str) -> sqlite3.Row | None:
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM approval_cycles WHERE schedule_key = ? ORDER BY id DESC LIMIT 1",
            (schedule_key,),
        ).fetchone()


def list_active_cycles() -> list[sqlite3.Row]:
    """What the poller iterates every tick — every cycle still awaiting an
    outcome, across all schedules."""
    with get_conn() as conn:
        return conn.execute(
            "SELECT * FROM approval_cycles WHERE status IN (?, ?)", ACTIVE_STATUSES,
        ).fetchall()


def create_cycle(*, schedule_key, pending_file_path, layout, section_manager_email,
                  division_manager_email, created_by) -> int:
    with get_conn() as conn:
        prev = conn.execute(
            "SELECT MAX(cycle_number) AS n FROM approval_cycles WHERE schedule_key = ?",
            (schedule_key,),
        ).fetchone()
        cycle_number = (prev["n"] or 0) + 1
        now = _now()
        cur = conn.execute("""
            INSERT INTO approval_cycles (
                schedule_key, cycle_number, status, pending_file_path,
                sig_line_row, sig_label_row, sig_date_row, sig_cert_row, block1_start, block2_start,
                section_manager_email, division_manager_email,
                created_by, created_at, updated_at
            ) VALUES (?, ?, 'pending_section', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            schedule_key, cycle_number, pending_file_path,
            layout.sig_line_row, layout.sig_label_row, layout.sig_date_row, layout.sig_cert_row,
            layout.block1_start, layout.block2_start,
            section_manager_email, division_manager_email,
            created_by, now, now,
        ))
        cycle_id = cur.lastrowid
        conn.execute(
            "INSERT INTO approval_events (cycle_id, event_type, actor_name, detail, created_at) "
            "VALUES (?, 'submitted', ?, ?, ?)",
            (cycle_id, created_by, f"cycle {cycle_number} for {schedule_key}", now),
        )
        conn.commit()
        return cycle_id


def delete_cycle(cycle_id: int):
    """Hard delete — used only to roll back a cycle row created locally
    right before writing to the OneDrive folder fails (e.g. the folder
    isn't configured, or a disk/permissions error). Nothing was ever
    written anywhere else in that case, so there's nothing to reconcile;
    leaving the row behind would otherwise permanently block resubmission."""
    with get_conn() as conn:
        conn.execute("DELETE FROM approval_events WHERE cycle_id = ?", (cycle_id,))
        conn.execute("DELETE FROM approval_cycles WHERE id = ?", (cycle_id,))
        conn.commit()


def touch_poll(cycle_id: int):
    with get_conn() as conn:
        conn.execute("UPDATE approval_cycles SET last_polled_at = ? WHERE id = ?", (_now(), cycle_id))
        conn.commit()


def advance_to_pending_division(cycle_id: int, *, section_name, section_approved_at):
    """Called when the poller sees the interim 'section approved' marker
    file — without this, the local row (and the frontend's status banner)
    would stay stuck on 'pending_section' until the *whole* cycle finishes."""
    with get_conn() as conn:
        now = _now()
        cur = conn.execute("""
            UPDATE approval_cycles SET
                status = 'pending_division',
                section_approver_name = ?, section_approved_at = ?,
                updated_at = ?
            WHERE id = ? AND status = 'pending_section'
        """, (section_name, section_approved_at, now, cycle_id))
        if cur.rowcount:
            conn.execute(
                "INSERT INTO approval_events (cycle_id, event_type, actor_name, detail, created_at) "
                "VALUES (?, 'section_approved', ?, ?, ?)",
                (cycle_id, section_name, "advanced to pending_division", now),
            )
        conn.commit()


def mark_approved(cycle_id: int, *, section_name, section_approved_at,
                   division_name, division_approved_at, approved_file_path,
                   section_approval_id=None, division_approval_id=None):
    with get_conn() as conn:
        now = _now()
        conn.execute("""
            UPDATE approval_cycles SET
                status = 'approved',
                section_approver_name = ?, section_approved_at = ?,
                division_approver_name = ?, division_approved_at = ?,
                section_approval_id = ?, division_approval_id = ?,
                approved_file_path = ?, updated_at = ?
            WHERE id = ?
        """, (section_name, section_approved_at, division_name, division_approved_at,
              section_approval_id, division_approval_id,
              approved_file_path, now, cycle_id))
        conn.execute(
            "INSERT INTO approval_events (cycle_id, event_type, actor_name, detail, created_at) "
            "VALUES (?, 'fully_approved', ?, ?, ?)",
            (cycle_id, division_name, f"section={section_name}", now),
        )
        conn.commit()


def mark_rejected(cycle_id: int, *, role, name, reason):
    with get_conn() as conn:
        now = _now()
        conn.execute("""
            UPDATE approval_cycles SET
                status = 'rejected',
                rejected_by_role = ?, rejected_by_name = ?, rejected_reason = ?, rejected_at = ?,
                updated_at = ?
            WHERE id = ?
        """, (role, name, reason, now, now, cycle_id))
        conn.execute(
            "INSERT INTO approval_events (cycle_id, event_type, actor_name, actor_role, detail, created_at) "
            "VALUES (?, 'rejected', ?, ?, ?, ?)",
            (cycle_id, name, role, reason or "", now),
        )
        conn.commit()
