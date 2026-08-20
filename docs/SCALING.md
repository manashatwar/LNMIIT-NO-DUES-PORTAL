# Scaling & Production Readiness

This portal needs to survive the real-world traffic pattern of an institute clearance system: near-idle most of the semester, then **thousands of students logging in and refreshing their status within the same few-day window** right before an exit deadline, plus dozens of section officers polling their queues throughout. This document is the concrete plan for that: what's been implemented, what's still just a recommendation, and how to load-test it before trusting it with the real clearance window.

> **Deploying somewhere first?** See [`docs/DEPLOY.md`](./DEPLOY.md) for Railway step-by-step instructions (+ Render/Fly.io/VPS notes) — both Dockerfiles here (`No-Dues-Portal/Dockerfile`, `frontend/Dockerfile`) are already built with that in mind (env-driven backend host/port, no hardcoded service names).

## 1. Current state vs. what production needs

| Concern | Status | Detail |
|---|---|---|
| Secrets / debug / hosts | ✅ Done | Env-driven: `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS` (`No-Dues-Portal/myproject/settings.py`) |
| Database | ✅ Done | PostgreSQL via `DATABASE_URL` (`dj-database-url`) — the only supported database, no SQLite fallback. `docker-compose.yml` runs Postgres — see §2 |
| App server | ✅ Done | gunicorn (3 workers) in `No-Dues-Portal/Dockerfile`; nginx (`frontend/Dockerfile` + `nginx.conf`) in front — see §3 |
| Static/media files | ✅ Done | The SPA build is served by nginx; Django's own static files (admin) are served by WhiteNoise from within the backend container and proxied through nginx — see §4 |
| Sessions | 🟡 Open | Django DB-backed sessions (default) — fine at moderate scale or a single `backend` replica; move to a cache-backed store before running more than one — see §5 |
| DB indexes | 🟡 Open | Not yet added — see §2 |
| Frontend bundle | ✅ Done | jsPDF/html2canvas are lazy-loaded only when a student downloads a certificate, cutting the initial bundle to ~210 KB |
| Containerized deployment | ✅ Done | `docker-compose.yml` at the repo root — Postgres + gunicorn + nginx, all wired together — see §3 |
| Load testing | 🟡 Ready, not yet run | Locust script included (§6); hasn't been run against a sized environment yet |
| Rate limiting | ❌ Open | See §7 |
| TLS/HTTPS, real domain, backups, CI/CD, non-root containers | ❌ Open | Explicitly out of scope for the Docker Compose setup — see §8 |

## 2. Database: PostgreSQL, the only supported database

**Implemented — Postgres is mandatory, not a production upgrade path.** This branch deliberately has no SQLite fallback: a database that behaves differently in dev than in production (SQLite's single-writer file lock vs. Postgres's real concurrency control) is exactly the kind of gap that hides a bug until the real clearance window. With a few thousand students and dozens of officers submitting approvals concurrently, write contention (`SectionStatus` updates, `Comment` creation, the reverse-cascade transaction) needs a database that actually handles concurrent writes — which is also why local (non-Docker) development now requires a real Postgres instance (see the root `README.md` Quickstart — `docker compose up -d db` is the fastest way to get one).

`myproject/settings.py`:

```python
DATABASES = {
    'default': dj_database_url.config(
        # dj_database_url.config() reads DATABASE_URL itself; `default` below
        # only applies if that env var isn't set.
        default='postgres://nodues:nodues@localhost:5432/nodues',
        conn_max_age=600,   # persistent connections — avoids reconnect overhead per request
    )
}
```

`docker-compose.yml` sets `DATABASE_URL` for you against its own `db` (Postgres) service. Outside Compose, set `DATABASE_URL=postgres://user:pass@host:5432/nodues` in the environment and nothing else changes.

**Also cleaned up while committing to Postgres:**
- Deleted an orphaned migration (`main/migrations/0006_supportoffice_student_bh1_approval_and_more.py`) that added a `SupportOffice` model and several `Student.*_approval` boolean fields matching *none* of the current `models.py` — leftover from an earlier, abandoned design. It was also applied out of dependency order in the committed dev `db.sqlite3` (`0006` before its own dependency `0003`), which made `manage.py makemigrations` crash outright with `InconsistentMigrationHistory`. Removing it and testing fresh against Postgres confirmed migrations `0001`–`0003` are consistent with the current models.
- `Document.ocr_fields` was a `TextField` (`ocr_fields_json`) with a Python property doing manual `json.dumps`/`json.loads`, specifically because SQLite had no JSON column type. With Postgres guaranteed, it's now a real `JSONField` (Postgres `jsonb`) — see migration `0004_remove_document_ocr_fields_json_document_ocr_fields.py`. `main/api.py`'s read/write sites needed no changes beyond two `update_fields` list entries, since the attribute name (`ocr_fields`) didn't change.

**Still open — indexes.** Add these and confirm with `EXPLAIN ANALYZE` under the load test (§6), don't guess: `SectionStatus(status)`, `SectionStatus(request_id, section_id)` (already implied by `unique_together`, confirm it's actually indexed), `ClearanceRequest(is_active)`, `Student(hostel_id)`, `Student(department_id)` — these are exactly the columns `section_queue()` and `_active_request()` filter on.

## 3. App server + reverse proxy: gunicorn + nginx, containerized

**Implemented.** `manage.py runserver` is single-threaded and explicitly documented by Django as unsafe for production — the Docker setup replaces it end to end:

- **`No-Dues-Portal/Dockerfile`** builds a gunicorn image: `gunicorn myproject.wsgi:application --workers 3 --bind 0.0.0.0:8000 --timeout 30`. `docker-entrypoint.sh` waits for Postgres to accept connections, runs `migrate`, then execs gunicorn.
- **`frontend/Dockerfile`** builds the SPA (`npm run build`) and serves the static output through nginx (`frontend/nginx.conf`), which also proxies `/api/`, `/admin/`, and `/static/` to the `backend` service — so the browser only ever talks to one origin, same as the Vite dev proxy in local development (see `docs/ARCHITECTURE.md`).
- **`docker-compose.yml`** wires `db` (Postgres) → `backend` (gunicorn) → `frontend` (nginx) together with a healthcheck-gated startup order.

Worker count rule of thumb if you tune it further: `2 × CPU cores + 1`. To run more than one `backend` replica for real horizontal scale: `docker compose up --scale backend=3` — but read §5 first, since DB-backed sessions and in-process assumptions need addressing before that's safe.

**Verified, not just written:** `docker compose up --build` was run to completion — all three containers (`db`, `backend`, `frontend`) started and reported healthy; `GET /`, `GET /api/csrf/`, and `GET /admin/` all returned correct responses through nginx; and a full `POST /api/login/` (CSRF cookie → token → login) succeeded end-to-end against the containerized Postgres, seeded via `manage.py seed_demo` run inside the `backend` container.

## 4. Static & media files

**Implemented for the SPA and Django's own static files.** nginx serves the built React app directly and Django's admin static assets via WhiteNoise (proxied through nginx's `/static/` location) — no Python worker time spent serving files that never change.

**Uploaded documents (`uploaded_media/`) still go through Django**, which is correct, not a gap: they're access-checked per request (`main/api.py::document_download` — only the owning student, the section's officer, or a consolidator may fetch a given file), so they can't be served as plain static files without reimplementing that check in nginx. If this becomes a bottleneck at scale, the standard fix is nginx's `X-Accel-Redirect` (or the S3-compatible equivalent, `X-Sendfile`): Django still does the auth check, then hands off the actual byte-serving to nginx. Not implemented — revisit if the load test in §6 shows document downloads are a hot path.

## 5. Sessions & caching — still open

Django's default DB-backed sessions are fine for a single `backend` replica (the Compose default). Before scaling to more than one (`--scale backend=N`), either:
- put a shared Postgres backing all instances (sessions still work, just add DB load), or
- switch `SESSION_ENGINE` to a Redis-backed cache (`django-redis` + `SESSION_ENGINE = 'django.contrib.sessions.backends.cache'`) — recommended once horizontally scaling, since it takes session reads off the primary database entirely.

Redis (or Memcached) is also the natural place to cache read-heavy, rarely-changing data — e.g. `Section` rows, read on every request that builds a section list. Not added yet; `docker-compose.yml` has no `redis` service — add one plus `django-redis` in `requirements.txt` if/when you scale `backend` past one replica.

## 6. Load testing — ready, not yet run

A ready-to-run [Locust](https://locust.io) script is included at [`docs/loadtest/locustfile.py`](./loadtest/locustfile.py). It simulates the two real traffic patterns: students repeatedly polling their status, and officers polling their scoped queue.

**Run it against the Docker Compose stack (or a staging copy sized like it), never production:**

```bash
docker compose up --build -d
docker compose exec backend python manage.py seed_demo   # ensure demo accounts exist

pip install locust
locust -f docs/loadtest/locustfile.py --host http://localhost \
    --users 3000 --spawn-rate 50 --run-time 15m --headless --csv=results/nodues_loadtest
```

Watch for: response time percentiles (p95/p99, not just average — a slow tail is what students actually notice), error rate, and database connection saturation (`docker compose exec db psql -U nodues -c "SELECT count(*) FROM pg_stat_activity;"`) during the run. Re-run after each change in §2–§5 to confirm it actually helped before moving to the next one.

**Before the real clearance window**, run the load test with a user count comfortably above your actual expected concurrent students (if ~2,000 students might check the portal in the same hour, test at 3,000–4,000) — headroom matters more than hitting an exact number. This hasn't been run yet — it's the concrete next step, now that there's a Docker Compose target to point it at.

## 7. Rate limiting & abuse protection — still open

Not currently implemented anywhere. Before a public rollout, consider `django-ratelimit` (or nginx's `limit_req` in `frontend/nginx.conf`) on `/api/login/` specifically — a login endpoint with no rate limit is a credential-stuffing target once thousands of real accounts exist behind it, independent of the scale conversation above.

## 8. What Docker Compose deliberately does *not* cover

"Production-shaped," not "production." Before a real institutional rollout, still needed:

- **TLS/HTTPS termination.** `frontend/nginx.conf` serves plain HTTP on port 80. Terminate TLS at nginx (a cert from your institute's CA or Let's Encrypt) or in front of it (a load balancer) before this is reachable from the real internet.
- **A real domain**, and `DJANGO_ALLOWED_HOSTS`/`DJANGO_CSRF_TRUSTED_ORIGINS` set to match it (see `.env.example`).
- **Backups** for the `pgdata` Docker volume — nothing currently snapshots it. At minimum, a scheduled `pg_dump` to storage outside the Docker host.
- **CI/CD.** Nothing currently builds/tests/deploys these images automatically.
- **Non-root containers.** Both images currently run as root inside the container (the default for their base images) — the simplest option for a first pass, not a hardened one. If tightening this, watch for the `uploaded_media`/`pgdata` volume permission issues that come with switching to a non-root user mid-project.

## 9. Summary checklist before a real clearance-window rollout

- [x] `DATABASE_URL` points at PostgreSQL — the only supported database (`docker-compose.yml`)
- [x] `DJANGO_DEBUG=False`, real `DJANGO_SECRET_KEY`, real `DJANGO_ALLOWED_HOSTS` set in the environment (`.env`, gitignored — see `.env.example`)
- [x] Running under gunicorn behind nginx, not `manage.py runserver`
- [x] Static SPA build served by nginx, not Django
- [ ] TLS/HTTPS termination + a real domain
- [ ] DB indexes added (§2) and confirmed with `EXPLAIN ANALYZE`
- [ ] Session store moved off DB-backed sessions if running >1 `backend` replica (§5)
- [ ] Locust run at 1.5–2× expected concurrent students, on a Compose/staging environment, with acceptable p95 latency and zero 5xx errors (§6) — **not yet done**
- [ ] Rate limiting on `/api/login/` (§7)
- [ ] Backup strategy for the Postgres volume (§8)
