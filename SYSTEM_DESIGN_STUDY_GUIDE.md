
# No-Dues Portal — System Design Review & Interview Study Guide



0. Start Docker Desktop from the Start menu and wait until it says "Engine running".

Terminal 1: database (your demo data)


cd C:\Users\manis\OneDrive\Desktop\LNMIIT-NO-DUES-PORTAL
docker compose up -d db
Terminal 2: backend (Django)


cd C:\Users\manis\OneDrive\Desktop\LNMIIT-NO-DUES-PORTAL\backend
C:\Users\manis\.venvs\nodues\Scripts\python.exe manage.py runserver 8000
Terminal 3: frontend (website)


cd C:\Users\manis\OneDrive\Desktop\LNMIIT-NO-DUES-PORTAL\frontend
npm install
npm run dev


This file reviews the No-Dues Portal the way a senior engineer would before launch: what is solid, what breaks under load or attack, and how to fix it. Every problem is linked to the computer-science subject behind it (DBMS, OS, Networks, DSA, Security, Software Engineering, System Design). Studying this file is studying for interviews, with **your own project** as the example.

**How to read it**
1. Read §1 (how the system works today) and §2 (what is already good).
2. Work through §3, one fault at a time. Each has: the **problem** (with file and line), **why it hurts**, the **fix**, the **concepts to learn**, and a likely **interview question**.
3. §4 is the improved architecture, §5 a worked capacity estimate, §6 the interview question bank, §7 the subject map, §8 a study plan.

**About the numbers.** *Measured* = measured on 14 Nov 2026 on this laptop, on a throwaway database with 261 demo students (local Postgres, Django test client, so no network delay between app and DB; a real server would be slower). *Estimated* = extrapolated or assumed. In an interview, always say which one a number is.

**Updated 27 Nov 2026:** the backend now lives in `backend/` (Django settings in `backend/config/`), the workflow has three tiers (§1), there are 65 tests, and every code link points at the current code.

---

## 1. The system today

```
 Browser: React single-page app (student / officer / staff / lab in-charge)
    │   plain HTTP in docker-compose · session cookie + CSRF token
    ▼
 nginx  (frontend container)
    ├── /                     → built React files (index.html, /assets/*.js, *.css)
    └── /api  /admin  /static → reverse proxy to the backend
    ▼
 gunicorn: 3 synchronous worker processes  (backend container)
    └── Django
         api.py        HTTP + permission checks + some business rules (≈1,700 lines)
         engine.py     the approval workflow (a dependency graph) + reverse cascade
         staff.py      staff "by hand" (Library, LUCS, NAD, Administration) and "by level" (Accounts)
         labs.py · checklist.py · refunds.py
         ocr.py        Tesseract OCR, run inside the upload request
    ▼
 PostgreSQL 16 (db container)            uploaded_media/  (local disk volume)
```

**Data model in one breath:** one `ClearanceRequest` per student exit → one `SectionStatus` per required office (PENDING / APPROVED / REJECTED) → extra rows per office: `StageApproval` (one per Accounts level), `LabStatus` (one per department lab), `ChecklistTick` (Administration), `Document` (uploads + OCR JSON), `Comment` (messages) → `Refund` (one per request) → `overall_status = CLEARED` → the student downloads a certificate.

**The workflow is a graph, in three tiers.**
1. **Tri-gate:** Library, TPC and Warden (TPC only for graduation).
2. **Six departments, all at once:** when the tri-gate clears, the request goes automatically to Store, LUCS, Sports, Medical, NAD and HOD. HOD also waits for its department's labs; a department with no labs lets the HOD approve directly.
3. **Accounts and Administration, in parallel:** they open when all six departments approve.

A desk sees a request only once its prerequisites have approved (Accounts lists it early as "Not ready yet"). CLEARED means all 11 offices approved and the refund was recorded. If an approved office reopens (rejects), everything that depended on it is reset (the *reverse cascade*): a Library reopen resets the six departments and the final two.

**One request, end to end** ("officer opens Incoming"): browser `GET /api/section/queue/` → nginx → one free gunicorn worker → Django reads the session from the DB → loops over **every** row of that office → returns JSON → the browser filters tabs (Incoming / Approved / Rejected) itself.

---

## 2. What is already good (say these in interviews too)

| Strength | Concept | Where |
|---|---|---|
| One origin through nginx: no CORS, first-party cookies, CSRF on every write | Same-origin policy, reverse proxy | `frontend/nginx.conf.template` |
| Workflow modelled as a dependency graph; reopen resets dependents with a DFS | Graphs, DFS with an explicit stack | `engine.py` `downstream_closure` (line 176) |
| "Send the next 35" can never give the same request to two people | Work-queue pattern, `SELECT … FOR UPDATE SKIP LOCKED` | `staff.py:487` |
| Accounts levels and refunds lock their rows | Pessimistic locking | `staff.py:262`, `refunds.py:251` |
| Approve sends the level the officer *saw*; the server refuses if it moved on | Optimistic concurrency control | `staff.py` `approve_level` |
| A student's lab chain is copied at first send; later HOD edits don't reshuffle it | Snapshotting / versioning | `engine.py` `send_next_lab_level` |
| Documents are served only after a permission check, never as public files | Access control | `api.py` `document_download` |
| Money as `Decimal`; one `Refund` per request (OneToOne), re-posting corrects it | Correct numeric types, idempotency | `models.py`, `refunds.py` |
| Business dates in IST, timestamps in UTC | Time zones at the edges | `refunds.py` `INSTITUTE_TZ` |
| Config from environment variables; Docker images; migrations on deploy | 12-factor app, containers | `settings.py`, `Dockerfile` |
| 65 integration tests, plus mutation checks (break the code on purpose, make sure a test fails) | Testing, mutation testing | `main/tests.py` |
| PDF libraries loaded only when a certificate is downloaded | Code splitting / lazy loading | `StudentDashboard.tsx:309` |

---

## 3. The faults, ranked

| # | Fault | Severity | CS subject |
|---|---|---|---|
| F1 | Officer desks run ~10 SQL queries **per student** (N+1) — measured | 🔴 Critical | DBMS |
| F2 | Students with NEP exit / withdrawal / admission-cancel can **never** be cleared (real bug) | 🔴 Critical | DSA (graphs) |
| F3 | Only 3 workers, and slow work runs inside requests | 🔴 Critical | OS, queueing theory |
| F4 | Race conditions in normal approve / reject | 🟠 High | DBMS (transactions) |
| F5 | The certificate can be forged | 🟠 High | Security, cryptography |
| F6 | Login and configuration security gaps | 🟠 High | Security, networks |
| F7 | Whole list sent on every load: no pagination, no HTTP caching, no push | 🟠 High | Networks, system design |
| F8 | Approval history is overwritten or deleted | 🟡 Medium | DBMS, auditing |
| F9 | Derived state handled two different ways | 🟡 Medium | DBMS (normalization) |
| F10 | Huge files, `if section == …` everywhere, hand-copied types | 🟡 Medium | Software engineering |
| F11 | App servers hold state, so more servers can't be added safely | 🟡 Medium | Distributed systems |
| F12 | No indexes beyond the automatic ones; no cache headers for static files | 🟡 Medium | DBMS, networks |
| F13 | No monitoring, backups or CI/CD; load test never run | 🟡 Medium | DevOps, SRE |
| F14 | Notifications only inside the app | 🟢 Low | Messaging systems |

---

### F1 — Officer desks: the N+1 query problem (measured) — ✅ FIXED 15 Nov 2026

> **How it was fixed** (worth retelling in an interview — measure, fix, prove, guard):
> - **Batch loading:** new `main/prefetch.py`. Each desk loads what its rules read up front with `select_related()` (JOINs) and `prefetch_related()` (one `IN (…)` query per relation). The helpers (`engine.actionable`, `staff.current_level`, `refunds.row_state`, `checklist.entries`, …) read those loaded rows and fall back to their old single query on a lone object. The staff panel's per-person counts became one `GROUP BY` query each.
> - **Results** (341 students, laptop + local Postgres):
>
>   | Endpoint | Queries before → after | Time before → after |
>   |---|---|---|
>   | accounts@ desk | 2,869 → 21 | 2.99 s → 0.21 s |
>   | HOD (CSE) desk | 1,812 → 7 | 1.52 s → 0.04 s |
>   | Library desk | 1,034 → 9 | 0.90 s → 0.03 s |
>   | Accounts staff panel | 1,021 → 18 | 1.16 s → 0.17 s |
>   | student dashboard | 63 → 18 | 61 ms → 15 ms |
>
>   Query counts are now identical for 86 and 341 students: **O(1) queries instead of O(N)**.
> - **Proof the behaviour didn't change:** every response of 35 endpoint/role combinations, on both data sizes, is byte-identical before and after. One trap found on the way: section lists had no `ORDER BY`. The old per-request query happened to come back in section order (Postgres walked the `(request, section)` unique index); the batched query used another plan and returned a different order. Fix: an explicit `order_by("section__order")`. Lesson: **without ORDER BY, SQL guarantees no order**, so never rely on one.
> - **Guard:** `QueryCountTests` counts each endpoint's queries, adds students (or staff, or messages), and fails if the count changes. Seven deliberately re-introduced N+1s were all caught.
>
> The original analysis follows.

**Problem.** `section_queue` ([api.py:794](backend/main/api.py#L794)) loops over every row ([line 849](backend/main/api.py#L849)). For Accounts it calls `staff_service.stage_info()` ([line 873](backend/main/api.py#L873)); for the refund sender it also calls `refund_service.row_state()` ([line 878](backend/main/api.py#L878)). Each helper runs its own queries: `current_level()` reads `ss.stage_approvals.values_list(...)` ([staff.py:163](backend/main/staff.py#L163)), `stage_ready()` reads the latest document ([staff.py:141](backend/main/staff.py#L141)), `engine.actionable()` loads all the request's sections ([engine.py:220](backend/main/engine.py#L220)) — once **per row**.

**Measured** (261 demo students):

| Desk | Rows | SQL queries | Queries per row | Time | Response size |
|---|---|---|---|---|---|
| accounts@ | 261 | **2,609** | 10 | **2.2 s** | 100 KB |
| Accounts staff (Level 1) | 250 | 2,012 | 8 | 1.8 s | 94 KB |
| admin.office@ | 261 | 1,056 | 4 | 0.9 s | 103 KB |
| library@ | 261 | 794 | 3 | 0.6 s | 76 KB |
| one student's dashboard | — | 70 | — | 0.06 s | 4 KB |

Queries grow linearly with students: **Q ≈ 10 × N**. *Estimated:* with 3,000 students, ~30,000 queries and ~26 s per load (8.6 ms per row). gunicorn kills any request after 30 s (`--timeout 30`, [Dockerfile:27](backend/Dockerfile#L27)), so the desk would start failing at around 3,500 students.

**Why it hurts.** Every query is a round trip: send SQL, parse, plan, execute, return. Even at 0.5 ms each, 30,000 queries is 15 s. On a real server the DB is on another machine, so each query also pays network latency and it gets worse.

**Fix, in order of value:**
1. **Load everything in a fixed number of queries.** `select_related` (SQL JOIN) for foreign keys, `prefetch_related` (one extra `WHERE id IN (…)` query per relation) for reverse relations, then compute each row's stage in Python from the loaded objects. Target: ~10 queries in total, whatever N is.
   ```python
   from django.db.models import Prefetch

   qs = (SectionStatus.objects
         .filter(section__code=role, request__is_active=True)
         .select_related("section", "request__student__department", "request__student__hostel")
         .prefetch_related(
             "stage_approvals__approved_by",
             Prefetch("documents", queryset=Document.objects.order_by("-uploaded_at", "-id")),
             Prefetch("request__section_statuses", queryset=SectionStatus.objects.select_related("section")),
         ))
   # Use the cache:   done = {a.level for a in ss.stage_approvals.all()}
   ```
   **Gotcha:** `.values_list()`, `.filter()`, `.order_by().first()` and `.exists()` on a related manager **ignore** the prefetch cache and query again. The helpers must be rewritten to take preloaded data.
2. **Store the current level** (denormalize): add `SectionStatus.current_level`, update it in the same transaction as every approval, and recompute it in bulk only when the head changes staff (rare). "At Level 2" then becomes `WHERE current_level = 2`, which can use an index.
3. **Paginate** (F7), so one load handles 50 rows, not 3,000.
4. **Lock it in with a test:** `with self.assertNumQueries(12): client.get("/api/section/queue/")`. Then a future change can't silently bring N+1 back. In development, use django-debug-toolbar to see queries.

**Learn (DBMS):** N+1 problem, JOIN vs batched `IN` queries, ORM lazy loading, denormalization trade-off (faster reads, more complex writes, risk of drift), `EXPLAIN ANALYZE`.

**Interview:** *"A page is slow. How do you find out why?"* → Measure before guessing: count queries and time per endpoint (I found 2,609 queries for 261 rows), find the biggest cost, fix it, then add a test that pins the query count.

---

### F2 — The workflow can deadlock: some students can never clear (real bug) — ✅ FIXED 15 Nov 2026

> **How it was fixed:**
> - **Prerequisites per exit type:** `engine.prerequisites(section, exit_type)` leaves out an *optional* prerequisite the exit type doesn't have. `OPTIONAL_PREREQUISITES = {TPC}` is one explicit, named rule. `engine.workflow(exit_type)` is each exit type's whole graph, and everything that asks "is this ready?" uses it: `actionable()`, the desk's "Waiting for …", Administration's send-to-staff query, and the reverse cascade.
> - **Validation with Kahn's algorithm:** `engine.analyze_workflow()` is a topological sort, O(V + E). It returns the approval order, the **missing dependencies** (a prerequisite not in the graph: exactly this bug) and the sections **blocked by a cycle**. A Django system check (`main/checks.py`) runs it for every exit type at startup, so a broken workflow can't even start the server. Only an *optional* prerequisite may be missing; dropping any other is reported, never silently waived.
> - **Frontend:** the student dashboard no longer copies the dependency rule. Pages 4 and 5 open from the backend's `actionable`, and the lock messages name the sections still pending for *this* student ("HOD / Department must approve first." for an NEP exit, "TPC / Placement …" for a graduation).
> - **Tests:**
>   - for every exit type, a student is cleared end to end through the real API in Kahn's order, with every section checked at every step to be open exactly when its prerequisites are approved;
>   - then a reopen tests the reverse cascade;
>   - Kahn's missing-dependency, cycle and self-loop detection is tested on its own.
>
>   Six deliberately reintroduced faults were all caught; with TPC made mandatory again, Django refused to even start the test run.
> - **Interview angle:** a real-life use of topological sort. Validate a workflow DAG at startup, fail fast, and keep one source of truth that the UI asks rather than copies.
>
> The original analysis follows.

**Problem.** Accounts and Administration waited for Library, **TPC**, Warden and HOD (the rule at the time; today's is [engine.py:53-62](backend/main/engine.py#L53-L62)). But NEP-exit, withdrawal and admission-cancel requests **don't include TPC at all** ([engine.py:69-75](backend/main/engine.py#L69-L75)). `actionable()` treats a missing prerequisite as "not approved" ([engine.py:230-233](backend/main/engine.py#L230-L233)). So for those students Accounts and Administration never open, and the request can never become CLEARED. The login page offers all three exit types, and no test covers them (found by reading the code).

**Why it happened.** Two sources of truth for one rule (which offices a request has, and which offices block others) and nothing checks that they agree.

**Fix:**
- Compute prerequisites per request: `[p for p in PREREQUISITES[code] if p in required_sections(exit_type)]`.
- Validate the graph in a test for **every** exit type: every prerequisite exists, there is no cycle, and an approval order exists. This is a topological sort (Kahn's algorithm, O(V + E)):
  ```python
  from collections import deque

  def approval_order(sections, prerequisites):
      """An order in which every section can be approved, or an error if the workflow is broken."""
      deps = {s: prerequisites.get(s, []) for s in sections}
      for s, pres in deps.items():
          for p in pres:
              if p not in deps:   # ← this line catches the TPC bug
                  raise ValueError(f"{s} waits for {p}, which this exit type doesn't include")
      indegree = {s: len(pres) for s, pres in deps.items()}
      unlocks = {s: [] for s in deps}
      for s, pres in deps.items():
          for p in pres:
              unlocks[p].append(s)
      ready = deque(s for s, d in indegree.items() if d == 0)
      order = []
      while ready:
          s = ready.popleft()
          order.append(s)
          for nxt in unlocks[s]:
              indegree[nxt] -= 1
              if indegree[nxt] == 0:
                  ready.append(nxt)
      if len(order) != len(deps):
          raise ValueError("cycle: some sections can never be approved")
      return order

  # test: for each exit type, approval_order(required_sections(t), PREREQUISITES) must not raise
  ```
- Longer term: **workflow as data.** Store a versioned table of steps and edges per exit type, editable by an admin and snapshotted onto each request (as labs already are).

**Learn (DSA):** directed acyclic graphs, topological sort (Kahn's / DFS), cycle detection, reachability, invariants, property-based testing (Hypothesis: "for every exit type, a valid order exists").

**Interview:** *"How would you model an approval workflow?"* → As a DAG (or state machine). Validate it with a topological sort, snapshot it per request, and on reopen reset dependents with a DFS on the reversed edges.

---

### F3 — Too few workers, and slow work inside requests

**Problem.** gunicorn runs **3 synchronous workers** ([Dockerfile:27](backend/Dockerfile#L27)): at most 3 requests at the same time per container. A slow request holds its worker the whole time. Slow things today:
- OCR runs Tesseract **inside the upload request** ([api.py:647-648](backend/main/api.py#L647-L648)).
- Desk loads take seconds (F1).
- Document downloads stream bytes through Django.

**Little's Law:** `L = λ × W` (requests in the system = arrival rate × time each spends). With 3 workers and 2.2 s requests, the maximum rate is `λ = 3 / 2.2 ≈ 1.4 requests/s`. If 10 officers press Refresh together, the last waits ~7 s, and students' requests queue behind them (*head-of-line blocking*).

**Fix:**
1. Make requests fast first (F1). It's the cheapest capacity there is.
2. **Background job queue** (Celery or RQ + Redis) for slow or CPU-heavy work. Upload returns `202 Accepted` at once, a worker runs OCR, and the page shows "reading your document…".
   ```python
   # the upload view returns in milliseconds
   doc = Document.objects.create(section_status=ss, file=upload)
   transaction.on_commit(lambda: run_ocr.delay(doc.id))   # enqueue only AFTER the row is committed
   return JsonResponse({"document_id": doc.id, "ocr": "queued"}, status=202)

   @shared_task(autoretry_for=(Exception,), retry_backoff=True, max_retries=3)
   def run_ocr(document_id):            # runs in a separate worker process
       ...
   ```
   (`transaction.on_commit` matters: without it, the worker can start before the row exists.)
3. Tune workers. For CPU-bound work, use processes (≈ 2 × cores + 1). For I/O-bound work, use `--worker-class gthread --threads 4`: threads release Python's GIL while waiting on the database or network. Run several containers behind a load balancer (F11).
4. Let nginx send file bytes: Django checks the permission, then replies with `X-Accel-Redirect`, and nginx streams the file. Or use presigned object-storage URLs.

**Learn (OS):** process vs thread, the GIL, CPU-bound vs I/O-bound, blocking vs non-blocking I/O, queueing theory, producer–consumer, back-pressure.

**Interview:** *"What happens when 500 students upload at once?"* → Each upload holds a worker for the whole OCR time, the rest queue, and gunicorn and nginx start timing out. Fix: async jobs, more workers and direct-to-storage uploads.

---

### F4 — Race conditions in normal approve / reject

**Problem.** `engine.approve()` ([engine.py:240](backend/main/engine.py#L240)) **checks** `actionable()` and then **writes**, without locking anything (a *time-of-check to time-of-use* gap). Two real cases:
- **Write skew:** Library rejects at the same moment Accounts approves. Accounts' transaction checked "Library approved" before Library committed. Library's cascade ran before Accounts committed, so it didn't see that approval. Result: Accounts ends APPROVED while Library is REJECTED. Under PostgreSQL's default isolation (READ COMMITTED) both transactions succeed.
- **Lost update:** the head and a staff member decide the same row at once. The last save wins, and `decided_by` shows whoever saved last.

Accounts levels and refunds already lock rows ([staff.py:262](backend/main/staff.py#L262), [refunds.py:251](backend/main/refunds.py#L251)). The fix is to apply the same rule everywhere.

**Fix:**
- **Pessimistic locking:** every decision first locks the student's request row, then re-reads and re-checks inside the lock. All decisions on one student then run one after another (other students are unaffected). Always lock in the same order (request → section) so two transactions can't deadlock.
  ```python
  @transaction.atomic
  def approve(section_status, actor):
      req = ClearanceRequest.objects.select_for_update().get(pk=section_status.request_id)  # 1. lock the student
      ss = SectionStatus.objects.select_for_update().get(pk=section_status.pk)              # 2. fresh copy
      if ss.status == STATUS_APPROVED:
          return                                    # idempotent: a double click does nothing
      if not actionable(req, ss.section.code):      # checked INSIDE the lock → no gap
          raise PermissionError_("prerequisites not all approved")
      ...
  ```
- **Optimistic locking** (good for the same-row case, not enough on its own for write skew across two rows):
  ```sql
  UPDATE main_sectionstatus SET status = 'APPROVED', version = version + 1
  WHERE id = 42 AND version = 7;   -- 0 rows updated → someone changed it first → "refresh and retry"
  ```
- Or run decisions at `SERIALIZABLE` isolation and retry when Postgres reports a serialization failure.

**Learn (DBMS):** ACID; isolation levels (read uncommitted, read committed, repeatable read, serializable) and their anomalies (dirty read, non-repeatable read, phantom, lost update, write skew); MVCC in Postgres; pessimistic vs optimistic locking; deadlocks and lock ordering; idempotency.

**Interview:** *"Two admins click Approve at the same moment. What happens?"* → Explain the check-then-write gap, then the fix: lock the parent row, re-check inside the transaction, keep a consistent lock order.

---

### F5 — The certificate can be forged

**Problem.** The PDF is built **in the browser**: HTML ([StudentDashboard.tsx:220](frontend/src/pages/StudentDashboard.tsx#L220)) → html2canvas → jsPDF ([line 324](frontend/src/pages/StudentDashboard.tsx#L324)). The server keeps no copy, and the certificate has no signature or QR code. Anyone can edit the page in DevTools, or edit the PDF, and print "Approved" for anything. "NDC-203" is just the database id: guessable, and nobody can check it.

**The rule:** never trust the client for anything that matters (the *trust boundary* is the server).

**Fix:**
- Generate the PDF **on the server** (WeasyPrint / ReportLab), only when the request is CLEARED. Store it, and store its SHA-256 hash.
- Give it an unguessable id (UUID) and a **QR code** pointing to `https://<portal>/verify/<uuid>`. That public page shows name, roll number, date and **VALID** or **REVOKED**. The app already deletes the certificate when an office reopens; that becomes "revoked".
- Optionally sign it digitally: the institute's private key signs the hash, and anyone can verify it with the public key (PDF signatures / PAdES).

**Learn (Security, crypto):** hashing vs encryption vs digital signatures, public-key cryptography, PKI, integrity vs confidentiality, trust boundaries, sequential vs random ids (enumeration attacks).

**Interview:** *"How would an employer verify a No-Dues certificate is genuine?"* → Scan the QR, open the verify endpoint, check the signature and the revocation status.

---

### F6 — Login and configuration security

**Problems:**
1. **The CAPTCHA exists only in the browser** ([LoginPage.tsx:32-48](frontend/src/pages/LoginPage.tsx#L32-L48)). The server never checks it ([api.py:405](backend/main/api.py#L405)), so a script can `POST /api/login/` directly. There's no rate limit or lockout, which allows password guessing and credential stuffing.
2. **Unsafe defaults:** `DEBUG` is `True` unless `DJANGO_DEBUG=False` is set ([settings.py:43](backend/config/settings.py#L43)), and `ALLOWED_HOSTS` is `*` if the variable is missing ([settings.py:47](backend/config/settings.py#L47)). Forget one environment variable in production and the public gets stack traces that include your settings. Cookies set `SameSite` but not `Secure`; there's no HSTS; docker-compose serves plain HTTP.
3. **Uploads trust the client:** a file is accepted if its name ends in .pdf/.jpg **or** the browser says it is a PDF or image ([api.py:624-625](backend/main/api.py#L624-L625)). The attacker controls both. There's no content check or virus scan.
4. **Bank account numbers** sit in plain JSON (`Document.ocr_fields`), with no encryption at rest and no log of who viewed them.
5. Students use a password plus a role picker instead of the institute's Google login. Containers run as root.

**Fix:**
- **Rate-limit login** per IP and per account, with exponential backoff, and show a server-verified CAPTCHA (Turnstile / hCaptcha / reCAPTCHA) only after a few failures. Token bucket idea:
  ```python
  # each key (IP or username) holds up to `capacity` tokens, refilled at `rate` tokens per second
  def allow(bucket, now, capacity=5, rate=5 / 60):
      bucket.tokens = min(capacity, bucket.tokens + (now - bucket.last) * rate)
      bucket.last = now
      if bucket.tokens >= 1:
          bucket.tokens -= 1
          return True
      return False   # → HTTP 429 Too Many Requests
  ```
  The nginx equivalent (outside the `server {}` block): `limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;`. Behind a load balancer, also set up `real_ip` so the limit applies to the user's IP, not the balancer's.
- **SSO** with Google Workspace (OpenID Connect, restricted to `lnmiit.ac.in`): no passwords to store or leak, and MFA comes for free. Admins assign roles in the app, so the role picker goes away.
- **Fail closed:** `DEBUG` defaults to False and `ALLOWED_HOSTS` is required. Set `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE` and `SECURE_HSTS_SECONDS`, and run `python manage.py check --deploy` in CI.
- **Uploads:** check magic bytes (python-magic), size and page count; re-encode images; use random file names; scan in the background job (ClamAV); serve with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
- **Sensitive data:** encrypt the fields (envelope encryption with a KMS key), mask by default, log every view of bank details, and delete after a retention period (data minimisation; see India's DPDP Act 2023).
- Non-root containers, a read-only filesystem, secrets from a secret manager.

**Learn (Security):** OWASP Top 10 (2021): A01 Broken Access Control, A02 Cryptographic Failures, A04 Insecure Design, A05 Security Misconfiguration, A07 Identification & Authentication Failures, A08 Software & Data Integrity Failures. Also: authentication vs authorization; password hashing (PBKDF2 / bcrypt / Argon2 with salt); CSRF vs XSS vs SQL injection; OAuth 2.0 / OIDC; defense in depth; least privilege.

**Interview:** *"Is a client-side CAPTCHA secure?"* → No. Everything in the browser is under the attacker's control, so security checks must run on the server.

---

### F7 — The whole list on every load: no pagination, caching or push

**Problem.** The desk endpoint returns **every** row every time (100 KB at 261 rows; *estimated* ~1.2 MB at 3,000), and the browser filters the tabs itself. The app downloads it all again whenever the tab regains focus ([App.tsx:88-102](frontend/src/App.tsx#L88-L102)). While the tab stays open, the data quietly goes stale.

**Fix:**
- **Server-side filters and keyset (cursor) pagination.** Unlike `OFFSET`, which reads and throws away every skipped row, it stays fast on page 100:
  ```sql
  SELECT ss.*
  FROM main_sectionstatus ss JOIN main_clearancerequest r ON r.id = ss.request_id
  WHERE ss.section_id = :section AND ss.status = 'PENDING'
    AND (r.created_at, ss.id) > (:last_created_at, :last_id)   -- cursor from the previous page
  ORDER BY r.created_at, ss.id
  LIMIT 50;
  ```
- Tab counts from one `GROUP BY status` query.
- **HTTP caching:** send an `ETag`. The browser asks again with `If-None-Match` and gets `304 Not Modified` (no body) when nothing changed.
- **Push instead of re-download:** Server-Sent Events or WebSockets send "request 123 moved to Level 2", and the client updates that one row. Trade-offs:

  | Technique | How | Good for |
  |---|---|---|
  | Short polling | Ask every N seconds | Simple, but wasteful |
  | Long polling | Server holds the request until there's news | Works everywhere |
  | SSE | One-way server → browser stream over HTTP | Live dashboards (this app) |
  | WebSockets | Two-way, persistent | Chat, games |
- Frontend: **TanStack Query** for caching, background refetch and invalidation after a mutation.

**Learn (Networks, system design):** pagination types, HTTP caching headers (`Cache-Control`, `ETag`, `304`), compression (gzip is already on), polling vs push, payload size vs latency.

---

### F8 — Approval history is overwritten or deleted

**Problem.** A new decision **overwrites** `decided_by` / `decided_at`, and a reopen **deletes** every `StageApproval` row (`engine.py` `_on_status_change`). After a reopen nobody can answer "who approved Level 2 the first time, and when?" Refunds involve money, so an auditor will ask exactly that.

**Fix: an append-only audit log.** Write one row per change, and never update or delete it (give the app's database user no UPDATE/DELETE rights on that table). The current tables stay as they are for fast reads.
```python
class AuditEvent(models.Model):
    request = models.ForeignKey(ClearanceRequest, on_delete=models.PROTECT)
    section = models.ForeignKey(Section, null=True, on_delete=models.PROTECT)
    actor = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=32)    # APPROVE, REJECT, LEVEL_APPROVE, RESET, REFUND_SENT …
    before = models.CharField(max_length=16, blank=True)
    after = models.CharField(max_length=16, blank=True)
    detail = models.JSONField(default=dict)      # level, reason, amount, UTR …
    at = models.DateTimeField(auto_now_add=True, db_index=True)
```
*Event sourcing* goes further: the log **is** the truth and current state is rebuilt from it. It's powerful but complex, and not needed here.

**Learn:** audit logging, event sourcing and CQRS, immutability, soft vs hard delete.

---

### F9 — Derived state handled two different ways

**Problem.** `overall_status` is **stored**, so every code path must remember to call `recompute_overall` ([engine.py:314](backend/main/engine.py#L314)); forget one and it drifts. `current_level` is **never stored** and is recomputed every time, which is the cause of F1. Two strategies, and no rule for choosing between them.

**Fix:** decide per field. If it's cheap, compute it when reading. If it's expensive or you filter on it, store it and update it in the same transaction through **one** module that owns all transitions (an explicit state machine: a transition table such as "PENDING → APPROVED allowed if …", or `django-fsm`). Add a nightly reconciliation job that recomputes everything and alerts on any mismatch.

**Learn:** normalization (1NF, 2NF, 3NF, BCNF) vs denormalization, materialized views, invariants, the State pattern.

---

### F10 — Code structure

**Problems:**
- `api.py` is ~1,700 lines that mix HTTP parsing, permission checks and business rules (for example, the checklist gate lives in the view `_decide`).
- Special cases per office are spread across modules (`LEVELLED_SECTIONS`, `CONFIRMED_SUBMISSION_SECTIONS`, checklist sections, `if role == SECTION_ACCOUNTS`). A new kind of office means editing many files (the *shotgun surgery* smell).
- Frontend: `StudentDashboard.tsx` is 1,413 lines and `SectionApprovalPage.tsx` 732, with inline styles, no router and one `any` in `api.ts`.
- `types.ts` is hand-copied from the backend's JSON, so the two drift apart silently.

**Fix:**
- **Layers:** views (HTTP only) → services (business rules, transactions) → models. Use Django REST Framework serializers for validation and permission classes for authorization, all in one place.
- **Modular monolith:** domain modules (identity, workflow, documents, refunds, notifications), each with a small public interface.
- **Configuration + Strategy pattern:** each office declares its capabilities (`staff_mode: by_hand | levels`, `checklist: [...]`, `needs_confirmed_document: bool`) instead of `if` checks (Open/Closed Principle).
- **Contract-first API:** generate an OpenAPI schema (drf-spectacular), generate the TypeScript types from it (openapi-typescript), and make CI fail if they disagree.
- **Frontend:** React Router (real URLs, back button), TanStack Query, smaller components, a small design system instead of inline styles, Playwright end-to-end tests.

**Learn:** SOLID (especially SRP, OCP, DIP), coupling vs cohesion, layered and hexagonal architecture, design patterns (Strategy, State, Repository, Facade, Observer), code smells (God class, long method, shotgun surgery), API contracts.

**Interview:** *"Monolith or microservices for this?"* → A modular monolith. Microservices add network calls, distributed transactions (sagas) and operational work, and a small team at this scale gains nothing from them. Split a part out only when it needs to scale or deploy on its own (OCR workers are the first candidate).

---

### F11 — App servers hold state, so more servers can't be added safely

**Problems:**
- Uploaded files live on the container's disk (`uploaded_media/`). A second backend container can't see files the first one saved.
- Every container runs `migrate` on boot ([docker-entrypoint.sh:34](backend/docker-entrypoint.sh#L34)). With 3 replicas, 3 processes migrate at the same moment.
- Each worker keeps a DB connection open (`conn_max_age=600`). 3 workers × N containers (more with threads) runs into Postgres's default `max_connections = 100`.
- Sessions are in the DB, so every request reads the session table.
- nginx is hard-wired to Railway's DNS server (`resolver [fd12::10]`, [nginx.conf.template:36](frontend/nginx.conf.template#L36)). Inside local Docker Compose that resolver doesn't exist, so `/api` calls **likely fail locally (not tested)**. That's config drift between environments.

**Fix:**
- **Stateless app tier:** files in object storage (S3 / MinIO / Cloudflare R2) with presigned upload and download URLs; sessions, cache and rate-limit counters in Redis.
- **Migrations as a one-time release step** (Railway pre-deploy command, Kubernetes Job), written to be backward-compatible (*expand → migrate data → contract*) so old and new code can run side by side during a rolling deploy.
- **Connection pooling:** PgBouncer in transaction mode (then set Django's `DISABLE_SERVER_SIDE_CURSORS = True`), or Django ≥ 5.1 with psycopg 3's built-in pool.
- **Read replica** for reports, watching out for *replication lag*: right after an officer approves, read from the primary (*read-your-writes*).
- **Per-environment config:** the nginx resolver comes from an environment variable (Docker: `127.0.0.11`, Railway: `[fd12::10]`).
- **Load balancer** in front (layer 7, health-checked, round-robin or least-connections), with autoscaling on CPU and latency.

**Learn (distributed systems):** stateless vs stateful, horizontal vs vertical scaling, load balancing (L4 vs L7, algorithms), replication (sync vs async) and lag, connection pooling, the CAP theorem (why one Postgres primary means consistency first), zero-downtime deploys (rolling, blue-green, canary), the 12-factor app.

**Interview:** *"Scale this to every university in India."* → Multi-tenant: an `institute_id` on every table with Postgres row-level security (or a schema per institute); a stateless, autoscaled app tier; Postgres with read replicas, later partitioned by institute; object storage + CDN; async workers; per-tenant rate limits. Do the estimate (§5) before reaching for sharding.

---

### F12 — Indexes and cache headers

**Problems.**
- **Database:** the only indexes are the automatic ones: primary keys, foreign keys (Django indexes every `ForeignKey`) and the `unique_together` pairs. The desk queries filter on office **and** status **and** active. As the data grows, Postgres has to scan more and more rows.
- **nginx:** the built JS/CSS files have a content hash in their names, but nginx sends them with no cache header, so browsers re-check them on every visit.

**Fix:**
```python
class Meta:   # on SectionStatus
    indexes = [
        models.Index(fields=["section", "status"], name="ss_section_status"),
        models.Index(fields=["section"], condition=Q(status="PENDING"), name="ss_pending_by_section"),  # partial index
    ]
```
Prove it with `EXPLAIN ANALYZE` (look for *Seq Scan* turning into *Index Scan*) instead of guessing. And in nginx:
```nginx
location /assets/ {                     # Vite puts a content hash in every file name
    root /usr/share/nginx/html;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
location = /index.html {
    root /usr/share/nginx/html;
    add_header Cache-Control "no-cache";   # always re-check, so a new deploy shows up at once
}
```

**Learn:** B+ tree indexes, composite indexes and the leftmost-prefix rule, selectivity, partial and covering indexes, the write cost of indexes, the query planner; browser caching, CDNs, cache busting with hashed file names.

---

### F13 — Operations: no monitoring, backups or pipeline

**Problems:**
- The backend has no health endpoint; only Postgres has a health check.
- Logs are plain text, with no request IDs, metrics or error tracking.
- Nothing backs up the `pgdata` volume.
- There is no CI pipeline.
- The Locust load test (`docs/loadtest/locustfile.py`) has never been run.

**Fix:**
- **Health checks:** `/healthz` (process alive) and `/readyz` (database reachable) for the load balancer.
- **Logs and metrics:** JSON logs carrying a request ID. *RED* metrics per endpoint (Rate, Errors, Duration) and *USE* metrics per machine (Utilization, Saturation, Errors), in Prometheus + Grafana.
- **Error tracking:** Sentry for exceptions.
- **Backups:** nightly `pg_dump` plus WAL archiving for point-in-time recovery, and actually practise a restore.
- **CI/CD (GitHub Actions):** lint → tests against a Postgres service → build images → deploy to staging → load test → promote to production.
- **SLO:** write one down, for example "99% of desk loads under 1 s during clearance week".

**Learn:** SLI / SLO / SLA and error budgets, monitoring vs observability (logs, metrics, traces), RPO / RTO, CI/CD, the testing pyramid (unit → integration → end-to-end), mutation testing (you already did it), load testing.

---

### F14 — Notifications only inside the app

**Problem.** Students learn about a rejection or a refund only when they open the portal. Email and SMS were deliberately left out for now.

**Fix: transactional outbox.**
- In the **same** database transaction as the approval, insert a `Notification` row.
- A worker sends it (email / SMS / WhatsApp), marks it sent, and retries with exponential backoff and jitter.
- An idempotency key means a retry never sends twice.
- Officers get a daily digest ("12 new requests at your level").

**Learn:** message queues (RabbitMQ, Redis, Kafka), pub/sub, at-least-once vs exactly-once delivery, idempotency, the outbox pattern, retries with backoff and jitter, dead-letter queues.

---

## 4. The improved architecture

```
                 ┌─────────── CDN: React build (hashed files, cached 1 year) ──────────┐
 Browser ─HTTPS──┤                                                                     │
                 └── Load balancer (TLS, health checks, rate limits) ──────────────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                ▼                  ▼                  ▼
          Django app #1      Django app #2  …   Django app #N        ← stateless, autoscaled
                │
                ├──► Redis: sessions · cache · rate-limit counters · job queue
                │        │ jobs
                │        ▼
                │    Workers: OCR · virus scan · signed PDF certificates · email/SMS (outbox)
                │
                ├──► PgBouncer ──► PostgreSQL primary ──(replication)──► read replica (reports)
                │                        └── WAL archive + nightly backups
                └──► Object storage: documents and certificates (presigned URLs)

 Identity: Google Workspace SSO (OIDC)     Observability: logs · metrics · traces · Sentry
```

Keep it a **modular monolith**: one deployable app with clear internal modules, plus separate worker processes.

| Phase | When | What |
|---|---|---|
| **1 — before launch** | days | F2 exit-type fix + graph test · F1 prefetch + query-count tests · F4 request-row lock · F6 login rate limit, safe defaults, secure cookies, HTTPS · F12 indexes + asset caching · database backups |
| **2 — first weeks** | weeks | Redis + Celery (OCR, notifications) · object storage · server-side signed certificate + `/verify` · audit log · pagination + ETags · health checks, Sentry, CI |
| **3 — later** | months | SSO · live updates (SSE) · workflow as configuration · read replica · multi-tenant |

---

## 5. Worked example: back-of-the-envelope capacity

Interviewers love this. Say your assumptions out loud, then do simple arithmetic.

**Assumptions (estimated):** 2,000 students leave per year, mostly within a 10-day window. Each opens the dashboard ~10 times a day. ~40 officers and staff each reload their desk about every 2 minutes during working hours.

| Traffic | Arithmetic | Result |
|---|---|---|
| Student dashboard loads | 2,000 × 10 = 20,000/day; half in 4 peak hours → 10,000 / 14,400 s | ≈ 0.7 req/s |
| …database cost | 0.7 × 70 queries (*measured*) | ≈ 50 queries/s — easy for Postgres |
| Officer desk loads | 40 people × 30 loads/hour = 1,200/hour | ≈ 0.33 req/s |
| …time per Accounts desk load today, 2,000 waiting | 2,000 × 8.6 ms (*measured per row*, extrapolated) | ≈ 17 s |
| Workers needed (Little's Law, L = λW) | 0.33 × 17 | ≈ 6 busy workers > **3 available** → the queue grows without limit; everyone times out |
| After the F1 + F7 fixes (≈ 50 ms per page of 50 rows) | 0.33 × 0.05 | ≈ 0.02 busy workers → one worker is plenty |
| Document storage | 2,000 students × 4 files × 2 MB | ≈ 16 GB/year → object storage, not the DB |

**Lesson:** at this scale the bottleneck is **how the code talks to the database**, not the amount of data. Postgres handles millions of rows easily. Sharding or switching to NoSQL here would be over-engineering. Say that in an interview; it shows judgement.

---

## 6. Interview question bank (with model answers)

**Q1. "Explain your project in 60 seconds."**
"A No-Dues clearance portal for LNMIIT. A student submits one request, and 11 offices approve it in three tiers: first Library, TPC and the hostel Warden; then six offices at once (Store, LUCS, Sports, Medical, NAD, and the HOD after the department's labs); then Accounts and Administration in parallel. Once every office approves and the refund is recorded, the student downloads a certificate. React single-page app served by nginx, which also reverse-proxies the API to Django on gunicorn, with PostgreSQL. The workflow is a dependency graph: if an upstream office reopens, a DFS resets everything downstream. Accounts uses staff levels with row-level locking, and office heads hand out work with `SELECT … FOR UPDATE SKIP LOCKED`. It runs as three Docker containers and deploys to Railway."

**Q2. "Hardest bug you fixed?"** (both are real in this project)
- *Time zones:* the refund "paid on" date was rejected as "in the future" in the evening. The server compared against the UTC date, but staff are in India (UTC+5:30), so after 6:30 pm IST "today" in India was still "yesterday" in UTC. Fix: business dates in `Asia/Kolkata`, timestamps stored in UTC. Lesson: convert time zones at the edges.
- *DNS caching:* after a Railway redeploy, nginx kept proxying to the old backend IP, because it resolves host names once at startup. Fix: proxy through a variable plus a `resolver` with a short validity, so nginx looks the name up again.
- *A query that never finished:* once Administration had to wait for nine offices, a test hung for over 9 minutes on one `SELECT COUNT(*)`. The ORM wrote two JOINs per prerequisite (one `.filter()` across a many-valued relation each time), about 19 tables in one query. Past 12 tables PostgreSQL stops trying every join order and switches to its genetic optimizer (GEQO), which picked a terrible plan. Fix: say "every prerequisite approved" as one `NOT EXISTS` subquery plus a count subquery, so the table count stays the same however many prerequisites there are ([staff.py:82](backend/main/staff.py#L82)); the whole suite now runs in 39 s. Lesson: read the SQL your ORM writes, and know the planner's limits (`geqo_threshold`, `join_collapse_limit`).

**Q3. "How do you stop two officers approving the same request at the same time?"** → F4: lock the parent row, re-check inside the transaction, keep a consistent lock order, make approve idempotent.

**Q4. "The officer page takes 2 seconds. Debug it."** → F1: measure queries and time, find the N+1, fix it with `select_related` / `prefetch_related` or a stored column, then pin the query count with a test.

**Q5. "How would someone verify a certificate?"** → F5: server-generated PDF, hash, QR code to a verify URL, digital signature, revocation.

**Q6. "Sessions or JWT?"** → Sessions here: one domain, logging out or disabling a user takes effect immediately (it's server-side), and Django's CSRF protection covers it. JWT suits many services, mobile apps and third parties. But revoking a JWT is hard (you need short expiry + refresh tokens + a deny list), and a JWT kept in `localStorage` can be stolen through XSS.

**Q7. "Why PostgreSQL, not MongoDB?"** → Relational data with strong invariants (one status per office per request, one refund per request), transactions across rows, joins and constraints. Postgres still has JSONB for the flexible OCR fields.

**Q8. "Monolith or microservices?"** → A modular monolith, with reasons (F10).

**Q9. "How did you test it?"** → 65 integration tests through the real HTTP API, including concurrency-related rules, plus mutation checks (break a rule on purpose and confirm a test fails). Next: query-count tests, property-based tests for the workflow graph, Playwright end-to-end tests, and a Locust load test before clearance week.

**Q10. "Scale it to 100 universities."** → Multi-tenancy and a stateless tier, plus the estimate from §5 (F11).

**Q11. "What is idempotency? Where does your system need it?"** → Doing the same request twice has the same effect as doing it once. Here: refunds are one per request and re-posting corrects rather than duplicates; approve should do nothing if the row is already approved; notification retries need idempotency keys. Payment APIs use an `Idempotency-Key` header for the same reason.

**Q12. "What would you improve first?"** → The exit-type workflow bug (F2: it blocks real students), N+1 on the desks (F1), and request-level locking (F4). Then certificate verification (F5).

**Q13. "Polling or WebSockets?"** → The table in F7. SSE fits a dashboard: it's one-way, works over plain HTTP and reconnects automatically.

**Q14. "Zero-downtime deploy with a schema change?"** → Expand → migrate → contract. Add the new column as nullable, deploy code that writes both old and new, backfill, switch reads to the new column, then drop the old one. Do a rolling deploy behind health checks, with migrations run once as a release step.

**Q15. "How do you store passwords?"** → Never encrypted, always hashed: a salted, slow hash (Django uses PBKDF2 with many iterations; Argon2 or bcrypt also work). Better still, use SSO and store no passwords at all.

**HTTP status codes you can point to in this API:** 200 OK, 201 Created (staff added), 400 Bad Request, 401 Unauthorized (wrong password), 403 Forbidden (not your request), 404 Not Found, 405 Method Not Allowed, 409 Conflict ("not ready yet" / "moved on to Level 2"). Codes you'd add: 202 Accepted (OCR queued), 304 Not Modified (ETag), 429 Too Many Requests (rate limit).

**Tip:** for every design decision, say four things: *what* you chose, *why*, the *alternative*, and the *trade-off*. Admitting a fault you measured and know how to fix sounds senior, not weak.

---

## 7. Subject map: CS subjects → where they appear in this project

| Subject | Study these | Seen in this project |
|---|---|---|
| **DBMS** | ACID, isolation levels, MVCC, locks (`FOR UPDATE`, `SKIP LOCKED`), B+ tree indexes, normalization, N+1, query plans, connection pooling, migrations | F1, F4, F8, F9, F12 · `staff.py:487` |
| **Operating systems** | Processes vs threads, GIL, scheduling, blocking I/O, CPU- vs I/O-bound, containers (namespaces, cgroups) | F3 · `Dockerfile` |
| **Computer networks** | HTTP methods and status codes, cookies (`Secure`, `HttpOnly`, `SameSite`), TLS handshake, DNS, reverse proxy, L4/L7 load balancing, gzip, same-origin and CORS | F6, F7, F11 · `nginx.conf.template` |
| **DSA** | Graphs (DAG, topological sort, DFS/BFS, cycle detection), queues (FIFO "next 35"), hash maps (`_status_map`), token bucket, LRU cache | F2, F6 · `engine.py` |
| **OOP & design patterns** | SOLID; Strategy, State, Repository, Facade, Observer | F9, F10 |
| **Software engineering** | Layered architecture, modular monolith, API design (REST, pagination, versioning, idempotency), testing pyramid, CI/CD, code smells, technical debt | F10, F13 |
| **Security** | OWASP Top 10, authentication vs authorization, hashing vs encryption vs signatures, CSRF / XSS / SQLi, OAuth 2.0 / OIDC, least privilege | F5, F6 |
| **System design** | Caching, message queues, replication, sharding (and when *not* to), rate limiting, consistency, observability, SLOs, estimation | F3, F7, F11, F13, §5 |

---

## 8. A 3-week study plan

**Week 1 — DBMS and concurrency.** Transactions, isolation levels and their anomalies, MVCC, locking, indexes. *Practice in this repo:* fix F1 (prefetch + `assertNumQueries`) and F4 (request-row lock), then run `EXPLAIN ANALYZE` on the desk query before and after adding the F12 index.

**Week 2 — System design.** Caching, queues, load balancing, replication, rate limiting, consistency. *Practice:* on paper, design "No-Dues for every university in India": requirements → estimates (§5) → API → data model → diagram (§4) → bottlenecks → trade-offs. Time yourself at 45 minutes.

**Week 3 — Security, OS, networks + mock interviews.** OWASP Top 10, OAuth/OIDC, the TLS handshake, DNS, processes, threads and the GIL. Then answer every question in §6 out loud.

**Resources**
- *Designing Data-Intensive Applications* — Martin Kleppmann (the best single book for this guide)
- *System Design Interview*, Vol. 1 & 2 — Alex Xu
- *Use The Index, Luke* — https://use-the-index-luke.com (SQL indexing, free)
- OWASP Top 10 — https://owasp.org/www-project-top-ten/
- PostgreSQL documentation, chapter "Concurrency Control" (MVCC, isolation, locks)
- Django documentation, "Database access optimization"
