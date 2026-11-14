"""
Tests for
  * the HOD-managed department lab hierarchy — engine.py § Department labs,
    labs.py, and the /api/student/labs/*, /api/lab/*, /api/hod/labs/* endpoints;
  * section staff (Library, LUCS, NAD Cell) — staff.py and /api/section/assign/,
    /api/section/staff/*.
Run with: python manage.py test main  (needs PostgreSQL, like the app).
"""
import json
import tempfile
from datetime import timedelta
from unittest import mock

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import SimpleTestCase, TestCase, override_settings
from django.test.utils import CaptureQueriesContext

from main import checklist as checklist_service
from main import checks as workflow_checks
from main import engine
from main import labs as lab_service
from main import prefetch
from main import refunds as refund_service
from main import staff as staff_service
from main.api import BASIC_CONFIRM_SECTIONS
from main.management.commands.seed_demo import SECTION_DEFS
from main.models import (
    Department, Hostel, Section, UserProfile, Student, ClearanceRequest, SectionStatus,
    Certificate, Comment, Document, Lab, LabStatus, Refund, StageApproval,
    DEPARTMENT_CODES, EXIT_TYPES, HOSTEL_CODES, ROLE_LAB,
    STATUS_PENDING, STATUS_APPROVED, STATUS_REJECTED, OVERALL_CLEARED, OVERALL_IN_PROGRESS,
    SECTION_LIBRARY, SECTION_TPC, SECTION_WARDEN, SECTION_HOD, SECTION_ACCOUNTS,
    SECTION_ADMINISTRATION, SECTION_LUCS, SECTION_NAD, SECTION_STORE, SECTION_SPORTS, SECTION_MEDICAL,
)

# Page 3's field sections: independent of the rest, but a request is cleared only
# once every one of its sections has approved.
FIELD_SECTIONS = (SECTION_STORE, SECTION_LUCS, SECTION_SPORTS, SECTION_MEDICAL, SECTION_NAD)

LAB_PASSWORD = "Ece-Lab-Pass-2026"
STAFF_PASSWORD = "Library-Desk-2026"


class ApiHelpers:
    """JSON API calls as a given user, through the real URLs and views."""

    def post(self, user, url, payload=None):
        self.client.force_login(user)
        return self.client.post(url, data=json.dumps(payload or {}), content_type="application/json")

    def get(self, user, url):
        self.client.force_login(user)
        return self.client.get(url)

    def patch(self, user, url, payload):
        self.client.force_login(user)
        return self.client.patch(url, data=json.dumps(payload), content_type="application/json")

    def delete(self, user, url):
        self.client.force_login(user)
        return self.client.delete(url)

    def login(self, username, password, role):
        self.client.logout()
        return self.client.post("/api/login/", content_type="application/json",
                                data=json.dumps({"username": username, "password": password, "role": role}))


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class LabHierarchyTests(ApiHelpers, TestCase):

    @classmethod
    def setUpTestData(cls):
        cls.dept = {c: Department.objects.create(code=c) for c in DEPARTMENT_CODES}
        cls.hostel = {c: Hostel.objects.create(code=c) for c in HOSTEL_CODES}
        for code, name, order, upload, consolidator in SECTION_DEFS:
            Section.objects.create(code=code, name=name, order=order,
                                   is_upload_section=upload, is_consolidator=consolidator)

        def officer(username, role, hostel=None, dept=None):
            user = User.objects.create_user(username, password="x")
            UserProfile.objects.create(user=user, role=role, hostel=cls.hostel.get(hostel),
                                       department=cls.dept.get(dept))
            return user

        cls.library = officer("library@t.in", SECTION_LIBRARY)
        cls.tpc = officer("tpc@t.in", SECTION_TPC)
        cls.warden = officer("warden.gh1@t.in", SECTION_WARDEN, hostel="GH1")
        cls.hod_ece = officer("hod.ece@t.in", SECTION_HOD, dept="ECE")
        cls.hod_cse = officer("hod.cse@t.in", SECTION_HOD, dept="CSE")
        cls.accounts = officer("accounts@t.in", SECTION_ACCOUNTS)
        cls.admin_office = officer("admin.office@t.in", SECTION_ADMINISTRATION)

        # ECE chain: level 1 = Microwave + ADC (in parallel), level 2 = DSP, level 3 = BE.
        def lab(name, email, level):
            return lab_service.create_lab(cls.dept["ECE"], name=name, email=email, password=LAB_PASSWORD,
                                          level=level, incharge_name=f"{name} In-charge")

        cls.microwave = lab("Microwave Lab", "microwave.lab@t.in", 1)
        cls.adc = lab("ADC Lab", "adc.lab@t.in", 1)
        cls.dsp = lab("DSP Lab", "dsp.lab@t.in", 2)
        cls.be = lab("BE Lab", "be.lab@t.in", 3)

        def student(username, name, roll, dept):
            user = User.objects.create_user(username, password="x")
            UserProfile.objects.create(user=user, role="STUDENT")
            return Student.objects.create(user=user, name=name, roll_no=roll, department=cls.dept[dept],
                                          hostel=cls.hostel["GH1"], webmail=username)

        cls.priya = student("priya@t.in", "Priya Singh", "23UEC201", "ECE")
        cls.ravi = student("ravi@t.in", "Ravi Verma", "23UEC202", "ECE")
        cls.rahul = student("rahul@t.in", "Rahul Sharma", "24UCC174", "CSE")   # CSE has no labs

    # ── helpers ──────────────────────────────────────────────────────────────────

    def start_request(self, student, clear_tri_gate=True):
        """Initiate through the API, submit intake, and (by default) clear Library/TPC/Warden."""
        r = self.post(student.user, "/api/student/initiate/",
                      {"exit_type": "GRADUATION", "vacant_room_no": "A102"})
        self.assertEqual(r.status_code, 201, r.content)
        req = ClearanceRequest.objects.get(pk=r.json()["request"]["id"])
        req.intake_submitted = True
        req.save(update_fields=["intake_submitted"])
        if clear_tri_gate:
            for code, officer in ((SECTION_LIBRARY, self.library), (SECTION_TPC, self.tpc),
                                  (SECTION_WARDEN, self.warden)):
                engine.approve(self.ss(req, code), officer)
        return req

    def ss(self, req, code):
        return SectionStatus.objects.get(request=req, section__code=code)

    def approve_field_sections(self, req):
        for code in FIELD_SECTIONS:
            engine.approve(self.ss(req, code), self.library)

    def send_refund(self, req):
        refund_service.record(req, self.accounts, amount="10000", mode="NEFT", reference="UTR-TEST-1")

    def ls(self, req, lab):
        return LabStatus.objects.get(request=req, lab=lab)

    def send(self, student):
        return self.post(student.user, "/api/student/labs/send/")

    def lab_decide(self, lab, req, action, reason=None):
        payload = {"request_id": req.id}
        if reason is not None:
            payload["reason"] = reason
        return self.post(lab.user, f"/api/lab/{action}/", payload)

    def hod_approve(self, req, hod=None):
        return self.post(hod or self.hod_ece, "/api/section/approve/", {"request_id": req.id})

    def student_labs(self, student):
        return self.get(student.user, "/api/student/request/").json()["request"]["labs"]

    def clear_all_labs(self, student, req):
        for level_labs in ([self.microwave, self.adc], [self.dsp], [self.be]):
            self.assertEqual(self.send(student).status_code, 200)
            for lab in level_labs:
                self.assertEqual(self.lab_decide(lab, req, "approve").status_code, 200)

    # ── the chain ────────────────────────────────────────────────────────────────

    def test_labs_open_only_after_library_tpc_warden_approve(self):
        req = self.start_request(self.priya, clear_tri_gate=False)
        self.assertEqual(self.send(self.priya).status_code, 409)
        self.assertFalse(LabStatus.objects.filter(request=req).exists())
        self.assertFalse(self.student_labs(self.priya)["can_send"])

    def test_levels_open_in_order_and_hod_approves_last(self):
        req = self.start_request(self.priya)
        labs = self.student_labs(self.priya)
        self.assertTrue(labs["enabled"])
        self.assertFalse(labs["started"])
        self.assertTrue(labs["can_send"])
        self.assertEqual([lv["level"] for lv in labs["levels"]], [1, 2, 3])   # preview

        r = self.send(self.priya)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(sorted(r.json()["sent_to"]), ["ADC Lab", "Microwave Lab"])
        self.assertEqual(LabStatus.objects.filter(request=req).count(), 4)   # whole chain copied
        self.assertIsNone(self.ls(req, self.dsp).sent_at)

        # Level 2 can't be sent — and HOD can't approve — until every level-1 lab approves.
        self.assertEqual(self.send(self.priya).status_code, 409)
        self.assertEqual(self.hod_approve(req).status_code, 409)
        self.assertEqual(self.get(self.dsp.user, "/api/lab/queue/").json()["students"], [])
        self.assertEqual(self.lab_decide(self.dsp, req, "approve").status_code, 404)

        self.assertEqual(self.lab_decide(self.microwave, req, "approve").status_code, 200)
        self.assertEqual(self.send(self.priya).status_code, 409)              # ADC still pending
        self.assertEqual(self.lab_decide(self.adc, req, "approve").status_code, 200)

        self.assertEqual(self.send(self.priya).json()["sent_to"], ["DSP Lab"])
        self.assertEqual(len(self.get(self.dsp.user, "/api/lab/queue/").json()["students"]), 1)
        self.assertEqual(self.lab_decide(self.dsp, req, "approve").status_code, 200)
        self.assertEqual(self.send(self.priya).json()["sent_to"], ["BE Lab"])
        self.assertEqual(self.hod_approve(req).status_code, 409)              # BE still pending
        self.assertEqual(self.lab_decide(self.be, req, "approve").status_code, 200)
        self.assertEqual(self.send(self.priya).status_code, 409)              # nothing left to send

        self.assertEqual(self.hod_approve(req).status_code, 200)
        self.assertEqual(self.ss(req, SECTION_HOD).status, STATUS_APPROVED)
        labs = self.student_labs(self.priya)
        self.assertTrue(labs["cleared"])
        self.assertEqual(labs["approved"], 4)

    def test_lab_cannot_approve_while_an_earlier_level_is_reopened(self):
        req = self.start_request(self.priya)
        self.send(self.priya)
        self.lab_decide(self.microwave, req, "approve")
        self.lab_decide(self.adc, req, "approve")
        self.send(self.priya)                                                 # DSP
        self.assertEqual(self.lab_decide(self.microwave, req, "reject", "Probe not returned").status_code, 200)

        self.assertEqual(self.lab_decide(self.dsp, req, "approve").status_code, 409)
        self.assertEqual(self.ls(req, self.dsp).status, STATUS_PENDING)
        row = self.get(self.dsp.user, "/api/lab/queue/").json()["students"][0]
        self.assertFalse(row["actionable"])

    def test_reopened_lab_resets_later_labs_hod_and_everything_downstream(self):
        req = self.start_request(self.priya)
        self.clear_all_labs(self.priya, req)
        self.assertEqual(self.hod_approve(req).status_code, 200)
        self.approve_field_sections(req)
        engine.approve(self.ss(req, SECTION_ACCOUNTS), self.accounts)
        engine.approve(self.ss(req, SECTION_ADMINISTRATION), self.admin_office)
        self.send_refund(req)
        req.refresh_from_db()
        self.assertEqual(req.overall_status, OVERALL_CLEARED)
        Certificate.objects.create(request=req)

        self.assertEqual(self.lab_decide(self.microwave, req, "reject", "Dues found").status_code, 200)

        self.assertEqual(self.ls(req, self.microwave).status, STATUS_REJECTED)
        self.assertEqual(self.ls(req, self.adc).status, STATUS_APPROVED)      # same level: untouched
        self.assertEqual(self.ls(req, self.dsp).status, STATUS_PENDING)       # later levels reset
        self.assertEqual(self.ls(req, self.be).status, STATUS_PENDING)
        for code in (SECTION_HOD, SECTION_ACCOUNTS, SECTION_ADMINISTRATION):
            self.assertEqual(self.ss(req, code).status, STATUS_PENDING, code)
        req.refresh_from_db()
        self.assertEqual(req.overall_status, OVERALL_IN_PROGRESS)
        self.assertFalse(Certificate.objects.filter(request=req).exists())
        self.assertTrue(Comment.objects.filter(lab_status=self.ls(req, self.dsp), is_system=True).exists())

        # Student sorts it out and re-sends; the reset labs re-approve without being re-sent.
        r = self.post(self.priya.user, "/api/student/labs/resend/", {"lab_id": self.microwave.id})
        self.assertEqual(r.status_code, 200)
        for lab in (self.microwave, self.dsp, self.be):
            self.assertEqual(self.lab_decide(lab, req, "approve").status_code, 200)
        self.assertEqual(self.hod_approve(req).status_code, 200)

    def test_reject_needs_a_reason_and_the_student_can_resend(self):
        req = self.start_request(self.priya)
        self.send(self.priya)
        self.assertEqual(self.lab_decide(self.adc, req, "reject", "   ").status_code, 400)
        self.assertEqual(self.ls(req, self.adc).status, STATUS_PENDING)
        self.assertEqual(self.lab_decide(self.adc, req, "reject", "Multimeter missing").status_code, 200)

        adc = next(e for lv in self.student_labs(self.priya)["levels"] for e in lv["labs"] if e["name"] == "ADC Lab")
        self.assertEqual(adc["status"], STATUS_REJECTED)
        self.assertEqual(adc["reason"], "Multimeter missing")

        self.assertEqual(self.post(self.priya.user, "/api/student/labs/comment/",
                                   {"lab_id": self.adc.id, "body": "Returned it today"}).status_code, 200)
        self.assertEqual(self.post(self.adc.user, "/api/lab/comment/",
                                   {"request_id": req.id, "body": "Received, thanks"}).status_code, 200)
        self.assertEqual(self.post(self.priya.user, "/api/student/labs/resend/", {"lab_id": self.adc.id}).status_code, 200)
        self.assertEqual(self.ls(req, self.adc).status, STATUS_PENDING)
        self.assertEqual(self.post(self.priya.user, "/api/student/labs/resend/", {"lab_id": self.adc.id}).status_code, 409)
        # A lab the request hasn't reached yet can't be messaged.
        self.assertEqual(self.post(self.priya.user, "/api/student/labs/comment/",
                                   {"lab_id": self.dsp.id, "body": "hi"}).status_code, 400)

    def test_hierarchy_changes_do_not_reshuffle_requests_in_progress(self):
        req = self.start_request(self.priya)
        self.send(self.priya)
        self.assertEqual(self.patch(self.hod_ece, f"/api/hod/labs/{self.dsp.id}/", {"level": 1}).status_code, 200)
        r = self.post(self.hod_ece, "/api/hod/labs/",
                      {"name": "VLSI Lab", "email": "vlsi.lab@t.in", "password": LAB_PASSWORD, "level": 1})
        self.assertEqual(r.status_code, 201, r.content)

        self.assertEqual(self.ls(req, self.dsp).level, 2)                     # Priya keeps her chain
        self.assertEqual(LabStatus.objects.filter(request=req).count(), 4)

        self.start_request(self.ravi)                                         # Ravi starts after the change
        self.assertEqual(sorted(self.send(self.ravi).json()["sent_to"]),
                         ["ADC Lab", "DSP Lab", "Microwave Lab", "VLSI Lab"])

    def test_department_without_labs_keeps_the_old_flow(self):
        req = self.start_request(self.rahul)
        self.assertFalse(self.student_labs(self.rahul)["enabled"])
        self.assertEqual(self.send(self.rahul).status_code, 409)
        self.assertEqual(self.hod_approve(req, hod=self.hod_cse).status_code, 200)

    def test_hod_approval_given_before_labs_existed_is_left_alone(self):
        req = self.start_request(self.rahul)
        self.assertEqual(self.hod_approve(req, hod=self.hod_cse).status_code, 200)
        lab_service.create_lab(self.dept["CSE"], name="Systems Lab", email="systems.lab@t.in",
                               password=LAB_PASSWORD, level=1)
        self.assertFalse(self.student_labs(self.rahul)["enabled"])
        self.assertEqual(self.send(self.rahul).status_code, 409)
        self.assertEqual(self.ss(req, SECTION_HOD).status, STATUS_APPROVED)

    # ── who can do what ──────────────────────────────────────────────────────────

    def test_hod_creates_labs_with_working_logins_for_own_department_only(self):
        r = self.post(self.hod_ece, "/api/hod/labs/", {"name": "Optics Lab", "incharge_name": "Ms. Rao",
                                                       "email": "Optics.Lab@T.in", "password": LAB_PASSWORD,
                                                       "level": 2})
        self.assertEqual(r.status_code, 201, r.content)
        self.assertNotIn("password", r.json()["lab"])
        lab = Lab.objects.get(pk=r.json()["lab"]["id"])
        self.assertEqual(lab.user.username, "optics.lab@t.in")
        self.assertEqual(lab.user.profile.role, ROLE_LAB)
        self.assertEqual(lab.user.profile.department.code, "ECE")

        r = self.login("optics.lab@t.in", LAB_PASSWORD, "LAB")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["lab"], "Optics Lab")
        self.assertEqual(self.login("optics.lab@t.in", LAB_PASSWORD, "HOD").status_code, 403)

        for bad in (
            {"name": "optics lab", "email": "x1@t.in", "password": LAB_PASSWORD, "level": 1},  # duplicate name
            {"name": "New Lab", "email": "adc.lab@t.in", "password": LAB_PASSWORD, "level": 1},  # email taken
            {"name": "New Lab", "email": "x2@t.in", "password": "12345678", "level": 1},        # weak password
            {"name": "New Lab", "email": "x3@t.in", "password": LAB_PASSWORD, "level": 0},      # bad level
            {"name": "New Lab", "email": "not-an-email", "password": LAB_PASSWORD, "level": 1},
            {"name": "", "email": "x4@t.in", "password": LAB_PASSWORD, "level": 1},
        ):
            self.assertEqual(self.post(self.hod_ece, "/api/hod/labs/", bad).status_code, 400, bad)

        # Password reset works and the new password is the one that logs in.
        self.assertEqual(self.patch(self.hod_ece, f"/api/hod/labs/{lab.id}/",
                                    {"password": "Brand-New-Pass-77"}).status_code, 200)
        self.assertEqual(self.login("optics.lab@t.in", LAB_PASSWORD, "LAB").status_code, 401)
        self.assertEqual(self.login("optics.lab@t.in", "Brand-New-Pass-77", "LAB").status_code, 200)

        # Another department's HOD can neither see nor touch ECE labs; non-HODs can't manage labs.
        self.assertEqual(self.get(self.hod_cse, "/api/hod/labs/").json()["labs"], [])
        self.assertEqual(self.patch(self.hod_cse, f"/api/hod/labs/{lab.id}/", {"level": 5}).status_code, 404)
        self.assertEqual(self.delete(self.hod_cse, f"/api/hod/labs/{lab.id}/").status_code, 404)
        self.assertEqual(self.get(self.library, "/api/hod/labs/").status_code, 403)
        self.assertEqual(self.get(self.microwave.user, "/api/hod/labs/").status_code, 403)

    def test_lab_sees_only_requests_sent_to_it(self):
        req = self.start_request(self.priya)
        self.send(self.priya)
        rows = self.get(self.microwave.user, "/api/lab/queue/").json()["students"]
        self.assertEqual([r["request_id"] for r in rows], [req.id])
        review = self.get(self.microwave.user, f"/api/lab/review/?request_id={req.id}").json()
        self.assertEqual(review["section"]["name"], "Microwave Lab")
        self.assertEqual([lv["level"] for lv in review["labs"]], [1, 2, 3])
        self.assertEqual(self.get(self.microwave.user, "/api/lab/review/?request_id=abc").status_code, 404)
        # Lab logins and section logins stay on their own endpoints.
        self.assertEqual(self.get(self.microwave.user, "/api/section/queue/").status_code, 403)
        self.assertEqual(self.get(self.library, "/api/lab/queue/").status_code, 403)

    def test_hod_queue_and_review_show_lab_progress(self):
        req = self.start_request(self.priya)
        row = next(r for r in self.get(self.hod_ece, "/api/section/queue/").json()["students"]
                   if r["request_id"] == req.id)
        self.assertEqual(row["labs"], {"total": 0, "approved": 0, "started": False, "cleared": False})
        self.assertFalse(row["actionable"])

        self.send(self.priya)
        self.lab_decide(self.microwave, req, "approve")
        row = next(r for r in self.get(self.hod_ece, "/api/section/queue/").json()["students"]
                   if r["request_id"] == req.id)
        self.assertEqual(row["labs"], {"total": 4, "approved": 1, "started": True, "cleared": False})
        review = self.get(self.hod_ece, f"/api/section/review/?request_id={req.id}").json()
        microwave = next(e for e in review["labs"][0]["labs"] if e["name"] == "Microwave Lab")
        self.assertEqual(microwave["decided_by"], "microwave.lab@t.in")

    def test_removing_a_lab_releases_students_waiting_on_it(self):
        req = self.start_request(self.priya)
        self.send(self.priya)
        self.lab_decide(self.adc, req, "approve")

        # Microwave only ever had a pending request -> removed outright, login deleted.
        r = self.delete(self.hod_ece, f"/api/hod/labs/{self.microwave.id}/")
        self.assertEqual(r.json(), {"ok": True, "outcome": "deleted", "released": 1})
        self.assertFalse(User.objects.filter(username="microwave.lab@t.in").exists())
        self.assertTrue(Comment.objects.filter(section_status=self.ss(req, SECTION_HOD), is_system=True).exists())
        self.assertEqual(self.send(self.priya).json()["sent_to"], ["DSP Lab"])   # level 1 = ADC, approved

        # ADC has an approval on record -> kept, but deactivated with its login disabled.
        self.assertEqual(self.delete(self.hod_ece, f"/api/hod/labs/{self.adc.id}/").json()["outcome"], "deactivated")
        self.adc.refresh_from_db()
        self.adc.user.refresh_from_db()
        self.assertFalse(self.adc.is_active)
        self.assertFalse(self.adc.user.is_active)
        self.assertEqual(self.ls(req, self.adc).status, STATUS_APPROVED)
        self.assertEqual(self.login("adc.lab@t.in", LAB_PASSWORD, "LAB").status_code, 401)

        # The HOD can bring it back.
        self.assertEqual(self.patch(self.hod_ece, f"/api/hod/labs/{self.adc.id}/", {"is_active": True}).status_code, 200)
        self.assertEqual(self.login("adc.lab@t.in", LAB_PASSWORD, "LAB").status_code, 200)

    def test_certificate_lists_lab_approvals(self):
        req = self.start_request(self.priya)
        self.clear_all_labs(self.priya, req)
        self.hod_approve(req)
        self.approve_field_sections(req)
        engine.approve(self.ss(req, SECTION_ACCOUNTS), self.accounts)
        engine.approve(self.ss(req, SECTION_ADMINISTRATION), self.admin_office)
        self.send_refund(req)
        cert = self.post(self.priya.user, "/api/student/certificate/").json()["certificate"]
        self.assertEqual([lab["name"] for lab in cert["labs"]], ["ADC Lab", "Microwave Lab", "DSP Lab", "BE Lab"])
        self.assertEqual(cert["labs"][0]["approved_by"], "adc.lab@t.in")


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class LibraryStaffTests(ApiHelpers, TestCase):
    """library@ (the head) sends requests to staff it manages; staff decide them."""

    @classmethod
    def setUpTestData(cls):
        cls.dept = {c: Department.objects.create(code=c) for c in DEPARTMENT_CODES}
        cls.hostel = {c: Hostel.objects.create(code=c) for c in HOSTEL_CODES}
        for code, name, order, upload, consolidator in SECTION_DEFS:
            Section.objects.create(code=code, name=name, order=order,
                                   is_upload_section=upload, is_consolidator=consolidator)

        def officer(username, role):
            user = User.objects.create_user(username, password="x")
            UserProfile.objects.create(user=user, role=role)
            return user

        cls.head = officer("library@t.in", SECTION_LIBRARY)
        cls.tpc = officer("tpc@t.in", SECTION_TPC)
        # Staff added the way the head adds them, so their logins are real ones.
        cls.anita = staff_service.create_staff(cls.head.profile, name="Anita Rao", email="anita@t.in",
                                               password=STAFF_PASSWORD).user
        cls.vikram = staff_service.create_staff(cls.head.profile, name="Vikram Jain", email="vikram@t.in",
                                                password=STAFF_PASSWORD).user

        def request_for(i, ready):
            user = User.objects.create_user(f"stu{i}@t.in", password="x")
            UserProfile.objects.create(user=user, role="STUDENT")
            student = Student.objects.create(user=user, name=f"Student {i}", roll_no=f"25UCS{i:03d}",
                                             department=cls.dept["CSE"], hostel=cls.hostel["BH1"],
                                             webmail=user.username)
            req = ClearanceRequest.objects.create(student=student, exit_type="GRADUATION",
                                                  vacant_room_no="A102", intake_submitted=ready)
            for code in engine.required_sections("GRADUATION"):
                SectionStatus.objects.create(request=req, section=Section.objects.get(code=code),
                                             student_confirmed=code not in BASIC_CONFIRM_SECTIONS)
            return req

        cls.ready = [request_for(i, ready=True) for i in range(6)]      # oldest first
        cls.not_ready = request_for(99, ready=False)                     # Page 1 not submitted

    def lib(self, req):
        return SectionStatus.objects.get(request=req, section__code=SECTION_LIBRARY)

    def queue(self, user):
        return self.get(user, "/api/section/queue/").json()

    def send(self, count, to):
        return self.post(self.head, "/api/section/assign/", {"staff_id": to.id, "count": count})

    def test_every_request_reaches_the_head_first(self):
        q = self.queue(self.head)
        self.assertTrue(q["can_manage_staff"])
        self.assertEqual(len(q["students"]), 7)
        self.assertEqual(q["ready_to_assign"], 6)
        self.assertEqual(sorted(s["name"] for s in q["staff"]), ["Anita Rao", "Vikram Jain"])
        self.assertTrue(all(row["assigned_to"] is None for row in q["students"]))

        staff_q = self.queue(self.anita)
        self.assertEqual(staff_q["students"], [])
        self.assertNotIn("can_manage_staff", staff_q)
        req = self.ready[0]
        self.assertEqual(self.post(self.anita, "/api/section/approve/", {"request_id": req.id}).status_code, 403)
        self.assertEqual(self.get(self.anita, f"/api/section/review/?request_id={req.id}").status_code, 403)
        self.assertEqual(self.post(self.anita, "/api/section/comment/",
                                   {"request_id": req.id, "body": "hi"}).status_code, 403)
        self.assertEqual(self.lib(req).status, STATUS_PENDING)

    def test_send_next_n_gives_the_oldest_ready_requests(self):
        r = self.send(4, self.anita)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()["moved"], 4)
        self.assertEqual(r.json()["to"]["name"], "Anita Rao")
        mine = sorted(row["request_id"] for row in self.queue(self.anita)["students"])
        self.assertEqual(mine, sorted(req.id for req in self.ready[:4]))
        self.assertEqual(self.queue(self.head)["ready_to_assign"], 2)

        # Asking for more than are waiting sends what's there — never an unready one.
        self.assertEqual(self.send(35, self.vikram).json()["moved"], 2)
        self.assertIsNone(self.lib(self.not_ready).assigned_to)
        self.assertEqual(self.send(5, self.vikram).json()["moved"], 0)

        self.assertEqual(self.send(0, self.anita).status_code, 400)
        self.assertEqual(self.post(self.head, "/api/section/assign/",
                                   {"staff_id": self.tpc.id, "count": 3}).status_code, 400)   # not their staff

    def test_staff_decision_is_final_and_only_on_their_own_requests(self):
        self.send(2, self.anita)
        first, second = self.ready[0], self.ready[1]
        self.assertEqual(self.post(self.anita, "/api/section/approve/", {"request_id": first.id}).status_code, 200)
        self.assertEqual(self.lib(first).status, STATUS_APPROVED)
        self.assertEqual(self.lib(first).decided_by, self.anita)

        self.assertEqual(self.post(self.anita, "/api/section/reject/",
                                   {"request_id": second.id, "reason": "  "}).status_code, 400)
        self.assertEqual(self.post(self.anita, "/api/section/reject/",
                                   {"request_id": second.id, "reason": "Library fine pending"}).status_code, 200)
        self.assertEqual(self.lib(second).status, STATUS_REJECTED)
        self.assertEqual(self.post(self.vikram, "/api/section/approve/", {"request_id": second.id}).status_code, 403)

    def test_head_moves_takes_back_and_can_still_decide_anything(self):
        self.send(2, self.anita)
        first, second = self.ready[0], self.ready[1]
        r = self.post(self.head, "/api/section/assign/", {"request_ids": [first.id], "staff_id": self.vikram.id})
        self.assertEqual(r.json()["moved"], 1)
        self.assertEqual(self.lib(first).assigned_to, self.vikram)
        r = self.post(self.head, "/api/section/assign/", {"request_ids": [first.id], "staff_id": None})
        self.assertEqual(r.json()["moved"], 1)
        self.assertIsNone(self.lib(first).assigned_to)

        self.assertEqual(self.post(self.head, "/api/section/approve/", {"request_id": second.id}).status_code, 200)
        self.assertEqual(self.lib(second).decided_by, self.head)

    def test_only_the_library_head_manages_staff(self):
        r = self.post(self.head, "/api/section/staff/",
                      {"name": "Meera Das", "email": "Meera@T.in", "password": STAFF_PASSWORD})
        self.assertEqual(r.status_code, 201, r.content)
        self.assertNotIn("password", r.json()["staff"])
        meera = User.objects.get(username="meera@t.in")
        self.assertEqual(meera.profile.role, SECTION_LIBRARY)
        self.assertEqual(meera.profile.managed_by, self.head)
        self.assertEqual(self.login("meera@t.in", STAFF_PASSWORD, "LIBRARY").status_code, 200)

        for bad in (
            {"name": "X", "email": "anita@t.in", "password": STAFF_PASSWORD},   # email taken
            {"name": "X", "email": "x@t.in", "password": "12345678"},           # weak password
            {"name": "", "email": "y@t.in", "password": STAFF_PASSWORD},         # no name
        ):
            self.assertEqual(self.post(self.head, "/api/section/staff/", bad).status_code, 400, bad)

        for user in (self.anita, self.tpc):                                    # staff, other sections
            self.assertEqual(self.get(user, "/api/section/staff/").status_code, 403)
            self.assertEqual(self.post(user, "/api/section/assign/",
                                       {"staff_id": self.vikram.id, "count": 1}).status_code, 403)
            self.assertEqual(self.delete(user, f"/api/section/staff/{self.vikram.id}/").status_code, 403)
        self.assertNotIn("can_manage_staff", self.queue(self.tpc))

    def test_removing_staff_hands_their_open_requests_back(self):
        self.send(3, self.anita)
        approved = self.ready[0]
        self.post(self.anita, "/api/section/approve/", {"request_id": approved.id})

        r = self.delete(self.head, f"/api/section/staff/{self.anita.id}/")
        self.assertEqual(r.json(), {"ok": True, "outcome": "deactivated", "returned": 2})
        self.assertEqual(self.lib(approved).assigned_to, self.anita)          # her decision stays on record
        self.assertEqual(self.queue(self.head)["ready_to_assign"], 5)
        self.assertEqual(self.login("anita@t.in", STAFF_PASSWORD, "LIBRARY").status_code, 401)

        # Vikram never handled anything -> his login is deleted outright.
        self.assertEqual(self.delete(self.head, f"/api/section/staff/{self.vikram.id}/").json()["outcome"], "deleted")
        self.assertFalse(User.objects.filter(username="vikram@t.in").exists())

        self.assertEqual(self.patch(self.head, f"/api/section/staff/{self.anita.id}/",
                                    {"is_active": True}).status_code, 200)
        self.assertEqual(self.login("anita@t.in", STAFF_PASSWORD, "LIBRARY").status_code, 200)

    def test_resubmission_after_rejection_goes_back_to_the_same_staff_member(self):
        self.send(1, self.anita)
        req = self.ready[0]
        self.post(self.anita, "/api/section/reject/", {"request_id": req.id, "reason": "Wrong form"})
        with tempfile.TemporaryDirectory() as media, self.settings(MEDIA_ROOT=media):
            self.client.force_login(req.student.user)
            r = self.client.post("/api/student/upload/", {
                "section": SECTION_LIBRARY,
                "file": SimpleUploadedFile("btp.pdf", b"%PDF-1.4 demo", content_type="application/pdf"),
            })
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.lib(req).status, STATUS_PENDING)
        self.assertEqual(self.lib(req).assigned_to, self.anita)
        waiting = [row["request_id"] for row in self.queue(self.anita)["students"] if row["status"] == STATUS_PENDING]
        self.assertEqual(waiting, [req.id])


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class LucsNadStaffTests(ApiHelpers, TestCase):
    """The same head/staff desk for LUCS and NAD Cell. Both are confirm-only
    sections, so a request only waits at the desk once the student has clicked
    "Confirm & Send" for it."""

    @classmethod
    def setUpTestData(cls):
        cls.dept = {c: Department.objects.create(code=c) for c in DEPARTMENT_CODES}
        cls.hostel = {c: Hostel.objects.create(code=c) for c in HOSTEL_CODES}
        for code, name, order, upload, consolidator in SECTION_DEFS:
            Section.objects.create(code=code, name=name, order=order,
                                   is_upload_section=upload, is_consolidator=consolidator)

        def officer(username, role):
            user = User.objects.create_user(username, password="x")
            UserProfile.objects.create(user=user, role=role)
            return user

        cls.heads = {SECTION_LUCS: officer("lucs@t.in", SECTION_LUCS),
                     SECTION_NAD: officer("nad@t.in", SECTION_NAD)}
        cls.library = officer("library@t.in", SECTION_LIBRARY)

        def request_for(i, confirmed):
            user = User.objects.create_user(f"stu{i}@t.in", password="x")
            UserProfile.objects.create(user=user, role="STUDENT")
            student = Student.objects.create(user=user, name=f"Student {i}", roll_no=f"25UCS{i:03d}",
                                             department=cls.dept["CSE"], hostel=cls.hostel["BH1"],
                                             webmail=user.username)
            req = ClearanceRequest.objects.create(student=student, exit_type="GRADUATION",
                                                  vacant_room_no="A102", intake_submitted=True)
            for code in engine.required_sections("GRADUATION"):
                SectionStatus.objects.create(request=req, section=Section.objects.get(code=code),
                                             student_confirmed=code not in BASIC_CONFIRM_SECTIONS or confirmed)
            return req

        # Three students confirmed LUCS + NAD ("Confirm & Send"); the fourth hasn't yet.
        cls.requests = [request_for(i, confirmed=i < 3) for i in range(4)]

    def test_lucs_and_nad_heads_send_confirmed_requests_to_their_own_staff(self):
        for code, head in self.heads.items():
            with self.subTest(section=code):
                email = f"{code.lower()}.helper@t.in"
                r = self.post(head, "/api/section/staff/", {"name": f"{code} Helper", "email": email,
                                                            "password": STAFF_PASSWORD})
                self.assertEqual(r.status_code, 201, r.content)
                helper = User.objects.get(username=email)
                self.assertEqual(helper.profile.role, code)                     # signs in as that section
                self.assertEqual(self.login(email, STAFF_PASSWORD, code).status_code, 200)

                q = self.get(head, "/api/section/queue/").json()
                self.assertTrue(q["can_manage_staff"])
                self.assertEqual(len(q["students"]), 3)                          # unconfirmed one isn't here
                self.assertEqual(q["ready_to_assign"], 3)
                self.assertEqual(self.post(head, "/api/section/assign/",
                                           {"staff_id": helper.id, "count": 35}).json()["moved"], 3)

                mine = self.get(helper, "/api/section/queue/").json()["students"]
                self.assertEqual(len(mine), 3)
                first = mine[0]["request_id"]
                self.assertEqual(self.post(helper, "/api/section/approve/", {"request_id": first}).status_code, 200)
                decided = SectionStatus.objects.get(request_id=first, section__code=code)
                self.assertEqual((decided.status, decided.decided_by), (STATUS_APPROVED, helper))
                unconfirmed = SectionStatus.objects.get(request=self.requests[3], section__code=code)
                self.assertIsNone(unconfirmed.assigned_to)

    def test_each_head_manages_only_its_own_staff(self):
        lucs_helper = staff_service.create_staff(self.heads[SECTION_LUCS].profile, name="LUCS Helper",
                                                 email="lucs.helper@t.in", password=STAFF_PASSWORD).user
        nad_head = self.heads[SECTION_NAD]
        self.assertEqual(self.get(nad_head, "/api/section/staff/").json()["staff"], [])
        self.assertEqual(self.patch(nad_head, f"/api/section/staff/{lucs_helper.id}/", {"name": "X"}).status_code, 404)
        self.assertEqual(self.delete(nad_head, f"/api/section/staff/{lucs_helper.id}/").status_code, 404)
        for other_head in (nad_head, self.library):        # can't send work to someone else's staff
            self.assertEqual(self.post(other_head, "/api/section/assign/",
                                       {"staff_id": lucs_helper.id, "count": 1}).status_code, 400)
        self.assertEqual(self.get(lucs_helper, "/api/section/staff/").status_code, 403)
        self.assertEqual(self.login("lucs.helper@t.in", STAFF_PASSWORD, "NAD").status_code, 403)   # LUCS login


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class AccountsLevelsTests(ApiHelpers, TestCase):
    """accounts@ puts its staff on levels; a ready request moves up them by itself,
    then comes to accounts@, always the final step. Level 1: Clerk · level 2:
    Assistant A or B (either is enough) · level 3: Officer · then accounts@."""

    @classmethod
    def setUpTestData(cls):
        cls.dept = {c: Department.objects.create(code=c) for c in DEPARTMENT_CODES}
        cls.hostel = {c: Hostel.objects.create(code=c) for c in HOSTEL_CODES}
        for code, name, order, upload, consolidator in SECTION_DEFS:
            Section.objects.create(code=code, name=name, order=order,
                                   is_upload_section=upload, is_consolidator=consolidator)

        def officer(username, role, hostel=None, dept=None):
            user = User.objects.create_user(username, password="x")
            UserProfile.objects.create(user=user, role=role, hostel=cls.hostel.get(hostel),
                                       department=cls.dept.get(dept))
            return user

        cls.library = officer("library@t.in", SECTION_LIBRARY)
        cls.tpc = officer("tpc@t.in", SECTION_TPC)
        cls.warden = officer("warden.bh1@t.in", SECTION_WARDEN, hostel="BH1")
        cls.hod = officer("hod.cse@t.in", SECTION_HOD, dept="CSE")
        cls.head = officer("accounts@t.in", SECTION_ACCOUNTS)

        def staff(name, email, level):
            return staff_service.create_staff(cls.head.profile, name=name, email=email,
                                              password=STAFF_PASSWORD, level=level).user

        cls.clerk = staff("Clerk", "clerk@t.in", 1)
        cls.asst_a = staff("Assistant A", "a@t.in", 2)
        cls.asst_b = staff("Assistant B", "b@t.in", 2)
        cls.officer_ = staff("Officer", "officer@t.in", 3)

        def request_for(i, prereqs=True, cheque=True):
            user = User.objects.create_user(f"stu{i}@t.in", password="x")
            UserProfile.objects.create(user=user, role="STUDENT")
            student = Student.objects.create(user=user, name=f"Student {i}", roll_no=f"25UCS{i:03d}",
                                             department=cls.dept["CSE"], hostel=cls.hostel["BH1"],
                                             webmail=user.username)
            req = ClearanceRequest.objects.create(student=student, exit_type="GRADUATION",
                                                  vacant_room_no="A102", intake_submitted=True)
            for code in engine.required_sections("GRADUATION"):
                SectionStatus.objects.create(request=req, section=Section.objects.get(code=code),
                                             student_confirmed=code not in BASIC_CONFIRM_SECTIONS)
            if prereqs:
                for code, who in ((SECTION_LIBRARY, cls.library), (SECTION_TPC, cls.tpc),
                                  (SECTION_WARDEN, cls.warden), (SECTION_HOD, cls.hod)):
                    engine.approve(SectionStatus.objects.get(request=req, section__code=code), who)
            if cheque:
                Document.objects.create(
                    section_status=SectionStatus.objects.get(request=req, section__code=SECTION_ACCOUNTS),
                    ocr_fields={"review": {"account_no": "123"}, "confirmed": True})
            return req

        cls.ready = [request_for(i) for i in range(3)]
        cls.no_cheque = request_for(10, cheque=False)          # student hasn't confirmed cheque details
        cls.prereqs_pending = request_for(11, prereqs=False)   # Library/TPC/Warden/HOD not approved

    def acc(self, req):
        return SectionStatus.objects.get(request=req, section__code=SECTION_ACCOUNTS)

    def incoming(self, user):
        return [r["request_id"] for r in self.get(user, "/api/section/queue/").json()["students"]
                if r["status"] == STATUS_PENDING]

    def approve(self, user, req, level=None):
        body = {"request_id": req.id}
        if level is not None:
            body["level"] = level
        return self.post(user, "/api/section/approve/", body)

    def test_request_moves_up_the_levels_then_the_main_account_approves_last(self):
        req = self.ready[0]
        self.assertIn(req.id, self.incoming(self.clerk))
        for user in (self.asst_a, self.asst_b, self.officer_):
            self.assertNotIn(req.id, self.incoming(user))
        row = next(r for r in self.get(self.head, "/api/section/queue/").json()["students"] if r["request_id"] == req.id)
        self.assertEqual((row["stage"]["levels"], row["stage"]["current"], row["stage"]["waiting_on"]),
                         ([1, 2, 3], 1, ["Clerk"]))

        self.assertEqual(self.approve(self.clerk, req).status_code, 200)
        self.assertEqual(self.acc(req).status, STATUS_PENDING)
        self.assertIn(req.id, self.incoming(self.asst_a))                    # level 2: both see it
        self.assertIn(req.id, self.incoming(self.asst_b))
        self.assertNotIn(req.id, self.incoming(self.clerk))

        self.assertEqual(self.approve(self.asst_b, req).status_code, 200)   # either one is enough
        self.assertNotIn(req.id, self.incoming(self.asst_a))
        self.assertEqual(self.approve(self.asst_a, req).status_code, 403)
        self.assertIn(req.id, self.incoming(self.officer_))

        self.assertEqual(self.approve(self.officer_, req).status_code, 200)
        self.assertEqual(self.acc(req).status, STATUS_PENDING)               # the last level isn't final ...
        stage = self.head_row(req)["stage"]
        self.assertEqual((stage["current"], stage["final"]), (None, True))   # ... it's with accounts@ now
        self.assertEqual(self.approve(self.officer_, req).status_code, 403)
        mine = {r["request_id"]: r["status"] for r in self.get(self.clerk, "/api/section/queue/").json()["students"]}
        self.assertEqual(mine[req.id], STATUS_APPROVED)                       # in the clerk's Approved tab

        self.assertEqual(self.approve(self.head, req).status_code, 200)     # the final approval
        acc = self.acc(req)
        self.assertEqual((acc.status, acc.decided_by), (STATUS_APPROVED, self.head))
        self.assertEqual([(a.level, a.approved_by) for a in acc.stage_approvals.all()],
                         [(1, self.clerk), (2, self.asst_b), (3, self.officer_)])

    def test_staff_act_only_at_their_own_level(self):
        req = self.ready[1]
        self.assertEqual(self.approve(self.asst_a, req).status_code, 403)    # still at level 1
        self.assertEqual(self.get(self.officer_, f"/api/section/review/?request_id={req.id}").status_code, 403)
        self.assertEqual(self.approve(self.clerk, req).status_code, 200)
        self.assertEqual(self.approve(self.clerk, req).status_code, 403)     # it has moved on
        self.assertEqual(self.get(self.clerk, f"/api/section/review/?request_id={req.id}").status_code, 200)
        stage = self.get(self.asst_a, f"/api/section/review/?request_id={req.id}").json()["stage"]
        self.assertEqual((stage["current"], stage["approved"][0]["by"]), (2, "Clerk"))

    def test_requests_not_ready_yet_stay_with_the_head(self):
        for req in (self.no_cheque, self.prereqs_pending):
            for user in (self.clerk, self.asst_a, self.officer_):
                self.assertNotIn(req.id, self.incoming(user))
        rows = {r["request_id"]: r for r in self.get(self.head, "/api/section/queue/").json()["students"]}
        self.assertEqual(len(rows), 5)
        for req in (self.no_cheque, self.prereqs_pending):
            self.assertIsNone(rows[req.id]["stage"]["current"])
            self.assertFalse(rows[req.id]["stage"]["ready"])
        self.assertTrue(rows[self.ready[0].id]["stage"]["ready"])
        # The head is told what each one still waits on, and can't approve it yet.
        self.assertEqual(rows[self.prereqs_pending.id]["stage"]["blocked_by"], ["Library", "TPC", "Warden", "HOD"])
        self.assertEqual(rows[self.no_cheque.id]["stage"]["blocked_by"], [])      # the cheque details
        self.assertEqual(rows[self.ready[0].id]["stage"]["blocked_by"], [])
        r = self.approve(self.head, self.prereqs_pending)
        self.assertEqual(r.status_code, 409)
        self.assertIn("Library, TPC, Warden, HOD", r.json()["detail"])
        r = self.approve(self.head, self.no_cheque)
        self.assertEqual(r.status_code, 409)
        self.assertIn("cheque details", r.json()["detail"])
        self.assertEqual(self.acc(self.no_cheque).status, STATUS_PENDING)

    def test_after_a_rejection_the_fix_returns_to_the_level_that_rejected(self):
        req = self.ready[0]
        self.approve(self.clerk, req)
        r = self.post(self.asst_a, "/api/section/reject/", {"request_id": req.id, "reason": "IFSC doesn't match the cheque"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(self.acc(req).status, STATUS_REJECTED)

        with tempfile.TemporaryDirectory() as media, self.settings(MEDIA_ROOT=media):
            self.client.force_login(req.student.user)
            r = self.client.post("/api/student/upload/", {
                "section": SECTION_ACCOUNTS,
                "file": SimpleUploadedFile("cheque.pdf", b"%PDF-1.4 demo", content_type="application/pdf"),
            })
            self.assertEqual(r.status_code, 200, r.content)
            self.assertNotIn(req.id, self.incoming(self.asst_a))             # new cheque not confirmed yet
            self.client.force_login(req.student.user)
            r = self.client.post("/api/student/confirm-review/", content_type="application/json",
                                 data=json.dumps({"section": SECTION_ACCOUNTS, "review": {"account_no": "456"}}))
            self.assertEqual(r.status_code, 200)
            self.assertIn(req.id, self.incoming(self.asst_a))                # back at level 2 ...
            self.assertNotIn(req.id, self.incoming(self.clerk))              # ... not level 1
            self.assertEqual(self.acc(req).stage_approvals.count(), 1)       # the clerk's approval stays

            # Bank details are sensitive: only staff the request has reached may download them.
            cheque = Document.objects.filter(section_status=self.acc(req)).exclude(file="").get()
            url = f"/api/document/{cheque.id}/download/"
            self.assertEqual(self.get(self.officer_, url).status_code, 403)
            response = self.get(self.asst_a, url)
            self.assertEqual(response.status_code, 200)
            # Read it through so the test client closes the file (and only the file).
            self.assertTrue(b"".join(response.streaming_content).startswith(b"%PDF"))

    def test_head_stands_in_for_the_level_a_request_is_at(self):
        req = self.ready[2]
        # Standing in means naming the level seen on the desk — never a blind approve.
        self.assertEqual(self.approve(self.head, req).status_code, 409)
        self.assertEqual(self.approve(self.head, req, level=2).status_code, 409)   # it's at level 1
        self.assertEqual(self.approve(self.head, req, level="two").status_code, 400)
        self.assertIn(req.id, self.incoming(self.clerk))                     # still with level 1

        self.assertEqual(self.approve(self.head, req, level=1).status_code, 200)
        self.assertEqual(self.acc(req).status, STATUS_PENDING)               # one step only ...
        self.assertNotIn(req.id, self.incoming(self.clerk))
        self.assertIn(req.id, self.incoming(self.asst_a))                    # ... now at level 2
        r = self.approve(self.head, req, level=1)                            # a stale click
        self.assertEqual(r.status_code, 409)
        self.assertIn("moved on to Level 2", r.json()["detail"])

        self.assertEqual(self.approve(self.asst_b, req).status_code, 200)    # staff carry on
        self.assertEqual(self.approve(self.head, req, level=3).status_code, 200)   # the last level
        acc = self.acc(req)
        self.assertEqual((acc.status, acc.decided_by), (STATUS_APPROVED, self.head))
        self.assertEqual([(a.level, a.approved_by) for a in acc.stage_approvals.all()],
                         [(1, self.head), (2, self.asst_b), (3, self.head)])

    def test_head_sets_the_levels(self):
        r = self.post(self.head, "/api/section/staff/",
                      {"name": "Deputy", "email": "deputy@t.in", "password": STAFF_PASSWORD, "level": 4})
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()["staff"]["level"], 4)
        self.assertEqual(self.post(self.head, "/api/section/staff/",
                                   {"name": "X", "email": "x@t.in", "password": STAFF_PASSWORD, "level": 0}).status_code, 400)
        self.assertEqual(self.patch(self.head, f"/api/section/staff/{self.asst_b.id}/", {"level": 3}).status_code, 200)
        q = self.get(self.head, "/api/section/queue/").json()
        self.assertEqual(q["staff_mode"], "levels")
        self.assertEqual({s["name"]: s["level"] for s in q["staff"]}["Assistant B"], 3)
        # Accounts work isn't sent by hand, and staff can't manage staff.
        self.assertEqual(self.post(self.head, "/api/section/assign/", {"staff_id": self.clerk.id, "count": 5}).status_code, 400)
        self.assertEqual(self.get(self.clerk, "/api/section/staff/").status_code, 403)

    def test_reopened_accounts_goes_through_the_levels_again(self):
        req = self.ready[0]
        for user in (self.clerk, self.asst_a, self.officer_, self.head):
            self.assertEqual(self.approve(user, req).status_code, 200)
        self.assertEqual(self.acc(req).status, STATUS_APPROVED)

        library = SectionStatus.objects.get(request=req, section__code=SECTION_LIBRARY)
        engine.reject(library, self.library, "Book not returned")            # upstream reopens
        self.assertEqual(self.acc(req).status, STATUS_PENDING)
        self.assertEqual(self.acc(req).stage_approvals.count(), 0)
        self.assertNotIn(req.id, self.incoming(self.clerk))                  # Library not approved: with the head
        engine.approve(SectionStatus.objects.get(pk=library.pk), self.library)
        self.assertIn(req.id, self.incoming(self.clerk))                     # back to level 1

    def test_head_approves_only_without_staff_or_once_every_level_approved(self):
        req = self.ready[0]
        self.approve(self.clerk, req)
        self.approve(self.asst_a, req)
        # The level-3 officer leaves: levels 1 and 2 have both approved, nobody is left above.
        self.assertEqual(self.delete(self.head, f"/api/section/staff/{self.officer_.id}/").status_code, 200)
        self.assertEqual(self.approve(self.head, req).status_code, 200)
        self.assertEqual(self.acc(req).status, STATUS_APPROVED)
        # With no staff at all, accounts@ approves as it always did.
        for user in (self.clerk, self.asst_a, self.asst_b):
            self.assertEqual(self.delete(self.head, f"/api/section/staff/{user.id}/").status_code, 200)
        self.assertEqual(self.approve(self.head, self.ready[1]).status_code, 200)

    def test_a_level_with_nobody_on_it_is_skipped(self):
        req = self.ready[0]
        self.approve(self.clerk, req)
        for user in (self.asst_a, self.asst_b):
            self.assertEqual(self.delete(self.head, f"/api/section/staff/{user.id}/").status_code, 200)
        self.assertIn(req.id, self.incoming(self.officer_))

    def head_row(self, req):
        return next(r for r in self.get(self.head, "/api/section/queue/").json()["students"]
                    if r["request_id"] == req.id)

    def test_the_main_account_is_always_the_final_step(self):
        panel = lambda: self.get(self.head, "/api/section/staff/").json()   # noqa: E731
        req = self.ready[0]
        self.assertEqual(self.approve(self.head, req).status_code, 409)     # at level 1: it must name it to stand in
        for user in (self.clerk, self.asst_a, self.officer_):
            self.assertEqual(self.approve(user, req).status_code, 200)
        stage = self.head_row(req)["stage"]
        self.assertEqual((stage["levels"], stage["current"], stage["final"]), ([1, 2, 3], None, True))
        self.assertFalse(self.head_row(self.ready[1])["stage"]["final"])   # still at level 1
        self.assertEqual(panel()["head_waiting"], 1)
        r = self.approve(self.head, req, level=3)                          # a stale stand-in click
        self.assertEqual(r.status_code, 409)
        self.assertIn("final approval", r.json()["detail"])
        self.assertEqual(self.approve(self.head, req).status_code, 200)
        self.assertEqual((self.acc(req).status, panel()["head_waiting"]), (STATUS_APPROVED, 0))

    def test_there_is_no_add_me(self):
        self.assertEqual(self.patch(self.head, "/api/section/staff/", {"level": 2}).status_code, 405)
        self.assertNotIn("me", self.get(self.head, "/api/section/staff/").json())
        self.assertNotIn("my_level", self.get(self.head, "/api/section/queue/").json())
        # A level left on the main account's own profile (from the old "Add me") is ignored.
        UserProfile.objects.filter(user=self.head).update(staff_level=2, is_refund_manager=False)
        self.assertEqual(staff_service.chain_names(SECTION_ACCOUNTS),
                         {1: ["Clerk"], 2: ["Assistant A", "Assistant B"], 3: ["Officer"]})
        req = self.ready[0]
        self.approve(self.clerk, req)
        self.assertEqual(self.approve(self.head, req).status_code, 409)     # level 2 isn't its own
        # ... and it sends refunds whatever its own refund-manager flag says.
        self.assertTrue(self.get(self.head, "/api/section/queue/").json()["can_record_refunds"])


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class AdministrationTests(ApiHelpers, TestCase):
    """Administration runs alongside Accounts (both open once Library, TPC, Warden
    and HOD approve). Its staff work by hand, like LUCS and NAD: admin.office@ (the
    head) sends requests to Admin Assistant 1 / 2, whose decision is final. And its
    checklist must be ticked before anyone approves ("Physical ID card submitted")."""

    @classmethod
    def setUpTestData(cls):
        cls.dept = {c: Department.objects.create(code=c) for c in DEPARTMENT_CODES}
        cls.hostel = {c: Hostel.objects.create(code=c) for c in HOSTEL_CODES}
        for code, name, order, upload, consolidator in SECTION_DEFS:
            Section.objects.create(code=code, name=name, order=order,
                                   is_upload_section=upload, is_consolidator=consolidator)
        checklist_service.ensure_defaults(SECTION_ADMINISTRATION)

        def officer(username, role, hostel=None, dept=None):
            user = User.objects.create_user(username, password="x")
            UserProfile.objects.create(user=user, role=role, hostel=cls.hostel.get(hostel),
                                       department=cls.dept.get(dept))
            return user

        cls.library = officer("library@t.in", SECTION_LIBRARY)
        cls.tpc = officer("tpc@t.in", SECTION_TPC)
        cls.warden = officer("warden.bh1@t.in", SECTION_WARDEN, hostel="BH1")
        cls.hod = officer("hod.cse@t.in", SECTION_HOD, dept="CSE")
        cls.accounts = officer("accounts@t.in", SECTION_ACCOUNTS)
        cls.head = officer("admin.office@t.in", SECTION_ADMINISTRATION)
        cls.asst1 = staff_service.create_staff(cls.head.profile, name="Admin Assistant 1", email="asst1@t.in",
                                               password=STAFF_PASSWORD).user
        cls.asst2 = staff_service.create_staff(cls.head.profile, name="Admin Assistant 2", email="asst2@t.in",
                                               password=STAFF_PASSWORD).user

        def request_for(i, prereqs=True):
            user = User.objects.create_user(f"stu{i}@t.in", password="x")
            UserProfile.objects.create(user=user, role="STUDENT")
            student = Student.objects.create(user=user, name=f"Student {i}", roll_no=f"25UCS{i:03d}",
                                             department=cls.dept["CSE"], hostel=cls.hostel["BH1"],
                                             webmail=user.username)
            req = ClearanceRequest.objects.create(student=student, exit_type="GRADUATION",
                                                  vacant_room_no="A102", intake_submitted=True)
            for code in engine.required_sections("GRADUATION"):
                SectionStatus.objects.create(request=req, section=Section.objects.get(code=code),
                                             student_confirmed=True)   # every "Confirm & Send" done
            if prereqs:
                for code, who in ((SECTION_LIBRARY, cls.library), (SECTION_TPC, cls.tpc),
                                  (SECTION_WARDEN, cls.warden), (SECTION_HOD, cls.hod)):
                    engine.approve(SectionStatus.objects.get(request=req, section__code=code), who)
            return req

        cls.req = request_for(1)
        cls.waiting = request_for(2, prereqs=False)   # Library, TPC, Warden, HOD still to approve

    def ss(self, req, code):
        return SectionStatus.objects.get(request=req, section__code=code)

    def incoming(self, user):
        return [r["request_id"] for r in self.get(user, "/api/section/queue/").json()["students"]
                if r["status"] == STATUS_PENDING]

    def approve(self, user, req):
        return self.post(user, "/api/section/approve/", {"request_id": req.id})

    def send(self, staff_user, count=35):
        return self.post(self.head, "/api/section/assign/", {"staff_id": staff_user.id, "count": count})

    def tick(self, user, req, done=True, item=None):
        item = item or checklist_service.items(SECTION_ADMINISTRATION)[0]
        return self.post(user, "/api/section/checklist/tick/",
                         {"request_id": req.id, "item_id": item.id, "done": done})

    def test_administration_opens_alongside_accounts_and_is_sent_by_hand(self):
        # Library, TPC, Warden and HOD approved: both are open; neither waits for the other.
        self.assertTrue(engine.actionable(self.req, SECTION_ACCOUNTS))
        self.assertTrue(engine.actionable(self.req, SECTION_ADMINISTRATION))
        self.assertFalse(engine.actionable(self.waiting, SECTION_ADMINISTRATION))

        q = self.get(self.head, "/api/section/queue/").json()
        self.assertEqual((q["staff_mode"], q["ready_to_assign"]), ("manual", 1))   # only what staff can act on
        self.assertTrue(all("stage" not in r for r in q["students"]))             # no levels here
        self.assertEqual(self.incoming(self.asst1), [])                            # nothing sent yet

        r = self.send(self.asst1)
        self.assertEqual((r.status_code, r.json()["moved"]), (200, 1))   # not the one still waiting on HOD & co.
        self.assertEqual(self.incoming(self.asst1), [self.req.id])
        self.assertEqual(self.incoming(self.asst2), [])

        self.assertEqual(self.tick(self.asst1, self.req).status_code, 200)
        self.assertEqual(self.approve(self.asst1, self.req).status_code, 200)    # staff decision is final
        admin = self.ss(self.req, SECTION_ADMINISTRATION)
        self.assertEqual((admin.status, admin.decided_by), (STATUS_APPROVED, self.asst1))
        self.assertEqual(self.ss(self.req, SECTION_ACCOUNTS).status, STATUS_PENDING)
        self.req.refresh_from_db()
        self.assertEqual(self.req.overall_status, OVERALL_IN_PROGRESS)       # Accounts & the rest still due

        for code in FIELD_SECTIONS:
            engine.approve(self.ss(self.req, code), self.library)
        self.req.refresh_from_db()
        self.assertEqual(self.req.overall_status, OVERALL_IN_PROGRESS)       # Accounts still due
        engine.approve(self.ss(self.req, SECTION_ACCOUNTS), self.accounts)
        self.req.refresh_from_db()
        self.assertEqual(self.req.overall_status, OVERALL_IN_PROGRESS)       # every section approved ...
        self.assertEqual(refund_service.status_for(self.req)["status"], "pending")   # ... refund to send
        refund_service.record(self.req, self.accounts, amount="10000", mode="NEFT", reference="UTR1")
        self.req.refresh_from_db()
        self.assertEqual(self.req.overall_status, OVERALL_CLEARED)

    def test_reopening_accounts_leaves_administration_but_voids_the_certificate(self):
        for code in FIELD_SECTIONS + (SECTION_ACCOUNTS,):
            engine.approve(self.ss(self.req, code), self.library)
        self.tick(self.head, self.req)
        self.assertEqual(self.approve(self.head, self.req).status_code, 200)   # the head decides directly
        refund_service.record(self.req, self.accounts, amount="10000", mode="NEFT", reference="UTR1")
        self.req.refresh_from_db()
        self.assertEqual(self.req.overall_status, OVERALL_CLEARED)
        Certificate.objects.create(request=self.req)

        engine.reject(self.ss(self.req, SECTION_ACCOUNTS), self.accounts, "Wrong IFSC")
        self.assertEqual(self.ss(self.req, SECTION_ADMINISTRATION).status, STATUS_APPROVED)   # side by side
        self.req.refresh_from_db()
        self.assertEqual(self.req.overall_status, OVERALL_IN_PROGRESS)
        self.assertFalse(Certificate.objects.filter(request=self.req).exists())

        engine.reject(self.ss(self.req, SECTION_LIBRARY), self.library, "Book not returned")
        admin = self.ss(self.req, SECTION_ADMINISTRATION)
        self.assertEqual(admin.status, STATUS_PENDING)                       # upstream reopened
        self.assertEqual(checklist_service.missing(admin), [])                # the ID card stays handed in

    def test_checklist_is_ticked_before_anyone_approves(self):
        self.send(self.asst1)
        r = self.approve(self.asst1, self.req)
        self.assertEqual(r.status_code, 409)
        self.assertIn("Physical ID card submitted", r.json()["detail"])
        self.assertEqual(self.approve(self.head, self.req).status_code, 409)         # the head too
        self.assertEqual(self.tick(self.asst2, self.req).status_code, 403)          # not sent to them

        self.assertEqual(self.tick(self.asst1, self.req).status_code, 200)
        row = next(r for r in self.get(self.head, "/api/section/queue/").json()["students"]
                   if r["request_id"] == self.req.id)
        self.assertEqual([(e["label"], e["done"], e["by"]) for e in row["checklist"]],
                         [("Physical ID card submitted", True, "Admin Assistant 1")])

        # The student sees it ticked (and no staff-level details of any section).
        mine = self.get(self.req.student.user, "/api/student/request/").json()["request"]
        admin = next(s for s in mine["sections"] if s["code"] == SECTION_ADMINISTRATION)
        self.assertEqual(admin["checklist"], [{"label": "Physical ID card submitted", "done": True}])
        accounts = next(s for s in mine["sections"] if s["code"] == SECTION_ACCOUNTS)
        self.assertNotIn("checklist", accounts)
        self.assertFalse(any("stage" in s for s in mine["sections"]))

        # A new item applies to requests in progress too.
        r = self.post(self.head, "/api/section/checklist/", {"label": "  Hostel   room key returned "})
        self.assertEqual(r.status_code, 201, r.content)
        key = checklist_service.items(SECTION_ADMINISTRATION)[1]
        self.assertEqual(key.label, "Hostel room key returned")
        self.assertEqual(self.approve(self.asst1, self.req).status_code, 409)
        self.assertEqual(self.tick(self.asst1, self.req, item=key).status_code, 200)
        self.assertEqual(self.approve(self.asst1, self.req).status_code, 200)
        self.assertEqual(self.ss(self.req, SECTION_ADMINISTRATION).status, STATUS_APPROVED)
        self.assertEqual(self.tick(self.head, self.req, done=False).status_code, 400)   # no longer pending

    def test_only_the_head_manages_the_checklist(self):
        self.assertEqual(self.post(self.asst1, "/api/section/checklist/", {"label": "X"}).status_code, 403)
        self.assertEqual(self.post(self.accounts, "/api/section/checklist/", {"label": "X"}).status_code, 403)
        self.assertEqual(self.post(self.head, "/api/section/checklist/", {"label": "   "}).status_code, 400)
        self.assertEqual(self.post(self.head, "/api/section/checklist/",
                                   {"label": "physical id card submitted"}).status_code, 400)   # already there
        card = checklist_service.items(SECTION_ADMINISTRATION)[0]
        self.assertEqual([i["label"] for i in self.get(self.head, "/api/section/staff/").json()["checklist"]],
                         ["Physical ID card submitted"])
        self.assertIsNone(self.get(self.accounts, "/api/section/staff/").json()["checklist"])

        self.tick(self.head, self.req)
        r = self.delete(self.head, f"/api/section/checklist/{card.id}/")
        self.assertEqual((r.status_code, r.json()["outcome"]), (200, "deactivated"))   # its tick stays on record
        self.assertEqual(self.get(self.head, "/api/section/staff/").json()["checklist"], [])
        self.assertEqual(self.delete(self.head, f"/api/section/checklist/{card.id}/").status_code, 404)
        self.assertEqual(self.approve(self.asst1, self.waiting).status_code, 403)   # never sent to them

    def test_administration_staff_open_documents_only_of_requests_sent_to_them(self):
        with tempfile.TemporaryDirectory() as media, self.settings(MEDIA_ROOT=media):
            cheque = Document.objects.create(
                section_status=self.ss(self.req, SECTION_ACCOUNTS), original_name="cheque.pdf",
                file=SimpleUploadedFile("cheque.pdf", b"%PDF-1.4 demo", content_type="application/pdf"))
            url = f"/api/document/{cheque.id}/download/"
            self.assertEqual(self.get(self.asst1, url).status_code, 403)   # still with the head
            self.send(self.asst1)
            self.assertEqual(self.get(self.asst2, url).status_code, 403)   # sent to someone else
            for user in (self.asst1, self.head):
                response = self.get(user, url)
                self.assertEqual(response.status_code, 200)
                self.assertTrue(b"".join(response.streaming_content).startswith(b"%PDF"))


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class RefundTests(ApiHelpers, TestCase):
    """Once every section has approved, Accounts sends the student's refund and
    records it (amount, mode, UTR, date): always accounts@, plus any staff it made
    refund managers. Only then is the request cleared and the certificate
    unlocked; the student is told on their dashboard and in their Accounts thread."""

    @classmethod
    def setUpTestData(cls):
        cls.dept = {c: Department.objects.create(code=c) for c in DEPARTMENT_CODES}
        cls.hostel = {c: Hostel.objects.create(code=c) for c in HOSTEL_CODES}
        for code, name, order, upload, consolidator in SECTION_DEFS:
            Section.objects.create(code=code, name=name, order=order,
                                   is_upload_section=upload, is_consolidator=consolidator)

        def officer(username, role):
            user = User.objects.create_user(username, password="x")
            UserProfile.objects.create(user=user, role=role)
            return user

        cls.officer = officer("library@t.in", SECTION_LIBRARY)   # approves sections through the engine
        cls.head = officer("accounts@t.in", SECTION_ACCOUNTS)
        cls.clerk = staff_service.create_staff(cls.head.profile, name="Clerk", email="clerk@t.in",
                                               password=STAFF_PASSWORD, level=1).user
        cls.officer_ = staff_service.create_staff(cls.head.profile, name="Officer", email="officer@t.in",
                                                  password=STAFF_PASSWORD, level=2).user   # the last level
        cls.admin_office = officer("admin.office@t.in", SECTION_ADMINISTRATION)

        user = User.objects.create_user("stu@t.in", password="x")
        UserProfile.objects.create(user=user, role="STUDENT")
        student = Student.objects.create(user=user, name="Student One", roll_no="25UCS001",
                                         department=cls.dept["CSE"], hostel=cls.hostel["BH1"],
                                         webmail=user.username)
        cls.student = user
        cls.req = ClearanceRequest.objects.create(student=student, exit_type="GRADUATION", vacant_room_no="A102",
                                                  intake_submitted=True, fund_us_amount=1000)
        for code in engine.required_sections("GRADUATION"):
            SectionStatus.objects.create(request=cls.req, section=Section.objects.get(code=code),
                                         student_confirmed=True)
        Document.objects.create(
            section_status=SectionStatus.objects.get(request=cls.req, section__code=SECTION_ACCOUNTS),
            ocr_fields={"review": {"account_holder": "Student One", "account_no": "50100000001",
                                   "ifsc": "SBIN0000001", "bank_name": "State Bank of India"},
                        "confirmed": True})

    def ss(self, code):
        return SectionStatus.objects.get(request=self.req, section__code=code)

    def approve_all(self, skip=()):
        last = (SECTION_ACCOUNTS, SECTION_ADMINISTRATION)   # these wait for Library, TPC, Warden, HOD
        for code in sorted(engine.required_sections("GRADUATION"), key=lambda c: c in last):
            if code not in skip:
                engine.approve(self.ss(code), self.officer)

    def refunds(self, user=None):
        return self.get(user or self.head, "/api/accounts/refunds/")

    def send(self, user=None, **body):
        return self.post(user or self.head, "/api/accounts/refunds/", {"request_id": self.req.id, **body})

    def desk(self, user):
        return self.get(user, "/api/section/queue/").json()

    def mine(self):
        return self.get(self.student, "/api/student/request/").json()["request"]

    def overall(self):
        self.req.refresh_from_db()
        return self.req.overall_status

    def test_certificate_unlocks_only_after_the_refund_is_sent(self):
        self.approve_all()
        self.assertEqual(self.overall(), OVERALL_IN_PROGRESS)   # every section approved, refund still to send
        refund = self.mine()["refund"]
        self.assertEqual((refund["status"], refund["amount"], refund["account"]), ("pending", "9000.00", "••••0001"))
        self.assertEqual(self.post(self.student, "/api/student/certificate/").status_code, 400)

        for outsider in (self.officer_, self.clerk, self.admin_office, self.student):   # accounts@ sends them
            self.assertEqual(self.refunds(outsider).status_code, 403)
        for outsider in (self.officer_, self.clerk):
            self.assertEqual(self.send(outsider, no_refund=True).status_code, 403)
        listing = self.refunds().json()
        self.assertEqual([(r["request_id"], r["suggested_amount"], r["bank"]["account_no"]) for r in listing["pending"]],
                         [(self.req.id, "9000.00", "50100000001")])
        self.assertEqual(listing["sent"], [])

        today = refund_service.today()   # the institute's date, as the server checks it
        paid = {"amount": "9000", "mode": "neft", "reference": "SBIN26318000123",
                "paid_on": (today - timedelta(days=1)).isoformat()}
        self.assertEqual(self.send(**{**paid, "reference": " "}).status_code, 400)            # UTR needed
        self.assertEqual(self.send(**{**paid, "mode": "CASH"}).status_code, 400)
        self.assertEqual(self.send(**{**paid, "amount": "0"}).status_code, 400)               # use "no refund due"
        self.assertEqual(self.send(**{**paid, "paid_on": (today + timedelta(days=1)).isoformat()}).status_code, 400)
        self.assertEqual(self.overall(), OVERALL_IN_PROGRESS)

        r = self.send(**paid)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()["refund"]["mode"], r.json()["refund"]["amount"]), ("NEFT", "9000.00"))
        self.assertEqual(self.overall(), OVERALL_CLEARED)

        # The student is told: on the dashboard, and in their Accounts thread.
        mine = self.mine()
        self.assertEqual((mine["refund"]["status"], mine["refund"]["reference"]), ("sent", "SBIN26318000123"))
        accounts = next(s for s in mine["sections"] if s["code"] == SECTION_ACCOUNTS)
        self.assertTrue(any("Refund sent: ₹9,000.00" in c["body"] and c["is_system"] for c in accounts["comments"]))

        self.assertEqual(self.send(reject=True, reason="Too late").status_code, 400)   # paid: can't send it back
        cert = self.post(self.student, "/api/student/certificate/")
        self.assertEqual(cert.status_code, 200)
        self.assertEqual(cert.json()["certificate"]["refund"]["reference"], "SBIN26318000123")
        listing = self.refunds().json()
        self.assertEqual((listing["pending"], listing["sent"][0]["refund"]["recorded_by"]), ([], "accounts@t.in"))

    def test_the_main_account_always_sends_refunds_and_chosen_staff_too(self):
        self.approve_all()
        panel = lambda: self.get(self.head, "/api/section/staff/").json()   # noqa: E731
        # accounts@ sends refunds; its staff don't — the last level (the Officer) included.
        self.assertEqual((self.desk(self.head)["can_record_refunds"], self.desk(self.head)["refunds_pending"]), (True, 1))
        for member in (self.clerk, self.officer_):
            self.assertFalse(self.desk(member)["can_record_refunds"])
            self.assertNotIn("refunds_pending", self.desk(member))
            self.assertEqual(self.refunds(member).status_code, 403)
        self.assertEqual(panel()["refund_senders"], ["You (main account)"])   # the head reads itself as "You"

        # The Clerk is made a refund manager: both of them send refunds now.
        r = self.patch(self.head, f"/api/section/staff/{self.clerk.id}/", {"refund_manager": True})
        self.assertEqual((r.status_code, r.json()["staff"]["refund_manager"]), (200, True))
        self.assertTrue(self.desk(self.clerk)["can_record_refunds"])
        self.assertTrue(self.desk(self.head)["can_record_refunds"])
        self.assertFalse(self.desk(self.officer_)["can_record_refunds"])
        self.assertEqual(panel()["refund_senders"], ["You (main account)", "Clerk"])
        self.assertEqual(self.send(self.clerk, no_refund=True).status_code, 200)
        self.assertEqual(self.overall(), OVERALL_CLEARED)

        # Staff come and go; accounts@ always sends them.
        for member in (self.officer_, self.clerk):
            self.assertEqual(self.delete(self.head, f"/api/section/staff/{member.id}/").status_code, 200)
        self.assertTrue(self.desk(self.head)["can_record_refunds"])
        self.assertEqual(panel()["refund_senders"], ["You (main account)"])

    def test_the_refund_sender_can_send_it_back_with_a_reason(self):
        self.approve_all()
        self.assertEqual(self.send(reject=True, reason="  ").status_code, 400)            # a reason is needed
        self.assertEqual(self.send(self.clerk, reject=True, reason="Wrong IFSC").status_code, 403)
        r = self.send(reject=True, reason="Account number doesn't match the cheque")
        self.assertEqual(r.status_code, 200, r.content)
        accounts = self.ss(SECTION_ACCOUNTS)
        self.assertEqual((accounts.status, accounts.stage_approvals.count()), (STATUS_REJECTED, 0))
        self.assertEqual(self.mine()["refund"]["status"], "waiting")
        mine = next(s for s in self.mine()["sections"] if s["code"] == SECTION_ACCOUNTS)
        self.assertTrue(any("doesn't match the cheque" in c["body"] for c in mine["comments"]))   # the student sees why
        self.assertEqual(self.refunds().json()["pending"], [])
        self.assertEqual(self.send(reject=True, reason="again").status_code, 400)           # nothing approved to send back

    def test_the_refund_sender_works_from_the_approved_tab(self):
        def approved_row(user):
            return next((r for r in self.desk(user)["students"]
                         if r["request_id"] == self.req.id and r["status"] == STATUS_APPROVED), None)

        # Accounts approved, Administration not yet: listed for accounts@, waiting.
        self.approve_all(skip=(SECTION_ADMINISTRATION,))
        row = approved_row(self.head)
        self.assertEqual((row["refund"]["state"], row["refund"]["waiting_for"]), ("waiting", ["Administration"]))
        self.assertEqual(row["refund"]["bank"]["account_no"], "50100000001")
        for member in (self.officer_, self.clerk):                           # staff don't send them
            self.assertIsNone(approved_row(member))
        review = f"/api/section/review/?request_id={self.req.id}"
        self.assertEqual(self.get(self.officer_, review).status_code, 403)

        # A staff refund manager gets the same list, though he never approved it himself.
        self.patch(self.head, f"/api/section/staff/{self.officer_.id}/", {"refund_manager": True})
        self.assertEqual(approved_row(self.officer_)["refund"]["state"], "waiting")
        self.assertEqual(self.get(self.officer_, review).status_code, 200)    # he may open it to pay it
        self.assertEqual(self.get(self.clerk, review).status_code, 403)

        engine.approve(self.ss(SECTION_ADMINISTRATION), self.officer)
        self.assertEqual(approved_row(self.head)["refund"]["state"], "ready")
        self.assertEqual(self.desk(self.head)["refund_modes"], ["NEFT", "IMPS", "RTGS", "UPI", "CHEQUE"])
        self.send(amount="9000", mode="UPI", reference="UPI-REF-1")
        row = approved_row(self.head)
        self.assertEqual((row["refund"]["state"], row["refund"]["refund"]["reference"]), ("sent", "UPI-REF-1"))

    def test_no_refund_until_every_section_has_approved(self):
        self.approve_all(skip=(SECTION_ADMINISTRATION,))
        self.assertEqual(self.mine()["refund"]["status"], "waiting")
        self.assertEqual(self.refunds().json()["pending"], [])
        r = self.send(amount="9000", mode="NEFT", reference="UTR1")
        self.assertEqual(r.status_code, 400)
        self.assertIn("Not every section", r.json()["detail"])
        self.assertFalse(Refund.objects.exists())

    def test_no_refund_due_also_completes_the_clearance(self):
        self.approve_all()
        self.assertEqual(self.send(no_refund=True).status_code, 200)
        self.assertEqual(self.overall(), OVERALL_CLEARED)
        self.assertEqual((self.mine()["refund"]["status"], self.mine()["refund"]["amount"]), ("not_due", "0.00"))

    def test_a_correction_or_a_reopen_never_asks_for_a_second_payment(self):
        self.approve_all()
        self.send(amount="9000", mode="NEFT", reference="UTR-TYPO")
        self.assertEqual(self.send(amount="9000", mode="NEFT", reference="UTR-RIGHT").status_code, 200)
        self.assertEqual(list(Refund.objects.values_list("reference", flat=True)), ["UTR-RIGHT"])
        self.assertTrue(self.ss(SECTION_ACCOUNTS).comments.filter(body__contains="details corrected").exists())
        self.assertEqual(self.post(self.student, "/api/student/certificate/").status_code, 200)

        engine.reject(self.ss(SECTION_LIBRARY), self.officer, "Book not returned")   # a section reopens
        self.assertEqual(self.overall(), OVERALL_IN_PROGRESS)
        self.assertFalse(Certificate.objects.filter(request=self.req).exists())
        self.assertEqual(Refund.objects.count(), 1)                                     # the money stays sent
        self.approve_all()                                                               # re-approved ...
        self.assertEqual(self.overall(), OVERALL_CLEARED)                                # ... cleared again
        self.assertEqual(self.refunds().json()["pending"], [])


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class QueryCountTests(ApiHelpers, TestCase):
    """The N+1 guard (main/prefetch.py): a desk, panel or dashboard runs a fixed
    number of SQL queries however many rows it shows. Each test counts an
    endpoint's queries, adds more students (or messages and documents), and counts
    again: the number must not change. A ceiling also catches a large constant
    regression. Before the fix, accounts@'s desk ran ~8 queries per student."""

    CEILING = 25
    FIELD = (SECTION_STORE, SECTION_LUCS, SECTION_SPORTS, SECTION_MEDICAL, SECTION_NAD)

    @classmethod
    def setUpTestData(cls):
        cls.dept = {c: Department.objects.create(code=c) for c in DEPARTMENT_CODES}
        cls.hostel = {c: Hostel.objects.create(code=c) for c in HOSTEL_CODES}
        for code, name, order, upload, consolidator in SECTION_DEFS:
            Section.objects.create(code=code, name=name, order=order,
                                   is_upload_section=upload, is_consolidator=consolidator)
        checklist_service.ensure_defaults(SECTION_ADMINISTRATION)

        def officer(username, role, hostel=None, dept=None):
            user = User.objects.create_user(username, password="x")
            UserProfile.objects.create(user=user, role=role, hostel=cls.hostel.get(hostel),
                                       department=cls.dept.get(dept))
            return user

        def staff(head, name, email, level=None):
            return staff_service.create_staff(head.profile, name=name, email=email,
                                              password=STAFF_PASSWORD, level=level).user

        cls.library = officer("library@t.in", SECTION_LIBRARY)
        cls.tpc = officer("tpc@t.in", SECTION_TPC)
        cls.warden = officer("warden.bh1@t.in", SECTION_WARDEN, hostel="BH1")
        cls.lucs = officer("lucs@t.in", SECTION_LUCS)
        cls.hod_cse = officer("hod.cse@t.in", SECTION_HOD, dept="CSE")
        cls.hod_ece = officer("hod.ece@t.in", SECTION_HOD, dept="ECE")
        cls.accounts = officer("accounts@t.in", SECTION_ACCOUNTS)
        cls.admin_office = officer("admin.office@t.in", SECTION_ADMINISTRATION)
        cls.lib_staff = staff(cls.library, "Library Assistant", "lib.staff@t.in")
        cls.admin_staff = staff(cls.admin_office, "Admin Assistant", "admin.staff@t.in")
        cls.clerk = staff(cls.accounts, "Clerk", "clerk@t.in", level=1)
        cls.assistant = staff(cls.accounts, "Assistant", "assistant@t.in", level=2)
        cls.acc_officer = staff(cls.accounts, "Officer", "officer@t.in", level=3)
        cls.microwave = lab_service.create_lab(cls.dept["ECE"], name="Microwave Lab", email="microwave.lab@t.in",
                                               password=LAB_PASSWORD, level=1, incharge_name="Microwave In-charge")
        lab_service.create_lab(cls.dept["ECE"], name="DSP Lab", email="dsp.lab@t.in",
                               password=LAB_PASSWORD, level=2, incharge_name="DSP In-charge")
        # Two full cycles, so every list (refunds sent *and* still to send) has a row
        # before the tests count: Django skips a prefetch query when there are no rows.
        cls.add_students(10)

    @classmethod
    def add_students(cls, count):
        """`count` more students, cycling through every state the desks show: not
        ready, at Accounts level 2 (sent to Library staff, checklist ticked), with
        accounts@ for the final step (message thread, sent to Administration staff),
        fully approved (refund sent or still to send), and ECE in its labs."""
        sections = {s.code: s for s in Section.objects.all()}
        for _ in range(count):
            i = Student.objects.count()
            kind = i % 5
            dept, hostel = ("ECE", "GH1") if kind == 4 else ("CSE", "BH1")
            user = User.objects.create_user(f"q{i}@t.in", password="x")
            UserProfile.objects.create(user=user, role="STUDENT")
            student = Student.objects.create(user=user, name=f"Student {i}", roll_no=f"25UQC{i:03d}",
                                             department=cls.dept[dept], hostel=cls.hostel[hostel],
                                             webmail=user.username)
            req = ClearanceRequest.objects.create(student=student, exit_type="GRADUATION",
                                                  vacant_room_no="A102", intake_submitted=True, fund_us_amount=1000)
            ss = {code: SectionStatus.objects.create(request=req, section=sections[code], student_confirmed=True)
                  for code in engine.required_sections("GRADUATION")}
            Document.objects.create(section_status=ss[SECTION_ACCOUNTS], ocr_fields={
                "review": {"account_holder": student.name, "account_no": f"5010000{i:04d}",
                           "ifsc": "SBIN0000001", "bank_name": "SBI"}, "confirmed": True})
            if kind == 0:
                continue                                                  # not ready for Accounts
            for code in (SECTION_LIBRARY, SECTION_TPC, SECTION_WARDEN):
                engine.approve(ss[code], cls.library)
            if kind == 4:                                                 # ECE: in its department labs
                engine.send_next_lab_level(req, user)
                engine.approve_lab(LabStatus.objects.get(request=req, lab=cls.microwave), cls.microwave.user)
                continue
            engine.approve(ss[SECTION_HOD], cls.hod_cse)
            if kind == 1:
                StageApproval.objects.create(section_status=ss[SECTION_ACCOUNTS], level=1, approved_by=cls.clerk)
                SectionStatus.objects.filter(pk=ss[SECTION_LIBRARY].pk).update(assigned_to=cls.lib_staff)
                checklist_service.set_tick(ss[SECTION_ADMINISTRATION], checklist_service.items(
                    SECTION_ADMINISTRATION)[0].id, True, cls.admin_staff)
            elif kind == 2:
                for level, who in ((1, cls.clerk), (2, cls.assistant), (3, cls.acc_officer)):
                    StageApproval.objects.create(section_status=ss[SECTION_ACCOUNTS], level=level, approved_by=who)
                Comment.objects.create(section_status=ss[SECTION_ACCOUNTS], author=user, body="Cheque attached.")
                SectionStatus.objects.filter(pk=ss[SECTION_ADMINISTRATION].pk).update(assigned_to=cls.admin_staff)
            else:                                                         # every section approved
                for code in cls.FIELD + (SECTION_ACCOUNTS, SECTION_ADMINISTRATION):
                    engine.approve(ss[code], cls.accounts)
                if i % 2 == 0:
                    refund_service.record(req, cls.accounts, amount="9000", mode="NEFT", reference=f"UTR{i}",
                                          paid_on=(refund_service.today() - timedelta(days=1)).isoformat())

    def count_queries(self, user, url):
        self.client.force_login(user)
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(url)
        self.assertEqual(response.status_code, 200, response.content)
        return len(ctx)

    def assert_flat(self, cases, grow):
        """Query counts of `cases` [(label, user, url)] are the same after `grow()`."""
        before = {label: self.count_queries(user, url) for label, user, url in cases}
        grow()
        for label, user, url in cases:
            with self.subTest(label):
                after = self.count_queries(user, url)
                self.assertEqual(after, before[label], f"{label}: {before[label]} → {after} queries (N+1)")
                self.assertLessEqual(after, self.CEILING)

    def test_officer_desks_run_the_same_queries_for_more_students(self):
        desks = [("accounts@ (levels, final step, refunds)", self.accounts), ("Accounts level 1", self.clerk),
                 ("Accounts level 2", self.assistant), ("admin.office@ (checklist)", self.admin_office),
                 ("Administration staff", self.admin_staff), ("library@ (by hand)", self.library),
                 ("Library staff", self.lib_staff), ("lucs@", self.lucs), ("tpc@", self.tpc),
                 ("warden@", self.warden), ("hod.cse@", self.hod_cse), ("hod.ece@ (labs)", self.hod_ece)]
        self.assert_flat([(label, user, "/api/section/queue/") for label, user in desks],
                         grow=lambda: self.add_students(10))

    def test_lab_desk_staff_panels_and_refund_list_too(self):
        self.assert_flat([
            ("lab desk", self.microwave.user, "/api/lab/queue/"),
            ("accounts@ staff panel", self.accounts, "/api/section/staff/"),
            ("library@ staff panel", self.library, "/api/section/staff/"),
            ("refund list", self.accounts, "/api/accounts/refunds/"),
        ], grow=lambda: self.add_students(10))

    def test_staff_panels_and_desks_dont_grow_with_staff(self):
        def more_staff():
            for n in range(4):
                for head, level in ((self.library, None), (self.accounts, 2)):
                    staff_service.create_staff(head.profile, name=f"Extra {n}", email=f"extra{n}.{head.id}@t.in",
                                               password=STAFF_PASSWORD, level=level)

        self.assert_flat([
            ("accounts@ staff panel", self.accounts, "/api/section/staff/"),
            ("library@ staff panel", self.library, "/api/section/staff/"),
            ("accounts@ desk", self.accounts, "/api/section/queue/"),
            ("library@ desk", self.library, "/api/section/queue/"),
        ], grow=more_staff)

    def test_dashboard_and_reviews_dont_grow_with_messages_and_documents(self):
        req = ClearanceRequest.objects.get(student__webmail="q2@t.in")   # at accounts@'s final step
        ece = ClearanceRequest.objects.get(student__webmail="q4@t.in")

        def more_threads():
            for ss in SectionStatus.objects.filter(request__in=[req, ece]):
                Comment.objects.create(section_status=ss, author=self.library, body="Please check.")
                Comment.objects.create(section_status=ss, author=ss.request.student.user, body="Done.")
                Document.objects.create(section_status=ss, ocr_fields={"confirmed": True})

        self.assert_flat([
            ("student dashboard", req.student.user, "/api/student/request/"),
            ("ECE student dashboard", ece.student.user, "/api/student/request/"),
            ("accounts@ review", self.accounts, f"/api/section/review/?request_id={req.id}"),
            ("admin.office@ review", self.admin_office, f"/api/section/review/?request_id={req.id}"),
            ("hod.ece@ review", self.hod_ece, f"/api/section/review/?request_id={ece.id}"),
        ], grow=more_threads)

    def test_prefetched_rows_give_the_same_answers_without_queries(self):
        """The business-rule helpers read batch-loaded rows on a desk and query on a
        lone row; both must give the same answers, and the desk path no queries."""
        names = staff_service.chain_names(SECTION_ACCOUNTS)
        lone = SectionStatus.objects.select_related("section", "request__student__department")
        desk = lambda code, **kw: {ss.id: ss for ss in prefetch.for_desk(   # noqa: E731
            SectionStatus.objects.filter(section__code=code), **kw)}

        loaded = desk(SECTION_ACCOUNTS, prerequisites=True, stages=True, refunds=True)
        for ss in lone.filter(section__code=SECTION_ACCOUNTS):
            with self.subTest(f"Accounts {ss.request.student.roll_no}"):
                fast = loaded[ss.id]
                with self.assertNumQueries(0):
                    answers = (staff_service.stage_info(fast, names), engine.actionable(fast.request, SECTION_ACCOUNTS),
                               refund_service.row_state(fast.request, accounts_ss=fast))
                self.assertEqual(answers, (staff_service.stage_info(ss, names),
                                           engine.actionable(ss.request, SECTION_ACCOUNTS),
                                           refund_service.row_state(ss.request)))

        items = checklist_service.items(SECTION_ADMINISTRATION)
        loaded = desk(SECTION_ADMINISTRATION, prerequisites=True, checklist=True)
        for ss in lone.filter(section__code=SECTION_ADMINISTRATION):
            with self.subTest(f"Administration {ss.request.student.roll_no}"):
                fast = loaded[ss.id]
                with self.assertNumQueries(0):
                    answers = (checklist_service.entries(fast, items),
                               engine.actionable(fast.request, SECTION_ADMINISTRATION))
                self.assertEqual(answers, (checklist_service.entries(ss, items),
                                           engine.actionable(ss.request, SECTION_ADMINISTRATION)))

        has_labs = engine.department_has_labs(self.dept["ECE"].id)
        loaded = desk(SECTION_HOD, labs=True)
        for ss in lone.filter(section__code=SECTION_HOD, request__student__department__code="ECE"):
            with self.subTest(f"HOD {ss.request.student.roll_no}"):
                fast = loaded[ss.id]
                with self.assertNumQueries(0):
                    answers = (engine.lab_progress(fast.request, dept_has_labs=has_labs),
                               engine.actionable(fast.request, SECTION_HOD, dept_has_labs=has_labs))
                self.assertEqual(answers, (engine.lab_progress(ss.request),
                                           engine.actionable(ss.request, SECTION_HOD)))


class WorkflowGraphTests(SimpleTestCase):
    """Every exit type's approval graph is a valid DAG, checked with Kahn's
    algorithm (engine.analyze_workflow) — and the check finds what would break
    one: a prerequisite the exit type doesn't have (the original NEP-exit bug:
    Accounts waited for a TPC section the request didn't have) or a cycle."""

    NO_TPC = ("NEP_EXIT", "WITHDRAWAL", "ADMISSION_CANCEL")

    def test_every_exit_type_has_a_complete_approval_order(self):
        self.assertEqual(engine.workflow_problems(), [])
        for exit_type in EXIT_TYPES:
            with self.subTest(exit_type):
                graph = engine.workflow(exit_type)
                order = engine.approval_order(graph)
                self.assertCountEqual(order, engine.required_sections(exit_type))   # every section, once
                for code, prereqs in graph.items():
                    for p in prereqs:
                        self.assertLess(order.index(p), order.index(code), f"{p} must come before {code}")

    def test_tpc_is_waited_for_only_by_graduations(self):
        self.assertEqual(engine.prerequisites(SECTION_ACCOUNTS, "GRADUATION"),
                         [SECTION_LIBRARY, SECTION_TPC, SECTION_WARDEN, SECTION_HOD])
        for exit_type in self.NO_TPC:
            with self.subTest(exit_type):
                self.assertNotIn(SECTION_TPC, engine.required_sections(exit_type))
                for code in (SECTION_ACCOUNTS, SECTION_ADMINISTRATION):
                    self.assertEqual(engine.prerequisites(code, exit_type),
                                     [SECTION_LIBRARY, SECTION_WARDEN, SECTION_HOD])
        # Without an exit type: the full rule ("does Accounts wait on anything?").
        self.assertIn(SECTION_TPC, engine.prerequisites(SECTION_ACCOUNTS))

    def test_the_old_rule_shows_up_as_missing_dependencies(self):
        # Before the fix, every exit type waited for TPC: the validator flags exactly that.
        with mock.patch.object(engine, "OPTIONAL_PREREQUISITES", set()):
            problems = engine.workflow_problems()
        self.assertEqual(sorted(problems), sorted(
            f"{exit_type}: {code} waits for TPC, which isn't part of this workflow"
            for exit_type in self.NO_TPC for code in (SECTION_ACCOUNTS, SECTION_ADMINISTRATION)))

    def test_kahn_finds_missing_dependencies_and_cycles(self):
        self.assertEqual(engine.analyze_workflow({"A": [], "B": ["A", "X"], "C": ["B"]}),
                         (["A", "B", "C"], [("B", "X")], []))
        cyclic = {"A": [], "B": ["A", "D"], "C": ["B"], "D": ["C"], "E": ["D"]}   # B → C → D → B, E after it
        self.assertEqual(engine.analyze_workflow(cyclic), (["A"], [], ["B", "C", "D", "E"]))
        self.assertEqual(engine.analyze_workflow({"A": ["A"]})[2], ["A"])          # a self-loop
        self.assertEqual(engine.analyze_workflow({"A": [], "B": ["A", "A"]})[0], ["A", "B"])   # duplicate edge
        with self.assertRaisesMessage(engine.WorkflowError, "B, C, D, E can never be approved (a cycle)"):
            engine.approval_order(cyclic)
        with self.assertRaisesMessage(engine.WorkflowError, "B waits for X, which isn't part of this workflow"):
            engine.approval_order({"A": [], "B": ["X"]})

    def test_a_broken_workflow_stops_django_from_starting(self):
        self.assertEqual(workflow_checks.approval_workflows(None), [])
        with mock.patch.dict(engine.PREREQUISITES, {SECTION_LIBRARY: [SECTION_ACCOUNTS]}):   # Library ⇄ Accounts
            errors = workflow_checks.approval_workflows(None)
        self.assertEqual({e.id for e in errors}, {"main.E001"})
        self.assertEqual(len(errors), len(EXIT_TYPES))
        self.assertIn("can never be approved (a cycle)", errors[0].msg)

    def test_the_reverse_cascade_follows_the_exit_type(self):
        both = {SECTION_ACCOUNTS, SECTION_ADMINISTRATION}
        self.assertEqual(engine.downstream_closure(SECTION_TPC, "GRADUATION"), both)
        self.assertEqual(engine.downstream_closure(SECTION_TPC, "NEP_EXIT"), set())   # nothing waits for it
        for exit_type in EXIT_TYPES:
            with self.subTest(exit_type):
                for code in (SECTION_LIBRARY, SECTION_WARDEN, SECTION_HOD):
                    self.assertEqual(engine.downstream_closure(code, exit_type), both)
                self.assertEqual(engine.downstream_closure(SECTION_STORE, exit_type), set())


@override_settings(PASSWORD_HASHERS=["django.contrib.auth.hashers.MD5PasswordHasher"])
class ExitTypeClearanceTests(ApiHelpers, TestCase):
    """For every exit type, a student gets all the way to a certificate through
    the real API: each office approves in the order Kahn's algorithm gives, and at
    every step each section is open exactly when its own prerequisites (for that
    exit type) have approved. Then a reopen resets what depends on it."""

    @classmethod
    def setUpTestData(cls):
        cls.dept = {c: Department.objects.create(code=c) for c in DEPARTMENT_CODES}
        cls.hostel = {c: Hostel.objects.create(code=c) for c in HOSTEL_CODES}
        for code, name, order, upload, consolidator in SECTION_DEFS:
            Section.objects.create(code=code, name=name, order=order,
                                   is_upload_section=upload, is_consolidator=consolidator)
        checklist_service.ensure_defaults(SECTION_ADMINISTRATION)

        def officer(code, hostel=None, dept=None):
            user = User.objects.create_user(f"{code.lower()}@t.in", password="x")
            UserProfile.objects.create(user=user, role=code, hostel=cls.hostel.get(hostel),
                                       department=cls.dept.get(dept))
            return user

        cls.officers = {code: officer(code) for code in engine.ALL_SECTION_CODES
                        if code not in (SECTION_WARDEN, SECTION_HOD)}
        cls.officers[SECTION_WARDEN] = officer(SECTION_WARDEN, hostel="BH1")
        cls.officers[SECTION_HOD] = officer(SECTION_HOD, dept="CSE")      # CSE has no labs
        cls.accounts = cls.officers[SECTION_ACCOUNTS]
        cls.clerk = staff_service.create_staff(cls.accounts.profile, name="Clerk", email="clerk@t.in",
                                               password=STAFF_PASSWORD, level=1).user

    # ── helpers ──────────────────────────────────────────────────────────────────

    def ss(self, req, code):
        return SectionStatus.objects.get(request=req, section__code=code)

    def mine(self, student):
        return {s["code"]: s for s in self.get(student, "/api/student/request/").json()["request"]["sections"]}

    def start(self, exit_type):
        """A CSE student starts a request of `exit_type` and completes their side:
        the confirm-only sections confirmed, Page 1 submitted, cheque details confirmed."""
        tag = exit_type.lower()
        user = User.objects.create_user(f"{tag}@t.in", password="x")
        UserProfile.objects.create(user=user, role="STUDENT")
        student = Student.objects.create(user=user, name=f"{exit_type} Student", roll_no=f"25U{tag[:3].upper()}001",
                                         department=self.dept["CSE"], hostel=self.hostel["BH1"], webmail=user.username)
        r = self.post(user, "/api/student/initiate/", {"exit_type": exit_type, "vacant_room_no": "A102"})
        self.assertEqual(r.status_code, 201, r.content)
        req = ClearanceRequest.objects.get(pk=r.json()["request"]["id"])
        for code in BASIC_CONFIRM_SECTIONS & set(engine.required_sections(exit_type)):
            r = self.post(user, "/api/student/confirm-section/",
                          {"section": code, "name": student.name, "roll_no": student.roll_no, "department": "CSE"})
            self.assertEqual(r.status_code, 200, r.content)
        ClearanceRequest.objects.filter(pk=req.pk).update(intake_submitted=True)   # uploads aren't under test here
        Document.objects.create(section_status=self.ss(req, SECTION_ACCOUNTS), ocr_fields={
            "review": {"account_holder": student.name, "account_no": "50100000001", "ifsc": "SBIN0000001"},
            "confirmed": True})
        return user, req

    def approve(self, req, code):
        """Approve `code` the way its office does, through the API."""
        if code == SECTION_ACCOUNTS:
            # Level 1 (the clerk) first; then accounts@, always the final step.
            incoming = [r["request_id"] for r in self.get(self.clerk, "/api/section/queue/").json()["students"]
                        if r["status"] == STATUS_PENDING]
            self.assertIn(req.id, incoming, "the request never reached Accounts' level 1")
            self.assertEqual(self.post(self.clerk, "/api/section/approve/", {"request_id": req.id}).status_code, 200)
        if code == SECTION_ADMINISTRATION:
            # Ready to be sent to Administration's staff, then the ID card ticked at the office.
            self.assertTrue(staff_service.ready_for_staff(SECTION_ADMINISTRATION).filter(request=req).exists())
            item = checklist_service.items(SECTION_ADMINISTRATION)[0]
            r = self.post(self.officers[code], "/api/section/checklist/tick/",
                          {"request_id": req.id, "item_id": item.id, "done": True})
            self.assertEqual(r.status_code, 200, r.content)
        r = self.post(self.officers[code], "/api/section/approve/", {"request_id": req.id})
        self.assertEqual(r.status_code, 200, f"{code}: {r.content}")
        self.assertEqual(self.ss(req, code).status, STATUS_APPROVED)

    def clear(self, exit_type):
        """Start a request and approve every section in Kahn's order, checking at
        each step that a section is open exactly when its prerequisites are approved;
        then Accounts records the refund. Returns (student, request)."""
        student, req = self.start(exit_type)
        graph = engine.workflow(exit_type)
        self.assertEqual(list(self.mine(student)), engine.required_sections(exit_type))
        approved = set()
        for code in engine.approval_order(graph):
            view = self.mine(student)
            for other, prereqs in graph.items():
                waiting = [p for p in prereqs if p not in approved]
                self.assertEqual(view[other]["actionable"], not waiting,
                                 f"{other} open with {sorted(approved)} approved")
                self.assertEqual(view[other]["waiting_for"], [view[p]["name"] for p in waiting])
            self.approve(req, code)
            approved.add(code)
        r = self.post(self.accounts, "/api/accounts/refunds/", {
            "request_id": req.id, "amount": "9000", "mode": "NEFT", "reference": f"UTR-{exit_type}",
            "paid_on": (refund_service.today() - timedelta(days=1)).isoformat()})
        self.assertEqual(r.status_code, 200, r.content)
        req.refresh_from_db()
        self.assertEqual(req.overall_status, OVERALL_CLEARED)
        return student, req

    # ── tests ────────────────────────────────────────────────────────────────────

    def test_every_exit_type_can_be_cleared_in_dependency_order(self):
        for exit_type in EXIT_TYPES:
            with self.subTest(exit_type):
                student, req = self.clear(exit_type)
                cert = self.post(student, "/api/student/certificate/")
                self.assertEqual(cert.status_code, 200, cert.content)
                self.assertCountEqual([s["code"] for s in cert.json()["certificate"]["sections"]],
                                      engine.required_sections(exit_type))

    def test_accounts_shows_what_each_exit_type_still_waits_for(self):
        for exit_type, expected in (("GRADUATION", ["Library", "TPC", "Warden", "HOD"]),
                                    ("NEP_EXIT", ["Library", "Warden", "HOD"]),
                                    ("WITHDRAWAL", ["Library", "Warden", "HOD"]),
                                    ("ADMISSION_CANCEL", ["Library", "Warden", "HOD"])):
            with self.subTest(exit_type):
                _, req = self.start(exit_type)
                row = next(r for r in self.get(self.accounts, "/api/section/queue/").json()["students"]
                           if r["request_id"] == req.id)
                self.assertEqual((row["stage"]["ready"], row["stage"]["blocked_by"]), (False, expected))
                r = self.post(self.accounts, "/api/section/approve/", {"request_id": req.id})
                self.assertEqual(r.status_code, 409)
                self.assertIn(", ".join(expected), r.json()["detail"])

    def test_a_reopen_resets_what_depends_on_it_for_every_exit_type(self):
        for exit_type in EXIT_TYPES:
            with self.subTest(exit_type):
                student, req = self.clear(exit_type)
                self.assertEqual(self.post(student, "/api/student/certificate/").status_code, 200)
                library = self.officers[SECTION_LIBRARY]
                r = self.post(library, "/api/section/reject/", {"request_id": req.id, "reason": "Book not returned"})
                self.assertEqual(r.status_code, 200, r.content)

                # Accounts and Administration depend on the Library: back to pending; the rest stays.
                for code in engine.required_sections(exit_type):
                    expected = (STATUS_REJECTED if code == SECTION_LIBRARY
                                else STATUS_PENDING if code in (SECTION_ACCOUNTS, SECTION_ADMINISTRATION)
                                else STATUS_APPROVED)
                    self.assertEqual(self.ss(req, code).status, expected, code)
                for code in (SECTION_ACCOUNTS, SECTION_ADMINISTRATION):
                    self.assertTrue(self.ss(req, code).comments.filter(
                        is_system=True, body="Reset: upstream LIBRARY reopened").exists())
                self.assertEqual(StageApproval.objects.filter(section_status__request=req).count(), 0)
                req.refresh_from_db()
                self.assertEqual(req.overall_status, OVERALL_IN_PROGRESS)
                self.assertFalse(Certificate.objects.filter(request=req).exists())
                view = self.mine(student)
                self.assertEqual((view[SECTION_ACCOUNTS]["actionable"], view[SECTION_ACCOUNTS]["waiting_for"]),
                                 (False, ["Central Library"]))

                # Library approves again: it clears again, without a second refund.
                for code in (SECTION_LIBRARY, SECTION_ACCOUNTS, SECTION_ADMINISTRATION):
                    self.approve(req, code)
                req.refresh_from_db()
                self.assertEqual(req.overall_status, OVERALL_CLEARED)
                self.assertEqual(Refund.objects.filter(request=req).count(), 1)
