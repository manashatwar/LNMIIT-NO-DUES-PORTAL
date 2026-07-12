# LNMIIT No Dues Portal — Research & Design Rationale

*How other institutes run their No Dues process, what we found across LNMIIT's own sections, and the reasoning behind our design and technology choices.*

**Project:** LNMIIT No Dues Portal
**Prepared for:** Faculty mentor / co-founder review
**Date:** July 2026

---

## 1. Research: How Other Colleges Run No Dues

We studied official institute portals/forms, publicly written student accounts, and open-source implementations to learn how mature No Dues systems are structured before designing ours. Each source below is an official institute page/PDF, a publicly published account, official framework documentation, or a public code repository. All findings are paraphrased; links are given for verification.

### 1.1 IIT Kanpur — Online No Dues via DOAA / OARS

IIT Kanpur runs graduating-student clearance online through the Dean of Academic Affairs (DOAA) office. A student applies online a few days before thesis submission, then clears specific sections (for example, surrendering the health booklet and ID card at the ID Cell) so those sections turn "cleared" on the portal.

- Clearance is **multi-departmental**: academic records, library, hostel, finance/accounts, laboratories, IT, sports/medical, and placement all sign off. ([multi-department clearance overview, Quora](https://www.quora.com/What-is-the-procedure-to-take-no-dues-from-IIT-K-for-graduating-students))
- A published student account describes the online flow, including how placement (SPO) status must be settled first. ([Online No Dues@IITK, Medium](https://medium.com/@dsoumyadeep97/online-no-dues-iitk-v1-0-bd4be1dd3691))
- Library clearance is tied to **thesis submission to the repository** before No Dues is issued — a conditional, program-specific rule. ([thesis + No Dues account](http://pranjals16.blogspot.com/))
- Official DOAA entry point: `www.iitk.ac.in/doaa`.

**Pattern worth reusing:** a **per-section status model** where each section clears independently, plus **conditional rules** that depend on student type. *Content paraphrased for licensing compliance.*

### 1.2 NITK Surathkal — IRIS No Dues Module

NITK's **IRIS** is a long-running, student-built university management portal (10+ years in production, 24k+ users, 55+ digitized processes on their own about page). No Dues is one of its modules, on web and mobile.

- Scale and production status. ([about.iris.nitk.ac.in](https://about.iris.nitk.ac.in/))
- Student-managed portal ensuring administrative, academic, and alumni procedures happen methodically. ([blog.iris.nitk.ac.in](https://blog.iris.nitk.ac.in/))

**Patterns worth reusing:** **auto-approval** (a student with no dues in a section is cleared automatically) and **section comments** (a section that blocks a student leaves a written reason the student can read and act on).

### 1.3 IIT Guwahati — Django No Dues Form (open source)

A publicly available project automates the IIT Guwahati No Dues form using the **Django framework**, explicitly enforcing the correct hierarchy and clearance order.

- ([vaibz9697/No-Dues-Form, GitHub](https://github.com/vaibz9697/No-Dues-Form))

**Pattern worth reusing:** enforcing clearance **order/hierarchy** as a first-class feature — and confirmation that Django is a proven stack for this exact problem.

### 1.4 Other reference systems

- **IIT Roorkee (undergraduate exit):** return hostel keys + clearance form, library returns and fine clearance, then department/accounts — a clean picture of the minimum sections. ([Quora](https://www.quora.com/What-are-the-formalities-to-be-done-before-leaving-IIT-Roorkee-for-a-passing-out-undergraduate-for-eg-No-Dues-Certificate))
- **Generic clearance guides** list library, hostel, thesis/project supervisor, general administration, central store, accounts, and physical education as standard clearing sections — matching LNMIIT's set. ([No Dues clearance guide, Scribd](https://www.scribd.com/document/880918404/Guide-for-No-Dues-Clearance-Form))
- **Open-source No Dues systems** validating the request → section-approval → final-approval pattern: [ranveer18/NoDueManagementSystem](https://github.com/ranveer18/NoDueManagementSystem), [GVishnudhasan/NoDueProject](https://github.com/GVishnudhasan/NoDueProject).
- A No Dues form pattern that offers a **voluntary welfare-fund contribution** from the refundable deposit. ([Scribd](https://fr.scribd.com/doc/94770273/No-Dues-Certificate-Form))

---

## 2. Design

**See [`Design.md`](./Design.md)** for the full design.

---

## 3. Why We Chose This Design and This Language

Every choice below earns its place by solving a specific LNMIIT problem. We reason only the decisions that genuinely need it.

> **Decision 1 — Each section holds its own status, not one long form.**
> A single linear form blocks a student at one desk while other sections sit idle. Giving every section an independent status lets them work in parallel and gives the student one live view of exactly where they stand. This is the exact model IIT Kanpur (DOAA) and NITK (IRIS) run in production — we are reusing a proven pattern, not inventing one.

> **Decision 2 — Enforce the hierarchy in code, and cascade in reverse.**
> The clearance genuinely is hierarchical: the HOD only acts once Store, LUCS, Sports, Medical, NAD, and the Department form are clear; Administration only acts once everything is green. We enforce this so approvals can't be given out of order. The **reverse cascade** is the key safety net — if a section that already cleared a student flips back to "due," every approval that depended on it automatically resets to pending. Without this, a stale approval could let a student walk out with dues still open. The final certificate is only trustworthy because of this rule.

> **Decision 3 — No rejection without a written reason, and comments both ways.**
> NITK's experience shows that a blocked student needs to know *why* to fix it. So every rejection must carry a reason, and both the student and the section share a comment thread. Clarification and re-submission happen inside the portal instead of over email or in person — which is where the current paper process loses days.

> **Decision 4 — A warden sees only their own hostel.**
> A BH1 submission reaches the BH1 warden and no one else. This is a privacy rule and an operational one: it keeps each warden's queue clean and makes cross-hostel action impossible. Hostel is therefore a routing key in the design, not just a label on the screen.

> **Decision 5 — Python and Django for the build.**
> Django fits this exact shape — a hierarchical, form-and-document workflow handling sensitive student data:
> - **Security is built in.** Dues, refund bank details, and uploaded IDs are sensitive. Django ships with protection against CSRF, XSS, and SQL injection, so we don't hand-build security. ([Django security docs](https://docs.djangoproject.com/en/stable/topics/security/); [Django XSS escaping, MDN](https://developer.mozilla.org/en-US/docs/learn/Server-side/Django/web_application_security))
> - **A free admin panel** lets staff manage students, sections, and records with almost no extra code — valuable for a small team.
> - **It's already proven here.** An open-source IIT Guwahati No Dues portal runs on Django with hierarchy enforcement. ([vaibz9697/No-Dues-Form](https://github.com/vaibz9697/No-Dues-Form))
> - **One language end-to-end**, because the OCR step (below) is easiest in Python.
>
> We don't claim Django wins on every axis — only that security, the admin panel, ecosystem fit, and OCR integration are what matter for this project.

> **Decision 6 — OCR reads the document, but the original is always kept.**
> Officers shouldn't have to open and read every file to pull out a name and roll number. On upload, the portal runs OCR (Tesseract via the pytesseract Python wrapper — the most widely used open-source OCR engine) to extract those fields and check them against what the student typed. Because OCR accuracy depends on image quality, the original file stays the source of truth and remains downloadable. To keep files small yet legible, uploads are capped at **50 KB** with guidance to submit the highest quality that still fits.

---

## 4. References

All links are official institute pages/PDFs, publicly published accounts, or public code repositories. Content throughout has been paraphrased and summarised for licensing compliance.

**Institute No Dues processes**
- IIT Kanpur DOAA: https://www.iitk.ac.in/doaa
- Online No Dues @ IITK (student account): https://medium.com/@dsoumyadeep97/online-no-dues-iitk-v1-0-bd4be1dd3691
- IITK multi-department clearance (Q&A): https://www.quora.com/What-is-the-procedure-to-take-no-dues-from-IIT-K-for-graduating-students
- IITK thesis submission + No Dues: http://pranjals16.blogspot.com/
- NITK IRIS (about / scale): https://about.iris.nitk.ac.in/
- NITK IRIS team blog: https://blog.iris.nitk.ac.in/
- IIT Roorkee exit formalities (Q&A): https://www.quora.com/What-are-the-formalities-to-be-done-before-leaving-IIT-Roorkee-for-a-passing-out-undergraduate-for-eg-No-Dues-Certificate
- Generic No Dues clearance guide: https://www.scribd.com/document/880918404/Guide-for-No-Dues-Clearance-Form
- No Dues form with welfare-fund contribution: https://fr.scribd.com/doc/94770273/No-Dues-Certificate-Form

**Open-source No Dues implementations**
- IIT Guwahati No Dues (Django): https://github.com/vaibz9697/No-Dues-Form
- ranveer18/NoDueManagementSystem: https://github.com/ranveer18/NoDueManagementSystem
- GVishnudhasan/NoDueProject: https://github.com/GVishnudhasan/NoDueProject

**LNMIIT**
- LNMIIT official site: https://lnmiit.ac.in/
- LNMIIT Training & Placement Cell: https://placements.lnmiit.ac.in/

---

*Note: The institute's internal "Order of No Dues" circular and the department-purpose "No Dues Form" are the authoritative sources for the exact clearance order and required fields.*
