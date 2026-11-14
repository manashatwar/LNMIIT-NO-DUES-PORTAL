"""
Section staff — delegation inside one section's desk. Enabled for the Library,
LUCS, NAD Cell, Accounts and Administration (STAFF_SECTIONS); adding a section
code there is all it takes to extend it.

Each such section's own account (library@, lucs@, nad@, accounts@,
admin.office@lnmiit.ac.in) is its *head*, and every request reaches the head
first. The head adds staff — each gets a login with the section's role, so they
sign in as that section — and work reaches them in one of two ways:

* By hand (Library, LUCS, NAD Cell, Administration): the head sends requests to a
  staff member — the next N waiting ones in one go, or specific ones
  (SectionStatus.assigned_to).

* By level (LEVELLED_SECTIONS — Accounts): the head puts each staff member on a
  level, and a ready request moves up the levels by itself. Either person on a
  level may approve it (one approval per level — StageApproval). After the last
  level, the request comes to the head, always the final step: its approval
  approves the section. A rejection goes back to the student, and once fixed the
  request returns to the level that rejected — earlier levels' approvals stay.
  Levels are worked out live from the head's current staff, so a level with no
  one on it is simply skipped and nothing gets stranded.

Either way, staff see and decide only what has reached them. By hand, their
decision is final and the head can still decide anything itself. By level, the
head gives the final approval after every level, and can also approve a request
at any level it's waiting at, standing in for the people on it: that counts as
the level's approval and moves the request up one step, so the chain is never
skipped (at the last level, it is also the head's own final approval). Only the
head manages staff, and each head only its own.
"""
from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone

from . import engine
from . import prefetch
from .accounts import AccountError, clean_level, clean_name, clean_email, check_password, create_login
from .models import (
    Comment, SectionStatus, StageApproval, UserProfile,
    SECTION_LIBRARY, SECTION_LUCS, SECTION_NAD, SECTION_ACCOUNTS, SECTION_ADMINISTRATION,
    SECTION_TPC, SECTION_WARDEN, SECTION_HOD,
    STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED,
)

STAFF_SECTIONS = [SECTION_LIBRARY, SECTION_LUCS, SECTION_NAD, SECTION_ACCOUNTS, SECTION_ADMINISTRATION]
LEVELLED_SECTIONS = [SECTION_ACCOUNTS]   # the rest are by hand
# Levelled sections whose requests are ready only once the student's latest
# submission is confirmed — Accounts: the cancelled-cheque details.
CONFIRMED_SUBMISSION_SECTIONS = [SECTION_ACCOUNTS]
MAX_BATCH = 500

StaffError = AccountError   # what callers catch (api.py)


def is_head(profile):
    """The section's own account, for a section that can have staff."""
    return profile is not None and profile.role in STAFF_SECTIONS and profile.managed_by_id is None


def is_staff_member(profile):
    return profile is not None and profile.managed_by_id is not None


def is_levelled(section_code):
    return section_code in LEVELLED_SECTIONS


def staff_of(head_user, include_removed=False):
    qs = UserProfile.objects.filter(managed_by=head_user).select_related("user")
    if not include_removed:
        qs = qs.filter(user__is_active=True)
    return qs.order_by("staff_level", "user__first_name", "user__username")


def _display(user):
    return user.get_full_name() or user.username


# ─── By hand (Library, LUCS, NAD Cell, Administration) ───────────────────────────

def ready_for_staff(section_code):
    """Waiting with the head and ready to review: the student has submitted Page 1,
    confirmed this section (confirm-only sections such as LUCS, NAD and
    Administration) and — for a section that waits on others (Administration:
    Library, TPC, Warden, HOD; TPC only for the exit types that have it) — those
    have approved, so staff can act on it."""
    qs = SectionStatus.objects.filter(
        section__code=section_code, status=STATUS_PENDING, assigned_to__isnull=True,
        student_confirmed=True, request__is_active=True, request__intake_submitted=True,
    )
    for code in engine.prerequisites(section_code):
        if code in engine.OPTIONAL_PREREQUISITES:
            # Waived for exit types that don't include it (no TPC row on an NEP
            # exit); blocks only a request that has it and hasn't approved it yet.
            qs = qs.filter(~Exists(SectionStatus.objects.filter(
                request=OuterRef("request"), section__code=code).exclude(status=STATUS_APPROVED)))
        else:
            qs = qs.filter(request__section_statuses__section__code=code,
                           request__section_statuses__status=STATUS_APPROVED)
    return qs


# ─── By level (Accounts) ─────────────────────────────────────────────────────────

def level_names(section_code):
    """{level: [names]} for the section's active staff, lowest level first. The
    head is never on a level: it is the final step after all of them."""
    names = {}
    for p in (UserProfile.objects.filter(role=section_code, user__is_active=True, managed_by__isnull=False,
                                         staff_level__isnull=False)
              .select_related("user").order_by("staff_level", "user__first_name", "user__username")):
        names.setdefault(p.staff_level, []).append(_display(p.user))
    return dict(sorted(names.items()))


def head_profile(section_code):
    return (UserProfile.objects.filter(role=section_code, managed_by__isnull=True)
            .select_related("user").order_by("id").first())


def chain_names(section_code):
    """{level: [names]}: the staff levels, in order (the head's final step follows them)."""
    return level_names(section_code)


def my_step(profile):
    """The level this staff member approves at; None for everyone else (the head's
    own step is the final one, after every level)."""
    if profile is not None and is_levelled(profile.role) and is_staff_member(profile):
        return profile.staff_level
    return None


def stage_ready(ss):
    """Ready for the section's staff levels: pending, confirmed by the student,
    every prerequisite approved (Accounts: Library, TPC, Warden, HOD) and — for
    Accounts — the student's latest submission confirmed (their cancelled-cheque
    details)."""
    if ss.status != STATUS_PENDING or not ss.student_confirmed or not ss.request.is_active:
        return False
    if not engine.actionable(ss.request, ss.section.code):
        return False
    if ss.section.code not in CONFIRMED_SUBMISSION_SECTIONS:
        return True
    documents = prefetch.prefetched(ss, "documents")
    latest = (prefetch.latest_document(documents) if documents is not None
              else ss.documents.order_by("-uploaded_at", "-id").first())
    return latest is not None and bool((latest.ocr_fields or {}).get("confirmed"))


def _approvals(ss):
    """The request's level approvals, with who gave them, lowest level first."""
    rows = prefetch.prefetched(ss, "stage_approvals")
    return rows if rows is not None else list(ss.stage_approvals.select_related("approved_by"))


def current_level(ss, levels=None):
    """The level a request is waiting at — None while it isn't at a level: not
    ready yet, already decided, or every level has approved (it's then with the
    head for the final approval)."""
    if not stage_ready(ss):
        return None
    if levels is None:
        levels = list(chain_names(ss.section.code))
    rows = prefetch.prefetched(ss, "stage_approvals")
    done = ({a.level for a in rows} if rows is not None
            else set(ss.stage_approvals.values_list("level", flat=True)))
    for level in levels:
        if level not in done:
            return level
    return None


def stage_info(ss, names=None):
    """A request's progress through the chain, as the head and staff see it."""
    if names is None:
        names = chain_names(ss.section.code)
    levels = sorted(names)
    current = current_level(ss, levels)
    # Ready for the levels at all (prerequisites approved, cheque details confirmed)?
    ready = current is not None or stage_ready(ss)
    return {
        "levels": levels,                            # the staff levels, in order
        "current": current,
        "ready": ready,
        # Every level has approved (or there are none): with the head for the final approval.
        "final": ready and current is None,
        # Not ready: the earlier sections it still waits on ([] = the student's confirmation).
        "blocked_by": waiting_for(ss) if not ready and ss.status == STATUS_PENDING else [],
        "waiting_on": names.get(current, []) if current is not None else [],
        "approved": [
            {"level": a.level, "by": _display(a.approved_by) if a.approved_by else None,
             "at": a.approved_at.isoformat()}
            for a in _approvals(ss)
        ],
    }


_SHORT_NAMES ={SECTION_LIBRARY: "Library", SECTION_TPC: "TPC", SECTION_WARDEN: "Warden", SECTION_HOD: "HOD"}


def waiting_for(ss):
    """The earlier sections a request still waits on before this section's turn
    (Accounts: Library, TPC, Warden, HOD — no TPC for an NEP exit, a withdrawal
    or an admission cancel), by short name — as engine.actionable sees them."""
    return [_SHORT_NAMES.get(code, code.title())
            for code in engine.unapproved_prerequisites(ss.request, ss.section.code)]


def not_ready_reason(ss):
    """Why a request isn't waiting at any step of the chain, in words."""
    if ss.status == STATUS_APPROVED:
        return "This request is already approved."
    if ss.status == STATUS_REJECTED:
        return "This request was sent back to the student; it returns to its level once they fix it."
    pending = waiting_for(ss)
    if pending:
        return f"Not ready yet: waiting for {', '.join(pending)} to approve first."
    if ss.section.code in CONFIRMED_SUBMISSION_SECTIONS:
        return "Not ready yet: the student hasn't confirmed their cheque details."
    return "Not ready yet: the student hasn't confirmed their details."


def _step_name(level):
    return f"Level {level}"


def head_can_approve(ss):
    """The head's final step: it approves the section once every staff level has
    approved, or straight away when there are no staff levels at all."""
    levels = sorted(level_names(ss.section.code))
    if not levels:
        return True
    if not stage_ready(ss):
        return False
    done = set(ss.stage_approvals.values_list("level", flat=True))
    return all(level in done for level in levels)


@transaction.atomic
def approve_level(ss, profile, expected=None):
    """Approve the level a request is waiting at. Staff: only at their own level.
    The head: at any level, standing in for the people on it — that counts as the
    level's approval and moves the request up one step. To stand in, the head
    names the level it saw (`expected`), so a request that moved on meanwhile
    isn't approved a step further by mistake. After the last level the request
    waits for the head's final approval; the head standing in at the last level
    gives it in the same click. Returns True when the section got approved."""
    # Two people on one level clicking together: the second waits here, then
    # finds the request has already moved on.
    ss = SectionStatus.objects.select_for_update().get(pk=ss.pk)
    level = current_level(ss)
    if level is None:
        raise engine.PermissionError_(not_ready_reason(ss))
    if expected is not None and expected != level:
        raise engine.PermissionError_(
            f"This request has moved on to {_step_name(level)}. Refresh and try again.")
    if level != my_step(profile):
        if not is_head(profile):
            raise engine.PermissionError_("This request isn't waiting at your level.")
        if expected is None:
            raise engine.PermissionError_(
                f"This request is waiting at {_step_name(level)}. Name that level to approve it for them.")
    StageApproval.objects.create(section_status=ss, level=level, approved_by=profile.user)
    # That was the last level: next comes the head's final step. The head itself
    # standing in here gives that too; staff leave it waiting for the head. (With
    # no head account at all, the last level is final.)
    if current_level(ss) is None and (is_head(profile) or head_profile(ss.section.code) is None):
        engine.approve(ss, profile.user)
        return True
    return False


def approve(ss, profile, expected=None):
    """Approve on a levelled section's desk (Accounts) — staff or head. Returns
    True when the section itself got approved."""
    if not is_head(profile) or current_level(ss) is not None:
        return approve_level(ss, profile, expected)
    # The head's own step, the final one: once every staff level has approved (or
    # there are none). Otherwise the request isn't ready yet (earlier sections, or
    # the student's cheque details).
    if not (head_can_approve(ss) and engine.actionable(ss.request, ss.section.code)):
        raise engine.PermissionError_(not_ready_reason(ss))
    if expected is not None:
        # It meant to stand in for a level, but every level has approved meanwhile.
        raise engine.PermissionError_(
            "Every level has approved this request meanwhile: it's now waiting for your final approval. "
            "Refresh and try again.")
    engine.approve(ss, profile.user)
    return True


def level_queue(profile, prepare=None):
    """A levelled section's staff desk, as [(section status, status for them)]:
    requests waiting at their level (PENDING), requests they approved a level of
    (APPROVED), and requests they rejected (REJECTED). `prepare`: the desk's batch
    loading for these rows (prefetch.for_desk); by default, what this reads."""
    user = profile.user
    levels = list(chain_names(profile.role))
    rows = (SectionStatus.objects
            .filter(section__code=profile.role, request__is_active=True, student_confirmed=True)
            .filter(Q(status=STATUS_PENDING) | Q(stage_approvals__approved_by=user) | Q(decided_by=user))
            .distinct()
            .order_by("request__created_at", "id"))
    rows = prepare(rows) if prepare is not None else prefetch.for_desk(rows, prerequisites=True, stages=True)
    out = []
    for ss in rows:
        if any(a.approved_by_id == user.id for a in _approvals(ss)):
            out.append((ss, STATUS_APPROVED))
        elif ss.status == STATUS_REJECTED and ss.decided_by_id == user.id:
            out.append((ss, STATUS_REJECTED))
        elif (ss.status == STATUS_PENDING and profile.staff_level is not None
              and current_level(ss, levels) == profile.staff_level):
            out.append((ss, STATUS_PENDING))
    return out


def _pending_in_chain(section_code):
    """Every pending row of a levelled section, with what current_level() and
    stage_ready() read, loaded in a fixed number of queries."""
    return prefetch.for_desk(
        SectionStatus.objects.filter(section__code=section_code, status=STATUS_PENDING,
                                     student_confirmed=True, request__is_active=True),
        prerequisites=True, stages=True)


def waiting_by_level(section_code):
    """{level: how many requests are waiting there} — for the head's staff panel."""
    levels = list(chain_names(section_code))
    counts = {}
    for ss in _pending_in_chain(section_code):
        level = current_level(ss, levels)
        if level is not None:
            counts[level] = counts.get(level, 0) + 1
    return counts


def waiting_for_final(section_code):
    """How many requests every level has approved, now waiting for the head's
    final approval — for the head's card in its staff panel."""
    levels = list(chain_names(section_code))
    return sum(1 for ss in _pending_in_chain(section_code)
               if current_level(ss, levels) is None and stage_ready(ss))


# ─── Who may see / decide ────────────────────────────────────────────────────────

def can_handle(profile, ss):
    """May this person see and comment on the request? Staff: only what reached them
    (by level: also what they approved or rejected); everyone else as before."""
    if not is_staff_member(profile):
        return True
    if is_levelled(ss.section.code):
        return ((profile.staff_level is not None and current_level(ss) == profile.staff_level)
                or ss.stage_approvals.filter(approved_by_id=profile.user_id).exists()
                or ss.decided_by_id == profile.user_id)
    return ss.assigned_to_id == profile.user_id


def can_decide(profile, ss):
    """May this person approve / reject the request right now?"""
    if not is_staff_member(profile):
        return True
    if is_levelled(ss.section.code):
        return profile.staff_level is not None and current_level(ss) == profile.staff_level
    return ss.assigned_to_id == profile.user_id


# ─── Managing staff (head only) ──────────────────────────────────────────────────

def _removed_staff_hint(user):
    if not user.is_active and UserProfile.objects.filter(user=user, managed_by__isnull=False).exists():
        return "This email belongs to a removed staff member — restore them instead."
    return None


def _target(head, staff_id):
    """One of this head's active staff members, by user id."""
    try:
        staff_id = int(staff_id)
    except (TypeError, ValueError):
        raise StaffError("Choose a staff member.")
    profile = staff_of(head.user).filter(user_id=staff_id).first()
    if profile is None:
        raise StaffError("Choose one of your active staff members.")
    return profile.user


@transaction.atomic
def create_staff(head, *, name, email, password, level=None, refund_manager=False):
    """Add a staff member under `head` (a section head's profile) with their own
    login. In a levelled section they also get a level (default 1) and can be a
    refund manager (Accounts — main/refunds.py)."""
    name = clean_name(name, "Name", required=True)
    staff_level = clean_level(1 if level in (None, "") else level) if is_levelled(head.role) else None
    email = clean_email(email, explain_clash=_removed_staff_hint)
    user = create_login(email=email, password=password, name=name, role=head.role,
                        department=head.department, hostel=head.hostel, managed_by=head.user,
                        staff_level=staff_level)
    if refund_manager and is_levelled(head.role):
        user.profile.is_refund_manager = True
        user.profile.save(update_fields=["is_refund_manager"])
    return user.profile


@transaction.atomic
def update_staff(staff, data):
    """Edit name / email / password / level, or restore a removed member with {"is_active": true}."""
    user = staff.user
    if "name" in data:
        user.first_name = clean_name(data["name"], "Name", required=True)[:150]
    if "email" in data:
        email = clean_email(data["email"], exclude_user=user)
        user.username = email
        user.email = email
    if "level" in data and is_levelled(staff.role):
        staff.staff_level = clean_level(data["level"])
        staff.save(update_fields=["staff_level"])
    if "refund_manager" in data and is_levelled(staff.role):
        staff.is_refund_manager = bool(data["refund_manager"])
        staff.save(update_fields=["is_refund_manager"])
    if data.get("password"):
        check_password(data["password"], user)
        user.set_password(data["password"])
    if data.get("is_active") is True:
        user.is_active = True
    user.save()
    return staff


@transaction.atomic
def remove_staff(staff):
    """
    Disable a staff member's login. By hand: everything they hadn't approved goes
    back to the head (rejected ones too, so a re-submission doesn't land with
    someone who can't sign in). By level: their level simply loses a person — if
    it's now empty, requests skip it. If they never handled anything, the login
    is deleted outright; otherwise it's kept, disabled, so their past decisions
    and messages still show who made them.
    Returns (outcome, returned) — outcome is "deleted" or "deactivated".
    """
    user = staff.user
    returned = (SectionStatus.objects.filter(assigned_to=user, request__is_active=True)
                .exclude(status=STATUS_APPROVED)
                .update(assigned_to=None, assigned_at=None))
    handled = (SectionStatus.objects.filter(Q(assigned_to=user) | Q(decided_by=user)).exists()
               or StageApproval.objects.filter(approved_by=user).exists()
               or Comment.objects.filter(author=user).exists())
    if not handled:
        user.delete()   # cascades the profile
        return "deleted", returned
    user.is_active = False
    user.save(update_fields=["is_active"])
    return "deactivated", returned


def _by_hand_only(head):
    if is_levelled(head.role):
        raise StaffError("Requests here move through your staff levels by themselves.")


@transaction.atomic
def send_next(head, staff_id, count):
    """Send the next `count` waiting requests (oldest first) to one staff member.
    Returns (staff user, how many were sent) — fewer if fewer were waiting."""
    _by_hand_only(head)
    target = _target(head, staff_id)
    try:
        count = int(count)
    except (TypeError, ValueError):
        raise StaffError("Enter how many requests to send.")
    if not 1 <= count <= MAX_BATCH:
        raise StaffError(f"Send between 1 and {MAX_BATCH} requests at a time.")
    ids = list(ready_for_staff(head.role)
               .order_by("request__created_at", "id")
               .select_for_update(skip_locked=True, of=("self",))
               .values_list("id", flat=True)[:count])
    SectionStatus.objects.filter(id__in=ids).update(assigned_to=target, assigned_at=timezone.now())
    return target, len(ids)


@transaction.atomic
def move(head, request_ids, staff_id):
    """Send specific (not yet approved) requests to a staff member — or back to the
    head when `staff_id` is empty. Returns (staff user or None, how many moved)."""
    _by_hand_only(head)
    target = _target(head, staff_id) if staff_id not in (None, "", 0) else None
    ids = []
    for value in request_ids or []:
        try:
            ids.append(int(value))
        except (TypeError, ValueError):
            pass
    if not ids:
        raise StaffError("No requests chosen.")
    moved = (SectionStatus.objects
             .filter(section__code=head.role, request_id__in=ids, request__is_active=True)
             .exclude(status=STATUS_APPROVED)
             .update(assigned_to=target, assigned_at=timezone.now() if target else None))
    return target, moved
