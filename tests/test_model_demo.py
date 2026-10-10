import io
from datetime import date
import pytest
from openpyxl import Workbook
from fastapi.testclient import TestClient
from backend import app as module, auth
from backend.db import Database
from backend.domain import validate, payroll
from backend.sample import sample_state
from backend.importer import parse_workbook
from backend.allocations import allocation_summaries
from backend.overhead import default_model, overhead_preview

TODAY = date.today().isoformat()


@pytest.fixture
def client(monkeypatch, tmp_path):
    db = Database("sqlite:///" + str(tmp_path / "model.db"))
    db.save(sample_state(), 0, "test", "seed")
    monkeypatch.setattr(module, "DB", db)
    monkeypatch.setattr(auth, "MODE", "development")
    with TestClient(module.app) as client:
        yield client


def test_chart_import_handles_containers_vacancies_dii_and_unknown_fte():
    wb = Workbook()
    ws = wb.active
    ws.append(
        [
            "Company",
            "Department",
            "Employee",
            "Unique ID",
            "Manager Unique ID",
            "PID Status",
            "Is Container",
            "Title",
            "Start Date",
            "End Date",
            "Employment Type",
            "Active Headcount",
        ]
    )
    ws.append(
        [
            "DTI",
            "51-Executive",
            "Synthetic CEO",
            "001",
            "",
            "",
            "",
            "CEO",
            "1/1/2020 12:00:00 AM",
            "",
            "Full Time",
            300,
        ]
    )
    ws.append(
        ["DTI", "", "Company", "container", "001", "", "Yes", "", "", "", "", 300]
    )
    ws.append(
        [
            "DII",
            "12-Structures Engineering - DII",
            "Synthetic engineer",
            "legacy-2",
            "container",
            "",
            "",
            "Engineer",
            "1/1/2020 12:00:00 AM",
            "",
            "Full Time",
            0,
        ]
    )
    ws.append(
        [
            "CZV",
            "12-Structures Engineering - CZV",
            "Open CTO",
            "open-3",
            "001",
            "Open",
            "",
            "CTO",
            "",
            "",
            "Full Time",
            0,
        ]
    )
    ws.append(
        [
            "CZV",
            "12-Structures Engineering - CZV",
            "Synthetic contractor",
            "004",
            "open-3",
            "",
            "",
            "Consultant",
            "1/1/2020 12:00:00 AM",
            "",
            "Independent Contractor",
            0,
        ]
    )
    b = io.BytesIO()
    wb.save(b)
    state, errors, _, warnings = parse_workbook(b.getvalue())
    assert not errors and not validate(state)[0]
    assert len(state["Employees"]) == 4
    assert state["Employees"]["legacy-2"]["ManagerID"] == "001"
    assert not any(
        "DII" in u["OrgUnitName"] for u in state["OrganizationalUnits"].values()
    )
    assert state["Employees"]["004"]["FTE"] == ""
    assert state["Employees"]["open-3"]["EmploymentStatus"] == "vacant"
    totals = payroll(state, set(state["Employees"]), TODAY, "USD")
    assert totals["headcount"] == 3 and totals["fte"] == 2 and totals["missingFTE"] == 1
    assert totals["missingPay"] == 3
    assert not state["CompanyAllocations"] and not state["Compensation"]


def test_people_edit_retains_authorization_and_cycle_validation(client):
    data = client.get("/api/organization").json()
    person = next(p for p in data["employees"] if p["EmployeeID"] == "030")
    person["Name"] = "Edited synthetic contributor"
    person["FTE"] = "0.5"
    r = client.put(
        "/api/planning/Employees/030",
        json={"version": data["version"], "record": person},
    )
    assert r.status_code == 200, r.text
    state, version = module.DB.read()
    assert state["Employees"]["030"]["FTE"] == "0.5"
    assert state["Employees"]["030"]["_source"] == "app"
    person["ManagerID"] = "030"
    assert (
        client.put(
            "/api/planning/Employees/030", json={"version": version, "record": person}
        ).status_code
        == 422
    )
    client.post("/api/dev-session", json={"role": "owner"})
    assert (
        client.put(
            "/api/planning/Employees/030", json={"version": version, "record": person}
        ).status_code
        == 403
    )


def test_bulk_assignments_are_explicit_atomic_and_never_include_managers(client):
    version = client.get("/api/organization").json()["version"]
    before = module.DB.read()
    assert (
        client.put(
            "/api/model/allocations",
            json={
                "version": version,
                "employeeIDs": ["001", "030"],
                "divergentPercent": 75,
            },
        ).status_code
        == 422
    )
    assert module.DB.read() == before
    assert (
        client.put(
            "/api/model/allocations",
            json={
                "version": version,
                "employeeIDs": ["029", "030"],
                "divergentPercent": 75,
            },
        ).status_code
        == 200
    )
    assert len(module.DB.read()[0]["CompanyAllocations"]) == 2
    assert (
        client.put(
            "/api/model/allocations",
            json={"version": version, "employeeIDs": ["029"], "divergentPercent": 25},
        ).status_code
        == 409
    )


def test_model_settings_access_validation_and_persistence(client):
    model = client.get("/api/model").json()
    model["config"]["includeContractors"] = False
    assert (
        client.put(
            "/api/model", json={"version": model["version"], "config": model["config"]}
        ).status_code
        == 200
    )
    assert client.get("/api/model").json()["config"]["includeContractors"] is False
    model = client.get("/api/model").json()
    model["config"]["divergentPercent"] = 101
    assert (
        client.put(
            "/api/model", json={"version": model["version"], "config": model["config"]}
        ).status_code
        == 422
    )
    for role in ["viewer", "owner"]:
        client.post("/api/dev-session", json={"role": role})
        assert client.get("/api/model").status_code == 403
        assert (
            client.put(
                "/api/model",
                json={"version": model["version"], "config": model["config"]},
            ).status_code
            == 403
        )


def overhead_state():
    s = sample_state()
    s["OrganizationalUnits"]["eng"]["UnitType"] = "function"
    s["OrganizationalUnits"]["ops"]["UnitType"] = "function"
    s["OrganizationalUnits"]["growth"]["UnitType"] = "function"
    s["OrganizationalUnits"]["czinger"] = dict(
        OrgUnitID="czinger",
        OrgUnitName="Czinger",
        ParentOrgUnitID="",
        UnitType="company",
    )
    managers = {e.get("ManagerID") for e in s["Employees"].values()}
    for key in s["Employees"]:
        if key not in managers:
            s["CompanyAllocations"][key] = dict(EmployeeID=key, DivergentPercent="100")
    return s


def test_overhead_is_fte_weighted_and_never_changes_underlying_costs():
    s = overhead_state()
    cfg = default_model(s)
    cfg.update(executiveIDs=["001"], divergentPercent=100)
    original = payroll(s, set(s["Employees"]), TODAY, "USD")
    result = overhead_preview(s, cfg, TODAY, "USD")
    assert result["complete"]
    rows = [r for r in result["rows"] if r["companyID"] == "company"]
    assert sum(r["sharePercent"] for r in rows) == pytest.approx(100, abs=0.02)
    assert sum(r["overhead"] or 0 for r in rows) == pytest.approx(
        result["pool"]["payroll"], abs=0.02
    )
    assert payroll(s, set(s["Employees"]), TODAY, "USD") == original
    s["Employees"]["030"]["FTE"] = ""
    unknown = overhead_preview(s, cfg, TODAY, "USD")
    assert unknown["missingFTE"] == 1 and all(
        r["overhead"] is None for r in unknown["rows"]
    )
    s["Employees"]["030"]["FTE"] = "1"
    del s["Compensation"]["001@2025-01-01"]
    unknown = overhead_preview(s, cfg, TODAY, "USD")
    assert unknown["pool"]["missingPay"] == 1 and all(
        r["overhead"] is None for r in unknown["rows"]
    )


def test_contractor_toggle_changes_rollup_but_preserves_explicit_assignment():
    s = overhead_state()
    s["Employees"]["030"]["EmploymentType"] = "Independent Contractor"
    s["CompanyAllocations"]["030"]["DivergentPercent"] = "0"
    include = allocation_summaries(s, TODAY, set(s["Employees"]), True)
    exclude = allocation_summaries(s, TODAY, set(s["Employees"]), False)
    assert (
        include["001"]["divergentPercent"] < 100
        and exclude["001"]["divergentPercent"] == 100
    )
    assert exclude["030"]["divergentPercent"] == 0 and exclude["030"]["canEdit"]
    s["Employees"]["030"]["FTE"] = ""
    assert (
        allocation_summaries(s, TODAY, set(s["Employees"]))["001"]["status"]
        == "missing-fte"
    )


def test_model_keeps_ended_people_editable_without_counting_them(client):
    state, version = module.DB.read()
    state["Employees"]["030"].update(EmploymentStatus="inactive", EndDate="2025-12-31")
    module.DB.save(state, version, "test", "end-assignment")
    model = client.get("/api/model").json()
    assert next(p for p in model["people"] if p["EmployeeID"] == "030")[
        "companyAllocation"
    ]["canEdit"]
    assert all(
        p["EmployeeID"] != "030"
        for p in client.get("/api/organization").json()["employees"]
    )


def test_executive_pool_rolls_up_once_outside_department_costs():
    from backend.domain import budget_metrics

    s = overhead_state()
    pool = ["001", "030"]
    company = budget_metrics(s, "company", "2026", "USD", TODAY, pool)
    assert company["total"] == payroll(s, set(s["Employees"]), TODAY, "USD")
    assert (
        company["direct"]["payroll"] == payroll(s, set(pool), TODAY, "USD")["payroll"]
    )
    direct = sum(
        budget_metrics(s, k, "2026", "USD", TODAY, pool)["direct"]["payroll"]
        for k in s["OrganizationalUnits"]
    )
    assert direct == pytest.approx(company["total"]["payroll"])
    original = budget_metrics(
        s, s["Employees"]["030"]["OrgUnitID"], "2026", "USD", TODAY
    )
    excluded = budget_metrics(
        s, s["Employees"]["030"]["OrgUnitID"], "2026", "USD", TODAY, pool
    )
    assert (
        original["direct"]["payroll"] - excluded["direct"]["payroll"]
        == payroll(s, {"030"}, TODAY, "USD")["payroll"]
    )


def test_informational_overhead_reconciles_cents_across_companies():
    from decimal import Decimal

    s = overhead_state()
    for row in s["CompanyAllocations"].values():
        row["DivergentPercent"] = "75"
    cfg = default_model(s)
    cfg.update(executiveIDs=["001"], divergentPercent=33.3)
    preview = overhead_preview(s, cfg, TODAY, "USD")
    assert sum(
        Decimal(str(row["overhead"] or 0)) for row in preview["rows"]
    ) == Decimal(str(preview["pool"]["payroll"]))


def test_department_overhead_is_an_alternative_view_of_the_same_pool():
    from decimal import Decimal

    s = overhead_state()
    for row in s["CompanyAllocations"].values():
        row["DivergentPercent"] = "75"
    cfg = default_model(s)
    cfg.update(executiveIDs=["001"], divergentPercent=90)
    result = overhead_preview(s, cfg, TODAY, "USD")
    assert sum(
        Decimal(str(r["overhead"] or 0)) for r in result["departmentRows"]
    ) == Decimal(str(result["pool"]["payroll"]))
    for company in ["company", "czinger"]:
        assert sum(
            Decimal(str(r["overhead"] or 0))
            for r in result["departmentRows"]
            if r["companyID"] == company
        ) == sum(
            Decimal(str(r["overhead"] or 0))
            for r in result["rows"]
            if r["companyID"] == company
        )
