"""
Load test for the LNMIIT No-Dues Portal — see ../SCALING.md before running this.

Simulates the two heaviest real-world patterns:
  1. Students logging in and polling their dashboard (GET /api/student/request/)
  2. Section officers polling their queue (GET /api/section/queue/)

Usage:
    pip install locust
    python manage.py seed_demo   # make sure demo accounts exist on the target server
    locust -f docs/loadtest/locustfile.py --host http://localhost:8000

Then open http://localhost:8089, set the number of users to simulate (e.g. 2000)
and a spawn rate, and start the run against a STAGING environment — never production.

This intentionally only exercises read-heavy endpoints matching how most students
behave during a clearance window (repeatedly checking status). Extend `SectionOfficer`
or add a new TaskSet if you also want to load-test the approve/reject write path.
"""
import random

from locust import HttpUser, task, between


# Matches main/management/commands/seed_demo.py — update if you change the seed data.
STUDENT_LOGINS = [
    ("student@lnmiit.ac.in", "STUDENT"),
    ("amit@lnmiit.ac.in", "STUDENT"),
    ("priya@lnmiit.ac.in", "STUDENT"),
    ("arjun@lnmiit.ac.in", "STUDENT"),
]

OFFICER_LOGINS = [
    ("library@lnmiit.ac.in", "LIBRARY"),
    ("store@lnmiit.ac.in", "STORE"),
    ("sports@lnmiit.ac.in", "SPORTS"),
    ("medical@lnmiit.ac.in", "MEDICAL"),
    ("nad@lnmiit.ac.in", "NAD"),
    ("hod.cse@lnmiit.ac.in", "HOD"),
]

PASSWORD = "csepassword"


class _AuthMixin:
    """Shared login/CSRF handling for both user types."""

    def _login(self, username, role):
        # Same two-step flow as frontend/src/api.ts: fetch the CSRF cookie first.
        self.client.get("/api/csrf/", name="/api/csrf/")
        csrftoken = self.client.cookies.get("csrftoken")
        resp = self.client.post(
            "/api/login/",
            json={"username": username, "password": PASSWORD, "role": role},
            headers={"X-CSRFToken": csrftoken},
            name="/api/login/",
        )
        if resp.status_code != 200:
            resp.failure(f"login failed for {username}: {resp.status_code} {resp.text}")


class Student(_AuthMixin, HttpUser):
    """A student repeatedly checking their clearance status — the dominant
    traffic pattern in the days before an exit deadline."""

    wait_time = between(2, 8)

    def on_start(self):
        username, role = random.choice(STUDENT_LOGINS)
        self._login(username, role)

    @task(5)
    def check_status(self):
        self.client.get("/api/student/request/", name="/api/student/request/")

    @task(1)
    def check_me(self):
        self.client.get("/api/me/", name="/api/me/")


class SectionOfficer(_AuthMixin, HttpUser):
    """An officer polling their scoped queue."""

    wait_time = between(5, 15)

    def on_start(self):
        username, role = random.choice(OFFICER_LOGINS)
        self._login(username, role)

    @task
    def check_queue(self):
        self.client.get("/api/section/queue/", name="/api/section/queue/")


# Locust picks up both User classes automatically and mixes them by weight.
# A realistic run for "thousands of students" during a clearance window:
#   locust -f docs/loadtest/locustfile.py --host https://staging.example.org \
#       --users 3000 --spawn-rate 50 --run-time 15m --headless \
#       --csv=results/nodues_loadtest
