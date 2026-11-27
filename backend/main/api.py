"""
JSON API for the LNMIIT No Dues Portal — Design.md aligned.

Session auth + role/scope guard. The React SPA talks to these endpoints through
the Vite dev proxy (same-origin), so Django CSRF + sessions work directly.
"""
import json
import re

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.db.models import Count, Prefetch, Q, prefetch_related_objects
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

from . import checklist as checklist_service
from . import engine
from . import labs as lab_service
from . import prefetch
from . import refunds as refund_service
from . import staff as staff_service
from .models import (
    Department, Hostel, Section, UserProfile, Student,
    ClearanceRequest, SectionStatus, Document, Comment, Certificate, Lab, LabStatus, StageApproval,
    EXIT_TYPES, STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED,
    OVERALL_CLEARED, SECTION_LIBRARY, SECTION_TPC, SECTION_WARDEN,
    SECTION_HOD, SECTION_ACCOUNTS, SECTION_ADMINISTRATION, ROLE_LAB,
)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB — matches the original UI design (docs/images/ui-wireframe.png)

# Hostel room numbers: one block letter + exactly 3 digits, e.g. A102, B501.
VACANT_ROOM_RE = re.compile(r"^[A-Za-z]\d{3}$")

# Basic (name/roll) sections: the request reaches each of these offices by itself
# once its prerequisites approve — no "Confirm & Send". After a rejection the
# student sends it back from the section's card (resend_section).
RESEND_SECTIONS = set(engine.DEPARTMENT_SECTIONS) | {SECTION_ADMINISTRATION}
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "application/pdf"}
ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".pdf"}

ROLES = ["STUDENT"] + engine.ALL_SECTION_CODES + [ROLE_LAB, "ADMIN"]


# ─── Helpers ────────────────────────────────────────────────────────────────────

def _json_body(request):
    try:
        return json.loads(request.body.decode("utf-8") or "{}")
    except (ValueError, UnicodeDecodeError):
        return {}


def _profile(user):
    return UserProfile.objects.filter(user=user).select_related("hostel", "department").first()


def _active_request(student):
    return ClearanceRequest.objects.filter(student=student, is_active=True).first()


def _int(value):
    """Parse an id from a request body/query string; None if it isn't one."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _comment_dict(c):
    return {"body": c.body, "author": (c.author.username if c.author else "system"),
            "is_system": c.is_system, "created_at": c.created_at.isoformat()}


def _person(user):
    return {"id": user.id, "name": user.get_full_name() or user.username} if user else None


def _per_user(qs, field):
    """{user id: number of rows} — one GROUP BY query."""
    return dict(qs.values_list(field).annotate(n=Count("id")).order_by())


def _staff_counts(profiles):
    """Each staff member's counts for _staff_dict, for the whole list in two
    queries rather than two per person: {"pending": {...}, "decided": {...}}."""
    ids = [p.user_id for p in profiles]
    if not ids:
        return {"pending": {}, "decided": {}}
    if staff_service.is_levelled(profiles[0].role):
        approved = _per_user(StageApproval.objects.filter(approved_by__in=ids), "approved_by")
        rejected = _per_user(SectionStatus.objects.filter(decided_by__in=ids, status=STATUS_REJECTED), "decided_by")
        return {"pending": {}, "decided": {i: approved.get(i, 0) + rejected.get(i, 0) for i in ids}}
    return {
        "pending": _per_user(SectionStatus.objects.filter(
            assigned_to__in=ids, status=STATUS_PENDING, request__is_active=True), "assigned_to"),
        "decided": _per_user(SectionStatus.objects.filter(decided_by__in=ids), "decided_by"),
    }


def _staff_dict(p, waiting_by_level=None, counts=None):
    """A section staff member as their head sees them (main/staff.py). `counts`:
    _staff_counts() for a whole list; without it, this person's own queries."""
    levelled = staff_service.is_levelled(p.role)
    if levelled:
        # By level: what's waiting at their level (shared with anyone else on it),
        # and the levels they approved plus requests they rejected.
        if waiting_by_level is None:
            waiting_by_level = staff_service.waiting_by_level(p.role)
        pending = waiting_by_level.get(p.staff_level, 0) if p.user.is_active else 0
        decided = (counts["decided"].get(p.user_id, 0) if counts is not None
                   else StageApproval.objects.filter(approved_by=p.user).count()
                   + SectionStatus.objects.filter(decided_by=p.user, status=STATUS_REJECTED).count())
    elif counts is not None:
        pending = counts["pending"].get(p.user_id, 0)
        decided = counts["decided"].get(p.user_id, 0)
    else:
        # By hand: requests sent to them and still waiting, decisions they've made.
        pending = SectionStatus.objects.filter(
            assigned_to=p.user, status=STATUS_PENDING, request__is_active=True).count()
        decided = SectionStatus.objects.filter(decided_by=p.user).count()
    return {
        "id": p.user_id,
        "name": p.user.get_full_name() or p.user.username,
        "email": p.user.username,
        "is_active": p.user.is_active,
        "level": p.staff_level if levelled else None,
        "refund_manager": bool(levelled and p.is_refund_manager),   # Accounts: sends refunds
        "pending": pending,
        "decided": decided,
    }


def _staff_list(head_user, include_removed=False):
    profiles = list(staff_service.staff_of(head_user, include_removed=include_removed))
    waiting = None
    if profiles and staff_service.is_levelled(profiles[0].role):
        waiting = staff_service.waiting_by_level(profiles[0].role)   # once, not per person
    counts = _staff_counts(profiles)
    return [_staff_dict(p, waiting, counts) for p in profiles]


# ─── Department labs: serialisers (engine.py § Department labs) ──────────────────

def _lab_rows(req):
    """This request's lab chain, ordered by level then lab name."""
    return list(
        req.lab_statuses.select_related("lab", "decided_by")
        .prefetch_related(Prefetch(
            "comments", queryset=Comment.objects.select_related("author").order_by("created_at")))
        .order_by("level", "lab__name")
    )


def _lab_entry(ls, with_comments=True):
    comments = list(ls.comments.all())
    # The in-charge's latest own message — on a rejection, that's the reason.
    lab_notes = [c for c in comments if not c.is_system and c.author_id == ls.lab.user_id]
    entry = {
        "lab_id": ls.lab_id,
        "name": ls.lab.name,
        "incharge_name": ls.lab.incharge_name,
        "level": ls.level,
        "status": ls.status,
        "sent": ls.sent_at is not None,
        "sent_at": ls.sent_at.isoformat() if ls.sent_at else None,
        "decided_by": ls.decided_by.username if ls.decided_by else None,
        "decided_at": ls.decided_at.isoformat() if ls.decided_at else None,
        "reason": lab_notes[-1].body if (ls.status == STATUS_REJECTED and lab_notes) else None,
    }
    if with_comments:
        entry["comments"] = [_comment_dict(c) for c in comments]
    return entry


def _mark_actionable(entries):
    """Same rule as engine.lab_actionable, computed on already-loaded entries."""
    for e in entries:
        e["actionable"] = e["sent"] and all(
            o["status"] == STATUS_APPROVED for o in entries if o["level"] < e["level"])


def _group_levels(entries):
    """[{level, sent, approved, labs: [...]}, ...] — `entries` sorted by level."""
    levels = []
    for e in entries:
        if not levels or levels[-1]["level"] != e["level"]:
            levels.append({"level": e["level"], "labs": []})
        levels[-1]["labs"].append(e)
    for lv in levels:
        lv["sent"] = all(e["sent"] for e in lv["labs"])
        lv["approved"] = all(e["status"] == STATUS_APPROVED for e in lv["labs"])
    return levels


def _lab_chain(req):
    """Read-only chain overview for officers (HOD, Administration, lab in-charges)."""
    entries = [_lab_entry(ls, with_comments=False) for ls in _lab_rows(req)]
    _mark_actionable(entries)
    return _group_levels(entries)


def _labs_dict(req):
    """
    The student's department-lab chain, shown on the HOD card (Page 3).

    `enabled` is False when no labs apply: the department has none, or HOD
    approved this request before any labs were set up. Until the student
    starts the chain, `levels` previews the department's current hierarchy.
    """
    rows = _lab_rows(req)
    started = bool(rows)
    if started:
        entries = [_lab_entry(ls) for ls in rows]
    else:
        hod = engine.status_map(req).get(SECTION_HOD)
        dept_labs = list(Lab.objects.filter(department_id=req.student.department_id, is_active=True)
                         .order_by("level", "name"))
        if hod is None or hod.status == STATUS_APPROVED or not dept_labs:
            return {"enabled": False, "started": False, "cleared": True, "total": 0, "approved": 0,
                    "levels": [], "next_level": None, "can_send": False}
        entries = [{
            "lab_id": lab.id, "name": lab.name, "incharge_name": lab.incharge_name,
            "level": lab.level, "status": STATUS_PENDING, "sent": False, "sent_at": None,
            "decided_by": None, "decided_at": None, "reason": None, "comments": [],
        } for lab in dept_labs]
    _mark_actionable(entries)

    total = len(entries)
    approved = sum(1 for e in entries if e["status"] == STATUS_APPROVED)
    unsent = [e["level"] for e in entries if not e["sent"]]
    next_level = min(unsent) if unsent else None
    can_send = (
        next_level is not None
        and all(e["status"] == STATUS_APPROVED for e in entries if e["level"] < next_level)
        and req.intake_submitted
        and engine.tri_gate_cleared(req)
    )
    return {
        "enabled": True,
        "started": started,
        "cleared": started and approved == total,
        "total": total,
        "approved": approved,
        "levels": _group_levels(entries),
        "next_level": next_level,
        "can_send": can_send,
    }


def _comments_and_documents(ss):
    """The section's thread (oldest first) and documents (oldest first) — from
    prefetched rows when loaded (prefetch.section_detail), else two queries."""
    comments = prefetch.prefetched(ss, "comments")
    documents = prefetch.prefetched(ss, "documents")
    comments = (sorted(comments, key=lambda c: c.created_at) if comments is not None
                else ss.comments.all().order_by("created_at"))
    documents = (sorted(documents, key=lambda d: d.uploaded_at) if documents is not None
                 else ss.documents.all().order_by("uploaded_at"))
    return comments, documents


def _section_dict(ss, request):
    comments, documents = _comments_and_documents(ss)
    smap = engine.status_map(request)
    return {
        "code": ss.section.code,
        "name": ss.section.name,
        "status": ss.status,
        "actionable": engine.actionable(request, ss.section.code),
        # The earlier sections this one still waits for, for this student's exit
        # type (no TPC on a withdrawal) — the student's lock messages name them.
        "waiting_for": [smap[code].section.name if code in smap else code.title()
                        for code in engine.unapproved_prerequisites(request, ss.section.code)],
        "is_upload_section": ss.section.is_upload_section,
        "decided_by": ss.decided_by.username if ss.decided_by else None,
        "decided_at": ss.decided_at.isoformat() if ss.decided_at else None,
        "comments": [_comment_dict(c) for c in comments],
        "documents": [
            {"id": d.id, "original_name": d.original_name,
             "event_report_url": d.event_report_url, "ocr_text": d.ocr_text,
             "ocr_fields": d.ocr_fields,
             "download_url": (f"/api/document/{d.id}/download/" if d.file else None)}
            for d in documents
        ],
    }


def _intake_upload_state(req):
    """Which intake upload sections are done (have a document/link) vs pending,
    and which were rejected (need re-upload)."""
    needed = engine.intake_required_uploads(req.exit_type)
    done, pending, rejected = [], [], []
    smap = engine.status_map(req)
    for code in needed:
        ss = smap.get(code)
        documents = prefetch.prefetched(ss, "documents")
        has_doc = ss is not None and (bool(documents) if documents is not None else ss.documents.exists())
        if ss is not None and ss.status == STATUS_REJECTED:
            rejected.append(code)
        elif has_doc:
            done.append(code)
        else:
            pending.append(code)
    return needed, done, pending, rejected


def _current_page(req):
    """
    Resume point:
      1 = intake & uploads (not yet submitted)
      2 = locking screen or clearance matrix (intake submitted, even if a section rejected)
    A rejected section is shown on the locking screen; the student clicks it to open fixes.
    """
    if not req.intake_submitted:
        return 1
    return 2


def _request_dict(req):
    # Load the request's sections, threads, documents, labs and refund in a fixed
    # number of queries, rather than a few per section (main/prefetch.py).
    prefetch_related_objects([req], *prefetch.request_detail())
    statuses = prefetch.prefetched(req, "section_statuses")
    needed, done, pending, rejected_intake = _intake_upload_state(req)
    return {
        "id": req.id,
        "exit_type": req.exit_type,
        "overall_status": req.overall_status,
        "fund_us_amount": str(req.fund_us_amount),
        # Why the donation can no longer change on the Financial page ("" = it can).
        "donation_locked": refund_service.donation_locked(req),
        "vacant_room_no": req.vacant_room_no,
        "intake_submitted": req.intake_submitted,
        "current_page": _current_page(req),
        "intake": {
            "required_uploads": needed,
            "uploaded": done,
            "pending": pending,
            "rejected": rejected_intake,   # only these sections need re-upload
        },
        "student": {
            "name": req.student.name,
            "roll_no": req.student.roll_no,
            "department": req.student.department.code,
            "hostel": req.student.hostel.code,
            "webmail": req.student.webmail,
        },
        "sections": [_student_section_dict(ss, req) for ss in statuses],
        "labs": _labs_dict(req),
        # The refund Accounts pays once every section has approved; the certificate
        # unlocks only after it's recorded (main/refunds.py).
        "refund": refund_service.status_for(req),
        "has_certificate": Certificate.objects.filter(request=req).exists(),
    }


def _student_section_dict(ss, req):
    """A section as the student sees it: plus Administration's checklist (what to
    hand in at the office, and what's been ticked)."""
    data = _section_dict(ss, req)
    code = ss.section.code
    if checklist_service.enabled(code):
        data["checklist"] = [{"label": e["label"], "done": e["done"]} for e in checklist_service.entries(ss)]
    return data


def _not_sent_to_you():
    """Section staff (main/staff.py) touching a request their head didn't send them."""
    return JsonResponse({"detail": "This request hasn't been sent to you"}, status=403)


def _can_see(profile, ss):
    """May this officer see (review, comment on, open the documents of) this row?
    Section staff: what reached them (staff.can_handle) — and whoever sends
    Accounts' refunds also every Accounts-approved request, whose bank details
    they need to pay it."""
    return staff_service.can_handle(profile, ss) or (
        ss.section.code == SECTION_ACCOUNTS and ss.status == STATUS_APPROVED
        and refund_service.can_record(profile))


def _scope_ok(profile, req, section_code):
    """Role/scope guard for a state-changing action."""
    if profile.role != section_code:
        return False
    if section_code == SECTION_WARDEN:
        return profile.hostel_id == req.student.hostel_id
    if section_code == SECTION_HOD:
        return profile.department_id == req.student.department_id
    return True


# ─── Auth ─────────────────────────────────────────────────────────────────────

@ensure_csrf_cookie
@require_http_methods(["GET"])
def csrf(request):
    return JsonResponse({"detail": "ok"})


@require_http_methods(["POST"])
def login_api(request):
    body = _json_body(request)
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    role = body.get("role") or ""

    if not username or not password or not role:
        return JsonResponse({"detail": "username, password and role are required"}, status=400)
    if role not in ROLES:
        return JsonResponse({"detail": "Unknown role"}, status=400)

    user = authenticate(username=username, password=password)
    if user is None or not user.is_active:
        return JsonResponse({"detail": "Invalid credentials"}, status=401)

    profile = _profile(user)
    if profile is None or profile.role != role:
        return JsonResponse({"detail": "Invalid role for this account"}, status=403)

    login(request, user)
    request.session["role"] = role
    return JsonResponse(_me_payload(user, profile))


@require_http_methods(["POST"])
def logout_api(request):
    logout(request)
    return JsonResponse({"detail": "logged out"})


def _me_payload(user, profile):
    data = {"username": user.username, "role": profile.role}
    if profile.role == "STUDENT":
        stud = Student.objects.filter(user=user).first()
        data["name"] = stud.name if stud else user.username
    else:
        data["name"] = user.get_full_name() or user.username
        if profile.hostel_id:
            data["hostel"] = profile.hostel.code
        if profile.department_id:
            data["department"] = profile.department.code
        if profile.role == ROLE_LAB:
            lab = Lab.objects.filter(user=user).first()
            if lab is not None:
                data["lab"] = lab.name
    return data


@login_required
@require_http_methods(["GET"])
def me(request):
    profile = _profile(request.user)
    if profile is None:
        return JsonResponse({"detail": "No profile"}, status=400)
    return JsonResponse(_me_payload(request.user, profile))


# ─── Student ──────────────────────────────────────────────────────────────────

@login_required
@require_http_methods(["GET"])
def student_request(request):
    stud = Student.objects.filter(user=request.user).select_related("department", "hostel").first()
    if stud is None:
        return JsonResponse({"detail": "Student record not found"}, status=404)
    req = _active_request(stud)
    if req is None:
        return JsonResponse({
            "has_request": False,
            "student": {"name": stud.name, "roll_no": stud.roll_no,
                        "department": stud.department.code, "hostel": stud.hostel.code},
            "exit_types": EXIT_TYPES,
        })
    return JsonResponse({"has_request": True, "request": _request_dict(req)})


@login_required
@require_http_methods(["POST"])
def initiate(request):
    """Create a clearance request (Property 12: one active request per student)."""
    stud = Student.objects.filter(user=request.user).first()
    if stud is None:
        return JsonResponse({"detail": "Student record not found"}, status=404)
    if _active_request(stud) is not None:
        return JsonResponse({"detail": "An active request already exists"}, status=409)

    body = _json_body(request)
    exit_type = body.get("exit_type")
    if exit_type not in EXIT_TYPES:
        return JsonResponse({"detail": "Invalid exit_type"}, status=400)

    try:
        fund_us = refund_service.donation_amount(body.get("fund_us_amount"))
    except refund_service.RefundError as e:
        return JsonResponse({"detail": str(e)}, status=400)
    vacant_room = (body.get("vacant_room_no") or "").strip().upper()
    if vacant_room and not VACANT_ROOM_RE.match(vacant_room):
        return JsonResponse(
            {"detail": "Vacated room number must be a block letter followed by 3 digits, e.g. A102"},
            status=400,
        )

    req = ClearanceRequest.objects.create(
        student=stud, exit_type=exit_type, fund_us_amount=fund_us, vacant_room_no=vacant_room,
    )
    for code in engine.required_sections(exit_type):
        SectionStatus.objects.get_or_create(request=req, section=Section.objects.get(code=code))
    return JsonResponse({"has_request": True, "request": _request_dict(req)}, status=201)


@login_required
@require_http_methods(["POST"])
def submit_intake(request):
    """
    Complete Page 1: requires the vacated room + all applicable intake uploads
    already present, then locks intake and opens the dashboard (Page 2).
    """
    stud = Student.objects.filter(user=request.user).first()
    if stud is None:
        return JsonResponse({"detail": "Student record not found"}, status=404)
    req = _active_request(stud)
    if req is None:
        return JsonResponse({"detail": "No active request"}, status=400)

    body = _json_body(request)
    # The Fund-Us donation is set on the Financial page (student_donation), not here.
    if "vacant_room_no" in body:
        req.vacant_room_no = (body.get("vacant_room_no") or "").strip().upper()

    if not req.vacant_room_no:
        return JsonResponse({"detail": "Vacated room number is required"}, status=400)
    if not VACANT_ROOM_RE.match(req.vacant_room_no):
        return JsonResponse(
            {"detail": "Vacated room number must be a block letter followed by 3 digits, e.g. A102"},
            status=400,
        )

    _, _, pending, rejected_intake = _intake_upload_state(req)
    # Pending = never uploaded. Rejected sections are being re-worked, not blocked.
    if pending:
        names = ", ".join(pending)
        return JsonResponse({"detail": f"Upload pending for: {names}"}, status=400)

    req.intake_submitted = True
    req.save(update_fields=["vacant_room_no", "intake_submitted"])

    # Warden has no document — it verifies the vacated room. If it was REJECTED,
    # re-submitting the intake (with a corrected room) sends a fresh request to the warden.
    from .models import SECTION_WARDEN
    warden_ss = req.section_statuses.filter(section__code=SECTION_WARDEN, status=STATUS_REJECTED).first()
    if warden_ss is not None:
        warden_ss.status = STATUS_PENDING
        warden_ss.decided_by = None
        warden_ss.decided_at = None
        warden_ss.save()
        Comment.objects.create(
            section_status=warden_ss, author=request.user, is_system=True,
            body=f"Student updated vacated room to '{req.vacant_room_no}' and re-submitted.",
        )

    return JsonResponse({"has_request": True, "request": _request_dict(req)})


@login_required
@require_http_methods(["POST"])
def student_donation(request):
    """
    Financial page (Page 4): set the Fund-Us donation, {fund_us_amount} (0 = none).
    It comes out of the caution money, so it lowers the refund. 400 for an amount
    outside ₹0–caution money; 409 once Accounts has approved or the refund is recorded.
    """
    stud = Student.objects.filter(user=request.user).first()
    if stud is None:
        return JsonResponse({"detail": "Student record not found"}, status=404)
    req = _active_request(stud)
    if req is None:
        return JsonResponse({"detail": "No active request"}, status=400)
    body = _json_body(request)
    if not isinstance(body, dict):
        body = {}
    try:
        req = refund_service.set_donation(req, body.get("fund_us_amount"))
    except refund_service.DonationLocked as e:
        return JsonResponse({"detail": str(e)}, status=409)
    except refund_service.RefundError as e:
        return JsonResponse({"detail": str(e)}, status=400)
    return JsonResponse({"has_request": True, "request": _request_dict(req)})


@login_required
@require_http_methods(["POST"])
def upload_document(request):
    """Upload a document to a section (multipart). Validates size/type; runs advisory OCR."""
    stud = Student.objects.filter(user=request.user).first()
    if stud is None:
        return JsonResponse({"detail": "Student record not found"}, status=404)
    req = _active_request(stud)
    if req is None:
        return JsonResponse({"detail": "No active request"}, status=400)

    section_code = request.POST.get("section")
    ss = req.section_statuses.filter(section__code=section_code).first()
    if ss is None:
        return JsonResponse({"detail": "Section not part of this request"}, status=400)

    event_url = request.POST.get("event_report_url")
    upload = request.FILES.get("file")

    if upload is None and event_url:  # LUCS link mode
        Document.objects.create(section_status=ss, event_report_url=event_url)
        return JsonResponse({"detail": "link saved", "warnings": []})

    if upload is None:
        return JsonResponse({"detail": "No file provided"}, status=400)

    # Validate size & type
    if upload.size > MAX_UPLOAD_BYTES:
        return JsonResponse({"detail": "File exceeds 10 MB limit"}, status=400)
    name = upload.name.lower()
    ext_ok = any(name.endswith(e) for e in ALLOWED_EXTS)
    if not ext_ok and upload.content_type not in ALLOWED_CONTENT_TYPES:
        return JsonResponse({"detail": "Only JPG, PNG or PDF allowed"}, status=400)

    doc = Document.objects.create(section_status=ss, file=upload, original_name=upload.name)

    # If the section was previously REJECTED, reset it to PENDING so the officer
    # sees the new upload in their queue (reverse of rejection).
    if ss.status == STATUS_REJECTED:
        ss.status = STATUS_PENDING
        ss.decided_by = None
        ss.decided_at = None
        ss.save()
        Comment.objects.create(
            section_status=ss, author=stud.user, is_system=True,
            body="Student re-uploaded document after rejection.",
        )

    # Advisory OCR (graceful if engine/libraries unavailable). Returns detected
    # fields so the frontend can AUTO-FILL the review form for the student to confirm.
    warnings = []
    fields = {}
    try:
        from .ocr import extract_and_match
        text, fields, warnings = extract_and_match(doc.file.path, stud)
        doc.ocr_text = text
    except Exception:
        pass  # OCR is advisory; never blocks upload

    # Seed a review dict from OCR + the student record so fields arrive pre-filled.
    autofill = {
        "roll_no": fields.get("roll_no", stud.roll_no),
        "author": stud.name,
        "department": stud.department.code,
    }
    doc.ocr_fields = {**fields, "review": autofill, "confirmed": False}
    doc.save(update_fields=["ocr_text", "ocr_fields"])

    return JsonResponse({"detail": "uploaded", "warnings": warnings,
                         "document_id": doc.id, "autofill": autofill,
                         "ocr_text": doc.ocr_text})


@login_required
@require_http_methods(["POST"])
def resend_section(request):
    """
    Student sends a rejected basic section (a Page-3 department, HOD included,
    or Administration) back to its office: PENDING again. The HOD card sends the
    student's (optionally edited) name / roll / department with it, kept so the
    office sees what was re-submitted; the other cards send nothing.
    """
    stud = Student.objects.filter(user=request.user).first()
    if stud is None:
        return JsonResponse({"detail": "Student record not found"}, status=404)
    req = _active_request(stud)
    if req is None:
        return JsonResponse({"detail": "No active request"}, status=400)
    body = _json_body(request)
    ss = req.section_statuses.filter(section__code=body.get("section")).first()
    if ss is None:
        return JsonResponse({"detail": "Section not part of this request"}, status=400)
    if ss.section.code not in RESEND_SECTIONS:
        return JsonResponse({"detail": "This section is re-sent from its own upload form"}, status=400)
    if ss.status != STATUS_REJECTED:
        return JsonResponse({"detail": "Only a rejected request can be re-sent"}, status=400)

    details = {key: (body.get(key) or "").strip() for key in ("name", "roll_no", "department")}
    if any(details.values()):
        doc = ss.documents.first() or Document(section_status=ss)
        doc.ocr_fields = {"review": details, "confirmed": True}
        doc.save()

    ss.status = STATUS_PENDING
    ss.decided_by = None
    ss.decided_at = None
    ss.save(update_fields=["status", "decided_by", "decided_at"])
    Comment.objects.create(section_status=ss, author=request.user, is_system=True,
                           body="Student re-sent the request after rejection.")
    return JsonResponse({"ok": True})


@login_required
@require_http_methods(["POST"])
def student_comment(request):
    """Student posts a comment/reply on one of their sections (two-way thread)."""
    stud = Student.objects.filter(user=request.user).first()
    if stud is None:
        return JsonResponse({"detail": "Student record not found"}, status=404)
    req = _active_request(stud)
    if req is None:
        return JsonResponse({"detail": "No active request"}, status=400)
    body = _json_body(request)
    text = (body.get("body") or "").strip()
    if not text:
        return JsonResponse({"detail": "Comment cannot be empty"}, status=400)
    ss = req.section_statuses.filter(section__code=body.get("section")).first()
    if ss is None:
        return JsonResponse({"detail": "Section not part of this request"}, status=400)
    Comment.objects.create(section_status=ss, author=request.user, body=text)
    return JsonResponse({"ok": True})


@login_required
@require_http_methods(["POST"])
def officer_comment(request):
    """Officer posts a feedback comment on a request's section (two-way thread)."""
    profile = _profile(request.user)
    role = profile.role if profile else None
    if role not in engine.ALL_SECTION_CODES:
        return JsonResponse({"detail": "Not a section officer"}, status=403)
    body = _json_body(request)
    text = (body.get("body") or "").strip()
    if not text:
        return JsonResponse({"detail": "Comment cannot be empty"}, status=400)
    ss = SectionStatus.objects.filter(
        request_id=body.get("request_id"), section__code=role
    ).select_related("request", "request__student").first()
    if ss is None:
        return JsonResponse({"detail": "Not found"}, status=404)
    if not _scope_ok(profile, ss.request, role):
        return JsonResponse({"detail": "Out of scope"}, status=403)
    if not _can_see(profile, ss):
        return _not_sent_to_you()
    Comment.objects.create(section_status=ss, author=request.user, body=text)
    return JsonResponse({"ok": True})


@login_required
@require_http_methods(["POST"])
def confirm_review(request):
    """Persist the student-confirmed OCR-review metadata onto the latest document."""
    stud = Student.objects.filter(user=request.user).first()
    if stud is None:
        return JsonResponse({"detail": "Student record not found"}, status=404)
    req = _active_request(stud)
    if req is None:
        return JsonResponse({"detail": "No active request"}, status=400)

    body = _json_body(request)
    section_code = body.get("section")
    review = body.get("review") or {}
    ss = req.section_statuses.filter(section__code=section_code).first()
    if ss is None:
        return JsonResponse({"detail": "Section not part of this request"}, status=400)
    doc = ss.documents.order_by("-uploaded_at").first()
    if doc is None:
        return JsonResponse({"detail": "Upload a document before confirming"}, status=400)

    merged = dict(doc.ocr_fields)
    merged["review"] = review
    merged["confirmed"] = True
    doc.ocr_fields = merged
    doc.save(update_fields=["ocr_fields"])

    # If the section was rejected, confirming re-sends a fresh request → PENDING.
    if ss.status == STATUS_REJECTED:
        ss.status = STATUS_PENDING
        ss.decided_by = None
        ss.decided_at = None
        ss.save(update_fields=["status", "decided_by", "decided_at"])
        Comment.objects.create(section_status=ss, author=request.user, is_system=True,
                               body="Student re-submitted document after rejection.")
    return JsonResponse({"ok": True})


# ─── Officer queue + review + decisions ─────────────────────────────────────────

@login_required
@require_http_methods(["GET"])
def section_queue(request):
    profile = _profile(request.user)
    role = profile.role if profile else None
    if role not in engine.ALL_SECTION_CODES:
        return JsonResponse({"detail": "Not a section officer"}, status=403)

    # Section staff (main/staff.py) see only what reached them; the head sees
    # everything, as a section officer always has. By hand (Library, LUCS, NAD):
    # what the head sent them. By level (Accounts): what's waiting at their
    # level, plus what they approved or rejected — shown with *their* outcome.
    is_staff = staff_service.is_staff_member(profile)
    levelled = staff_service.is_levelled(role)
    by_hand = role in staff_service.STAFF_SECTIONS and not levelled
    # Accounts: whoever sends refunds handles them from Approved, which therefore
    # lists every request Accounts has approved — not only their own approvals.
    refund_sender = role == SECTION_ACCOUNTS and refund_service.can_record(profile)
    # Administration: what the student has to complete at the office, per request.
    checklist_items = checklist_service.items(role) if checklist_service.enabled(role) else None

    def prepare(rows):
        """Load everything the rows below read in a fixed number of queries,
        however many rows there are (main/prefetch.py)."""
        return prefetch.for_desk(rows, prerequisites=bool(engine.prerequisites(role)), stages=levelled,
                                 checklist=bool(checklist_items), labs=role == SECTION_HOD,
                                 refunds=refund_sender)

    qs = prepare(SectionStatus.objects.filter(
        section__code=role, request__is_active=True,
    ).order_by("request__created_at", "id"))   # stable, oldest first (bulk sends rewrite rows)

    if role == SECTION_WARDEN and profile.hostel_id:
        qs = qs.filter(request__student__hostel_id=profile.hostel_id)
    dept_has_labs = None
    if role == SECTION_HOD and profile.department_id:
        qs = qs.filter(request__student__department_id=profile.department_id)
        dept_has_labs = engine.department_has_labs(profile.department_id)

    if is_staff and levelled:
        items = staff_service.level_queue(profile, prepare=prepare)
        if refund_sender:
            mine = {ss.id for ss, _ in items}
            items += [(ss, STATUS_APPROVED) for ss in qs.filter(status=STATUS_APPROVED).exclude(id__in=mine)]
    else:
        if is_staff:
            qs = qs.filter(assigned_to=request.user)
        items = [(ss, ss.status) for ss in qs]
    if role != SECTION_ACCOUNTS:
        # A pending request reaches a section once the sections before it have
        # approved: the departments after the tri-gate, Administration after
        # every department. (Accounts' head instead lists those as "Not ready yet".)
        items = [(ss, status) for ss, status in items
                 if status != STATUS_PENDING or not engine.unapproved_prerequisites(ss.request, role)]
    names = staff_service.chain_names(role) if levelled else None

    rows = []
    for ss, status in items:
        req = ss.request
        row = {
            "request_id": req.id,
            "section_status_id": ss.id,
            "roll_no": req.student.roll_no,
            "name": req.student.name,
            "department": req.student.department.code,
            "hostel": req.student.hostel.code,
            "exit_type": req.exit_type,
            "status": status,
            # Staff only ever get a request at their own level once it's ready.
            "actionable": True if (is_staff and levelled) else engine.actionable(req, role, dept_has_labs),
            "vacant_room_no": req.vacant_room_no,
        }
        if role == SECTION_HOD:
            # The request reaches HOD only once every department lab approved;
            # until then the HOD desk lists it under "In labs" with this progress.
            row["labs"] = engine.lab_progress(req, dept_has_labs=dept_has_labs)
        if by_hand:
            row["assigned_to"] = _person(ss.assigned_to)
            row["assigned_at"] = ss.assigned_at.isoformat() if ss.assigned_at else None
            row["ready"] = req.intake_submitted
        if levelled:
            row["stage"] = staff_service.stage_info(ss, names)
        if checklist_items:
            row["checklist"] = checklist_service.entries(ss, checklist_items)
        if refund_sender and ss.status == STATUS_APPROVED:
            # The Refund column of the Approved tab: waiting / ready / sent / not due.
            row["refund"] = refund_service.row_state(req, accounts_ss=ss)
        rows.append(row)

    section = Section.objects.filter(code=role).first()
    heading = section.name if section else role
    if role == SECTION_WARDEN and profile.hostel_id:
        heading = f"{section.name} — {profile.hostel.code}"
    if role == SECTION_HOD and profile.department_id:
        heading = f"{section.name} — {profile.department.code}"
    if is_staff:
        heading = f"{heading} — Staff"

    data = {"role": role, "heading": heading, "students": rows}
    if staff_service.is_head(profile):
        # What the head needs: their active staff, how work reaches them, and
        # (by hand) how many requests are waiting, ready to be sent.
        data["can_manage_staff"] = True
        data["staff_mode"] = "levels" if levelled else "manual"
        data["staff"] = _staff_list(request.user)
        data["ready_to_assign"] = 0 if levelled else staff_service.ready_for_staff(role).count()
    if role == SECTION_ACCOUNTS:
        # Whoever sends refunds — the main account, plus any staff it made refund
        # managers — sends them from the Approved tab.
        data["can_record_refunds"] = refund_sender
        if refund_sender:
            data["refunds_pending"] = refund_service.pending().count()
            data["refund_modes"] = refund_service.MODES
    return JsonResponse(data)


@login_required
@require_http_methods(["GET"])
def section_review(request):
    """Full review of one request for the officer's section (docs + OCR + comments)."""
    profile = _profile(request.user)
    role = profile.role if profile else None
    if role not in engine.ALL_SECTION_CODES:
        return JsonResponse({"detail": "Not a section officer"}, status=403)

    req_id = request.GET.get("request_id")
    ss = SectionStatus.objects.filter(request_id=req_id, section__code=role).select_related(
        "request", "request__student__department", "request__student__hostel", "section", "decided_by").first()
    if ss is None:
        return JsonResponse({"detail": "Not found"}, status=404)
    if not _scope_ok(profile, ss.request, role):
        return JsonResponse({"detail": "Out of scope"}, status=403)
    if not _can_see(profile, ss):
        return _not_sent_to_you()

    # Load the request's sections (with threads and documents) and this section's
    # own details in a fixed number of queries, not a few per section.
    prefetch_related_objects([ss.request], *prefetch.request_detail())
    prefetch_related_objects([ss], *prefetch.section_detail(stages=staff_service.is_levelled(role)))
    smap = engine.status_map(ss.request)

    # Every officer sees the full Page-2 tri-gate picture (Library BTP form,
    # TPC offer letter, and the Warden/hostel clearance), regardless of their
    # own section — e.g. a Store, LUCS, or Sports officer otherwise had no
    # visibility at all into a student's intake uploads or hostel status when
    # reviewing them. Vacant room (the plain string) was already shown for
    # everyone; this closes the same gap for the documents and Warden status
    # themselves, and lets any officer verify/download them (see
    # document_download's is_intake_viewer check).
    #
    # Administration is excluded here deliberately: its own `prerequisites`
    # below already includes every other section — Library, TPC, and Warden
    # included — so also populating `intake` for Administration produced
    # Library and TPC listed *twice* on the same review screen.
    TRI_GATE_REVIEW_SECTIONS = [SECTION_LIBRARY, SECTION_TPC, SECTION_WARDEN]
    intake_docs = []
    if role != SECTION_ADMINISTRATION:
        for code in TRI_GATE_REVIEW_SECTIONS:
            if code == role:
                continue  # already shown as the officer's own section below
            pss = smap.get(code)
            if pss is not None:
                intake_docs.append(_section_dict(pss, ss.request))

    data = {
        "request_id": ss.request_id,
        "student": {
            "name": ss.request.student.name, "roll_no": ss.request.student.roll_no,
            "department": ss.request.student.department.code, "hostel": ss.request.student.hostel.code,
        },
        "vacant_room_no": ss.request.vacant_room_no,
        "section": _section_dict(ss, ss.request),
        "intake": intake_docs,
    }

    # HOD approves after its department's labs, so it sees who cleared each lab
    # (and why one rejected); Administration, the final all-green gate, too.
    if role in (SECTION_HOD, SECTION_ADMINISTRATION):
        data["labs"] = _lab_chain(ss.request)

    # Levelled sections (Accounts): where the request is in the staff levels and
    # who approved each level so far.
    if staff_service.is_levelled(role):
        data["stage"] = staff_service.stage_info(ss)
    if checklist_service.enabled(role):
        data["checklist"] = checklist_service.entries(ss)

    # Administration sees every other section's documents/OCR/status — a true
    # prerequisite gate, since Administration only acts once everything is
    # green. HOD does NOT get an equivalent panel: it's fully independent now
    # (main/engine.py — no prerequisites, and no informational consolidation
    # of Store/LUCS/Sports/Medical/NAD either) — its review screen only ever
    # shows its own section, same as Store/LUCS/Sports/Medical/NAD's screens
    # already do for each other.
    if role == SECTION_ADMINISTRATION:
        prereqs = []
        for code in engine.ALL_SECTION_CODES:
            if code == SECTION_ADMINISTRATION:
                continue
            pss = smap.get(code)
            if pss is None:
                continue
            # Final view: only the latest (final) document, no message thread.
            documents = prefetch.prefetched(pss, "documents")
            latest = (prefetch.latest_document(documents) if documents is not None
                      else pss.documents.order_by("-uploaded_at").first())
            docs = []
            if latest and (latest.file or latest.event_report_url):
                docs = [{
                    "id": latest.id, "original_name": latest.original_name,
                    "event_report_url": latest.event_report_url, "ocr_text": latest.ocr_text,
                    "ocr_fields": latest.ocr_fields,
                    "download_url": (f"/api/document/{latest.id}/download/" if latest.file else None),
                }]
            prereqs.append({
                "code": pss.section.code, "name": pss.section.name, "status": pss.status,
                "actionable": engine.actionable(ss.request, pss.section.code),
                "is_upload_section": pss.section.is_upload_section,
                "decided_by": pss.decided_by.username if pss.decided_by else None,
                "decided_at": pss.decided_at.isoformat() if pss.decided_at else None,
                "documents": docs, "comments": [],   # no messages for Administration
            })
        data["prerequisites"] = prereqs

    return JsonResponse(data)


def _level_param(body):
    """The optional `level` of an approve: the chain step the officer saw the
    request at (Accounts). None when not given."""
    raw = body.get("level")
    if raw is None or raw == "":
        return None
    if isinstance(raw, bool):
        raise engine.ValidationError_("level must be a whole number.")
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise engine.ValidationError_("level must be a whole number.") from None


def _decide(request, action):
    profile = _profile(request.user)
    role = profile.role if profile else None
    if role not in engine.ALL_SECTION_CODES:
        return JsonResponse({"detail": "Not a section officer"}, status=403)

    body = _json_body(request)
    ss = SectionStatus.objects.filter(
        request_id=body.get("request_id"), section__code=role
    ).select_related("request", "request__student", "section").first()
    if ss is None:
        return JsonResponse({"detail": "Not found"}, status=404)
    if not _scope_ok(profile, ss.request, role):
        return JsonResponse({"detail": "Out of scope"}, status=403)
    # Staff decide only what reached them — and that decision is final.
    if not staff_service.can_decide(profile, ss):
        return _not_sent_to_you()

    try:
        if action == "approve":
            # Administration: what the student had to do at the office (hand in the
            # physical ID card, ...) must be ticked before anyone approves.
            missing = checklist_service.missing(ss) if checklist_service.enabled(role) else []
            if missing:
                return JsonResponse({"detail": f"Tick the checklist first: {', '.join(missing)}."}, status=409)
            if staff_service.is_levelled(role):
                # Accounts: approves the step the request is waiting at — staff at
                # their level, the main account at its own step or standing in for
                # a level (naming the `level` it saw). The request moves up one
                # step; after the last step the section is approved.
                staff_service.approve(ss, profile, _level_param(body))
                ss.refresh_from_db()
            else:
                engine.approve(ss, request.user)
        else:
            engine.reject(ss, request.user, body.get("reason", ""))
    except engine.PermissionError_ as e:
        return JsonResponse({"detail": str(e)}, status=409)
    except engine.ValidationError_ as e:
        return JsonResponse({"detail": str(e)}, status=400)

    return JsonResponse({"ok": True, "status": ss.status})


@login_required
@require_http_methods(["POST"])
def approve(request):
    return _decide(request, "approve")


@login_required
@require_http_methods(["POST"])
def reject(request):
    return _decide(request, "reject")


# ─── Department labs: student side (HOD card on Page 3) ──────────────────────────

def _student_and_request(request):
    """(student, active request, None) or (…, …, error response) for student endpoints."""
    stud = Student.objects.filter(user=request.user).first()
    if stud is None:
        return None, None, JsonResponse({"detail": "Student record not found"}, status=404)
    req = _active_request(stud)
    if req is None:
        return stud, None, JsonResponse({"detail": "No active request"}, status=400)
    return stud, req, None


@login_required
@require_http_methods(["POST"])
def student_labs_send(request):
    """Send the request to the next level of department labs (starts the chain)."""
    _, req, err = _student_and_request(request)
    if err:
        return err
    # The lab chain lives on Page 3, which opens once Library/TPC/Warden approve.
    if not req.intake_submitted or not engine.tri_gate_cleared(req):
        return JsonResponse(
            {"detail": "Library, TPC and Warden must approve before you can send requests to your department labs."},
            status=409)
    try:
        sent = engine.send_next_lab_level(req, request.user)
    except engine.PermissionError_ as e:
        return JsonResponse({"detail": str(e)}, status=409)
    return JsonResponse({"has_request": True, "request": _request_dict(req),
                         "sent_to": [ls.lab.name for ls in sent]})


@login_required
@require_http_methods(["POST"])
def student_labs_resend(request):
    """Send a rejected lab request back to that lab."""
    _, req, err = _student_and_request(request)
    if err:
        return err
    body = _json_body(request)
    ls = req.lab_statuses.filter(lab_id=_int(body.get("lab_id"))).select_related("lab").first()
    if ls is None:
        return JsonResponse({"detail": "That lab is not part of your request"}, status=400)
    try:
        engine.resend_lab(ls, request.user)
    except engine.PermissionError_ as e:
        return JsonResponse({"detail": str(e)}, status=409)
    return JsonResponse({"has_request": True, "request": _request_dict(req)})


@login_required
@require_http_methods(["POST"])
def student_labs_comment(request):
    """Student replies on one lab's thread (two-way, like section threads)."""
    _, req, err = _student_and_request(request)
    if err:
        return err
    body = _json_body(request)
    text = (body.get("body") or "").strip()
    if not text:
        return JsonResponse({"detail": "Comment cannot be empty"}, status=400)
    ls = req.lab_statuses.filter(lab_id=_int(body.get("lab_id")), sent_at__isnull=False).first()
    if ls is None:
        return JsonResponse({"detail": "You can message a lab once your request has been sent to it"}, status=400)
    Comment.objects.create(lab_status=ls, author=request.user, body=text)
    return JsonResponse({"ok": True})


# ─── Department labs: lab in-charge desk ────────────────────────────────────────
# Each lab login is tied to exactly one Lab (Lab.user), so the lab — and with it
# the department — comes from the session, never from the request body.

def _lab_officer(user):
    """The active Lab this user is in charge of, or None."""
    profile = _profile(user)
    if profile is None or profile.role != ROLE_LAB:
        return None
    return Lab.objects.filter(user=user, is_active=True).select_related("department").first()


def _lab_status_for(lab, request_id):
    """This lab's row for an active request that has been sent to it."""
    return LabStatus.objects.filter(
        lab=lab, request_id=_int(request_id), request__is_active=True, sent_at__isnull=False,
    ).select_related("lab", "request", "request__student", "request__student__department",
                     "request__student__hostel", "decided_by").first()


@login_required
@require_http_methods(["GET"])
def lab_queue(request):
    lab = _lab_officer(request.user)
    if lab is None:
        return JsonResponse({"detail": "Not a lab in-charge"}, status=403)
    qs = LabStatus.objects.filter(
        lab=lab, request__is_active=True, sent_at__isnull=False,
    ).select_related("request", "request__student", "request__student__department",
                     "request__student__hostel").order_by("-sent_at").prefetch_related(
        "request__lab_statuses")   # engine.lab_actionable reads each request's chain from these
    rows = []
    for ls in qs:
        req = ls.request
        rows.append({
            "request_id": req.id,
            "section_status_id": ls.id,
            "roll_no": req.student.roll_no,
            "name": req.student.name,
            "department": req.student.department.code,
            "hostel": req.student.hostel.code,
            "exit_type": req.exit_type,
            "status": ls.status,
            "actionable": engine.lab_actionable(ls),
            "vacant_room_no": req.vacant_room_no,
            "level": ls.level,
        })
    return JsonResponse({"role": ROLE_LAB, "heading": f"{lab.name} — {lab.department.code}", "students": rows})


@login_required
@require_http_methods(["GET"])
def lab_review(request):
    """One request as this lab sees it: its own decision + thread, and the chain."""
    lab = _lab_officer(request.user)
    if lab is None:
        return JsonResponse({"detail": "Not a lab in-charge"}, status=403)
    ls = _lab_status_for(lab, request.GET.get("request_id"))
    if ls is None:
        return JsonResponse({"detail": "Not found"}, status=404)
    req = ls.request
    return JsonResponse({
        "request_id": req.id,
        "student": {"name": req.student.name, "roll_no": req.student.roll_no,
                    "department": req.student.department.code, "hostel": req.student.hostel.code},
        "vacant_room_no": req.vacant_room_no,
        # Same shape as a section, so the officer desk renders it unchanged.
        "section": {
            "code": ROLE_LAB, "name": lab.name, "status": ls.status,
            "actionable": engine.lab_actionable(ls), "is_upload_section": False,
            "decided_by": ls.decided_by.username if ls.decided_by else None,
            "decided_at": ls.decided_at.isoformat() if ls.decided_at else None,
            "comments": [_comment_dict(c) for c in
                         ls.comments.select_related("author").order_by("created_at")],
            "documents": [],
        },
        "intake": [],
        "labs": _lab_chain(req),
    })


def _lab_decide(request, action):
    lab = _lab_officer(request.user)
    if lab is None:
        return JsonResponse({"detail": "Not a lab in-charge"}, status=403)
    body = _json_body(request)
    ls = _lab_status_for(lab, body.get("request_id"))
    if ls is None:
        return JsonResponse({"detail": "Not found"}, status=404)
    try:
        if action == "approve":
            engine.approve_lab(ls, request.user)
        else:
            engine.reject_lab(ls, request.user, body.get("reason", ""))
    except engine.PermissionError_ as e:
        return JsonResponse({"detail": str(e)}, status=409)
    except engine.ValidationError_ as e:
        return JsonResponse({"detail": str(e)}, status=400)
    return JsonResponse({"ok": True, "status": ls.status})


@login_required
@require_http_methods(["POST"])
def lab_approve(request):
    return _lab_decide(request, "approve")


@login_required
@require_http_methods(["POST"])
def lab_reject(request):
    return _lab_decide(request, "reject")


@login_required
@require_http_methods(["POST"])
def lab_comment(request):
    lab = _lab_officer(request.user)
    if lab is None:
        return JsonResponse({"detail": "Not a lab in-charge"}, status=403)
    body = _json_body(request)
    text = (body.get("body") or "").strip()
    if not text:
        return JsonResponse({"detail": "Comment cannot be empty"}, status=400)
    ls = _lab_status_for(lab, body.get("request_id"))
    if ls is None:
        return JsonResponse({"detail": "Not found"}, status=404)
    Comment.objects.create(lab_status=ls, author=request.user, body=text)
    return JsonResponse({"ok": True})


# ─── Department labs: HOD "Manage Labs" panel ───────────────────────────────────
# An HOD manages only their own department's labs; the department always comes
# from the HOD's profile, and another department's lab id is a 404.

def _hod_department(user):
    profile = _profile(user)
    if profile is None or profile.role != SECTION_HOD or profile.department_id is None:
        return None
    return profile.department


# Students currently waiting on a lab: sent to it, not approved, request active.
_WAITING_ON_LAB = Q(statuses__request__is_active=True, statuses__sent_at__isnull=False,
                    statuses__status__in=[STATUS_PENDING, STATUS_REJECTED])


def _hod_lab_dict(lab, waiting):
    return {
        "id": lab.id,
        "name": lab.name,
        "incharge_name": lab.incharge_name,
        "email": lab.user.username,
        "level": lab.level,
        "is_active": lab.is_active,
        "waiting": waiting,
    }


def _waiting_count(lab):
    return Lab.objects.filter(pk=lab.pk).aggregate(n=Count("statuses", filter=_WAITING_ON_LAB))["n"]


@login_required
@require_http_methods(["GET", "POST"])
def hod_labs(request):
    """GET: this HOD's department labs. POST: add a lab (+ its in-charge login)."""
    dept = _hod_department(request.user)
    if dept is None:
        return JsonResponse({"detail": "Only a department HOD can manage labs"}, status=403)

    if request.method == "POST":
        body = _json_body(request)
        if not isinstance(body, dict):
            body = {}
        try:
            lab = lab_service.create_lab(
                dept, name=body.get("name"), incharge_name=body.get("incharge_name"),
                email=body.get("email"), password=body.get("password"), level=body.get("level"),
            )
        except lab_service.LabError as e:
            return JsonResponse({"detail": str(e)}, status=400)
        return JsonResponse({"lab": _hod_lab_dict(lab, 0)}, status=201)

    labs = (Lab.objects.filter(department=dept).select_related("user")
            .annotate(waiting=Count("statuses", filter=_WAITING_ON_LAB))
            .order_by("level", "name"))
    return JsonResponse({
        "department": dept.code,
        "labs": [_hod_lab_dict(lab, lab.waiting) for lab in labs],
    })


@login_required
@require_http_methods(["PATCH", "DELETE"])
def hod_lab_detail(request, lab_id):
    """PATCH: edit / reset password / restore. DELETE: remove from the chain."""
    dept = _hod_department(request.user)
    if dept is None:
        return JsonResponse({"detail": "Only a department HOD can manage labs"}, status=403)
    lab = Lab.objects.filter(id=lab_id, department=dept).select_related("user", "department").first()
    if lab is None:
        return JsonResponse({"detail": "Lab not found"}, status=404)

    if request.method == "DELETE":
        outcome, released = lab_service.remove_lab(lab, request.user)
        return JsonResponse({"ok": True, "outcome": outcome, "released": released})

    body = _json_body(request)
    if not isinstance(body, dict):
        body = {}
    try:
        lab = lab_service.update_lab(lab, body)
    except lab_service.LabError as e:
        return JsonResponse({"detail": str(e)}, status=400)
    return JsonResponse({"lab": _hod_lab_dict(lab, _waiting_count(lab))})


# ─── Section staff (Library, LUCS, NAD Cell): the head sends out work, manages staff
# Only the section's head — its own account, not a staff member — may call these,
# and the section always comes from the head's profile. Staff ids are the user
# ids of that head's staff; anyone else's id is a 404.

def _section_head(user):
    profile = _profile(user)
    return profile if staff_service.is_head(profile) else None


@login_required
@require_http_methods(["POST"])
def section_assign(request):
    """
    {staff_id, count}       — send the next `count` waiting requests (oldest first);
    {request_ids, staff_id} — send those requests, or with staff_id null take them back.
    """
    head = _section_head(request.user)
    if head is None:
        return JsonResponse({"detail": "Only the section head can send requests to staff"}, status=403)
    body = _json_body(request)
    if not isinstance(body, dict):
        body = {}
    try:
        if "request_ids" in body:
            target, moved = staff_service.move(head, body.get("request_ids"), body.get("staff_id"))
        else:
            target, moved = staff_service.send_next(head, body.get("staff_id"), body.get("count"))
    except staff_service.StaffError as e:
        return JsonResponse({"detail": str(e)}, status=400)
    return JsonResponse({"ok": True, "moved": moved, "to": _person(target)})


@login_required
@require_http_methods(["GET", "POST"])
def section_staff(request):
    """GET: the head's staff (removed ones too). POST: add a staff member + login
    ({name, email, password, level?, refund_manager?})."""
    head = _section_head(request.user)
    if head is None:
        return JsonResponse({"detail": "Only the section head can manage staff"}, status=403)

    if request.method == "POST":
        body = _json_body(request)
        if not isinstance(body, dict):
            body = {}
        try:
            staff = staff_service.create_staff(head, name=body.get("name"), email=body.get("email"),
                                               password=body.get("password"), level=body.get("level"),
                                               refund_manager=bool(body.get("refund_manager")))
        except staff_service.StaffError as e:
            return JsonResponse({"detail": str(e)}, status=400)
        return JsonResponse({"staff": _staff_dict(staff)}, status=201)

    levelled = staff_service.is_levelled(head.role)
    profiles = list(staff_service.staff_of(request.user, include_removed=True))
    waiting = staff_service.waiting_by_level(head.role) if levelled else None   # once, not per person
    counts = _staff_counts(profiles)                                             # likewise
    return JsonResponse({
        "section": head.role,
        "staff_mode": "levels" if levelled else "manual",
        # Levels: requests every level has approved, waiting for the head's final approval.
        "head_waiting": staff_service.waiting_for_final(head.role) if levelled else 0,
        "staff": [_staff_dict(p, waiting, counts) for p in profiles],
        # Administration: the checklist the head manages (null = no checklist here).
        "checklist": ([{"id": i.id, "label": i.label} for i in checklist_service.items(head.role)]
                      if checklist_service.enabled(head.role) else None),
        # Accounts: who sends refunds (the main account, plus any staff refund managers).
        "refund_senders": refund_service.sender_names(viewer=head) if head.role == SECTION_ACCOUNTS else None,
    })


@login_required
@require_http_methods(["POST"])
def section_checklist(request):
    """The section head adds a checklist item: {label} -> 201 {item}."""
    head = _section_head(request.user)
    if head is None or not checklist_service.enabled(head.role):
        return JsonResponse({"detail": "Only the Administration head manages the checklist"}, status=403)
    body = _json_body(request)
    try:
        item = checklist_service.add_item(head.role, body.get("label") if isinstance(body, dict) else None)
    except checklist_service.ChecklistError as e:
        return JsonResponse({"detail": str(e)}, status=400)
    return JsonResponse({"item": {"id": item.id, "label": item.label}}, status=201)


@login_required
@require_http_methods(["DELETE"])
def section_checklist_detail(request, item_id):
    """The section head removes a checklist item."""
    head = _section_head(request.user)
    if head is None or not checklist_service.enabled(head.role):
        return JsonResponse({"detail": "Only the Administration head manages the checklist"}, status=403)
    outcome = checklist_service.remove_item(head.role, item_id)
    if outcome is None:
        return JsonResponse({"detail": "Checklist item not found"}, status=404)
    return JsonResponse({"ok": True, "outcome": outcome})


@login_required
@require_http_methods(["POST"])
def section_checklist_tick(request):
    """Tick / untick a checklist item for a request: {request_id, item_id, done}.
    Whoever can decide the request now — the head, or staff it has reached."""
    profile = _profile(request.user)
    role = profile.role if profile else None
    if not checklist_service.enabled(role):
        return JsonResponse({"detail": "This section has no checklist"}, status=403)
    body = _json_body(request)
    if not isinstance(body, dict):
        body = {}
    ss = SectionStatus.objects.filter(
        request_id=_int(body.get("request_id")), section__code=role, request__is_active=True,
    ).select_related("request", "request__student", "section").first()
    if ss is None:
        return JsonResponse({"detail": "Not found"}, status=404)
    if not _scope_ok(profile, ss.request, role):
        return JsonResponse({"detail": "Out of scope"}, status=403)
    if not staff_service.can_decide(profile, ss):
        return _not_sent_to_you()
    try:
        entries = checklist_service.set_tick(ss, _int(body.get("item_id")), bool(body.get("done")), request.user)
    except checklist_service.ChecklistError as e:
        return JsonResponse({"detail": str(e)}, status=400)
    return JsonResponse({"ok": True, "checklist": entries})


@login_required
@require_http_methods(["PATCH", "DELETE"])
def section_staff_detail(request, staff_id):
    """PATCH: edit / reset password / restore. DELETE: remove (their open requests return)."""
    head = _section_head(request.user)
    if head is None:
        return JsonResponse({"detail": "Only the section head can manage staff"}, status=403)
    staff = staff_service.staff_of(request.user, include_removed=True).filter(user_id=staff_id).first()
    if staff is None:
        return JsonResponse({"detail": "Staff member not found"}, status=404)

    if request.method == "DELETE":
        outcome, returned = staff_service.remove_staff(staff)
        return JsonResponse({"ok": True, "outcome": outcome, "returned": returned})

    body = _json_body(request)
    if not isinstance(body, dict):
        body = {}
    try:
        staff = staff_service.update_staff(staff, body)
    except staff_service.StaffError as e:
        return JsonResponse({"detail": str(e)}, status=400)
    return JsonResponse({"staff": _staff_dict(staff)})


# ─── Certificate ────────────────────────────────────────────────────────────────

@login_required
@require_http_methods(["GET"])
def document_download(request, doc_id):
    """
    Serve an uploaded document to authorised viewers only:
      - the owning student,
      - an officer of that document's section (with hostel/dept scope),
      - Administration (the only remaining consolidator), or
      - any section officer, for the shared tri-gate documents (Library/TPC)
        that every Page-3 department now sees for verification.
    Always a forced download (Content-Disposition: attachment), not an inline
    open — inline rendering depended on the browser being able to display
    whatever the file's content-type claimed, which silently failed (a blank/
    broken-image placeholder, no error) for anything it couldn't render.
    """
    from django.http import FileResponse, Http404

    doc = Document.objects.filter(id=doc_id).select_related(
        "section_status__section", "section_status__request__student").first()
    if doc is None or not doc.file:
        raise Http404("Document not found")

    req = doc.section_status.request
    section_code = doc.section_status.section.code
    profile = _profile(request.user)

    is_owner = Student.objects.filter(user=request.user, id=req.student_id).exists()
    # Section staff count as the section's officer only for requests that reached
    # them (Accounts staff and bank details, especially — main/staff.py).
    is_officer = (profile is not None and profile.role == section_code
                  and _scope_ok(profile, req, section_code)
                  and _can_see(profile, doc.section_status))

    # Administration is the only remaining consolidator — it may open any
    # section's documents. HOD is fully independent now (no informational
    # consolidation of Store/LUCS/Sports/Medical/NAD either — see
    # section_review), so it gets no equivalent access here. Administration's
    # staff (main/staff.py) only for requests that have reached them.
    is_consolidator = False
    if profile is not None and profile.role == SECTION_ADMINISTRATION:
        admin_ss = req.section_statuses.filter(section__code=SECTION_ADMINISTRATION).select_related("section").first()
        is_consolidator = (not staff_service.is_staff_member(profile)
                           or (admin_ss is not None and staff_service.can_handle(profile, admin_ss)))

    # Library/TPC documents are shown to every officer as shared context
    # (see section_review's "intake" — every officer sees them, not just
    # consolidators), so any legitimate section officer must actually be able
    # to open/download them too, not just see the filename with a link that 403s.
    is_intake_viewer = (
        profile is not None
        and profile.role in engine.ALL_SECTION_CODES
        and section_code in (SECTION_LIBRARY, SECTION_TPC)
    )

    if not (is_owner or is_officer or is_consolidator or is_intake_viewer):
        return JsonResponse({"detail": "Not authorized to view this document"}, status=403)

    try:
        return FileResponse(doc.file.open("rb"), as_attachment=True,
                            filename=doc.original_name or f"document-{doc.id}")
    except FileNotFoundError:
        raise Http404("File missing on server")


@login_required
@require_http_methods(["POST"])
def generate_certificate(request):
    stud = Student.objects.filter(user=request.user).first()
    if stud is None:
        return JsonResponse({"detail": "Student record not found"}, status=404)
    req = _active_request(stud)
    if req is None or req.overall_status != OVERALL_CLEARED:
        return JsonResponse({"detail": "Request is not cleared"}, status=400)

    cert, _ = Certificate.objects.get_or_create(
        request=req, defaults={"fund_us_amount": req.fund_us_amount})
    return JsonResponse({
        "ok": True,
        "certificate": {
            "request_id": req.id,
            "student": stud.name,
            "roll_no": stud.roll_no,
            "exit_type": req.exit_type,
            "fund_us_amount": str(cert.fund_us_amount),
            "generated_at": cert.generated_at.isoformat(),
            "sections": [
                {"code": ss.section.code, "name": ss.section.name,
                 "approved_by": ss.decided_by.username if ss.decided_by else None,
                 "decided_at": ss.decided_at.isoformat() if ss.decided_at else None}
                for ss in req.section_statuses.select_related("section", "decided_by")
            ],
            # Staff levels that approved a levelled section (Accounts), in order.
            "stages": [
                {"section": ss.section.name, "level": a.level,
                 "approved_by": a.approved_by.username if a.approved_by else None,
                 "approved_at": a.approved_at.isoformat()}
                for ss in req.section_statuses.select_related("section").prefetch_related(
                    "stage_approvals__approved_by")
                for a in ss.stage_approvals.all()
            ],
            # Department labs cleared before HOD (empty if the department has none).
            "labs": [
                {"name": ls.lab.name, "level": ls.level,
                 "approved_by": ls.decided_by.username if ls.decided_by else None,
                 "decided_at": ls.decided_at.isoformat() if ls.decided_at else None}
                for ls in req.lab_statuses.select_related("lab", "decided_by").order_by("level", "lab__name")
            ],
            # The refund Accounts paid (a cleared request always has one; amount 0 = none due).
            "refund": refund_service.status_for(req),
        },
    })


@login_required
@require_http_methods(["GET", "POST"])
def accounts_refunds(request):
    """Refunds — for whoever sends them: the main account (accounts@), plus any
    Accounts staff it made refund managers.
    GET: {pending: [row], sent: [row]} — pending = every section approved, refund not
    recorded yet (oldest first); sent = refunds already recorded (newest first).
    POST {request_id, amount, mode, reference, paid_on} — record (or correct) a paid
    refund; or {request_id, no_refund: true}. Clears the request, so its certificate
    unlocks, and notes it in the student's Accounts thread.
    POST {request_id, reject: true, reason} — send Accounts back to the student instead."""
    if not refund_service.can_record(_profile(request.user)):
        return JsonResponse({"detail": "Refunds are sent by: " + ", ".join(refund_service.sender_names())},
                            status=403)

    if request.method == "POST":
        body = _json_body(request)
        if not isinstance(body, dict):
            body = {}
        req = ClearanceRequest.objects.filter(id=_int(body.get("request_id")), is_active=True).first()
        if req is None:
            return JsonResponse({"detail": "Not found"}, status=404)
        if body.get("reject"):
            try:
                refund_service.reject(req, request.user, body.get("reason", ""))
            except refund_service.RefundError as e:
                return JsonResponse({"detail": str(e)}, status=400)
            return JsonResponse({"ok": True, "status": STATUS_REJECTED})
        try:
            refund = refund_service.record(
                req, request.user, amount=body.get("amount"), mode=body.get("mode"),
                reference=body.get("reference"), paid_on=body.get("paid_on"),
                no_refund=bool(body.get("no_refund")))
        except refund_service.RefundError as e:
            return JsonResponse({"detail": str(e)}, status=400)
        return JsonResponse({"ok": True, "refund": refund_service.row(req, refund)["refund"]})

    return JsonResponse({
        "pending": [refund_service.row(req) for req in refund_service.pending()],
        "sent": [refund_service.row(r.request, r) for r in refund_service.recent()],
        "modes": refund_service.MODES,
    })
