# Divergent Organization Explorer

A runnable organization planning application with progressive people and unit charts, Excel import review, payroll/budgets, OKRs, scoped permissions, and audit history. Built with React/TypeScript, React Flow/Dagre, FastAPI, and SQLAlchemy. SQLite is the local default; PostgreSQL is the production adapter.

The bundled 30-person organization is **synthetic**. Lukas Czinger is the example CEO specified in the brief; every other name, relationship, compensation amount, and objective is invented. Demo authentication is visibly labeled. No corporate connection is simulated.

## Demo with your workbook

On Windows, extract the ZIP into a new folder and double-click **demo.cmd**. Python 3.12+ and Node.js 24 must be on PATH. The launcher creates the virtual environment, installs dependencies, builds the app, and asks you to select your org-chart `.xlsx` on first launch. It opens your browser automatically. Keep the terminal open while using the app; Ctrl+C stops it. Start `demo.cmd` again to resume saved edits.

On macOS/Linux, run `./demo.sh --workbook "/path/to/chart.xlsx"`. You can also run `python scripts/run_demo.py --workbook "C:\path\chart.xlsx"` on Windows if the file picker is unavailable.

The private demo uses `data/private-demo.db`; the synthetic demo below uses `data/explorer.db`. The launcher preserves existing databases. Your workbook and database stay on your machine and are not included in the source ZIP. Back up the database before replacing an old app folder.

In **Model settings**, edit reporting lines, titles, departments, employment dates, vacancies and FTE. Explicitly assign contributor splits individually or select filtered contributors for bulk assignment. Managers calculate their team's split from downstream contributor FTE. Use **Organizational units** to edit tiers and parent units.

Choose executive pool members and a separate informational company split, then save the model. Executive costs roll up once at company level, outside department costs. Informational shares use contributor FTE across functions within each company; unassigned functions remain visible. A department breakdown shows the same pool at department level; do not add the two views together. Shares never increase payroll or consolidated totals. Missing allocations, FTE and compensation remain incomplete. The workbook adapter imports no compensation or inferred contributor splits. Full-time FTE defaults to a labeled provisional 1.0; other employment types need an explicit FTE.

The shipped function/group hierarchy contains confirmed structural labels, but no private roster or leader mapping. People and reporting lines come from the selected workbook and can be corrected on the page. Select your executive pool after importing. Ended assignments remain available in Model settings but are excluded from today's chart and totals.

## Run the synthetic sample

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
- **Card colors:** full person-card backgrounds follow organizational unit ancestry. **Color by** offers automatic coloring by expanded chart layers, or a fixed company/function/group/department/team/deeper tier. A legend names the units. Missing tier assignments use the nearest known higher unit with a fallback label; scoped-out ancestry stays neutral. Your color selection persists in this browser. These backgrounds do not change contributor company-allocation bars.
- **Org structure:** create companies, tiers and subtiers, move branches, assign people to units, and set budgets at each level. Department codes and reporting managers remain separate. Delete empty units or remove an empty level while promoting its children; referenced people, budgets and OKRs must be reassigned first.
- **Open roles:** a dedicated tab groups vacancies by manager or department, with search and links into the chart. Dashed cards distinguish vacancies. **Show open roles** toggles chart visibility while retaining filled reports below vacant managers.
- **Employment and compensation:** **Edit person** chooses FTE → exempt/non-exempt, or Contractor. Admin/finance can then **View individual compensation** and edit effective periods. Exempt FTEs use annual salary + bonus; non-exempt FTEs use hourly rate × annual hours (2,080 by default, editable); contractors use monthly rate × 12. Legacy employer costs remain intact.
- **Company allocations:** select an individual contributor in the People chart, then **Set company allocation**. Choose Divergent/Czinger 100/0, 75/25, 50/50, 25/75, or 0/100. Managers automatically show the FTE-weighted composition of all downstream contributors. Missing assignments stay incomplete; manager FTE and payroll are unchanged. Existing workbooks and databases remain supported.
- **Payroll & budgets:** start with separate Tier 0 company payroll budgets, then expand into functions, groups, departments, teams and deeper tiers. Save each parent budget for the selected year/currency before assigning its children. Child envelopes are portions of the parent total; annualized payroll, headroom, missing data and over-allocation remain visible. This is not YTD spend or a hiring forecast.
- **Objectives & KRs:** start with company objectives, then expand the same unit hierarchy. Create each lower-tier objective against an objective in its immediate parent unit, then add its measurable key results. Existing objectives and alignment are retained. Progress stays per metric; unrelated key results are never averaged into a company score.
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
- [Company allocation database upgrade](migrations/002_company_allocations.postgresql.sql)

The local app works without corporate credentials. Entra and Graph adapters require actual tenant configuration and permissions before live validation. A Dockerfile is supplied; no cloud resource, domain, public deployment, or production database is provisioned by this repository.
