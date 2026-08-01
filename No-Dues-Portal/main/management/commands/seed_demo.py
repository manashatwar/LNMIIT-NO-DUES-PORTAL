"""
Seed reference data + demo users for the redesigned (Design.md) schema.

Run:  python manage.py seed_demo

All accounts use password: csepassword
Login with the webmail as username and pick the matching role.
"""
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from main import engine
from main.models import (
    Department, Hostel, Section, UserProfile, Student,
    ClearanceRequest, SectionStatus,
    DEPARTMENT_CODES, HOSTEL_CODES,
    SECTION_LIBRARY, SECTION_TPC, SECTION_WARDEN, SECTION_STORE, SECTION_LUCS,
    SECTION_SPORTS, SECTION_MEDICAL, SECTION_NAD, SECTION_DEPT, SECTION_HOD,
    SECTION_ACCOUNTS, SECTION_ADMINISTRATION,
)

PASSWORD = "csepassword"

# code, name, order, is_upload_section, is_consolidator
SECTION_DEFS = [
    (SECTION_LIBRARY,        "Central Library",       10, True,  False),
    (SECTION_TPC,            "TPC / Placement",       11, True,  False),
    (SECTION_WARDEN,         "Warden / Hostel",       12, False, False),
    (SECTION_STORE,          "Store",                 13, False, False),
    (SECTION_LUCS,           "LUCS",                  14, True,  False),
    (SECTION_SPORTS,         "Sports / GSAC",         15, False, False),
    (SECTION_MEDICAL,        "Medical Cell",          16, False, False),
    (SECTION_NAD,            "NAD Cell",              17, False, False),
    (SECTION_DEPT,           "Department-Purpose",    18, True,  False),
    (SECTION_HOD,            "HOD / Department",      20, False, True),
    (SECTION_ACCOUNTS,       "Accounts",              30, True,  False),
    (SECTION_ADMINISTRATION, "Administration",        40, False, True),
]


class Command(BaseCommand):
    help = "Seed departments, hostels, sections, officers and demo students."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset", action="store_true",
            help="Delete all existing clearance requests (and their statuses, "
                 "documents, comments, certificates) so the demo starts fresh.",
        )

    def _user(self, username, is_staff=False, is_superuser=False):
        user, _ = User.objects.get_or_create(username=username, defaults={"email": username})
        user.is_staff = is_staff
        user.is_superuser = is_superuser
        user.set_password(PASSWORD)
        user.save()
        return user

    def handle(self, *args, **options):
        # ── Optional reset: wipe all clearance requests (cascades to statuses,
        #    documents, comments, certificates) so approve/reject can be re-demoed. ──
        if options.get("reset"):
            deleted, _ = ClearanceRequest.objects.all().delete()
            self.stdout.write(self.style.WARNING(
                f"Reset: cleared {deleted} clearance-related row(s)."))

        # ── Reference data ──
        depts = {c: Department.objects.get_or_create(code=c)[0] for c in DEPARTMENT_CODES}
        hostels = {c: Hostel.objects.get_or_create(code=c)[0] for c in HOSTEL_CODES}
        for code, name, order, upload, consolidator in SECTION_DEFS:
            Section.objects.update_or_create(
                code=code,
                defaults=dict(name=name, order=order,
                              is_upload_section=upload, is_consolidator=consolidator),
            )

        # ── Admin ──
        self._user("admin", is_staff=True, is_superuser=True)

        # ── Officers: webmail -> (role, hostel, dept) ──
        officers = [
            ("library@lnmiit.ac.in",   SECTION_LIBRARY,        None,  None),
            ("tpc@lnmiit.ac.in",       SECTION_TPC,            None,  None),
            ("warden.bh1@lnmiit.ac.in", SECTION_WARDEN,        "BH1", None),
            ("warden.gh1@lnmiit.ac.in", SECTION_WARDEN,        "GH1", None),
            ("store@lnmiit.ac.in",     SECTION_STORE,          None,  None),
            ("lucs@lnmiit.ac.in",      SECTION_LUCS,           None,  None),
            ("sports@lnmiit.ac.in",    SECTION_SPORTS,         None,  None),
            ("medical@lnmiit.ac.in",   SECTION_MEDICAL,        None,  None),
            ("nad@lnmiit.ac.in",       SECTION_NAD,            None,  None),
            ("dept.cse@lnmiit.ac.in",  SECTION_DEPT,           None,  None),
            ("hod.cse@lnmiit.ac.in",   SECTION_HOD,            None,  "CSE"),
            ("accounts@lnmiit.ac.in",  SECTION_ACCOUNTS,       None,  None),
            ("admin.office@lnmiit.ac.in", SECTION_ADMINISTRATION, None, None),
        ]
        for webmail, role, hostel_code, dept_code in officers:
            user = self._user(webmail)
            UserProfile.objects.update_or_create(
                user=user,
                defaults=dict(
                    role=role,
                    hostel=hostels.get(hostel_code) if hostel_code else None,
                    department=depts.get(dept_code) if dept_code else None,
                ),
            )

        # ── Students (CSE / BH1) ──
        students_data = [
            ("student@lnmiit.ac.in", "Rahul Sharma", "24UCC174", "CSE", "BH1"),
            ("amit@lnmiit.ac.in",    "Amit Kumar",   "24UCS002", "CSE", "BH1"),
            ("priya@lnmiit.ac.in",   "Priya Singh",  "23UEC201", "ECE", "GH1"),
            ("arjun@lnmiit.ac.in",   "Arjun Nair",   "23UCC305", "CCE", "BH2"),
        ]
        for webmail, name, roll, dept_code, hostel_code in students_data:
            user = self._user(webmail)
            UserProfile.objects.update_or_create(user=user, defaults=dict(role="STUDENT"))
            Student.objects.update_or_create(
                user=user,
                defaults=dict(name=name, roll_no=roll, department=depts[dept_code],
                              hostel=hostels[hostel_code], webmail=webmail),
            )

        # ── A ready-to-use active request for the first student ──
        first = Student.objects.get(webmail="student@lnmiit.ac.in")
        if not ClearanceRequest.objects.filter(student=first, is_active=True).exists():
            req = ClearanceRequest.objects.create(
                student=first, exit_type="GRADUATION", vacant_room_no="BH1-102")
            for code in engine.required_sections("GRADUATION"):
                SectionStatus.objects.get_or_create(request=req, section=Section.objects.get(code=code))

        self.stdout.write(self.style.SUCCESS(
            "Demo data ready. Password for all accounts: csepassword\n"
            "  Students : student@ / amit@ (CSE,BH1) · priya@ (ECE,GH1) · arjun@ (CCE,BH2)  role STUDENT\n"
            "  Officers (role = section code):\n"
            "    library@=LIBRARY  tpc@=TPC  store@=STORE  lucs@=LUCS  sports@=SPORTS\n"
            "    medical@=MEDICAL  nad@=NAD  dept.cse@=DEPT  hod.cse@=HOD  accounts@=ACCOUNTS\n"
            "    warden.bh1@ / warden.gh1@ = WARDEN   admin.office@=ADMINISTRATION\n"
            "  Admin    : admin (Django /admin)"
        ))
