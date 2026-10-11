# Validation record

Validated locally on October 10, 2026. Corporate sign-in and Graph access are not configured; no live tenant validation is claimed. Workbook demo validation is recorded below.

## Automated application checks

44 API/domain tests passed. Coverage includes:

- 30-person synthetic workbook contract, leading-zero IDs and optional sheets.
- Exact headcount, 29.8 FTE, loaded payroll, missing compensation and currency separation.
- Independent reporting and organizational populations.
- Parent/child envelopes, direct allocations, headroom and double-counting avoidance.
- Atomic imports, duplicates, invalid dates/FTE/pay/currencies, self/cyclic hierarchies, overlapping compensation, formulas, header mapping and duplicate budgets.
- Idempotent reimport, stable-ID moves, incremental preservation and explicitly confirmed full-snapshot deactivation.
- Historical headcount using employment end dates after snapshot deactivation.
- Conflict acknowledgement, preservation of app-owned units/budgets/objectives/KRs, and restore without erasing later planning.
- Stale-preview and stale-edit rejection, persisted SQL state after reopening, and audit changes.
- Viewer restrictions, owner scope enforcement, forbidden direct compensation/export requests, small-cohort suppression, historical-filter restrictions, and unbudgeted-ancestor allocation rejection.
- Company objective alignment is visible to owners but read-only.
- Increasing/decreasing KR progress, missing/equal targets and stale values.
- Production refusal of development auth and rejected cross-origin writes.
- RS256 token verification with a generated key: assigned identity, issuer/audience, delegated API scope and endpoint permissions. No live Entra tenant was used.
- Mocked Graph OAuth, metadata/download, pending review, successful commit status, stale-preview regeneration and last-valid-dataset preservation on failures.

There is one third-party Starlette test-transport deprecation warning in the test runner; all intended tests execute. TypeScript checking and the Vite production build pass. The production npm dependency audit reports zero known vulnerabilities at validation time. Vite reports a roughly 522 kB main JavaScript chunk (about 164 kB gzip); that is a bundle-size advisory, not a failed build.

## Browser acceptance

Chromium passed 14 groups of checks against an isolated database:

1. Starts with only the CEO.
2. CEO selection reveals exactly the three direct reports.
3. Expanding another branch preserves existing expansion.
4. Collapse does not change totals; search reveals hidden ancestors and selects the person.
5. Focus and clear focus work.
6. Organizational unit hierarchy expands independently.
7. All 11 unit budgets display.
8. Objective edits survive browser reload.
9. Workbook preview and commit preserve a conflicting app-owned objective.
10. Missing currency budgets display as unknown, not zero.
11. Engineering owner scope, fixed USD filters, and forbidden individual-pay/export requests.
12. Viewer has no budget/import controls.
13. At 390 px width, no document horizontal overflow; dialog focus trapping and Escape work.
14. No browser runtime errors.

Screenshots and JSON evidence are generated in `artifacts/` by the scripts. These files are local test outputs, not committed customer data.

## 1,000-person measurements

Measured in local headless Chromium at a 1440 × 1100 viewport with a synthetic database; timings are observations, not service-level guarantees:

| Operation | Observed |
| --- | --- |
| Full authorized organization API | 0.329 s; 402,830 bytes |
| Initial browser chart | 1.292 s; 1 graph node mounted |
| Expand CEO | 0.115 s |
| Search/select hidden person 1000 | 0.320 s |
| After search | 171 logically expanded nodes; only 2 viewport nodes mounted |

The full authorized dataset supplies totals while only visible graph portions are rendered. Very wide layers can require pan/zoom or Focus; Fit to View can reduce card text size. Arbitrary deep/wide hierarchies and 20,000-row imports are bounded by validation limits but have not been benchmarked. Full-state transactional writes and JSON snapshots are appropriate for this tested scale; larger organizations need profiling, retention management and potentially incremental persistence.

## Database and deployment checks

PostgreSQL 17 was run locally in an isolated container. Schema initialization, sample seeding, actual workbook preview/commit, database reopen persistence, stale-write rejection and forbidden owner compensation access passed. This verifies the PostgreSQL adapter against a local instance; managed-service TLS, network and account configuration still require validation in the selected host.

The standalone PostgreSQL SQL migration also passed against a separate empty database, followed by a real 30-person transactional save.

The Docker image built successfully and ran as its non-root application user. Its health endpoint, full 30-person API response and served frontend passed. The default production image refused startup without Entra configuration, as intended. This cloud network required its supplied CA bundle as a temporary BuildKit secret; TLS verification remained enabled and the CA was not baked into the image.

The online SQLite backup script created a new backup, and reopening it produced records and data version identical to the active database. Re-running the documented setup script succeeded without resetting existing data. Managed-cloud deployment and actual corporate credentials remain unconfigured.


## Company allocation and tier update (October 10, 2026)

- Full backend suite: **74 passed**. The 22 new allocation tests cover FTE weighting across unequal nested branches, unique contributor counts, ignored manager FTE, missing assignments, zero FTE, active dates, 2,000 reporting levels, scoped access, five allowed presets, rejected manager edits, atomic/stale writes, import ownership, promotion, and v1 SQLite upgrade without changing the existing records or data version.
- Production frontend build passed. The existing Vite chunk-size advisory remains.
- All 15 browser check groups passed. A saved 75/25 contributor assignment survived reload; managers transitioned from incomplete to calculated 75/25 after all contributors were assigned, offered no manual editor, and left headcount/FTE/payroll totals unchanged. Existing import, planning, roles, chart navigation, and narrow-screen checks also passed without runtime errors.
- PostgreSQL 17: migrations 001 and 002 applied in order to an isolated database; v2 assignment persistence and the 75/25 CEO rollup passed. The temporary test container was removed.
- Current 1,000-person API regression: 0.348 seconds and 587,929 response bytes with allocation summaries. Earlier browser performance measurements above describe the previous version.
- Structure discovery: nine Tier 1 functions recorded; the three DII departments were removed at the user's request, leaving 33 Divergent and 16 Czinger departments. Department-to-function/group assignments and leadership reporting details are still being collected. The actual structure has not replaced the synthetic demo roster.
- The supplied Divergent website URL returned HTTP 403 in this environment. The current monochrome styling is a draft and has not been compared against the live site.

## Editable workbook demo (October 10, 2026)

- **84 backend tests passed** and TypeScript/Vite production build passed. The existing bundle-size advisory remains (approximately 539 kB main JavaScript before gzip).
- Added chart-export parsing, container removal, vacancy/draft handling, preserved stable IDs, missing FTE/pay, employee edit authorization, cycle validation, atomic bulk contributor assignments, persisted model settings, contractor participation, ended-person editing, executive cost separation, and cent reconciliation across company/function/department views.
- All **16 browser acceptance groups passed**, including FTE edits, persisted model settings, draft creation without increasing headcount, and the department overhead view.
- The private supplied chart loaded successfully into a separate database. Browser checks covered reporting-tree focus, searching an ended contractor, editing unknown FTE, overhead controls and a 390 px layout without overflow or runtime errors. Private screenshots and source data remain ignored.
- The generic release adapter was independently run without private discovery files. It imports the selected workbook and seeds structural labels; executive pool membership and leader corrections are configured by the user.
- The launcher installed dependencies, built the frontend, started the private database and passed its HTTP readiness check on Linux. The Windows wrapper is included but has not been executed on Windows.
- Corporate authentication, a public deployment and exact visual matching to the blocked website remain outside these local checks.

## Tiered budgets and OKRs (October 10, 2026)

- **90 backend tests passed**, including parent-first budget creation across five lower tiers, matching budget year/currency, rejected skipped ancestors, immediate-parent objective alignment, and preserved authorization/legacy edits.
- TypeScript and the production build passed; the existing chunk-size advisory remains.
- **17 browser acceptance groups passed**. Verified Tier 0 entry, progressive expansion, child-budget actions unlocking after parent save, persisted allocations, parent-objective defaults and links, existing import and role behavior, and both planning pages at 390 px without horizontal overflow.
- Read-only checks against the private workbook confirmed separate Tier 0 company budget cards and OKR sections for both companies. No private budgets or objectives were created during those checks.

## Monochrome visual direction (October 10, 2026)

- Replaced decorative green styling with neutral surfaces, black navigation and page headers, uppercase page titles, square controls, technical labels, and consistent chart/planning colors. Status and error colors remain semantic. The theme uses system fonts and requires no external asset requests.
- **90 backend tests**, TypeScript checking, the production build, and all **17 browser acceptance groups** passed. The existing JavaScript chunk-size advisory remains.
- Additional browser checks covered payroll budgets, OKRs and model settings at widths 390, 700, 820, 1100, 1440 and 1920 px, with no document overflow or runtime errors. Private visual review screenshots remain ignored.
- `https://www.divergent.us/#news` could not be read: this environment's network proxy rejected the HTTPS connection with HTTP 403. This is an industrial monochrome design direction, not a verified reproduction of the live website. A screenshot or accessible brand reference is still needed for exact matching.

## Hierarchical card backgrounds (October 10, 2026)

- **90 backend tests and 6 hierarchy-color tests passed**, with TypeScript checking and a successful production build. Color tests cover ancestry, company/department/team grouping, fallback labeling, scoped-out ancestors, stable colors, automatic expanded layers, focused branches, legacy types and deeper tiers.
- All **18 browser acceptance groups passed**. The added flow confirms full backgrounds, same-unit grouping, different category colors, automatic tier selection and persistence after reload. Existing chart, allocation, planning, import and permission checks still pass.
- Read-only private-workbook checks verified department coloring and the selector at five viewport widths from 390 to 1440 px without document overflow. Private screenshots remain ignored.

## Location choices (October 10, 2026)

- **92 backend tests and 6 hierarchy-color tests passed**, plus TypeScript checking and the production build.
- All **18 browser acceptance groups passed**, including verification of exactly four nonblank location choices and a saved Washington DC selection.
- New or changed person-editor/API locations accept Los Angeles - HQ, Los Angeles - LB, Washington DC or Remote. Blank remains unknown; existing imported labels are retained until explicitly replaced. The synthetic sample now uses an allowed location.
- Restored the workbook contract reference after finding it had been inadvertently replaced by README content in an earlier change, retaining the current tiered-planning and card-color rules.

## Employment, open roles, and organization structure update

Validated October 10, 2026: 123 API/domain tests and 9 TypeScript helper tests passed; TypeScript checking and the Vite production build passed. Chromium passed 21 workflow groups with no runtime errors. The updated checks cover:

- Salary + bonus, hourly × editable annual hours, and monthly × 12, with exact annual payroll and no extra FTE multiplier. Hourly entry defaults to 2,080 hours. Missing imported hours remain incomplete.
- Employment classification, conditional pay fields, bad amounts/hours, overlapping periods, historical basis preservation, retained legacy employer costs, permission checks, stale-write rejection, and import/export preservation.
- Vacancy grouping/search by manager and department, distinct cards, chart hide/show, and preservation of filled descendants and saved manager links.
- Company/tier/subtier creation, branch moves, department code preservation, changed unit payroll rollups with unchanged company totals/reporting lines, child promotion on empty-level deletion, rejection of occupied/budgeted units, stale deletion, audit history and deletion preservation on reimport.
- Desktop and 390 px mobile structure layouts; previous allocations, budgets, OKRs, imports and permissions remain covered.

Browser checks use only an isolated synthetic database. Screenshots and logs remain in ignored artifacts. Existing Starlette deprecation and Vite bundle-size advisories remain nonblocking.

## Banner update

The organization headline is “Build the new industrial Age”. Banner headcount now reconciles FTE, contractor and unclassified people using the selected date and authorized scope, with vacancies/drafts excluded. “1 team” accompanies live unit counts. Validation: 126 backend tests, 9 TypeScript helper tests, the production build, and 21 browser workflow groups passed. Desktop and mobile layouts were checked; branch collapse leaves the banner counts unchanged.

## Windows module-resolution fix

Reproduced the screenshot's missing default export, filename-casing conflict and implicit-any callback errors using a TypeScript compiler host with case-insensitive lookup for project source files. `./OpenRoles` incorrectly resolved to the `openRoles.ts` helper before the `OpenRoles.tsx` component on Windows. Renamed the helper to `orgRoleHelpers.ts` and updated all imports. The case-insensitive resolution check now passes and runs in `scripts/check.sh`; 126 backend tests, 9 helper tests and the normal production build also pass. A Windows frontend build job was added to CI; no native Windows execution is claimed from this Linux workspace. Updated ZIP instructions use a fresh folder and copy only the existing data folder, avoiding stale renamed source files.

## Parent-percentage budgets

Validated with 138 backend tests, 9 helper tests, the case-insensitive TypeScript check and the production build. Chromium passed 22 workflow groups, including live percentage previews, company-dollar changes cascading to children, department percentage changes cascading to teams, and persisted percentage fields. Existing payroll, permission and workbook tests remain covered. New cases verify immediate-parent calculations, atomic legacy conversion, missing/zero parents, invalid percentages, owner approval protection, over-allocation visibility, export/import round trips, and cent reconciliation. Mobile budget navigation remains horizontally scrollable within its table without document overflow.
