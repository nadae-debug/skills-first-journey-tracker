# Skills-First Journey Tracker — Google Apps Script build

This is the production implementation of `project/SkillsFirstJourney.dc.html`
(the Claude Design prototype), rebuilt as a Google Apps Script web app so
**the Google Sheet is the live, shared database** — no `companies.js`, no
`localStorage`, no per-browser state. Every page load reads the Sheet fresh;
every admin edit writes straight back to it.

See `chats/` and `design_handoff_skills_first_journey/README.md` in the
design bundle for the full history and original spec this implements. This
build follows the direction from that chat history (chat3.md): **Google
Sheets stays the database**, not a migration to Postgres/Supabase — with
Apps Script as the thin server that reads/writes it and enforces roles.

## What's real now vs. the prototype

| Prototype (localStorage) | This build |
|---|---|
| `companies.js` / `engagement.js` static files | Read live from the "Master Spreadsheet" / "Website Engagement" tabs on every load |
| Client-side password hash-and-compare | Server-side session tokens (`Auth.gs`), password hashed+salted, checked only on the server |
| Visitor (name+email, no password) + Administrator (email+password) roles | **Administrator-only.** The general/visitor login was removed — every account signs in with email + password, and every account is an administrator (added via Admin & data → Administrators). There is no lower-privilege role anymore. |
| Per-browser activity log | Shared "Activity Log" tab, read/cleared by any signed-in administrator, written on every sign-in and action |
| Per-browser favorites | Shared "Favorites" tab, keyed by signed-in email |
| `mailto:` / external POST endpoint for email | Real send via Apps Script `MailApp`, no config needed |
| N/A | New: a live "Comments" thread per company (shared, not local) |

## Files

- `appsscript.json` — manifest: runs as the deploying user, accessible to
  anyone (even signed-out) — but the app's own login screen only accepts an
  administrator email + password, so nothing is visible until someone signs
  in with a real admin account. Needs the `spreadsheets` OAuth scope.
- `Config.gs` — the workbook ID, tab names, stage/dimension constants. Edit
  `SHEET_ID` here if this is ever pointed at a different workbook.
- `Util.gs` — shared helpers (header-indexed sheet reads, hashing, slugs).
- `Auth.gs` — sessions (CacheService, 6h TTL) + administrator login + admin
  management. **This is where access control is actually enforced** — every
  write endpoint calls `requireAdmin_(token)` first, and `api_login` is the
  only way in (no visitor/general sign-in path exists).
- `SheetData.gs` — reads/writes the "Master Spreadsheet" tab. Column mapping
  mirrors the prototype's old client-side sync 1:1, so it needs no changes
  to the existing workbook.
- `Engagement.gs` — reads the "Website Engagement" tab.
- `Definitions.gs` — reads "Definitions" + "Resources" tabs.
- `Comments.gs` — reads/writes the "Comments" tab (new feature, see below).
- `Opportunities.gs` — reads/writes the "Priority Prospect Opportunities"
  tab (see Data model below).
- `Activity.gs`, `Settings.gs`, `Favorites.gs`, `Overrides.gs` — the other
  app-managed tabs (activity log, appearance settings, per-user favorites,
  and curated extras like assessment history that the live sheet doesn't
  carry).
- `Setup.gs` — **run once** after deploying (see Setup below).
- `Seed.gs` / `Assets.gs` — one-time seed content (Definitions/Resources/
  Website Engagement starting data, ported from the prototype) and the
  embedded O@W logo. Not read at runtime except as a fallback.
- `Code.gs` — `doGet`, `include()`, and the `api_bootstrap` / `api_refresh`
  / `api_sendEmail` endpoints.
- `Index.html` / `Stylesheet.html` / `JavaScript.html` — the client. The O@W
  design-system CSS is inlined in `Stylesheet.html`; `JavaScript.html` is a
  close line-for-line port of the prototype's render code (per the original
  design_handoff README's instruction to "keep the exact state variables and
  render code" and swap only the data layer) — every `google.script.run`
  call replaces what used to be a `localStorage` read/write.

## Deploy

You'll need [`clasp`](https://github.com/google/clasp) (`npm i -g @google/clasp`, then `clasp login`).

```
cd apps-script-app
clasp create --type webapp --title "Skills-First Journey Tracker" --rootDir .
# or, to bind to an existing Apps Script project id:
#   echo '{"scriptId":"<id>","rootDir":"."}' > .clasp.json
clasp push
clasp deploy --description "v1"
```

Then, **once**, open the project in the Apps Script editor (`clasp open`),
select `oneTimeSetup` in the function dropdown (top of the editor), and
click Run. Grant the Sheets permission it asks for. This creates every
app-managed tab (Admins, Activity Log, Settings, Favorites, App Overrides,
Definitions, Resources, Comments, Website Engagement, Priority Prospect
Opportunities) in the workbook named in `Config.gs`'s `SHEET_ID`, seeds
Definitions/Resources/Website Engagement from the prototype's shipped
content, and creates the default administrator:

- **admin@opportunityatwork.org** / **paperceiling**

**Sign in as that account and change it immediately** — Admin & data →
Administrators → add your own account → remove the default one.

`oneTimeSetup` does **not** touch the "Master Spreadsheet" tab — that one
must already exist with the assessment data (it does, in the real workbook
this points at) and keeps its own column layout; the app reads/writes it by
header name, so reordering or adding columns there is safe.

Finally, deploy as a web app: **Deploy → New deployment → Web app** —
Execute as **Me**, Who has access **Anyone**. Share the resulting `/exec`
URL with the team.

## Data model (all of it lives in the Sheet — see the "spreadsheet stays
the database" answer from the chat this implements)

Every tab below lives in the **same workbook** as "Master Spreadsheet"
(`Config.gs`'s `SHEET_ID`):

- **Master Spreadsheet** (existing, owned by the assessment team) — company
  name, classifications/reasoning per dimension, board members, points of
  contact, sources, Top 10 flag/notes, etc. Read fresh on every page load;
  written back on every admin save/delete/import.
- **Website Engagement** (created + seeded by `oneTimeSetup`) — per-company
  visit totals and top pages. Columns: `Company, Total Visits, Unique Pages,
  O&W Visits, TTPC Visits, Most Recent Week, Logo, Top Page 1 URL, Top Page
  1 Visits, … Top Page 5 URL, Top Page 5 Visits`. Edit rows here (or ask
  whoever owns the site-analytics export to update it) and the app picks it
  up on next load/refresh — nothing to redeploy.
- **Definitions** / **Resources** — the classification rubric and the Ad
  Council resources-page copy. Editable directly in Sheets; changes show up
  live, no code change. **Resources** columns: `Section | Title | Body` —
  `Section` accepts (case-insensitively) "Universal menu", "Turnkey" /
  "Before joining TTPC", or "Board-only" / "Exclusive"; a misspelled Section
  value just means that row silently doesn't show, so double-check it
  against those three if a row you added doesn't appear.
- **Priority Prospect Opportunities** — explicit engagement ideas for Top 10
  priority prospects, one row per idea. Columns: `Company | Opportunity |
  Status | Notes | Added By | Added Date`. Only `Company` and `Opportunity`
  are required (e.g. `Allstate | Invite to the Q3 TTPC employer roundtable`)
  — `Status`/`Notes`/`Added By`/`Added Date` are there for the team to track
  follow-through but aren't required for an idea to show up on the Priority
  Prospects page. `Company` is matched the same way as Master Spreadsheet
  (through the alias table in `SheetData.gs`, so "Citi" and "Citigroup"
  resolve to the same company) — use the same company name you'd use there.
  A company only shows on the Priority Prospects page at all if its Top 10
  checkbox is set on Master Spreadsheet; this tab just supplies its ideas.
- **Admins** — administrator accounts (name, email, salted password hash).
  This is the only account type — there's no separate visitor/general login.
- **Activity Log** — every sign-in / page view / company view / export /
  download / comment, by every administrator (there's no unlogged role
  anymore). Read/cleared by any signed-in administrator; append-only.
- **Favorites** — per-user favorited companies, shared across that person's
  devices.
- **Comments** — the new live comment thread per company (see below).
- **App Overrides** — the handful of curated fields the live sheet doesn't
  carry: assessment history for the "Previous assessments" tabs, and two
  ad-hoc fields — a manual `website` and `parentNote` (e.g. YouTube's
  "Google is the TTPC partner" note).

## Comments (new)

Every company's detail card now has a **Comments** section: a live, shared
thread stored in the **"Comments"** tab (`CompanyId, Timestamp, WhoName,
WhoEmail, Role, Comment`) — not `localStorage`, not per-browser. Any signed-
in administrator can read a company's thread and post to it; cards show
a comment-count badge (from `api_bootstrap`'s `commentCounts`) without
fetching every thread up front. There's no push/websocket channel here
(Apps Script doesn't have one) — a viewer sees new comments on next load or
next time they open that company's card, not instantly on someone else's
keystroke. If your team wants near-real-time, the affordable options are
(a) a short client-side poll (`setInterval` re-calling `api_getComments`
while a card is open) or (b) a Google Chat/Slack webhook fired from
`api_addComment` so people at least get notified. Neither is wired up yet;
say the word and either is a small addition.

Comments are **not** included in shares/exports/downloads — they're an
internal working thread, not client-facing content, and aren't on CLAUDE.md's
allow-list for what's safe to send externally.

## Sharing policy (CLAUDE.md, carried forward)

`downloadCompany`, `shareText` (email/copy), and CSV export all omit
**account owner**, **edge-case flags**, and **"where things stand now"**
— per the project rule in `project/CLAUDE.md`. One correction made while
porting: the prototype's **CSV export** still included "Where Things Stand
Now" and "Account Owner (Salesforce)" columns, which is inconsistent with
that rule (CLAUDE.md says "ANY... share exports"); this build removes them
from CSV export too. Everything else (classifications + reasoning, the six
dimensions, board members, POC, international context, sources) is
unchanged and still shown/shared as before. Edge-case flags are still shown
*inside the app* (the detail card) — the rule is about outbound sharing,
not in-app visibility for signed-in staff.

## Known gaps / next steps

- **Email quota:** `MailApp.sendEmail` is capped at 100/day (consumer) or
  1,500/day (Google Workspace). Fine for this tool's volume; if O@W ever
  needs more, swap `api_sendEmail` in `Code.gs` for `GmailApp` (higher quota
  on Workspace) or a transactional provider.
- **Session length:** sessions live in `CacheService`, capped at Google's 6h
  max (`SESSION_TTL_SECONDS` in `Config.gs`). Administrators re-enter their
  email + password after 6 hours idle. If that's too short, the next
  step up is a real persisted session table (a "Sessions" sheet tab or
  Firestore) with a longer, refreshable TTL — not implemented here to keep
  the design simple, since a Sheet-backed internal tool doesn't need
  bank-grade session length.
- **Live comment updates**, discussed above.
- Board members: the live sheet's column layout supports at most **two**
  board members per company row (Board Member / Second Board Member). If a
  company ever needs three+, that needs a schema change (either three more
  column sets, or a separate "Board Members" tab keyed by company id) —
  flag it and I'll adjust `SheetData.gs`'s read/write mapping.
