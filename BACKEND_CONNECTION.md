# How the React Frontend Was Connected to the Existing Django Backend

Plain-language record of what was changed and how to run it. This covers the step where we deleted the old HTML pages and wired the React app to the **existing** Django backend (the original IIT-G section set) — not the redesigned LNMIIT backend (that's still future work).

---

## 1. What the setup looks like now

```
Browser ──> React app (Vite dev server, http://localhost:5173)
                 │  calls /api/... 
                 ▼
          Vite dev proxy  ──forwards /api──>  Django (http://127.0.0.1:8000)
                                                   │
                                                   ▼
                                              SQLite database (db.sqlite3)
```

- The React app never talks to Django directly across origins. Vite **proxies** every `/api` request to Django, so both look like the same origin to the browser. This means Django's normal **session login + CSRF** works with no CORS setup.

---

## 2. What was removed

- **All 19 Django HTML templates** (`No-Dues-Portal/main/templates/`). The UI is now React.
- **`No-Dues-Portal/main/views.py`** — the old views only rendered those templates.
- **`No-Dues-Portal/NoDues/`** — a dead duplicate settings folder (used a Django setting removed years ago). The real project config is `myproject/`.
- Stale `.pyc` bytecode files.

## 3. What was added (Backend — Django)

- **`main/api.py`** — a JSON API replacing the HTML views. Endpoints:

  | Method + URL | Purpose |
  |---|---|
  | `GET /api/csrf/` | Sets the CSRF cookie the SPA needs before login |
  | `POST /api/login/` | Session login (username = webmail, + role) |
  | `POST /api/logout/` | Ends the session |
  | `GET /api/me/` | Who is logged in (role, name, dept/hostel) |
  | `GET /api/student/status/` | A student's full clearance matrix |
  | `GET /api/student/dept_detail/` | Per-faculty approval breakdown |
  | `GET /api/student/lab_detail/` | Per-lab approval breakdown |
  | `GET /api/section/queue/` | An officer's scoped list of students |
  | `POST /api/section/save/` | Save approvals for that officer |

- **`main/urls.py`** — now routes the API paths above.
- **`main/management/commands/seed_demo.py`** — creates demo users, faculty, labs and students so login works immediately.
- **`myproject/settings.py`** — added `DEFAULT_AUTO_FIELD` and session/CSRF cookie settings.

The original data models (`Student`, `Faculty`, `Lab`, `Caretaker`, `Warden`, etc.) were **kept unchanged**. The API preserves the original rules: hostel scoping (warden/caretaker see only their hostel), department scoping (HOD/faculty see only their dept), prerequisite gating, and the reverse-hierarchy cascade (revoking an approval resets everything downstream).

## 4. What was added (Frontend — React)

- **`vite.config.ts`** — the `/api` → Django proxy.
- **`src/api.ts`** — typed client that calls the API and handles the CSRF token.
- **`src/types.ts`** — types matching the existing backend's sections.
- **`src/App.tsx`** — restores the session on load, routes by role, handles login/logout/save.
- **Pages** (mirror the original templates): `LoginPage`, `StudentDashboard`, `StudentDetailPage`, `SectionApprovalPage`, `RulesPage`, `ContactPage`, plus the shared `Layout`.

---

## 5. How to run it

Open two terminals.

**Terminal 1 — Backend (Django):**
```
cd No-Dues-Portal
python manage.py runserver 8000
```

**Terminal 2 — Frontend (React):**
```
cd frontend
npm run dev
```

Then open **http://localhost:5173**.

**First-time only** (or to reset data), from `No-Dues-Portal`:
```
python manage.py migrate
python manage.py seed_demo
```

---

## 6. Demo logins

Password for every account: **`csepassword`**. Enter the webmail as the username and choose the matching role.

- **Students:** student@ · amit@ · priya@ · arjun@ · neha@ · rohit@ lnmiit.ac.in
- **Faculty:** prof.verma@ · prof.rao@ · prof.iyer@ lnmiit.ac.in
- **Labs:** oslab@ · netlab@ · dbmslab@ lnmiit.ac.in
- **Officers:** caretaker@ · warden@ · gymkhana@ · library@ · onlinecc@ · cc@ · thesis@ · asstreg@ · account@ · hod@ lnmiit.ac.in
- **Admin:** `admin` (Django admin at http://127.0.0.1:8000/admin)

Because of the hierarchy, some queues start empty (e.g. Library appears only after Thesis Manager clears a student; Account only after HOD). Start with Caretaker / Gymkhana / Faculty / Lab / Thesis to see students immediately.

---

## 7. Limitations (dev-only)

- Auth is session-based with `DEBUG=True` — fine for local development, not production.
- The original profile models still keep a plain-text `password` field; it is **not** used for login (Django's hashed `User` password is).
- The connected backend uses the **original IIT-G sections**. The LNMIIT redesign (new models, uploads, OCR, certificate) is the next phase — see `MIGRATION_PLAN.md`.
