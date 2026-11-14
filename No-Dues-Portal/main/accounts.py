"""
Portal logins created from inside the app — lab in-charges (added by their HOD,
main/labs.py) and section staff (added by a section head, main/staff.py).

Shared validation and creation: the username is the email, passwords go through
Django's password validators and are stored hashed, and nothing here ever
returns a password.
"""
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from .models import UserProfile

MAX_NAME = 120
MAX_LEVEL = 20


class AccountError(Exception):
    """A validation problem to show to the person as-is."""


def clean_level(value):
    """A hierarchy level (lab levels, Accounts staff levels): 1 goes first."""
    try:
        level = int(value)
    except (TypeError, ValueError):
        raise AccountError("Level must be a whole number (1 = receives the request first).")
    if not 1 <= level <= MAX_LEVEL:
        raise AccountError(f"Level must be between 1 and {MAX_LEVEL}.")
    return level


def clean_name(value, what, required=False):
    name = " ".join((value or "").split())
    if required and not name:
        raise AccountError(f"{what} is required.")
    if len(name) > MAX_NAME:
        raise AccountError(f"{what} must be at most {MAX_NAME} characters.")
    return name


def clean_email(value, exclude_user=None, explain_clash=None):
    """A valid, lower-cased email no other login uses. `explain_clash(user)` may
    return a more helpful message when it clashes (e.g. "restore that lab")."""
    email = (value or "").strip().lower()
    if not email:
        raise AccountError("Login email is required.")
    try:
        validate_email(email)
    except ValidationError:
        raise AccountError("Enter a valid email address.")
    clash = User.objects.filter(username__iexact=email)
    if exclude_user is not None:
        clash = clash.exclude(pk=exclude_user.pk)
    other = clash.first()
    if other is not None:
        hint = explain_clash(other) if explain_clash else None
        raise AccountError(hint or "This email is already used by another portal account.")
    return email


def check_password(password, user):
    if not password:
        raise AccountError("Password is required.")
    try:
        validate_password(password, user=user)
    except ValidationError as e:
        raise AccountError(" ".join(e.messages))


def create_login(*, email, password, name, role, department=None, hostel=None, managed_by=None,
                 staff_level=None):
    """Create a login (username = email) and its profile. Clean `email`/`name` first."""
    user = User(username=email, email=email, first_name=name[:150])
    check_password(password, user)
    user.set_password(password)
    user.save()
    UserProfile.objects.create(user=user, role=role, department=department, hostel=hostel,
                               managed_by=managed_by, staff_level=staff_level)
    return user
