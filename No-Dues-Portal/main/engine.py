"""
Approval engine — Design.md § Approval Engine.

Owns the dependency graph, prerequisite gating, and the transactional
reverse-hierarchy cascade — for the fixed sections and for each department's
HOD-managed lab chain (§ Department labs). Pure-Python graph helpers +
DB-aware operations.
"""
from django.db import transaction
from django.utils import timezone

from .models import (
    Section, SectionStatus, Comment, Certificate, ClearanceRequest, Lab, LabStatus, StageApproval, Refund,
    STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED,
    OVERALL_IN_PROGRESS, OVERALL_CLEARED,
    SECTION_LIBRARY, SECTION_TPC, SECTION_WARDEN, SECTION_STORE, SECTION_LUCS,
    SECTION_SPORTS, SECTION_MEDICAL, SECTION_NAD, SECTION_HOD,
    SECTION_ACCOUNTS, SECTION_ADMINISTRATION,
)
from .prefetch import prefetched

# ─── Dependency graph: section -> prerequisite section codes ────────────────────
#
# Department-Purpose (a mandatory upload gating HOD) was removed — HOD no
# longer requires a dedicated form upload. If an HOD needs something from a
# student, they ask for it via the existing section comment thread instead of
# a blocking gate (main/api.py::officer_comment / student_comment). The lab
# sign-offs that paper form collected are now the HOD-managed lab chain
# (§ Department labs below), approved in the portal by each lab's in-charge.
#
# HOD is fully independent of the other sections — no section prerequisites,
# and no informational consolidation of Store/LUCS/Sports/Medical/NAD either
# (that was tried and then explicitly removed — HOD's review screen only shows
# its own section, same as Store/LUCS/Sports/Medical/NAD's screens already do
# for each other). The one thing HOD does wait on is its own department's labs,
# when the HOD has set any up — see § Department labs below.

#
# Accounts and Administration sit side by side: both open once Library, TPC,
# Warden and HOD have approved (the student's Pages 4 and 5 unlock together),
# and neither waits for the other. The request is cleared only when every one of
# its sections is approved (recompute_overall).
_AFTER_DEPT_AND_FIELD = [SECTION_LIBRARY, SECTION_TPC, SECTION_WARDEN, SECTION_HOD]

PREREQUISITES = {
    SECTION_ACCOUNTS: list(_AFTER_DEPT_AND_FIELD),
    SECTION_ADMINISTRATION: list(_AFTER_DEPT_AND_FIELD),
}

# Independent sections (actionable immediately after submission)
INDEPENDENT_SECTIONS = [
    SECTION_LIBRARY, SECTION_TPC, SECTION_WARDEN, SECTION_STORE, SECTION_LUCS,
    SECTION_SPORTS, SECTION_MEDICAL, SECTION_NAD, SECTION_HOD,
]

ALL_SECTION_CODES = INDEPENDENT_SECTIONS + [SECTION_ACCOUNTS, SECTION_ADMINISTRATION]


class PermissionError_(Exception):
    """Raised when an approval is attempted out of order or out of scope."""


class ValidationError_(Exception):
    """Raised when a rejection has no reason."""


def prerequisites(section_code):
    """Direct prerequisite section codes for a section."""
    return PREREQUISITES.get(section_code, [])


def downstream_closure(section_code):
    """Transitive set of section codes that depend on `section_code`."""
    # Build reverse adjacency
    reverse = {}
    for sec, prereqs in PREREQUISITES.items():
        for p in prereqs:
            reverse.setdefault(p, []).append(sec)

    visited = set()
    stack = list(reverse.get(section_code, []))
    while stack:
        cur = stack.pop()
        if cur not in visited:
            visited.add(cur)
            stack.extend(reverse.get(cur, []))
    return visited


def _status_map(request):
    """{section_code: SectionStatus} for a request (from prefetched rows when loaded)."""
    rows = prefetched(request, "section_statuses")
    if rows is None:
        rows = request.section_statuses.select_related("section")
    return {ss.section.code: ss for ss in rows}


def status_map(request):
    """{section_code: SectionStatus} for a request — one query, or none when the
    request's sections were prefetched (main/prefetch.py)."""
    return _status_map(request)


def actionable(request, section_code, dept_has_labs=None):
    """True iff every prerequisite of `section_code` is APPROVED for this request
    (for HOD, that includes every lab in the student's department lab chain).
    `dept_has_labs`: for HOD, whether the student's department has labs, when
    the caller already knows it (a desk asks once, not once per row)."""
    prereqs = prerequisites(section_code)
    if prereqs:
        smap = _status_map(request)
        for prereq in prereqs:
            ss = smap.get(prereq)
            if ss is None or ss.status != STATUS_APPROVED:
                return False
    if section_code == SECTION_HOD and not labs_cleared(request, dept_has_labs=dept_has_labs):
        return False
    return True


@transaction.atomic
def approve(section_status, actor):
    """
    Set APPROVED. Requires all prerequisites APPROVED. (Role/scope checks are
    enforced at the view layer before calling this.)
    """
    request = section_status.request
    code = section_status.section.code
    if not actionable(request, code):
        if code == SECTION_HOD and not labs_cleared(request):
            raise PermissionError_("Cannot approve HOD: every department lab must approve first.")
        raise PermissionError_(f"Cannot approve {code}: prerequisites not all approved.")
    previous = section_status.status
    section_status.status = STATUS_APPROVED
    section_status.decided_by = actor
    section_status.decided_at = timezone.now()
    section_status.save()
    _on_status_change(section_status, previous)
    recompute_overall(request)


@transaction.atomic
def reject(section_status, actor, reason):
    """Set REJECTED with a mandatory non-empty reason, written atomically."""
    if not reason or not reason.strip():
        raise ValidationError_("A non-empty reason is required to reject.")
    previous = section_status.status
    section_status.status = STATUS_REJECTED
    section_status.decided_by = actor
    section_status.decided_at = timezone.now()
    section_status.save()
    Comment.objects.create(section_status=section_status, author=actor, body=reason.strip())
    _on_status_change(section_status, previous)
    recompute_overall(request=section_status.request)


def _on_status_change(section_status, previous):
    """Reverse-hierarchy cascade: leaving APPROVED resets the downstream closure.
    Also resets intake_submitted if a tri-gate section (Library, TPC, Warden) is rejected,
    so the student can re-upload and re-confirm."""
    from .models import SECTION_LIBRARY, SECTION_TPC, SECTION_WARDEN
    TRIGATE = {SECTION_LIBRARY, SECTION_TPC, SECTION_WARDEN}

    if previous == STATUS_APPROVED and section_status.status != STATUS_APPROVED:
        # A section approved through staff levels (Accounts, main/staff.py) is
        # re-checked from the first level when it reopens.
        StageApproval.objects.filter(section_status=section_status).delete()
        request = section_status.request
        smap = _status_map(request)
        for dep_code in downstream_closure(section_status.section.code):
            ds = smap.get(dep_code)
            if ds is not None and ds.status == STATUS_APPROVED:
                ds.status = STATUS_PENDING
                ds.decided_by = None
                ds.decided_at = None
                ds.save()
                StageApproval.objects.filter(section_status=ds).delete()
                Comment.objects.create(
                    section_status=ds, author=None, is_system=True,
                    body=f"Reset: upstream {section_status.section.code} reopened",
                )
        _invalidate_certificate(request)

    # If a tri-gate section is rejected, keep intake_submitted as-is.
    # The student sees the locking screen with the rejection reason and clicks
    # the rejected card to open the re-upload form.


def all_sections_approved(request):
    rows = prefetched(request, "section_statuses")
    statuses = ([ss.status for ss in rows] if rows is not None
                else list(request.section_statuses.values_list("status", flat=True)))
    return bool(statuses) and all(s == STATUS_APPROVED for s in statuses)


def recompute_overall(request):
    """CLEARED iff every one of the request's sections is APPROVED *and* Accounts
    has recorded the refund as sent (or none due — main/refunds.py), else
    IN_PROGRESS. (Administration runs alongside Accounts, so no single section's
    approval means all green.) The certificate needs CLEARED."""
    if all_sections_approved(request) and Refund.objects.filter(request=request).exists():
        request.overall_status = OVERALL_CLEARED
    else:
        request.overall_status = OVERALL_IN_PROGRESS
    request.save(update_fields=["overall_status"])


def _invalidate_certificate(request):
    Certificate.objects.filter(request=request).delete()
    if request.overall_status != OVERALL_IN_PROGRESS:
        request.overall_status = OVERALL_IN_PROGRESS
        request.save(update_fields=["overall_status"])


# ─── Department labs (HOD-managed hierarchy) ─────────────────────────────────────
#
# Replaces the paper "No Dues Form for Department Purpose" (one sheet the
# student carried to every lab). Each department's HOD registers its labs and
# arranges them in levels (main/labs.py, /api/hod/labs/):
#
#   level 1: labs A, B, C   <- receive the request together
#   level 2: lab D          <- only once A, B and C have all approved
#   level 3: lab E
#   HOD                     <- only once every lab has approved
#
# The student moves the request along (send_next_lab_level) from the HOD card
# on Page 3. The first send copies the department's current labs into one
# LabStatus per lab (with each lab's level at that moment), so an HOD
# re-arranging labs later only affects students who haven't started yet.
# A department with no labs behaves exactly as before: HOD acts directly.

TRI_GATE_SECTIONS = [SECTION_LIBRARY, SECTION_TPC, SECTION_WARDEN]


def tri_gate_cleared(request):
    """Library/TPC/Warden (whichever this request requires) are all APPROVED —
    the point at which the student's Page 3, and so the lab chain, opens."""
    smap = _status_map(request)
    rows = [smap[c] for c in TRI_GATE_SECTIONS if c in smap]
    return bool(rows) and all(ss.status == STATUS_APPROVED for ss in rows)


def department_has_labs(department_id):
    return Lab.objects.filter(department_id=department_id, is_active=True).exists()


def lab_progress(request, dept_has_labs=None):
    """{"total", "approved", "started", "cleared"} for this request's lab chain.

    `cleared` is what HOD waits on: every lab in the chain APPROVED — or, before
    the student has started the chain, only if their department has no labs.
    """
    rows = prefetched(request, "lab_statuses")
    statuses = ([ls.status for ls in rows] if rows is not None
                else list(request.lab_statuses.values_list("status", flat=True)))
    total = len(statuses)
    approved = sum(1 for s in statuses if s == STATUS_APPROVED)
    if total:
        cleared = approved == total
    else:
        if dept_has_labs is None:
            dept_has_labs = department_has_labs(request.student.department_id)
        cleared = not dept_has_labs
    return {"total": total, "approved": approved, "started": total > 0, "cleared": cleared}


def labs_cleared(request, dept_has_labs=None):
    return lab_progress(request, dept_has_labs=dept_has_labs)["cleared"]


def lab_actionable(lab_status):
    """True iff the request was sent to this lab and every lab on an earlier
    level of the same request is APPROVED."""
    if lab_status.sent_at is None:
        return False
    # A lab desk prefetches each request's lab rows (api.lab_queue).
    request = lab_status.request if LabStatus.request.is_cached(lab_status) else None
    rows = prefetched(request, "lab_statuses")
    if rows is not None:
        return not any(ls.level < lab_status.level and ls.status != STATUS_APPROVED for ls in rows)
    return not LabStatus.objects.filter(
        request_id=lab_status.request_id, level__lt=lab_status.level,
    ).exclude(status=STATUS_APPROVED).exists()


@transaction.atomic
def send_next_lab_level(request, actor):
    """
    Student action: send the request to the next level of labs. The first call
    copies the department's labs into the chain. Returns the LabStatus rows that
    were just sent. (The Page-3 / tri-gate requirement is checked by the view.)
    """
    # Serialise double-clicks on the same request; unique (request, lab) backs it up.
    ClearanceRequest.objects.select_for_update().filter(pk=request.pk).first()

    rows = list(request.lab_statuses.select_related("lab"))
    if not rows:
        hod = request.section_statuses.filter(section__code=SECTION_HOD).first()
        if hod is None:
            raise PermissionError_("HOD clearance is not part of this request.")
        if hod.status == STATUS_APPROVED:
            raise PermissionError_("HOD has already approved your departmental clearance.")
        labs = list(Lab.objects.filter(department_id=request.student.department_id, is_active=True))
        if not labs:
            raise PermissionError_("Your department has no labs set up — HOD reviews your request directly.")
        rows = [LabStatus.objects.create(request=request, lab=lab, level=lab.level) for lab in labs]

    unsent = [ls for ls in rows if ls.sent_at is None]
    if not unsent:
        raise PermissionError_("Your request has already been sent to every lab.")
    level = min(ls.level for ls in unsent)
    waiting = sorted(ls.lab.name for ls in rows if ls.level < level and ls.status != STATUS_APPROVED)
    if waiting:
        raise PermissionError_(
            "Every lab on the earlier level must approve first (waiting on: " + ", ".join(waiting) + ")."
        )

    now = timezone.now()
    sent = [ls for ls in unsent if ls.level == level]
    for ls in sent:
        ls.sent_at = now
        ls.save(update_fields=["sent_at"])
    return sent


@transaction.atomic
def resend_lab(lab_status, actor):
    """Student action: send a REJECTED lab request back to that lab (PENDING)."""
    if lab_status.status != STATUS_REJECTED:
        raise PermissionError_("Only a rejected lab request can be re-sent.")
    lab_status.status = STATUS_PENDING
    lab_status.decided_by = None
    lab_status.decided_at = None
    lab_status.sent_at = timezone.now()
    lab_status.save(update_fields=["status", "decided_by", "decided_at", "sent_at"])
    Comment.objects.create(lab_status=lab_status, author=actor, is_system=True,
                           body="Student re-sent the request after rejection.")


@transaction.atomic
def approve_lab(lab_status, actor):
    """Lab in-charge approves ("no dues"). Every earlier level must be APPROVED.
    (Who may act on which lab is enforced at the view layer.)"""
    if lab_status.sent_at is None:
        raise PermissionError_("This request hasn't been sent to your lab yet.")
    if not lab_actionable(lab_status):
        raise PermissionError_("Cannot approve yet: every lab on an earlier level must approve first.")
    previous = lab_status.status
    lab_status.status = STATUS_APPROVED
    lab_status.decided_by = actor
    lab_status.decided_at = timezone.now()
    lab_status.save(update_fields=["status", "decided_by", "decided_at"])
    _on_lab_status_change(lab_status, previous)


@transaction.atomic
def reject_lab(lab_status, actor, reason):
    """Lab in-charge rejects ("dues pending") with a mandatory reason, written atomically."""
    if not reason or not reason.strip():
        raise ValidationError_("A non-empty reason is required to reject.")
    if lab_status.sent_at is None:
        raise PermissionError_("This request hasn't been sent to your lab yet.")
    previous = lab_status.status
    lab_status.status = STATUS_REJECTED
    lab_status.decided_by = actor
    lab_status.decided_at = timezone.now()
    lab_status.save(update_fields=["status", "decided_by", "decided_at"])
    Comment.objects.create(lab_status=lab_status, author=actor, body=reason.strip())
    _on_lab_status_change(lab_status, previous)
    recompute_overall(lab_status.request)


def _on_lab_status_change(lab_status, previous):
    """Reverse cascade for labs: a lab leaving APPROVED resets every later-level
    lab of the same request, and HOD — whose own cascade then resets Accounts,
    Administration and the certificate (_on_status_change)."""
    if previous != STATUS_APPROVED or lab_status.status == STATUS_APPROVED:
        return
    request = lab_status.request
    later = LabStatus.objects.filter(request=request, level__gt=lab_status.level, status=STATUS_APPROVED)
    for ls in later:
        ls.status = STATUS_PENDING
        ls.decided_by = None
        ls.decided_at = None
        ls.save(update_fields=["status", "decided_by", "decided_at"])
        Comment.objects.create(lab_status=ls, author=None, is_system=True,
                               body=f"Reset: earlier lab {lab_status.lab.name} reopened")
    hod = request.section_statuses.filter(section__code=SECTION_HOD).first()
    if hod is not None and hod.status == STATUS_APPROVED:
        hod.status = STATUS_PENDING
        hod.decided_by = None
        hod.decided_at = None
        hod.save(update_fields=["status", "decided_by", "decided_at"])
        Comment.objects.create(section_status=hod, author=None, is_system=True,
                               body=f"Reset: lab {lab_status.lab.name} reopened")
        _on_status_change(hod, STATUS_APPROVED)


@transaction.atomic
def drop_lab_from_open_requests(lab, actor):
    """
    HOD removed `lab`: it stops blocking every in-progress request it hasn't
    approved (those rows are deleted; its past approvals stay as history).
    Returns how many requests were released.
    """
    released = 0
    open_rows = (LabStatus.objects.filter(lab=lab, request__is_active=True)
                 .exclude(status=STATUS_APPROVED).select_related("request"))
    for ls in open_rows:
        hod = ls.request.section_statuses.filter(section__code=SECTION_HOD).first()
        if hod is not None:
            Comment.objects.create(
                section_status=hod, author=actor, is_system=True,
                body=f"{lab.name} was removed from the department's lab chain by the HOD — "
                     f"its approval is no longer needed.",
            )
        ls.delete()
        released += 1
    return released


# ─── Exit-type → required section set (Design.md § Routing & Scoping) ────────────

from .models import EXIT_TYPES  # noqa: E402

# Graduation uses the full set. Other exit types omit sections that don't apply.
REQUIRED_SECTIONS = {
    "GRADUATION": list(ALL_SECTION_CODES),
    # NEP exit / withdrawal / admission-cancel: no placement (TPC) obligation.
    "NEP_EXIT": [c for c in ALL_SECTION_CODES if c != SECTION_TPC],
    "WITHDRAWAL": [c for c in ALL_SECTION_CODES if c != SECTION_TPC],
    "ADMISSION_CANCEL": [c for c in ALL_SECTION_CODES if c != SECTION_TPC],
}


def required_sections(exit_type):
    """Section codes required for a given exit type."""
    return REQUIRED_SECTIONS.get(exit_type, list(ALL_SECTION_CODES))


# ─── Page 1 intake: sections the student uploads to before the tri-gate opens ───
# (Library BTP + TPC offer letter. Warden needs the vacated room number, captured
#  separately on the request.) LUCS / Dept-form / Accounts-cheque uploads happen
#  later, inline on the dashboard, when those stages are reached.
INTAKE_UPLOAD_SECTIONS = [SECTION_LIBRARY, SECTION_TPC]


def intake_required_uploads(exit_type):
    """Intake upload sections that actually apply to this exit type."""
    req = set(required_sections(exit_type))
    return [c for c in INTAKE_UPLOAD_SECTIONS if c in req]
