from django.contrib import admin

from .models import (
    Department, Hostel, Section, UserProfile, Student,
    ClearanceRequest, SectionStatus, Document, Comment, Certificate,
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
    list_display = ("user", "role", "hostel", "department")
    list_filter = ("role",)


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ("roll_no", "name", "department", "hostel", "webmail")
    search_fields = ("roll_no", "name", "webmail")


class SectionStatusInline(admin.TabularInline):
    model = SectionStatus
    extra = 0


@admin.register(ClearanceRequest)
class ClearanceRequestAdmin(admin.ModelAdmin):
    list_display = ("id", "student", "exit_type", "overall_status", "is_active", "created_at")
    list_filter = ("exit_type", "overall_status", "is_active")
    inlines = (SectionStatusInline,)


@admin.register(SectionStatus)
class SectionStatusAdmin(admin.ModelAdmin):
    list_display = ("request", "section", "status", "decided_by", "decided_at")
    list_filter = ("status", "section")


admin.site.register(Document)
admin.site.register(Comment)
admin.site.register(Certificate)
