"""
Data models for the LNMIIT No Dues Portal — aligned to Design.md.

Reference data (Department, Hostel, Section) + identity/request entities
(UserProfile, Student, ClearanceRequest, SectionStatus, Document, Comment,
Certificate) + HOD-managed department labs (Lab, LabStatus). Roll numbers are
TEXT, never integers.
"""
from django.conf import settings
from django.contrib.auth.models import User
from django.db import models

# ─── Domain constants ─────────────────────────────────────────────────────────

DEPARTMENT_CODES = ["CCE", "CSE", "ECE", "MME"]
HOSTEL_CODES = ["BH1", "BH2", "BH3", "BH4", "BH5", "GH1"]

EXIT_TYPES = ["GRADUATION", "NEP_EXIT", "WITHDRAWAL", "ADMISSION_CANCEL"]

# Section codes (see Design.md § Approval Engine / Section Flow)
SECTION_LIBRARY = "LIBRARY"
SECTION_TPC = "TPC"
SECTION_WARDEN = "WARDEN"
SECTION_STORE = "STORE"
SECTION_LUCS = "LUCS"
SECTION_SPORTS = "SPORTS"
SECTION_MEDICAL = "MEDICAL"
SECTION_NAD = "NAD"
SECTION_HOD = "HOD"
SECTION_ACCOUNTS = "ACCOUNTS"
SECTION_ADMINISTRATION = "ADMINISTRATION"

# Lab in-charge login role. Labs are NOT Sections: each department's HOD creates
# its own labs (main/labs.py) and they gate that department's HOD approval
# (main/engine.py § Department labs).
ROLE_LAB = "LAB"

STATUS_PENDING = "PENDING"
STATUS_APPROVED = "APPROVED"
STATUS_REJECTED = "REJECTED"

OVERALL_IN_PROGRESS = "IN_PROGRESS"
OVERALL_CLEARED = "CLEARED"


# ─── Reference entities ─────────────────────────────────────────────────────────

class Department(models.Model):
    code = models.CharField(max_length=8, unique=True)   # CCE | CSE | ECE | MME

    def __str__(self):
        return self.code


class Hostel(models.Model):
    code = models.CharField(max_length=8, unique=True)   # BH1..BH5 | GH1

    def __str__(self):
        return self.code


class Section(models.Model):
    code = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=120)
    order = models.PositiveIntegerField(default=0)
    is_upload_section = models.BooleanField(default=False)
    is_consolidator = models.BooleanField(default=False)  # HOD, Administration

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.code


# ─── Identity and request entities ──────────────────────────────────────────────

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=32)  # STUDENT | LIBRARY | ... | LAB | ADMIN
    hostel = models.ForeignKey(Hostel, null=True, blank=True, on_delete=models.PROTECT)
    department = models.ForeignKey(Department, null=True, blank=True, on_delete=models.PROTECT)
    # Section staff (main/staff.py — Library, LUCS, NAD Cell): set on accounts a
    # section head added; they share the head's role but only see requests sent to them.
    # Null for everyone else, including the head itself.
    managed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.PROTECT,
                                   related_name="staff_profiles")
    # Levelled section (Accounts): the level a staff member approves at, set by the
    # head. Requests move up the levels automatically, then come to the head for
    # the final approval; see main/staff.py.
    staff_level = models.PositiveIntegerField(null=True, blank=True)
    # Accounts staff (main/refunds.py): also sends students' refunds. The main
    # account always does.
    is_refund_manager = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.user.username} ({self.role})"


class Student(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="student")
    name = models.CharField(max_length=120)
    roll_no = models.CharField(max_length=16)            # TEXT — e.g. 24UCC174
    department = models.ForeignKey(Department, on_delete=models.PROTECT)
    hostel = models.ForeignKey(Hostel, on_delete=models.PROTECT)
    webmail = models.EmailField()

    def __str__(self):
        return f"{self.roll_no} {self.name}"


class ClearanceRequest(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="requests")
    exit_type = models.CharField(max_length=20)
    overall_status = models.CharField(max_length=16, default=OVERALL_IN_PROGRESS)
    fund_us_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)
    vacant_room_no = models.CharField(max_length=50, blank=True, default="")
    intake_submitted = models.BooleanField(default=False)   # Page 1 completed
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Request #{self.pk} — {self.student.roll_no} ({self.exit_type})"


class SectionStatus(models.Model):
    request = models.ForeignKey(ClearanceRequest, on_delete=models.CASCADE, related_name="section_statuses")
    section = models.ForeignKey(Section, on_delete=models.PROTECT)
    status = models.CharField(max_length=12, default=STATUS_PENDING)
    decided_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    decided_at = models.DateTimeField(null=True, blank=True)
    # Basic (name/roll) sections only reach the officer's queue after the student confirms.
    student_confirmed = models.BooleanField(default=True)
    # Section staff (main/staff.py — Library, LUCS, NAD Cell): the staff member
    # the section head sent this request to. Null = still with the head.
    assigned_to = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name="assigned_section_statuses")
    assigned_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("request", "section")

    def __str__(self):
        return f"{self.request_id}:{self.section.code}={self.status}"


class StageApproval(models.Model):
    """
    One level of a levelled section's staff (Accounts) approving a request.
    Either staff member on a level may give it — one per level — and the last
    level's approval approves the section itself (main/staff.py).
    """
    section_status = models.ForeignKey(SectionStatus, on_delete=models.CASCADE,
                                       related_name="stage_approvals")
    level = models.PositiveIntegerField()
    approved_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="+")
    approved_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("section_status", "level")
        ordering = ["level"]

    def __str__(self):
        return f"{self.section_status_id}: level {self.level} by {self.approved_by_id}"


class Refund(models.Model):
    """
    Accounts' record that the student's refund has been paid — or that none was
    due (amount 0). Every section approved + this record = the request is
    cleared and the certificate unlocks (main/refunds.py).
    """
    request = models.OneToOneField(ClearanceRequest, on_delete=models.CASCADE, related_name="refund")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    mode = models.CharField(max_length=10, blank=True, default="")         # NEFT | IMPS | RTGS | UPI | CHEQUE; "" = none due
    reference = models.CharField(max_length=64, blank=True, default="")    # UTR / transaction or cheque no.
    paid_on = models.DateField(null=True, blank=True)
    recorded_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="+")
    recorded_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Refund for request {self.request_id}: {self.amount} {self.mode} {self.reference}"


class ChecklistItem(models.Model):
    """
    Something a student must complete in person at a section's office before
    that section can approve — e.g. Administration's "Physical ID card
    submitted". The section head manages the list (main/checklist.py); removed
    items are kept inactive so past ticks stay on record.
    """
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name="checklist_items")
    label = models.CharField(max_length=120)
    order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return f"{self.section.code}: {self.label}"


class ChecklistTick(models.Model):
    """The section's office ticked a checklist item for one request."""
    section_status = models.ForeignKey(SectionStatus, on_delete=models.CASCADE,
                                       related_name="checklist_ticks")
    item = models.ForeignKey(ChecklistItem, on_delete=models.CASCADE, related_name="ticks")
    ticked_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name="+")
    ticked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("section_status", "item")

    def __str__(self):
        return f"{self.section_status_id}: {self.item_id} by {self.ticked_by_id}"


class Lab(models.Model):
    """
    A department lab whose in-charge must clear a student before that
    department's HOD does — the digital form of the paper "No Dues Form for
    Department Purpose". Created and arranged by the department's HOD.

    `level` is the hierarchy: labs sharing a level receive a request together;
    level N+1 receives it only once every lab on level N has approved; HOD
    approves after the last level.
    """
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name="labs")
    name = models.CharField(max_length=120)
    incharge_name = models.CharField(max_length=120, blank=True, default="")
    level = models.PositiveIntegerField(default=1)
    # The in-charge's portal login (username = email), created with the lab.
    user = models.OneToOneField(User, on_delete=models.PROTECT, related_name="lab")
    # False = removed by the HOD but kept because past requests reference it.
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["department", "level", "name"]

    def __str__(self):
        return f"{self.department.code} · {self.name} (level {self.level})"


class LabStatus(models.Model):
    """One lab's decision on one clearance request (a row of the paper form)."""
    request = models.ForeignKey(ClearanceRequest, on_delete=models.CASCADE, related_name="lab_statuses")
    lab = models.ForeignKey(Lab, on_delete=models.PROTECT, related_name="statuses")
    # Copy of lab.level taken when the student started the lab chain, so the
    # HOD re-arranging labs later never reshuffles a request already in progress.
    level = models.PositiveIntegerField()
    status = models.CharField(max_length=12, default=STATUS_PENDING)
    # When the student sent the request to this lab; null = not sent yet.
    sent_at = models.DateTimeField(null=True, blank=True)
    decided_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("request", "lab")
        ordering = ["level", "id"]

    def __str__(self):
        return f"{self.request_id}:{self.lab.name}={self.status}"


class Document(models.Model):
    section_status = models.ForeignKey(SectionStatus, on_delete=models.CASCADE, related_name="documents")
    file = models.FileField(upload_to="secure/", null=True, blank=True)
    event_report_url = models.URLField(null=True, blank=True)   # LUCS link mode
    original_name = models.CharField(max_length=255, blank=True, default="")
    uploaded_at = models.DateTimeField(auto_now_add=True)
    ocr_text = models.TextField(blank=True, default="")
    ocr_fields = models.JSONField(blank=True, default=dict)  # native Postgres jsonb

    def __str__(self):
        return f"Doc #{self.pk} for {self.section_status_id}"


class Comment(models.Model):
    # Exactly one of these is set: a section's thread, or a department lab's
    # thread. (Enforced by the code that creates comments, not by a DB constraint.)
    section_status = models.ForeignKey(
        SectionStatus, on_delete=models.CASCADE, related_name="comments", null=True, blank=True)
    lab_status = models.ForeignKey(
        LabStatus, on_delete=models.CASCADE, related_name="comments", null=True, blank=True)
    author = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    body = models.TextField()
    is_system = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Comment #{self.pk}"


class Certificate(models.Model):
    request = models.OneToOneField(ClearanceRequest, on_delete=models.CASCADE, related_name="certificate")
    pdf_file = models.FileField(upload_to="certificates/", null=True, blank=True)
    fund_us_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    generated_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Certificate for request #{self.request_id}"
