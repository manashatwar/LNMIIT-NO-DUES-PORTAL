# Architecture

This describes the system as implemented — a decoupled React SPA talking to a Django JSON API — verified against the code (`No-Dues-Portal/main/*.py`, `frontend/src/*`). For the domain rules (why the section order is what it is, the correctness properties), see [`DESIGN.md`](./DESIGN.md).

## System overview

```mermaid
flowchart LR
    subgraph Client["Student / Officer's browser"]
        SPA[React SPA<br/>frontend/src]
    end

    subgraph Server["Django (No-Dues-Portal/)"]
        direction TB
        URLS[main/urls.py] --> VIEWS[main/api.py<br/>JSON views]
        VIEWS --> GUARD[Auth + role/scope guard<br/>_scope_ok / login_required]
        VIEWS --> ENGINE[main/engine.py<br/>Approval engine]
        VIEWS --> OCRSVC[main/ocr.py<br/>Advisory OCR]
    end

    ORM[(Django ORM)]
    DB[(PostgreSQL)]
    MEDIA[(uploaded_media/<br/>outside web root)]

    SPA <-->|"fetch('/api/...')<br/>same-origin via Vite proxy"| URLS
    ENGINE --> ORM
    VIEWS --> ORM
    ORM --> DB
    VIEWS -->|store/serve uploads| MEDIA
```

**Session auth, not tokens.** Django's built-in session framework (cookie-based) authenticates every request. The SPA never handles a JWT or bearer token. `GET /api/csrf/` sets the CSRF cookie before any `POST`; `src/api.ts::ensureCsrf()` fetches it automatically the first time a mutating request is made, then attaches it as the `X-CSRFToken` header, matching Django's default `CsrfViewMiddleware` expectations.

**Why the Vite proxy matters.** `frontend/vite.config.ts` proxies `/api/*` to `http://127.0.0.1:8000` in development. Because the browser only ever talks to `localhost:5173`, the session cookie set by Django is same-origin — no CORS headers, no `SameSite=None`, no cross-site cookie complications. In production this same property is achieved by putting both the built SPA and the Django app behind one reverse-proxy host (see [SCALING.md](./SCALING.md)).

## Request lifecycle: student clearance

```mermaid
sequenceDiagram
    actor S as Student
    participant SPA as React SPA
    participant API as Django API
    participant ENG as Approval engine
    participant DB as Database

    S->>SPA: Log in (webmail + password + role)
    SPA->>API: GET /api/csrf/
    SPA->>API: POST /api/login/
    API-->>SPA: {username, role, name}

    S->>SPA: Select exit type, vacated room
    SPA->>API: POST /api/student/initiate/
    API->>DB: create ClearanceRequest + one SectionStatus per required section
    API-->>SPA: request (PENDING everywhere)

    S->>SPA: Upload Library/TPC documents
    SPA->>API: POST /api/student/upload/ (multipart)
    API->>API: validate size/type
    API->>API: OCR (advisory, best-effort)
    API->>DB: create Document, attach OCR fields
    API-->>SPA: {warnings, autofill}

    S->>SPA: Submit intake (locks page 1)
    SPA->>API: POST /api/student/submit-intake/
    API->>DB: intake_submitted = True

    Note over API,DB: Independent sections (Store/Sports/Medical/NAD/...)<br/>are actionable immediately — officers approve/reject in parallel

    par Officer reviews
        actor O as Section officer
        O->>SPA: Open scoped queue
        SPA->>API: GET /api/section/queue/
        API->>DB: filter by section + hostel/dept scope
        O->>SPA: Approve / Reject (+reason)
        SPA->>API: POST /api/section/approve/ or /reject/
        API->>ENG: engine.approve() / engine.reject()
        ENG->>ENG: check actionable() (prerequisites APPROVED)
        ENG->>DB: update SectionStatus, write Comment (atomic)
        ENG->>ENG: recompute_overall()
    end

    Note over ENG,DB: HOD is independent — actionable immediately, in parallel with Store/LUCS/Sports/Medical/NAD.<br/>Accounts becomes actionable once Library+TPC+Warden+HOD clear.<br/>Administration once Accounts clears

    API-->>SPA: overall_status = CLEARED
    S->>SPA: Download certificate
    SPA->>API: POST /api/student/certificate/
    API-->>SPA: certificate JSON (student, sections, approvers, timestamps)
    SPA->>SPA: render off-screen HTML → html2canvas → jsPDF → save file
```

## Reverse-hierarchy cascade

The one property worth tracing end to end, since it's what makes the final certificate trustworthy:

```mermaid
sequenceDiagram
    participant O as Officer (e.g. Library)
    participant API as Django API
    participant ENG as engine.py
    participant DB as Database

    Note over DB: Accounts and Administration were already APPROVED, built on Library=APPROVED

    O->>API: POST /api/section/reject/ {request_id, reason}
    API->>ENG: engine.reject(section_status, actor, reason)
    ENG->>DB: Library.status = REJECTED (in one transaction)
    ENG->>ENG: _on_status_change(previous=APPROVED)
    ENG->>ENG: downstream_closure(LIBRARY) → {ACCOUNTS, ADMINISTRATION}
    loop each downstream section that was APPROVED
        ENG->>DB: status = PENDING, decided_by = None, decided_at = None
        ENG->>DB: create system Comment "Reset: upstream LIBRARY reopened"
    end
    ENG->>DB: delete Certificate if one existed
    ENG->>DB: overall_status = IN_PROGRESS
```

All of this runs inside a single `transaction.atomic()` block (`engine.py::approve`/`reject`) — the matrix is never left half-updated if the process dies mid-cascade.

## Component responsibilities

| Component | File | Responsibility |
|---|---|---|
| Auth + role/scope guard | `main/api.py::_scope_ok`, `_profile`, `@login_required` | Every state-changing view re-checks role AND hostel/department scope server-side — never trusts client-supplied role claims |
| Approval engine | `main/engine.py` | Owns `PREREQUISITES`, `actionable()`, `approve()`/`reject()`, `downstream_closure()`, `recompute_overall()` |
| OCR service | `main/ocr.py` | Best-effort text extraction; returns `("", {}, [])` if Tesseract/Pillow aren't available — never blocks the upload |
| Upload handling | `main/api.py::upload_document` | Type/size validation (10 MB; JPG/PNG/PDF), stores outside web root (`MEDIA_ROOT`), re-opens rejected sections on re-upload |
| Certificate | `frontend/src/pages/StudentDashboard.tsx::downloadCertificate` | Client-side PDF via jsPDF/html2canvas (lazy-loaded); backend only supplies the JSON payload |
| SPA session bootstrap | `frontend/src/App.tsx` | Calls `GET /api/me/` on load to restore an existing Django session before rendering routes |

## Data flow for documents

Uploaded files never sit under `STATIC_URL`. They're written to `MEDIA_ROOT` (`uploaded_media/`, gitignored) and served only through `GET /api/document/<id>/download/`, which re-checks: is the caller the owning student, the section's officer (in scope), Administration (the only remaining consolidator), or — for Library/TPC specifically — any section officer. Always a forced download (`Content-Disposition: attachment`), not an inline open — inline rendering silently failed (a broken-image placeholder, no error) for anything the browser's content-type guess got wrong. See `main/api.py::document_download`.
