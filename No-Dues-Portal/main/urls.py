from django.urls import path
from . import api

app_name = 'main'

urlpatterns = [
    # Auth
    path('api/csrf/', api.csrf, name='csrf'),
    path('api/login/', api.login_api, name='login'),
    path('api/logout/', api.logout_api, name='logout'),
    path('api/me/', api.me, name='me'),

    # Student
    path('api/student/request/', api.student_request, name='student_request'),
    path('api/student/initiate/', api.initiate, name='initiate'),
    path('api/student/upload/', api.upload_document, name='upload_document'),
    path('api/student/submit-intake/', api.submit_intake, name='submit_intake'),
    path('api/student/confirm-review/', api.confirm_review, name='confirm_review'),
    path('api/student/comment/', api.student_comment, name='student_comment'),
    path('api/student/confirm-section/', api.confirm_section, name='confirm_section'),
    path('api/student/certificate/', api.generate_certificate, name='certificate'),

    # Documents
    path('api/document/<int:doc_id>/download/', api.document_download, name='document_download'),

    # Officer
    path('api/section/queue/', api.section_queue, name='section_queue'),
    path('api/section/review/', api.section_review, name='section_review'),
    path('api/section/approve/', api.approve, name='approve'),
    path('api/section/reject/', api.reject, name='reject'),
    path('api/section/comment/', api.officer_comment, name='officer_comment'),
]
