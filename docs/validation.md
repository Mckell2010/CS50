# Validation record

Validated locally on October 10, 2026. The corporate tenant and workbook are not configured, so no real-company sign-in or Graph access is claimed.

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
