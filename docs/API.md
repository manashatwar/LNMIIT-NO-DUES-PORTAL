# API Reference

Base path: `/api/` (proxied from the SPA's `/api/*` in dev — see [ARCHITECTURE.md](./ARCHITECTURE.md)). All endpoints use Django session auth; all mutating endpoints (`POST`) require the `X-CSRFToken` header, which `frontend/src/api.ts` attaches automatically. Source of truth: `No-Dues-Portal/main/urls.py` + `main/api.py`.

Unless noted, error responses are `{"detail": "..."}` with a `4xx`/`5xx` status.

## Auth

| Method + path | Auth | Purpose |
|---|---|---|
| `GET /api/csrf/` | none | Sets the `csrftoken` cookie the SPA needs before its first `POST` |
| `POST /api/login/` | none | Body: `{username, password, role}`. `username` is the webmail. Returns the same shape as `/api/me/`. `401` on bad credentials, `403` if the role doesn't match the account's `UserProfile.role` |
| `POST /api/logout/` | session | Ends the Django session |
| `GET /api/me/` | session | `{username, role, name, hostel?, department?}` — used by the SPA on page load to restore a session |

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
| `POST /api/student/certificate/` | Generate/fetch certificate data | — | `400` unless `overall_status == CLEARED`. Returns JSON only — the SPA renders the actual PDF client-side (see [KNOWN_GAPS.md](./KNOWN_GAPS.md)) |

### `ClearanceRequest` shape (`_request_dict` in `api.py`)

```jsonc
{
  "id": 12,
  "exit_type": "GRADUATION",
  "overall_status": "IN_PROGRESS",       // or "CLEARED"
  "fund_us_amount": "1000.00",
  "vacant_room_no": "BH1-102",
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
    }
    // one entry per section required for this exit_type
  ],
  "has_certificate": false
}
```

## Officer (any section role: `LIBRARY`, `TPC`, `WARDEN`, `STORE`, `LUCS`, `SPORTS`, `MEDICAL`, `NAD`, `HOD`, `ACCOUNTS`, `ADMINISTRATION`)

| Method + path | Purpose | Scope enforcement |
|---|---|---|
| `GET /api/section/queue/` | This officer's queue | Warden → own hostel only; HOD → own department only (`_scope_ok`); only rows with `student_confirmed=True` appear |
| `GET /api/section/review/?request_id=<id>` | Full detail for one request in this officer's section | `403` if out of scope. Every officer additionally sees the student's Page-2 tri-gate status (Library/TPC documents + OCR, and Warden/hostel status — response key `intake`) for context — not just their own section. HOD/Administration further see their prerequisite sections' documents/OCR for consolidation (`prerequisites`) |
| `POST /api/section/approve/` | Approve | `409` if prerequisites aren't all `APPROVED` yet (`engine.PermissionError_`) |
| `POST /api/section/reject/` | Reject | Body: `{request_id, reason}`. `400` if `reason` is empty (`engine.ValidationError_`) |
| `POST /api/section/comment/` | Post a feedback comment | Body: `{request_id, body}` |

## Documents

| Method + path | Auth |
|---|---|
| `GET /api/document/<id>/download/` | Owning student, the section's officer (in scope), a consolidator (HOD within its department / Administration for any section), or — for Library/TPC documents specifically — any section officer (these are shown to every department as shared context, see `section_review`'s `intake`). `403` otherwise, `404` if missing |

## Roles reference

`ROLES = ["STUDENT"] + engine.ALL_SECTION_CODES + ["ADMIN"]`, where `ALL_SECTION_CODES = [LIBRARY, TPC, WARDEN, STORE, LUCS, SPORTS, MEDICAL, NAD, HOD, ACCOUNTS, ADMINISTRATION]`. A user's role is fixed on their `UserProfile`, not selectable at will — the `role` field sent to `/api/login/` is checked against it, not used to grant it.
