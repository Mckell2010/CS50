# Divergent Organization Explorer

A runnable organization planning application with progressive people and unit charts, Excel import review, payroll/budgets, OKRs, scoped permissions, and audit history. Built with React/TypeScript, React Flow/Dagre, FastAPI, and SQLAlchemy. SQLite is the local default; PostgreSQL is the production adapter.

The bundled 30-person organization is **synthetic**. Lukas Czinger is the example CEO specified in the brief; every other name, relationship, compensation amount, and objective is invented. Demo authentication is visibly labeled. No corporate connection is simulated.

## Run

Requires Python 3.12+ and Node 24. From the repository root:

```bash
./scripts/setup.sh
./scripts/start.sh
```

The server listens on port 8000 and serves the built frontend and API. The local development database is `data/explorer.db`. The first development startup seeds the sample only when the database version is zero. Restarts never reset existing data. `GET /api/health` confirms database readiness. Use the **DEMO ROLE** selector to explore Administrator, Executive/Finance, Engineering Owner, and Viewer permissions.

For frontend development, run the API with `.venv/bin/python -m uvicorn backend.app:app --reload --port 8000` and `npm run dev` in another terminal. Vite proxies `/api` to the backend.

The scripts read exported environment variables. `.env.example` documents configuration; it is **not automatically loaded**. Export your own trusted configuration or provide it through your host's secret manager. No keys are needed for the local demo.

## Workflows

- **People:** starts with the CEO only. Selecting a card reveals one layer and its details; the small chevron explicitly collapses a branch. Search reveals ancestors. Expand Next Layer, Collapse All, Focus, Fit, zoom, and pan work independently of aggregate calculations. Expansion/selection/overlay state is retained in the browser where records remain available.
- **Organizational units:** a separate hierarchy, with owned units and directly/inclusively assigned people. Unit budgets never use a reporting-subtree population.
- **Payroll & budgets:** effective-dated annualized payroll run rate, loaded costs, missing data, direct allocations, child envelopes, headroom, and over-allocation. This is not YTD spend or a hiring forecast.
- **Objectives & KRs:** create/edit linked objectives, accountable owners, periods, explicit health, and increasing/decreasing key results. Progress is calculated per metric; unrelated metrics are never averaged into a company score.
- **Data & imports:** download an empty template or synthetic workbook; upload `.xlsx`, map columns, inspect changes/errors/conflicts, and confirm. Incremental imports preserve omitted rows. Full snapshots require explicit confirmation for missing-employee deactivations. Import history supports a new preview of an old snapshot while retaining app-owned plans.
- **Activity history:** administrators and finance can inspect audited before/after planning edits and import changes.
- **Workspace settings:** choose the root by permanent employee ID. Additional reporting roots remain visible and must be acknowledged during import.

## Verify

```bash
./scripts/check.sh
# Optional browser suite (Playwright Python package + Chromium required):
python3 scripts/browser_check.py
python3 scripts/performance_check.py
```

The browser suite creates its own temporary database and server on port 8011, checks real navigation/mutations/imports/role restrictions, and writes screenshots/results into ignored `artifacts/`. It does not modify the main demo. The performance suite similarly uses an isolated 1,000-person dataset on port 8012. `CHROMIUM_PATH` can override the Chromium executable.

See [validation results](docs/validation.md) for observed checks and practical limits. Dependency versions are pinned in `requirements.lock` and `package-lock.json`.

## Handoff

- [Requirements and scope](docs/requirements.md)
- [Workbook field definitions, ownership, and calculations](docs/data-contract.md)
- [Architecture and permission policy](docs/architecture.md)
- [Production deployment, Entra, Graph, backup, and restore](docs/deployment.md)
- [Empty Excel template](examples/divergent-template.xlsx)
- [Synthetic sample workbook](examples/divergent-synthetic-sample.xlsx)
- [Initial PostgreSQL migration](migrations/001_initial.postgresql.sql)

The local app works without corporate credentials. Entra and Graph adapters require actual tenant configuration and permissions before live validation. A Dockerfile is supplied; no cloud resource, domain, public deployment, or production database is provisioned by this repository.
