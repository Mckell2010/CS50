import os, json, uuid, copy, hashlib, asyncio, time
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
from contextlib import asynccontextmanager
from urllib.parse import urlsplit
from io import BytesIO
from fastapi import FastAPI, Request, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse, Response, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, insert, delete
from pydantic import BaseModel, Field
import jwt
from backend import auth
from backend.auth import (
    principal,
    Principal,
    visible_units,
    require_admin,
    require_editor,
)
from backend.db import Database, StaleWrite, previews, imports, audit
from backend.domain import *
from backend.allocations import allocation_summaries
from backend.importer import parse_workbook, MAX_UPLOAD
from backend.sample import sample_state, workbook_bytes

DB = Database()


@asynccontextmanager
async def lifespan(app):
    auth.validate_config()
    state, v = DB.read()
    if (
        v == 0
        and auth.MODE == "development"
        and os.getenv("SEED_SAMPLE", "true").lower() == "true"
    ):
        sample = sample_state()
        errors, _ = validate(sample)
        if errors:
            raise RuntimeError(errors)
        DB.save(
            sample,
            0,
            "system",
            "seed-synthetic-sample",
            {"synthetic": True},
            setting=("synthetic", True),
        )
    task = asyncio.create_task(graph_poll()) if graph_configured() else None
    yield
    if task:
        task.cancel()


app = FastAPI(title="Divergent Organization Explorer", lifespan=lifespan)


@app.middleware("http")
async def security(request, call_next):
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        origin = request.headers.get("origin")
        if origin and urlsplit(origin).netloc != request.headers.get("host"):
            return JSONResponse({"detail": "Cross-origin write rejected"}, 403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://login.microsoftonline.com; frame-src https://login.microsoftonline.com; frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
    )
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(StaleWrite)
async def stale(request, exc):
    return JSONResponse({"detail": str(exc)}, 409)


@app.get("/api/health")
def health():
    _, version = DB.read()
    return {"status": "ok", "schemaVersion": 2, "dataVersion": version}


@app.get("/api/auth/config")
def auth_config():
    return {
        "mode": auth.MODE,
        "clientId": os.getenv("ENTRA_CLIENT_ID"),
        "tenantId": os.getenv("ENTRA_TENANT_ID"),
        "scope": os.getenv("ENTRA_SCOPE"),
    }


class Login(BaseModel):
    role: str


@app.post("/api/dev-session")
def dev_session(body: Login):
    if auth.MODE != "development":
        raise HTTPException(404, "Development authentication disabled")
    if body.role not in auth.DEV_ROLES:
        raise HTTPException(400, "Unknown role")
    token = jwt.encode(
        {"role": body.role, "exp": datetime.now(timezone.utc) + timedelta(hours=12)},
        auth.DEV_SECRET,
        algorithm="HS256",
    )
    res = JSONResponse({"role": body.role})
    res.set_cookie(
        "divergent_session",
        token,
        httponly=True,
        samesite="strict",
        max_age=43200,
        secure=os.getenv("COOKIE_SECURE") == "true",
    )
    return res


@app.get("/api/session")
def session(p: Principal = Depends(principal)):
    return {
        "id": p.id,
        "role": p.role,
        "unit": p.unit,
        "development": auth.MODE == "development",
        "canImport": p.role == "admin",
        "canEdit": p.editor,
        "canViewCompensation": p.finance,
    }


def public(row):
    return {k: v for k, v in row.items() if not k.startswith("_")}


def graph_data(state, p, as_of, currency):
    units = visible_units(state, p)
    people = {
        k: e
        for k, e in state["Employees"].items()
        if e["OrgUnitID"] in units
        and (active(e, as_of) or e.get("EmploymentStatus") in {"vacant", "draft"})
    }
    active_count = sum(active(e, as_of) for e in people.values())
    org = {k: u for k, u in state["OrganizationalUnits"].items() if k in units}
    objectives = {
        k: o for k, o in state["Objectives"].items() if o["OrgUnitID"] in units
    }
    # Company-level objective text and health are published to all signed-in roles.
    if p.role == "owner":
        objectives.update(
            {
                k: o
                for k, o in state["Objectives"].items()
                if state["OrganizationalUnits"][o["OrgUnitID"]]["UnitType"] == "company"
            }
        )
    result = {"employees": [], "units": [], "objectives": [], "keyResults": []}

    def safe_metric(metric, allow=False):
        if not allow:
            return {
                "headcount": metric["headcount"],
                "fte": metric["fte"],
                "payroll": None,
                "restricted": True,
            }
        return metric

    def scope_metric(ids, allow=False):
        return safe_metric(payroll(state, ids, as_of, currency), allow)

    full = scope_metric(
        set(people), p.finance or (p.role == "owner" and active_count >= 5)
    )
    full["scope"] = (
        "Company"
        if p.role != "owner"
        else org.get(p.unit, {}).get("OrgUnitName", "Assigned scope")
    )
    full["aggregationPolicy"] = (
        "Owners see one fixed scope total only, with at least 5 active people. Subtotals and individual pay are restricted."
    )
    result["summary"] = full
    allocations = allocation_summaries(
        state,
        as_of,
        set(people),
        DB.get_setting("model", {}).get("includeContractors", True),
    )
    emp_children = children(people, "ManagerID")
    for k, e in people.items():
        row = public(e)
        row["ManagerID"] = e.get("ManagerID") if e.get("ManagerID") in people else ""
        row["companyAllocation"] = allocations[k]
        row["companyAllocation"]["canEdit"] &= p.editor
        row["directReports"] = len(emp_children.get(k, []))
        ids = descendants(people, "ManagerID", k)
        row["metrics"] = scope_metric(ids, p.finance)
        row["downstreamReports"] = len(ids) - 1
        result["employees"].append(row)
    for k, u in org.items():
        row = public(u)
        row["ParentOrgUnitID"] = (
            u.get("ParentOrgUnitID") if u.get("ParentOrgUnitID") in org else ""
        )
        row["OwnerEmployeeID"] = (
            u.get("OwnerEmployeeID") if u.get("OwnerEmployeeID") in people else ""
        )
        metric = budget_metrics(
            state,
            k,
            as_of[:4],
            currency,
            as_of,
            DB.get_setting("model", {}).get("executiveIDs", []),
        )
        allow = p.finance or (p.role == "owner" and k == p.unit and active_count >= 5)
        metric["total"] = safe_metric(metric["total"], allow)
        metric["direct"] = safe_metric(metric["direct"], p.finance)
        if not allow:
            metric.pop("headroom", None)
        if not p.finance:
            metric.pop("directHeadroom", None)
        if p.role == "viewer":
            metric = {
                key: value
                for key, value in metric.items()
                if key in {"total", "direct"}
            }
        elif metric.get("budget"):
            metric["budget"] = public(metric["budget"])
        row["metrics"] = metric
        row["source"] = u.get("_source", "excel")
        result["units"].append(row)
    for k, o in objectives.items():
        row = public(o)
        row["ParentObjectiveID"] = (
            o.get("ParentObjectiveID")
            if o.get("ParentObjectiveID") in objectives
            else ""
        )
        row["OwnerEmployeeID"] = (
            o.get("OwnerEmployeeID") if o.get("OwnerEmployeeID") in people else ""
        )
        row["source"] = o.get("_source", "excel")
        row["readOnly"] = o["OrgUnitID"] not in units
        result["objectives"].append(row)
    for k, r in state["KeyResults"].items():
        if (
            r["ObjectiveID"] not in objectives
            or objectives[r["ObjectiveID"]]["OrgUnitID"] not in units
        ):
            continue
        row = public(r)
        row["OwnerEmployeeID"] = (
            r.get("OwnerEmployeeID") if r.get("OwnerEmployeeID") in people else ""
        )
        row.update(kr_progress(r, as_of))
        result["keyResults"].append(row)
    return result


@app.get("/api/organization")
def organization(
    as_of: str | None = None, currency: str = "USD", p: Principal = Depends(principal)
):
    as_of = as_of or date.today().isoformat()
    try:
        date.fromisoformat(as_of)
    except ValueError:
        raise HTTPException(400, "Use an ISO date")
    if currency not in {"USD", "EUR", "GBP", "CAD", "JPY", "AUD", "CHF", "CNY", "INR"}:
        raise HTTPException(400, "Unsupported currency")
    # Owners receive a fixed current scope aggregate, preventing historical/filter differencing.
    if p.role == "owner" and (as_of != date.today().isoformat() or currency != "USD"):
        raise HTTPException(
            403, "Owner aggregates are available only for the current date in USD"
        )
    state, v = DB.read()
    result = graph_data(state, p, as_of, currency)
    result.update(
        version=v,
        asOf=as_of,
        currency=currency,
        synthetic=DB.get_setting("synthetic", False),
        rootEmployee=DB.get_setting("rootEmployee", "001"),
        demoNotes=DB.get_setting("demoNotes", []),
    )
    return result


@app.get("/api/people/{ident}/compensation")
def compensation(ident: str, p: Principal = Depends(principal)):
    if not p.finance:
        raise HTTPException(403, "Individual compensation access required")
    state, _ = DB.read()
    if ident not in state["Employees"]:
        raise HTTPException(404, "Employee not found")
    return [
        public(c) for c in state["Compensation"].values() if c["EmployeeID"] == ident
    ]


@app.get("/api/workbooks/{kind}")
def download(kind: str, p: Principal = Depends(principal)):
    if kind not in {"template", "sample", "export"}:
        raise HTTPException(404, "Workbook not found")
    if kind == "export":
        if not p.finance:
            raise HTTPException(
                403, "Full export requires individual compensation access"
            )
        state, _ = DB.read()
    else:
        state = sample_state() if kind == "sample" else None
    return Response(
        workbook_bytes(
            state,
            synthetic=kind == "sample"
            or (kind == "export" and DB.get_setting("synthetic", False)),
        ),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="divergent-{kind}.xlsx"'
        },
    )


def create_preview(content, filename, mapping, mode, p, synthetic=False, restore=False):
    incoming, parse_errors, headers, warnings = parse_workbook(content, mapping)
    current, v = DB.read()
    # A restored older snapshot must not overwrite any app-owned records.
    merged, changes, conflicts = merge_import(current, incoming, mode, p.id)
    if mode == "snapshot" and not incoming["Employees"]:
        parse_errors.append(
            {
                "sheet": "Employees",
                "row": 2,
                "field": "EmployeeID",
                "message": "An empty snapshot cannot deactivate the whole organization",
            }
        )
    managers = {e.get("ManagerID") for e in merged["Employees"].values()}
    for key, record in incoming.get("CompanyAllocations", {}).items():
        old = current.get("CompanyAllocations", {}).get(key)
        effective = merged["CompanyAllocations"].get(key, {})
        if key in managers and (
            not old
            or clean_value(old.get("DivergentPercent"))
            != clean_value(effective.get("DivergentPercent"))
        ):
            parse_errors.append(
                {
                    "sheet": "CompanyAllocations",
                    "row": record.get("_row"),
                    "field": "EmployeeID",
                    "message": "Set allocations for individual contributors only; manager allocations are calculated",
                }
            )
    errors, domain_warnings = validate(merged)
    token = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    data = {
        "id": token,
        "baseVersion": v,
        "filename": filename,
        "digest": hashlib.sha256(content).hexdigest(),
        "state": merged,
        "changes": changes,
        "conflicts": conflicts,
        "errors": parse_errors + errors,
        "warnings": warnings + domain_warnings,
        "headers": headers,
        "columns": COLUMNS,
        "mode": mode,
        "synthetic": synthetic or DB.get_setting("synthetic", False),
        "restore": restore,
    }
    with DB.engine.begin() as c:
        c.execute(
            delete(previews).where(
                previews.c.created
                < (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
            )
        )
        c.execute(insert(previews).values(id=token, actor=p.id, created=now, data=data))
    return {k: value for k, value in data.items() if k != "state"}


@app.post("/api/imports/preview")
async def preview(
    file: UploadFile = File(...),
    mapping: str = Form("{}"),
    mode: str = Form("incremental"),
    p: Principal = Depends(principal),
):
    require_admin(p)
    if mode not in {"incremental", "snapshot"}:
        raise HTTPException(400, "Invalid import mode")
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(400, "Upload an .xlsx workbook")
    content = await file.read(MAX_UPLOAD + 1)
    try:
        mapping_obj = json.loads(mapping)
        if not isinstance(mapping_obj, dict) or any(
            not isinstance(v, dict) for v in mapping_obj.values()
        ):
            raise ValueError("Invalid column mapping")
        return create_preview(content, file.filename, mapping_obj, mode, p)
    except (ValueError, TypeError) as e:
        raise HTTPException(400, str(e))


class Commit(BaseModel):
    acknowledgeWarnings: bool = False
    confirmDeactivations: bool = False
    confirmConflicts: bool = False


@app.post("/api/imports/{ident}/commit")
def commit(ident: str, body: Commit, p: Principal = Depends(principal)):
    require_admin(p)
    with DB.engine.connect() as c:
        row = c.execute(select(previews).where(previews.c.id == ident)).first()
    if not row or row.actor != p.id:
        raise HTTPException(404, "Preview not found")
    if datetime.fromisoformat(row.created) < datetime.now(timezone.utc) - timedelta(
        hours=1
    ):
        raise HTTPException(410, "Preview expired")
    data = row.data
    if data["errors"]:
        raise HTTPException(
            422,
            {
                "message": "Fix validation errors before importing",
                "errors": data["errors"],
            },
        )
    if data["warnings"] and not body.acknowledgeWarnings:
        raise HTTPException(409, "Acknowledge all import warnings")
    if data["conflicts"] and not body.confirmConflicts:
        raise HTTPException(
            409,
            "Confirm that conflicting workbook rows will be skipped and app-owned records preserved",
        )
    if (
        any(c["kind"] == "deactivation" for c in data["changes"])
        and not body.confirmDeactivations
    ):
        raise HTTPException(409, "Explicitly confirm employee deactivations")
    now = datetime.now(timezone.utc).isoformat()
    version = data["baseVersion"] + 1
    for rows in data["state"].values():
        for r in rows.values():
            if r.get("_source") == "excel" and r.get("_editor") == p.id:
                r["_importVersion"] = version
    DB.save(
        data["state"],
        data["baseVersion"],
        p.id,
        "restore-import" if data["restore"] else "import-workbook",
        {
            "filename": data["filename"],
            "changes": data["changes"],
            "conflicts": data["conflicts"],
        },
        import_info={
            "id": ident,
            "at": now,
            "actor": p.id,
            "filename": data["filename"],
            "digest": data["digest"],
            "summary": {
                "changes": len(data["changes"]),
                "conflicts": len(data["conflicts"]),
            },
        },
        setting=("synthetic", data["synthetic"]),
    )
    graph_status = DB.get_setting("graphStatus", {})
    if graph_status.get("previewId") == ident:
        DB.set_setting(
            "graphStatus",
            dict(
                graph_status,
                state="applied",
                lastSuccessfulRefresh=now,
                previewId=None,
                errors=[],
            ),
        )
    with DB.engine.begin() as c:
        c.execute(delete(previews).where(previews.c.id == ident))
    return {"version": version, "changes": len(data["changes"])}


@app.get("/api/imports")
def history(p: Principal = Depends(principal)):
    require_admin(p)
    with DB.engine.connect() as c:
        return [
            dict(r._mapping)
            for r in c.execute(
                select(
                    imports.c.id,
                    imports.c.at,
                    imports.c.actor,
                    imports.c.filename,
                    imports.c.summary,
                )
                .order_by(imports.c.at.desc())
                .limit(50)
            )
        ]


@app.post("/api/imports/{ident}/restore-preview")
def restore_preview(ident: str, p: Principal = Depends(principal)):
    require_admin(p)
    with DB.engine.connect() as c:
        r = c.execute(select(imports).where(imports.c.id == ident)).first()
    if not r:
        raise HTTPException(404, "Snapshot not found")
    # Incremental restore never deletes newer app work or missing employees.
    return create_preview(
        workbook_bytes(r.state),
        "restore-" + r.filename,
        {},
        "incremental",
        p,
        restore=True,
    )


class Edit(BaseModel):
    version: int
    record: dict


@app.put("/api/planning/{sheet}/{ident}")
def edit(sheet: str, ident: str, body: Edit, p: Principal = Depends(principal)):
    require_editor(p)
    if sheet not in APP_FIELDS:
        raise HTTPException(
            400, "Use workbook imports for employee and compensation changes"
        )
    state, v = DB.read()
    units = visible_units(state, p)
    record = {k: clean_value(body.record.get(k, "")) for k in COLUMNS[sheet]}
    if record_key(sheet, record) != ident:
        raise HTTPException(400, "Record ID must match URL")
    existing = state[sheet].get(ident)
    if sheet == "Employees":
        require_admin(p)
        if (
            record.get("Location")
            and record["Location"] not in LOCATION_OPTIONS
            and (not existing or record["Location"] != existing.get("Location"))
        ):
            raise HTTPException(
                422,
                "Choose Los Angeles - HQ, Los Angeles - LB, Washington DC, or Remote",
            )
    elif sheet == "CompanyAllocations":
        employee = state["Employees"].get(ident)
        if not employee or employee["OrgUnitID"] not in units:
            raise HTTPException(403, "Employee outside your scope")
        if employee.get("EmploymentStatus") in {"vacant", "draft"}:
            raise HTTPException(
                422,
                "Set allocations for active contributors, not vacant or draft positions",
            )
        if any(e.get("ManagerID") == ident for e in state["Employees"].values()):
            raise HTTPException(
                422,
                "Managers are calculated from individual contributors and cannot have manual allocations",
            )
    elif sheet == "OrganizationalUnits":
        parent = record.get("ParentOrgUnitID")
        if p.role == "owner" and (
            parent not in units or (existing and ident not in units) or ident == p.unit
        ):
            raise HTTPException(403, "Unit edits must remain below your assigned scope")
        if (
            existing
            and parent != existing.get("ParentOrgUnitID")
            and p.role not in {"admin", "finance"}
        ):
            raise HTTPException(
                403, "Only administrators or finance may move existing units"
            )
        if p.role == "owner" and record["UnitType"] not in {
            "subdepartment",
            "team",
            "subteam",
        }:
            raise HTTPException(
                403, "Owners may create subdepartments, teams, and subteams"
            )
    elif sheet == "KeyResults":
        obj = state["Objectives"].get(record.get("ObjectiveID"))
        old_obj = (
            state["Objectives"].get(existing.get("ObjectiveID")) if existing else None
        )
        if (
            not obj
            or obj["OrgUnitID"] not in units
            or (old_obj and old_obj["OrgUnitID"] not in units)
        ):
            raise HTTPException(403, "Objective outside your scope")
    else:
        if record.get("OrgUnitID") not in units or (
            existing and existing.get("OrgUnitID") not in units
        ):
            raise HTTPException(403, "Unit outside your scope")
    owner = record.get("OwnerEmployeeID")
    if (
        p.role == "owner"
        and owner
        and (
            owner not in state["Employees"]
            or state["Employees"][owner]["OrgUnitID"] not in units
        )
    ):
        raise HTTPException(403, "Owner must belong to your authorized scope")
    if sheet == "Objectives" and record.get("ParentObjectiveID"):
        parent = state["Objectives"].get(record["ParentObjectiveID"])
        if not parent or (
            parent["OrgUnitID"] not in units
            and state["OrganizationalUnits"][parent["OrgUnitID"]]["UnitType"]
            != "company"
        ):
            raise HTTPException(403, "Parent objective outside your scope")
    if sheet == "Budgets" and p.role == "owner":
        if record["Currency"] != "USD" or record["BudgetYear"] != str(
            date.today().year
        ):
            raise HTTPException(
                403, "Owners allocate the current approved USD envelope only"
            )
        if record["OrgUnitID"] == p.unit and (
            not existing or record["ApprovedEnvelope"] != existing["ApprovedEnvelope"]
        ):
            raise HTTPException(
                403, "Finance must approve changes to your assigned envelope"
            )
        if existing and any(
            record[f] != existing[f] for f in ["OrgUnitID", "BudgetYear", "Currency"]
        ):
            raise HTTPException(
                403, "Budget scope, year, and currency cannot be reassigned"
            )
    record.update(
        _source="app", _editor=p.id, _modified=datetime.now(timezone.utc).isoformat()
    )
    state[sheet][ident] = record
    errors, warnings = validate(state)
    if errors:
        raise HTTPException(
            422, {"message": "Invalid planning change", "errors": errors}
        )
    if sheet == "Objectives" and (
        not existing
        or any(
            record.get(f) != existing.get(f) for f in ["OrgUnitID", "ParentObjectiveID"]
        )
    ):
        target_unit = state["OrganizationalUnits"][record["OrgUnitID"]]
        parent_objective = state["Objectives"].get(record.get("ParentObjectiveID"))
        if target_unit["UnitType"] == "company":
            if parent_objective:
                raise HTTPException(
                    422,
                    "Company objectives start at Tier 0 and do not have parent objectives",
                )
        elif not parent_objective or parent_objective["OrgUnitID"] != target_unit.get(
            "ParentOrgUnitID"
        ):
            raise HTTPException(
                422,
                "Set an objective for the parent unit first, then link this objective to it. Plan OKRs from company level down, one tier at a time.",
            )
    if sheet == "Budgets":
        parent_id = state["OrganizationalUnits"][record["OrgUnitID"]].get(
            "ParentOrgUnitID"
        )
        budgeted = {
            b["OrgUnitID"]
            for b in state["Budgets"].values()
            if b["BudgetYear"] == record["BudgetYear"]
            and b["Currency"] == record["Currency"]
        }
        missing = []
        while parent_id:
            if parent_id not in budgeted:
                missing.append(parent_id)
            parent_id = state["OrganizationalUnits"][parent_id].get("ParentOrgUnitID")
        if missing:
            ancestor = state["OrganizationalUnits"][missing[-1]]["OrgUnitName"]
            raise HTTPException(
                422,
                f"Set the parent unit budget for {ancestor} first ({record['BudgetYear']} {record['Currency']}). Allocate budgets from company level down, one tier at a time.",
            )
    if sheet in {"Budgets", "OrganizationalUnits"} and p.role == "owner":
        for unit in units | {
            ident if sheet == "OrganizationalUnits" else record["OrgUnitID"]
        }:
            metric = budget_metrics(
                state, unit, date.today().year, "USD", date.today().isoformat()
            )
            if metric.get("unallocated", 0) < 0:
                raise HTTPException(
                    422, "Allocations exceed an approved parent or unit envelope"
                )
    DB.save(
        state,
        body.version,
        p.id,
        "edit-" + sheet,
        {
            "id": ident,
            "before": public(existing) if existing else None,
            "after": public(record),
        },
    )
    return {"version": body.version + 1}


@app.get("/api/audit")
def audit_events(p: Principal = Depends(principal)):
    if p.role not in {"admin", "finance"}:
        raise HTTPException(
            403, "Audit history requires administrator or finance access"
        )
    with DB.engine.connect() as c:
        return [
            dict(r._mapping)
            for r in c.execute(select(audit).order_by(audit.c.id.desc()).limit(200))
        ]


class SettingsBody(BaseModel):
    rootEmployee: str
    synthetic: bool
    version: int


@app.put("/api/settings")
def settings_update(body: SettingsBody, p: Principal = Depends(principal)):
    require_admin(p)
    state, v = DB.read()
    if body.rootEmployee not in state["Employees"] or state["Employees"][
        body.rootEmployee
    ].get("ManagerID"):
        raise HTTPException(
            422, "Select an existing employee with no manager as CEO/root"
        )
    if DB.get_setting("synthetic", False) and not body.synthetic:
        raise HTTPException(
            422,
            "This database contains synthetic records. Use an empty production database instead of relabeling sample data.",
        )
    DB.save(
        state,
        body.version,
        p.id,
        "configure-root",
        {"rootEmployee": body.rootEmployee},
        setting=("rootEmployee", body.rootEmployee),
    )
    return {"version": body.version + 1}


class ModelEdit(BaseModel):
    version: int
    config: dict


@app.get("/api/model")
def model_get(p: Principal = Depends(principal)):
    if not p.finance:
        raise HTTPException(
            403, "Model settings require administrator or finance access"
        )
    from backend.overhead import default_model, overhead_preview

    state, version = DB.read()
    config = {**default_model(state), **DB.get_setting("model", {})}
    all_allocations = allocation_summaries(
        state,
        date.today().isoformat(),
        set(state["Employees"]),
        config["includeContractors"],
    )
    roster = [
        dict(public(e), companyAllocation=all_allocations[k])
        for k, e in state["Employees"].items()
    ]
    return {
        "version": version,
        "config": config,
        "people": roster,
        "preview": overhead_preview(state, config, date.today().isoformat(), "USD"),
    }


@app.put("/api/model")
def model_put(body: ModelEdit, p: Principal = Depends(principal)):
    if not p.finance:
        raise HTTPException(
            403, "Model settings require administrator or finance access"
        )
    from backend.overhead import default_model, validate_model

    state, version = DB.read()
    config = {
        **default_model(state),
        **{k: v for k, v in body.config.items() if k in default_model(state)},
    }
    try:
        validate_model(state, config)
    except (ValueError, TypeError, InvalidOperation) as exc:
        raise HTTPException(422, str(exc))
    DB.save(
        state,
        body.version,
        p.id,
        "configure-model",
        {"config": config},
        setting=("model", config),
    )
    return {"version": body.version + 1}


class BulkAllocations(BaseModel):
    version: int
    employeeIDs: list[str]
    divergentPercent: int


@app.put("/api/model/allocations")
def bulk_allocations(body: BulkAllocations, p: Principal = Depends(principal)):
    require_admin(p)
    state, version = DB.read()
    if body.divergentPercent not in {0, 25, 50, 75, 100} or not body.employeeIDs:
        raise HTTPException(422, "Select contributors and an allowed percentage")
    managers = {e.get("ManagerID") for e in state["Employees"].values()}
    ids = set(body.employeeIDs)
    if any(
        key not in state["Employees"]
        or key in managers
        or state["Employees"][key]["EmploymentStatus"] in {"vacant", "draft"}
        for key in ids
    ):
        raise HTTPException(422, "Only filled individual contributors can be assigned")
    for key in ids:
        state["CompanyAllocations"][key] = dict(
            EmployeeID=key,
            DivergentPercent=str(body.divergentPercent),
            _source="app",
            _editor=p.id,
            _modified=datetime.now(timezone.utc).isoformat(),
        )
    DB.save(
        state,
        body.version,
        p.id,
        "bulk-company-allocations",
        {"employeeIDs": sorted(ids), "divergentPercent": body.divergentPercent},
    )
    return {"version": body.version + 1}


def graph_configured():
    return all(
        os.getenv(k)
        for k in [
            "GRAPH_TENANT_ID",
            "GRAPH_CLIENT_ID",
            "GRAPH_CLIENT_SECRET",
            "GRAPH_DRIVE_ID",
            "GRAPH_ITEM_ID",
        ]
    )


@app.get("/api/integration")
def integration(p: Principal = Depends(principal)):
    require_admin(p)
    return {
        "configured": graph_configured(),
        "authMode": auth.MODE,
        "pollSeconds": max(60, int(os.getenv("GRAPH_POLL_SECONDS", "300"))),
        "source": "Microsoft Graph drive item" if graph_configured() else None,
        "status": DB.get_setting("graphStatus", {}),
        "policy": "Every changed workbook creates an administrator review. Polling never commits imports automatically.",
    }


async def fetch_graph(p):
    import httpx

    if not graph_configured():
        raise HTTPException(
            409,
            "SharePoint is not configured. Set the documented Graph variables securely.",
        )
    try:
        async with httpx.AsyncClient(timeout=40) as client:
            tenant = os.environ["GRAPH_TENANT_ID"]
            token = await client.post(
                f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token",
                data={
                    "client_id": os.environ["GRAPH_CLIENT_ID"],
                    "client_secret": os.environ["GRAPH_CLIENT_SECRET"],
                    "grant_type": "client_credentials",
                    "scope": "https://graph.microsoft.com/.default",
                },
            )
            token.raise_for_status()
            headers = {"Authorization": "Bearer " + token.json()["access_token"]}
            from urllib.parse import quote

            url = (
                "https://graph.microsoft.com/v1.0/drives/"
                + quote(os.environ["GRAPH_DRIVE_ID"], safe="")
                + "/items/"
                + quote(os.environ["GRAPH_ITEM_ID"], safe="")
            )
            metadata = await client.get(url, headers=headers)
            metadata.raise_for_status()
            item = metadata.json()
            previous = DB.get_setting("graphStatus", {})
            if previous.get("etag") == item.get("eTag"):
                valid_preview = False
                with DB.engine.connect() as c:
                    pending = c.execute(
                        select(previews).where(
                            previews.c.id == previous.get("previewId")
                        )
                    ).first()
                if pending:
                    valid_preview = pending.data["baseVersion"] == DB.read()[
                        1
                    ] and datetime.fromisoformat(pending.created) > datetime.now(
                        timezone.utc
                    ) - timedelta(
                        hours=1
                    )
                if previous.get("state") == "applied" or valid_preview:
                    previous["lastChecked"] = datetime.now(timezone.utc).isoformat()
                    DB.set_setting("graphStatus", previous)
                    return previous
            # Graph's preauthenticated download URL is HTTPS and never logged or persisted.
            download = item.get("@microsoft.graph.downloadUrl", "")
            if not download.startswith("https://"):
                raise ValueError("No HTTPS workbook download URL")
            content = bytearray()
            async with client.stream("GET", download) as stream:
                stream.raise_for_status()
                async for chunk in stream.aiter_bytes():
                    content.extend(chunk)
                    if len(content) > MAX_UPLOAD:
                        raise ValueError("Workbook exceeds 10 MB")
            preview = create_preview(
                bytes(content),
                item.get("name", "sharepoint.xlsx"),
                {},
                "incremental",
                p,
            )
            status = {
                "lastSuccessfulRefresh": previous.get("lastSuccessfulRefresh"),
                "lastChecked": datetime.now(timezone.utc).isoformat(),
                "sourceFile": item.get("name"),
                "etag": item.get("eTag"),
                "previewId": preview["id"],
                "errors": preview["errors"],
                "state": "review-required",
            }
            DB.set_setting("graphStatus", status)
            return status
    except HTTPException:
        raise
    except Exception:
        status = {
            **DB.get_setting("graphStatus", {}),
            "lastChecked": datetime.now(timezone.utc).isoformat(),
            "state": "error",
            "error": "Microsoft Graph refresh failed. Verify tenant permissions, drive/item IDs, network access and workbook validity. The active dataset was preserved.",
        }
        DB.set_setting("graphStatus", status)
        raise HTTPException(502, status["error"])


@app.post("/api/integration/refresh")
async def graph_refresh(p: Principal = Depends(principal)):
    require_admin(p)
    return await fetch_graph(p)


@app.get("/api/imports/{ident}/preview")
def get_preview(ident: str, p: Principal = Depends(principal)):
    require_admin(p)
    with DB.engine.connect() as c:
        row = c.execute(select(previews).where(previews.c.id == ident)).first()
    if not row:
        raise HTTPException(404, "Preview expired or not found")
    # An admin explicitly takes ownership of a polling-generated preview for review.
    with DB.engine.begin() as c:
        c.execute(previews.update().where(previews.c.id == ident).values(actor=p.id))
    return {k: v for k, v in row.data.items() if k != "state"}


async def graph_poll():
    while True:
        try:
            await fetch_graph(Principal("graph-poller", "admin"))
        except Exception:
            pass
        await asyncio.sleep(max(60, int(os.getenv("GRAPH_POLL_SECONDS", "300"))))


DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    def frontend(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "API route not found")
        return FileResponse(DIST / "index.html")
