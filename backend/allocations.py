"""Company composition from explicit IC assignments; never allocates manager pay."""

from collections import deque
from decimal import Decimal
from backend.domain import active, children, number


def allocation_summaries(state, as_of, visible_ids, include_contractors=True):
    people = state["Employees"]
    assignments = state.get("CompanyAllocations", {})
    reports = children(people, "ManagerID")
    remaining = {key: len(reports.get(key, [])) for key in people}
    queue = deque(key for key, count in remaining.items() if not count)
    # Counts, FTE, Divergent-weighted FTE, missing assignments, hidden contributors.
    totals = {key: [0, Decimal(0), Decimal(0), 0, False, 0] for key in people}
    result = {}
    while queue:
        key = queue.popleft()
        person = people[key]
        manager = bool(reports.get(key))
        assignment = assignments.get(key)
        if (
            not manager
            and active(person, as_of)
            and (include_contractors or not is_contractor(person))
        ):
            fte = number(person.get("FTE") or 0)
            totals[key] = [
                1,
                fte,
                (
                    fte * number(assignment["DivergentPercent"]) / 100
                    if assignment
                    else Decimal(0)
                ),
                0 if assignment else 1,
                key not in visible_ids,
                int(person.get("FTE", "") == ""),
            ]
        count, fte, divergent_fte, missing, hidden, missing_fte = totals[key]
        if key in visible_ids:
            summary = {
                "mode": "calculated" if manager else "explicit",
                "canEdit": not manager
                and person.get("EmploymentStatus") not in {"vacant", "draft"},
            }
            if manager and hidden:
                summary.update(status="restricted", canEdit=False)
            else:
                if not manager and active(person, as_of):
                    status = "complete" if assignment else "unassigned"
                elif not count:
                    status = "no-contributors"
                elif missing:
                    status = "incomplete" if manager else "unassigned"
                elif manager and missing_fte:
                    status = "missing-fte"
                elif manager and fte == 0:
                    status = "zero-fte"
                else:
                    status = "complete"
                percent = None
                if status == "complete":
                    percent = (
                        round(float(divergent_fte / fte * 100), 2)
                        if manager
                        else float(number(assignment["DivergentPercent"]))
                    )
                summary.update(
                    status=status,
                    contributorCount=count,
                    contributorFTE=float(fte),
                    unassignedCount=missing,
                    missingFTE=missing_fte,
                    divergentPercent=percent,
                    czingerPercent=(
                        round(100 - percent, 2) if percent is not None else None
                    ),
                )
            result[key] = summary
        parent = person.get("ManagerID")
        if parent in people:
            target = totals[parent]
            for index in range(4):
                target[index] += totals[key][index]
            target[4] = target[4] or hidden
            target[5] += missing_fte
            remaining[parent] -= 1
            if remaining[parent] == 0:
                queue.append(parent)
    return result


def is_contractor(person):
    kind = person.get("EmploymentType", "").lower()
    return any(
        word in kind
        for word in ("contractor", "consultant", "vendor", "agency", "temp")
    )
