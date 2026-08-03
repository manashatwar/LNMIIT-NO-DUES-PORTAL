# Known Gaps & Ambiguities

A running list of everything found to be missing, stale, inconsistent, or ambiguous during the documentation pass, what (if anything) was done about it, and why. Keep this updated as the project evolves — it's the single place to check "is this actually still true?" before trusting an older doc.

## Officer review had no visibility into Page-2 intake docs; Department-Purpose removed; LUCS upload removed (eighth pass)

Reported directly: a Store/LUCS officer reviewing a student had no way to see what that student had already submitted at intake (the Library BTP form, the TPC offer letter, the vacated room) — `GET /api/section/review/` only attached other sections' documents for HOD/Administration (the two actual consolidator roles), so every other officer saw only their own section, with no student context at all.

| Change | Detail | Where |
|---|---|---|
| **Bug fix:** every officer now sees the student's Page-2 intake documents | Added an `intake` key to the `section_review` response — Library + TPC's documents/OCR/status, populated for every role (previously `prerequisites` only existed for HOD/Administration). Vacant room was already shown for everyone; this closes the same gap for the uploaded documents themselves | `No-Dues-Portal/main/api.py::section_review`, `frontend/src/types.ts` (`SectionReview.intake`), `frontend/src/pages/SectionApprovalPage.tsx` (new "🎒 Student Intake" panel) |
| **Removed Department-Purpose as a mandatory HOD gate** | HOD's prerequisites no longer include a dedicated department-purpose form upload. If an HOD genuinely needs a document from a student, they ask via the existing section comment thread (already built — `student_comment`/`officer_comment`) instead of a blocking upload requirement | `main/engine.py` (`PREREQUISITES`, `INDEPENDENT_SECTIONS`), `main/models.py` (removed `SECTION_DEPT`), `main/management/commands/seed_demo.py` (removed the `DEPT` section def and `dept.cse@` officer account), `frontend/src/{types,App,pages/LoginPage,pages/StudentDashboard}.tsx` |
| **LUCS converted to a confirm-only section** | Was an upload section (file or event-report link); now confirm-only (name/roll), same flow as Store/Sports/Medical/NAD | `seed_demo.py` (`is_upload_section: False`), `main/api.py` (`BASIC_CONFIRM_SECTIONS` now includes `SECTION_LUCS`), `frontend/src/pages/StudentDashboard.tsx` (`UPLOAD_SECTION_CONFIG` no longer has a `LUCS` entry, so it renders through the generic confirm flow) |

**Not a migration concern:** neither change touches the database schema. `Section.is_upload_section` is just a field value (reseeded via `seed_demo`), and no longer creating `DEPT` `SectionStatus` rows for *new* requests doesn't require deleting the old `DEPT` `Section` reference row or any already-existing `SectionStatus` rows tied to it — they just become inert. Reset demo data (`manage.py seed_demo --reset`) for a clean slate if you have existing test requests with a `DEPT` step from before this change.

**Verified:** `manage.py check` passes; `tsc -b` typechecks clean; confirmed via `docs/DESIGN.md`'s dependency graph that Accounts' prerequisites (Library, TPC, Warden, HOD) are unaffected — removing DEPT only changes HOD's own prerequisite list, nothing downstream of HOD.

**Docs updated:** `docs/DESIGN.md` (Section Flow diagram, dependency graph, Upload Handling, Screen Flow & Routes), `docs/API.md` (roles list, `section_review` response shape), `README.md` (section list, demo logins table), `LNMIIT_No_Dues_Portal_Research_Document.md` (LUCS and HOD entries annotated — the original research findings are kept, with a note on where the implementation deviates from them).

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

## Local `.env` not actually read by `manage.py`, and deploy-target portability (fifth pass)

While trying `manage.py runserver` directly against a real `.env` (Postgres password changed to a custom value, port changed to avoid the local collision from the fourth pass), it failed with `password authentication failed for user "nodues"` — a real, reproduced bug, not a hypothetical:

| Gap | Fix | Where |
|---|---|---|
| `.env` is only read by **Docker Compose** — a plain `python manage.py runserver` never sees it at all, so it always fell back to the hardcoded default (`nodues:nodues@localhost:5432`) regardless of what `.env` actually said | `myproject/settings.py` now calls `load_dotenv()` on the repo-root `.env` at import time (via `python-dotenv`), so `manage.py`/gunicorn/anything reading `os.environ` sees the same values Compose does. Never overrides a real env var that's already set (e.g. the ones Compose injects directly into a container) | `No-Dues-Portal/myproject/settings.py` |
| Even with `.env` loaded, there's no literal `DATABASE_URL` key in it — Compose *builds* one internally from `POSTGRES_*` using the Docker-internal hostname `db`, which a process running outside Docker can't resolve | The local-dev fallback in `DATABASES` now builds its own URL from the same `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_PORT`/`POSTGRES_DB` values in `.env`, against `localhost` instead of `db`. One set of credentials in one file now drives both the containerized and the bare-metal path — nothing to keep in sync by hand anymore | `No-Dues-Portal/myproject/settings.py` |
| Diagnosing this also surfaced that the local Postgres volume from the fourth pass's testing had gone stale (initialized once with an old password, `POSTGRES_PASSWORD` changed in `.env` afterward without recreating the volume — Postgres only applies that variable on first init) | Not a code bug — documented here because it's a real gotcha: changing `POSTGRES_PASSWORD` in `.env` after the volume already exists does nothing until you `docker compose down` + remove the `pgdata` volume so Postgres reinitializes | — (operational note, not a code change) |
| The frontend's nginx config hardcoded the backend's docker-compose service name (`backend:8000`) and listened on a fixed port 80 — fine for Compose, not portable to a platform like Railway where the backend's address and the port nginx must listen on are both assigned externally | `frontend/nginx.conf` → `frontend/nginx.conf.template`, using `${BACKEND_HOST}`, `${BACKEND_PORT}`, and `${PORT}` — substituted by the official nginx image's built-in `envsubst`-on-templates mechanism at container startup. `frontend/Dockerfile` sets defaults (`BACKEND_HOST=backend`, `BACKEND_PORT=8000`, `PORT=80`) matching `docker-compose.yml` exactly, so nothing changes for the Compose path; a platform like Railway just overrides those three variables | `frontend/nginx.conf.template`, `frontend/Dockerfile` |
| No deployment walkthrough existed for an actual hosting platform | Added [`docs/DEPLOY.md`](./DEPLOY.md) — Railway step by step (service layout, private networking, the `ALLOWED_HOSTS`-vs-`CSRF_TRUSTED_ORIGINS` domain gotcha, the ephemeral-filesystem-needs-a-volume gotcha for `uploaded_media/`), plus brief Render/Fly.io/VPS notes and guidance on load-testing a real deployment without surprising the hosting bill | `docs/DEPLOY.md` |

**Verified, not just written:** removed the stale `pgdata` volume and confirmed a *genuinely* fresh Postgres container actually reinitializes (checked the container's own boot log for "PostgreSQL Database directory appears to contain a database; Skipping initialization" being *absent*, not just assumed). With the fix in place and zero environment variables set by hand: `manage.py migrate`, `manage.py seed_demo`, and `manage.py runserver 8000` (backgrounded, curled, killed) all succeeded reading only `.env`. Rebuilt the frontend image after the template change and re-ran the full `docker compose up --build -d` → login round trip from the fourth pass again — still 200/200/302/200, and confirmed by inspecting the *rendered* `/etc/nginx/conf.d/default.conf` inside the running container that `${BACKEND_HOST}:${BACKEND_PORT}` and `${PORT}` were substituted correctly (`backend:8000`, `80`) while nginx's own `$host`/`$scheme` variables were left untouched. The Railway-specific steps in `docs/DEPLOY.md` are instructions, not something verified against a live Railway account in this pass.

## Self-inflicted regression: `.env` auto-load broke local CSRF (sixth pass)

Loading `.env` for local `manage.py runserver` (the fifth pass, above) fixed one problem and immediately caused another: logging in through the actual local dev flow (Vite on `:5173` → Django on `:8000`) started failing with `POST /api/login/ 403`.

| Gap | Fix | Where |
|---|---|---|
| `DJANGO_CSRF_TRUSTED_ORIGINS` in `.env.example`/`.env` is `http://localhost` — the right value for the single-domain Docker/production setup. Once `.env` started being loaded locally too (fifth pass), that one value *replaced* `settings.py`'s previous hardcoded local-dev default (which listed `:5173` and `:8000` explicitly), instead of adding to it. The result: Django only trusted `http://localhost` with no port, so any CSRF-protected request arriving with `Origin: http://localhost:5173` (exactly what the Vite dev proxy sends) was rejected with a 403 — a direct regression introduced by the fifth pass's own fix | `CSRF_TRUSTED_ORIGINS` now **always** includes the local dev origins (`:5173` and `:8000`, both `localhost` and `127.0.0.1`) and *adds* whatever `DJANGO_CSRF_TRUSTED_ORIGINS` specifies on top, rather than the env var replacing them. Trusting `localhost`/`127.0.0.1` costs nothing in a real deployment — a real attacker's browser can't be made to send `Origin: http://localhost` to a server that isn't actually their own machine | `No-Dues-Portal/myproject/settings.py` |

**Verified:** started `manage.py runserver 8000` and sent a request carrying `Origin: http://localhost:5173` + `Referer: http://localhost:5173/` (reproducing exactly what the Vite proxy forwards) through the full CSRF-cookie → token → `POST /api/login/` sequence — `403` before the fix, `200` with the correct user payload after.

**Why this one slipped through:** the fourth and fifth passes both verified login *through the Docker Compose stack* (single origin, nginx in front), which never exercises this specific cross-port CSRF path — only the bare `runserver` + separately-running Vite combination does. Worth remembering: the two local dev paths (Docker Compose vs. plain `manage.py runserver` + `npm run dev`) are different enough in origin/CSRF terms that passing one doesn't guarantee the other.

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

## Every document upload was silently broken with a 500 (seventh pass) — found while raising the size limit

While verifying the upload-size increase below, **every single document upload — of any size, going back to whenever `STORAGES` was first added to `settings.py` (the Docker/PostgreSQL passes) — was failing with an unhandled 500.** Not caught earlier because none of the previous "verified end-to-end" passes actually exercised `POST /api/student/upload/`; they tested login, csrf, admin, and migrations, but never a real file upload.

**Root cause:** Django 4.2+ treats `STORAGES` as a complete replacement for both the old `STATICFILES_STORAGE` *and* `DEFAULT_FILE_STORAGE` settings — defining the dict at all means you must supply **both** a `'staticfiles'` key **and** a `'default'` key, not just the one you actually meant to change. `settings.py` only defined `'staticfiles'` (for WhiteNoise). That left `Document.file` — and any other `FileField`/`ImageField` in the project — with **no file storage backend configured at all**, raising `InvalidStorageError: Could not find config for 'default' in settings.STORAGES` on every save.

| Fix | Where |
|---|---|
| Added `'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'}` to `STORAGES`, alongside the existing `'staticfiles'` entry | `No-Dues-Portal/myproject/settings.py` |

**Verified, not just written** — twice, since a bug this basic deserved more than one confirmation:
1. Reproduced directly (Django test client, in-process, so the real traceback was visible instead of a generic DEBUG=False error page): a 1 MB upload failed with `InvalidStorageError` before the fix, succeeded (`200`, real `document_id`) after.
2. Reproduced again through the **actual deployed shape** — a fully isolated Docker Compose stack (separate project name/ports, so it never touched your running dev environment or `.env`): login → upload through nginx → gunicorn → Postgres, `200` with a real `document_id`. Oversized (11 MB) correctly rejected with `400` and the right message. Isolated stack (containers + volumes) torn down completely afterward.

**Why this matters beyond just this bug:** it's a reminder that "the login flow works" and "the whole app works" are different claims — the previous passes' Docker verification was real but narrower than it read. Uploads (Library/TPC/LUCS/Dept-Purpose/Accounts — half the sections in the design) were the one major user-facing action never actually exercised end-to-end until now.

## Upload size limit: resolved to 10 MB (same pass)

This was previously listed below as an ambiguity — `docs/DESIGN.md` said `50 KB`, the code enforced `150 KB`, and neither actually held up against a real scanned/photographed signed document (the Library BTP form, the Department-Purpose form): both figures are closer to a thumbnail than a legible scan, and a low-resolution image also hurts OCR accuracy. Asked directly, and resolved by decision rather than guesswork — **10 MB**, which also happens to match what the original UI wireframe (`docs/images/ui-wireframe.png`) already showed ("Max 10MB" in its upload widget), so this isn't a new number so much as the codebase catching up to its own original design.

| Change | Where |
|---|---|
| `MAX_UPLOAD_BYTES = 10 * 1024 * 1024` (was `150 * 1024`), error message updated to match | `No-Dues-Portal/main/api.py` |
| `FILE_UPLOAD_MAX_MEMORY_SIZE` set to match (Django's 2.5 MB default wouldn't reject anything, but would push every upload through a temp-file round trip instead of staying in memory) | `No-Dues-Portal/myproject/settings.py` |
| Client-side pre-check + both UI hint labels updated (previously hardcoded to 150 KB in two places, plus a *third*, independently stale "50 KB" hint on the Rules page that had never matched the 150 KB actually enforced) | `frontend/src/pages/StudentDashboard.tsx`, `frontend/src/pages/RulesPage.tsx` |
| `client_max_body_size` raised to `15m` (10 MB + headroom for multipart overhead) — otherwise nginx would 413 a right-at-the-limit upload before Django ever saw it | `frontend/nginx.conf.template` |
| Docs updated: `docs/DESIGN.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `LNMIIT_No_Dues_Portal_Research_Document.md` | — |

**Verified together with the storage fix above** — the 1 MB/11 MB test cases in both verification rounds already exercise this limit, not just the storage backend.

**Worth knowing at scale:** this raises the storage ceiling per student — worst case, a few thousand students each uploading several documents at up to 10 MB is real disk space (tens of GB), not the few MB the old limit implied. Not a blocker, just a number to factor into whatever volume/storage sizing you plan for the deployment in `docs/DEPLOY.md`.

## Ambiguities worth a human decision

*(none open right now — check back here first before assuming something is settled)*
