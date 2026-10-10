"""Informational executive overhead. Never mutates payroll or budget totals."""

from decimal import Decimal
from backend.domain import active, children, number, payroll
from backend.allocations import allocation_summaries, is_contractor


def default_model(state):
    companies = [
        u["OrgUnitID"]
        for u in state["OrganizationalUnits"].values()
        if u.get("UnitType") == "company"
    ]
    return dict(
        includeContractors=True,
        scope="company-functions",
        weighting="contributor-fte",
        divergentUnit=(
            "divergent" if "divergent" in companies else next(iter(companies), "")
        ),
        czingerUnit="czinger" if "czinger" in companies else "",
        executiveIDs=[],
        executiveLeader="",
        companySplitBasis="manual",
        divergentPercent=None,
    )


def validate_model(state, config):
    if config["scope"] != "company-functions" or config["weighting"] not in {
        "contributor-fte",
        "contributor-count",
    }:
        raise ValueError(
            "Choose company functions and a supported contributor weighting"
        )
    if not isinstance(config["includeContractors"], bool):
        raise ValueError("Contractor participation must be true or false")
    for field in ["divergentUnit", "czingerUnit"]:
        key = config[field]
        if (
            key
            and state["OrganizationalUnits"].get(key, {}).get("UnitType") != "company"
        ):
            raise ValueError("Select company-level organizational units")
    if config["divergentUnit"] and config["divergentUnit"] == config["czingerUnit"]:
        raise ValueError("Select different company units")
    if not isinstance(config["executiveIDs"], list) or len(
        config["executiveIDs"]
    ) != len(set(config["executiveIDs"])):
        raise ValueError("Executive pool must contain distinct person IDs")
    for key in config["executiveIDs"]:
        if key not in state["Employees"] or state["Employees"][key][
            "EmploymentStatus"
        ] in {"vacant", "draft"}:
            raise ValueError("Select filled positions for the executive cost pool")
    if config["companySplitBasis"] not in {"manual", "team-estimate"}:
        raise ValueError("Unknown company split basis")
    if (
        config["executiveLeader"]
        and config["executiveLeader"] not in state["Employees"]
    ):
        raise ValueError("Unknown executive leader")
    if config["divergentPercent"] is not None:
        p = number(config["divergentPercent"])
        if p < 0 or p > 100:
            raise ValueError("Company percentage must be between 0 and 100")


def overhead_preview(state, config, as_of, currency):
    units = state["OrganizationalUnits"]
    people = state["Employees"]
    companies = [config["divergentUnit"], config["czingerUnit"]]

    def ancestry(unit):
        function = ""
        seen = set()
        while unit in units and unit not in seen:
            seen.add(unit)
            row = units[unit]
            if row.get("UnitType") == "function":
                function = unit
            if row.get("UnitType") == "company":
                return unit, function
            unit = row.get("ParentOrgUnitID")
        return "", function

    weights = {}
    for company in companies:
        if not company:
            continue
        for key, u in units.items():
            if u.get("UnitType") == "function" and ancestry(key)[0] == company:
                weights[(company, key)] = Decimal(0)
        weights[(company, "")] = Decimal(0)
    department_weights = {}
    for company in companies:
        if company:
            for key, unit in units.items():
                if unit.get("UnitType") == "department" and ancestry(key)[0] == company:
                    department_weights[(company, key)] = Decimal(0)
            department_weights[(company, "")] = Decimal(0)

    def department_of(unit):
        seen = set()
        while unit in units and unit not in seen:
            seen.add(unit)
            if units[unit].get("UnitType") == "department":
                return unit
            unit = units[unit].get("ParentOrgUnitID")
        return ""

    missing_fte = missing_assignment = 0
    reports = children(people, "ManagerID")
    for key, person in people.items():
        if (
            key in config["executiveIDs"]
            or reports.get(key)
            or not active(person, as_of)
        ):
            continue
        if not config["includeContractors"] and is_contractor(person):
            continue
        if person.get("FTE", "") == "" and config["weighting"] == "contributor-fte":
            missing_fte += 1
            continue
        allocation = state.get("CompanyAllocations", {}).get(key)
        if not allocation:
            missing_assignment += 1
            continue
        weight = (
            number(person.get("FTE") or 0)
            if config["weighting"] == "contributor-fte"
            else Decimal(1)
        )
        percent = number(allocation["DivergentPercent"]) / 100
        home, function = ancestry(person["OrgUnitID"])
        for company, fraction in zip(companies, [percent, 1 - percent]):
            if company:
                bucket = (company, function if home == company else "")
                weights[bucket] = weights.get(bucket, Decimal(0)) + weight * fraction
                department = (
                    department_of(person["OrgUnitID"]) if home == company else ""
                )
                bucket = (company, department)
                department_weights[bucket] = (
                    department_weights.get(bucket, Decimal(0)) + weight * fraction
                )
    pool = payroll(state, set(config["executiveIDs"]), as_of, currency)
    percent = config["divergentPercent"]
    if config["companySplitBasis"] == "team-estimate":
        leader = allocation_summaries(
            state, as_of, set(people), config["includeContractors"]
        ).get(config["executiveLeader"], {})
        percent = (
            leader.get("divergentPercent")
            if leader.get("status") == "complete"
            else None
        )
    complete = not (missing_fte or missing_assignment)

    def build_rows(weights, level):
        result = []
        for company in companies:
            if not company:
                continue
            total = sum(
                (w for (c, _), w in weights.items() if c == company), Decimal(0)
            )
            fraction = (
                None
                if percent is None
                else (
                    number(percent) / 100
                    if company == companies[0]
                    else 1 - number(percent) / 100
                )
            )
            company_pool = (
                number(pool["payroll"]) * fraction
                if fraction is not None and pool["complete"] and config["executiveIDs"]
                else None
            )
            for (c, unit), weight in weights.items():
                if c != company:
                    continue
                share = weight / total if total and complete else None
                result.append(
                    dict(
                        companyID=c,
                        companyName=units[c]["OrgUnitName"],
                        functionID=unit,
                        functionName=(
                            units[unit]["OrgUnitName"] if unit else f"Unmapped {level}"
                        ),
                        contributorWeight=float(weight),
                        sharePercent=(
                            round(float(share * 100), 2) if share is not None else None
                        ),
                        # Informational amounts rounded only for display; never added to source totals.
                        overhead=(
                            round(float(company_pool * share), 2)
                            if company_pool is not None and share is not None
                            else None
                        ),
                    )
                )
        # Reconcile display cents within each company; never sum rounded parent and child rows.
        if (
            pool["complete"]
            and config["executiveIDs"]
            and percent is not None
            and complete
        ):
            total_cents = int((number(pool["payroll"]) * 100).quantize(Decimal("1")))
            divergent_cents = int(
                (Decimal(total_cents) * number(percent) / 100).quantize(Decimal("1"))
            )
            for company, company_cents in zip(
                companies, [divergent_cents, total_cents - divergent_cents]
            ):
                lines = [r for r in result if r["companyID"] == company]
                denominator = sum(
                    (weights[(company, r["functionID"])] for r in lines), Decimal(0)
                )
                if not denominator:
                    continue
                raw = [
                    Decimal(company_cents)
                    * weights[(company, r["functionID"])]
                    / denominator
                    for r in lines
                ]
                pennies = [int(value) for value in raw]
                remainder = company_cents - sum(pennies)
                order = sorted(
                    range(len(lines)),
                    key=lambda i: (-(raw[i] - pennies[i]), lines[i]["functionID"]),
                )
                for i in order[:remainder]:
                    pennies[i] += 1
                for line, value in zip(lines, pennies):
                    line["overhead"] = value / 100
        return result

    result = build_rows(weights, "function")
    departments = build_rows(department_weights, "department")
    for row in departments:
        row["departmentID"] = row.pop("functionID")
        row["departmentName"] = row.pop("functionName")
    return dict(
        rows=result,
        departmentRows=departments,
        pool=pool,
        companyDivergentPercent=percent,
        missingFTE=missing_fte,
        missingAssignments=missing_assignment,
        complete=complete,
        policy="Informational attribution only. Original payroll, department costs, and consolidated totals are unchanged.",
    )
