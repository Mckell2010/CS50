-- Schema v1. Apply once to a new PostgreSQL database. See backend/migrate.py.
BEGIN;

CREATE TABLE schema_state (
	id SERIAL NOT NULL,
	version INTEGER NOT NULL,
	schema_version INTEGER NOT NULL,
	PRIMARY KEY (id)
)

;

CREATE TABLE org_units (
	id VARCHAR NOT NULL,
	payload JSON NOT NULL,
	"ParentOrgUnitID" VARCHAR,
	"OwnerEmployeeID" VARCHAR,
	PRIMARY KEY (id)
)

;

CREATE TABLE employees (
	id VARCHAR NOT NULL,
	payload JSON NOT NULL,
	"ManagerID" VARCHAR,
	"OrgUnitID" VARCHAR,
	PRIMARY KEY (id)
)

;

CREATE TABLE compensation (
	id VARCHAR NOT NULL,
	payload JSON NOT NULL,
	"EmployeeID" VARCHAR,
	PRIMARY KEY (id)
)

;

CREATE TABLE budgets (
	id VARCHAR NOT NULL,
	payload JSON NOT NULL,
	"OrgUnitID" VARCHAR,
	PRIMARY KEY (id)
)

;

CREATE TABLE objectives (
	id VARCHAR NOT NULL,
	payload JSON NOT NULL,
	"OrgUnitID" VARCHAR,
	"OwnerEmployeeID" VARCHAR,
	"ParentObjectiveID" VARCHAR,
	PRIMARY KEY (id)
)

;

CREATE TABLE key_results (
	id VARCHAR NOT NULL,
	payload JSON NOT NULL,
	"ObjectiveID" VARCHAR,
	"OwnerEmployeeID" VARCHAR,
	PRIMARY KEY (id)
)

;

CREATE TABLE audit_events (
	id SERIAL NOT NULL,
	at VARCHAR NOT NULL,
	actor VARCHAR NOT NULL,
	action VARCHAR NOT NULL,
	version INTEGER NOT NULL,
	details JSON NOT NULL,
	PRIMARY KEY (id)
)

;

CREATE TABLE import_versions (
	id VARCHAR NOT NULL,
	at VARCHAR,
	actor VARCHAR,
	filename VARCHAR,
	digest VARCHAR,
	state JSON,
	summary JSON,
	PRIMARY KEY (id)
)

;

CREATE TABLE import_previews (
	id VARCHAR NOT NULL,
	actor VARCHAR,
	created VARCHAR,
	data JSON,
	PRIMARY KEY (id)
)

;

CREATE TABLE app_settings (
	key VARCHAR NOT NULL,
	value JSON,
	PRIMARY KEY (key)
)

;
ALTER TABLE org_units ADD FOREIGN KEY("ParentOrgUnitID") REFERENCES org_units (id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE org_units ADD FOREIGN KEY("OwnerEmployeeID") REFERENCES employees (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX "ix_org_units_OwnerEmployeeID" ON org_units ("OwnerEmployeeID");
CREATE INDEX "ix_org_units_ParentOrgUnitID" ON org_units ("ParentOrgUnitID");
ALTER TABLE employees ADD FOREIGN KEY("OrgUnitID") REFERENCES org_units (id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE employees ADD FOREIGN KEY("ManagerID") REFERENCES employees (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX "ix_employees_OrgUnitID" ON employees ("OrgUnitID");
CREATE INDEX "ix_employees_ManagerID" ON employees ("ManagerID");
ALTER TABLE compensation ADD FOREIGN KEY("EmployeeID") REFERENCES employees (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX "ix_compensation_EmployeeID" ON compensation ("EmployeeID");
ALTER TABLE budgets ADD FOREIGN KEY("OrgUnitID") REFERENCES org_units (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX "ix_budgets_OrgUnitID" ON budgets ("OrgUnitID");
ALTER TABLE objectives ADD FOREIGN KEY("ParentObjectiveID") REFERENCES objectives (id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE objectives ADD FOREIGN KEY("OrgUnitID") REFERENCES org_units (id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE objectives ADD FOREIGN KEY("OwnerEmployeeID") REFERENCES employees (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX "ix_objectives_ParentObjectiveID" ON objectives ("ParentObjectiveID");
CREATE INDEX "ix_objectives_OrgUnitID" ON objectives ("OrgUnitID");
CREATE INDEX "ix_objectives_OwnerEmployeeID" ON objectives ("OwnerEmployeeID");
ALTER TABLE key_results ADD FOREIGN KEY("OwnerEmployeeID") REFERENCES employees (id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE key_results ADD FOREIGN KEY("ObjectiveID") REFERENCES objectives (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX "ix_key_results_ObjectiveID" ON key_results ("ObjectiveID");
CREATE INDEX "ix_key_results_OwnerEmployeeID" ON key_results ("OwnerEmployeeID");
INSERT INTO schema_state (id, version, schema_version) VALUES (1, 0, 1);
COMMIT;
