# Workbook, ownership, and metric definitions

Use `examples/divergent-template.xlsx` or download the template in Data & imports. The synthetic example has 30 employees, at least four reporting levels, three department groups, six departments and one nested subdepartment. The sample CEO name comes from the brief; all other data is invented.

Files must be `.xlsx`, at most 10 MB compressed / 60 MB expanded and 20,000 rows per sheet. Employee and organizational unit sheets are required. Company allocations, compensation, budgets, objectives and key results are optional. The app supports mapping existing header names to canonical columns, while sheet names remain canonical. Use literal values, not formulas. All dates are ISO `YYYY-MM-DD`; date-typed Excel cells are normalized to that format. End dates are inclusive. Numeric cells are accepted; text IDs preserve leading zeros. Format Excel ID cells as Text **before entering IDs**: formatting an already numeric value cannot recover lost zeroes.

IDs are immutable text up to 128 characters with no slashes/control characters. Other text is limited to 4,000 characters. FTE and financial/metric numbers must be finite. Money is nonnegative, at most 1 trillion, with at most two decimal places. Supported currency codes are USD, EUR, GBP, CAD, JPY, AUD, CHF, CNY and INR; no conversion occurs. The example and default use USD. Monetary precision currently uses two decimal places for every supported currency, including JPY; adapt that policy before using currencies with different minor-unit requirements.

## Employees (required)

| Column | Required | Definition / example |
| --- | --- | --- |
| EmployeeID | Yes | Permanent person key, e.g. `001`. Never use a name as key. |
| Name | Yes | Display name; renames retain EmployeeID. |
| JobTitle | Yes | Current role/title. |
| ManagerID | No | EmployeeID of primary manager. Blank for CEO/root; extra roots require review. |
| OrgUnitID | Yes | One primary organizational unit. Independent of the manager's unit. |
| EmploymentStatus | Yes | `active`, `leave`, `inactive`, `vacant`, or `draft`. Vacant/draft positions never count as employees. Active/leave count within their effective employment dates. |
| FTE | Header required; value optional | Number from 0 through 1. Blank stays unknown and prevents complete FTE-weighted allocation calculations; headcount remains distinct. |
| StartDate | Filled positions | Inclusive employment start. Vacant/draft positions may leave it blank. |
| EndDate | No | Inclusive last date, or blank if open-ended. |
| Location | No | Editor choices: `Los Angeles - HQ`, `Los Angeles - LB`, `Washington DC`, `Remote`. Blank means not supplied. Imported legacy labels remain unchanged until replaced; new or changed editor/API values must use this list. |
| EmploymentType | No | Employment label such as `Full time`; contractor/consultant/vendor/agency/temp labels participate in the contractor toggle. |

As-of headcount uses the inclusive StartDate/EndDate interval. An inactive person with a known EndDate still counts on dates within that employment interval; inactive people without EndDate are excluded and produce an import warning because historical employment is unknown. Full-snapshot deactivation sets the last active date to yesterday (or an earlier existing EndDate). This model covers one employment interval per person; rehire spells, historical FTE changes and historically effective reporting/unit assignments are not versioned separately. Imported snapshots retain earlier datasets for review.

## OrganizationalUnits (required)

| Column | Required | Definition |
| --- | --- | --- |
| OrgUnitID | Yes | Permanent unit key. |
| OrgUnitName | Yes | Human-readable label. |
| ParentOrgUnitID | No | Parent unit ID; blank for a top-level company. Unlimited logical depth, cycle checked. |
| UnitType | Yes | `company`, `function`, `group`, `department`, `team`, `subteam`, or legacy `subdepartment`. |
| Tier | No | Explicit classification: 0 company, 1 function, 2 group, 3 department, 4 team, 5+ subteam. Whole nonnegative number, deeper than an explicitly classified parent. Blank preserves unclassified legacy units; tree depth is not automatically reclassified. |
| DepartmentCode | No | Text code such as `08`; duplicates across companies are allowed. OrgUnitID remains the unique key. |
| OwnerEmployeeID | No | Accountable employee. Ownership does not grant application access automatically. |

## CompanyAllocations (optional)

| Column | Required when sheet used | Definition |
| --- | --- | --- |
| EmployeeID | Yes | Individual contributor's permanent EmployeeID. One assignment per person. |
| DivergentPercent | Yes | Exactly `0`, `25`, `50`, `75`, or `100`. Czinger receives `100 − DivergentPercent`. |

Individual contributors explicitly select an allocation; it never defaults from their company, department, or manager. Missing assignments remain visibly **not set**. The sheet is optional so existing databases, old workbooks, and old import snapshots remain usable without invented allocations. An allocation saved in the app becomes app-owned independently of the employee record; later Excel employee updates still apply, while conflicting assignment rows are reported and preserved.

Managers' displayed splits describe **team composition only**. For every manager, find all downstream individual contributors through the full reporting tree, count each once, and weight by contracted FTE. `Divergent share = SUM(IC FTE × IC DivergentPercent) / SUM(IC FTE)`. Intermediate managers and the selected manager's own FTE/payroll are excluded. Payroll, budgets, and total headcount are unchanged. Do not average intermediate managers' percentages: their teams can differ in size. Displayed manager percentages are rounded to two decimals and are not constrained to the five contributor presets.

Manager vs contributor classification uses the full stored reporting structure, not a chart's collapsed branches or the viewer's visible scope. A person with stored direct reports remains a manager even if those reports are inactive. Only contributors active on the selected date enter the calculation. Managers with no active contributors or zero contributor FTE have no calculated percentage. Any missing contributor allocation makes the result incomplete rather than silently redistributing the known assignments. Even zero-FTE contributors must receive explicit assignments before their team is marked complete.

Manager assignments cannot be entered in the editor or newly assigned in an import. If a contributor gains direct reports, their prior explicit assignment is retained but ignored, and the import preview warns about it. Export/reimport preserves these dormant records. If they later become a contributor again, their saved explicit assignment applies again. Current reporting relationships, current FTE, and current allocations apply to every selected date; these fields do not have effective-dated histories.

Owners can edit contributors in their assigned organizational scope. Manager composition spanning any active contributor outside that scope is marked restricted, without leaking outside counts or recomputing a misleading partial split. Viewers can read permitted allocations but cannot change them. The same version checks, import confirmation, and audit trail used for other planning records apply.

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

### Executive costs roll upward only

Executive and executive-support people belong to the executive/function unit's direct cost pool, outside its descendant departments. Their actual compensation is included once in that pool and in each relevant ancestor's inclusive total; it is excluded from individual department totals. Parent totals are inclusive and must not be added again to their own child totals. Do not change direct department costs by distributing executive charges downward. An informational overhead view is approved as a separate analysis; recipient scope, company attribution, and weights must be supplied before shares can be calculated, and those shares must never be added a second time to consolidated totals. Manager company percentages continue to describe team composition only and do not allocate the executive's own payroll. The confirmed roster and organizational-unit assignments are required before applying this treatment to actual people; missing pay is never invented.

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

## Org-chart export adapter and interactive model

Single-sheet chart exports with `Unique ID`, `Employee`, `Manager Unique ID`, `Department`, and `PID Status` are detected automatically. Company container rows are removed and their reports reconnect to the real person above them. Stable employee IDs are preserved, including legacy DII IDs; DII department labels fold into unsuffixed Divergent departments. CZV labels remain separate. `PID Status=Open` creates a vacancy. Source downstream headcount columns are not used as person counts. Missing start dates create draft positions. Vacant/draft positions do not require a start date.

The export has no contracted FTE or compensation. Full Time receives provisional FTE 1 with a visible `FTEBasis`; other filled employment types retain unknown FTE. `SourceCompany` stores the original company category for filtering and is not an explicit contributor allocation. Contacts, emails and phone numbers are not imported. No salaries or contributor percentages are inferred. Administrators can correct every person's public fields, reporting line, unit, FTE and dates in Model settings; edited records become app-owned and survive conflicting reimports.

Model settings are persisted separately with version checks and audit records. Administrator/finance access is required. Managers always use downstream contributor FTE; the optional contributor-count scenario affects informational overhead weights only. Contractor participation is tunable. Bulk explicit contributor assignments require administrator access and reject managers, vacancies, drafts and stale versions atomically.

Executive pool members roll up once into company-level direct costs and remain in company consolidated payroll; their costs are excluded from operating units. The separate informational allocation uses an explicitly supplied company percentage, or an explicitly selected leader-team estimate. It never changes the manager's personal payroll allocation. Each company pool is shared across its functions by allocated contributor FTE by default. Cross-company contributors without a corresponding function mapping remain in an Unmapped function bucket. Missing allocation/FTE prevents complete shares, and missing executive compensation prevents dollar amounts. Display cents reconcile within each company when weights are complete. The department breakdown is an alternative view of the same pool, also weighted by allocated contributor FTE; function and department amounts must not be added together. There is no downward posting or addition to consolidated totals.

Source charts, private databases, screenshots and private discovery files are excluded from source control. The generic hierarchy shipped with the app includes function/group/department labels only; users configure leadership and pool membership from their own workbook.

## Tiered planning workflow

Payroll budgets start at each Tier 0 company, then follow the stored unit hierarchy through functions, groups, departments and teams. Every planning API budget save requires an existing envelope at each ancestor for the same year and currency. Explicit zero is a set budget. Child envelopes are portions of the company total, not additional costs. Finance retains over-allocation visibility and owners retain their existing envelope limits. Imports preserve history without requiring row-by-row creation order.

A new objective in a non-company unit must link to an objective in its immediate parent unit; company objectives have no parent. Changing the unit or parent link validates that relationship again. Editing existing wording, owners, dates or status preserves legacy alignment. Key results remain attached to their objectives with independent measures; unrelated progress is not averaged. Scope restrictions still apply.

## Chart background colors

Card backgrounds resolve the person's primary OrgUnitID upward through unit parents at the chosen tier, independently of ManagerID and company allocation percentages. Colors derive from stable unit IDs, so labels, filters and expansion do not reassign them. Missing tiers use the nearest known higher unit with a fallback label; unavailable ancestry stays neutral. These are generated visual categories, not imported brand colors.

Auto follows expanded reporting layers while retaining a focused branch's depth, then resolves colors against actual unit ancestry. It does not create or reassign units. Unit charts instead use their deepest visible unit tier. A saved dropdown choice can hold a tier fixed. The legend names the categories; company-allocation bars remain independent. Only already authorized units are used.
