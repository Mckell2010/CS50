"""Read chart exports as data. Preserve stable IDs; never import contact details."""

from datetime import datetime, date
import hashlib
from backend.domain import empty_state, clean_value


def chart_export(wb):
    for ws in wb:
        headers = [clean_value(v) for v in next(ws.iter_rows(values_only=True), [])]
        if {
            "Unique ID",
            "Employee",
            "Manager Unique ID",
            "Department",
            "PID Status",
        } <= set(headers):
            return ws, headers
    return None


def parse_chart(ws, headers):
    state = empty_state()
    errors = []
    warnings = []
    rows = []
    for index, values in enumerate(ws.iter_rows(values_only=True), 1):
        if index == 1 or not any(v is not None for v in values):
            continue
        if index > 20001:
            raise ValueError("Maximum 20,000 rows per sheet")
        record = {k: clean_value(v) for k, v in zip(headers, values)}
        if any(v.startswith("=") for v in record.values()):
            errors.append(
                dict(
                    sheet=ws.title,
                    row=index,
                    field="formula",
                    message="Use literal values, not formulas",
                )
            )
        record["_row"] = index
        rows.append(record)
    containers = {
        r["Unique ID"]: r.get("Manager Unique ID", "")
        for r in rows
        if r.get("Is Container") == "Yes"
    }
    companies = {
        "DTI": ("divergent", "Divergent Technologies, Inc."),
        "DII": ("divergent", "Divergent Technologies, Inc."),
        "CZV": ("czinger", "Czinger Vehicles"),
    }
    for key, name in set(companies.values()):
        state["OrganizationalUnits"][key] = dict(
            OrgUnitID=key,
            OrgUnitName=name,
            ParentOrgUnitID="",
            UnitType="company",
            Tier="0",
            OwnerEmployeeID="",
        )

    def iso(value, row, field):
        if not value:
            return ""
        for fmt in [
            "%Y-%m-%d",
            "%m/%d/%Y %I:%M:%S %p",
            "%m/%d/%Y",
            "%Y-%m-%d %H:%M:%S",
        ]:
            try:
                return datetime.strptime(value, fmt).date().isoformat()
            except ValueError:
                pass
        errors.append(
            dict(sheet=ws.title, row=row, field=field, message="Unrecognized date")
        )
        return ""

    for record in rows:
        key = record["Unique ID"]
        if key in containers:
            continue
        if not key or key in state["Employees"]:
            errors.append(
                dict(
                    sheet=ws.title,
                    row=record["_row"],
                    field="Unique ID",
                    message="Missing or duplicate ID",
                )
            )
            continue
        company = companies.get(record.get("Company"))
        if not company:
            errors.append(
                dict(
                    sheet=ws.title,
                    row=record["_row"],
                    field="Company",
                    message="Unknown company code",
                )
            )
            continue
        company_key = company[0]
        department = record.get("Department", "").replace(" - DII", "")
        if not department:
            department = "Unassigned department"
        unit = (
            company_key
            + "-dept-"
            + hashlib.sha256(department.encode()).hexdigest()[:10]
        )
        state["OrganizationalUnits"].setdefault(
            unit,
            dict(
                OrgUnitID=unit,
                OrgUnitName=department,
                ParentOrgUnitID=company_key,
                UnitType="department",
                Tier="3",
                DepartmentCode=department.split("-")[0] if "-" in department else "",
                OwnerEmployeeID="",
            ),
        )
        manager = record.get("Manager Unique ID", "")
        seen = set()
        while manager in containers and manager not in seen:
            seen.add(manager)
            manager = containers[manager]
        vacant = record.get("PID Status") == "Open"
        start = iso(record.get("Start Date", ""), record["_row"], "Start Date")
        end = iso(record.get("End Date", ""), record["_row"], "End Date")
        status = (
            "vacant"
            if vacant
            else (
                "inactive"
                if end and end < date.today().isoformat()
                else "active" if start else "draft"
            )
        )
        fulltime = record.get("Employment Type") == "Full Time"
        state["Employees"][key] = dict(
            EmployeeID=key,
            Name=record.get("Employee", ""),
            JobTitle=record.get("Title") or "Title not supplied",
            ManagerID=manager,
            OrgUnitID=unit,
            EmploymentStatus=status,
            FTE="0" if vacant else "1" if fulltime else "",
            FTEBasis=(
                "Vacant position"
                if vacant
                else (
                    "Assumed 1.0 from Full Time; editable"
                    if fulltime
                    else "FTE not supplied; enter in Model settings"
                )
            ),
            StartDate=start,
            EndDate=end,
            Location="",
            EmploymentType=record.get("Employment Type", ""),
            SourceCompany=company_key,
            _row=record["_row"],
        )
    warnings.extend(
        [
            "Chart export detected. Active/Open Headcount columns are report counts, not individual employment status or FTE. Company containers are excluded from people.",
            "Open roles are vacancy nodes and contribute zero people, FTE, and payroll. Roles without employment dates remain drafts.",
            "Full Time is provisionally 1.0 FTE. Other FTE values are unknown until entered. No compensation or contributor company allocations were inferred.",
            "DII department suffixes are removed and their people retained under the matching Divergent department. Stable DII-prefixed person IDs are preserved.",
        ]
    )
    return state, errors, {ws.title: headers}, warnings
