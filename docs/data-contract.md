# Workbook, ownership, and metric definitions

Use `examples/divergent-template.xlsx` or download the template in Data & imports. The synthetic example has 30 employees, at least four reporting levels, three department groups, six departments and one nested subdepartment. The sample CEO name comes from the brief; all other data is invented.

Files must be `.xlsx`, at most 10 MB compressed / 60 MB expanded and 20,000 rows per sheet. Employee and organizational unit sheets are required. Compensation, budgets, objectives and key results are optional. The app supports mapping existing header names to canonical columns, while sheet names remain canonical. Use literal values, not formulas. All dates are ISO `YYYY-MM-DD`; date-typed Excel cells are normalized to that format. End dates are inclusive. Numeric cells are accepted; text IDs preserve leading zeros. Format Excel ID cells as Text **before entering IDs**: formatting an already numeric value cannot recover lost zeroes.

IDs are immutable text up to 128 characters with no slashes/control characters. Other text is limited to 4,000 characters. FTE and financial/metric numbers must be finite. Money is nonnegative, at most 1 trillion, with at most two decimal places. Supported currency codes are USD, EUR, GBP, CAD, JPY, AUD, CHF, CNY and INR; no conversion occurs. The example and default use USD. Monetary precision currently uses two decimal places for every supported currency, including JPY; adapt that policy before using currencies with different minor-unit requirements.

## Employees (required)

| Column | Required | Definition / example |
| --- | --- | --- |
| EmployeeID | Yes | Permanent person key, e.g. `001`. Never use a name as key. |
| Name | Yes | Display name; renames retain EmployeeID. |
| JobTitle | Yes | Current role/title. |
| ManagerID | No | EmployeeID of primary manager. Blank for CEO/root; extra roots require review. |
| OrgUnitID | Yes | One primary organizational unit. Independent of the manager's unit. |
| EmploymentStatus | Yes | `active`, `leave`, or `inactive`. Active/leave count within their effective employment dates. |
| FTE | Yes | Number from 0 through 1; headcount and FTE are distinct. |
| StartDate | Yes | Inclusive employment start. |
| EndDate | No | Inclusive last date, or blank if open-ended. |
| Location | No | Display-only location. |
| EmploymentType | No | Display-only label such as `Full time`. |

As-of headcount uses the inclusive StartDate/EndDate interval. An inactive person with a known EndDate still counts on dates within that employment interval; inactive people without EndDate are excluded and produce an import warning because historical employment is unknown. Full-snapshot deactivation sets the last active date to yesterday (or an earlier existing EndDate). This model covers one employment interval per person; rehire spells, historical FTE changes and historically effective reporting/unit assignments are not versioned separately. Imported snapshots retain earlier datasets for review.

## OrganizationalUnits (required)

| Column | Required | Definition |
| --- | --- | --- |
| OrgUnitID | Yes | Permanent unit key. |
| OrgUnitName | Yes | Human-readable label. |
| ParentOrgUnitID | No | Parent unit ID; blank for a top-level company. Unlimited logical depth, cycle checked. |
| UnitType | Yes | `company`, `group`, `department`, `subdepartment`. Type labels do not force a fixed depth. |
| OwnerEmployeeID | No | Accountable employee. Ownership does not grant application access automatically. |

## Compensation (optional)

| Column | Required when sheet used | Definition |
| --- | --- | --- |
| EmployeeID | Yes | Person receiving this compensation. |
| EffectiveFrom | Yes | Inclusive start; together with employee ID identifies a compensation version. |
| EffectiveTo | No | Inclusive end. Blank means no end; overlapping intervals are rejected. |
| Currency | Yes | Currency code. |
| AnnualBasePay | Yes | Employee's actual contracted annual base, already at contracted FTE. |
| AnnualTargetBonus | Yes | Actual annual target bonus at contracted FTE. Explicit `0` means none. |
| AnnualEmployerCosts | Yes | Actual annual employer costs at contracted FTE. Explicit `0` means none. |

Missing compensation is an absent effective row, **not zero**. A partially blank compensation row is invalid. Annualized loaded payroll run rate is `AnnualBasePay + AnnualTargetBonus + AnnualEmployerCosts`, counted once per unique active person using the effective row for the chosen date. **Do not multiply by FTE again.** Mixed currencies are excluded from the selected-currency total and counted as incomplete. UI headroom is provisional when pay is incomplete. The app does not compute YTD actuals, future hiring forecasts, planned vacancies, raises, FX conversions or monthly cash spending.

## Budgets (optional)

| Column | Required | Definition |
| --- | --- | --- |
| BudgetID | Yes | Permanent allocation record key. |
| OrgUnitID | Yes | Unit receiving the envelope. |
| BudgetYear | Yes | Whole calendar year from 2000 to 2200. |
| Currency | Yes | Budget currency. One budget per unit/year/currency. |
| ApprovedEnvelope | Yes | Annual total covering this unit **and all descendants**. |
| DirectAllocation | Yes | Reserved for employees directly assigned to this unit. |

`Unallocated = ApprovedEnvelope − DirectAllocation − SUM(immediate child envelopes)`.
`Unit run-rate headroom = ApprovedEnvelope − inclusive annualized payroll`.
`Direct run-rate headroom = DirectAllocation − directly assigned annualized payroll`.
Only matching year, currency and organizational scope are compared. Parent and child envelopes are never summed into a company budget; the top summary sums non-overlapping root envelopes only. Missing budgets remain distinct from explicit zero; missing child budgets are flagged. Negative unallocated amounts are visibly over-allocated. Import/Finance can represent an over-allocated plan for review; Owner mutations reject allocations exceeding any relevant envelope and require budgeted ancestors. Increasing an owner's assigned envelope requires Administrator/Finance.

## Objectives (optional)

| Column | Required | Definition |
| --- | --- | --- |
| ObjectiveID | Yes | Permanent objective key. |
| OrgUnitID | Yes | Accountable organizational scope. |
| OwnerEmployeeID | Yes | Accountable person. |
| ParentObjectiveID | No | Aligned parent objective; cycles rejected. |
| ObjectiveText | Yes | Outcome statement. |
| PeriodStart / PeriodEnd | Yes | Inclusive objective period, ordered dates. |
| Status | Yes | `on-track`, `at-risk`, `off-track`, `complete`, `not-started`; explicitly owner-reported health. |

## KeyResults (optional)

| Column | Required | Definition |
| --- | --- | --- |
| KeyResultID | Yes | Permanent metric key. |
| ObjectiveID | Yes | Linked objective. |
| OwnerEmployeeID | Yes | Accountable person. |
| MetricName | Yes | Measurable result. |
| Unit | Yes | E.g. `hours`, `partners`, `milestones`. |
| Baseline | No | Starting value. Blank means progress cannot be scored. |
| CurrentValue | No | Most recent observation. |
| TargetValue | No | Desired value. |
| Direction | Yes | `increase` or `decrease`; target must agree with baseline direction. |
| LastUpdated | No | Date observed; missing or older than 30 days is flagged stale. |

When all numbers exist and target differs from baseline, progress is `(CurrentValue − Baseline) / (TargetValue − Baseline) × 100`. This correctly handles decreasing metrics. Numeric progress may exceed 100% or be negative; only the visual bar is clamped. Equal baseline/target and missing values show a reason instead of an invented percentage. There is no objective score based on averaging unrelated percentages. Health and progress remain independent.

## Import policy and provenance

Imports first parse/map the workbook, validate the proposed merged state, and save a preview with a data version. Preview shows additions, updates, reporting changes, unit moves, deactivations, errors and conflicts. Confirmation is a single transaction. A failed validation, stale preview, failed Graph request or failed SQL transaction leaves the previous dataset active. Previews expire after an hour. Identical workbook reimport makes no record changes and creates no duplicate people, budgets or objectives (an explicit import/audit version is still recorded).

Incremental mode keeps omitted rows. Full-snapshot mode soft-deactivates omitted Excel-managed employees only after explicit confirmation; it never hard-deletes historical compensation or planning references. Empty snapshots cannot deactivate the entire company. Multiple employee roots require explicit warning acknowledgement.

Imported employee/compensation records and initial organizational/planning data are Excel-owned. Once edited through a planning form, a unit/budget/objective/KR becomes **app-owned as a whole record**. This conservative ownership rule is explicit: future differing workbook rows are reported as conflicts and skipped, never silently overwritten. The confirmation checkbox acknowledges keeping the current app-owned value. Resolve differences by editing the planning record in the app. There is currently no bulk ownership-transfer UI and no automatic field-by-field conflict merge.

App-created subdepartments always survive reimports and snapshot restoration. Provenance records source, editor, modification timestamp and import version where applicable; audits capture planning before/after values, moves, deactivations and import changes. Restore previews reapply a saved snapshot incrementally, preserving app-owned work that occurred later. A snapshot restore is not a global rollback and does not remove newer unrelated records.
