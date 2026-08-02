# Scaling & Production Readiness

This portal needs to survive the real-world traffic pattern of an institute clearance system: near-idle most of the semester, then **thousands of students logging in and refreshing their status within the same few-day window** right before an exit deadline, plus dozens of section officers polling their queues throughout. This document is the concrete plan for that — what's already been hardened, what to change before a real rollout, and how to load-test it before trusting it with the real clearance window.

This is a documentation and planning pass, not an infrastructure migration — nothing below has been applied to the codebase except where explicitly marked **(done)**.

## 1. Current state vs. what production needs

| Concern | Current (dev) | Needed for thousands of concurrent students |
|---|---|---|
| Secrets / debug / hosts | Hardcoded in `settings.py` | **(done)** — now env-driven: `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS` (see `No-Dues-Portal/myproject/settings.py`) |
| Database | SQLite (single file, serializes writes) | PostgreSQL — see §2 |
| App server | `manage.py runserver` (single-threaded dev server) | gunicorn/uwsgi with multiple worker processes behind nginx — see §3 |
| Static/media files | Served by Django/Vite dev server | nginx (or a CDN) serving `frontend/dist` and `uploaded_media/` directly — see §4 |
| Sessions | Django DB-backed sessions (default) | Fine at moderate scale; move to a cache-backed session store once you run multiple app servers — see §5 |
| Frontend bundle | Single ~800 KB JS bundle on first load | **(done)** — jsPDF/html2canvas are now lazy-loaded only when a student downloads a certificate, cutting the initial bundle to ~210 KB (see `docs/KNOWN_GAPS.md`) |
| Load testing | None | Locust script included — see §6 |

## 2. Database: move to PostgreSQL before load testing

SQLite locks the entire database file on write. With a few thousand students and dozens of officers submitting approvals concurrently, write contention (`SectionStatus` updates, `Comment` creation, the reverse-cascade transaction) will queue up and produce timeouts under real load — this is the single highest-priority change here.

Recommended: keep SQLite as the zero-config local default, switch to Postgres via environment variables in any real deployment:

```python
# myproject/settings.py — only if/when you decide to make this change
import dj_database_url  # pip install dj-database-url

DATABASES = {
    'default': dj_database_url.config(
        default=f"sqlite:///{os.path.join(BASE_DIR, 'db.sqlite3')}",
        conn_max_age=600,   # persistent connections — avoids reconnect overhead per request
    )
}
```

Then set `DATABASE_URL=postgres://user:pass@host:5432/nodues` in the production environment. Local development keeps working with zero setup.

**Indexes to add once on Postgres** (check with `EXPLAIN ANALYZE` under the load test, don't guess): `SectionStatus(status)`, `SectionStatus(request_id, section_id)` (already implied by `unique_together`, confirm it's actually indexed), `ClearanceRequest(is_active)`, `Student(hostel_id)`, `Student(department_id)` — these are exactly the columns `section_queue()` and `_active_request()` filter on.

## 3. App server: gunicorn + nginx, not `runserver`

`manage.py runserver` is single-threaded and explicitly documented by Django as unsafe for production. A realistic starting point for a few thousand concurrent students:

```bash
pip install gunicorn
gunicorn myproject.wsgi:application --workers 5 --bind 0.0.0.0:8000 --timeout 30
```

Worker count rule of thumb: `2 × CPU cores + 1`. Put nginx in front for TLS termination, static/media serving, and request buffering — nginx absorbing slow client connections keeps gunicorn workers free to do actual request processing.

## 4. Static & media files

Right now Django serves `uploaded_media/` itself. Under load, every document-view/download request ties up a Python worker doing what a web server does far more efficiently. In production:

- Point nginx (or a CDN in front of it) directly at `frontend/dist/` for the built SPA.
- For `uploaded_media/`, since files are access-checked (not publicly servable — see `main/api.py::document_download`), use nginx's `X-Accel-Redirect` (or the S3-compatible equivalent, `X-Sendfile`): Django still does the auth check, then hands off the actual byte-serving to nginx instead of streaming it through Python.

## 5. Sessions & caching

Django's default DB-backed sessions are fine for a single app server. Once you run more than one gunicorn instance (needed for real concurrency), either:
- put a shared Postgres backing all instances (sessions still work, just add DB load), or
- switch `SESSION_ENGINE` to a Redis-backed cache (`django-redis` + `SESSION_ENGINE = 'django.contrib.sessions.backends.cache'`) — recommended once you're horizontally scaling, since it takes session reads off the primary database entirely.

Redis (or Memcached) is also the natural place to cache read-heavy, rarely-changing data — e.g. `Section` rows, which barely ever change but are read on every single request that builds a section list.

## 6. Load testing

A ready-to-run [Locust](https://locust.io) script is included at [`docs/loadtest/locustfile.py`](./loadtest/locustfile.py). It simulates the two real traffic patterns: students repeatedly polling their status, and officers polling their scoped queue.

**Run it against a staging environment, never production**, ideally on infrastructure sized the same as what you intend to deploy:

```bash
pip install locust
cd No-Dues-Portal && python manage.py seed_demo   # ensure demo accounts exist on the target
locust -f docs/loadtest/locustfile.py --host https://staging.example.org \
    --users 3000 --spawn-rate 50 --run-time 15m --headless --csv=results/nodues_loadtest
```

Watch for: response time percentiles (p95/p99, not just average — a slow tail is what students actually notice), error rate, and database connection saturation (`pg_stat_activity` on Postgres) during the run. Re-run after each change in §2–§5 to confirm it actually helped before moving to the next one.

**Before the real clearance window**, run the load test with a user count comfortably above your actual expected concurrent students (if ~2,000 students might check the portal in the same hour, test at 3,000–4,000) — headroom matters more than hitting an exact number.

## 7. Rate limiting & abuse protection

Not currently implemented anywhere. Before a public rollout, consider `django-ratelimit` (or nginx's `limit_req`) on `/api/login/` specifically — a login endpoint with no rate limit is a credential-stuffing target once thousands of real accounts exist behind it, independent of the scale conversation above.

## 8. Summary checklist before a real clearance-window rollout

- [ ] `DATABASE_URL` points at PostgreSQL, not SQLite
- [ ] `DJANGO_DEBUG=False`, real `DJANGO_SECRET_KEY`, real `DJANGO_ALLOWED_HOSTS` set in the environment
- [ ] Running under gunicorn (or equivalent) behind nginx, not `manage.py runserver`
- [ ] Static SPA build + media served by nginx/CDN, not Django
- [ ] Session store moved off SQLite-backed DB sessions if running >1 app server
- [ ] Locust run at 1.5–2× expected concurrent students, on staging, with acceptable p95 latency and zero 5xx errors
- [ ] Rate limiting on `/api/login/`
