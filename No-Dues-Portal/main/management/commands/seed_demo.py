"""
Seed reference data + demo users for the redesigned (Design.md) schema.

Run: python manage.py seed_demo

All accounts use password: csepassword
Login with the webmail as username and pick the matching role.
"""

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from main import checklist, engine
from main.models import (
    Department, Hostel, Section, UserProfile, Student,
    ClearanceRequest, SectionStatus, Document, Lab, ChecklistTick,
    DEPARTMENT_CODES, HOSTEL_CODES, ROLE_LAB,
    SECTION_LIBRARY, SECTION_TPC, SECTION_WARDEN, SECTION_STORE, SECTION_LUCS,
    SECTION_SPORTS, SECTION_MEDICAL, SECTION_NAD, SECTION_HOD,
    SECTION_ACCOUNTS, SECTION_ADMINISTRATION,
)

PASSWORD = "csepassword"

# ECE labs from the paper "No Dues Form for Department Purpose"
# (LNMIIT_DOCUMENTS/IMG-20260628-WA0008.jpg), arranged the way an HOD might in
# "Manage Labs": three labs in parallel first, then DSP, then E-CAD and BE.
# name, in-charge (from the form), login, level
ECE_LABS = [
    ("Microwave Lab", "Mr. Kamta Sharma",     "microwave.lab@lnmiit.ac.in", 1),
    ("ADC Lab",       "Mr. Dharam Pal Yadav", "adc.lab@lnmiit.ac.in",       1),
    ("TI Lab",        "Mr. Vinod Kumar",      "ti.lab@lnmiit.ac.in",        1),
    ("DSP Lab",       "Mr. Kushmakar Sharma", "dsp.lab@lnmiit.ac.in",       2),
    ("E-CAD Lab",     "Mr. Ajay Naresh",      "ecad.lab@lnmiit.ac.in",      3),
    ("BE Lab",        "Mr. Pavan Sharma",     "be.lab@lnmiit.ac.in",        3),
]

# Section staff (main/staff.py) under each section head: they sign in as that
# section and see only what reaches them. Normally the head adds them in
# "Manage staff". head login -> [(name, staff login[, level])]
# Accounts staff work in levels: 1 -> 2 (two people, either can approve) -> 3.
# Administration's staff work by hand, like the Library's, LUCS's and NAD's.
SECTION_STAFF = {
    "library@lnmiit.ac.in":  [("Library Assistant 1", "lib.staff1@lnmiit.ac.in"),
                              ("Library Assistant 2", "lib.staff2@lnmiit.ac.in")],
    "lucs@lnmiit.ac.in":     [("LUCS Assistant 1", "lucs.staff1@lnmiit.ac.in"),
                              ("LUCS Assistant 2", "lucs.staff2@lnmiit.ac.in")],
    "nad@lnmiit.ac.in":      [("NAD Assistant 1", "nad.staff1@lnmiit.ac.in"),
                              ("NAD Assistant 2", "nad.staff2@lnmiit.ac.in")],
    "accounts@lnmiit.ac.in": [("Accounts Clerk", "acc.staff1@lnmiit.ac.in", 1),
                              ("Accounts Assistant A", "acc.staff2@lnmiit.ac.in", 2),
                              ("Accounts Assistant B", "acc.staff3@lnmiit.ac.in", 2),
                              ("Accounts Officer", "acc.staff4@lnmiit.ac.in", 3)],
    "admin.office@lnmiit.ac.in": [("Admin Assistant 1", "admin.staff1@lnmiit.ac.in"),
                                  ("Admin Assistant 2", "admin.staff2@lnmiit.ac.in")],
}

# Confirm-only sections the demo students have already "Confirm & Send"-ed, so
# demo requests also wait at those desks (and their staff have work to get).
DEMO_CONFIRMED = [SECTION_LUCS, SECTION_NAD]

# code, name, order, is_upload_section, is_consolidator
# Department-Purpose was removed (HOD no longer requires a dedicated form
# upload — see main/engine.py). LUCS is no longer an upload section either;
# it's a confirm-only section like Store/Sports/Medical/NAD.
SECTION_DEFS = [
    (SECTION_LIBRARY,        "Central Library",       10, True,  False),
    (SECTION_TPC,            "TPC / Placement",       11, True,  False),
    (SECTION_WARDEN,         "Warden / Hostel",       12, False, False),
    (SECTION_STORE,          "Store",                 13, False, False),
    (SECTION_LUCS,           "LUCS",                  14, False, False),
    (SECTION_SPORTS,         "Sports / GSAC",         15, False, False),
    (SECTION_MEDICAL,        "Medical Cell",          16, False, False),
    (SECTION_NAD,            "NAD Cell",              17, False, False),
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
        parser.add_argument(
            "--demo-requests", type=int, default=0, metavar="N",
            help="Also create N demo students (demo001@lnmiit.ac.in, ...) whose requests "
                 "are waiting at the Library, LUCS and NAD Cell, ready to review — e.g. "
                 "to try sending 35 at once to staff. Max 999.",
        )
        parser.add_argument(
            "--demo-accounts", type=int, default=0, metavar="N",
            help="Also create N demo students (acct001@lnmiit.ac.in, ...) whose requests have "
                 "reached Accounts and Administration — Library, TPC, Warden and HOD approved, "
                 "cancelled-cheque details submitted, Page 5 details confirmed — to try Accounts' "
                 "staff levels, and Administration's staff and checklist. Max 999.",
        )
        parser.add_argument(
            "--demo-refunds", type=int, default=0, metavar="N",
            help="Also create N demo students (refund001@lnmiit.ac.in, ...) whose every section "
                 "has approved, waiting for Accounts to send their refund (Approved tab → Refund) — after "
                 "which their certificate unlocks. Max 999.",
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
        # Administration's starting checklist ("Physical ID card submitted").
        checklist.ensure_defaults(SECTION_ADMINISTRATION)

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
            ("hod.cse@lnmiit.ac.in",   SECTION_HOD,            None,  "CSE"),
            ("hod.cce@lnmiit.ac.in",   SECTION_HOD,            None,  "CCE"),
            ("hod.ece@lnmiit.ac.in",   SECTION_HOD,            None,  "ECE"),
            ("hod.mme@lnmiit.ac.in",   SECTION_HOD,            None,  "MME"),
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

        # ── ECE department labs + their in-charge logins (role LAB) ──
        # Normally an HOD adds these in "Manage Labs" (main/labs.py); seeded
        # here so the lab chain can be demoed with priya@ (ECE) straight away.
        ece = depts["ECE"]
        for name, incharge, webmail, level in ECE_LABS:
            user = self._user(webmail)
            user.first_name = incharge
            user.is_active = True
            user.save(update_fields=["first_name", "is_active"])
            UserProfile.objects.update_or_create(
                user=user, defaults=dict(role=ROLE_LAB, hostel=None, department=ece))
            Lab.objects.update_or_create(
                user=user,
                defaults=dict(department=ece, name=name, incharge_name=incharge,
                              level=level, is_active=True),
            )

        # ── Section staff under their heads (main/staff.py) ──
        for head_webmail, members in SECTION_STAFF.items():
            head = User.objects.get(username=head_webmail)
            for name, webmail, *level in members:
                user = self._user(webmail)
                user.first_name = name
                user.is_active = True
                user.save(update_fields=["first_name", "is_active"])
                UserProfile.objects.update_or_create(
                    user=user, defaults=dict(role=head.profile.role, hostel=None, department=None,
                                             managed_by=head, staff_level=level[0] if level else None))

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
                student=first, exit_type="GRADUATION", vacant_room_no="A102")
            for code in engine.required_sections("GRADUATION"):
                SectionStatus.objects.get_or_create(request=req, section=Section.objects.get(code=code))

        demo = min(max(options.get("demo_requests") or 0, 0), 999)
        if demo:
            self._demo_requests(demo, depts["CSE"], hostels["BH1"])
        demo_accounts = min(max(options.get("demo_accounts") or 0, 0), 999)
        if demo_accounts:
            self._demo_accounts(demo_accounts, depts["CSE"], hostels["BH1"])
        demo_refunds = min(max(options.get("demo_refunds") or 0, 0), 999)
        if demo_refunds:
            self._demo_refunds(demo_refunds, depts["CSE"], hostels["BH1"])

        self.stdout.write(self.style.SUCCESS(
            "Demo data ready. Password for all accounts: csepassword\n"
            "  Students : student@ / amit@ (CSE,BH1) · priya@ (ECE,GH1) · arjun@ (CCE,BH2)  role STUDENT\n"
            "  Officers (role = section code):\n"
            "    library@=LIBRARY  tpc@=TPC  store@=STORE  lucs@=LUCS  sports@=SPORTS\n"
            "    medical@=MEDICAL  nad@=NAD  accounts@=ACCOUNTS\n"
            "    hod.cse@ / hod.cce@ / hod.ece@ / hod.mme@ = HOD\n"
            "    warden.bh1@ / warden.gh1@ = WARDEN   admin.office@=ADMINISTRATION\n"
            "  ECE labs (role LAB) — level 1: microwave.lab@ adc.lab@ ti.lab@\n"
            "                        level 2: dsp.lab@   level 3: ecad.lab@ be.lab@\n"
            "  Section staff (same role as their head): library@ -> lib.staff1@ lib.staff2@\n"
            "                 lucs@ -> lucs.staff1@ lucs.staff2@   nad@ -> nad.staff1@ nad.staff2@\n"
            "                 accounts@ (by level) -> L1 acc.staff1@ · L2 acc.staff2@ acc.staff3@ · L3 acc.staff4@\n"
            "                 admin.office@ -> admin.staff1@ admin.staff2@\n"
            "  Admin    : admin (Django /admin)"
        ))

    def _demo_refunds(self, n, dept, hostel):
        """N demo students whose every section has approved — Accounts with their
        confirmed cancelled-cheque details, Administration with the ID card ticked —
        so they wait for accounts@ to send their refund."""
        hashed = make_password(PASSWORD)
        sections = {s.code: s for s in Section.objects.all()}
        approver = User.objects.get(username="admin")
        id_card = checklist.items(SECTION_ADMINISTRATION)
        created = 0
        for i in range(1, n + 1):
            webmail = f"refund{i:03d}@lnmiit.ac.in"
            user, _ = User.objects.get_or_create(username=webmail, defaults={"email": webmail})
            user.password = hashed
            user.save(update_fields=["password"])
            UserProfile.objects.update_or_create(user=user, defaults=dict(role="STUDENT"))
            student, _ = Student.objects.update_or_create(
                user=user,
                defaults=dict(name=f"Refund Demo {i:03d}", roll_no=f"25URF{i:03d}",
                              department=dept, hostel=hostel, webmail=webmail),
            )
            if ClearanceRequest.objects.filter(student=student, is_active=True).exists():
                continue
            req = ClearanceRequest.objects.create(
                student=student, exit_type="GRADUATION", vacant_room_no=f"D{i:03d}",
                intake_submitted=True, fund_us_amount=1000 * (i % 3))
            for code in engine.required_sections("GRADUATION"):
                SectionStatus.objects.create(request=req, section=sections[code], student_confirmed=True)
            accounts = SectionStatus.objects.get(request=req, section__code=SECTION_ACCOUNTS)
            Document.objects.create(
                section_status=accounts,
                ocr_fields={"review": {"account_holder": student.name, "account_no": f"{60200000000 + i}",
                                       "ifsc": "HDFC0000123", "bank_name": "HDFC Bank",
                                       "roll_no": student.roll_no},
                            "confirmed": True})
            admin_ss = SectionStatus.objects.get(request=req, section__code=SECTION_ADMINISTRATION)
            for item in id_card:
                ChecklistTick.objects.get_or_create(section_status=admin_ss, item=item, defaults={"ticked_by": approver})
            # Prerequisites first (engine.approve checks them), then the rest.
            for code in sorted(engine.required_sections("GRADUATION"),
                               key=lambda c: c in (SECTION_ACCOUNTS, SECTION_ADMINISTRATION)):
                engine.approve(SectionStatus.objects.get(request=req, section__code=code), approver)
            created += 1
        self.stdout.write(
            f"Demo refund requests: {created} new, every section approved, waiting for Accounts to send "
            f"the refund (students refund001@ to refund{n:03d}@lnmiit.ac.in, password {PASSWORD}).")

    def _demo_accounts(self, n, dept, hostel):
        """N demo students whose requests have reached Accounts and Administration
        (side by side): Library, TPC, Warden (BH1) and HOD (CSE) approved,
        cancelled-cheque details submitted, Page 5 details confirmed."""
        from main.api import BASIC_CONFIRM_SECTIONS

        hashed = make_password(PASSWORD)   # hash once; hashing per account is slow
        sections = {s.code: s for s in Section.objects.all()}
        approvers = {code: User.objects.get(username=email) for code, email in (
            (SECTION_LIBRARY, "library@lnmiit.ac.in"), (SECTION_TPC, "tpc@lnmiit.ac.in"),
            (SECTION_WARDEN, "warden.bh1@lnmiit.ac.in"), (SECTION_HOD, "hod.cse@lnmiit.ac.in"))}
        created = 0
        for i in range(1, n + 1):
            webmail = f"acct{i:03d}@lnmiit.ac.in"
            user, _ = User.objects.get_or_create(username=webmail, defaults={"email": webmail})
            user.password = hashed
            user.save(update_fields=["password"])
            UserProfile.objects.update_or_create(user=user, defaults=dict(role="STUDENT"))
            student, _ = Student.objects.update_or_create(
                user=user,
                defaults=dict(name=f"Accounts Demo {i:03d}", roll_no=f"25UAC{i:03d}",
                              department=dept, hostel=hostel, webmail=webmail),
            )
            if ClearanceRequest.objects.filter(student=student, is_active=True).exists():
                continue
            req = ClearanceRequest.objects.create(
                student=student, exit_type="GRADUATION", vacant_room_no=f"C{i:03d}",
                intake_submitted=True)
            for code in engine.required_sections("GRADUATION"):
                # Administration's details are confirmed too (Page 5 opens with Page 4).
                confirmed = code not in BASIC_CONFIRM_SECTIONS or code == SECTION_ADMINISTRATION
                SectionStatus.objects.create(request=req, section=sections[code], student_confirmed=confirmed)
            for code, officer in approvers.items():
                engine.approve(SectionStatus.objects.get(request=req, section__code=code), officer)
            # What the student's Accounts "Confirm & Send" stores (api.confirm_review).
            Document.objects.create(
                section_status=SectionStatus.objects.get(request=req, section__code=SECTION_ACCOUNTS),
                ocr_fields={"review": {"account_holder": student.name, "account_no": f"{50100000000 + i}",
                                       "ifsc": "SBIN0000001", "bank_name": "State Bank of India",
                                       "roll_no": student.roll_no},
                            "confirmed": True})
            created += 1
        self.stdout.write(
            f"Demo accounts requests: {created} new, waiting at Accounts and Administration "
            f"(students acct001@ to acct{n:03d}@lnmiit.ac.in, password {PASSWORD}).")

    def _demo_requests(self, n, dept, hostel):
        """N demo students whose requests are waiting at the Library, Page 1 submitted."""
        from main.api import BASIC_CONFIRM_SECTIONS

        hashed = make_password(PASSWORD)   # hash once; hashing per account is slow
        sections = {s.code: s for s in Section.objects.all()}
        created = 0
        for i in range(1, n + 1):
            webmail = f"demo{i:03d}@lnmiit.ac.in"
            user, _ = User.objects.get_or_create(username=webmail, defaults={"email": webmail})
            user.password = hashed
            user.save(update_fields=["password"])
            UserProfile.objects.update_or_create(user=user, defaults=dict(role="STUDENT"))
            student, _ = Student.objects.update_or_create(
                user=user,
                defaults=dict(name=f"Demo Student {i:03d}", roll_no=f"25UDM{i:03d}",
                              department=dept, hostel=hostel, webmail=webmail),
            )
            if ClearanceRequest.objects.filter(student=student, is_active=True).exists():
                continue
            req = ClearanceRequest.objects.create(
                student=student, exit_type="GRADUATION", vacant_room_no=f"B{i:03d}",
                intake_submitted=True)
            for code in engine.required_sections("GRADUATION"):
                confirmed = code not in BASIC_CONFIRM_SECTIONS or code in DEMO_CONFIRMED
                ss = SectionStatus.objects.create(request=req, section=sections[code],
                                                  student_confirmed=confirmed)
                if code in DEMO_CONFIRMED:
                    # What the student's "Confirm & Send" stores (api.confirm_section).
                    Document.objects.create(section_status=ss, ocr_fields={
                        "review": {"name": student.name, "roll_no": student.roll_no,
                                   "department": dept.code},
                        "confirmed": True,
                    })
            created += 1
        self.stdout.write(
            f"Demo requests: {created} new, waiting at the Library, LUCS and NAD Cell "
            f"(students demo001@ to demo{n:03d}@lnmiit.ac.in, password {PASSWORD}).")
