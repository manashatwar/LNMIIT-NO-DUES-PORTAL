from django.urls import re_path
from . import views

app_name = 'main'

urlpatterns = [
	re_path(r'^login_user/$', views.login_user, name='login_user'),
    re_path(r'^logout_user/$', views.logout_user, name='logout_user'),
    re_path(r'^student_profile/$', views.student_profile, name='student_profile'),
    re_path(r'^rules/$', views.rules, name='rules'),
    re_path(r'^contact/$', views.contact, name='contact'),
    re_path(r'^student_dept_detail/$', views.student_dept_detail, name='student_dept_detail'),
    re_path(r'^student_lab_detail/$', views.student_lab_detail, name='student_lab_detail'),
    re_path(r'^caretaker_profile/$', views.caretaker_profile, name='caretaker_profile'),
    re_path(r'^warden_profile/$', views.warden_profile, name='warden_profile'),
    re_path(r'^faculty_profile/$', views.faculty_profile, name='faculty_profile'),
    re_path(r'^gymkhana_profile/$', views.gymkhana_profile, name='gymkhana_profile'),
    re_path(r'^account_profile/$', views.account_profile, name='account_profile'),
    re_path(r'^hod_profile/$', views.hod_profile, name='hod_profile'),
    re_path(r'^cc_profile/$', views.cc_profile, name='cc_profile'),
    re_path(r'^onlinecc_profile/$', views.onlinecc_profile, name='onlinecc_profile'),
    re_path(r'^thesis_manager_profile/$', views.thesis_manager_profile, name='thesis_manager_profile'),
    re_path(r'^library_profile/$', views.library_profile, name='library_profile'),
    re_path(r'^lab_profile/$', views.lab_profile, name='lab_profile'),
    re_path(r'^assistant_registrar_profile/$', views.assistant_registrar_profile, name='assistant_registrar_profile'),

]