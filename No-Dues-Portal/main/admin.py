from django.contrib import admin
from .models import *

class StudFacStatusInline(admin.TabularInline):
	model = StudFacStatus
	extra = 1

class StudLabStatusInline(admin.TabularInline):
	model = StudLabStatus
	extra = 1

class StudentAdmin(admin.ModelAdmin):
	list_display = ('name',)
	search_field = ['name']
	inlines = (StudFacStatusInline,StudLabStatusInline,)

class FacultyAdmin(admin.ModelAdmin):
	list_display = ('name',)
	search_field = ['name']
	inlines = (StudFacStatusInline,)


class SupportOfficeAdmin(admin.ModelAdmin):
	list_display = ('name', 'office_role', 'hostel')
	search_field = ['name', 'office_role', 'hostel']

class LibraryAdmin(admin.ModelAdmin):
	list_display = ('name',)

class LabAdmin(admin.ModelAdmin):
	list_display = ('name',)
	search_field = ['name']
	inlines = (StudLabStatusInline,)

class HODAdmin(admin.ModelAdmin):
	list_display = ('name',)
	search_field = ['name']

class AccountAdmin(admin.ModelAdmin):
	list_display = ('name',)
	
admin.site.register(Student,StudentAdmin)
admin.site.register(Faculty,FacultyAdmin)
admin.site.register(Library,LibraryAdmin)
admin.site.register(Lab,LabAdmin)
admin.site.register(HOD,HODAdmin)
admin.site.register(Account,AccountAdmin)
admin.site.register(SupportOffice,SupportOfficeAdmin)
