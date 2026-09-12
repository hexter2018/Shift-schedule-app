# OneDrive Folder Setup Guide — Schedule Approval Workflow

No Azure AD app registration, no admin consent, no Premium connectors.
Python writes into a folder that OneDrive syncs on its own (already signed
in as you); Power Automate reacts to files appearing there and writes its
answer back the same way. If you previously looked at
`docs/archive/SHAREPOINT_SETUP_premium_graph_approach.md`, that approach is
archived, not deleted — worth revisiting if IT ever grants Azure AD access,
since it avoids the "backend must run on your signed-in PC" constraint
below.

**Who needs to do what:** All of this — every part — you can do yourself
with a standard OneDrive account and Power Automate access. No IT ticket
required.

**The one real constraint:** the backend process needs to run on a machine
where OneDrive is actively signed in and syncing the target folder —
realistically, your own PC. This is fine for how you're running the app
today; worth remembering if this ever needs to move to a real server later.

**Time estimate:** 20–30 minutes.

---

## Part 1 — Create the OneDrive folder

1. In File Explorer (Windows) or Finder (Mac), go to your OneDrive folder
   — usually `C:\Users\<you>\OneDrive - <CompanyName>\` on a work account.
2. Create a folder there, e.g. `ScheduleApprovals`.
3. Confirm it's actually syncing: right-click it → check for the green
   checkmark / cloud-sync icon (not a red "x" or a plain folder icon,
   which would mean it's outside the synced tree or sync is paused).
4. Copy its full path — this is `ONEDRIVE_APPROVALS_ROOT`.

You don't need to manually create the `requests/`, `files/`, `results/`
subfolders — the backend creates those automatically the first time it
runs (see `onedrive_folder.py`'s `_sub()`), and creating them via Python
means they show up in OneDrive's sync the same as any other file write.

## Part 2 — Configure the backend

1. `cd backend`, copy `.env.example` to `.env`.
2. Set `ONEDRIVE_APPROVALS_ROOT` to the path from Part 1. On Windows, use
   the path as-is (backslashes are fine — Python's `os.path.join` handles
   it) or switch to forward slashes, either works.
3. `pip install -r requirements.txt`

## Part 3 — Run the connection test

```bash
cd backend
python test_onedrive_folder.py
```

This writes, reads, and cleans up test files in each subfolder — a real
filesystem round-trip, not a mock — and specifically exercises the "empty
placeholder file" case that OneDrive's Files-On-Demand can briefly produce,
confirming the poller won't choke on it. It does **not** confirm OneDrive
is actually syncing anything to the cloud — that's Part 4, and it's a
manual check because there's no API-free way for Python to confirm it
from this end.

Fix whatever it reports and re-run until you see:
```
✅ ✅ ✅  All local checks passed.
```

## Part 4 — Confirm OneDrive is actually syncing the folder

This is the one step that can't be automated — a quick manual check that
the folder you pointed the backend at is really syncing, not just a local
folder that happens to be inside a path that looks right.

1. Create a test file inside the `requests` subfolder (e.g. drag any
   `.txt` file in via File Explorer).
2. Open `https://onedrive.com` in a browser, sign in, navigate to
   `ScheduleApprovals/requests/`.
3. Confirm the test file shows up there within a minute or two.
4. Delete it (both locally and, if it doesn't auto-remove, on the web).

If it doesn't show up: check the OneDrive taskbar icon for a sync-paused
warning, check available storage quota, or check whether your
organization's OneDrive policy excludes this particular folder from sync
(some orgs restrict sync to only certain folder names/locations — ask your
IT admin if this specific check fails, since it's a policy question, not
a permissions one, and doesn't need the app-registration approval that
blocked the Graph API approach).

## Part 5 — Build the Power Automate flow

Every action below is a standard, included-with-Office-365 connector —
OneDrive for Business and Approvals. No "HTTP" action, no premium trigger.

1. Go to `https://make.powerautomate.com` → **Create** → **Automated
   cloud flow**.
2. Trigger: search **"When a file is created"** (OneDrive for Business).
   **Folder**: browse to `ScheduleApprovals/requests` (use the folder
   picker — pick the actual synced folder, not a typed-in path). This
   folder should contain *only* request JSON files, which is why
   `onedrive_folder.py` keeps it separate from the workbook and results
   folders — the trigger fires on anything landing here, so keeping it
   single-purpose means it never fires on the wrong kind of file.
3. **+ New step** → **"Get file content"** (OneDrive for Business).
   **File**: use the trigger's dynamic content (`File Identifier` /
   `Id`) to reference the file that was just created.
4. **+ New step** → **"Parse JSON"** (built-in action, not a connector —
   always free). **Content** = the file content from step 3 (you'll need
   a "Compose" step first to base64-decode it if "Get file content"
   returns binary — check what format your trigger actually gives you;
   if it's already text, skip straight to Parse JSON). **Schema**: click
   "Generate from sample" and paste:
   ```json
   {
     "cycleId": 1,
     "scheduleKey": "schedule:2569-09",
     "department": "...",
     "monthLabel": "09/2569",
     "sectionManagerEmail": "a@example.com",
     "divisionManagerEmail": "b@example.com",
     "pendingFileName": "schedule-2569-09-pending.xlsx"
   }
   ```
5. **+ New step** → **"Get file content using path"** (OneDrive for
   Business). **File path**: build as
   `/ScheduleApprovals/files/` + the parsed `pendingFileName` — this
   fetches the actual workbook to attach to the approval.
6. **+ New step** → **"Start and wait for an approval"** (Approvals
   connector). **Approval type**: "Approve/Reject – First to respond".
   **Assigned to**: parsed `sectionManagerEmail`. **Title**: parsed
   `department` + `monthLabel`. Attach the file from step 5.
7. **+ New step** → **Condition**. Compare the approval's **Outcome** to
   `Approve`.

   **Yes branch (Section approved):**
   1. **"Get user profile (V2)"** (Office 365 Users connector),
      **User (UPN)** = the approval step's **Responder**.
   2. **"Create file"** (OneDrive for Business). **Folder Path**:
      `/ScheduleApprovals/results`. **File Name**:
      `cycle-` + parsed `cycleId` + `-section-approved.json`.
      **File Content** (built via "Compose" with this JSON structure, or
      typed directly with dynamic-content tokens inserted):
      ```json
      {
        "sectionApproverName": "<display name from Get user profile>",
        "sectionApprovedAt": "<approval step's completion time>"
      }
      ```
   3. **"Start and wait for an approval"** again, **Assigned to** =
      parsed `divisionManagerEmail`.
   4. **Condition** on this second approval's outcome:
      - **Approve** → **"Get user profile (V2)"** for the division
        approver, then **"Create file"**: same folder, filename
        `cycle-` + `cycleId` + `-outcome.json`, content:
        ```json
        {
          "outcome": "approved",
          "sectionManager": {"name": "<from step above>", "respondedAt": "<...>"},
          "divisionManager": {"name": "<...>", "respondedAt": "<...>"}
        }
        ```
      - **Reject** → **"Create file"**: same `-outcome.json` filename,
        content:
        ```json
        {
          "outcome": "rejected",
          "rejectedStage": "division",
          "divisionManager": {"name": "<from Get user profile>"},
          "rejectedReason": "<approval step's response comments>"
        }
        ```

   **No branch (Section rejected):**
   1. **"Get user profile (V2)"** for the section approver.
   2. **"Create file"**: `cycle-` + `cycleId` + `-outcome.json`:
      ```json
      {
        "outcome": "rejected",
        "rejectedStage": "section",
        "sectionManager": {"name": "<from Get user profile>"},
        "rejectedReason": "<response comments>"
      }
      ```

8. Save. No callback step, no HTTP action anywhere — the flow's job ends
   at the last "Create file". The backend's poller
   (`APPROVAL_POLL_INTERVAL_SECONDS`, default 60s) picks up the new file
   on its own, or immediately via `POST /api/admin/poll-approvals-now`.

**Field-name note:** unlike the SharePoint version, there's no "internal
name" gotcha here — these are just JSON keys you're typing directly into
the "Create file" content, so what you type is exactly what
`onedrive_folder.py` reads. Just make sure the keys match exactly
(`sectionManager`, not `SectionManager` — this backend's JSON parsing is
case-sensitive, same as the request schema above).

## Part 5B — Add Approval IDs to the outcome (digital audit trail)

`excel_export.py` now injects a small reference line under each
signature block — `รหัสอ้างอิง: <id>` — sourced from Power Automate's own
**Approval ID** for that specific "Start and wait for an approval"
instance. This ties the signed document back to the exact record in
Power Automate's run history, distinct from just a name and a date.

**Change needed in the flow:** in both branches that write the final
`-outcome.json` (Part 5, step 7's nested conditions), add an
`approvalId` field to the relevant manager object, sourced from that
approval step's own dynamic content — click into the field, open dynamic
content on the **relevant "Start and wait for an approval" step**, and
look for **Approval ID** (visible directly in the output list, no
expression needed — same list `Outcome`/`Response summary`/`Completion
date` came from).

Updated schema for the **fully-approved** branch:
```json
{
  "outcome": "approved",
  "sectionManager": {
    "name": "<from Get user profile>",
    "respondedAt": "<Completion date>",
    "approvalId": "<Approval ID, from the SECTION approval step>"
  },
  "divisionManager": {
    "name": "<from Get user profile>",
    "respondedAt": "<Completion date>",
    "approvalId": "<Approval ID, from the DIVISION approval step>"
  }
}
```

For the **rejected** branches, add `approvalId` the same way to whichever
manager object is present (worth keeping for the audit trail even on a
rejection — it's the record of that specific review, not just approvals):
```json
{
  "outcome": "rejected",
  "rejectedStage": "division",
  "divisionManager": {
    "name": "<from Get user profile>",
    "approvalId": "<Approval ID, from the DIVISION approval step>"
  },
  "rejectedReason": "<Response summary>"
}
```

`approvalId` is optional on the Python side (both `mark_approved()` and
`inject_approval_signatures()` default it to `None`) — if you skip this
field, everything still works exactly as before, just without the
reference line on the signed document.

## Part 5C — Second flow: automatic handoff to HR

No `smtplib`, no SMTP credentials anywhere in this backend. Once a cycle
is fully approved, Python writes the signed workbook into a new
`ready_for_hr/` folder (same OneDrive-synced root, alongside
`requests/`/`files/`/`results/`) — that write *is* the entire handoff.
A second, separate, genuinely simple Power Automate flow does the actual
emailing.

**Python side (already done, `onedrive_folder.write_ready_for_hr()`):**
writes `{schedule_key}-cycle{N}-approved.xlsx` into
`ScheduleApprovals/ready_for_hr/` right after signature injection
succeeds, using the same `wb.save()` pattern as everywhere else — no new
folder-creation step needed on your end, it's created automatically the
first time a cycle gets approved (same `_sub()` auto-create pattern as
the other subfolders).

**Build the second flow:**

1. `make.powerautomate.com` → **Create** → **Automated cloud flow**. Name
   it something like `Email Signed Schedule to HR`.
2. Trigger: search **"When a file is created"** (OneDrive for Business).
   **Folder**: browse to `ScheduleApprovals/ready_for_hr`.
3. **+ New step** → **"Get file content"** (OneDrive for Business).
   **File**: the trigger's file identifier/Id (same pattern as the main
   flow's step 3).
4. **+ New step** → search `send an email` → **"Send an email (V2)"**
   (Office 365 Outlook connector — standard, no license needed).
   - **To**: your HR/Admin address (type it directly — this flow doesn't
     need to read it from anywhere dynamic, since every file landing in
     this folder always goes to the same place).
   - **Subject**: something like `ตารางที่อนุมัติแล้ว: ` + the trigger's
     **File name** token.
   - **Body**: a short plain message — this flow doesn't need to know
     anything about cycle IDs or approvers, it's purely "a signed file
     showed up, send it."
   - **Attachments** → **Add new item**: **Attachment Name** = trigger's
     **File name**, **Attachment Content** = step 3's **File Content**.
5. Save. That's the whole flow — four steps, no conditions, no branches.

**Optional cleanup step** (not required, but tidy): add a **"Delete
file"** (OneDrive for Business) action at the end, deleting the file the
trigger fired on, so `ready_for_hr/` doesn't accumulate every signed
schedule forever. Skip this if you'd rather keep it as a running archive
of everything ever sent to HR — either is reasonable, it's just a
question of whether you want this folder to double as an archive.

**Test it:** once the main flow fully approves a cycle (or re-run the
end-to-end test in Part 6 through to full approval), check
`ScheduleApprovals/ready_for_hr/` for the new file, confirm this second
flow's run history shows it fired, and confirm the email actually
arrived with the attachment intact.

## Part 6 — End-to-end test

1. Start the backend with `.env` loaded. Confirm the startup log does
   **not** say "ONEDRIVE_APPROVALS_ROOT not set/found" — if it does, the
   poll loop never started and nothing will pick up results.
2. From the app, submit a real schedule for approval.
3. Check `ScheduleApprovals\requests\` — a new `cycle-N-request.json`
   should appear.
4. Check the flow actually triggered: `make.powerautomate.com` → your
   flow → **Run history**. Nothing there means the trigger isn't firing —
   double-check the trigger's folder points at exactly `requests/`, not
   the parent `ScheduleApprovals/` folder (which would also catch the
   workbook and cause the flow to run twice per submission, once
   correctly and once on a file it can't parse as JSON).
5. Approve (or reject) as both managers via the emailed approval link or
   the Approvals center.
6. Watch `ScheduleApprovals\results\` for `cycle-N-section-approved.json`
   to appear, then `cycle-N-outcome.json`.
7. Within `APPROVAL_POLL_INTERVAL_SECONDS` (or immediately via
   `POST /api/admin/poll-approvals-now`), confirm the app's status banner
   updates, the processed result files moved into
   `ScheduleApprovals\results\processed\`, and — on full approval — that
   `backend/exports/approved/` contains a file with the signatures
   actually injected.
8. On full approval, also check `ScheduleApprovals\ready_for_hr\` for
   the signed file, and confirm the second flow (Part 5C) fired and the
   HR email actually arrived.

## A note on environment variables and running this long-term

Since this now depends on OneDrive being signed in, the backend
realistically needs to run as something that starts automatically when you
log into Windows (a scheduled task set to run at logon, or — simpler for
now — just remembering to start it manually each morning alongside
OneDrive itself).

`app.py` loads `backend/.env` itself on startup (via `python-dotenv`), so
you do **not** need to separately export `ONEDRIVE_APPROVALS_ROOT` as a
real OS environment variable before running `uvicorn` — just having it in
`.env` is enough, in any terminal. (Earlier versions of this guide said
otherwise, which caused a real bug: `test_onedrive_folder.py` loaded
`.env` itself and passed, while the actual running server — started in a
different terminal without the variable set — kept 502'ing on submit with
"not set or doesn't exist." Fixed by having `app.py` load `.env` the same
way the test script does, rather than relying on remembering to export it
correctly every time.)
