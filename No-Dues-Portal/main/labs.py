"""
Department lab management — the backend of the HOD's "Manage Labs" panel.

An HOD registers their own department's labs and arranges them in levels
(see engine.py § Department labs for how levels gate a request). Adding a lab
also creates the lab in-charge's portal login — a Django User whose username is
the email the HOD entered, with role LAB — so the in-charge can sign in straight
away (main/accounts.py: shared validation, hashed passwords).
"""
from django.db import transaction

from . import engine
from .accounts import (
    AccountError, clean_level as _clean_level, clean_name, clean_email, check_password, create_login,
)
from .models import Lab, ROLE_LAB

LabError = AccountError   # what callers catch (api.py)


def _removed_lab_hint(user):
    removed = Lab.objects.filter(user=user, is_active=False).first()
    if removed is not None:
        return f"This email belongs to the removed lab '{removed.name}' — restore that lab instead."
    return None


def _check_unique_name(department, name, exclude_lab=None):
    clash = Lab.objects.filter(department=department, name__iexact=name)
    if exclude_lab is not None:
        clash = clash.exclude(pk=exclude_lab.pk)
    other = clash.first()
    if other is None:
        return
    if other.is_active:
        raise LabError(f"{department.code} already has a lab named '{other.name}'.")
    raise LabError(f"'{other.name}' was removed earlier — restore it instead of adding it again.")


@transaction.atomic
def create_lab(department, *, name, email, password, level, incharge_name=""):
    """Add a lab to `department` and create its in-charge's login."""
    name = clean_name(name, "Lab name", required=True)
    incharge_name = clean_name(incharge_name, "In-charge name")
    level = _clean_level(level)
    email = clean_email(email, explain_clash=_removed_lab_hint)
    _check_unique_name(department, name)
    user = create_login(email=email, password=password, name=incharge_name,
                        role=ROLE_LAB, department=department)
    return Lab.objects.create(department=department, name=name, incharge_name=incharge_name,
                              level=level, user=user)


@transaction.atomic
def update_lab(lab, data):
    """
    Edit any of: name, incharge_name, email, level, password; or restore a
    removed lab with {"is_active": true}. A new level only affects students who
    start their lab chain after this — requests already in progress keep the
    level they started with (LabStatus.level).
    """
    user = lab.user
    if "name" in data:
        name = clean_name(data["name"], "Lab name", required=True)
        _check_unique_name(lab.department, name, exclude_lab=lab)
        lab.name = name
    if "incharge_name" in data:
        lab.incharge_name = clean_name(data["incharge_name"], "In-charge name")
        user.first_name = lab.incharge_name[:150]
    if "email" in data:
        email = clean_email(data["email"], exclude_user=user, explain_clash=_removed_lab_hint)
        user.username = email
        user.email = email
    if "level" in data:
        lab.level = _clean_level(data["level"])
    if data.get("password"):
        check_password(data["password"], user)
        user.set_password(data["password"])
    if data.get("is_active") is True and not lab.is_active:
        _check_unique_name(lab.department, lab.name, exclude_lab=lab)
        lab.is_active = True
        user.is_active = True
    lab.save()
    user.save()
    return lab


@transaction.atomic
def remove_lab(lab, actor):
    """
    Take a lab out of the department's chain. It stops blocking any student it
    hasn't approved yet, and its login is disabled. If no request ever involved
    it, the lab and its login are deleted outright (so the name/email can be
    reused); otherwise it's kept, inactive, for the records of past approvals.
    Returns (outcome, released) — outcome is "deleted" or "deactivated".
    """
    released = engine.drop_lab_from_open_requests(lab, actor)
    if not lab.statuses.exists():
        user = lab.user
        lab.delete()
        user.delete()   # cascades the UserProfile
        return "deleted", released
    lab.is_active = False
    lab.save(update_fields=["is_active"])
    lab.user.is_active = False
    lab.user.save(update_fields=["is_active"])
    return "deactivated", released
