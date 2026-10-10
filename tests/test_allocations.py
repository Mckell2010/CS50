import copy
from datetime import date
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from backend import app as module, auth
from backend.allocations import allocation_summaries
from backend.db import Database
from backend.domain import empty_state, merge_import
from backend.sample import sample_state, workbook_bytes

TODAY = date.today().isoformat()


def tree():
    state = empty_state()
    parents = {
        "root": "",
        "left": "root",
        "right": "root",
        "a": "left",
        "b": "right",
        "c": "right",
        "d": "right",
    }
    for key, parent in parents.items():
        state["Employees"][key] = dict(
            EmployeeID=key,
            ManagerID=parent,
            FTE="0.5" if key == "d" else "1",
            EmploymentStatus="active",
            StartDate="2020-01-01",
            EndDate="",
        )
    state["CompanyAllocations"] = {
        key: dict(EmployeeID=key, DivergentPercent="0" if key == "d" else "100")
        for key in "abcd"
    }
    return state


def summaries(state, visible=None):
    return allocation_summaries(
        state, TODAY, set(state["Employees"]) if visible is None else visible
    )


def test_downstream_fte_weighting_ignores_managers_and_unequal_branch_sizes():
    state = tree()
    result = summaries(state)
    assert result["left"]["divergentPercent"] == 100
    assert result["right"]["divergentPercent"] == 80
    assert result["root"]["divergentPercent"] == 85.71  # Not (100 + 80) / 2.
    assert result["root"]["czingerPercent"] == 14.29
    assert result["root"]["contributorCount"] == 4
    assert result["root"]["contributorFTE"] == 3.5
    state["Employees"]["right"]["FTE"] = "0.1"
    assert summaries(state)["root"] == result["root"]
    # A reporting move changes branch composition, without duplicating any contributor.
    state["Employees"]["d"]["ManagerID"] = "left"
    moved = summaries(state)
    assert moved["root"] == result["root"]
    assert moved["left"]["divergentPercent"] == 66.67
    assert moved["right"]["divergentPercent"] == 100


def test_missing_allocations_are_not_defaulted_or_normalized_away():
    state = tree()
    del state["CompanyAllocations"]["d"]
    result = summaries(state)
    assert result["d"]["status"] == "unassigned"
    assert result["root"]["status"] == "incomplete"
    assert result["root"]["divergentPercent"] is None
    assert result["root"]["unassignedCount"] == 1
    assert result["root"]["contributorFTE"] == 3.5
    assert result["left"]["status"] == "complete"


def test_active_intervals_zero_fte_and_dormant_manager_assignment():
    state = tree()
    state["CompanyAllocations"]["root"] = dict(EmployeeID="root", DivergentPercent="0")
    state["Employees"]["d"].update(EmploymentStatus="inactive", EndDate="2020-12-31")
    assert summaries(state)["root"]["divergentPercent"] == 100
    state["Employees"]["a"]["FTE"] = "0"
    result = summaries(state)
    assert result["left"]["status"] == "zero-fte"
    assert result["a"]["divergentPercent"] == 100
    state["Employees"]["a"]["StartDate"] = "2200-01-01"
    assert summaries(state)["left"]["status"] == "no-contributors"
    state["Employees"]["d"].update(
        EmploymentStatus="leave", StartDate=TODAY, EndDate=TODAY
    )
    assert summaries(state)["root"]["contributorCount"] == 3


def test_scope_restriction_does_not_recompute_a_misleading_partial_manager_split():
    result = summaries(tree(), {"root", "left", "a"})
    assert result["root"] == {
        "mode": "calculated",
        "canEdit": False,
        "status": "restricted",
    }
    assert result["left"]["divergentPercent"] == 100
    assert set(result) == {"root", "left", "a"}


def test_deep_reporting_chain_does_not_use_recursive_rollups():
    state = empty_state()
    for index in range(2000):
        key = str(index)
        state["Employees"][key] = dict(
            EmployeeID=key,
            ManagerID=str(index - 1) if index else "",
            FTE="1",
            EmploymentStatus="active",
            StartDate="2020-01-01",
        )
    state["CompanyAllocations"]["1999"] = dict(EmployeeID="1999", DivergentPercent="25")
    assert summaries(state)["0"]["divergentPercent"] == 25
    assert summaries(state)["0"]["contributorCount"] == 1


@pytest.fixture
def client(monkeypatch, tmp_path):
    db = Database("sqlite:///" + str(tmp_path / "allocation.db"))
    db.save(sample_state(), 0, "test", "seed", setting=("synthetic", True))
    monkeypatch.setattr(module, "DB", db)
    monkeypatch.setattr(auth, "MODE", "development")
    with TestClient(module.app) as client:
        yield client


def save(client, employee, percent, version=None):
    version = (
        client.get("/api/organization").json()["version"]
        if version is None
        else version
    )
    return client.put(
        "/api/planning/CompanyAllocations/" + employee,
        json={
            "version": version,
            "record": {"EmployeeID": employee, "DivergentPercent": percent},
        },
    )


def preview(client, state):
    return client.post(
        "/api/imports/preview",
        files={"file": ("allocation.xlsx", workbook_bytes(state))},
    ).json()


def commit(client, preview):
    return client.post(
        "/api/imports/" + preview["id"] + "/commit",
        json={
            "acknowledgeWarnings": True,
            "confirmConflicts": True,
            "confirmDeactivations": True,
        },
    )


@pytest.mark.parametrize("percent", [0, 25, 50, 75, 100])
def test_explicit_presets_persist_without_changing_payroll(client, percent):
    before = client.get("/api/organization").json()
    assert save(client, "030", percent).status_code == 200
    after = client.get("/api/organization").json()
    person = next(p for p in after["employees"] if p["EmployeeID"] == "030")
    assert person["companyAllocation"]["divergentPercent"] == percent
    assert person["companyAllocation"]["czingerPercent"] == 100 - percent
    assert after["summary"] == before["summary"]
    assert [p["metrics"] for p in after["employees"]] == [
        p["metrics"] for p in before["employees"]
    ]
    stored, _ = module.DB.read()
    assert stored["CompanyAllocations"]["030"]["_source"] == "app"
    assert client.get("/api/audit").json()[0]["action"] == "edit-CompanyAllocations"


@pytest.mark.parametrize("percent", ["", 10, 90, -25, 125, "NaN", "Infinity"])
def test_invalid_presets_are_atomic(client, percent):
    before = module.DB.read()
    assert save(client, "030", percent).status_code == 422
    assert module.DB.read() == before


def test_managers_cannot_be_overridden_and_stale_edits_fail(client):
    assert save(client, "001", 50).status_code == 422
    version = client.get("/api/organization").json()["version"]
    assert save(client, "030", 25, version).status_code == 200
    assert save(client, "030", 75, version).status_code == 409
    state, _ = module.DB.read()
    assert state["CompanyAllocations"]["030"]["DivergentPercent"] == "25"


def test_allocation_permissions_and_outside_scope_reports(client):
    state, version = module.DB.read()
    state["Employees"]["030"]["ManagerID"] = "002"
    state["Employees"]["030"]["OrgUnitID"] = "brand"
    state["CompanyAllocations"]["030"] = dict(EmployeeID="030", DivergentPercent="25")
    module.DB.save(state, version, "test", "cross-scope")
    client.post("/api/dev-session", json={"role": "owner"})
    data = client.get("/api/organization").json()
    manager = next(p for p in data["employees"] if p["EmployeeID"] == "002")
    assert manager["companyAllocation"]["status"] == "restricted"
    assert "divergentPercent" not in manager["companyAllocation"]
    assert save(client, "030", 100).status_code == 403
    ic = next(
        p for p in data["employees"] if p["companyAllocation"]["mode"] == "explicit"
    )
    assert save(client, ic["EmployeeID"], 75).status_code == 200
    client.post("/api/dev-session", json={"role": "viewer"})
    assert save(client, ic["EmployeeID"], 100).status_code == 403
    assert all(
        not p["companyAllocation"]["canEdit"]
        for p in client.get("/api/organization").json()["employees"]
    )


def test_old_workbook_and_conflicting_import_preserve_app_owned_assignment(client):
    assert save(client, "030", 25).status_code == 200
    state = sample_state()
    state.pop(
        "CompanyAllocations"
    )  # Older saved snapshot remains exportable/restorable.
    old = preview(client, state)
    assert not old["errors"] and not old["changes"]
    assert commit(client, old).status_code == 200
    state["CompanyAllocations"] = {
        "030": dict(EmployeeID="030", DivergentPercent="100")
    }
    state["Employees"]["030"]["Name"] = "Updated synthetic name"
    conflict = preview(client, state)
    assert any(c["sheet"] == "CompanyAllocations" for c in conflict["conflicts"])
    assert commit(client, conflict).status_code == 200
    stored, _ = module.DB.read()
    assert stored["CompanyAllocations"]["030"]["DivergentPercent"] == "25"
    assert stored["Employees"]["030"]["Name"] == "Updated synthetic name"
    identical = preview(client, stored)
    assert not identical["errors"] and not identical["changes"]


def test_promotion_ignores_saved_ic_allocation_and_rejects_new_manager_import(client):
    assert save(client, "030", 25).status_code == 200
    state, _ = module.DB.read()
    state["Employees"]["029"]["ManagerID"] = "030"
    state["CompanyAllocations"]["029"] = dict(EmployeeID="029", DivergentPercent="100")
    promoted = preview(client, state)
    assert not promoted["errors"] and any(
        "retained but ignored" in w for w in promoted["warnings"]
    )
    assert commit(client, promoted).status_code == 200
    person = next(
        p
        for p in client.get("/api/organization").json()["employees"]
        if p["EmployeeID"] == "030"
    )
    assert person["companyAllocation"]["mode"] == "calculated"
    assert person["companyAllocation"]["divergentPercent"] == 100
    assert not person["companyAllocation"]["canEdit"]
    state["CompanyAllocations"]["001"] = dict(EmployeeID="001", DivergentPercent="50")
    invalid = preview(client, state)
    assert any(e["sheet"] == "CompanyAllocations" for e in invalid["errors"])
    before = module.DB.read()
    assert commit(client, invalid).status_code == 422
    assert module.DB.read() == before


def test_v1_database_upgrades_without_changing_existing_data(tmp_path):
    url = "sqlite:///" + str(tmp_path / "legacy.db")
    db = Database(url)
    db.save(sample_state(), 0, "test", "seed")
    before, version = db.read()
    with db.engine.begin() as conn:
        conn.execute(text("DROP TABLE company_allocations"))
        conn.execute(text("UPDATE schema_state SET schema_version=1"))
    db.engine.dispose()
    upgraded = Database(url)
    assert upgraded.read() == (before, version)
    with upgraded.engine.connect() as conn:
        assert (
            conn.execute(text("SELECT schema_version FROM schema_state")).scalar_one()
            == 2
        )
