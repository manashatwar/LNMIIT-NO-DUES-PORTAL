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

## Still open — flagged, not fixed (need a decision, not just docs)

| Gap | Detail | Why it wasn't just fixed here |
|---|---|---|
| No automated tests | `main/tests.py` is an empty stub. [`docs/DESIGN.md`](./DESIGN.md#correctness-properties) specifies 12 correctness properties (prerequisite gating, reverse-cascade consistency, hostel/department scoping, certificate gating/invalidation, upload validation, single-active-request) intended for Hypothesis property-based testing. None exist yet | Writing a real property-based test suite is substantial, deliberate engineering work with design choices of its own (fixtures, factories, how much to mock) — worth its own session rather than a rushed pass |
| Certificate is never persisted server-side | `Certificate.pdf_file` is defined on the model and migrated, but nothing ever writes to it — the PDF exists only in the browser that generated it. There's no server record of "this certificate was issued," no re-download from another device, and no institutional copy for audit | Two valid designs exist (upload the client-rendered PDF back to the server vs. generate it server-side with `reportlab`, which is already a dependency) — this is a product decision, not a bug fix |
| No production deployment config | Settings are now env-driven, but there's no committed Dockerfile, gunicorn config, nginx config, or CI/CD pipeline | Deployment topology depends on where LNMIIT actually intends to host this (their own server room? a cloud VM? containers?) — recommendations are in `docs/SCALING.md`, but standing up a specific one wasn't something to guess at |
| SQLite in the settings default | Fine for development; will bottleneck under concurrent writes from many simultaneous section approvals. See `docs/SCALING.md` for the PostgreSQL migration path | Left as the default per your instruction to keep this pass docs-and-recommendations only, not a DB migration |
| OCR quietly no-ops without Tesseract | By design (`main/ocr.py` catches the import error and returns empty results) — but it means a dev machine without Tesseract installed will never see OCR warnings, which can look like "OCR is broken" when it's just absent | Documented in the README/architecture docs so it isn't mistaken for a bug during a demo |
| Two `.venv` folders exist (`./.venv` and `No-Dues-Portal/.venv`) | Both are correctly gitignored (root `.gitignore`'s `.venv/` pattern matches at every directory depth), so this isn't a repo-hygiene bug — just possible confusion about which one has Django installed | Not touched — deleting either could be someone's in-progress environment |

## Ambiguities worth a human decision

- **`docs/DESIGN.md` vs. reality**: the document describes a `50 KB` upload limit; the code enforces `150 KB` (`main/api.py::MAX_UPLOAD_BYTES`, deliberately relaxed per its own comment). Worth deciding whether to update the doc's number or revert the code — left alone here since both are internally consistent, just mismatched with each other.
