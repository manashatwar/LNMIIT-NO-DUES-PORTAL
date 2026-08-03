# Deployment

How to actually put this somewhere reachable, using the same three containers `docker-compose.yml` already builds (`db`, `backend`, `frontend`) — just mapped onto a hosting platform instead of your own machine. Written for **Railway** since that's the concrete target; the same three-service shape (managed Postgres + a private backend + a public frontend) maps onto Render, Fly.io, or a plain VPS with minor adjustments — see [§ Alternatives](#alternatives).

> **Read this alongside [`docs/SCALING.md`](./SCALING.md).** Deploying gets you *reachable*; scaling gets you *reachable under thousands of concurrent students*. Do both before a real clearance window.

## Why Railway maps cleanly onto this

Railway lets multiple services in one project talk to each other over a private network (`<service-name>.railway.internal`) without a public domain — which is exactly the shape `docker-compose.yml` already assumes: nginx (`frontend`) is the only thing the browser ever talks to, and it proxies `/api`, `/admin`, `/static` to `backend` so the whole app is same-origin (no CORS, no cross-site cookies — see `docs/ARCHITECTURE.md`). Railway's private networking recreates that same-origin property in production without any CORS configuration.

Both Dockerfiles already support this — you're just setting environment variables Railway provides, not changing code:
- `frontend/Dockerfile` builds nginx from `nginx.conf.template`, substituting `BACKEND_HOST`/`BACKEND_PORT` (where to find the backend) and `PORT` (what port nginx itself listens on) at container startup.
- `No-Dues-Portal/Dockerfile` + `docker-entrypoint.sh` already read `DATABASE_URL` and run migrations on every boot.

## Step by step

### 1. Create the project and add PostgreSQL

In the Railway dashboard: **New Project** → **Deploy from GitHub repo** (pick this repo) → then **+ New** → **Database** → **Add PostgreSQL**. Railway provisions it and exposes its connection info as service variables you can reference from other services (no manual host/port/password copying).

### 2. Add the backend service

**+ New** → **GitHub Repo** (same repo again) → set:
- **Root Directory**: `No-Dues-Portal`
- Railway will detect the `Dockerfile` there and build from it automatically.

**Variables** (Settings → Variables) — set these on the backend service:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Click **+ Add Reference** → pick the Postgres service's `DATABASE_URL`. Don't type it by hand — Railway keeps it in sync if the DB ever moves. |
| `DJANGO_SECRET_KEY` | A real random value — generate with `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"` |
| `DJANGO_DEBUG` | `False` |
| `DJANGO_ALLOWED_HOSTS` | The **frontend's** public domain (see step 4 — you'll come back and set this once that domain exists) |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://` + the frontend's public domain (same caveat) |

**Networking** (Settings → Networking): do **not** generate a public domain for this service. Leave it on private networking only — Railway then reaches it internally as `<service-name>.railway.internal` (whatever you named the service, e.g. `backend.railway.internal`).

### 3. Add the frontend service

**+ New** → **GitHub Repo** (same repo again) → set:
- **Root Directory**: `frontend`
- Railway detects `frontend/Dockerfile`.

**Variables:**

| Variable | Value |
|---|---|
| `BACKEND_HOST` | The backend service's internal hostname, e.g. `backend.railway.internal` (Railway shows this under the backend service's Networking tab) |
| `BACKEND_PORT` | `8000` |

Leave `PORT` unset — Railway injects its own automatically and the Dockerfile's `ENV PORT=80` is only the docker-compose/local fallback.

**Networking**: generate a public domain for this service (Settings → Networking → **Generate Domain**), or attach a custom domain if you have one (e.g. `nodues.lnmiit.ac.in`) with a CNAME per Railway's instructions.

### 4. Close the loop on `DJANGO_ALLOWED_HOSTS` / `DJANGO_CSRF_TRUSTED_ORIGINS`

Now that the frontend has a real domain, go back to the **backend** service's variables and set:
- `DJANGO_ALLOWED_HOSTS` = that domain (no scheme, no path — e.g. `nodues-frontend-production.up.railway.app`)
- `DJANGO_CSRF_TRUSTED_ORIGINS` = `https://` + that domain

**Why the frontend's domain, not the backend's:** the browser only ever talks to the frontend's public domain. nginx forwards the original `Host` header to the backend (`proxy_set_header Host $host;` in `nginx.conf.template`), so that's the value Django's `ALLOWED_HOSTS` check actually sees — not the internal `backend.railway.internal` address. Setting `ALLOWED_HOSTS` to the backend's own hostname is the single most common mistake here and produces a confusing `DisallowedHost` 400 error.

### 5. First deploy: migrate + seed

`docker-entrypoint.sh` already runs `manage.py migrate --noinput` on every container boot, so the schema is created automatically on first deploy. Demo data is not seeded automatically (deliberately — you don't want demo accounts appearing in a real deployment by default). Run it once via Railway's shell:

```bash
railway login
railway link              # pick this project
railway run --service backend python manage.py seed_demo
```

Or use the **Deploy Logs → Shell** button in the Railway dashboard for the backend service and run the same command there.

### 6. Verify

Open the frontend's public domain. You should see the login screen. Confirm the full round trip:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<your-domain>/            # 200
curl -s -o /dev/null -w "%{http_code}\n" https://<your-domain>/api/csrf/   # 200
curl -s -o /dev/null -w "%{http_code}\n" https://<your-domain>/admin/      # 302 (redirect to login)
```

Log in with a demo account (see the root `README.md`) and confirm the dashboard loads.

## Uploaded documents need a volume

Railway containers are ephemeral — anything written inside the container's filesystem is lost on redeploy/restart. `uploaded_media/` (student document uploads) must persist. Attach a **Railway Volume** to the backend service, mounted at `/app/uploaded_media`, before real students start uploading documents. Without this, every redeploy silently deletes every uploaded document — test this before it matters, not after.

## Alternatives

- **Render.com**: same shape — a managed Postgres, a private "Web Service" for the backend (Render calls private-network-only services "Private Services" on some plans, or just don't expose a public URL), and a public Web Service for the frontend. Render's private networking uses `<service-name>` as the internal hostname directly (no `.railway.internal`-style suffix) — set `BACKEND_HOST` accordingly.
- **Fly.io**: deploy each Dockerfile as its own Fly app; Fly's private networking (6PN) gives each app a `.flycast`/internal address reachable from other apps in the same org, used the same way as `BACKEND_HOST`.
- **A plain VPS** (DigitalOcean, Linode, a university server room): `docker-compose.yml` already works unmodified — `git clone`, `cp .env.example .env` with real values, `docker compose up --build -d`. You own TLS termination yourself in this case (see `docs/SCALING.md` §8) — put Caddy or certbot-managed nginx in front, or point Cloudflare at it.

## Load testing a real deployment — answering "deploy first, then test multiple sessions"

That order is the right one — you want the load test to reflect the actual deployed infrastructure, not a guess about it. A few things worth knowing before you do:

- **Use a second Railway environment for the load test, not your production one.** Railway projects support multiple environments (e.g. `production` and `staging`) sharing the same services/config. Run `docs/loadtest/locustfile.py` against staging first — a misbehaving load test (a bug in the script, an unbounded retry loop) shouldn't be able to take down the environment real students will use.
- **Railway bills for usage.** Simulating thousands of concurrent users generates real compute and bandwidth — check your plan's limits before running a large Locust swarm, and consider running it for a bounded time window (`--run-time 15m`, already in the example command in `docs/SCALING.md` §6) rather than leaving it running.
- **Point Locust at the public domain**, not the internal hostname: `locust -f docs/loadtest/locustfile.py --host https://<your-staging-domain> --users 3000 --spawn-rate 50 --run-time 15m --headless`.
- **Watch Railway's own metrics dashboard** (CPU/memory per service) alongside Locust's own p95/p99 output — a service hitting its memory limit will get OOM-killed and restarted mid-test, which shows up as a spike in errors that has nothing to do with application logic.
- Everything in `docs/SCALING.md` §1–§8 (DB indexes, session/cache backend, rate limiting) is still relevant on Railway — none of it is Railway-specific, and none of it is done automatically by deploying there.
