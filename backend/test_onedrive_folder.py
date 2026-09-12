#!/usr/bin/env python3
"""
Standalone check for the OneDrive-folder approval transport. Unlike the
old Graph API version of this script, everything here is genuinely
testable without any external service — it's plain filesystem I/O — so
this actually exercises the full write/read/cleanup path for real, not
against a mock.

What this does NOT verify: that the folder you point at is actually
inside a working OneDrive sync, and that Power Automate can see files
placed there. That part needs the manual check in docs/ONEDRIVE_SETUP.md
Part 4 (drop a file in Windows Explorer, confirm it shows up on
onedrive.com within a minute or two).

Usage:
    cd backend
    pip install -r requirements.txt
    export ONEDRIVE_APPROVALS_ROOT="/path/inside/your/OneDrive/Approvals"
    python test_onedrive_folder.py
"""

import os
import sys
import json
import time

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import onedrive_folder as folder

PASS = "✅"
FAIL = "❌"


def step(n, label):
    print(f"\n--- Step {n}: {label} ---")


def fail(msg):
    print(f"{FAIL} {msg}")
    sys.exit(1)


def main():
    step(0, "Checking ONEDRIVE_APPROVALS_ROOT is set")
    if not folder.ROOT:
        fail("ONEDRIVE_APPROVALS_ROOT is not set. Fill it into backend/.env first.")
    print(f"{PASS} Set to: {folder.ROOT}")

    step(1, "Checking the path exists and is writable")
    if not os.path.isdir(folder.ROOT):
        fail(
            f"'{folder.ROOT}' doesn't exist as a directory.\n"
            f"    Create it (inside your OneDrive sync folder) and re-run."
        )
    probe = os.path.join(folder.ROOT, ".write_test")
    try:
        with open(probe, "w") as f:
            f.write("x")
        os.remove(probe)
        print(f"{PASS} Directory exists and is writable.")
    except OSError as e:
        fail(f"Can't write to '{folder.ROOT}': {e}")

    step(2, "Creating the requests/ files/ results/ results/processed/ subfolders")
    for d in (folder.requests_dir(), folder.files_dir(), folder.results_dir(), folder.processed_dir()):
        print(f"    {d}")
    print(f"{PASS} Subfolders ready.")

    step(3, "Writing a test request JSON")
    test_cycle_id = 999999999  # never a real cycle id, safe to use and clean up
    req_path = folder.write_request(test_cycle_id, {
        "cycleId": test_cycle_id,
        "scheduleKey": "connection-test",
        "sectionManagerEmail": "test@example.com",
        "divisionManagerEmail": "test@example.com",
    })
    with open(req_path, "r", encoding="utf-8") as f:
        written = json.load(f)
    assert written["scheduleKey"] == "connection-test"
    print(f"{PASS} Wrote and read back: {req_path}")

    step(4, "Simulating Power Automate writing an interim result")
    interim_path = os.path.join(folder.results_dir(), f"cycle-{test_cycle_id}-section-approved.json")
    with open(interim_path, "w", encoding="utf-8") as f:
        json.dump({"sectionApproverName": "Test Approver", "sectionApprovedAt": "2026-01-01T00:00:00Z"}, f)
    result = folder.check_section_approved(test_cycle_id)
    assert result and result["sectionApproverName"] == "Test Approver"
    assert not os.path.exists(interim_path), "should have been moved to processed/"
    print(f"{PASS} Interim result read correctly and moved to processed/.")

    step(5, "Simulating a not-yet-ready (empty) result file")
    outcome_path = os.path.join(folder.results_dir(), f"cycle-{test_cycle_id}-outcome.json")
    with open(outcome_path, "w") as f:
        f.write("")
    result = folder.check_final_outcome(test_cycle_id)
    assert result is None, "empty file should be treated as 'not ready', not an error"
    print(f"{PASS} Empty/placeholder file correctly treated as 'not ready yet'.")

    step(6, "Simulating the real final outcome")
    with open(outcome_path, "w", encoding="utf-8") as f:
        json.dump({"outcome": "approved", "sectionManager": {"name": "A"}, "divisionManager": {"name": "B"}}, f)
    result = folder.check_final_outcome(test_cycle_id)
    assert result and result["outcome"] == "approved"
    print(f"{PASS} Final outcome read correctly.")

    step(7, "Cleaning up test artifacts")
    folder.cleanup_test_artifacts(test_cycle_id)
    remaining = []
    for d in (folder.requests_dir(), folder.files_dir(), folder.results_dir(), folder.processed_dir()):
        remaining += [p for p in os.listdir(d) if f"cycle-{test_cycle_id}" in p]
    assert not remaining, f"leftover test files: {remaining}"
    print(f"{PASS} Clean.")

    print(f"\n{PASS} {PASS} {PASS}  All local checks passed.")
    print("\nThis confirms Python can read/write the folder correctly. It does NOT")
    print("confirm OneDrive is actually syncing it. Next: manually drop a file into")
    print(f"'{folder.requests_dir()}' via Windows Explorer (or wherever this path")
    print("is mounted) and confirm it appears at onedrive.com within a minute or two")
    print("— see docs/ONEDRIVE_SETUP.md Part 4 — before building the Power Automate flow.")


if __name__ == "__main__":
    main()
