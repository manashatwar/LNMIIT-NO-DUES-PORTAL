# Known Gaps & Ambiguities

A running list of everything found to be missing, stale, inconsistent, or ambiguous during the documentation pass, what (if anything) was done about it, and why. Keep this updated as the project evolves — it's the single place to check "is this actually still true?" before trusting an older doc.

## Fixed in this pass

| Gap | Fix | Where |
|---|---|---|
| `No-Dues-Portal/requirements.txt` was saved as UTF-16 (with embedded null bytes) — `pip install -r requirements.txt` fails on most systems | Rewritten as plain UTF-8 | `No-Dues-Portal/requirements.txt` |
| `SECRET_KEY`, `DEBUG=True`, and `ALLOWED_HOSTS=['*']` were hardcoded in `settings.py` and committed to the repo | Now read from `DJANGO_SECRET_KEY` / `DJANGO_DEBUG` / `DJANGO_ALLOWED_HOSTS` / `DJANGO_CSRF_TRUSTED_ORIGINS` env vars, with the same dev-safe values as fallback defaults — local `runserver` behavior is unchanged | `No-Dues-Portal/myproject/settings.py` |
| "Download Certificate" produced a plain `.txt` file even though `jspdf`/`html2canvas` (frontend) and `reportlab` (backend) were installed unused for exactly this purpose | Implemented a real client-side PDF: renders a formatted certificate off-screen, rasterizes it with `html2canvas`, embeds it in a PDF with `jsPDF`. Both libraries are now dynamically `import()`-ed only when the button is clicked, so the ~200 KB combined cost doesn't load for every visitor | `frontend/src/pages/StudentDashboard.tsx::downloadCertificate` |
| No root-level `README.md` existed | Added a full root `README.md` — architecture diagram, accurate current status, quickstart, demo logins, documentation map | `README.md` |

## Repository reorganization (second pass)

Once the LNMIIT rebuild was confirmed done, the planning/coordination documents that existed to track that build no longer had ongoing reference value at the repo root, and two project READMEs had gone stale. All were either removed or folded into `docs/` so `docs/` is now the single place for anything beyond a quickstart:

| File | What happened | Why |
|---|---|---|
| `Design.md` | Domain content (section flow, approval engine, correctness properties, screen routes, error handling, testing strategy) moved into [`docs/DESIGN.md`](./DESIGN.md); the file itself removed from the repo root | It was real, still-relevant domain reference — moved rather than deleted outright so the correctness properties and approval rules the code was built against aren't lost |
| `MIGRATION_PLAN.md` | Deleted entirely (not folded anywhere) | Purely a phase-by-phase status tracker for the rebuild; once the rebuild was confirmed done there was no lasting content beyond what this file and the root README already state |
| `BACKEND_CONNECTION.md` | Deleted entirely | Had gone stale itself (claimed the backend "uses the original IIT-G sections" and pointed at `MIGRATION_PLAN.md` for "next phase" work that was already done) — its accurate parts (why no CORS is needed, how to run both halves) are covered by the root `README.md` and `docs/ARCHITECTURE.md` |
| `frontend/README.md` | Deleted entirely | Stale on two counts: listed `StudentDetailPage.tsx`, which no longer exists, and gave a demo-login list for the old IIT-G roles (Faculty, Labs, Caretaker, Gymkhana, ...) instead of the current LNMIIT ones. Fully superseded by the root `README.md` |
| `No-Dues-Portal/README.md` | Deleted entirely | Documented the original IIT Guwahati project this was forked from: dead routes (`/login_user`), a different upstream repo link, and login instructions that no longer apply now that the API is JSON-based. Fully superseded by the root `README.md` |
| `image.png` (repo root) | Removed; the same file already lives at `docs/images/ui-wireframe.png` | Was a duplicate — the UI wireframe it shows (the original multi-page mockup this frontend was built from) is referenced from `docs/DATA_MODEL.md`, so it stays, just in one place |
| `No-Dues-Portal/main/images/` (`IITG.jpg` — 5.2 MB, `faculty.jpg`, `login.jpg`, `student.JPG`) | Deleted entirely | Screenshots of the original IIT Guwahati UI (its logo, "Indian Institute of Technology, Guwahati" branding, and the old role set — Caretaker/Gymkhana/Online-CC/CC/Assistant Registrar). Confirmed unreferenced by any code, template, or doc before removal (`grep -r "images/"` across `.py`/`.html`/`.ts`/`.tsx`) — they were only ever linked from the now-deleted `No-Dues-Portal/README.md` |

If you're looking for something that used to be in one of the removed files and can't find it: check `docs/DESIGN.md` first (most of the substance moved there), then `docs/ARCHITECTURE.md` and the root `README.md`.

## PostgreSQL + Docker Compose (third pass)

Two items that were previously "flagged, not fixed — needs a decision" got that decision (you asked for PostgreSQL specifically, and to add a Dockerfile) and are now implemented:

| Gap | Fix | Where |
|---|---|---|
| SQLite was the only supported database; would bottleneck under concurrent writes from many simultaneous section approvals | `DATABASES` now reads `DATABASE_URL` via `dj-database-url`. `docker-compose.yml`'s `db` service runs PostgreSQL 16 and wires `DATABASE_URL` automatically. *(Originally shipped with a SQLite fallback default for zero-setup local dev — removed one pass later; see the section below.)* | `No-Dues-Portal/myproject/settings.py`, `docker-compose.yml` |
| No production deployment config — no Dockerfile, gunicorn config, nginx config | Added both: `No-Dues-Portal/Dockerfile` (gunicorn, 3 workers, installs Tesseract for OCR) and `frontend/Dockerfile` (multi-stage `npm run build` → nginx), tied together by the root `docker-compose.yml`. `frontend/nginx.conf` proxies `/api`, `/admin`, `/static` to the backend so the browser has one origin, same property the Vite dev proxy gives locally | `No-Dues-Portal/Dockerfile`, `docker-entrypoint.sh`, `frontend/Dockerfile`, `frontend/nginx.conf`, `docker-compose.yml`, `.env.example` |
| No `STATIC_ROOT`/static-file storage configured — `collectstatic` had nothing to collect into | Added `STATIC_ROOT` + WhiteNoise (`whitenoise.middleware.WhiteNoiseMiddleware`, `CompressedManifestStaticFilesStorage`), so Django's own static files (admin CSS/JS) are served by the backend process itself and just proxied through nginx — no shared static volume needed between containers | `No-Dues-Portal/myproject/settings.py` |
| Shell scripts risked CRLF line endings from a Windows checkout (`core.autocrlf=true` in this repo), which breaks a `#!/bin/sh` shebang inside a Linux container | Added `.gitattributes` forcing LF for `*.sh`, `Dockerfile`, `*.conf` regardless of the cloning machine's line-ending settings | `.gitattributes` |

**Verified, not just written:** `manage.py check` (SQLite fallback) and `manage.py collectstatic` both pass; `docker compose config` validates the compose file; `docker compose build backend` succeeds end-to-end (installs Tesseract, installs the new Python deps, runs `collectstatic` at build time). The `frontend` image build (node build → nginx) was not run to completion in this pass — the Dockerfile follows a standard, well-tested pattern, but build it yourself once (`docker compose build frontend`) before relying on it.

**What this does *not* give you** — see `docs/SCALING.md` §8 for the full list: TLS/HTTPS termination, a real domain, a Postgres backup strategy, CI/CD, and non-root containers (both images currently run as root — the simplest option for a first pass, not a hardened one).

## PostgreSQL-only: no SQLite fallback anywhere (fourth pass)

The third pass added Postgres as the recommended/production database while quietly keeping a SQLite fallback default so local dev needed no setup. You have a dedicated branch for showcasing PostgreSQL specifically, so that fallback has now been removed entirely — Postgres is required in every environment, dev included:

| Change | Detail | Where |
|---|---|---|
| Removed the SQLite default from `DATABASES` | `dj_database_url.config(default=...)` now defaults to a local Postgres URL (`postgres://nodues:nodues@localhost:5432/nodues`) instead of a SQLite file path. Plain (non-Docker) local dev now needs a real Postgres — the fastest way is `docker compose up -d db`, reusing the same `db` service Docker Compose already defines (see root `README.md` Quickstart) | `No-Dues-Portal/myproject/settings.py` |
| Simplified `docker-entrypoint.sh` | Removed the `if cfg.get("ENGINE", "").endswith("sqlite3"): sys.exit(0)` early-exit branch — the entrypoint now always waits for Postgres, since that's the only case that exists | `No-Dues-Portal/docker-entrypoint.sh` |
| Removed `db.sqlite3` from `.gitignore`/`.dockerignore`, deleted the local file | Nothing generates a SQLite file anymore | `No-Dues-Portal/.gitignore`, `No-Dues-Portal/.dockerignore` |
| **Found and fixed a real bug while doing this:** an orphaned migration | `main/migrations/0006_supportoffice_student_bh1_approval_and_more.py` added a `SupportOffice` model and several `Student.*_approval` boolean fields (`bh1_approval`, `lucs_approval`, etc.) that exist in **no version of the current `models.py`** — leftover from an earlier, abandoned design (flag-per-section-on-Student, before the `SectionStatus` model existed). Worse, the committed dev `db.sqlite3` had it applied *out of dependency order* (0006 before its own dependency 0003), which made `manage.py makemigrations` crash immediately with `InconsistentMigrationHistory` the first time anyone tried to run it. Deleted the migration file; migrations `0001`–`0003` were confirmed consistent with current `models.py` against a fresh Postgres database | `main/migrations/0006_...py` (deleted) |
| Converted `Document.ocr_fields` to a real `JSONField` | It was a `TextField` (`ocr_fields_json`) with a Python `@property` doing manual `json.dumps`/`json.loads` — a workaround that existed *specifically* because SQLite had no JSON column type. With Postgres guaranteed, that workaround is gone: `ocr_fields` is now a native `JSONField` (Postgres `jsonb`). New migration `0004_remove_document_ocr_fields_json_document_ocr_fields.py`. `main/api.py`'s reads/writes needed no logic changes — only two `update_fields=[...]` lists renamed from `"ocr_fields_json"` to `"ocr_fields"`, since the attribute name (`ocr_fields`) was already the same (it used to be the property name) | `main/models.py`, `main/api.py`, `main/migrations/0004_...py` |
| Found a local port collision, documented it | `docker-compose.yml` originally published Postgres on host port 5432 unconditionally. On a dev machine that already runs a native Postgres install (or another project's container) on 5432, the browser/psycopg2 connection silently hits the *wrong* server — same symptom as a bad password, not an obvious "port in use" error. Added a `POSTGRES_PORT` env var (defaults to 5432, override in `.env`) and a callout in the README Quickstart | `docker-compose.yml`, `.env.example`, `README.md` |

**Verified, not just written** — this time end to end, not just `manage.py check`:
- `docker compose build backend` and `docker compose build frontend` both complete successfully (the frontend build wasn't finished in the third pass; it is now).
- `docker compose up --build -d` brings up all three containers (`db`, `backend`, `frontend`) healthy.
- `manage.py migrate`, `manage.py check`, and `manage.py makemigrations --check --dry-run` all pass clean against real PostgreSQL (the last one is the one that would have caught the orphaned-migration bug immediately, had it been run before).
- `manage.py seed_demo` succeeds against the containerized Postgres.
- A full HTTP round trip through nginx succeeds: `GET /` (SPA, 200), `GET /api/csrf/` (200), `GET /admin/` (302, correct unauthenticated redirect), and a complete `POST /api/login/` (CSRF cookie → token → login) returning the logged-in student's profile.
- The test stack (containers, volumes, the throwaway `.env` used to drive this) was torn down (`docker compose down`) after verification — nothing from this test run is left running or committed.

## Still open — flagged, not fixed (need a decision, not just docs)

| Gap | Detail | Why it wasn't just fixed here |
|---|---|---|
| No automated tests | `main/tests.py` is an empty stub. [`docs/DESIGN.md`](./DESIGN.md#correctness-properties) specifies 12 correctness properties (prerequisite gating, reverse-cascade consistency, hostel/department scoping, certificate gating/invalidation, upload validation, single-active-request) intended for Hypothesis property-based testing. None exist yet | Writing a real property-based test suite is substantial, deliberate engineering work with design choices of its own (fixtures, factories, how much to mock) — worth its own session rather than a rushed pass |
| Certificate is never persisted server-side | `Certificate.pdf_file` is defined on the model and migrated, but nothing ever writes to it — the PDF exists only in the browser that generated it. There's no server record of "this certificate was issued," no re-download from another device, and no institutional copy for audit | Two valid designs exist (upload the client-rendered PDF back to the server vs. generate it server-side with `reportlab`, which is already a dependency) — this is a product decision, not a bug fix |
| No DB indexes added for Postgres yet | `SectionStatus(status)`, `ClearanceRequest(is_active)`, `Student(hostel_id)`/`Student(department_id)` — the columns `section_queue()`/`_active_request()` filter on — have no explicit index. See `docs/SCALING.md` §2 | Should be added based on `EXPLAIN ANALYZE` under the load test (§6 of the same doc), not guessed at ahead of time |
| No session/cache backend beyond DB-backed sessions | Fine for a single `backend` replica; needed before `docker compose up --scale backend=N` is safe. See `docs/SCALING.md` §5 | No `redis` service in `docker-compose.yml` yet — adding one (plus `django-redis`) is a small, deliberate follow-up once horizontal scaling is actually needed |
| Load test hasn't been run | `docs/loadtest/locustfile.py` is ready and now has a real target (`docker-compose.yml`) to point it at | Running it, reading the results, and iterating is the concrete next step — not something to fake here |
| No rate limiting on `/api/login/` | A login endpoint with no rate limit is a credential-stuffing target once thousands of real accounts exist behind it | `django-ratelimit` or nginx's `limit_req` — a deliberate addition, not a default |
| Containers run as root | Both `No-Dues-Portal/Dockerfile` and `frontend/Dockerfile` run as the base image's default (root) user | Simplest option for a first pass; switching to a non-root user needs the `uploaded_media`/`pgdata` volume permissions worked out at the same time, not bolted on after |
| OCR quietly no-ops without Tesseract (locally) | By design (`main/ocr.py` catches the import error and returns empty results) — a dev machine without Tesseract will never see OCR warnings, which can look like "OCR is broken" when it's just absent. The Docker image installs Tesseract, so this only affects local (non-Docker) dev | Documented so it isn't mistaken for a bug during a demo |
| Two `.venv` folders exist (`./.venv` and `No-Dues-Portal/.venv`) | Both are correctly gitignored (root `.gitignore`'s `.venv/` pattern matches at every directory depth), so this isn't a repo-hygiene bug — just possible confusion about which one has Django installed | Not touched — deleting either could be someone's in-progress environment |

## Ambiguities worth a human decision

- **`docs/DESIGN.md` vs. reality**: the document describes a `50 KB` upload limit; the code enforces `150 KB` (`main/api.py::MAX_UPLOAD_BYTES`, deliberately relaxed per its own comment). Worth deciding whether to update the doc's number or revert the code — left alone here since both are internally consistent, just mismatched with each other.
