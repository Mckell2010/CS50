-- Upgrade v1 to v2. Retains the roster, compensation, planning, and import history.
BEGIN;
CREATE TABLE IF NOT EXISTS company_allocations (
    id VARCHAR PRIMARY KEY,
    payload JSON NOT NULL,
    "EmployeeID" VARCHAR REFERENCES employees(id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS "ix_company_allocations_EmployeeID" ON company_allocations ("EmployeeID");
UPDATE schema_state SET schema_version = 2 WHERE schema_version = 1;
COMMIT;
