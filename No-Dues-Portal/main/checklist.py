"""
Section checklists — things a student must complete in person at a section's
office before that section can approve. Administration's starts with "Physical
ID card submitted" (CHECKLIST_SECTIONS / DEFAULT_ITEMS).

The section's office (its head, or staff the request has reached) ticks each
item for a request as it's done; the section's Approve is refused until every
active item is ticked (api._decide). The head manages the list. An item that
was ever ticked is kept, inactive, when removed, so past ticks stay on record.
Ticks survive a reopen: what was handed in stays handed in.
"""
from django.db import transaction

from .models import ChecklistItem, ChecklistTick, Section, SECTION_ADMINISTRATION, STATUS_PENDING
from .prefetch import prefetched

CHECKLIST_SECTIONS = [SECTION_ADMINISTRATION]
DEFAULT_ITEMS = {SECTION_ADMINISTRATION: ["Physical ID card submitted"]}
MAX_LABEL = 120


class ChecklistError(ValueError):
    """A checklist change was refused; the message is shown to the user."""


def enabled(section_code):
    return section_code in CHECKLIST_SECTIONS


def items(section_code):
    """The section's active checklist, in order."""
    return list(ChecklistItem.objects.filter(section__code=section_code, is_active=True))


def _display(user):
    return user.get_full_name() or user.username


def entries(ss, active_items=None):
    """[{id, label, done, by, at}]: the section's checklist for one request."""
    if active_items is None:
        active_items = items(ss.section.code)
    if not active_items:
        return []
    loaded = prefetched(ss, "checklist_ticks")
    ticks = {t.item_id: t for t in (loaded if loaded is not None else ss.checklist_ticks.select_related("ticked_by"))}
    rows = []
    for item in active_items:
        tick = ticks.get(item.id)
        rows.append({
            "id": item.id, "label": item.label, "done": tick is not None,
            "by": _display(tick.ticked_by) if tick is not None and tick.ticked_by else None,
            "at": tick.ticked_at.isoformat() if tick is not None else None,
        })
    return rows


def missing(ss):
    """Labels of the active items not ticked yet for this request."""
    done = set(ss.checklist_ticks.values_list("item_id", flat=True))
    return [item.label for item in items(ss.section.code) if item.id not in done]


@transaction.atomic
def set_tick(ss, item_id, done, user):
    """Tick (or untick) one item for a pending request. Returns the new entries."""
    if ss.status != STATUS_PENDING:
        raise ChecklistError("Only a request that is still pending can be ticked.")
    item = ChecklistItem.objects.filter(id=item_id, section=ss.section, is_active=True).first()
    if item is None:
        raise ChecklistError("That checklist item doesn't exist.")
    if done:
        ChecklistTick.objects.get_or_create(section_status=ss, item=item, defaults={"ticked_by": user})
    else:
        ChecklistTick.objects.filter(section_status=ss, item=item).delete()
    return entries(ss)


def add_item(section_code, label):
    label = " ".join(str(label or "").split())
    if not label:
        raise ChecklistError("Write what the student has to do, e.g. \"Physical ID card submitted\".")
    if len(label) > MAX_LABEL:
        raise ChecklistError(f"Keep it under {MAX_LABEL} characters.")
    section = Section.objects.get(code=section_code)
    if ChecklistItem.objects.filter(section=section, is_active=True, label__iexact=label).exists():
        raise ChecklistError("That item is already on the checklist.")
    last = ChecklistItem.objects.filter(section=section).order_by("-order").first()
    return ChecklistItem.objects.create(section=section, label=label, order=(last.order + 1) if last else 1)


def remove_item(section_code, item_id):
    """Remove an item: deleted outright if never ticked, else kept inactive.
    Returns "deleted" / "deactivated", or None if there's no such item."""
    item = ChecklistItem.objects.filter(id=item_id, section__code=section_code, is_active=True).first()
    if item is None:
        return None
    if item.ticks.exists():
        item.is_active = False
        item.save(update_fields=["is_active"])
        return "deactivated"
    item.delete()
    return "deleted"


def ensure_defaults(section_code):
    """Give a section its starting checklist if it has never had one (seed_demo)."""
    section = Section.objects.filter(code=section_code).first()
    if section is None or ChecklistItem.objects.filter(section=section).exists():
        return
    for order, label in enumerate(DEFAULT_ITEMS.get(section_code, []), start=1):
        ChecklistItem.objects.create(section=section, label=label, order=order)
