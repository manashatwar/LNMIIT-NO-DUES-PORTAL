# LNMIIT No Dues Portal — Research & Design Rationale

*How other institutes run their No Dues process, what we found across LNMIIT's own sections, and the reasoning behind our design and technology choices.*


**Project:** LNMIIT No Dues Portal


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

## 3. Why We Chose This Design

Each decision solves a concrete LNMIIT problem.

- **Status per section, not one long form.** Sections clear in parallel and the student sees exactly where they are stuck on one dashboard. This is the model IIT Kanpur (DOAA) and NITK (IRIS) already run in production, so we are reusing a proven pattern rather than experimenting.

- **Hierarchy enforced in code, with a reverse cascade.** The clearance is genuinely ordered ,the HOD acts only after its sub-sections clear, and Administration acts only when everything is green. The reverse cascade is the reason the certificate is trustworthy: if a section that already cleared a student flips back to "due," every approval that depended on it automatically drops to pending. No student can slip out on a stale approval.

- **Every rejection carries a reason, with two-way comments.** A blocked student must know exactly what to fix. Clarification and re-submission happen inside the portal instead of over email or in person, which is where the paper process bleeds days.

- **Routing is scoped.** A warden sees only their own hostel; an HOD sees only their own department. This keeps each queue clean and makes wrong-desk action impossible ,so hostel and department are routing keys in the design, not just labels.

- **OCR reads the document; the original is always kept.** On upload, OCR pulls the name and roll number so officers verify at a glance instead of opening every file. Because OCR is only as good as the scan, the original file stays the source of truth and remains downloadable. Uploads are capped at 50 KB to keep the portal fast, with guidance to submit the clearest scan that fits.

## Why Python + Django (and not another stack)

- **One language end-to-end.** The document-reading (OCR) step lives most naturally in Python via Tesseract/pytesseract, so keeping the backend in Python avoids stitching two ecosystems together.

- **Team familiarity — Python is taught in our curriculum.** The people who will build and later hand this over already know Python from coursework. Choosing a stack we can actually staff and maintain is a practical call, not a theoretical one; a JavaScript-heavy stack (e.g. MERN) would add a learning curve without buying us anything for this kind of workflow.


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
