# LNMIIT No-Dues Portal — Migration Plan


**How to read the status labels:**
- ✅ **Done** — built and working
- 🟡 **Partial** — exists but does not yet match the design
- ❌ **Missing** — not built yet

---

## Executive Summary (for the manager)

We are modernizing the institute's No-Dues (student clearance) process. There are two parts to the codebase:

1. **`No-Dues-Portal/`** — the original Django backend. It works, but it was built for **IIT Guwahati**, not LNMIIT. Its sections, roll-number format, and approval order do not match our [`Design.md`](./Design.md). It needs a structured rebuild.
2. **`frontend/`** — a new React web app that looks like the original portal and is now **connected to the existing Django backend** end-to-end (login, student dashboard, officer approvals all work against the real database). It currently shows the original **IIT-G** sections. See [`BACKEND_CONNECTION.md`](./BACKEND_CONNECTION.md) for how it connects and how to run it.

**Where we are:** the React frontend is built and connected to the existing backend (Phases 1 and 1.5 done). **What's next:** rebuild the Django backend to the LNMIIT design, then switch the UI to the LNMIIT sections, then add automated correctness tests.

**Business value of the redesign:** trustworthy certificates (an approval can't be bypassed), correct hostel/department routing (no wrong-desk actions), document uploads with OCR assistance, and a voluntary welfare-fund ("Fund Us") contribution — all defined in [`Design.md`](./Design.md).

---

## 1. Django Backend (`No-Dues-Portal/`)

### 1.1 What's present today

| Area | Detail | Status |
|---|---|---|
| Roles | Student, Faculty, Lab, Caretaker, Warden, Gymkhana, Library, OnlineCC, CC, Thesis Manager, Assistant Registrar, HOD, Account | 🟡 wrong section set |
| Login | Username + password + role dropdown | 🟡 plain-text passwords |
| Approvals | Boolean flags on `Student`; officer pages bulk-toggle checkboxes | 🟡 no request model |
| Reset cascade | Manual resets inside views | 🟡 not transactional |
| Pages | login, student dashboard, per-role approval pages, rules, contact | ✅ render |

### 1.2 What's missing vs the design

| Requirement | Design reference | Status |
|---|---|---|
| Correct LNMIIT sections (Library, TPC, Warden, Store, LUCS, Sports, Medical, NAD, HOD, Accounts, Administration) | [Section Flow](./Design.md#section-flow) | ❌ |
| Roll number stored as **text** (`24UCC174`) — currently an integer | [Data Models](./Design.md#data-models) · [Property 1](./Design.md#property-1-roll-number-is-always-text) | ❌ |
| Department limited to CCE/CSE/ECE/MME; Hostel to BH1–BH5/GH1 | [Data Models](./Design.md#data-models) | ❌ |
| New models: `Department`, `Hostel`, `Section`, `UserProfile`, `Student`, `ClearanceRequest`, `SectionStatus`, `Document`, `Comment`, `Certificate` | [Data Models](./Design.md#data-models) | ❌ |
| Exit types (Graduation / NEP Exit / Withdrawal / Admission Cancel) | [Routing & Scoping](./Design.md#routing--scoping) | ❌ |
| Prerequisite gating (no out-of-order approval) | [Approval Engine](./Design.md#approval-engine) · [Property 2](./Design.md#property-2-prerequisite-gating-no-out-of-order-approval) | ❌ |
| Transactional reverse-hierarchy cascade | [Approval Engine](./Design.md#approval-engine) · [Property 3](./Design.md#property-3-reverse-cascade-consistency) · [Property 4](./Design.md#property-4-cascade-completeness) | ❌ |
| Mandatory rejection reason + two-way comments | [Component 2: Approval Engine](./Design.md#component-2-approval-engine) · [Property 7](./Design.md#property-7-rejection-requires-a-reason) | ❌ |
| Document uploads (50 KB; JPG/PNG/PDF); LUCS link mode | [Upload Handling](./Design.md#upload-handling) · [Property 11](./Design.md#property-11-upload-validation) | ❌ |
| OCR pipeline (pytesseract + Pillow), advisory only | [OCR Pipeline](./Design.md#ocr-pipeline) · [Property 10](./Design.md#property-10-ocr-is-advisory-only) | ❌ |
| PDF certificate generation + invalidation on reopen | [Certificate & Fund Us](./Design.md#certificate--fund-us) · [Property 8](./Design.md#property-8-certificate-gating) · [Property 9](./Design.md#property-9-certificate-invalidation-on-reopen) | ❌ |
| Fund-Us voluntary contribution | [Certificate & Fund Us](./Design.md#certificate--fund-us) | ❌ |
| Hostel/department scoping enforced server-side | [Routing & Scoping](./Design.md#routing--scoping) · [Property 5](./Design.md#property-5-hostel-scoping) · [Property 6](./Design.md#property-6-department-scoping) | ❌ |
| Django auth (hashed passwords), login + role/scope re-check on writes | [Component 1: Auth & Role/Scope Guard](./Design.md#components-and-interfaces) · [Access Control & Security](./Design.md#access-control--security) | ❌ |
| One active request per student | [Property 12](./Design.md#property-12-single-active-request) | ❌ |

---

## 2. React Frontend (`frontend/`) — connected to the existing backend

The React app has replaced all the Django HTML templates and is now **wired to the existing Django backend** over a JSON API (via a Vite dev proxy). It shows the backend's real **IIT-G sections**. Full details of that connection are in [`BACKEND_CONNECTION.md`](./BACKEND_CONNECTION.md).

### 2.1 What's present today

| File | Purpose | Status |
|---|---|---|
| `src/index.css` | Bootstrap 3 styling (grid, navbar, panels, well, login card) | ✅ |
| `src/components/Layout.tsx` | Logo header, dark navbar, footer (was `base.html`) | ✅ |
| `src/pages/LoginPage.tsx` | Login screen wired to real auth (was `login.html`) | ✅ |
| `src/pages/StudentDashboard.tsx` | Live status matrix, all boxes clickable (was `student.html`) | ✅ |
| `src/pages/StudentDetailPage.tsx` | Department / Labs breakdown (was `student_dept_detail.html` / `student_lab_detail.html`) | ✅ |
| `src/pages/SectionApprovalPage.tsx` | Officer queue with live approve/save (was all officer templates) | ✅ |
| `src/pages/RulesPage.tsx`, `ContactPage.tsx` | Static info pages | ✅ |
| `src/api.ts` | Typed API client (fetch + CSRF handling) | ✅ |
| `src/App.tsx` | Session restore, role-based routing, login/logout/save | ✅ |
| `src/types.ts` | Types matching the existing backend (IIT-G sections) | ✅ |
| `vite.config.ts` | `/api` → Django dev proxy | ✅ |

### 2.2 What's still to come (LNMIIT redesign)

| Item | Design reference | Status |
|---|---|---|
| Switch UI to the LNMIIT section set | [Section Flow](./Design.md#section-flow) | ❌ |
| Student initiation screen (exit type + Fund-Us) | [Screen Flow & Routes](./Design.md#screen-flow--routes) | ❌ |
| Per-section document upload / LUCS link | [Upload Handling](./Design.md#upload-handling) | ❌ |
| Officer review screen (document + OCR view, approve/reject with reason) | [OCR Pipeline](./Design.md#ocr-pipeline) · [Component 2: Approval Engine](./Design.md#component-2-approval-engine) | ❌ |
| Certificate download | [Certificate & Fund Us](./Design.md#certificate--fund-us) | ❌ |

---

## 3. Build Order (Roadmap)

| Phase | Work | Design reference | Status |
|---|---|---|---|
| **1** | React shell: pages matching the old portal | [Screen Flow & Routes](./Design.md#screen-flow--routes) | ✅ Done |
| **1.5** | Connect React to the **existing** backend (JSON API, session auth, Vite proxy, demo seed) — IIT-G sections | [Architecture](./Design.md#architecture) · see [`BACKEND_CONNECTION.md`](./BACKEND_CONNECTION.md) | ✅ Done |
| **2** | Django rebuild to the design: new data models, approval engine (gating + transactional cascade), upload handler, OCR, certificate generator | [Data Models](./Design.md#data-models) · [Approval Engine](./Design.md#approval-engine) · [Upload Handling](./Design.md#upload-handling) · [OCR Pipeline](./Design.md#ocr-pipeline) · [Component 5: Certificate Generator](./Design.md#component-5-certificate-generator) | ❌ Next |
| **3** | Switch React to the LNMIIT sections + add initiate/upload/review/certificate screens | [Screen Flow & Routes](./Design.md#screen-flow--routes) | ❌ |
| **4** | Automated correctness tests (Hypothesis) for Properties 1–12 | [Correctness Properties](./Design.md#correctness-properties) · [Testing Strategy](./Design.md#testing-strategy) | ❌ |

**Current state:** the React app is fully connected to the original backend and works end-to-end (login → dashboard → officer approvals). See [`BACKEND_CONNECTION.md`](./BACKEND_CONNECTION.md) to run it.

**Next step:** Phase 2 — rebuild the Django backend to match [`Design.md`](./Design.md), starting with the [Data Models](./Design.md#data-models) and the [Approval Engine](./Design.md#approval-engine).

**Tools required for Phase 2** (see [Dependencies](./Design.md#dependencies)): Django, pytesseract + Tesseract engine, Pillow, and a PDF library (ReportLab or WeasyPrint).
