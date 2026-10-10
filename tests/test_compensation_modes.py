from datetime import date
import pytest
from fastapi.testclient import TestClient
from backend import app as module, auth
from backend.db import Database
from backend.domain import annual_pay_cents, merge_import, payroll, record_key, validate
from backend.sample import sample_state, workbook_bytes
from backend.importer import parse_workbook


@pytest.fixture
def client(monkeypatch, tmp_path):
    db = Database("sqlite:///" + str(tmp_path / "pay.db"))
    db.save(sample_state(), 0, "test", "seed")
    monkeypatch.setattr(module, "DB", db)
    monkeypatch.setattr(auth, "MODE", "development")
    with TestClient(module.app) as c:
        yield c


def save(client, sheet, row, version=None):
    _, current = module.DB.read()
    return client.put(
        "/api/planning/" + sheet + "/" + record_key(sheet, row),
        json={"version": current if version is None else version, "record": row},
    )


def classify(client, kind, exemption=""):
    state, _ = module.DB.read()
    row = dict(
        state["Employees"]["030"], EmploymentType=kind, ExemptionStatus=exemption
    )
    return save(client, "Employees", row)


def pay_row(basis, **values):
    return dict(
        EmployeeID="030",
        EffectiveFrom="2025-01-01",
        EffectiveTo="",
        Currency="USD",
        PayBasis=basis,
        AnnualEmployerCosts="0",
        **values
    )


@pytest.mark.parametrize(
    "kind,exemption,basis,values,expected",
    [
        (
            "FTE",
            "exempt",
            "salary",
            dict(AnnualBasePay="120000", AnnualTargetBonus="10000"),
            130000,
        ),
        (
            "FTE",
            "non-exempt",
            "hourly",
            dict(HourlyRate="25.25", AnnualHours="2080"),
            52520,
        ),
        (
            "FTE",
            "non-exempt",
            "hourly",
            dict(HourlyRate="25.25", AnnualHours="1000"),
            25250,
        ),
        ("Contractor", "", "monthly", dict(MonthlyRate="10000"), 120000),
    ],
)
def test_conditional_pay_and_rollup(client, kind, exemption, basis, values, expected):
    assert classify(client, kind, exemption).status_code == 200
    response = save(client, "Compensation", pay_row(basis, **values))
    assert response.status_code == 200, response.text
    state, version = module.DB.read()
    # Fractional contributor weight must not scale actual compensation a second time.
    state["Employees"]["030"]["FTE"] = "0.5"
    module.DB.save(state, version, "test", "fte")
    result = payroll(state, {"030"}, date.today().isoformat(), "USD")
    assert result["payroll"] == expected
    assert result["complete"]
    assert (
        client.get("/api/people/030/compensation").json()[0]["AnnualTotal"] == expected
    )
    exported, errors, _, _ = parse_workbook(workbook_bytes(state))
    assert not errors and not validate(exported)[0]
    assert (
        payroll(exported, {"030"}, date.today().isoformat(), "USD")["payroll"]
        == expected
    )


@pytest.mark.parametrize(
    "kind,exemption",
    [("FTE", ""), ("FTE", "salaried"), ("Contractor", "exempt"), ("Intern", "")],
)
def test_classification_rejected_atomically(client, kind, exemption):
    before = module.DB.read()
    assert classify(client, kind, exemption).status_code == 422
    assert module.DB.read() == before


@pytest.mark.parametrize(
    "row",
    [
        pay_row("hourly", HourlyRate="25", AnnualHours="2080"),  # mismatches exempt FTE
        pay_row("salary", AnnualBasePay="-1", AnnualTargetBonus="0"),
        pay_row("salary", AnnualBasePay="100000"),
        pay_row(
            "salary", AnnualBasePay="100000", AnnualTargetBonus="0", MonthlyRate="500"
        ),
    ],
)
def test_bad_compensation_rejected_atomically(client, row):
    before = module.DB.read()
    assert save(client, "Compensation", row).status_code == 422
    assert module.DB.read() == before


@pytest.mark.parametrize("hours", ["-1", "8785", "NaN", "Infinity"])
def test_invalid_annual_hours(client, hours):
    assert classify(client, "FTE", "non-exempt").status_code == 200
    assert (
        save(
            client,
            "Compensation",
            pay_row("hourly", HourlyRate="25", AnnualHours=hours),
        ).status_code
        == 422
    )


def test_unknown_hours_are_unknown_pay_and_legacy_costs_preserved():
    assert annual_pay_cents(pay_row("hourly", HourlyRate="25", AnnualHours="")) is None
    legacy = dict(
        AnnualBasePay="100000", AnnualTargetBonus="10000", AnnualEmployerCosts="20000"
    )
    assert annual_pay_cents(legacy) == 13000000
    assert (
        annual_pay_cents(dict(legacy, PayBasis="monthly", MonthlyRate="5000"))
        == 8000000
    )


@pytest.mark.parametrize("role", ["owner", "viewer"])
def test_compensation_restricted(client, role):
    client.post("/api/dev-session", json={"role": role})
    assert (
        save(
            client,
            "Compensation",
            pay_row("salary", AnnualBasePay="100000", AnnualTargetBonus="0"),
        ).status_code
        == 403
    )
    assert client.get("/api/people/030/compensation").status_code == 403
    graph = client.get("/api/organization").text
    for field in ("HourlyRate", "MonthlyRate", "AnnualBasePay", "AnnualTotal"):
        assert field not in graph


def test_finance_can_edit_pay_with_version_and_import_protection(client):
    client.post("/api/dev-session", json={"role": "finance"})
    row = pay_row("salary", AnnualBasePay="100000", AnnualTargetBonus="0")
    assert save(client, "Compensation", row).status_code == 200
    assert (
        save(
            client, "Compensation", dict(row, AnnualBasePay="200000"), version=1
        ).status_code
        == 409
    )
    state, _ = module.DB.read()
    merged, _, conflicts = merge_import(state, sample_state(), "incremental", "test")
    assert (
        merged["Compensation"][record_key("Compensation", row)]["AnnualBasePay"]
        == "100000"
    )
    assert any(c["sheet"] == "Compensation" for c in conflicts)


def test_overlapping_periods_rejected_and_historical_basis_retained(client):
    assert (
        save(
            client,
            "Compensation",
            pay_row("salary", AnnualBasePay="100000", AnnualTargetBonus="0"),
        ).status_code
        == 200
    )
    assert classify(client, "Contractor").status_code == 200
    overlapping = pay_row("monthly", MonthlyRate="10000")
    overlapping["EffectiveFrom"] = "2026-01-01"
    assert save(client, "Compensation", overlapping).status_code == 422
    old = pay_row("salary", AnnualBasePay="100000", AnnualTargetBonus="0")
    old["EffectiveTo"] = "2025-12-31"
    assert save(client, "Compensation", old).status_code == 200
    assert save(client, "Compensation", overlapping).status_code == 200
