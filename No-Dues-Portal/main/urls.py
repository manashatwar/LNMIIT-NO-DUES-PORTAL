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
    path('api/student/donation/', api.student_donation, name='student_donation'),
    path('api/student/confirm-review/', api.confirm_review, name='confirm_review'),
    path('api/student/comment/', api.student_comment, name='student_comment'),
    path('api/student/confirm-section/', api.confirm_section, name='confirm_section'),
    path('api/student/certificate/', api.generate_certificate, name='certificate'),

    # Student — department lab chain (HOD card on Page 3)
    path('api/student/labs/send/', api.student_labs_send, name='student_labs_send'),
    path('api/student/labs/resend/', api.student_labs_resend, name='student_labs_resend'),
    path('api/student/labs/comment/', api.student_labs_comment, name='student_labs_comment'),

    # Documents
    path('api/document/<int:doc_id>/download/', api.document_download, name='document_download'),

    # Officer
    path('api/section/queue/', api.section_queue, name='section_queue'),
    path('api/section/review/', api.section_review, name='section_review'),
    path('api/section/approve/', api.approve, name='approve'),
    path('api/section/reject/', api.reject, name='reject'),
    path('api/section/comment/', api.officer_comment, name='officer_comment'),

    # Section staff (Library, LUCS, NAD Cell, Accounts, Administration) — the head
    # sends work out (by hand) or sets levels, and manages staff
    path('api/section/assign/', api.section_assign, name='section_assign'),
    path('api/section/staff/', api.section_staff, name='section_staff'),
    path('api/section/staff/<int:staff_id>/', api.section_staff_detail, name='section_staff_detail'),

    # Refunds — the Accounts head records each paid refund; only then is the request cleared
    path('api/accounts/refunds/', api.accounts_refunds, name='accounts_refunds'),

    # Administration checklist — the head manages the items; its office ticks them per request
    path('api/section/checklist/', api.section_checklist, name='section_checklist'),
    path('api/section/checklist/tick/', api.section_checklist_tick, name='section_checklist_tick'),
    path('api/section/checklist/<int:item_id>/', api.section_checklist_detail, name='section_checklist_detail'),

    # Lab in-charge (accounts created by their department's HOD)
    path('api/lab/queue/', api.lab_queue, name='lab_queue'),
    path('api/lab/review/', api.lab_review, name='lab_review'),
    path('api/lab/approve/', api.lab_approve, name='lab_approve'),
    path('api/lab/reject/', api.lab_reject, name='lab_reject'),
    path('api/lab/comment/', api.lab_comment, name='lab_comment'),

    # HOD — manage the department's labs and their levels
    path('api/hod/labs/', api.hod_labs, name='hod_labs'),
    path('api/hod/labs/<int:lab_id>/', api.hod_lab_detail, name='hod_lab_detail'),
]
