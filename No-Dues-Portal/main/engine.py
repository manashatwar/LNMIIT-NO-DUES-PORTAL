"""
Approval engine — Design.md § Approval Engine.

Owns the dependency graph, prerequisite gating, and the transactional
reverse-hierarchy cascade. Pure-Python graph helpers + DB-aware operations.
"""
from django.db import transaction
from django.utils import timezone

from .models import (
    Section, SectionStatus, Comment, Certificate, ClearanceRequest,
    STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED,
    OVERALL_IN_PROGRESS, OVERALL_CLEARED,
    SECTION_LIBRARY, SECTION_TPC, SECTION_WARDEN, SECTION_STORE, SECTION_LUCS,
    SECTION_SPORTS, SECTION_MEDICAL, SECTION_NAD, SECTION_HOD,
    SECTION_ACCOUNTS, SECTION_ADMINISTRATION,
)

# ─── Dependency graph: section -> prerequisite section codes ────────────────────
#
# Department-Purpose (a mandatory upload gating HOD) was removed — HOD no
# longer requires a dedicated form upload. If an HOD needs something from a
# student, they ask for it via the existing section comment thread instead of
# a blocking gate (main/api.py::officer_comment / student_comment).
#
# HOD is fully independent — no prerequisites, and no informational
# consolidation of Store/LUCS/Sports/Medical/NAD either (that was tried and
# then explicitly removed — HOD's review screen only shows its own section,
# same as Store/LUCS/Sports/Medical/NAD's screens already do for each other).
# It's actionable in parallel with all of them, same as they're already
# parallel with each other.

PREREQUISITES = {
    SECTION_ACCOUNTS: [SECTION_LIBRARY, SECTION_TPC, SECTION_WARDEN, SECTION_HOD],
    SECTION_ADMINISTRATION: [SECTION_ACCOUNTS],
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
    """{section_code: SectionStatus} for a request."""
    return {ss.section.code: ss for ss in request.section_statuses.select_related("section")}


def actionable(request, section_code):
    """True iff every prerequisite of `section_code` is APPROVED for this request."""
    smap = _status_map(request)
    for prereq in prerequisites(section_code):
        ss = smap.get(prereq)
        if ss is None or ss.status != STATUS_APPROVED:
            return False
    return True


@transaction.atomic
def approve(section_status, actor):
    """
    Set APPROVED. Requires all prerequisites APPROVED. (Role/scope checks are
    enforced at the view layer before calling this.)
    """
    request = section_status.request
    if not actionable(request, section_status.section.code):
        raise PermissionError_(
            f"Cannot approve {section_status.section.code}: prerequisites not all approved."
        )
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
        request = section_status.request
        smap = _status_map(request)
        for dep_code in downstream_closure(section_status.section.code):
            ds = smap.get(dep_code)
            if ds is not None and ds.status == STATUS_APPROVED:
                ds.status = STATUS_PENDING
                ds.decided_by = None
                ds.decided_at = None
                ds.save()
                Comment.objects.create(
                    section_status=ds, author=None, is_system=True,
                    body=f"Reset: upstream {section_status.section.code} reopened",
                )
        _invalidate_certificate(request)

    # If a tri-gate section is rejected, keep intake_submitted as-is.
    # The student sees the locking screen with the rejection reason and clicks
    # the rejected card to open the re-upload form.


def recompute_overall(request):
    """CLEARED iff Administration is APPROVED, else IN_PROGRESS."""
    smap = _status_map(request)
    admin = smap.get(SECTION_ADMINISTRATION)
    if admin is not None and admin.status == STATUS_APPROVED:
        request.overall_status = OVERALL_CLEARED
    else:
        request.overall_status = OVERALL_IN_PROGRESS
    request.save(update_fields=["overall_status"])


def _invalidate_certificate(request):
    Certificate.objects.filter(request=request).delete()
    if request.overall_status != OVERALL_IN_PROGRESS:
        request.overall_status = OVERALL_IN_PROGRESS
        request.save(update_fields=["overall_status"])


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
