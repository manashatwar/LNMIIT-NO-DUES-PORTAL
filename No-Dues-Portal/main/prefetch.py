"""
Batch loading — the fix for the N+1 query problem on the desks and dashboards.

The business-rule helpers (engine.actionable, staff.current_level,
refunds.row_state, checklist.entries, …) each read a few related objects of one
row. A desk calls them once per row, so they used to run a few queries *per
row*: 2,869 queries for the accounts@ desk at 341 students.

The fix has two halves:
* List views load everything those helpers will read up front, with
  `select_related()` (a SQL JOIN, for forward foreign keys) and
  `prefetch_related()` (one extra `WHERE … IN (…)` query per relation, however
  many rows there are). `for_desk()` and `request_detail()` below say what to load.
* The helpers use the loaded objects when they are there (`prefetched()`) and
  otherwise run their original single query, so a helper called on a lone
  object — in a write path, say — behaves exactly as before.

Two rules when changing this:
* A helper must read a prefetched relation by *iterating* it. `.filter()`,
  `.order_by()`, `.values_list()` or `.exists()` on a related manager always run
  a new query and silently bring the N+1 back.
* A prefetch of `section_statuses` must `select_related("section")`, because
  the helpers read `status.section.code`.

main/tests.py `QueryCountTests` fails if a desk's query count grows with its rows.
"""
from django.db.models import Prefetch

from .models import ChecklistTick, Comment, Document, SectionStatus, StageApproval


def prefetched(instance, relation):
    """The objects prefetch_related() already loaded for `instance.<relation>`
    (a list; reading it never touches the database), or None when they weren't
    prefetched — the caller then runs its usual query."""
    cache = getattr(instance, "_prefetched_objects_cache", None) if instance is not None else None
    if not cache or relation not in cache:
        return None
    return list(cache[relation])


def latest_document(documents):
    """The newest document: what `.order_by("-uploaded_at", "-id").first()` returns."""
    return max(documents, key=lambda d: (d.uploaded_at, d.id), default=None)


def section_detail(*, stages=False):
    """What a section's full view reads (api._section_dict): the message thread
    with authors, the documents, and the checklist ticks — plus, with `stages`,
    the staff-level approvals (Accounts)."""
    lookups = [
        Prefetch("comments", queryset=Comment.objects.select_related("author").order_by("created_at")),
        Prefetch("documents", queryset=Document.objects.order_by("uploaded_at")),
        Prefetch("checklist_ticks", queryset=ChecklistTick.objects.select_related("ticked_by")),
    ]
    if stages:
        lookups.append(Prefetch("stage_approvals", queryset=StageApproval.objects.select_related("approved_by")))
    return lookups


def section_statuses(prefix="", *, details=False):
    """A request's sections, each with its Section (engine._status_map reads
    `status.section.code`), in the institute's section order (Section.order:
    Library first, Administration last) — an explicit order, because Postgres
    returns unordered rows in storage order, which changes when a row is updated.
    `details`: also who decided, plus section_detail()."""
    queryset = SectionStatus.objects.select_related("section").order_by("section__order", "id")
    if details:
        queryset = queryset.select_related("decided_by").prefetch_related(*section_detail())
    return Prefetch(prefix + "section_statuses", queryset=queryset)


def for_desk(qs, *, prerequisites=False, stages=False, checklist=False, labs=False, refunds=False):
    """A desk's SectionStatus rows, with what that desk's serializer reads:
      prerequisites — the request's other sections (engine.actionable, staff.waiting_for)
      stages        — the staff-level approvals and documents (Accounts' levels)
      checklist     — the checklist ticks (Administration)
      labs          — the request's department-lab rows (HOD)
      refunds       — the request's refund (the refund sender's Approved tab)."""
    qs = qs.select_related("section", "assigned_to", "request__student__department",
                           "request__student__hostel")
    lookups = []
    if prerequisites or refunds:
        lookups.append(section_statuses("request__"))
    if stages or refunds:
        lookups += [Prefetch("stage_approvals", queryset=StageApproval.objects.select_related("approved_by")),
                    "documents"]
    if checklist:
        lookups.append(Prefetch("checklist_ticks", queryset=ChecklistTick.objects.select_related("ticked_by")))
    if labs:
        lookups.append("request__lab_statuses")
    if refunds:
        qs = qs.select_related("request__refund__recorded_by")
    return qs.prefetch_related(*lookups)


def request_detail():
    """What the student's dashboard and an officer's review read about one
    request — for `prefetch_related_objects([request], *request_detail())`."""
    return ["student__department", "student__hostel", section_statuses(details=True), "lab_statuses", "refund"]
