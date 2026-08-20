# FAQ — Presentation Q&A

Common technical "why did you choose X" questions a general audience is likely to ask, with short answers. For deep implementation-level questions, see [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`DESIGN.md`](./DESIGN.md).

## Tech choices — the "why" questions

**Why Django for the backend?**
It's a mature, batteries-included Python framework — built-in authentication, session management, ORM, admin panel, and solid defaults for CSRF/XSS/SQL-injection protection out of the box. For a form-and-approval-workflow app like this, that meant less custom security code to get right.

**Why React (with TypeScript and Vite) for the frontend?**
React gives a responsive, component-based UI well-suited to different dashboards per role (student vs. various officers). TypeScript catches type mismatches between frontend and backend data early. Vite gives a fast dev server and build.

**Why is the frontend a separate app instead of Django templates?**
It keeps the UI layer and the API cleanly separated, makes the officer/student dashboards feel like a modern app rather than server-rendered pages, and the JSON API could be reused by other clients later if needed.

**Why PostgreSQL instead of MySQL or SQLite?**
PostgreSQL is used as the only database everywhere, including local development — so there's no gap between what's tested locally and what runs in production. It also handles concurrent writes (many officers approving at once) more robustly than SQLite, which was ruled out entirely for that reason.

**Why session-based login instead of something like JWT tokens?**
Django's built-in session/cookie authentication is simpler and battle-tested, and it pairs naturally with Django's CSRF protection. Since the frontend and backend are served from the same origin (see below), there was no need for the extra complexity of token-based auth.

**Do the frontend and backend need CORS configuration?**
No — in development, the frontend dev server forwards API calls to the backend so the browser only ever talks to one address; in production both are served behind the same reverse proxy. That "same-origin" setup is what lets plain session cookies work without any CORS setup.

**Why Tesseract / OCR for document uploads?**
It's a free, open-source OCR engine, used here just to auto-read a name/roll number off an uploaded document and flag it to the reviewing officer if it doesn't match — purely a convenience check. It never blocks or auto-rejects anything; a human always makes the actual decision.

**Why generate the certificate PDF in the browser instead of on the server?**
It keeps the backend simple — it only needs to hand over the data as JSON. The browser builds the visual certificate and turns it into a PDF locally, so the server never has to manage a PDF-generation library or store certificate files.

**Why Docker?**
Docker packages the frontend, backend, and database identically for every developer and for deployment, so "works on my machine" issues are minimized, and it makes deploying to a host like Railway straightforward.

**Why a monolith (one Django app) instead of microservices?**
The problem domain is a single connected workflow (one approval graph across all sections) — splitting it into microservices would add network/deployment complexity without a real benefit at this scale. A single well-structured Django app is easier to reason about and ship.

**How is security handled in general terms?**
Everyone must log in, every action re-checks that the person doing it has the right role (e.g. a Warden can only act on their own hostel's students), and Django's built-in protections cover the standard web risks (CSRF, XSS, SQL injection). Uploaded documents are stored privately and only released to authorized reviewers, not exposed as public files.

**Is there a mobile app?**
No — it's a responsive web app usable from any browser, which covers students and staff without needing a separate mobile build.

**What would you add if you kept working on this?**
Automated tests (currently the correctness rules are enforced by the code but not backed by a test suite), email/SMS notifications when a section acts on a request, and further production hardening (custom domain, TLS, CI/CD pipeline) for a real deployment.
