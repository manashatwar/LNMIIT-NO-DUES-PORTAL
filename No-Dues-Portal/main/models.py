"""
Data models for the LNMIIT No Dues Portal — aligned to Design.md.

Reference data (Department, Hostel, Section) + identity/request entities
(UserProfile, Student, ClearanceRequest, SectionStatus, Document, Comment,
Certificate). Roll numbers are TEXT, never integers.
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
SECTION_DEPT = "DEPT"            # Department-Purpose (No-Dues form upload)
SECTION_HOD = "HOD"
SECTION_ACCOUNTS = "ACCOUNTS"
SECTION_ADMINISTRATION = "ADMINISTRATION"

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
    role = models.CharField(max_length=32)  # STUDENT | LIBRARY | ... | ADMIN
    hostel = models.ForeignKey(Hostel, null=True, blank=True, on_delete=models.PROTECT)
    department = models.ForeignKey(Department, null=True, blank=True, on_delete=models.PROTECT)

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

    class Meta:
        unique_together = ("request", "section")

    def __str__(self):
        return f"{self.request_id}:{self.section.code}={self.status}"


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
    section_status = models.ForeignKey(SectionStatus, on_delete=models.CASCADE, related_name="comments")
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
