"""
Seed demo users and profiles so the portal can be exercised end-to-end,
mirroring the style of the original No-Dues-Portal (multiple faculty, labs
and students, with per-faculty / per-lab status rows).

Run:  python manage.py seed_demo

All accounts use password: csepassword
Login with the webmail as the username and pick the matching role.
"""
from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from main.models import (
    Student, Faculty, Lab, Caretaker, Warden, Gymkhana, Library,
    OnlineCC, CC, SubmitThesis, asstreg, HOD, Account,
    StudFacStatus, StudLabStatus,
)

PASSWORD = "csepassword"


class Command(BaseCommand):
    help = "Create demo users, officer profiles, faculty, labs and students."

    def _user(self, webmail, is_staff=False, is_superuser=False):
        user, _ = User.objects.get_or_create(username=webmail, defaults={"email": webmail})
        user.is_staff = is_staff
        user.is_superuser = is_superuser
        user.set_password(PASSWORD)
        user.save()
        return user

    def handle(self, *args, **options):
        # ── Admin ──
        self._user("admin", is_staff=True, is_superuser=True)

        # ── Faculty (CSE department) ──
        faculties_data = [
            ("prof.verma@lnmiit.ac.in", "Prof. Verma"),
            ("prof.rao@lnmiit.ac.in",   "Prof. Rao"),
            ("prof.iyer@lnmiit.ac.in",  "Prof. Iyer"),
        ]
        faculties = []
        for mail, name in faculties_data:
            self._user(mail)
            fac, _ = Faculty.objects.get_or_create(
                webmail=mail, defaults=dict(name=name, password=PASSWORD, dept="CSE")
            )
            faculties.append(fac)

        # ── Labs ──
        labs_data = [
            ("oslab@lnmiit.ac.in",   "Operating Systems Lab"),
            ("netlab@lnmiit.ac.in",  "Networks Lab"),
            ("dbmslab@lnmiit.ac.in", "DBMS Lab"),
        ]
        labs = []
        for mail, name in labs_data:
            self._user(mail)
            lab, _ = Lab.objects.get_or_create(
                webmail=mail, defaults=dict(name=name, password=PASSWORD)
            )
            labs.append(lab)

        # ── Single-desk officers ──
        officers = [
            ("caretaker@lnmiit.ac.in", Caretaker,    {"name": "BH1 Caretaker", "hostel": "BH1"}),
            ("warden@lnmiit.ac.in",    Warden,       {"name": "BH1 Warden", "hostel": "BH1"}),
            ("gymkhana@lnmiit.ac.in",  Gymkhana,     {"name": "Gymkhana"}),
            ("library@lnmiit.ac.in",   Library,      {"name": "Central Library"}),
            ("onlinecc@lnmiit.ac.in",  OnlineCC,     {"name": "Online CC"}),
            ("cc@lnmiit.ac.in",        CC,           {"name": "CC"}),
            ("thesis@lnmiit.ac.in",    SubmitThesis, {"name": "Thesis Manager"}),
            ("asstreg@lnmiit.ac.in",   asstreg,      {"name": "Assistant Registrar"}),
            ("account@lnmiit.ac.in",   Account,      {"name": "Accounts"}),
            ("hod@lnmiit.ac.in",       HOD,          {"name": "HOD CSE", "dept": "CSE"}),
        ]
        for mail, model, extra in officers:
            self._user(mail)
            defaults = dict(extra)
            defaults["password"] = PASSWORD
            model.objects.get_or_create(webmail=mail, defaults=defaults)

        # ── Students (CSE / BH1) ──
        students_data = [
            ("student@lnmiit.ac.in", "Rahul Sharma",  1401001),
            ("amit@lnmiit.ac.in",    "Amit Kumar",    1401002),
            ("priya@lnmiit.ac.in",   "Priya Singh",   1401003),
            ("arjun@lnmiit.ac.in",   "Arjun Nair",    1401004),
            ("neha@lnmiit.ac.in",    "Neha Gupta",    1401005),
            ("rohit@lnmiit.ac.in",   "Rohit Mehta",   1401006),
        ]
        for mail, name, roll in students_data:
            self._user(mail)
            student, _ = Student.objects.get_or_create(
                webmail=mail,
                defaults=dict(name=name, roll=roll, password=PASSWORD, dept="CSE", hostel="BH1"),
            )
            # Per-faculty and per-lab status rows (all start unapproved)
            for fac in faculties:
                StudFacStatus.objects.get_or_create(
                    student=student, faculty=fac, defaults={"approval": False}
                )
            for lab in labs:
                StudLabStatus.objects.get_or_create(
                    student=student, lab=lab, defaults={"approval": False}
                )

        self.stdout.write(self.style.SUCCESS(
            "Demo data ready. Password for all accounts: csepassword\n"
            "  Students : student@lnmiit.ac.in, amit@lnmiit.ac.in  (role: Student)\n"
            "  Faculty  : prof.verma@ / prof.rao@ / prof.iyer@lnmiit.ac.in  (role: Faculty)\n"
            "  Labs     : oslab@ / netlab@ / dbmslab@lnmiit.ac.in  (role: Lab)\n"
            "  Officers : caretaker@ warden@ gymkhana@ library@ onlinecc@ cc@ thesis@ asstreg@ account@ hod@\n"
            "  Admin    : admin (Django /admin)"
        ))
