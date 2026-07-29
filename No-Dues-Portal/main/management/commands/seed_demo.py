"""
Seed demo users and profiles so the portal can be exercised end-to-end.

Run: python manage.py seed_demo

All accounts use password: csepassword
Login with the webmail as the username and pick the matching role.
"""

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand

from main.models import Account, Faculty, HOD, Lab, Library, Student, StudFacStatus, StudLabStatus, SupportOffice


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
        self._user("admin", is_staff=True, is_superuser=True)

        faculties_data = [
            ("prof.verma@lnmiit.ac.in", "Prof. Verma"),
            ("prof.rao@lnmiit.ac.in", "Prof. Rao"),
            ("prof.iyer@lnmiit.ac.in", "Prof. Iyer"),
        ]
        faculties = []
        for mail, name in faculties_data:
            self._user(mail)
            fac, _ = Faculty.objects.get_or_create(
                webmail=mail,
                defaults={"name": name, "password": PASSWORD, "dept": "CSE"},
            )
            faculties.append(fac)

        labs_data = [
            ("oslab@lnmiit.ac.in", "Operating Systems Lab"),
            ("netlab@lnmiit.ac.in", "Networks Lab"),
            ("dbmslab@lnmiit.ac.in", "DBMS Lab"),
        ]
        labs = []
        for mail, name in labs_data:
            self._user(mail)
            lab, _ = Lab.objects.get_or_create(
                webmail=mail,
                defaults={"name": name, "password": PASSWORD},
            )
            labs.append(lab)

        support_offices = [
            ("bh1support@lnmiit.ac.in", "BH1 Support", "BH1", "BH1 Support"),
            ("bh2support@lnmiit.ac.in", "BH2 Support", "BH2", "BH2 Support"),
            ("bh3support@lnmiit.ac.in", "BH3 Support", "BH3", "BH3 Support"),
            ("bh5support@lnmiit.ac.in", "BH5 Support", "BH5", "BH5 Support"),
            ("store@lnmiit.ac.in", "Store Release", "", "Store Release"),
            ("lucs@lnmiit.ac.in", "LUCS", "", "LUCS"),
            ("sports@lnmiit.ac.in", "Sports", "", "Sports"),
            ("medical@lnmiit.ac.in", "Medical Unit", "", "Medical Unit"),
            ("nad@lnmiit.ac.in", "NAD Cell", "", "NAD Cell"),
        ]
        for mail, name, hostel, office_role in support_offices:
            self._user(mail)
            SupportOffice.objects.get_or_create(
                webmail=mail,
                defaults={
                    "name": name,
                    "password": PASSWORD,
                    "office_role": office_role,
                    "hostel": hostel,
                },
            )

        self._user("library@lnmiit.ac.in")
        Library.objects.get_or_create(
            webmail="library@lnmiit.ac.in",
            defaults={"name": "Central Library", "password": PASSWORD},
        )

        self._user("account@lnmiit.ac.in")
        Account.objects.get_or_create(
            webmail="account@lnmiit.ac.in",
            defaults={"name": "Accounts", "password": PASSWORD},
        )

        self._user("hod@lnmiit.ac.in")
        HOD.objects.get_or_create(
            webmail="hod@lnmiit.ac.in",
            defaults={"name": "HOD CSE", "password": PASSWORD, "dept": "CSE"},
        )

        students_data = [
            ("student@lnmiit.ac.in", "Rahul Sharma", 1401001),
            ("amit@lnmiit.ac.in", "Amit Kumar", 1401002),
            ("priya@lnmiit.ac.in", "Priya Singh", 1401003),
            ("arjun@lnmiit.ac.in", "Arjun Nair", 1401004),
            ("neha@lnmiit.ac.in", "Neha Gupta", 1401005),
            ("rohit@lnmiit.ac.in", "Rohit Mehta", 1401006),
        ]
        for mail, name, roll in students_data:
            self._user(mail)
            student, _ = Student.objects.get_or_create(
                webmail=mail,
                defaults={"name": name, "roll": roll, "password": PASSWORD, "dept": "CSE", "hostel": "BH1"},
            )
            for fac in faculties:
                StudFacStatus.objects.get_or_create(student=student, faculty=fac, defaults={"approval": False})
            for lab in labs:
                StudLabStatus.objects.get_or_create(student=student, lab=lab, defaults={"approval": False})

        self.stdout.write(self.style.SUCCESS(
            "Demo data ready. Password for all accounts: csepassword\n"
            "  Students : student@lnmiit.ac.in, amit@lnmiit.ac.in  (role: Student)\n"
            "  Faculty  : prof.verma@ / prof.rao@ / prof.iyer@lnmiit.ac.in  (role: Faculty)\n"
            "  Labs     : oslab@ / netlab@ / dbmslab@lnmiit.ac.in  (role: Lab)\n"
            "  Hostel   : bh1support@ / bh2support@ / bh3support@ / bh5support@lnmiit.ac.in  (role: Hostel Support)\n"
            "  Other    : store@ / lucs@ / sports@ / medical@ / nad@ / library@ / account@ / hod@lnmiit.ac.in\n"
            "  Admin    : admin (Django /admin)"
        ))
