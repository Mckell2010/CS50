import os, json
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import (
    create_engine,
    MetaData,
    Table,
    Column,
    String,
    Integer,
    JSON,
    ForeignKey,
    select,
    update,
    delete,
    insert,
)
from sqlalchemy.pool import StaticPool
from backend.domain import COLUMNS, empty_state

meta = MetaData()
version = Table(
    "schema_state",
    meta,
    Column("id", Integer, primary_key=True),
    Column("version", Integer, nullable=False),
    Column("schema_version", Integer, nullable=False),
)
TABLE_NAMES = {
    "OrganizationalUnits": "org_units",
    "Employees": "employees",
    "Compensation": "compensation",
    "Budgets": "budgets",
    "Objectives": "objectives",
    "KeyResults": "key_results",
}
LINKS = {
    "OrganizationalUnits": {
        "ParentOrgUnitID": "OrganizationalUnits",
        "OwnerEmployeeID": "Employees",
    },
    "Employees": {"ManagerID": "Employees", "OrgUnitID": "OrganizationalUnits"},
    "Compensation": {"EmployeeID": "Employees"},
    "Budgets": {"OrgUnitID": "OrganizationalUnits"},
    "Objectives": {
        "OrgUnitID": "OrganizationalUnits",
        "OwnerEmployeeID": "Employees",
        "ParentObjectiveID": "Objectives",
    },
    "KeyResults": {"ObjectiveID": "Objectives", "OwnerEmployeeID": "Employees"},
}
tables = {}
for sheet in COLUMNS:
    columns = [
        Column("id", String, primary_key=True),
        Column("payload", JSON, nullable=False),
    ]
    for field, target in LINKS.get(sheet, {}).items():
        columns.append(
            Column(
                field,
                String,
                ForeignKey(
                    TABLE_NAMES[target] + ".id", deferrable=True, initially="DEFERRED"
                ),
                index=True,
            )
        )
    tables[sheet] = Table(TABLE_NAMES[sheet], meta, *columns)
audit = Table(
    "audit_events",
    meta,
    Column("id", Integer, primary_key=True),
    Column("at", String, nullable=False),
    Column("actor", String, nullable=False),
    Column("action", String, nullable=False),
    Column("version", Integer, nullable=False),
    Column("details", JSON, nullable=False),
)
imports = Table(
    "import_versions",
    meta,
    Column("id", String, primary_key=True),
    Column("at", String),
    Column("actor", String),
    Column("filename", String),
    Column("digest", String),
    Column("state", JSON),
    Column("summary", JSON),
)
previews = Table(
    "import_previews",
    meta,
    Column("id", String, primary_key=True),
    Column("actor", String),
    Column("created", String),
    Column("data", JSON),
)
settings = Table(
    "app_settings", meta, Column("key", String, primary_key=True), Column("value", JSON)
)


class StaleWrite(Exception):
    pass


class Database:
    def __init__(self, url=None):
        url = url or os.getenv("DATABASE_URL", "sqlite:///data/explorer.db")
        if url.startswith("sqlite:///") and url != "sqlite:///:memory:":
            Path(url[10:]).parent.mkdir(parents=True, exist_ok=True)
        opts = (
            {"connect_args": {"check_same_thread": False, "timeout": 20}}
            if url.startswith("sqlite")
            else {}
        )
        if url == "sqlite:///:memory:":
            opts["poolclass"] = StaticPool
        self.engine = create_engine(url, **opts)
        if url.startswith("sqlite"):
            from sqlalchemy import event

            @event.listens_for(self.engine, "connect")
            def setup(conn, _):
                conn.execute("PRAGMA foreign_keys=ON")
                conn.execute("PRAGMA journal_mode=WAL")

        meta.create_all(self.engine)
        with self.engine.begin() as c:
            if c.execute(select(version)).first() is None:
                c.execute(insert(version).values(id=1, version=0, schema_version=1))

    def read(self):
        with self.engine.connect() as c:
            # Retry if a concurrent writer committed while individual tables were read.
            for _ in range(5):
                v = c.execute(select(version.c.version)).scalar_one()
                state = {
                    s: {r.id: r.payload for r in c.execute(select(t))}
                    for s, t in tables.items()
                }
                if c.execute(select(version.c.version)).scalar_one() == v:
                    return state, v
            raise StaleWrite("Data changed during read; retry")

    def save(
        self,
        state,
        expected,
        actor,
        action,
        details=None,
        import_info=None,
        setting=None,
    ):
        with self.engine.begin() as c:
            if (
                c.execute(
                    update(version)
                    .where(version.c.id == 1, version.c.version == expected)
                    .values(version=expected + 1)
                ).rowcount
                != 1
            ):
                raise StaleWrite("Data changed. Preview or reload again before saving.")
            for t in reversed(list(tables.values())):
                c.execute(delete(t))
            for sheet, t in tables.items():
                rows = [
                    dict(
                        id=k,
                        payload=r,
                        **{f: r.get(f) or None for f in LINKS.get(sheet, {})}
                    )
                    for k, r in state[sheet].items()
                ]
                if rows:
                    c.execute(insert(t), rows)
            c.execute(
                insert(audit).values(
                    at=datetime.now(timezone.utc).isoformat(),
                    actor=actor,
                    action=action,
                    version=expected + 1,
                    details=details or {},
                )
            )
            if import_info:
                c.execute(insert(imports).values(**import_info, state=state))
            if setting:
                c.execute(delete(settings).where(settings.c.key == setting[0]))
                c.execute(insert(settings).values(key=setting[0], value=setting[1]))
        return expected + 1

    def get_setting(self, key, default=None):
        with self.engine.connect() as c:
            row = c.execute(
                select(settings.c.value).where(settings.c.key == key)
            ).first()
            return row[0] if row else default

    def set_setting(self, key, value):
        with self.engine.begin() as c:
            c.execute(delete(settings).where(settings.c.key == key))
            c.execute(insert(settings).values(key=key, value=value))
