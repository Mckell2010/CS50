import copy
import pytest
from fastapi.testclient import TestClient
from backend import app as module, auth
from backend.db import Database
from backend.domain import merge_import, validate
from backend.sample import sample_state


@pytest.fixture
def client(monkeypatch, tmp_path):
    db = Database("sqlite:///" + str(tmp_path / "structure.db"))
    db.save(sample_state(), 0, "test", "seed")
    monkeypatch.setattr(module, "DB", db)
    monkeypatch.setattr(auth, "MODE", "development")
    with TestClient(module.app) as c:
        yield c


def add(client, ident, parent, tier, kind="subteam"):
    _, v = module.DB.read()
    return client.put(
        "/api/planning/OrganizationalUnits/" + ident,
        json={
            "version": v,
            "record": dict(
                OrgUnitID=ident,
                OrgUnitName=ident,
                ParentOrgUnitID=parent,
                Tier=str(tier),
                UnitType=kind,
                DepartmentCode="12",
            ),
        },
    )


def delete(client, ident, promote=False, version=None):
    _, v = module.DB.read()
    return client.request(
        "DELETE",
        "/api/units/" + ident,
        json={"version": v if version is None else version, "promoteChildren": promote},
    )


def test_create_deep_subtiers_move_and_remove_level_preserves_reporting_and_codes(
    client,
):
    before, _ = module.DB.read()
    assert add(client, "team", "platform", 4, "team").status_code == 200
    assert add(client, "subteam", "team", 5).status_code == 200
    assert add(client, "deep", "subteam", 6).status_code == 200
    assert delete(client, "subteam").status_code == 422
    assert delete(client, "subteam", True).status_code == 200
    state, _ = module.DB.read()
    assert state["Employees"] == before["Employees"]
    assert state["OrganizationalUnits"]["deep"]["ParentOrgUnitID"] == "team"
    assert state["OrganizationalUnits"]["deep"]["Tier"] == "6"
    assert state["OrganizationalUnits"]["deep"]["DepartmentCode"] == "12"
    assert not validate(state)[0]
    # Move without touching manager relationships or the department code.
    assert add(client, "team", "vehicle", 4, "team").status_code == 200
    state, _ = module.DB.read()
    assert state["OrganizationalUnits"]["team"]["ParentOrgUnitID"] == "vehicle"
    assert state["Employees"] == before["Employees"]


@pytest.mark.parametrize("sheet", ["Employees", "Budgets", "Objectives"])
def test_deletion_requires_reassigning_records_including_inactive(client, sheet):
    assert add(client, "testunit", "platform", 4, "team").status_code == 200
    state, v = module.DB.read()
    row = next(iter(state[sheet].values()))
    row["OrgUnitID"] = "testunit"
    if sheet == "Employees":
        row["EmploymentStatus"] = "inactive"
    module.DB.save(state, v, "test", "fixture")
    before = module.DB.read()
    response = delete(client, "testunit")
    assert response.status_code == 422
    assert sheet.lower() in response.text
    assert module.DB.read() == before


@pytest.mark.parametrize("role", ["owner", "viewer"])
def test_deletion_requires_admin_or_finance(client, role):
    assert add(client, "testunit", "platform", 4, "team").status_code == 200
    client.post("/api/dev-session", json={"role": role})
    assert delete(client, "testunit").status_code == 403


def test_deleted_units_do_not_reappear_on_import(client):
    assert add(client, "testunit", "platform", 4, "team").status_code == 200
    incoming, _ = module.DB.read()
    assert delete(client, "testunit").status_code == 200
    current, _ = module.DB.read()
    merged, _, conflicts = merge_import(
        current,
        incoming,
        "incremental",
        "test",
        deleted_units=module.DB.get_setting("deleted_units"),
    )
    assert "testunit" not in merged["OrganizationalUnits"]
    assert any(c["id"] == "testunit" for c in conflicts)
    assert client.get("/api/audit").json()[0]["action"] == "delete-OrganizationalUnits"


def test_delete_stale_version_is_atomic(client):
    assert add(client, "testunit", "platform", 4, "team").status_code == 200
    before = module.DB.read()
    assert delete(client, "testunit", version=1).status_code == 409
    assert module.DB.read() == before


def test_reparent_cycle_is_atomic(client):
    assert add(client, "team", "platform", 4, "team").status_code == 200
    assert add(client, "subteam", "team", 5).status_code == 200
    before = module.DB.read()
    assert add(client, "team", "subteam", 4, "team").status_code == 422
    assert module.DB.read() == before


def test_moving_populated_branch_changes_unit_rollups_not_reporting_or_company_total(
    client,
):
    assert add(client, "team", "platform", 4, "team").status_code == 200
    state, version = module.DB.read()
    person = dict(state["Employees"]["030"], OrgUnitID="team")
    response = client.put(
        "/api/planning/Employees/030", json={"version": version, "record": person}
    )
    assert response.status_code == 200
    before = client.get("/api/organization").json()
    before_units = {u["OrgUnitID"]: u for u in before["units"]}
    assert add(client, "team", "vehicle", 4, "team").status_code == 200
    after = client.get("/api/organization").json()
    after_units = {u["OrgUnitID"]: u for u in after["units"]}
    person_pay = client.get("/api/people/030/compensation").json()[0]["AnnualTotal"]
    assert (
        after_units["platform"]["metrics"]["total"]["payroll"]
        == before_units["platform"]["metrics"]["total"]["payroll"] - person_pay
    )
    assert (
        after_units["vehicle"]["metrics"]["total"]["payroll"]
        == before_units["vehicle"]["metrics"]["total"]["payroll"] + person_pay
    )
    assert (
        after_units["company"]["metrics"]["total"]
        == before_units["company"]["metrics"]["total"]
    )
    assert (
        next(p for p in after["employees"] if p["EmployeeID"] == "030")["ManagerID"]
        == person["ManagerID"]
    )
