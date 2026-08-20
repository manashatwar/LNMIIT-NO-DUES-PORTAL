"""
JSON API for the LNMIIT No Dues Portal — Design.md aligned.

Session auth + role/scope guard. The React SPA talks to these endpoints through
the Vite dev proxy (same-origin), so Django CSRF + sessions work directly.
"""
import json
import re

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

from . import engine
from .models import (
    Department, Hostel, Section, UserProfile, Student,
    ClearanceRequest, SectionStatus, Document, Comment, Certificate,
    EXIT_TYPES, STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED,
    OVERALL_CLEARED, SECTION_LIBRARY, SECTION_TPC, SECTION_WARDEN,
    SECTION_HOD, SECTION_ADMINISTRATION,
)

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB — matches the original UI design (docs/images/ui-wireframe.png)

# Hostel room numbers: one block letter + exactly 3 digits, e.g. A102, B501.
VACANT_ROOM_RE = re.compile(r"^[A-Za-z]\d{3}$")

# Basic (name/roll) sections that require an explicit student "Confirm & Send" before
# the request reaches the officer's queue. LUCS moved here (no longer an
# upload section) — same confirm-only flow as Store/Sports/Medical/NAD.
from .models import (  # noqa: E402
    SECTION_STORE, SECTION_LUCS, SECTION_SPORTS, SECTION_MEDICAL, SECTION_NAD, SECTION_ADMINISTRATION,
)
BASIC_CONFIRM_SECTIONS = {
    SECTION_STORE, SECTION_LUCS, SECTION_SPORTS, SECTION_MEDICAL, SECTION_NAD, SECTION_ADMINISTRATION,
}
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "application/pdf"}
ALLOWED_EXTS = {".jpg", ".jpeg", ".png", ".pdf"}

ROLES = ["STUDENT"] + engine.ALL_SECTION_CODES + ["ADMIN"]


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


def _section_dict(ss, request):
    return {
        "code": ss.section.code,
        "name": ss.section.name,
        "status": ss.status,
        "actionable": engine.actionable(request, ss.section.code),
        "is_upload_section": ss.section.is_upload_section,
        "student_confirmed": ss.student_confirmed,
        "needs_confirm": ss.section.code in BASIC_CONFIRM_SECTIONS,
        "decided_by": ss.decided_by.username if ss.decided_by else None,
        "decided_at": ss.decided_at.isoformat() if ss.decided_at else None,
        "comments": [
            {"body": c.body, "author": (c.author.username if c.author else "system"),
             "is_system": c.is_system, "created_at": c.created_at.isoformat()}
            for c in ss.comments.all().order_by("created_at")
        ],
        "documents": [
            {"id": d.id, "original_name": d.original_name,
             "event_report_url": d.event_report_url, "ocr_text": d.ocr_text,
             "ocr_fields": d.ocr_fields,
             "download_url": (f"/api/document/{d.id}/download/" if d.file else None)}
            for d in ss.documents.all().order_by("uploaded_at")
        ],
    }


def _intake_upload_state(req):
    """Which intake upload sections are done (have a document/link) vs pending,
    and which were rejected (need re-upload)."""
    needed = engine.intake_required_uploads(req.exit_type)
    done, pending, rejected = [], [], []
    for code in needed:
        ss = req.section_statuses.filter(section__code=code).first()
        has_doc = ss is not None and ss.documents.exists()
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
    statuses = req.section_statuses.select_related("section").prefetch_related("comments", "documents")
    needed, done, pending, rejected_intake = _intake_upload_state(req)
    return {
        "id": req.id,
        "exit_type": req.exit_type,
        "overall_status": req.overall_status,
        "fund_us_amount": str(req.fund_us_amount),
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
        "sections": [_section_dict(ss, req) for ss in statuses],
        "has_certificate": Certificate.objects.filter(request=req).exists(),
    }


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

    fund_us = body.get("fund_us_amount") or 0
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
        section = Section.objects.get(code=code)
        SectionStatus.objects.get_or_create(
            request=req, section=section,
            defaults={"student_confirmed": code not in BASIC_CONFIRM_SECTIONS},
        )
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
    if "vacant_room_no" in body:
        req.vacant_room_no = (body.get("vacant_room_no") or "").strip().upper()
    if "fund_us_amount" in body:
        try:
            req.fund_us_amount = body.get("fund_us_amount") or 0
        except (TypeError, ValueError):
            pass

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
    req.save(update_fields=["vacant_room_no", "intake_submitted", "fund_us_amount"])

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
def confirm_section(request):
    """
    Student confirms a basic (name/roll) section with (optionally edited) details.
    Only after this does the request reach that office's queue.
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

    details = {
        "name": (body.get("name") or "").strip(),
        "roll_no": (body.get("roll_no") or "").strip(),
        "department": (body.get("department") or "").strip(),
    }
    # Store the confirmed details (no file) so the officer can see what was submitted.
    doc = ss.documents.first() or Document(section_status=ss)
    doc.ocr_fields = {"review": details, "confirmed": True}
    doc.save()

    ss.student_confirmed = True
    # If it was rejected, re-confirming re-sends a fresh request → back to PENDING.
    if ss.status == STATUS_REJECTED:
        ss.status = STATUS_PENDING
        ss.decided_by = None
        ss.decided_at = None
        Comment.objects.create(section_status=ss, author=request.user, is_system=True,
                               body="Student re-submitted details after rejection.")
    ss.save(update_fields=["student_confirmed", "status", "decided_by", "decided_at"])
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

    qs = SectionStatus.objects.filter(
        section__code=role, request__is_active=True, student_confirmed=True,
    ).select_related("request", "request__student", "section")

    if role == SECTION_WARDEN and profile.hostel_id:
        qs = qs.filter(request__student__hostel_id=profile.hostel_id)
    if role == SECTION_HOD and profile.department_id:
        qs = qs.filter(request__student__department_id=profile.department_id)

    rows = []
    for ss in qs:
        req = ss.request
        rows.append({
            "request_id": req.id,
            "section_status_id": ss.id,
            "roll_no": req.student.roll_no,
            "name": req.student.name,
            "department": req.student.department.code,
            "hostel": req.student.hostel.code,
            "exit_type": req.exit_type,
            "status": ss.status,
            "actionable": engine.actionable(req, role),
            "vacant_room_no": req.vacant_room_no,
        })

    section = Section.objects.filter(code=role).first()
    heading = section.name if section else role
    if role == SECTION_WARDEN and profile.hostel_id:
        heading = f"{section.name} — {profile.hostel.code}"
    if role == SECTION_HOD and profile.department_id:
        heading = f"{section.name} — {profile.department.code}"

    return JsonResponse({"role": role, "heading": heading, "students": rows})


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
        "request", "request__student", "section").first()
    if ss is None:
        return JsonResponse({"detail": "Not found"}, status=404)
    if not _scope_ok(profile, ss.request, role):
        return JsonResponse({"detail": "Out of scope"}, status=403)

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
            pss = ss.request.section_statuses.filter(section__code=code).select_related("section").first()
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
            pss = ss.request.section_statuses.filter(section__code=code).select_related("section").first()
            if pss is None:
                continue
            # Final view: only the latest (final) document, no message thread.
            latest = pss.documents.order_by("-uploaded_at").first()
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
                "student_confirmed": pss.student_confirmed,
                "needs_confirm": pss.section.code in BASIC_CONFIRM_SECTIONS,
                "decided_by": pss.decided_by.username if pss.decided_by else None,
                "decided_at": pss.decided_at.isoformat() if pss.decided_at else None,
                "documents": docs, "comments": [],   # no messages for Administration
            })
        data["prerequisites"] = prereqs

    return JsonResponse(data)


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

    try:
        if action == "approve":
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
    is_officer = profile is not None and profile.role == section_code and _scope_ok(profile, req, section_code)

    # Administration is the only remaining consolidator — it may open any
    # section's documents. HOD is fully independent now (no informational
    # consolidation of Store/LUCS/Sports/Medical/NAD either — see
    # section_review), so it gets no equivalent access here.
    is_consolidator = profile is not None and profile.role == SECTION_ADMINISTRATION

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
        },
    })
