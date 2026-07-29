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
    Account,
    Faculty,
    HOD,
    Lab,
    Library,
    Student,
    StudFacStatus,
    StudLabStatus,
    SupportOffice,
)

# ─────────────────────────────────────────────────────────────────────────────
# Role configuration
# ─────────────────────────────────────────────────────────────────────────────

ROLE_CONFIG = {
    "BH1 Support": {
        "model": SupportOffice,
        "role_name": "BH1 Support",
        "field": "bh1_approval",
        "scope": "hostel",
        "queue_extra": {},
        "feedback_key": "bh1_support",
        "resets": ["hod_approval", "account_approval"],
    },
    "BH2 Support": {
        "model": SupportOffice,
        "role_name": "BH2 Support",
        "field": "bh2_approval",
        "scope": "hostel",
        "queue_extra": {},
        "feedback_key": "bh2_support",
        "resets": ["hod_approval", "account_approval"],
    },
    "BH3 Support": {
        "model": SupportOffice,
        "role_name": "BH3 Support",
        "field": "bh3_approval",
        "scope": "hostel",
        "queue_extra": {},
        "feedback_key": "bh3_support",
        "resets": ["hod_approval", "account_approval"],
    },
    "BH5 Support": {
        "model": SupportOffice,
        "role_name": "BH5 Support",
        "field": "bh5_approval",
        "scope": "hostel",
        "queue_extra": {},
        "feedback_key": "bh5_support",
        "resets": ["hod_approval", "account_approval"],
    },
    "Library": {
        "model": Library,
        "field": "library_approval",
        "scope": None,
        "queue_extra": {},
        "feedback_key": "library",
        "resets": ["hod_approval", "account_approval"],
    },
    "Store Release": {
        "model": SupportOffice,
        "role_name": "Store Release",
        "field": "store_release_approval",
        "scope": None,
        "queue_extra": {},
        "feedback_key": "store_release",
        "resets": ["hod_approval", "account_approval"],
    },
    "LUCS": {
        "model": SupportOffice,
        "role_name": "LUCS",
        "field": "lucs_approval",
        "scope": None,
        "queue_extra": {},
        "feedback_key": "lucs",
        "resets": ["hod_approval", "account_approval"],
    },
    "Sports": {
        "model": SupportOffice,
        "role_name": "Sports",
        "field": "sports_approval",
        "scope": None,
        "queue_extra": {},
        "feedback_key": "sports",
        "resets": ["hod_approval", "account_approval"],
    },
    "Medical Unit": {
        "model": SupportOffice,
        "role_name": "Medical Unit",
        "field": "medical_unit_approval",
        "scope": None,
        "queue_extra": {},
        "feedback_key": "medical_unit",
        "resets": ["hod_approval", "account_approval"],
    },
    "NAD Cell": {
        "model": SupportOffice,
        "role_name": "NAD Cell",
        "field": "nad_cell_approval",
        "scope": None,
        "queue_extra": {},
        "feedback_key": "nad_cell",
        "resets": ["hod_approval", "account_approval"],
    },
    "Account": {
        "model": Account,
        "field": "account_approval",
        "scope": None,
        "queue_extra": {"hod_approval": True},
        "feedback_key": "account",
        "resets": [],
    },
}

SPECIAL_ROLES = {"Student", "Faculty", "HOD", "Account"}
HOSTEL_SUPPORT_ROLES = {"BH1 Support", "BH2 Support", "BH3 Support", "BH5 Support"}
ALL_ROLES = ["Student", "Faculty", "HOD", "Account", "Hostel Support"] + list(ROLE_CONFIG.keys())


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
            "department": stud.dept_status(),
            "labs": stud.lab_status(),
            "bh1_support": stud.bh1_approval,
            "bh2_support": stud.bh2_approval,
            "bh3_support": stud.bh3_approval,
            "bh5_support": stud.bh5_approval,
            "library": stud.library_approval,
            "store_release": stud.store_release_approval,
            "lucs": stud.lucs_approval,
            "sports": stud.sports_approval,
            "medical_unit": stud.medical_unit_approval,
            "nad_cell": stud.nad_cell_approval,
            "hod": stud.hod_approval,
            "account": stud.account_approval,
        },
        "intake": {
            "submitted": getattr(stud, "intake_submitted", False),
            "hostel_block": getattr(stud, "hostel", "") or "BH1",
            "vacant_room_no": getattr(stud, "vacant_room_no", "") or "A110",
            "btp_doc_title": getattr(stud, "btp_doc_title", "") or "Development of Online No-Dues Portal",
            "btp_form_no": getattr(stud, "btp_form_no", "") or "CL/LB/IR/2026/042",
            "btp_plagiarism": getattr(stud, "btp_plagiarism", "") or "8%",
            "offer_letter_name": getattr(stud, "offer_letter_name", "") or "Offer_Letter_2026.pdf",
        },
        "feedbacks": getattr(stud, "section_feedback", {}) or {},
    }


def _profile_for(role, webmail):
    """Return the officer profile row that authorises `role` for `webmail`."""
    if role in ROLE_CONFIG:
        model = ROLE_CONFIG[role]["model"]
        if model is SupportOffice:
            return model.objects.filter(webmail=webmail, office_role=ROLE_CONFIG[role]["role_name"]).first()
        return model.objects.filter(webmail=webmail).first()
    if role == "Faculty":
        return Faculty.objects.filter(webmail=webmail).first()
    if role == "HOD":
        return HOD.objects.filter(webmail=webmail).first()
    if role == "Account":
        return Account.objects.filter(webmail=webmail).first()
    return None


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

    if role == "Hostel Support":
        profile = SupportOffice.objects.filter(webmail=username, office_role__in=HOSTEL_SUPPORT_ROLES).first()
        if profile is None:
            return JsonResponse({"detail": "Invalid role for this account"}, status=403)
        actual_role = profile.office_role
    else:
        profile = Student.objects.filter(webmail=username).first() if role == "Student" else _profile_for(role, username)
        actual_role = role
    if profile is None:
        return JsonResponse({"detail": "Invalid role for this account"}, status=403)

    login(request, user)
    request.session["role"] = actual_role

    return JsonResponse({
        "username": username,
        "role": actual_role,
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
    if role in ROLE_CONFIG:
        cfg = ROLE_CONFIG[role]
        qs = Student.objects.all()
        if cfg["scope"] == "hostel":
            profile = _profile_for(role, username)
            qs = qs.filter(hostel=getattr(profile, "hostel", "")) if profile else Student.objects.none()
        if cfg["queue_extra"]:
            qs = qs.filter(**cfg["queue_extra"])
        return qs.order_by("roll")

    if role == "HOD":
        hod = HOD.objects.filter(webmail=username).first()
        if hod is None:
            return Student.objects.none()
        return Student.objects.filter(
            dept=hod.dept,
            bh1_approval=True,
            bh2_approval=True,
            bh3_approval=True,
            bh5_approval=True,
            library_approval=True,
            store_release_approval=True,
            lucs_approval=True,
            sports_approval=True,
            medical_unit_approval=True,
            nad_cell_approval=True,
        ).order_by("roll")

    if role == "Faculty":
        fac = Faculty.objects.filter(webmail=username).first()
        return Student.objects.filter(dept=fac.dept).order_by("roll") if fac else Student.objects.none()

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
    elif role == "HOD":
        for s in students:
            rows.append({"id": s.id, "roll": s.roll, "name": s.name,
                         "webmail": s.webmail, "approved": s.hod_approval})
    elif role in ROLE_CONFIG:
        field = ROLE_CONFIG[role]["field"]
        feedback_key = ROLE_CONFIG[role]["feedback_key"]
        for s in students:
            rows.append({
                "id": s.id,
                "roll": s.roll,
                "name": s.name,
                "webmail": s.webmail,
                "hostel": s.hostel,
                "feedback": (getattr(s, "section_feedback", {}) or {}).get(feedback_key, ""),
                "vacant_room_no": getattr(s, "vacant_room_no", "") or "A110",
                "btp_doc_title": getattr(s, "btp_doc_title", "") or "Development of Online No-Dues Portal",
                "btp_form_no": getattr(s, "btp_form_no", "") or "CL/LB/IR/2026/042",
                "btp_plagiarism": getattr(s, "btp_plagiarism", "") or "8%",
                "offer_letter_name": getattr(s, "offer_letter_name", "") or "Offer_Letter_2026.pdf",
                "approved": getattr(s, field),
            })
    else:
        return JsonResponse({"detail": "Unknown role"}, status=400)

    heading = "Students"
    if role in ROLE_CONFIG and ROLE_CONFIG[role]["scope"] == "hostel":
        profile = _profile_for(role, username)
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
    approvals = body.get("approvals", {})
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

    elif role == "HOD":
        for s in students:
            if s.webmail not in approvals:
                continue
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
            decision = approvals[s.webmail]
            if isinstance(decision, dict):
                value = bool(decision.get("approved"))
                feedback = str(decision.get("feedback") or "").strip()
            else:
                value = bool(decision)
                feedback = ""
            setattr(s, field, value)
            feedbacks = getattr(s, "section_feedback", {}) or {}
            if feedback:
                feedbacks[cfg["feedback_key"]] = feedback
            elif cfg["feedback_key"] in feedbacks:
                feedbacks.pop(cfg["feedback_key"], None)
            s.section_feedback = feedbacks
            if not value:
                for reset_field in cfg["resets"]:
                    setattr(s, reset_field, False)
            s.save()
    else:
        return JsonResponse({"detail": "Unknown role"}, status=400)

    return JsonResponse({"ok": True})


@login_required
@require_http_methods(["POST"])
def submit_intake(request):
    """Persist Page 1 student intake details."""
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