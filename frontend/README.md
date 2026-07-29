# No Dues Portal — Frontend (React + TypeScript + Vite)

React single-page app for the LNMIIT No Dues Portal. It replaces the old Django HTML templates and talks to the Django backend over a JSON API.

For the full picture of how the frontend connects to the backend, see [`../BACKEND_CONNECTION.md`](../BACKEND_CONNECTION.md).

## Prerequisites

- Node.js 18+
- The Django backend running at `http://127.0.0.1:8000` (see [`../No-Dues-Portal`](../No-Dues-Portal))

## Run

```bash
npm install      # first time only
npm run dev      # starts Vite at http://localhost:5173
```

Open http://localhost:5173.

> The Django backend must also be running. Requests to `/api/*` are proxied to it (see `vite.config.ts`), so cookies and CSRF work same-origin — no CORS setup needed.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server with HMR |
| `npm run build` | Type-check and build for production (`dist/`) |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |

## Project structure

```
src/
  api.ts                 API client (fetch + CSRF handling)
  types.ts               Types matching the backend sections
  App.tsx                Session restore + role-based routing
  index.css              Bootstrap-3-style CSS
  components/
    Layout.tsx           Header + navbar + footer
  pages/
    LoginPage.tsx        Login (webmail + password + role)
    StudentDashboard.tsx Clearance status matrix (clickable panels)
    StudentDetailPage.tsx Department / Labs breakdown
    SectionApprovalPage.tsx Officer queue (approve / save)
    RulesPage.tsx        Rules
    ContactPage.tsx      Contacts
vite.config.ts           /api -> Django dev proxy
```

## Demo logins

Password for every account: **`csepassword`**. Enter the webmail as the username and pick the matching role.

- **Students:** student@ · amit@ · priya@ · arjun@ · neha@ · rohit@ lnmiit.ac.in
- **Faculty:** prof.verma@ · prof.rao@ · prof.iyer@ lnmiit.ac.in
- **Labs:** oslab@ · netlab@ · dbmslab@ lnmiit.ac.in
- **Officers:** caretaker@ · warden@ · gymkhana@ · library@ · onlinecc@ · cc@ · thesis@ · asstreg@ · account@ · hod@ lnmiit.ac.in

Because of the clearance hierarchy, some officer queues start empty (e.g. Library appears only after Thesis Manager clears a student; Account only after HOD). Start with Caretaker / Gymkhana / Faculty / Lab / Thesis to see students immediately.

## Tech

React 18 · TypeScript · Vite · plain Bootstrap-3-style CSS.
