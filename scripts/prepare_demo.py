"""Prepare a private local database from an org-chart export; never overwrite one."""

import argparse, csv, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.db import Database
from backend.domain import validate
from backend.importer import parse_workbook
from backend.sample import workbook_bytes
from backend.overhead import default_model

ROOT = Path(__file__).resolve().parents[1]


def prepare(workbook, database, use_discovery=False):
    destination = Path(database).resolve()
    if destination.exists():
        raise ValueError(
            "Demo database already exists. Start it to preserve your edits, or choose a new path."
        )
    state, errors, headers, warnings = parse_workbook(Path(workbook).read_bytes())
    if errors:
        raise ValueError(json.dumps(errors[:5]))
    people = state["Employees"]
    units = state["OrganizationalUnits"]
    executive_ids = []
    executive_leader = ""
    if "divergent" in units and "czinger" in units:
        defaults = json.loads(
            (ROOT / "backend" / "structure_defaults.json").read_text()
        )

        def csv_rows(name):
            path = ROOT / "docs" / name
            if not use_discovery or not path.exists():
                return defaults.get(
                    {
                        "function-mapping.csv": "functions",
                        "group-mapping.csv": "groups",
                        "department-mapping.csv": "departments",
                    }.get(name, ""),
                    [],
                )
            with path.open(newline="") as file:
                return list(csv.DictReader(file))

        by_company = {
            "Divergent Technologies, Inc.": "divergent",
            "Czinger Vehicles": "czinger",
        }
        for row in csv_rows("function-mapping.csv"):
            units[row["CatalogID"]] = dict(
                OrgUnitID=row["CatalogID"],
                OrgUnitName=row["Function"],
                ParentOrgUnitID=by_company[row["Company"]],
                UnitType="function",
                Tier="1",
                OwnerEmployeeID="",
            )
        group_ids = {}
        for row in csv_rows("group-mapping.csv"):
            group_ids[row["Group"]] = row["CatalogID"]
            units[row["CatalogID"]] = dict(
                OrgUnitID=row["CatalogID"],
                OrgUnitName=row["Group"],
                ParentOrgUnitID=row["ParentFunctionID"],
                UnitType="group",
                Tier="2",
                OwnerEmployeeID="",
            )
        functions = {
            (u["OrgUnitName"], u["ParentOrgUnitID"]): key
            for key, u in units.items()
            if u.get("UnitType") == "function"
        }
        for row in csv_rows("department-mapping.csv"):
            found = next(
                (u for u in units.values() if u["OrgUnitName"] == row["SourceLabel"]),
                None,
            )
            if found:
                parent = group_ids.get(row["Group"]) or functions.get(
                    (row["Function"], by_company[row["Company"]])
                )
                if parent:
                    found["ParentOrgUnitID"] = parent
        if use_discovery:
            names = {p["Name"]: key for key, p in people.items()}
            support = [
                r
                for r in csv_rows("leadership-mapping.csv")
                if r.get("ExecutiveCostPool")
            ]
            for row in support:
                source_name = row.get("WorkbookName") or row["Name"]
                ident = names.get(source_name)
                if not ident:
                    import hashlib

                    ident = (
                        "draft-" + hashlib.sha256(row["Name"].encode()).hexdigest()[:12]
                    )
                    people[ident] = dict(
                        EmployeeID=ident,
                        Name=row["Name"],
                        JobTitle=row["JobTitle"],
                        ManagerID=names.get(row.get("ManagerName"), ""),
                        OrgUnitID="divergent-operations-application-development",
                        EmploymentStatus="draft",
                        FTE="",
                        FTEBasis="Not in supplied workbook; confirm employment details",
                        StartDate="",
                        EndDate="",
                        EmploymentType="",
                        Location="",
                        SourceCompany="divergent",
                    )
                    warnings.append(
                        f"{row['Name']} was supplied in discovery but not found in the workbook. Added as a draft, excluded from headcount and pay until completed."
                    )
                else:
                    people[ident][
                        "OrgUnitID"
                    ] = "divergent-operations-application-development"
                    if people[ident]["EmploymentStatus"] not in {"draft", "vacant"}:
                        executive_ids.append(ident)
                    if "function leader" in row.get("RoleInDraft", ""):
                        executive_leader = ident
    errors, validation_warnings = validate(state)
    if errors:
        raise ValueError(json.dumps(errors[:8]))
    for sheet, rows in state.items():
        for row in rows.values():
            row["_source"] = "excel"
    db = Database("sqlite:///" + str(destination))
    db.save(
        state,
        0,
        "local-demo",
        "load-private-workbook",
        {
            "sourceFilename": Path(workbook).name,
            "warnings": warnings + validation_warnings,
        },
        setting=("synthetic", False),
    )
    root = next((k for k, p in people.items() if not p.get("ManagerID")), "")
    db.set_setting("rootEmployee", root)
    model = default_model(state)
    model["executiveIDs"] = executive_ids
    model["executiveLeader"] = executive_leader
    db.set_setting("model", model)
    db.set_setting("demoNotes", warnings)
    if "Org Structure" in headers:
        from backend.organizer_export import organizer_source
        db.set_setting("organizerSource", dict(organizer_source(Path(workbook).read_bytes()), filename=Path(workbook).name, importVersion=1))
    db.engine.dispose()
    return {
        "database": str(destination),
        "positions": len(people),
        "vacancies": sum(p["EmploymentStatus"] == "vacant" for p in people.values()),
        "warnings": warnings,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook")
    parser.add_argument("--database", default=str(ROOT / "data" / "private-demo.db"))
    parser.add_argument("--use-discovery", action="store_true")
    args = parser.parse_args()
    try:
        print(
            json.dumps(
                prepare(args.workbook, args.database, args.use_discovery), indent=2
            )
        )
    except ValueError as exc:
        raise SystemExit(str(exc))
