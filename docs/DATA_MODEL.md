# Data Model

Source: `No-Dues-Portal/main/models.py`. This mirrors [`DESIGN.md`](./DESIGN.md#data-models) closely — differences from that spec are called out below.

## Entity relationship diagram

```mermaid
erDiagram
    DEPARTMENT ||--o{ STUDENT : has
    HOSTEL ||--o{ STUDENT : houses
    STUDENT ||--o{ CLEARANCEREQUEST : initiates
    CLEARANCEREQUEST ||--|{ SECTIONSTATUS : contains
    SECTION ||--o{ SECTIONSTATUS : tracked_in
    SECTIONSTATUS ||--o{ DOCUMENT : has
    SECTIONSTATUS ||--o{ COMMENT : has
    CLEARANCEREQUEST ||--o| CERTIFICATE : yields
    USERPROFILE }o--o| HOSTEL : scoped_to
    USERPROFILE }o--o| DEPARTMENT : scoped_to
    USERPROFILE ||--|| USER : extends

    DEPARTMENT {
        string code "CCE | CSE | ECE | MME, unique"
    }
    HOSTEL {
        string code "BH1..BH5 | GH1, unique"
    }
    SECTION {
        string code "LIBRARY | TPC | ... unique"
        string name
        int order "stage ordering"
        bool is_upload_section
        bool is_consolidator "HOD, Administration"
    }
    USERPROFILE {
        int user FK "OneToOne -> auth.User"
        string role "STUDENT | LIBRARY | ... | ADMIN"
        int hostel FK "nullable, wardens only"
        int department FK "nullable, HODs only"
    }
    STUDENT {
        int user FK "OneToOne -> auth.User"
        string name
        string roll_no "CharField — TEXT, e.g. 24UCC174"
        int department FK
        int hostel FK
        string webmail
    }
    CLEARANCEREQUEST {
        int student FK
        string exit_type "GRADUATION | NEP_EXIT | WITHDRAWAL | ADMISSION_CANCEL"
        string overall_status "IN_PROGRESS | CLEARED"
        decimal fund_us_amount
        bool is_active "true = the one active request"
        string vacant_room_no
        bool intake_submitted "page-1 lock"
        datetime created_at
    }
    SECTIONSTATUS {
        int request FK
        int section FK
        string status "PENDING | APPROVED | REJECTED"
        int decided_by FK "nullable -> auth.User"
        datetime decided_at
        bool student_confirmed "gate before officer sees it"
    }
    DOCUMENT {
        int section_status FK
        file file "nullable — LUCS link mode has none"
        string event_report_url "nullable, LUCS link mode"
        string original_name
        datetime uploaded_at
        text ocr_text
        json ocr_fields "native Postgres jsonb"
    }
    COMMENT {
        int section_status FK
        int author FK "nullable -> auth.User; null = system comment"
        text body
        bool is_system
        datetime created_at
    }
    CERTIFICATE {
        int request FK "OneToOne"
        file pdf_file "nullable — currently never populated"
        decimal fund_us_amount
        datetime generated_at
    }
```

## Notable implementation details vs. `DESIGN.md`

| DESIGN.md says | Code actually does | Why |
|---|---|---|
| One `ClearanceRequest` per student, full stop | `ClearanceRequest.is_active` flags the current one; `_active_request()` filters on it | Lets history (past exit attempts) stay in the table instead of being deleted |
| — | `ClearanceRequest.intake_submitted` and `SectionStatus.student_confirmed` | Not in `DESIGN.md` — added so "basic" (name/roll-only) sections and the Library/TPC/Warden "tri-gate" only reach an officer's queue after the student explicitly confirms, matching the actual multi-page frontend flow (see `docs/images/ui-wireframe.png`) |
| `Certificate.pdf_file` holds the generated PDF | Never populated — the PDF is generated **client-side** and never uploaded back to the server | Means there's no server-retained copy of an issued certificate |

## Validation invariants (enforced in `engine.py` / `api.py`, not database constraints)

- `roll_no` round-trips as text — never cast to `int` anywhere in the codebase (`DESIGN.md` Property 1).
- `(request, section)` is unique per `SectionStatus` (`Meta.unique_together`).
- A `REJECTED` `SectionStatus` always has an associated `Comment` written in the same request (`engine.reject`).
- `approve()` refuses to run unless every prerequisite section for that section is `APPROVED` (`engine.actionable`).
- Reopening any `APPROVED` section deletes the request's `Certificate` if one exists (`engine._invalidate_certificate`).

None of the above are currently exercised by an automated test suite.
