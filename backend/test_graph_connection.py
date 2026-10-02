#!/usr/bin/env python3
"""
Standalone Graph API / SharePoint connection test.

Run this AFTER filling in backend/.env (or exporting the same variables)
and BEFORE building the Power Automate flow. It exercises every piece the
backend actually depends on, in order, and stops at the first failure with
a specific, actionable message — so a misconfiguration gets caught in
seconds here instead of showing up as a confusing 502 from the app later,
or worse, silently inside a Power Automate flow you're still building.

Usage:
    cd backend
    pip install -r requirements.txt python-dotenv
    python test_graph_connection.py
"""

import os
import sys

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # fine if python-dotenv isn't installed — just export the vars yourself

import graph_client

EXPECTED_COLUMNS = {
    "Title", "CycleId", "ScheduleKey", "Department", "MonthLabel",
    "SectionManagerEmail", "DivisionManagerEmail", "FileWebUrl", "Status",
    "SectionApproverName", "SectionApprovedAt", "DivisionApproverName",
    "DivisionApprovedAt", "RejectedByRole", "RejectedByName", "RejectedReason",
}

PASS = "✅"
FAIL = "❌"
WARN = "⚠️ "


def step(n, label):
    print(f"\n--- Step {n}: {label} ---")


def fail(msg):
    print(f"{FAIL} {msg}")
    sys.exit(1)


def main():
    step(0, "Checking required environment variables are set")
    required = ["GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        fail(f"Missing: {', '.join(missing)}. Fill these into backend/.env first.")
    if not os.environ.get("SHAREPOINT_SITE_ID") and not (
        os.environ.get("SHAREPOINT_SITE_HOSTNAME") and os.environ.get("SHAREPOINT_SITE_PATH")
    ):
        fail("Set SHAREPOINT_SITE_ID, or both SHAREPOINT_SITE_HOSTNAME and SHAREPOINT_SITE_PATH.")
    print(f"{PASS} All required env vars present.")

    step(1, "Acquiring an access token (client-credentials auth)")
    try:
        token = graph_client._get_access_token()
        print(f"{PASS} Got a token ({len(token)} chars). Tenant/client ID/secret are valid.")
    except Exception as e:
        fail(
            f"Token request failed: {e}\n"
            f"    Most likely cause: wrong GRAPH_TENANT_ID/GRAPH_CLIENT_ID, or the client secret\n"
            f"    is wrong/expired (secrets have an expiry date set at creation — check the Azure portal)."
        )

    step(2, "Resolving the SharePoint site")
    try:
        site_id = graph_client.resolve_site_id()
        print(f"{PASS} Site resolved: {site_id}")
    except Exception as e:
        fail(
            f"Site resolution failed: {e}\n"
            f"    If using SHAREPOINT_SITE_HOSTNAME + SHAREPOINT_SITE_PATH: double-check the\n"
            f"    hostname has no https:// prefix, and the path starts with /sites/... and matches\n"
            f"    exactly what's in the site's URL.\n"
            f"    A 403 here usually means the app registration's Sites.ReadWrite.All permission\n"
            f"    was added but never admin-consented (see guide Part 4, step 4.4)."
        )

    step(3, "Finding the document library")
    try:
        drive_id = graph_client._resolve_drive_id(site_id)
        print(f"{PASS} Drive '{graph_client.DRIVE_NAME}' found: {drive_id}")
    except Exception as e:
        fail(
            f"{e}\n"
            f"    Check SHAREPOINT_DRIVE_NAME matches the document library's exact display name\n"
            f"    (default 'Documents' — check what it's actually called on your site, it's\n"
            f"    sometimes renamed, e.g. 'Shared Documents')."
        )

    step(4, "Finding the 'Schedule Approvals' list")
    try:
        list_id = graph_client._resolve_list_id(site_id)
        print(f"{PASS} List '{graph_client.LIST_NAME}' found: {list_id}")
    except Exception as e:
        fail(f"{e}\n    Create the list first — see guide Part 3.")

    step(5, "Checking the list's columns match what the backend expects")
    columns = graph_client.get_list_columns(site_id)
    found_names = {c["displayName"] for c in columns}
    missing_cols = EXPECTED_COLUMNS - found_names
    print("Columns found on the list:")
    for c in columns:
        internal_note = "" if c["displayName"] == c["name"] else f"  (internal name: {c['name']})"
        print(f"    - {c['displayName']}{internal_note}")

    renamed = [c for c in columns if c["displayName"] != c["name"] and c["displayName"] in EXPECTED_COLUMNS]
    if renamed:
        print(f"\n{WARN}Some columns have an internal name different from their display name:")
        for c in renamed:
            print(f"    '{c['displayName']}' -> internal name is actually '{c['name']}'")
        print("    approvals.py and the Power Automate flow both need to use the INTERNAL name")
        print("    when writing fields (Update item's dynamic-content picker shows display names,")
        print("    so this mismatch is usually invisible until something silently doesn't save).")

    if missing_cols:
        print(f"\n{FAIL} Missing columns: {', '.join(sorted(missing_cols))}")
        print("    Add these to the list — see guide Part 3 for the exact type of each.")
        sys.exit(1)
    else:
        print(f"\n{PASS} All expected columns present.")

    step(6, "Test upload: pushing a small file to the document library")
    test_bytes = b"connection test - safe to delete"
    try:
        item = graph_client.upload_file("_connection_test.txt", test_bytes)
        print(f"{PASS} Uploaded: {item.get('webUrl')}")
        graph_client.delete_drive_item(item["id"])
        print(f"{PASS} Cleaned up (deleted the test file).")
    except Exception as e:
        fail(f"Upload failed: {e}\n    Check the app has write access to this document library.")

    step(7, "Test list item: creating and reading back a row")
    try:
        item_id = graph_client.create_list_item({
            "Title": "connection test — safe to delete",
            "CycleId": -1,
            "ScheduleKey": "connection-test",
            "Status": "Pending Section",
        })
        fields = graph_client.get_list_item_fields(item_id)
        assert fields.get("ScheduleKey") == "connection-test", (
            f"Wrote 'connection-test' but read back {fields.get('ScheduleKey')!r} — "
            f"check ScheduleKey's internal name (see step 5 output above)."
        )
        print(f"{PASS} Created item {item_id} and read the expected value back.")
        graph_client.delete_list_item(item_id)
        print(f"{PASS} Cleaned up (deleted the test item).")
    except AssertionError as e:
        fail(str(e))
    except Exception as e:
        fail(f"List item create/read failed: {e}")

    print(f"\n{PASS} {PASS} {PASS}  All checks passed — the backend can reach SharePoint correctly.")
    print("Next: build the Power Automate flow (guide Part 8), then run a real end-to-end")
    print("submit from the app and confirm the flow's trigger actually fires.")


if __name__ == "__main__":
    main()
