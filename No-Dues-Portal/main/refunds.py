"""
Refunds — the last step before a student's clearance completes.

Once every section has approved, Accounts pays the student's refund (caution
money less the Fund-Us donation) to the bank account from their cancelled
cheque, then records it here: amount, mode, transaction reference (UTR) and
date — or that no refund was due. Only then is the request cleared
(engine.recompute_overall) and the certificate unlocked.

The student is told in the portal: their dashboard shows the refund, and a
note is added to their Accounts message thread. (No email yet.)

Who records refunds: always the main account (accounts@, which also gives
Accounts' final approval), plus any staff it made *refund managers*
(UserProfile.is_refund_manager), from the Refund column of their Approved tab.
The sender can instead reject the request with a reason (e.g. wrong bank
details): Accounts goes back to the student, who fixes it and goes through the
levels again.

A record is never removed, since the money can't be unsent — if a section
reopens afterwards the certificate is withdrawn as usual, and the request
clears again on re-approval without a second payment.
"""
from datetime import date
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone

from . import engine
from . import staff as staff_service
from .models import (
    ClearanceRequest, Comment, Refund, SectionStatus, UserProfile, SECTION_ACCOUNTS,
    STATUS_PENDING, STATUS_REJECTED, STATUS_APPROVED,
)

CAUTION_MONEY = Decimal("10000")   # what the student's Refund Ledger (Page 4) starts from
MODES = ["NEFT", "IMPS", "RTGS", "UPI", "CHEQUE"]
MAX_AMOUNT = Decimal("99999999.99")
# Payment dates are the institute's calendar dates (LNMIIT, Jaipur), whatever
# time zone the server runs in — otherwise "today" is yesterday in the evening.
INSTITUTE_TZ = ZoneInfo("Asia/Kolkata")


def today():
    return timezone.localdate(timezone=INSTITUTE_TZ)


class RefundError(ValueError):
    """A refund record was refused; the message is shown to the user."""


# ─── Who sends refunds ───────────────────────────────────────────────────────────

def refund_level():
    """The last level of Accounts' chain (None while it has no levels)."""
    levels = staff_service.level_names(SECTION_ACCOUNTS)
    return max(levels) if levels else None


def _staff():
    """Accounts' active staff (not the main account)."""
    return (UserProfile.objects.filter(role=SECTION_ACCOUNTS, user__is_active=True, managed_by__isnull=False)
            .select_related("user"))


def senders():
    """The profiles that send refunds: the main account, always, plus any staff it
    made refund managers. (Only if there were no main account at all would the
    staff on the last level send them.)"""
    head = staff_service.head_profile(SECTION_ACCOUNTS)
    people = ([head] if head is not None and head.user.is_active else []) + [p for p in _staff() if p.is_refund_manager]
    if people:
        return people
    level = refund_level()
    return [p for p in _staff() if p.staff_level == level] if level is not None else []


def can_record(profile):
    """Does this person send refunds (the Refund column of their Approved tab)?"""
    if profile is None or profile.role != SECTION_ACCOUNTS or not profile.user.is_active:
        return False
    return any(p.pk == profile.pk for p in senders())


def sender_names(viewer=None):
    """Who sends refunds now; the head reading Manage staff sees itself as "You"."""
    return ["You (main account)" if viewer is not None and p.pk == viewer.pk
            else p.user.get_full_name() or p.user.username for p in senders()]


def suggested_amount(req):
    """Caution money less the student's Fund-Us donation (never below zero)."""
    donation = Decimal(str(req.fund_us_amount)) if req.fund_us_amount is not None else Decimal("0")
    return max(CAUTION_MONEY - donation, Decimal("0")).quantize(Decimal("0.01"))


def bank_details(req):
    """The bank account the student confirmed with Accounts (their cancelled cheque)."""
    ss = SectionStatus.objects.filter(request=req, section__code=SECTION_ACCOUNTS).first()
    latest = ss.documents.order_by("-uploaded_at", "-id").first() if ss is not None else None
    review = ((latest.ocr_fields or {}).get("review") or {}) if latest is not None else {}
    return {key: str(review.get(key) or "") for key in ("account_holder", "account_no", "ifsc", "bank_name")}


def masked(account_no):
    digits = str(account_no or "").strip()
    return f"••••{digits[-4:]}" if len(digits) >= 4 else digits


def pending():
    """Active requests with every section approved and no refund recorded yet, oldest first."""
    return (ClearanceRequest.objects
            .filter(is_active=True, refund__isnull=True, section_statuses__isnull=False)
            .exclude(section_statuses__status__in=[STATUS_PENDING, STATUS_REJECTED])
            .distinct().select_related("student").order_by("created_at", "id"))


def status_for(req):
    """The refund as the student sees it."""
    refund = Refund.objects.filter(request=req).first()
    if refund is not None:
        return {
            "status": "sent" if refund.amount > 0 else "not_due",
            "amount": str(refund.amount), "mode": refund.mode, "reference": refund.reference,
            "paid_on": refund.paid_on.isoformat() if refund.paid_on else None,
            "account": masked(bank_details(req)["account_no"]),
        }
    return {
        # pending = every section approved, Accounts is sending it; waiting = not there yet
        "status": "pending" if engine.all_sections_approved(req) else "waiting",
        "amount": str(suggested_amount(req)), "mode": "", "reference": "", "paid_on": None,
        "account": masked(bank_details(req)["account_no"]),
    }


def _amount(value):
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError):
        raise RefundError("Enter the amount paid, e.g. 10000.") from None
    if amount <= 0 or amount > MAX_AMOUNT:
        raise RefundError("The amount paid must be more than zero. If nothing is due, use \"No refund due\".")
    return amount


def _paid_on(value):
    if value in (None, ""):
        return today()
    try:
        day = date.fromisoformat(str(value))
    except ValueError:
        raise RefundError("Enter the payment date as YYYY-MM-DD.") from None
    if day > today():
        raise RefundError("The payment date can't be in the future.")
    return day


@transaction.atomic
def record(req, user, *, amount=None, mode=None, reference=None, paid_on=None, no_refund=False):
    """Record (or correct) the refund for a request whose every section has
    approved; tell the student in their Accounts thread; clear the request."""
    req = ClearanceRequest.objects.select_for_update().get(pk=req.pk)
    if not req.is_active or not engine.all_sections_approved(req):
        raise RefundError("Not every section has approved this request yet.")
    if no_refund:
        values = dict(amount=Decimal("0.00"), mode="", reference="", paid_on=today())
    else:
        mode = str(mode or "").strip().upper()
        if mode not in MODES:
            raise RefundError(f"Choose how it was paid: {', '.join(MODES)}.")
        reference = " ".join(str(reference or "").split())
        if not reference:
            raise RefundError("Enter the transaction reference (UTR) from the bank.")
        if len(reference) > 64:
            raise RefundError("The transaction reference is too long.")
        values = dict(amount=_amount(amount), mode=mode, reference=reference, paid_on=_paid_on(paid_on))
    refund, created = Refund.objects.update_or_create(request=req, defaults={**values, "recorded_by": user})

    account = masked(bank_details(req)["account_no"])
    if refund.amount > 0:
        body = (f"💸 Refund {'sent' if created else 'details corrected'}: ₹{refund.amount:,.2f} to your account"
                f"{f' {account}' if account else ''} by {refund.mode} on {refund.paid_on:%d %b %Y}"
                f" · UTR / reference {refund.reference}. Your No-Dues certificate is ready to download.")
    else:
        body = "No refund was due (your caution money went to your Fund-Us donation / dues). Your No-Dues certificate is ready to download."
    accounts_ss = SectionStatus.objects.filter(request=req, section__code=SECTION_ACCOUNTS).first()
    if accounts_ss is not None:
        Comment.objects.create(section_status=accounts_ss, author=None, is_system=True, body=body)
    engine.recompute_overall(req)
    return refund


@transaction.atomic
def reject(req, user, reason):
    """Instead of paying: send Accounts back to the student with a reason (e.g.
    the bank details don't match). They fix it and it goes through the levels
    again. Only before a refund has been recorded."""
    req = ClearanceRequest.objects.select_for_update().get(pk=req.pk)
    if Refund.objects.filter(request=req).exists():
        raise RefundError("This refund has already been recorded.")
    accounts_ss = SectionStatus.objects.filter(request=req, section__code=SECTION_ACCOUNTS).first()
    if accounts_ss is None or accounts_ss.status != STATUS_APPROVED:
        raise RefundError("Only a request Accounts has approved can be sent back from here.")
    try:
        engine.reject(accounts_ss, user, reason)
    except engine.ValidationError_ as e:
        raise RefundError(str(e)) from None
    return accounts_ss


def row_state(req):
    """A request's refund, as the refund sender's Approved tab shows it:
    waiting (other sections still to approve — listed), ready (send it now),
    sent, or not_due — plus the bank details, suggested amount and the record."""
    refund = Refund.objects.filter(request=req).select_related("recorded_by").first()
    statuses = list(req.section_statuses.select_related("section"))
    pending = [s.section.name for s in statuses if s.status != STATUS_APPROVED]
    state = (("sent" if refund.amount > 0 else "not_due") if refund is not None
             else "waiting" if pending or not statuses else "ready")
    return {**row(req, refund), "state": state, "waiting_for": pending if state == "waiting" else []}


def recent(limit=200):
    """Refunds already recorded, newest first (for the Accounts head's list)."""
    return (Refund.objects.filter(request__is_active=True)
            .select_related("request__student", "recorded_by").order_by("-recorded_at")[:limit])


def row(req, refund=None):
    """A request with its refund, as the refund sender sees it."""
    return {
        "request_id": req.id,
        "roll_no": req.student.roll_no,
        "name": req.student.name,
        "department": req.student.department.code if req.student.department_id else "",
        "fund_us_amount": str(req.fund_us_amount),
        "suggested_amount": str(suggested_amount(req)),
        "bank": bank_details(req),
        "refund": None if refund is None else {
            "amount": str(refund.amount), "mode": refund.mode, "reference": refund.reference,
            "paid_on": refund.paid_on.isoformat() if refund.paid_on else None,
            "recorded_by": (refund.recorded_by.get_full_name() or refund.recorded_by.username)
            if refund.recorded_by else None,
            "recorded_at": refund.recorded_at.isoformat(),
        },
    }
