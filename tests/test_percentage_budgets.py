from datetime import date
import pytest
from fastapi.testclient import TestClient
from backend import app as module, auth
from backend.db import Database
from backend.domain import budget_metrics, resolved_budgets, validate, record_key
from backend.sample import sample_state, workbook_bytes
from backend.importer import parse_workbook

YEAR = str(date.today().year)


@pytest.fixture
def client(monkeypatch, tmp_path):
    db = Database("sqlite:///" + str(tmp_path / "percent.db"))
    db.save(sample_state(), 0, "test", "seed")
    monkeypatch.setattr(module, "DB", db)
    monkeypatch.setattr(auth, "MODE", "development")
    with TestClient(module.app) as c:
        yield c


def save(client, unit, **changes):
    state, v = module.DB.read()
    row = next(b.copy() for b in state["Budgets"].values() if b["OrgUnitID"] == unit)
    row.update(changes)
    return client.put(
        "/api/planning/Budgets/" + row["BudgetID"], json={"version": v, "record": row}
    )


def envelopes(client):
    return {
        u["OrgUnitID"]: u["metrics"]
        for u in client.get("/api/organization").json()["units"]
    }


def test_percentage_cascades_and_legacy_conversion_preserves_budget_values(client):
    before = envelopes(client)
    assert (
        save(client, "eng", AllocationPercent="36", DirectPercent="0").status_code
        == 200
    )
    first = envelopes(client)
    for key in before:
        assert first[key]["envelope"] == before[key]["envelope"]
    assert (
        save(
            client, "company", ApprovedEnvelope="15000000", DirectPercent="0"
        ).status_code
        == 200
    )
    after = envelopes(client)
    assert after["eng"]["envelope"] == 5400000
    assert after["platform"]["envelope"] == 2400000
    assert after["software"]["envelope"] == 1700000
    # Percentage controls do not change actual payroll or duplicate the company budget.
    assert after["company"]["total"] == before["company"]["total"]
    assert after["company"]["envelope"] == 15000000
    assert after["company"]["childEnvelopes"] == before["company"]["childEnvelopes"] * 2


def test_percentages_are_immediate_parent_not_company(client):
    assert (
        save(client, "eng", AllocationPercent="40", DirectPercent="10").status_code
        == 200
    )
    assert (
        save(client, "platform", AllocationPercent="25", DirectPercent="20").status_code
        == 200
    )
    assert (
        save(client, "software", AllocationPercent="50", DirectPercent="0").status_code
        == 200
    )
    values = envelopes(client)
    assert values["eng"]["envelope"] == 3000000
    assert values["platform"]["envelope"] == 750000
    assert values["platform"]["directAllocation"] == 150000
    assert values["software"]["envelope"] == 375000
    assert values["platform"]["unallocated"] == 225000
    assert (
        save(client, "eng", AllocationPercent="20", DirectPercent="10").status_code
        == 200
    )
    assert envelopes(client)["software"]["envelope"] == 187500


@pytest.mark.parametrize("value", ["-1", "101", "NaN", "Infinity", "words"])
def test_bad_percentage_is_atomic(client, value):
    before = module.DB.read()
    assert (
        save(client, "eng", AllocationPercent=value, DirectPercent="0").status_code
        == 422
    )
    assert module.DB.read() == before


def test_zero_parent_supports_explicit_percentages_and_later_grows(client):
    assert (
        save(client, "eng", AllocationPercent="30", DirectPercent="0").status_code
        == 200
    )
    assert (
        save(client, "company", ApprovedEnvelope="0", DirectPercent="0").status_code
        == 200
    )
    assert envelopes(client)["eng"]["envelope"] == 0
    assert (
        save(
            client, "company", ApprovedEnvelope="1000000", DirectPercent="0"
        ).status_code
        == 200
    )
    assert envelopes(client)["eng"]["envelope"] == 300000


def test_overallocation_visible_for_finance_and_blocked_for_owner(client):
    assert (
        save(client, "eng", AllocationPercent="100", DirectPercent="0").status_code
        == 200
    )
    values = envelopes(client)
    assert values["company"]["unallocated"] < 0
    client.post("/api/dev-session", json={"role": "owner"})
    before = module.DB.read()
    assert (
        save(client, "eng", AllocationPercent="90", DirectPercent="0").status_code
        == 403
    )
    assert module.DB.read() == before
    assert (
        save(client, "platform", AllocationPercent="100", DirectPercent="0").status_code
        == 422
    )


def test_percentage_rounding_reconciles_siblings_to_parent_cent():
    state = sample_state()
    rows = {r["OrgUnitID"]: r for r in state["Budgets"].values()}
    rows["company"].update(ApprovedEnvelope="0.05", DirectPercent="0")
    for unit, pct in [("eng", "33.33"), ("ops", "33.33"), ("growth", "33.34")]:
        rows[unit]["AllocationPercent"] = pct
    _, env, _ = resolved_budgets(state, YEAR, "USD")
    assert sum(env[u] for u in ["eng", "ops", "growth"]) == 5
    assert env["growth"] == 2


def test_percentage_export_import_and_app_ownership(client):
    assert (
        save(client, "eng", AllocationPercent="30", DirectPercent="5").status_code
        == 200
    )
    state, _ = module.DB.read()
    imported, errors, _, _ = parse_workbook(workbook_bytes(state))
    assert not errors and not validate(imported)[0]
    assert (
        resolved_budgets(imported, YEAR, "USD")[1]
        == resolved_budgets(state, YEAR, "USD")[1]
    )
    assert all(b["_source"] == "app" for b in state["Budgets"].values())
    assert client.get("/api/audit").json()[0]["details"]["convertedBudgets"]


def test_root_cannot_take_percentage_and_new_percentage_requires_parent():
    state = sample_state()
    row = next(b for b in state["Budgets"].values() if b["OrgUnitID"] == "company")
    row["AllocationPercent"] = "100"
    assert any(e["field"] == "AllocationPercent" for e in validate(state)[0])
    row.pop("AllocationPercent")
    del state["Budgets"][row["BudgetID"]]
    next(b for b in state["Budgets"].values() if b["OrgUnitID"] == "eng")[
        "AllocationPercent"
    ] = "20"
    assert any(e["field"] == "AllocationPercent" for e in validate(state)[0])
