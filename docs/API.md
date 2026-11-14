# API Reference

Base path: `/api/` (proxied from the SPA's `/api/*` in dev — see [ARCHITECTURE.md](./ARCHITECTURE.md)). All endpoints use Django session auth; all mutating endpoints (`POST`) require the `X-CSRFToken` header, which `frontend/src/api.ts` attaches automatically. Source of truth: `No-Dues-Portal/main/urls.py` + `main/api.py`.

Unless noted, error responses are `{"detail": "..."}` with a `4xx`/`5xx` status.

## Auth

| Method + path | Auth | Purpose |
|---|---|---|
| `GET /api/csrf/` | none | Sets the `csrftoken` cookie the SPA needs before its first `POST` |
| `POST /api/login/` | none | Body: `{username, password, role}`. `username` is the webmail. Returns the same shape as `/api/me/`. `401` on bad credentials, `403` if the role doesn't match the account's `UserProfile.role` |
| `POST /api/logout/` | session | Ends the Django session |
| `GET /api/me/` | session | `{username, role, name, hostel?, department?, lab?}` — used by the SPA on page load to restore a session (`lab` = the lab's name, for `LAB` logins) |

## Student

All require an authenticated **Student** session; most operate on that student's single active `ClearanceRequest` (`is_active=True`).

| Method + path | Purpose | Key request fields | Notes |
|---|---|---|---|
| `GET /api/student/request/` | Full clearance state | — | `{has_request: false, exit_types}` if none started yet; otherwise `{has_request: true, request: {...}}` (see shape below) |
| `POST /api/student/initiate/` | Start a clearance request | `exit_type`, `fund_us_amount?`, `vacant_room_no?` | `409` if an active request already exists (Property 12: one active request per student) |
| `POST /api/student/submit-intake/` | Lock intake (page 1 → page 2) | `vacant_room_no`, `fund_us_amount?` | `400` if the vacated room is empty or an intake upload (Library/TPC) is still pending |
| `POST /api/student/upload/` (multipart) | Upload a document to one section | `section`, `file` or `event_report_url` (LUCS link mode) | `400` if > 10 MB or not JPG/PNG/PDF; re-opens a `REJECTED` section to `PENDING` on new upload; runs advisory OCR and returns `{warnings, autofill}` |
| `POST /api/student/confirm-review/` | Confirm OCR-prefilled fields for a section | `section`, `review: {name, roll_no, department}` | Marks the document's review payload `confirmed: true` |
| `POST /api/student/confirm-section/` | Confirm a basic (name/roll only) section | `section`, `name`, `roll_no`, `department` | Required before Store/Sports/Medical/NAD/Administration reach the officer's queue (`student_confirmed`) |
| `POST /api/student/comment/` | Reply on a section's thread | `section`, `body` | `400` if `body` is empty/whitespace |
| `POST /api/student/certificate/` | Generate/fetch certificate data | — | `400` unless `overall_status == CLEARED` (every section `APPROVED` and the refund recorded). Includes `refund` (same shape as the request's). Returns JSON only — the SPA renders the actual PDF client-side. Includes `labs: [{name, level, approved_by, decided_at}]` (empty for departments without labs) and `stages: [{section, level, approved_by, approved_at}]` (Accounts staff level approvals) |
| `POST /api/student/labs/send/` | Send the request to the next level of department labs | — | First call copies the department's labs into the request's chain and sends level 1. `409` before Library/TPC/Warden approve, while an earlier-level lab isn't `APPROVED`, when nothing is left to send, or if the department has no labs. Returns `{has_request, request, sent_to: [lab names]}` |
| `POST /api/student/labs/resend/` | Re-send a rejected lab | `lab_id` | `REJECTED` → `PENDING` (system comment). `409` if that lab isn't `REJECTED` |
| `POST /api/student/labs/comment/` | Reply on a lab's thread | `lab_id`, `body` | `400` if empty, or if the request hasn't been sent to that lab yet |

### `ClearanceRequest` shape (`_request_dict` in `api.py`)

```jsonc
{
  "id": 12,
  "exit_type": "GRADUATION",
  "overall_status": "IN_PROGRESS",       // or "CLEARED"
  "fund_us_amount": "1000.00",
  "vacant_room_no": "A102",  // one block letter + 3 digits
  "intake_submitted": true,
  "current_page": 2,                     // 1 = intake, 2 = dashboard
  "intake": { "required_uploads": [...], "uploaded": [...], "pending": [...], "rejected": [...] },
  "student": { "name": "...", "roll_no": "24UCC174", "department": "CSE", "hostel": "BH1", "webmail": "..." },
  "sections": [
    {
      "code": "LIBRARY", "name": "Central Library", "status": "APPROVED",
      "actionable": true, "is_upload_section": true, "student_confirmed": true,
      "needs_confirm": false, "decided_by": "library@lnmiit.ac.in", "decided_at": "2026-...",
      "comments": [...], "documents": [...]
    },
    {
      "code": "ADMINISTRATION", "name": "Administration", "status": "PENDING", "...": "...",
      // Administration only: what to complete at the office, and what's been ticked
      "checklist": [{ "label": "Physical ID card submitted", "done": false }]
    }
    // one entry per section required for this exit_type
  ],
  "labs": {                              // the department lab chain (HOD card)
    "enabled": true,                     // false = no labs apply (department has none)
    "started": true,                     // false = `levels` is a preview of the current hierarchy
    "cleared": false,                    // every lab APPROVED -> the request is with HOD
    "total": 6, "approved": 3,
    "next_level": 2, "can_send": true,   // can the student send `next_level` right now?
    "levels": [
      { "level": 1, "sent": true, "approved": true, "labs": [
        { "lab_id": 4, "name": "Microwave Lab", "incharge_name": "Mr. Kamta Sharma", "level": 1,
          "status": "APPROVED", "sent": true, "sent_at": "2026-...", "actionable": true,
          "decided_by": "microwave.lab@lnmiit.ac.in", "decided_at": "2026-...",
          "reason": null,                // the lab's rejection reason, when REJECTED
          "comments": [...] }
      ] }
    ]
  },
  "refund": {                            // paid by Accounts once every section approves
    "status": "pending",                 // waiting (sections still approving) | pending | sent | not_due
    "amount": "9000.00",                 // sent: the amount paid; otherwise the expected amount
    "mode": "", "reference": "",         // sent: NEFT / IMPS / RTGS / UPI / CHEQUE + the UTR
    "paid_on": null,
    "account": "••••0001"                // the student's account, masked
  },
  "has_certificate": false
}
```

## Officer (any section role: `LIBRARY`, `TPC`, `WARDEN`, `STORE`, `LUCS`, `SPORTS`, `MEDICAL`, `NAD`, `HOD`, `ACCOUNTS`, `ADMINISTRATION`)

| Method + path | Purpose | Scope enforcement |
|---|---|---|
| `GET /api/section/queue/` | This officer's queue (oldest request first) | Warden → own hostel only; HOD → own department only (`_scope_ok`); only rows with `student_confirmed=True` appear. HOD rows also carry `labs: {total, approved, started, cleared}` — the desk shows rows with `cleared: false` under **In labs** rather than Incoming. Rows of sections with staff sent by hand (Library, LUCS, NAD Cell) carry `assigned_to: {id, name} \| null`, `assigned_at`, `ready` (Page 1 submitted). Accounts rows carry `stage: {levels, current, ready, final, blocked_by, waiting_on, approved: [{level, by, at}]}`. Administration rows carry `checklist: [{id, label, done, by, at}]`, its office checklist for that request. `levels` are the staff levels, in order. `current: null` means the request isn't at a level. `final: true` means every level has approved and it waits for the main account's final approval (`accounts@` is always that last step). `ready: false` means prerequisites or the student's confirmation are still pending; `blocked_by` names the prerequisites still pending (e.g. `["Library", "TPC", "Warden", "HOD"]`), and `[]` with `ready: false` means the student's confirmation (Accounts: the cheque details). **Section staff** get only what reached them: by hand (Library, LUCS, NAD Cell, Administration), rows assigned to them; Accounts, rows at their level (`PENDING`) plus the ones they approved a level of (`APPROVED`) or rejected (`REJECTED`), with `status` meaning *their* outcome. The **section head** also gets `can_manage_staff: true`, `staff_mode: "manual" \| "levels"`, `staff: [StaffMember]` (active), and `ready_to_assign` (by hand: waiting with the head, ready to send) |
| `GET /api/section/review/?request_id=<id>` | Full detail for one request in this officer's section | `403` if out of scope. Every officer additionally sees the student's Page-2 tri-gate status (Library/TPC documents + OCR, and Warden/hostel status — response key `intake`) for context — not just their own section. HOD is fully independent of other sections: no `prerequisites` key at all, same as Store/LUCS/Sports/Medical/NAD. Only Administration gets `prerequisites`: every other section's documents, OCR and status, as context for its sign-off. It no longer waits for all of them, since it runs alongside Accounts. HOD and Administration also get `labs` — the request's department lab chain, level by level, with each lab's decision and rejection reason. Accounts also gets `stage`, and Administration its `checklist` |
| `POST /api/section/approve/` | Approve | `409` if prerequisites aren't all `APPROVED` yet (`engine.PermissionError_`) — for HOD, that includes every lab in the student's department lab chain. Section staff (Library, LUCS, NAD Cell): `403` unless the request was sent to them (same for `review`, `reject`, `comment`). Accounts: body may add `level`, the chain step the officer saw the request at. Staff get `403` unless it's waiting at their level; their approve records that level's approval and moves the request up one step (after the last level, to `accounts@`). Only `accounts@` approves Accounts: without `level` once every level has approved (its final step), or standing in for the level a request is at, which needs `level` (at the last level, that is also its final approval). `409` if `level` no longer matches (the request moved on, even to the final step), if it's not ready (the reason names the pending sections or the cheque details), or for an approve without `level` while it is still at a level. `400` if `level` isn't a whole number. Administration's staff work by hand (`403` unless the request was sent to them), and Administration also answers `409` until every item of its checklist is ticked for that request (the detail names what's missing) |
| `POST /api/section/reject/` | Reject | Body: `{request_id, reason}`. `400` if `reason` is empty (`engine.ValidationError_`) |
| `POST /api/section/comment/` | Post a feedback comment | Body: `{request_id, body}` |

## Section staff — Library, LUCS, NAD Cell, Accounts, Administration

Every request reaches the section's head first — `library@`, `lucs@`, `nad@`, `accounts@` or `admin.office@`, the section account without `managed_by`. Staff are logins the head created, with the head's role (`LIBRARY` / `LUCS` / `NAD` / `ACCOUNTS` / `ADMINISTRATION`); they use the officer endpoints above but only for requests that reached them — sent by hand (Library, LUCS, NAD Cell) or, for Accounts, by their level. These endpoints are **head-only** and act on the head's own section (`403` for staff and every other role); staff ids are user ids, and another head's staff id is a `404`. Code: `main/staff.py` (`STAFF_SECTIONS`).

| Method + path | Purpose | Notes |
|---|---|---|
| `POST /api/section/assign/` | Send requests to a staff member | `{staff_id, count}` → the next `count` (1–500) waiting requests, oldest first: `PENDING`, unassigned, confirmed by the student (for LUCS/NAD, their "Confirm & Send"), Page 1 submitted. `{request_ids: [...], staff_id}` → those requests (not approved ones); `staff_id: null` takes them back. Returns `{ok, moved, to: {id, name} \| null}` — `moved` may be less than `count` if fewer were waiting. `400` for a bad count, someone who isn't the head's active staff, or Accounts (its requests move by level, not by hand). For Administration, a request counts as waiting only once Library, TPC, Warden and HOD have approved it |
| `GET /api/section/staff/` | The head's staff | `{section, staff_mode, head_waiting, checklist, refund_senders, staff: [{id, name, email, is_active, level, refund_manager, pending, decided}]}` — removed ones included (`is_active: false`); `level` and `refund_manager` are set for Accounts staff (`pending` = waiting at their level). Accounts only (`0` / `null` elsewhere): `head_waiting` counts requests every level has approved, waiting for the head's final approval, and `refund_senders` names who sends refunds, the head as "You (main account)". `checklist: [{id, label}]` is Administration's office checklist (`null` for every other section); passwords never returned. (There's no `PATCH` here: the head's place in the Accounts chain is fixed, as its final step.) |
| `POST /api/section/staff/` | Add a staff member + their login | `{name, email, password, level?, refund_manager?}` → `201 {staff}`. Same role as the head; Accounts staff get `level` (1–20, default 1) and may also be made refund managers. `400` for email in use, weak password, missing name, bad level |
| `PATCH /api/section/staff/<id>/` | Edit / reset password / restore | Any of `{name, email, password, level, refund_manager}`; `{is_active: true}` restores |
| `DELETE /api/section/staff/<id>/` | Remove | Their not-yet-approved requests return to the head; login disabled. `{ok, outcome: "deleted" \| "deactivated", returned}` — deleted outright if they never handled anything |

### Administration checklist

What every student must complete in person at the Administration office, starting with "Physical ID card submitted" (`main/checklist.py`). Administration's approve is refused until every item is ticked for the request.

| Method + path | Purpose | Notes |
|---|---|---|
| `POST /api/section/checklist/tick/` | Tick / untick an item for one request | `{request_id, item_id, done}` → `{ok, checklist: [{id, label, done, by, at}]}`. Administration officers only. It must be someone who can decide the request now: the head, or the staff member it was sent to (`403` otherwise). `400` if the request isn't `PENDING` or the item doesn't exist |
| `POST /api/section/checklist/` | Add an item | Head (`admin.office@`) only. `{label}` (≤ 120 characters, spaces tidied) → `201 {item: {id, label}}`. `400` if empty or already on the list. Applies to requests in progress too |
| `DELETE /api/section/checklist/<id>/` | Remove an item | Head only → `{ok, outcome: "deleted" \| "deactivated"}`. An item that was ever ticked is kept inactive, so past ticks stay on record. `404` if there's no such active item |

## Refunds — Accounts

Once every section has approved a request, Accounts pays the student's refund and records it here. That clears the request and unlocks the certificate (`main/refunds.py`). Both endpoints are only for whoever sends refunds (`403` for everyone else, naming who does): the main account (`accounts@`), always, plus any Accounts staff it made refund managers (`refund_manager`).

| Method + path | Purpose | Notes |
|---|---|---|
| `GET /api/accounts/refunds/` | Refunds to send, and sent | `{pending: [row], sent: [row], modes}`. `pending`: active requests with every section approved and no refund yet, oldest first. `sent`: recorded refunds, newest first. Each row is `{request_id, roll_no, name, department, fund_us_amount, suggested_amount, bank: {account_holder, account_no, ifsc, bank_name}, refund: {amount, mode, reference, paid_on, recorded_by, recorded_at} \| null}`. `suggested_amount` is ₹10,000 caution money less the Fund-Us donation; `bank` comes from the student's confirmed cancelled cheque |
| `POST /api/accounts/refunds/` | Record (or correct) a refund | `{request_id, amount, mode, reference, paid_on?}`. `mode` is one of `NEFT`, `IMPS`, `RTGS`, `UPI`, `CHEQUE`; `paid_on` is `YYYY-MM-DD` and defaults to today (India). Or send `{request_id, no_refund: true}`. Returns `{ok, refund}`, clears the request, and adds a note to the student's Accounts thread. `400` if not every section has approved, or for an empty UTR, a bad mode, an amount ≤ 0, or a future date; `404` for an unknown or inactive request. Posting again corrects the record; there's never a second refund.<br/>Or **send it back** instead: `{request_id, reject: true, reason}` rejects Accounts with that reason, like the officer reject (the student fixes it, and it goes through Accounts' levels again). Returns `{ok, status: "REJECTED"}`. `400` once a refund is recorded, if Accounts isn't `APPROVED`, or for an empty reason |

The desk itself doesn't use the `GET` above; refunds are sent from the Approved tab. For Accounts logins (head and staff), the officer queue (`GET /api/section/queue/`) also gives:
- `can_record_refunds`: whether this person sends refunds.
- When true:
  - `refunds_pending` (how many are ready) and `refund_modes`;
  - an `APPROVED` row for **every** Accounts-approved request, not only the ones they approved themselves;
  - on each approved row, `refund: {...row above, state: "waiting" | "ready" | "sent" | "not_due", waiting_for: [section names]}`.

The sender may also open those requests (`review`, `comment`, the cancelled-cheque download). The head's `GET /api/section/staff/` names who sends refunds now (`refund_senders`).

## Lab in-charge (`role: LAB`)

Each lab login belongs to exactly one lab (created by that department's HOD), so the lab is taken from the session — the body only names the request. Every endpoint answers `403` for non-lab logins, and `404` for a request that hasn't been sent to this lab (or isn't active).

| Method + path | Purpose | Notes |
|---|---|---|
| `GET /api/lab/queue/` | Requests sent to this lab | Same row shape as `/api/section/queue/`, plus `level`; `actionable` is false while an earlier-level lab isn't approved. `heading` = `"<lab> — <department>"` |
| `GET /api/lab/review/?request_id=<id>` | One request as this lab sees it | Same shape as `/api/section/review/`: `section` holds this lab's status + thread, `intake` is empty, `labs` is the chain overview |
| `POST /api/lab/approve/` | Approve ("no dues") | Body: `{request_id}`. `409` while an earlier-level lab isn't `APPROVED` |
| `POST /api/lab/reject/` | Reject ("dues") | Body: `{request_id, reason}`. `400` if `reason` is empty. If this lab had approved, later-level labs and HOD reset to `PENDING` (and HOD's own cascade follows) |
| `POST /api/lab/comment/` | Message the student | Body: `{request_id, body}` |

## HOD — department labs

Only an HOD with a department may call these; they always act on **that** department (`403` otherwise). Another department's lab id is a `404`.

| Method + path | Purpose | Notes |
|---|---|---|
| `GET /api/hod/labs/` | The department's labs | `{department, labs: [{id, name, incharge_name, email, level, is_active, waiting}]}` — `waiting` = students currently held up by that lab. Passwords are never returned |
| `POST /api/hod/labs/` | Add a lab and create its in-charge's login | Body: `{name, incharge_name?, email, password, level}`. `400` with a readable `detail` for: duplicate name in the department, email already used by any account, weak password (Django validators), level outside 1–20. `201 {lab}` |
| `PATCH /api/hod/labs/<id>/` | Edit / reset password / restore | Any of `{name, incharge_name, email, level, password}`; `{is_active: true}` restores a removed lab. A new `level` only affects students who start their lab chain afterwards |
| `DELETE /api/hod/labs/<id>/` | Remove from the chain | Drops the lab from in-progress requests it hasn't approved, disables its login. `{ok, outcome: "deleted" \| "deactivated", released}` — deleted outright if no request ever involved it, otherwise kept (restorable) for the record |

## Documents

| Method + path | Auth |
|---|---|
| `GET /api/document/<id>/download/` | Owning student, the section's officer (in scope), Administration (the only remaining consolidator — any section, any department), or — for Library/TPC documents specifically — any section officer (these are shown to every department as shared context, see `section_review`'s `intake`). `403` otherwise, `404` if missing |

## Roles reference

`ROLES = ["STUDENT"] + engine.ALL_SECTION_CODES + ["LAB", "ADMIN"]`, where `ALL_SECTION_CODES = [LIBRARY, TPC, WARDEN, STORE, LUCS, SPORTS, MEDICAL, NAD, HOD, ACCOUNTS, ADMINISTRATION]`. `LAB` is a department lab in-charge — those accounts are created by the department's HOD (`POST /api/hod/labs/`), not seeded per section. Section staff use their head's role itself — `LIBRARY`, `LUCS`, `NAD` or `ACCOUNTS` (created by that head, `POST /api/section/staff/`); `UserProfile.managed_by` is what tells them apart from the head, and `UserProfile.staff_level` is an Accounts staff member's level. A user's role is fixed on their `UserProfile`, not selectable at will — the `role` field sent to `/api/login/` is checked against it, not used to grant it.
