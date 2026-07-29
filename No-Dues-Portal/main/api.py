"""
JSON API for the No-Dues Portal.

Replaces the old server-rendered HTML views. The React SPA (served by Vite)
talks to these endpoints through a same-origin dev proxy, so standard Django
session auth + CSRF works without CORS configuration.
"""
import json

from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponseBadRequest
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

from .models import (
    Student, Faculty, Lab, Caretaker, Warden, Gymkhana, Library,
    OnlineCC, CC, SubmitThesis, asstreg, HOD, Account,
    StudFacStatus, StudLabStatus,
)

# ─────────────────────────────────────────────────────────────────────────────
# Role configuration
#
# Each officer role maps to a boolean field on Student, an optional scope
# (hostel/dept), the profile model that authorises the role, an optional queue
# filter, and the downstream fields to reset when clearance is revoked
# (reverse-hierarchy cascade — mirrors the original views).
# ─────────────────────────────────────────────────────────────────────────────

ROLE_CONFIG = {
    "Caretaker": {
        "model": Caretaker, "field": "caretaker_approval", "scope": "hostel",
        "queue_extra": {},
        "resets": ["warden_approval", "assistant_registrar_approval", "hod_approval", "account_approval"],
    },
    "Warden": {
        "model": Warden, "field": "warden_approval", "scope": "hostel",
        "queue_extra": {"caretaker_approval": True},
        "resets": ["assistant_registrar_approval", "hod_approval", "account_approval"],
    },
    "Gymkhana": {
        "model": Gymkhana, "field": "gymkhana_approval", "scope": None,
        "queue_extra": {},
        "resets": ["assistant_registrar_approval", "hod_approval", "account_approval"],
    },
    "OnlineCC": {
        "model": OnlineCC, "field": "online_cc_approval", "scope": None,
        "queue_extra": {},
        "resets": ["cc_approval", "hod_approval", "account_approval"],
    },
    "CC": {
        "model": CC, "field": "cc_approval", "scope": None,
        "queue_extra": {"online_cc_approval": True},
        "resets": ["hod_approval", "account_approval"],
    },
    "Thesis Manager": {
        "model": SubmitThesis, "field": "submit_thesis", "scope": None,
        "queue_extra": {},
        "resets": ["library_approval", "hod_approval", "account_approval"],
    },
    "Library": {
        "model": Library, "field": "library_approval", "scope": None,
        "queue_extra": {"submit_thesis": True},
        "resets": ["hod_approval", "account_approval"],
    },
    "Assistant Registrar": {
        "model": asstreg, "field": "assistant_registrar_approval", "scope": None,
        "queue_extra": {"caretaker_approval": True, "warden_approval": True, "gymkhana_approval": True},
        "resets": ["hod_approval", "account_approval"],
    },
    "Account": {
        "model": Account, "field": "account_approval", "scope": None,
        "queue_extra": {"hod_approval": True},
        "resets": [],
    },
}

# Roles handled with bespoke logic
SPECIAL_ROLES = {"Student", "Faculty", "Lab", "HOD"}

ALL_ROLES = ["Student"] + list(ROLE_CONFIG.keys()) + ["Faculty", "Lab", "HOD"]


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _student_dict(stud):
    """Serialise a student's full clearance status matrix."""
    return {
        "id": stud.id,
        "name": stud.name,
        "roll": stud.roll,
        "webmail": stud.webmail,
        "dept": stud.dept,
        "hostel": stud.hostel,
        "sections": {
            "caretaker": stud.caretaker_approval,
            "gymkhana": stud.gymkhana_approval,
            "online_cc": stud.online_cc_approval,
            "department": stud.dept_status(),
            "labs": stud.lab_status(),
            "warden": stud.warden_approval,
            "library": stud.library_approval,
            "cc": stud.cc_approval,
            "thesis": stud.submit_thesis,
            "assistant_registrar": stud.assistant_registrar_approval,
            "hod": stud.hod_approval,
            "account": stud.account_approval,
        },
        "intake": {
            "submitted": getattr(stud, "intake_submitted", False),
            "vacant_room_no": getattr(stud, "vacant_room_no", "") or "A110",
            "btp_doc_title": getattr(stud, "btp_doc_title", "") or "Development of Online No-Dues Portal",
            "btp_form_no": getattr(stud, "btp_form_no", "") or "CL/LB/IR/2026/042",
            "btp_plagiarism": getattr(stud, "btp_plagiarism", "") or "8%",
            "offer_letter_name": getattr(stud, "offer_letter_name", "") or "Offer_Letter_2026.pdf",
        },
    }


def _profile_for(role, webmail):
    """Return the officer profile row that authorises `role` for `webmail`."""
    if role in ROLE_CONFIG:
        model = ROLE_CONFIG[role]["model"]
    elif role == "Faculty":
        model = Faculty
    elif role == "Lab":
        model = Lab
    elif role == "HOD":
        model = HOD
    else:
        return None
    return model.objects.filter(webmail=webmail).first()


def _acting_role(request):
    return request.session.get("role")


def _json_body(request):
    try:
        return json.loads(request.body.decode("utf-8") or "{}")
    except (ValueError, UnicodeDecodeError):
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# Auth endpoints
# ─────────────────────────────────────────────────────────────────────────────

@ensure_csrf_cookie
@require_http_methods(["GET"])
def csrf(request):
    """Set the csrftoken cookie so the SPA can send X-CSRFToken on writes."""
    return JsonResponse({"detail": "ok"})


@require_http_methods(["POST"])
def login_api(request):
    body = _json_body(request)
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    role = body.get("role") or ""

    if not username or not password or not role:
        return JsonResponse({"detail": "username, password and role are required"}, status=400)
    if role not in ALL_ROLES:
        return JsonResponse({"detail": "Unknown role"}, status=400)

    user = authenticate(username=username, password=password)
    if user is None or not user.is_active:
        return JsonResponse({"detail": "Invalid credentials"}, status=401)

    # Verify the selected role matches a profile row for this webmail (username).
    if role == "Student":
        profile = Student.objects.filter(webmail=username).first()
    else:
        profile = _profile_for(role, username)
    if profile is None:
        return JsonResponse({"detail": "Invalid role for this account"}, status=403)

    login(request, user)
    request.session["role"] = role

    return JsonResponse({
        "username": username,
        "role": role,
        "name": getattr(profile, "name", username),
    })


@require_http_methods(["POST"])
def logout_api(request):
    logout(request)
    return JsonResponse({"detail": "logged out"})


@login_required
@require_http_methods(["GET"])
def me(request):
    role = _acting_role(request)
    username = request.user.username
    if not role:
        return JsonResponse({"detail": "No active role"}, status=400)

    data = {"username": username, "role": role}
    if role == "Student":
        stud = Student.objects.filter(webmail=username).first()
        data["name"] = stud.name if stud else username
    else:
        profile = _profile_for(role, username)
        data["name"] = getattr(profile, "name", username) if profile else username
        for key in ("dept", "hostel"):
            if profile is not None and hasattr(profile, key):
                data[key] = getattr(profile, key)
    return JsonResponse(data)


# ─────────────────────────────────────────────────────────────────────────────
# Student endpoint
# ─────────────────────────────────────────────────────────────────────────────

@login_required
@require_http_methods(["GET"])
def student_status(request):
    stud = Student.objects.filter(webmail=request.user.username).first()
    if stud is None:
        return JsonResponse({"detail": "Student record not found"}, status=404)
    return JsonResponse(_student_dict(stud))


@login_required
@require_http_methods(["GET"])
def student_dept_detail(request):
    """Per-faculty approval breakdown for the logged-in student's department."""
    stud = Student.objects.filter(webmail=request.user.username).first()
    if stud is None:
        return JsonResponse({"detail": "Student record not found"}, status=404)
    faculties = Faculty.objects.filter(dept=stud.dept)
    items = []
    for fac in faculties:
        st = StudFacStatus.objects.filter(student=stud, faculty=fac).first()
        items.append({"name": fac.name, "approved": bool(st and st.approval)})
    return JsonResponse({"dept": stud.dept, "items": items})


@login_required
@require_http_methods(["GET"])
def student_lab_detail(request):
    """Per-lab approval breakdown for the logged-in student."""
    stud = Student.objects.filter(webmail=request.user.username).first()
    if stud is None:
        return JsonResponse({"detail": "Student record not found"}, status=404)
    items = []
    for lab in Lab.objects.all():
        st = StudLabStatus.objects.filter(student=stud, lab=lab).first()
        items.append({"name": lab.name, "approved": bool(st and st.approval)})
    return JsonResponse({"items": items})


# ─────────────────────────────────────────────────────────────────────────────
# Officer queue + save
# ─────────────────────────────────────────────────────────────────────────────

def _queue_students(role, username):
    """Return the scoped student queryset for an officer role."""
    if role in ROLE_CONFIG:
        cfg = ROLE_CONFIG[role]
        qs = Student.objects.all()
        if cfg["scope"] == "hostel":
            profile = cfg["model"].objects.filter(webmail=username).first()
            qs = qs.filter(hostel=profile.hostel) if profile else Student.objects.none()
        if cfg["queue_extra"]:
            qs = qs.filter(**cfg["queue_extra"])
        return qs.order_by("roll")

    if role == "HOD":
        hod = HOD.objects.filter(webmail=username).first()
        if hod is None:
            return Student.objects.none()
        return Student.objects.filter(
            dept=hod.dept, assistant_registrar_approval=True,
            library_approval=True, cc_approval=True,
        ).order_by("roll")

    if role == "Faculty":
        fac = Faculty.objects.filter(webmail=username).first()
        return Student.objects.filter(dept=fac.dept).order_by("roll") if fac else Student.objects.none()

    if role == "Lab":
        return Student.objects.all().order_by("roll")

    return Student.objects.none()


@login_required
@require_http_methods(["GET"])
def section_queue(request):
    role = _acting_role(request)
    username = request.user.username
    if role in SPECIAL_ROLES and role == "Student":
        return JsonResponse({"detail": "Students have no queue"}, status=403)

    students = _queue_students(role, username)
    rows = []

    if role == "Faculty":
        fac = Faculty.objects.filter(webmail=username).first()
        for s in students:
            st = StudFacStatus.objects.filter(student=s, faculty=fac).first()
            rows.append({"id": s.id, "roll": s.roll, "name": s.name,
                         "webmail": s.webmail, "approved": bool(st and st.approval)})
    elif role == "Lab":
        lab = Lab.objects.filter(webmail=username).first()
        for s in students:
            st = StudLabStatus.objects.filter(student=s, lab=lab).first()
            rows.append({"id": s.id, "roll": s.roll, "name": s.name,
                         "webmail": s.webmail, "approved": bool(st and st.approval)})
    elif role == "HOD":
        for s in students:
            if s.dept_status() and s.lab_status():
                rows.append({"id": s.id, "roll": s.roll, "name": s.name,
                             "webmail": s.webmail, "approved": s.hod_approval})
    elif role in ROLE_CONFIG:
        field = ROLE_CONFIG[role]["field"]
        for s in students:
            rows.append({
                "id": s.id,
                "roll": s.roll,
                "name": s.name,
                "webmail": s.webmail,
                "hostel": s.hostel,
                "vacant_room_no": getattr(s, "vacant_room_no", "") or "A110",
                "btp_doc_title": getattr(s, "btp_doc_title", "") or "Development of Online No-Dues Portal",
                "btp_form_no": getattr(s, "btp_form_no", "") or "CL/LB/IR/2026/042",
                "btp_plagiarism": getattr(s, "btp_plagiarism", "") or "8%",
                "offer_letter_name": getattr(s, "offer_letter_name", "") or "Offer_Letter_2026.pdf",
                "approved": getattr(s, field)
            })
    else:
        return JsonResponse({"detail": "Unknown role"}, status=400)

    heading = "Students"
    if role in ROLE_CONFIG and ROLE_CONFIG[role]["scope"] == "hostel":
        profile = ROLE_CONFIG[role]["model"].objects.filter(webmail=username).first()
        heading = f"Students of {profile.hostel}" if profile else "Students"
    elif role == "HOD":
        hod = HOD.objects.filter(webmail=username).first()
        heading = f"Students of {hod.dept}" if hod else "Students"
    elif role == "Faculty":
        fac = Faculty.objects.filter(webmail=username).first()
        heading = f"Students of {fac.dept}" if fac else "Students"

    return JsonResponse({"role": role, "heading": heading, "students": rows})


@login_required
@require_http_methods(["POST"])
def section_save(request):
    role = _acting_role(request)
    username = request.user.username
    body = _json_body(request)
    approvals = body.get("approvals", {})  # { webmail: bool }
    if not isinstance(approvals, dict):
        return HttpResponseBadRequest("approvals must be an object")

    students = _queue_students(role, username)

    if role == "Faculty":
        fac = Faculty.objects.filter(webmail=username).first()
        for s in students:
            if s.webmail not in approvals:
                continue
            st = StudFacStatus.objects.filter(student=s, faculty=fac).first()
            if st is None:
                continue
            st.approval = bool(approvals[s.webmail])
            st.save()
            if not st.approval:
                s.hod_approval = False
                s.account_approval = False
                s.save()

    elif role == "Lab":
        lab = Lab.objects.filter(webmail=username).first()
        for s in students:
            if s.webmail not in approvals:
                continue
            st = StudLabStatus.objects.filter(student=s, lab=lab).first()
            if st is None:
                continue
            st.approval = bool(approvals[s.webmail])
            st.save()
            if not st.approval:
                s.hod_approval = False
                s.account_approval = False
                s.save()

    elif role == "HOD":
        for s in students:
            if s.webmail not in approvals:
                continue
            if s.dept_status() and s.lab_status():
                s.hod_approval = bool(approvals[s.webmail])
                if not s.hod_approval:
                    s.account_approval = False
                s.save()

    elif role in ROLE_CONFIG:
        cfg = ROLE_CONFIG[role]
        field = cfg["field"]
        for s in students:
            if s.webmail not in approvals:
                continue
            value = bool(approvals[s.webmail])
            setattr(s, field, value)
            if not value:  # reverse-hierarchy cascade
                for reset_field in cfg["resets"]:
                    setattr(s, reset_field, False)
            s.save()
    else:
        return JsonResponse({"detail": "Unknown role"}, status=400)

    return JsonResponse({"ok": True})


@login_required
@require_http_methods(["POST"])
def submit_intake(request):
    """Persist Page 1 student intake details (hostel block, room, BTP title, offer letter)."""
    username = request.user.username
    stud = Student.objects.filter(webmail=username).first()
    if not stud:
        return JsonResponse({"detail": "Student record not found"}, status=404)

    body = _json_body(request)

    if "hostel_block" in body and body["hostel_block"]:
        stud.hostel = body["hostel_block"]
    if "vacant_room_no" in body:
        stud.vacant_room_no = body["vacant_room_no"]
    if "btp_doc_title" in body:
        stud.btp_doc_title = body["btp_doc_title"]
    if "btp_form_no" in body:
        stud.btp_form_no = body["btp_form_no"]
    if "btp_plagiarism" in body:
        stud.btp_plagiarism = body["btp_plagiarism"]
    if "offer_letter_name" in body:
        stud.offer_letter_name = body["offer_letter_name"]

    stud.intake_submitted = True
    stud.save()

    return JsonResponse({"ok": True, "student": _student_dict(stud)})
