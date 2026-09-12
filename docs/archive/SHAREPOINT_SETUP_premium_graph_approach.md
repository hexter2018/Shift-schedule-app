# SharePoint Setup Guide — Schedule Approval Workflow

Full walkthrough for setting up the O365 side of the approval workflow:
the SharePoint list + document library, the Azure AD app registration the
backend authenticates as, and the Power Automate flow. Follow the parts in
order — each one depends on something from the part before it.

**Who needs to do what:** Parts 1–3 need SharePoint site owner access.
Part 4 needs an Azure AD role that can register apps and grant admin
consent (Application Administrator or Global Administrator — if that's
not you, this is the part to hand to your IT admin). Parts 5–7 you can do
yourself once Part 4's credentials exist. Part 8 needs Power Automate
access to the site (standard/included in most O365 plans — this whole
redesign exists specifically to avoid needing a Premium plan).

**Time estimate:** 30–45 minutes if you have the right access already; add
a day or two of calendar time if Part 4 needs to go through an IT admin
who isn't immediately available.

---

## Part 1 — Identify or create the SharePoint site

If your department already has a SharePoint site (a Team site backing an
existing Microsoft 365 Group, or a Communication site), use that — you
don't need a new one. Otherwise:

1. Go to `https://<your-tenant>.sharepoint.com/_layouts/15/sharepoint.aspx`
   and click **+ Create site** → **Team site**.
2. Name it something like "Operations Team" or whatever fits — this
   becomes part of the site's URL path.
3. Note the resulting URL, e.g. `https://contoso.sharepoint.com/sites/OperationsTeam`.
   You'll split this into hostname (`contoso.sharepoint.com`) and path
   (`/sites/OperationsTeam`) for the `.env` file in Part 6.

## Part 2 — Document library + upload folder

Most sites already have a default library called "Documents" (shown as
"Shared Documents" in the site's URL, but its *display name* — what the
Graph API matches on — is usually "Documents"). Confirm the name:

1. On the site, click **Documents** in the left nav.
2. Check the page title / library settings (gear icon → **Library
   settings**) for the exact display name. This is what
   `SHAREPOINT_DRIVE_NAME` needs to match exactly.

Create a subfolder to keep pending schedules organized:

3. Inside the document library, **+ New → Folder**, name it
   `ScheduleApprovals` (matches the default `SHAREPOINT_UPLOAD_FOLDER`).

You don't need to configure permissions specially here — the app
registration in Part 4 gets `Sites.ReadWrite.All`, which covers this
automatically once granted.

## Part 3 — Create the "Schedule Approvals" list

1. On the site, **+ New → List** → **Blank list**.
2. Name it exactly `Schedule Approvals` (must match `SHAREPOINT_LIST_NAME`
   in `.env` — this is how the backend finds it).
3. Add each column below: **+ Add column** → pick the type → name it
   *exactly* as shown (case-sensitive) → **Save**.

   | Column name | Type | Notes |
   |---|---|---|
   | CycleId | Number | No decimal places |
   | ScheduleKey | Single line of text | |
   | Department | Single line of text | |
   | MonthLabel | Single line of text | |
   | SectionManagerEmail | Single line of text | (Person or Group works too, but plain text is simpler for the flow to consume as an approval-assignee email) |
   | DivisionManagerEmail | Single line of text | |
   | FileWebUrl | Hyperlink | |
   | Status | Choice | Choices: `Pending Section`, `Pending Division`, `Approved`, `Rejected`. Set default value to `Pending Section`. |
   | SectionApproverName | Single line of text | |
   | SectionApprovedAt | Date and time | Include time |
   | DivisionApproverName | Single line of text | |
   | DivisionApprovedAt | Date and time | Include time |
   | RejectedByRole | Choice | Choices: `Section`, `Division` |
   | RejectedByName | Single line of text | |
   | RejectedReason | Multiple lines of text | Plain text (not rich text) |

   The built-in `Title` column stays — leave it as-is, the backend sets it
   automatically on create.

4. **Important — verify internal names, don't assume them.** SharePoint
   derives each column's *internal* name from what you typed as the
   display name, at creation time, and does not update the internal name
   if you rename the column afterward. Usually `SectionManagerEmail`
   typed in gives you an internal name of `SectionManagerEmail` — but if
   a column with that internal name already exists on the list's
   underlying content type (this does happen, especially on lists created
   from a template), SharePoint silently appends a suffix like
   `SectionManagerEmail1`. You will not notice this from the UI. The
   connection-test script in Part 7 checks this for you and tells you
   exactly which columns (if any) got renamed — don't skip that step.

## Part 4 — Azure AD app registration

This gives the Python backend its own identity to authenticate to Graph
API with (no user sign-in — the backend runs unattended, so it needs
app-only auth).

**4.1 — Register the app**
1. Go to `https://portal.azure.com` → **Microsoft Entra ID** → **App
   registrations** → **+ New registration**.
2. Name: something like `Shift Schedule Approvals Backend`.
3. Supported account types: **Accounts in this organizational directory
   only** (single tenant).
4. Redirect URI: leave blank (not used — this app never redirects a
   browser anywhere).
5. **Register**.
6. On the app's **Overview** page, copy the **Application (client) ID**
   and **Directory (tenant) ID** — these become `GRAPH_CLIENT_ID` and
   `GRAPH_TENANT_ID`.

**4.2 — Create a client secret**
1. In the app, go to **Certificates & secrets** → **Client secrets** →
   **+ New client secret**.
2. Description: anything. Expiry: your organization's policy will dictate
   this — note the expiry date somewhere memorable, since this will need
   rotating before it lapses (an expired secret fails Step 1 of the
   connection test with a clear auth error, so at least it fails loudly).
3. Copy the secret's **Value** immediately — this becomes
   `GRAPH_CLIENT_SECRET`, and Azure will not show it to you again after
   you navigate away from this page.

**4.3 — Add the API permission**
1. In the app, go to **API permissions** → **+ Add a permission** →
   **Microsoft Graph** → **Application permissions** (not "Delegated" —
   delegated permissions require a signed-in user, which this backend
   never has).
2. Search for and check **Sites.ReadWrite.All**.
3. **Add permissions**.

**4.4 — Grant admin consent**
1. Still on **API permissions**, click **Grant admin consent for
   `<your organization>`**.
2. Confirm. The permission's status column should change to show a green
   checkmark ("Granted for `<org>`").
3. If you don't see this button (or it's greyed out), you don't have
   admin rights in this tenant — this step needs your Global
   Administrator or Application Administrator. **This is the single most
   common point of failure** in this whole setup: the permission can be
   *added* by anyone with app-registration rights, but it does nothing
   until *consented*, and it's easy to add it, not notice consent wasn't
   granted, and spend time debugging a 403 that's actually just this.

`Sites.ReadWrite.All` is tenant-wide (every SharePoint site), which is
broader than strictly necessary — Graph API doesn't offer a
site-scoped *application* permission out of the box. If your organization
requires tighter scoping, look into **application access policies**
(`New-ApplicationAccessPolicy` in the SharePoint Online PowerShell
module), which can restrict this app's access to specific sites only.
That's an extra step beyond this guide's scope — flag it to whoever
manages your tenant's security policy if it matters for your org.

## Part 5 — Get the SharePoint site ID (optional, if not using hostname+path)

`graph_client.py` can resolve the site ID from hostname+path automatically
at runtime, so this step is optional — but if you'd rather set
`SHAREPOINT_SITE_ID` directly:

1. Go to Graph Explorer: `https://developer.microsoft.com/en-us/graph/graph-explorer`.
2. Sign in with an account that has access to the site.
3. Run: `GET https://graph.microsoft.com/v1.0/sites/<hostname>:/sites/<path>`
   e.g. `GET https://graph.microsoft.com/v1.0/sites/contoso.sharepoint.com:/sites/OperationsTeam`
4. Copy the `"id"` field from the response — that's the value for
   `SHAREPOINT_SITE_ID`.

## Part 6 — Configure the backend

1. `cd backend`, copy `.env.example` to `.env`.
2. Fill in everything from Parts 4–5:
   ```
   GRAPH_TENANT_ID=<from 4.1>
   GRAPH_CLIENT_ID=<from 4.1>
   GRAPH_CLIENT_SECRET=<from 4.2>
   SHAREPOINT_SITE_HOSTNAME=contoso.sharepoint.com
   SHAREPOINT_SITE_PATH=/sites/OperationsTeam
   ```
   (or set `SHAREPOINT_SITE_ID` instead of the hostname/path pair, if you
   did Part 5).
3. Leave `SHAREPOINT_DRIVE_NAME`, `SHAREPOINT_UPLOAD_FOLDER`, and
   `SHAREPOINT_LIST_NAME` as their defaults if you matched them exactly in
   Parts 2–3, or update them to match whatever names you actually used.
4. `pip install -r requirements.txt python-dotenv` (python-dotenv is only
   needed for the test script in Part 7 to auto-load `.env`; the running
   app itself expects these as real environment variables, e.g. set via
   your process manager / systemd unit / container env — see the note at
   the end of this guide).

## Part 7 — Run the connection test *before* touching Power Automate

This is the step that turns "build the whole flow, then discover a typo"
into "find the typo in 30 seconds." Don't skip to Part 8 first.

```bash
cd backend
python test_graph_connection.py
```

It checks, in order: env vars present → can get an access token → can
resolve the site → can find the document library → can find the list →
the list's columns match what the backend expects (and flags any
internal-name mismatches — see Part 3.4) → can actually upload a file and
clean it up → can actually create and read back a list item and clean it
up.

Fix whatever it reports and re-run until you see:
```
✅ ✅ ✅  All checks passed — the backend can reach SharePoint correctly.
```

Common failures and what they actually mean:

| What you see | What's actually wrong |
|---|---|
| Token request fails | Wrong tenant/client ID, or an expired/mistyped client secret |
| Site resolution fails with 403 | Permission added but not admin-consented (Part 4.4) |
| Site resolution fails with 404 | Hostname or path typo — check for a stray `https://` or trailing slash |
| Drive not found | `SHAREPOINT_DRIVE_NAME` doesn't match the library's actual display name (Part 2) |
| List not found | `SHAREPOINT_LIST_NAME` doesn't match, or list wasn't created yet |
| Missing columns reported | Add them per the table in Part 3 |
| "Some columns have an internal name different..." | See Part 3.4 — you'll need to either recreate that column with a name that doesn't collide, or update the internal names referenced in `approvals.py`/the flow to match what SharePoint actually assigned |

## Part 8 — Build the Power Automate flow

Standard connectors only — this whole design exists to avoid the Premium
"HTTP" action and "When an HTTP request is received" trigger.

1. Go to `https://make.powerautomate.com` → **Create** → **Automated
   cloud flow**.
2. Search for and select trigger **"When an item is created"**
   (SharePoint). Configure: **Site Address** = your site, **List Name** =
   `Schedule Approvals`.
3. **+ New step** → search **"Get file content"** (SharePoint). **Site
   Address** = same site, **File Identifier** = use dynamic content to
   build the path from the triggering item — e.g.
   `/ScheduleApprovals/<filename>` if you stored just the filename, or use
   the item's `FileWebUrl` field. (If this feels awkward, an easier
   alternative: skip attaching the file entirely, and instead include the
   item's `FileWebUrl` as a clickable link in the approval request — the
   approver opens it directly in SharePoint. Simpler to build, and avoids
   file-path fiddling.)
4. **+ New step** → search **"Start and wait for an approval"**
   (Approvals connector). **Approval type**: "Approve/Reject – First to
   respond" (single approver). **Assigned to**: dynamic content →
   `SectionManagerEmail` from the trigger. **Title**: something like
   `Schedule approval: ` + dynamic content `Department` + `MonthLabel`.
   Attach the file from step 3 if you did that.
5. **+ New step** → **Condition**. Left side: dynamic content
   `Outcome` from the approval step. Condition: **is equal to**
   `Approve`.

   **If yes branch:**
   1. **"Get user profile (V2)"** (Office 365 Users connector) with
      **User (UPN)** = the approval step's **Responder** email — this
      resolves an actual display name, since the approval action's
      responder is usually just an email/UPN.
   2. **"Update item"** (SharePoint): same site/list, **Id** = trigger's
      item ID. Set `Status` = `Pending Division`, `SectionApproverName` =
      the display name from the user-profile step, `SectionApprovedAt` =
      the approval step's response time (dynamic content, usually called
      "Completion time" or similar — check what's actually offered).
   3. **"Start and wait for an approval"** again, this time **Assigned
      to** = `DivisionManagerEmail`.
   4. **Condition** again on this second approval's outcome:
      - **Approve** → **"Get user profile (V2)"** for the division
        approver, then **"Update item"**: `Status` = `Approved`,
        `DivisionApproverName`, `DivisionApprovedAt`.
      - **Reject** → **"Update item"**: `Status` = `Rejected`,
        `RejectedByRole` = `Division`, `RejectedByName` (from the
        user-profile lookup), `RejectedReason` = the approval step's
        response comments field.

   **If no branch (Section rejected):**
   1. **"Get user profile (V2)"** for the section approver.
   2. **"Update item"**: `Status` = `Rejected`, `RejectedByRole` =
      `Section`, `RejectedByName`, `RejectedReason`.

6. Save the flow. That's it — no callback step. The flow's job ends at
   the final "Update item"; the backend's poller (running every
   `APPROVAL_POLL_INTERVAL_SECONDS`, default 60s) picks up the change on
   its own.

**A note on column internal names inside the flow:** the "Update item"
action's field picker shows *display* names, so this part is usually
fine — but if Part 7's test flagged a renamed internal name for any
column, the flow itself is unaffected (it still uses display names
correctly); what you'd need to fix instead is `approvals.py`'s
`SP_STATUS_TO_INTERNAL` mapping and the field names in `submit_for_approval()`
/ `_process_cycle_outcome()`, since *those* go through the internal name
via the raw Graph API.

## Part 9 — End-to-end test

1. Start the backend with the real `.env` values loaded (e.g.
   `python -m dotenv run -- uvicorn app:app --reload --port 8000`, or
   export the vars in your shell first — see the note below).
2. Confirm the startup log does **not** say "GRAPH_CLIENT_ID not set" —
   if it does, the poll loop didn't start and nothing will pick up
   approvals.
3. From the app, submit a real schedule for approval.
4. Check the SharePoint list — a new item should appear within a few
   seconds with `Status = Pending Section`.
5. Check that the flow actually triggered: `make.powerautomate.com` →
   your flow → **Run history**. If nothing's there, the trigger isn't
   firing — double check the list name matches exactly.
6. Approve (or reject) as both managers in sequence via the Approvals
   center or the emailed link.
7. Watch the SharePoint item's `Status` column update after each
   decision.
8. Within `APPROVAL_POLL_INTERVAL_SECONDS` (or immediately via
   `POST /api/admin/poll-approvals-now`), confirm the app's status
   banner updates and — on full approval — that
   `backend/exports/approved/` contains a file with the signatures
   actually injected.

## A note on environment variables in production

This guide's `.env` file is for local development (`test_graph_connection.py`
loads it via `python-dotenv`). The actual running backend
(`uvicorn app:app`) reads these as real process environment variables, not
from `.env` directly — set them via whatever you use to run this in
production (systemd `Environment=` lines, a Docker `--env-file`, your
hosting platform's secrets/config UI, etc.), and treat `GRAPH_CLIENT_SECRET`
with the same care as a database password.
