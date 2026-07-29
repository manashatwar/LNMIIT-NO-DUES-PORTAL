from django.urls import path
from . import api

app_name = 'main'

urlpatterns = [
    path('api/csrf/', api.csrf, name='csrf'),
    path('api/login/', api.login_api, name='login'),
    path('api/logout/', api.logout_api, name='logout'),
    path('api/me/', api.me, name='me'),
    path('api/student/status/', api.student_status, name='student_status'),
    path('api/student/dept_detail/', api.student_dept_detail, name='student_dept_detail'),
    path('api/student/lab_detail/', api.student_lab_detail, name='student_lab_detail'),
    path('api/section/queue/', api.section_queue, name='section_queue'),
    path('api/section/save/', api.section_save, name='section_save'),
    path('api/student/submit-intake/', api.submit_intake, name='submit_intake'),
]
