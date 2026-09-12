# ตารางปฏิบัติงานประจำเดือน — React frontend + FastAPI backend

- **`backend/`** — FastAPI + SQLite. Exposes a small key/value storage API
  (`GET/PUT/DELETE /api/storage/{key}`). All schedule/pattern/holiday/
  rotation data lives in a real database file (`backend/shift_schedule.db`)
  instead of one browser's storage.
- **`frontend/`** — the tool as a React (Vite) app. Same features, same
  scheduling/pattern-detection/holiday/OT-suggestion logic as the original
  single-file HTML version — now split into components instead of one big
  file of DOM-manipulation code.

## Run it

**1. Start the backend**
```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```
This creates `shift_schedule.db` automatically on first run.

**2. Start the frontend**
```bash
cd frontend
npm install
npm run dev
```
Open the URL Vite prints (typically `http://localhost:5173`). It talks to
`http://localhost:8000` by default.

To point it at a different backend (e.g. once deployed), copy
`frontend/.env.example` to `frontend/.env.local` and set:
```
VITE_API_BASE_URL=https://your-backend.example.com
```

**Production build:** `npm run build` in `frontend/` outputs static files to
`frontend/dist/` — deploy that anywhere that serves static files (it still
needs `VITE_API_BASE_URL` set at build time to reach your backend).

## How the frontend is organized

- `src/lib/logic.js` — every scheduling algorithm (pattern/cycle detection,
  holiday application, weekly-rotation math, the MM6/EE6 gap-fill rule, OT
  candidate ranking), ported as plain functions.
- `src/lib/storage.js` — the API client talking to the backend.
- `src/lib/excel.js` / `src/lib/pdf.js` — the styled Excel export and the
  PDF export (html2canvas + jsPDF), unchanged in behavior from the original.
- `src/components/` — one component per panel (shift-code legend, holidays,
  group rotations, gap-fix, leave/OT coverage, analyzed patterns, the main
  table).
- `src/App.jsx` — owns all the app data (current month's schedule,
  pattern library, holidays, rotation settings) in a single ref-backed
  store and wires the panels together. This mirrors the original tool's
  design closely on purpose: the original kept one shared, mutable
  in-memory model that every panel read and wrote, and a schedule like
  this genuinely behaves like one interconnected worksheet rather than a
  set of independent, isolated pieces of state — editing a day cell can
  affect OT suggestions, pattern badges, and gap-fix results all at once.
  Re-deriving that as many small independent `useState`s would have meant
  re-deriving all the cross-panel update logic from scratch and risked
  behavior drifting from the original tool. The trade-off: it's a larger,
  more centralized component than idiomatic small-scale React, so treat
  `App.jsx` as the place to look first when tracing how an action affects
  the schedule.

## Notes

- The storage API is generic (string key → JSON string value), so nothing
  on the backend needed to change from the previous plain-HTML version.
- CORS is wide open (`allow_origins=["*"]`) for easy local development.
  Restrict it to your real frontend origin before exposing the backend
  publicly.
- Multiple people using the same backend share data automatically.

## Approval workflow (OneDrive-synced folder + Power Automate, 2-tier, zero admin consent)

**Full setup walkthrough: see [`docs/ONEDRIVE_SETUP.md`](docs/ONEDRIVE_SETUP.md).**
The rest of this section is a reference for what got built, not a
step-by-step guide.

Adds an approval cycle on top of a saved schedule: Section Manager, then
Division Manager. Went through two earlier designs before landing here:
first a direct Power Automate HTTP trigger/callback (needs a Premium
license for the HTTP action/trigger), then SharePoint + Graph API as a
license-free alternative (needs an Azure AD app registration and admin
consent, which isn't always obtainable). This version needs **neither** —
Python writes into a folder that OneDrive syncs on its own, already
authenticated as whoever's signed into OneDrive on the machine running the
backend; Power Automate reacts to files appearing there ("When a file is
created" — OneDrive for Business, a standard/free connector) and writes
its answer back the same way ("Create file").

**The trade-off:** this ties the backend to running on a machine with
OneDrive actively signed in and syncing — realistically your own PC, not a
headless server. Fine for how this is run today; worth revisiting (the
archived SharePoint/Graph design in `docs/archive/`) if this ever needs to
move to a real server and Azure AD access becomes available.

**Backend files:**
- `backend/excel_export.py` — unchanged from earlier designs; openpyxl
  port of `frontend/src/lib/excel.js`.
- `backend/onedrive_folder.py` — the entire transport layer. Writes the
  pending workbook + a request JSON into `requests/`/`files/` subfolders
  under `ONEDRIVE_APPROVALS_ROOT`; reads result JSON files back from
  `results/`, moving handled ones into `results/processed/` so they're
  never re-read. Defensively treats an empty/unparseable result file as
  "not ready yet" rather than an error — OneDrive's Files-On-Demand can
  briefly show a placeholder before the real bytes sync down locally.
- `backend/approvals_db.py` — simpler than the SharePoint version: no
  external item-id to correlate against, since `cycle_id` itself is
  embedded directly in every request/result filename.
- `backend/approvals.py`:
  - `POST /api/schedules/{key}/submit` — generates the pending file,
    writes it plus a request JSON directly into the synced folder (the
    write *is* the upload — no separate API call), creates the local
    cycle row.
  - `poll_once()` / `poll_loop()` — checks each active cycle's expected
    result filenames; an interim `cycle-N-section-approved.json` advances
    the local status without waiting for the whole cycle, a final
    `cycle-N-outcome.json` triggers signature injection or records a
    rejection.
  - `POST /api/admin/poll-approvals-now`,
    `GET /api/schedules/{key}/approval-status`,
    `GET .../approved-file` — unchanged in shape across all three
    designs; the frontend never needed to change.
- `backend/app.py` — starts `poll_loop()` on startup if
  `ONEDRIVE_APPROVALS_ROOT` resolves to an existing directory; otherwise
  logs a warning and skips it.
- `backend/test_onedrive_folder.py` — connection-test script. Unlike the
  Graph API version, this is genuinely testable without any external
  service (plain filesystem I/O), so it exercises a real write/read/
  cleanup round-trip rather than hitting a mock.

**Required env vars** — see `backend/.env.example`: `ONEDRIVE_APPROVALS_ROOT`
(a path inside your OneDrive sync tree), `APPROVAL_POLL_INTERVAL_SECONDS`.

**Tested end-to-end with zero mocking** — since this transport is just
local files, a plain temp directory stands in for "the OneDrive-synced
folder" perfectly (that's literally what OneDrive presents locally
anyway). Covered: submit → request+workbook files land correctly →
double-submit correctly rejected → interim section-approval marker
advances local status and gets archived to `processed/` → final
approval outcome injects signatures into the real file (verified by
reading the cell values back with openpyxl) → rejection path → resubmit
after rejection → the empty/truncated-JSON "not ready yet" edge case
specifically (confirmed it doesn't crash the poller or misfire) →
rollback when the folder isn't configured (confirmed no permanently-stuck
cycle blocking retry, the same class of bug the SharePoint version's
testing caught last time).

**Not yet built:** nothing changed here from earlier — the frontend
submit button, status banner, and edit-lock were wired in two designs ago
and didn't need to change again, since `/submit` and `/approval-status`
kept the same shape across all three transport redesigns.


## Digital audit trail (cert IDs) + automated HR handoff

Two additions to the approval workflow, both keeping Python out of
email-sending entirely (no `smtplib`, no SMTP credentials anywhere in
this backend):

- **Cert IDs**: `outcome.json` now optionally carries each manager's
  Power Automate **Approval ID** (`sectionManager.approvalId` /
  `divisionManager.approvalId`) — a unique, Microsoft-assigned identifier
  for that specific "Start and wait for an approval" instance.
  `excel_export.py` injects it as a small reference line
  (`รหัสอ้างอิง: <id>`) under each signature block, one new row below the
  date. Optional on the Python side — omitting `approvalId` just leaves
  that reference line blank, nothing breaks.
- **Automated HR handoff**: once a cycle is fully approved,
  `onedrive_folder.write_ready_for_hr()` saves the signed workbook into a
  new `ready_for_hr/` subfolder (same synced root). That write *is* the
  entire handoff — a second, separate, genuinely simple Power Automate
  flow (Part 5C in the setup guide) triggers on that folder and emails
  the file via the standard `Send an email (V2)` action. No Python
  involvement past the file write.

See `docs/ONEDRIVE_SETUP.md` Parts 5B and 5C for the flow changes needed
(where to find the Approval ID token, the updated `outcome.json` schema,
and the four-step second flow).

**Schema note**: `sig_cert_row`, `section_approval_id`, and
`division_approval_id` are new nullable columns on `approval_cycles`,
added via the additive-migration path (`_ensure_columns` in
`approvals_db.py`) rather than the stale-rename path — see "Database
schema migrations" above for why that distinction matters. Verified this
specific addition three ways: (1) an existing database from the *previous*
turn's schema (correctly-shaped, but missing these columns) upgrades
cleanly via `ALTER TABLE ADD COLUMN`, with a pre-existing historical row
preserved intact and just `NULL` for the new columns — confirmed no
spurious rename-to-legacy happened, since that path is reserved for
genuinely incompatible columns, not new additive ones; (2) the full happy
path — submit, simulate a Power Automate outcome with real Approval IDs,
poll, and then actually opened the resulting `.xlsx` with openpyxl to
confirm `รหัสอ้างอิง: <id>` landed in the right cells (not just that the
API returned 200); (3) the specific edge case this design risks — a cycle
submitted under the *previous* code, still actively pending when this
code deploys, so its `sig_cert_row` is `NULL` in the database. Simulated
that exact scenario and confirmed the fallback (writing to
`sig_date_row + 1` instead of crashing) works — that fallback lands in an
unmerged cell since the original file predates the reserved row, which is
the one honestly-imperfect-but-functional trade-off in this design,
documented in the code comment where the fallback happens.

## Database schema migrations

`approval_cycles`' columns have changed across three redesigns of the
approval workflow (HTTP webhook → SharePoint/Graph API → OneDrive folder).
`init_approvals_db()`'s `CREATE TABLE IF NOT EXISTS` is a no-op against a
table that already exists on disk — it never applies schema changes to an
existing `shift_schedule.db`. A database created under an earlier design
keeps its old columns forever, including old `NOT NULL` ones the current
code never populates (e.g. `webhook_secret` from the HTTP-webhook design),
which crashed the very first insert with a raw `sqlite3.IntegrityError`
instead of a clear error.

`approvals_db.py` now detects this at startup (`_migrate_if_stale`): if
`approval_cycles` has any column that only existed in an older schema
(`webhook_secret`, `sp_item_id`, `sp_last_status`, `pa_run_id`), it renames
the old table to `approval_cycles_legacy_<timestamp>` — never deletes —
and lets a fresh, correctly-shaped table get created right after. Old
cycle history stays in the database file, just not wired into the app.

If this schema changes again later, add any newly-obsolete column names to
`_OBSOLETE_COLUMNS` in `approvals_db.py` so the same auto-heal keeps
working.

## Frontend design system (Tailwind)

Redesigned the chrome around the schedule table for a cleaner, less
"boxy" look — soft shadows instead of hard borders, a button hierarchy
(primary/secondary/accent/ghost), verbose instructional paragraphs
collapsed into hover tooltips, and a compact grid-aligned form layout
(the Approval Status panel in particular, which used to take up a full
screen of vertical space).

- **Tokens grounded in the app's own domain**, not a generic palette: the
  amber accent is the same hue already used to color shift-code chips
  throughout the schedule — chrome and content read as one system, not
  two competing color choices. Inter handles UI chrome (buttons, labels,
  nav); Sarabun stays the body/data typeface — that split is functional,
  not just aesthetic, since Sarabun is also what the exported Excel/print
  output uses, so the on-screen table and the signed document look like
  the same document.
- `src/components/ui/` — the shared kit: `Button` (5 variants: primary,
  secondary, accent, ghost, danger-ghost), `Tooltip` (hover/focus-reveal
  info icon), `Card` (shadow+radius panel, replacing hard 1px borders),
  `Field` (consistent label+input sizing), `Banner` (status strips for
  pending/approved/rejected/warning states).
- Every panel component (`ShiftCodeLegend`, `HolidayPanel`,
  `GroupRotationPanel`, `GapFixPanel`, `CoverageList`, `PatternList`,
  `ApprovalPanel`, `Toolbar`) rebuilt on this system.
- **`ScheduleTable`'s dense grid internals were deliberately left as
  plain CSS**, not converted to the same card/shadow language — a
  spreadsheet-density data grid is a different design problem than
  surrounding chrome, and sticky multi-column headers/cell-state styling
  don't gain anything from being re-expressed as utility classes. Its
  outer container did get the shadow treatment for visual consistency.

**Verified without a real browser** (none available in the sandbox this
was built in — no network path to a browser binary): full build/lint
pass from a clean `npm install`, every custom-token utility class
(`bg-ink`, `text-ink-soft`, `ring-line`, etc.) confirmed to have produced
actual CSS in the compiled output — Tailwind silently emits nothing for
an unrecognized class name rather than erroring, so this specifically
catches token-naming typos — and a server-render smoke test of all 17
component/state combinations (every `ApprovalPanel` status branch, both
`GapFixPanel` log-entry types) confirmed to render without exceptions or
`undefined`/`NaN` leaking into output. This substitutes for, but doesn't
replace, actually looking at it rendered — worth a visual pass before
treating the layout as final.

### Revision 2 — corporate navy palette, grid layout, compact data grid

First pass (above) got the shadow/tooltip/button-hierarchy mechanics
right but still read as a generic template — the amber-accent palette and
long vertical card stack were doing more of that signaling than the
individual component polish. Second pass:

- **Palette rewrite** (`src/styles.css` tokens): amber accent → deep
  slate-navy `--color-primary` (#1e3a5f) for all chrome/primary actions.
  Red/green/orange (`danger`/`success`/`warning`) are now used *only* for
  status meaning — errors, success, OT/auto-generated flags — never for
  chrome, so they keep signal value instead of competing with brand color.
- **Button variants**: `accent` renamed to `tinted` (soft navy fill,
  navy text) — used for "smart" actions (Analyze, Generate, Apply
  holidays/rotation) as a secondary tier below solid-navy `primary`
  (Save/Submit), still within the navy family rather than a separate hue.
- **Layout**: `App.jsx` restructured from one long vertical card stack
  into a `grid grid-cols-1 xl:grid-cols-2` for the settings/config panels
  (shift codes, holidays, rotations, gap-fix) and a second 2-column grid
  for the secondary panels (coverage, patterns) — real CSS Grid, not a
  persistent narrow sidebar, since several of these panels have wide
  internal rows (the group-rotation detail row especially) that would
  cramp badly in a fixed ~300px sidebar column. `ScheduleTable` stays
  full-width below, since it needs maximum horizontal room for its own
  internal scroll.
- **Table Name column** (`ScheduleTable.jsx`'s new `EmployeeNameCell`):
  the four stacked full-width labeled rows (rotation badge, OT count,
  "ไม่แนะนำให้ทำ OT" checkbox+label, "กลุ่ม:" labeled input) collapsed into
  small always-visible badges plus an explicit ⚙ toggle that reveals the
  two editable controls (group, OT-exclude) inline. Deliberately *not*
  hover-only — hover doesn't exist on touch/tablet, and these are actual
  editable data-entry controls, not decoration, so hiding them behind
  hover would be an accessibility trap.
- **Table header**: sticky offset corrected to clear the sticky Toolbar
  bar above it (both were sticking to the same viewport top before,
  which would have made the table header slide underneath the Toolbar
  instead of stopping below it) — `top: 104px`, estimated from Toolbar's
  own padding since there's no live browser in this environment to
  measure the actual rendered height; worth a visual check and pixel
  adjustment if the header sits a few px off. Typography bumped for
  contrast (day number now full `ink`, not `ink-soft`) and a 2px bottom
  border added to separate header from body more crisply.
- **ApprovalPanel**: rewritten around a small pulsing-dot status
  indicator (the pattern most modern SaaS tools use for "in progress" —
  Linear, Vercel, etc.) instead of a full colored banner box, for the
  pending/approved states; the submit/resubmit form stays a proper Card
  since it has real inputs.

**Verified the same way as the first pass** (no browser available in this
sandbox): clean-install build + lint from scratch (0 errors, same 7
pre-existing warnings, nothing new), the custom-utility-class check
re-run against all 57 custom-token classes now in use (6 initial
"misses" all confirmed false positives — `variant="primary"` prop values
and a `.type === "ot-warning"` string comparison, not class names — same
as the false-positive pattern from the first pass), and a server-render
smoke test of `ScheduleTable` with data that exercises every badge
condition at once (pattern cycle, OT count, shift group, OT-excluded)
plus all four `ApprovalPanel` status branches — zero crashes, zero
`undefined`/`NaN` leakage.

### Revision 3 — container width, grid breakpoints, row striping

- **Container**: switched from `max-w-[1600px] px-6` to
  `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` on both `App.jsx`'s content
  wrapper and `Toolbar.jsx`'s inner bar (kept in sync so the sticky header
  and content below stay aligned). This is narrower than before
  (1280px vs 1600px) — worth knowing the trade-off: the schedule table
  now has less room before its internal horizontal scroll kicks in, since
  it's `w-full` *within* this narrower container rather than breaking out
  to full viewport width. That's what was actually asked for ("span the
  full width of the container"); a full-bleed table (breaking out of the
  7xl cap while everything else stays capped) is a real alternative if
  the narrower table window turns out to be annoying in practice.
- **Grid breakpoints**: settings/secondary panel grids changed from
  `xl:grid-cols-2 gap-4` to `lg:grid-cols-2 gap-6`. Triggering 2-column
  earlier (1024px vs 1280px) inside a now-narrower container means each
  column is tighter than before — `GroupRotationPanel`'s per-group row
  (rename input, day/month/year/step selects, badge, remove button) wraps
  onto more lines than it did previously. Still fully functional (it's
  `flex-wrap`, nothing clips), just visually busier than the other three
  panels — worth a look if that one panel reads as more cramped than its
  neighbors.
- **Row striping**: moved from `tr:nth-child(even) td.day-cell` (which
  would have needed to out-specificity the weekend/holiday/predicted
  cell rules to avoid overriding them) to `tr:nth-child(even)` on the row
  itself. Plain `<td>` elements are background-transparent by default, so
  the stripe shows through blank/off-day cells naturally via DOM paint
  order, while any `<td>` that sets its own background (weekend, holiday)
  correctly stays on top with zero specificity fighting — simpler and
  more robust than trying to out-specificity every existing cell-state
  rule individually.
- **Cell padding**: day-cell and prev-day cell padding bumped from
  `7px 1px` to `8px 3px` for a less cramped feel, without changing column
  width (which would reduce how many day-columns fit on screen at once).

**Verified**: clean build + lint (0 errors, same 7 pre-existing warnings),
direct compiled-CSS checks for every new class
(`max-w-7xl`, `lg:grid-cols-2`, `sm:px-6`, `lg:px-8`, `space-y-6`,
`w-full`), and a server-render smoke test of `ScheduleTable` and
`Toolbar` (the two components whose structure changed) — zero crashes.
