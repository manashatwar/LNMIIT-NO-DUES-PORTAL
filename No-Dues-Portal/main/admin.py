from django.contrib import admin

from .models import (
    Department, Hostel, Section, UserProfile, Student,
    ClearanceRequest, SectionStatus, Document, Comment, Certificate, Lab, LabStatus, StageApproval,
    ChecklistItem, ChecklistTick, Refund,
)


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("code",)


@admin.register(Hostel)
class HostelAdmin(admin.ModelAdmin):
    list_display = ("code",)


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "order", "is_upload_section", "is_consolidator")
    ordering = ("order",)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "hostel", "department", "managed_by", "staff_level")
    list_filter = ("role",)


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ("roll_no", "name", "department", "hostel", "webmail")
    search_fields = ("roll_no", "name", "webmail")


class SectionStatusInline(admin.TabularInline):
    model = SectionStatus
    extra = 0


class LabStatusInline(admin.TabularInline):
    model = LabStatus
    extra = 0


@admin.register(ClearanceRequest)
class ClearanceRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "student", "exit_type", "overall_status", "is_active", "created_at")
    list_filter = ("exit_type", "overall_status", "is_active")
    inlines = (SectionStatusInline, LabStatusInline)


@admin.register(SectionStatus)
class SectionStatusAdmin(admin.ModelAdmin):
    list_display = ("request", "section", "status", "assigned_to", "decided_by", "decided_at")
    list_filter = ("status", "section")


# Labs are normally added by the department's HOD in the portal ("Manage Labs"),
# which also creates the in-charge's login; this admin is for inspection/repair.
@admin.register(Lab)
class LabAdmin(admin.ModelAdmin):
    list_display = ("name", "department", "level", "incharge_name", "user", "is_active")
    list_filter = ("department", "is_active")
    search_fields = ("name", "incharge_name", "user__username")
    ordering = ("department", "level", "name")


@admin.register(StageApproval)
class StageApprovalAdmin(admin.ModelAdmin):
    list_display = ("section_status", "level", "approved_by", "approved_at")


@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
    list_display = ("request", "amount", "mode", "reference", "paid_on", "recorded_by", "recorded_at")
    search_fields = ("reference", "request__student__roll_no")


@admin.register(ChecklistItem)
class ChecklistItemAdmin(admin.ModelAdmin):
    list_display = ("label", "section", "order", "is_active")
    list_filter = ("section", "is_active")


@admin.register(ChecklistTick)
class ChecklistTickAdmin(admin.ModelAdmin):
    list_display = ("section_status", "item", "ticked_by", "ticked_at")


@admin.register(LabStatus)
class LabStatusAdmin(admin.ModelAdmin):
    list_display = ("request", "lab", "level", "status", "sent_at", "decided_by", "decided_at")
    list_filter = ("status", "lab__department")


admin.site.register(Document)
admin.site.register(Comment)
admin.site.register(Certificate)
