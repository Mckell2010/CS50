"""Workbook contract and business rules; independent of HTTP and persistence."""

from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation
import copy

LOCATION_OPTIONS = ("Los Angeles - HQ", "Los Angeles - LB", "Washington DC", "Remote")

COLUMNS = {
    "OrganizationalUnits": [
        "OrgUnitID",
        "OrgUnitName",
        "ParentOrgUnitID",
        "UnitType",
        "OwnerEmployeeID",
        "Tier",
        "DepartmentCode",
    ],
    "Employees": [
        "EmployeeID",
        "Name",
        "JobTitle",
        "ManagerID",
        "OrgUnitID",
        "EmploymentStatus",
        "FTE",
        "StartDate",
        "EndDate",
        "Location",
        "EmploymentType",
        "ExemptionStatus",
        "SourceCompany",
        "FTEBasis",
    ],
    "CompanyAllocations": ["EmployeeID", "DivergentPercent"],
    "Compensation": [
        "EmployeeID",
        "EffectiveFrom",
        "EffectiveTo",
        "Currency",
        "AnnualBasePay",
        "AnnualTargetBonus",
        "AnnualEmployerCosts",
        "PayBasis",
        "HourlyRate",
        "AnnualHours",
        "MonthlyRate",
    ],
    "Budgets": [
        "BudgetID",
        "OrgUnitID",
        "BudgetYear",
        "Currency",
        "ApprovedEnvelope",
        "DirectAllocation",
        "AllocationPercent",
        "DirectPercent",
    ],
    "Objectives": [
        "ObjectiveID",
        "OrgUnitID",
        "OwnerEmployeeID",
        "ParentObjectiveID",
        "ObjectiveText",
        "PeriodStart",
        "PeriodEnd",
        "Status",
    ],
    "KeyResults": [
        "KeyResultID",
        "ObjectiveID",
        "OwnerEmployeeID",
        "MetricName",
        "Unit",
        "Baseline",
        "CurrentValue",
        "TargetValue",
        "Direction",
        "LastUpdated",
    ],
}
KEYS = {s: c[0] for s, c in COLUMNS.items()}
REQUIRED = {
    "OrganizationalUnits": ["OrgUnitID", "OrgUnitName", "UnitType"],
    "Employees": [
        "EmployeeID",
        "Name",
        "JobTitle",
        "OrgUnitID",
        "EmploymentStatus",
        "FTE",
        "StartDate",
    ],
    "CompanyAllocations": ["EmployeeID", "DivergentPercent"],
    "Compensation": [
        "EmployeeID",
        "EffectiveFrom",
        "Currency",
        "AnnualBasePay",
        "AnnualTargetBonus",
        "AnnualEmployerCosts",
    ],
    "Budgets": [
        "BudgetID",
        "OrgUnitID",
        "BudgetYear",
        "Currency",
        "ApprovedEnvelope",
        "DirectAllocation",
    ],
    "Objectives": [
        "ObjectiveID",
        "OrgUnitID",
        "OwnerEmployeeID",
        "ObjectiveText",
        "PeriodStart",
        "PeriodEnd",
        "Status",
    ],
    "KeyResults": [
        "KeyResultID",
        "ObjectiveID",
        "OwnerEmployeeID",
        "MetricName",
        "Unit",
        "Direction",
    ],
}
APP_FIELDS = {
    "Compensation": set(COLUMNS["Compensation"]),
    "Employees": set(COLUMNS["Employees"]),
    "CompanyAllocations": set(COLUMNS["CompanyAllocations"]),
    "OrganizationalUnits": set(COLUMNS["OrganizationalUnits"]),
    "Budgets": set(COLUMNS["Budgets"]),
    "Objectives": set(COLUMNS["Objectives"]),
    "KeyResults": set(COLUMNS["KeyResults"]),
}
MONEY = [
    "AnnualBasePay",
    "AnnualTargetBonus",
    "AnnualEmployerCosts",
    "ApprovedEnvelope",
    "DirectAllocation",
    "HourlyRate",
    "MonthlyRate",
]
DATE_FIELDS = {
    "StartDate",
    "EndDate",
    "EffectiveFrom",
    "EffectiveTo",
    "PeriodStart",
    "PeriodEnd",
    "LastUpdated",
}


def empty_state():
    return {s: {} for s in COLUMNS}


def record_key(sheet, row):
    return (
        f"{row.get('EmployeeID','')}@{row.get('EffectiveFrom','')}"
        if sheet == "Compensation"
        else str(row.get(KEYS[sheet], ""))
    )


def clean_value(value):
    if value is None:
        return ""
    if isinstance(value, (date, datetime)):
        return value.strftime("%Y-%m-%d")
    return str(value).strip()


def number(value):
    d = Decimal(str(value))
    if not d.is_finite():
        raise ValueError("Must be a finite number")
    return d


def cents(value):
    return int((number(value) * 100).quantize(Decimal("1")))


def children(records, parent):
    out = {}
    for key, row in records.items():
        out.setdefault(row.get(parent, ""), []).append(key)
    return out


def descendants(records, parent, root):
    adjacency = children(records, parent)
    seen = set()
    pending = [root]
    while pending:
        key = pending.pop()
        if key in seen or key not in records:
            continue
        seen.add(key)
        pending.extend(adjacency.get(key, []))
    return seen


def validate(state):
    errors = []
    warnings = []

    def err(s, r, f, m):
        errors.append(
            {
                "sheet": s,
                "row": r.get("_row"),
                "id": record_key(s, r),
                "field": f,
                "message": m,
            }
        )

    refs = {
        "Employees": {"ManagerID": "Employees", "OrgUnitID": "OrganizationalUnits"},
        "OrganizationalUnits": {
            "ParentOrgUnitID": "OrganizationalUnits",
            "OwnerEmployeeID": "Employees",
        },
        "CompanyAllocations": {"EmployeeID": "Employees"},
        "Compensation": {"EmployeeID": "Employees"},
        "Budgets": {"OrgUnitID": "OrganizationalUnits"},
        "Objectives": {
            "OrgUnitID": "OrganizationalUnits",
            "OwnerEmployeeID": "Employees",
            "ParentObjectiveID": "Objectives",
        },
        "KeyResults": {"ObjectiveID": "Objectives", "OwnerEmployeeID": "Employees"},
    }
    for sheet, records in state.items():
        for key, row in records.items():
            for field in REQUIRED[sheet]:
                if sheet == "Budgets" and (
                    (
                        field == "ApprovedEnvelope"
                        and row.get("AllocationPercent", "") != ""
                    )
                    or (
                        field == "DirectAllocation"
                        and row.get("DirectPercent", "") != ""
                    )
                ):
                    continue
                if (
                    sheet == "Compensation"
                    and row.get("PayBasis")
                    and field in MONEY[:3]
                ):
                    continue
                if sheet == "Employees" and (
                    field == "FTE"
                    or (
                        field == "StartDate"
                        and row.get("EmploymentStatus") in {"vacant", "draft"}
                    )
                ):
                    continue
                if row.get(field, "") == "":
                    err(sheet, row, field, "Required value is missing")
            for field, target in refs.get(sheet, {}).items():
                if row.get(field) and row[field] not in state[target]:
                    err(sheet, row, field, f"Unknown {target} ID: {row[field]}")
            for field in COLUMNS[sheet]:
                value = row.get(field, "")
                if value == "":
                    continue
                if isinstance(value, str) and (
                    value.startswith("=") or len(value) > 4000
                ):
                    err(
                        sheet,
                        row,
                        field,
                        "Use literal text of at most 4,000 characters; formulas are not allowed",
                    )
                if field.endswith("ID") and (
                    len(str(value)) > 128
                    or any(ch in str(value) for ch in ["/", "\\", "\n", "\r", "\x00"])
                ):
                    err(
                        sheet,
                        row,
                        field,
                        "IDs must be at most 128 characters with no slashes or control characters",
                    )
                if field in DATE_FIELDS:
                    try:
                        date.fromisoformat(str(value))
                    except ValueError:
                        err(sheet, row, field, "Use ISO date YYYY-MM-DD")
                if field in MONEY or field in [
                    "FTE",
                    "Baseline",
                    "CurrentValue",
                    "TargetValue",
                    "BudgetYear",
                    "AnnualHours",
                    "AllocationPercent",
                    "DirectPercent",
                ]:
                    try:
                        n = number(value)
                        if field in MONEY and (
                            n < 0
                            or n > Decimal("1000000000000")
                            or n.as_tuple().exponent < -2
                        ):
                            raise ValueError(
                                "Use a nonnegative amount with at most two decimals (maximum 1 trillion)"
                            )
                        if (
                            field in {"AllocationPercent", "DirectPercent"}
                            and not 0 <= n <= 100
                        ):
                            raise ValueError("Percentage must be between 0 and 100")
                        if field == "AnnualHours" and not 0 <= n <= 8784:
                            raise ValueError("Annual hours must be between 0 and 8784")
                        if field == "FTE" and not 0 <= n <= 1:
                            raise ValueError("FTE must be between 0 and 1")
                        if field == "BudgetYear" and (
                            n != int(n) or not 2000 <= n <= 2200
                        ):
                            raise ValueError(
                                "Use a whole calendar year from 2000 to 2200"
                            )
                    except (InvalidOperation, ValueError):
                        err(
                            sheet,
                            row,
                            field,
                            "Invalid numeric value or out of allowed range",
                        )
            if sheet == "Employees":
                exemption = row.get("ExemptionStatus")
                if exemption and (
                    row.get("EmploymentType") != "FTE"
                    or exemption not in {"exempt", "non-exempt"}
                ):
                    err(
                        sheet,
                        row,
                        "ExemptionStatus",
                        "Choose exempt or non-exempt for an FTE only",
                    )
            if sheet == "Compensation" and row.get("PayBasis"):
                basis = row["PayBasis"]
                required_pay = {
                    "salary": ["AnnualBasePay", "AnnualTargetBonus"],
                    "hourly": ["HourlyRate"],
                    "monthly": ["MonthlyRate"],
                }
                if basis not in required_pay:
                    err(sheet, row, "PayBasis", "Choose salary, hourly, or monthly")
                else:
                    for field in required_pay[basis]:
                        if row.get(field, "") == "":
                            err(
                                sheet,
                                row,
                                field,
                                "Required compensation value is missing",
                            )
                    allowed = set(required_pay[basis]) | (
                        {"AnnualHours"} if basis == "hourly" else set()
                    )
                    for field in {
                        "AnnualBasePay",
                        "AnnualTargetBonus",
                        "HourlyRate",
                        "MonthlyRate",
                        "AnnualHours",
                    } - allowed:
                        if row.get(field) not in (None, "", "0", "0.00"):
                            err(
                                sheet,
                                row,
                                field,
                                "Field does not apply to this pay basis",
                            )
            if row.get("Currency") and row["Currency"] not in {
                "USD",
                "EUR",
                "GBP",
                "CAD",
                "JPY",
                "AUD",
                "CHF",
                "CNY",
                "INR",
            }:
                err(sheet, row, "Currency", "Unsupported currency code")
            if sheet == "Budgets" and row.get("AllocationPercent", "") != "":
                unit = state["OrganizationalUnits"].get(row.get("OrgUnitID"), {})
                parent = unit.get("ParentOrgUnitID")
                if not parent or unit.get("UnitType") == "company":
                    err(
                        sheet,
                        row,
                        "AllocationPercent",
                        "Company budgets must use a dollar amount",
                    )
                elif not any(
                    b.get("OrgUnitID") == parent
                    and str(b.get("BudgetYear")) == str(row.get("BudgetYear"))
                    and b.get("Currency") == row.get("Currency")
                    for b in state["Budgets"].values()
                ):
                    err(
                        sheet,
                        row,
                        "AllocationPercent",
                        "Set the parent budget for this year and currency first",
                    )
            if sheet == "CompanyAllocations":
                try:
                    if number(row.get("DivergentPercent", "")) not in {
                        0,
                        25,
                        50,
                        75,
                        100,
                    }:
                        raise ValueError()
                except (InvalidOperation, ValueError):
                    err(
                        sheet,
                        row,
                        "DivergentPercent",
                        "Choose 0, 25, 50, 75, or 100 percent; Czinger receives the remainder",
                    )
            if sheet == "Employees" and row.get("EmploymentStatus") not in {
                "active",
                "leave",
                "inactive",
                "vacant",
                "draft",
            }:
                err(
                    sheet,
                    row,
                    "EmploymentStatus",
                    "Use active, leave, inactive, vacant, or draft",
                )
            if sheet == "OrganizationalUnits" and row.get("UnitType") not in {
                "company",
                "function",
                "group",
                "department",
                "team",
                "subteam",
                "subdepartment",
            }:
                err(
                    sheet,
                    row,
                    "UnitType",
                    "Use company, function, group, department, team, subteam, or subdepartment",
                )
            if sheet == "OrganizationalUnits" and row.get("Tier", "") != "":
                try:
                    tier = number(row["Tier"])
                    if tier < 0 or tier != int(tier):
                        raise ValueError()
                    expected = {
                        "company": 0,
                        "function": 1,
                        "group": 2,
                        "department": 3,
                        "team": 4,
                    }.get(row.get("UnitType"))
                    if expected is not None and tier != expected:
                        err(
                            sheet,
                            row,
                            "Tier",
                            f"{row['UnitType']} must use Tier {expected}",
                        )
                    if row.get("UnitType") == "subteam" and tier < 5:
                        err(sheet, row, "Tier", "Subteams must use Tier 5 or deeper")
                    parent = state[sheet].get(row.get("ParentOrgUnitID"), {})
                    if parent.get("Tier", "") != "" and tier <= number(parent["Tier"]):
                        err(
                            sheet,
                            row,
                            "Tier",
                            "Tier must be deeper than the parent tier",
                        )
                except (InvalidOperation, ValueError, OverflowError):
                    err(sheet, row, "Tier", "Use a nonnegative whole tier number")
            if sheet == "Objectives" and row.get("Status") not in {
                "on-track",
                "at-risk",
                "off-track",
                "complete",
                "not-started",
            }:
                err(sheet, row, "Status", "Unknown objective health status")
            if sheet == "KeyResults" and row.get("Direction") not in {
                "increase",
                "decrease",
            }:
                err(sheet, row, "Direction", "Use increase or decrease")
            if (
                sheet == "KeyResults"
                and row.get("Baseline", "") != ""
                and row.get("TargetValue", "") != ""
            ):
                try:
                    b, t = number(row["Baseline"]), number(row["TargetValue"])
                    if (row["Direction"] == "increase" and t < b) or (
                        row["Direction"] == "decrease" and t > b
                    ):
                        err(
                            sheet,
                            row,
                            "TargetValue",
                            "Target is incompatible with the metric direction",
                        )
                except (ValueError, InvalidOperation):
                    pass
            for start, end in [
                ("StartDate", "EndDate"),
                ("EffectiveFrom", "EffectiveTo"),
                ("PeriodStart", "PeriodEnd"),
            ]:
                if row.get(start) and row.get(end) and row[end] < row[start]:
                    err(sheet, row, end, "End must not precede start")
    for sheet, parent in [
        ("Employees", "ManagerID"),
        ("OrganizationalUnits", "ParentOrgUnitID"),
        ("Objectives", "ParentObjectiveID"),
    ]:
        done = set()
        for key, row in state[sheet].items():
            chain = set()
            cur = key
            while cur and cur in state[sheet] and cur not in done:
                if cur in chain:
                    err(
                        sheet, row, parent, "Hierarchy cycle or self-reference detected"
                    )
                    break
                chain.add(cur)
                cur = state[sheet][cur].get(parent, "")
            done.update(chain)
    roots = [
        r["EmployeeID"] for r in state["Employees"].values() if not r.get("ManagerID")
    ]
    if len(roots) > 1:
        warnings.append(
            f"{len(roots)} reporting roots require review: " + ", ".join(roots[:15])
        )
    unit_roots = [
        r["OrgUnitID"]
        for r in state["OrganizationalUnits"].values()
        if not r.get("ParentOrgUnitID")
    ]
    if len(unit_roots) > 1:
        warnings.append(
            "Multiple organizational roots are present; budgets are calculated separately."
        )
    unknown_ends = sum(
        r.get("EmploymentStatus") == "inactive" and not r.get("EndDate")
        for r in state["Employees"].values()
    )
    if unknown_ends:
        warnings.append(
            f"{unknown_ends} inactive employees lack an EndDate and cannot be included in historical headcount. Add employment end dates for accurate as-of reporting."
        )
    intervals = {}
    budgets = set()
    for row in state["Compensation"].values():
        intervals.setdefault(row["EmployeeID"], []).append(row)
    for rows in intervals.values():
        rows.sort(key=lambda r: r.get("EffectiveFrom", ""))
        for a, b in zip(rows, rows[1:]):
            if b.get("EffectiveFrom", "") <= (a.get("EffectiveTo") or "9999-12-31"):
                err(
                    "Compensation",
                    b,
                    "EffectiveFrom",
                    "Overlapping compensation periods (end dates are inclusive)",
                )
    for row in state["Budgets"].values():
        key = (row.get("OrgUnitID"), row.get("BudgetYear"), row.get("Currency"))
        if key in budgets:
            err(
                "Budgets",
                row,
                "OrgUnitID",
                "Duplicate budget for this unit, year, and currency",
            )
        budgets.add(key)
    managers = {e.get("ManagerID") for e in state["Employees"].values()}
    dormant = sum(key in managers for key in state.get("CompanyAllocations", {}))
    if dormant:
        warnings.append(
            f"{dormant} former contributor allocation(s) are retained but ignored for managers; manager splits are calculated from contributors."
        )
    return errors, warnings


def merge_import(current, incoming, mode, actor, deleted_units=()):
    merged = {**empty_state(), **copy.deepcopy(current)}
    changes = []
    conflicts = []
    for sheet, records in incoming.items():
        for key, row in records.items():
            if (
                sheet == "OrganizationalUnits"
                and key in deleted_units
                and key not in current[sheet]
            ):
                conflicts.append(
                    {
                        "sheet": sheet,
                        "id": key,
                        "message": "Unit deleted in the app; workbook row is skipped.",
                    }
                )
                continue
            old = current.get(sheet, {}).get(key)
            comparable = lambda x: {
                f: clean_value(x.get(f, "")) for f in COLUMNS[sheet]
            }
            if old and comparable(old) == comparable(row):
                continue
            if old and old.get("_source") == "app" and sheet in APP_FIELDS:
                conflicts.append(
                    {
                        "sheet": sheet,
                        "id": key,
                        "message": "App-owned record preserved. Resolve in the planning editor; workbook ownership is not changed.",
                    }
                )
                continue
            change = {
                "sheet": sheet,
                "id": key,
                "kind": "update" if old else "addition",
            }
            if old and sheet == "Employees":
                if old.get("ManagerID") != row.get("ManagerID"):
                    change["reportingChange"] = True
                if old.get("OrgUnitID") != row.get("OrgUnitID"):
                    change["unitMove"] = True
            row = copy.deepcopy(row)
            row["_source"] = "excel"
            row["_editor"] = actor
            row["_modified"] = datetime.now().isoformat()
            merged[sheet][key] = row
            changes.append(change)
    if mode == "snapshot":
        for key, old in current["Employees"].items():
            if (
                key not in incoming["Employees"]
                and old.get("_source") == "excel"
                and old.get("EmploymentStatus") != "inactive"
            ):
                last_active = (date.today() - timedelta(days=1)).isoformat()
                end = min(old.get("EndDate") or last_active, last_active)
                if end < old.get("StartDate", ""):
                    end = ""
                merged["Employees"][key] = dict(
                    old,
                    EmploymentStatus="inactive",
                    EndDate=end,
                    _editor=actor,
                    _modified=datetime.now().isoformat(),
                )
                changes.append(
                    {"sheet": "Employees", "id": key, "kind": "deactivation"}
                )
    return merged, changes, conflicts


def active(row, as_of):
    status = row.get("EmploymentStatus")
    known_employment = status in {"active", "leave"} or (
        status == "inactive" and bool(row.get("EndDate"))
    )
    return (
        known_employment
        and row.get("StartDate", "9999") <= as_of
        and (not row.get("EndDate") or row["EndDate"] >= as_of)
    )


def pay_basis(person):
    if person.get("EmploymentType") == "Contractor":
        return "monthly"
    if person.get("EmploymentType") == "FTE":
        return {"exempt": "salary", "non-exempt": "hourly"}.get(
            person.get("ExemptionStatus")
        )
    return None


def annual_pay_cents(row):
    """Actual annual compensation; never multiply by allocation FTE again."""
    basis = row.get("PayBasis")
    if basis == "hourly":
        if row.get("AnnualHours", "") == "":
            return None
        base = cents(number(row["HourlyRate"]) * number(row["AnnualHours"]))
    elif basis == "monthly":
        base = cents(number(row["MonthlyRate"]) * 12)
    else:
        base = cents(row.get("AnnualBasePay") or 0) + cents(
            row.get("AnnualTargetBonus") or 0
        )
    return base + cents(row.get("AnnualEmployerCosts") or 0)


def payroll(state, employee_ids, as_of, currency):
    people = [
        state["Employees"][k]
        for k in employee_ids
        if active(state["Employees"][k], as_of)
    ]
    effective = {}
    for c in state["Compensation"].values():
        if (
            c["EmployeeID"] in employee_ids
            and c["EffectiveFrom"] <= as_of
            and (not c.get("EffectiveTo") or c["EffectiveTo"] >= as_of)
        ):
            effective[c["EmployeeID"]] = c
    total = 0
    missing = 0
    other = 0
    for e in people:
        c = effective.get(e["EmployeeID"])
        if not c:
            missing += 1
        elif c["Currency"] != currency:
            other += 1
        else:
            annual = annual_pay_cents(c)
            if annual is None:
                missing += 1
            else:
                total += annual
    result = {
        "headcount": len(people),
        "fte": float(sum((number(e.get("FTE") or 0) for e in people), Decimal(0))),
        "payroll": total / 100,
        "missingPay": missing,
        "otherCurrency": other,
        "complete": not (missing or other),
    }

    missing_fte = sum(e.get("FTE", "") == "" for e in people)
    if missing_fte:
        result["missingFTE"] = missing_fte
    return result


def kr_progress(row, as_of):
    result = {
        "progress": None,
        "reason": "Missing measurement",
        "stale": not row.get("LastUpdated")
        or (date.fromisoformat(as_of) - date.fromisoformat(row["LastUpdated"])).days
        > 30,
    }
    if any(row.get(k, "") == "" for k in ["Baseline", "CurrentValue", "TargetValue"]):
        return result
    b, c, t = (number(row[k]) for k in ["Baseline", "CurrentValue", "TargetValue"])
    if b == t:
        result["reason"] = "Baseline equals target; no percentage is defined"
        return result
    result.update(progress=round(float((c - b) / (t - b) * 100), 1), reason=None)
    return result


def resolved_budgets(state, year, currency):
    """Resolve parent-relative budgets in cents, reconciling sibling rounding."""
    rows = {
        b["OrgUnitID"]: b
        for b in state["Budgets"].values()
        if str(b["BudgetYear"]) == str(year) and b["Currency"] == currency
    }
    child_map = children(state["OrganizationalUnits"], "ParentOrgUnitID")
    envelopes = {
        key: cents(b["ApprovedEnvelope"])
        for key, b in rows.items()
        if b.get("AllocationPercent", "") == ""
    }
    direct = {}
    pending = list(envelopes)
    visited = set()
    while pending:
        key = pending.pop()
        if key in visited:
            continue
        visited.add(key)
        row, env = rows[key], envelopes[key]
        shares = {
            child: number(rows[child]["AllocationPercent"])
            for child in child_map.get(key, [])
            if child in rows and rows[child].get("AllocationPercent", "") != ""
        }
        # Tuple keys avoid collisions with user-defined unit IDs.
        parts = {
            ("child", child): Decimal(env) * pct / 100 for child, pct in shares.items()
        }
        if row.get("DirectPercent", "") != "":
            parts[("direct", key)] = Decimal(env) * number(row["DirectPercent"]) / 100
        rounded = {part: int(value) for part, value in parts.items()}
        remainder = int(sum(parts.values(), Decimal(0)).quantize(Decimal("1"))) - sum(
            rounded.values()
        )
        for part in sorted(
            parts, key=lambda part: (-(parts[part] - rounded[part]), part)
        )[:remainder]:
            rounded[part] += 1
        direct[key] = rounded.get(
            ("direct", key), cents(row.get("DirectAllocation") or 0)
        )
        for child in shares:
            envelopes[child] = rounded[("child", child)]
            pending.append(child)
    return rows, envelopes, direct


def convert_budget_percentages(state, year, currency, actor, allowed_units):
    """Capture legacy ratios before a parent changes; never invent a zero-parent ratio."""
    rows, envelopes, _ = resolved_budgets(state, year, currency)
    changed = []
    for key, row in rows.items():
        if key not in allowed_units:
            continue
        unit = state["OrganizationalUnits"][key]
        parent = unit.get("ParentOrgUnitID")
        updates = {}
        if (
            unit.get("UnitType") != "company"
            and parent in allowed_units
            and row.get("AllocationPercent", "") == ""
            and envelopes.get(parent, 0) > 0
            and 0 <= envelopes.get(key, 0) <= envelopes[parent]
        ):
            updates["AllocationPercent"] = str(
                Decimal(envelopes[key]) * 100 / envelopes[parent]
            )
        if row.get("DirectPercent", "") == "" and envelopes.get(key, 0) > 0:
            percentage = (
                Decimal(cents(row.get("DirectAllocation") or 0)) * 100 / envelopes[key]
            )
            if 0 <= percentage <= 100:
                updates["DirectPercent"] = str(percentage)
        if updates:
            changed.append(
                {
                    "id": record_key("Budgets", row),
                    "before": copy.deepcopy(row),
                    "percentages": updates,
                }
            )
            row.update(
                updates,
                _source="app",
                _editor=actor,
                _modified=datetime.now().isoformat(),
            )
    return changed


def budget_metrics(state, unit, year, currency, as_of, executive_ids=()):
    rows, envelopes, direct_amounts = resolved_budgets(state, year, currency)
    b = rows.get(unit)
    units = descendants(state["OrganizationalUnits"], "ParentOrgUnitID", unit)
    people = {k for k, e in state["Employees"].items() if e["OrgUnitID"] in units}
    direct = {k for k, e in state["Employees"].items() if e["OrgUnitID"] == unit}
    pool = set(executive_ids) & people
    if state["OrganizationalUnits"][unit].get("UnitType") == "company":
        # Executive costs roll up once at company level, outside operating departments.
        direct |= pool
    else:
        people -= pool
        direct -= pool
    result = {
        "total": payroll(state, people, as_of, currency),
        "direct": payroll(state, direct, as_of, currency),
        "budget": b,
    }
    if b and unit in envelopes:
        child_units = children(state["OrganizationalUnits"], "ParentOrgUnitID").get(
            unit, []
        )
        allocated = sum(envelopes[k] for k in child_units if k in envelopes)
        env, allocation = envelopes[unit], direct_amounts[unit]
        result.update(
            envelope=env / 100,
            directAllocation=allocation / 100,
            childEnvelopes=allocated / 100,
            unallocated=(env - allocation - allocated) / 100,
            headroom=env / 100 - result["total"]["payroll"],
            directHeadroom=allocation / 100 - result["direct"]["payroll"],
            missingChildBudgets=sum(k not in envelopes for k in child_units),
            allocationPercent=(
                float(number(b["AllocationPercent"]))
                if b.get("AllocationPercent", "") != ""
                else None
            ),
        )
    return result
