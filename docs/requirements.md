# Codex build prompt: Divergent Organization Explorer

Build a working internal web application called **Divergent Organization Explorer**. Use the requirements below as the complete project brief. Implement the application, run it, verify the important workflows, and provide the resulting preview or deployment instructions. Make reasonable implementation decisions and document them; ask questions only when a missing answer materially blocks progress.

## Product goal

I want to maintain organizational information in Excel and explore it through a clean, interactive dashboard. Take functional inspiration from Insperity OrgPlus, with an original, much cleaner interface and integrated organizational planning.

The main interaction is progressive expansion. Start with the CEO, Lukas Czinger. Clicking his card reveals his direct reports. Clicking a direct report reveals that person's direct reports. Continue independently down any branch, one layer at a time. I also need company OKRs and payroll budgets broken down by collections of departments, individual departments, and owner-defined subdepartments.

The application should eventually let a department owner manage their own structure, budget allocations, and objectives within a controlled scope. Core chart rendering, imports, and calculations should use ordinary application code and should not require a language-model API.

## Starting assumptions and execution

- If an Excel file is attached, inspect its sheets and columns before choosing the import mapping. Accommodate existing column names through a mapping interface.
- If no workbook is attached, generate a documented Excel template and a clearly labeled synthetic example containing approximately 30 employees across at least four reporting levels, three department groups, several departments, and subdepartments. Use Lukas Czinger as the example CEO; mark all other invented names, relationships, compensation, and objectives as sample data. Do not infer real company data.
- Default the first release to USD and calendar-year annual payroll budgets. Store effective dates and currency explicitly. Document these defaults so they can be extended later.
- Build in successive working milestones, preserving a runnable application after each one. Continue through everything that can be implemented and tested with the available environment.
- Missing corporate credentials should not block a working demo. Provide clearly labeled development authentication and integration setup instructions; never present simulated authentication or a placeholder connection as a working production integration.
- Record the requirements, architecture, data definitions, and run commands in the repository. Add concise, relevant project guidance in AGENTS.md and use version control when available. Keep sample data separate from production configuration.

## Architecture and hosting

Use React and TypeScript for the interface, React Flow for the interactive chart, and an appropriate layout engine such as Dagre or ELK. Build our own expansion behavior using supported library APIs and respect dependency licenses. Use a maintained Excel parser, a server-side validation layer, and a relational data model.

Choose one implementation path based on the environment:

- **ChatGPT Sites:** Use the platform-supported application starter, server runtime, authentication, and durable storage. Keep the prototype private. Follow the available Sites workflow and do not force an incompatible server or database stack into that environment.
- **Company-hosted application:** Use a straightforward React/TypeScript frontend, a supported backend, and a managed relational database. Azure App Service with Microsoft Entra company sign-in is the preferred deployment candidate if Divergent already uses Azure. Otherwise provide a portable deployment suitable for the company's existing cloud. Do not assume a cloud subscription, tenant, or domain has been selected.

Keep business rules separate from hosting, authentication, and storage adapters so the application can move between environments. Do not implement two complete hosting stacks. For company deployment, provide configuration examples, database migrations, and clear setup instructions for IT. Keep secrets out of source code and browser bundles.

## Two linked hierarchies

Model these independently:

1. **Reporting hierarchy:** EmployeeID and ManagerID determine who reports to whom.
2. **Organizational hierarchy:** OrgUnitID and ParentOrgUnitID define company, department group, department, and subdepartment relationships. Each unit can have an owner and can contain deeper units without a hard-coded depth limit.

Every employee has one primary organizational unit in the first release. Use permanent IDs, never names, as keys. Preserve IDs across imports, renames, manager changes, and reorganizations. Preserve leading zeros in text IDs.

Provide a People view and an Organizational Units view. Label the active scope explicitly. A manager's reporting subtree may differ from the organizational units they own; never silently treat those populations as identical. Attach budgets and objectives to organizational units and show linked unit details from the People view where appropriate. Do not compare a reporting-subtree payroll total with an unrelated department budget.

## Excel input contract

Provide the following template sheets. The chart must work with Employees and OrganizationalUnits alone; missing optional sheets should produce useful empty states.

| Sheet | Core columns |
| --- | --- |
| Employees | EmployeeID, Name, JobTitle, ManagerID, OrgUnitID, EmploymentStatus, FTE, StartDate, EndDate; optional Location and EmploymentType |
| OrganizationalUnits | OrgUnitID, OrgUnitName, ParentOrgUnitID, UnitType, OwnerEmployeeID |
| Compensation | EmployeeID, EffectiveFrom, EffectiveTo, Currency, AnnualBasePay, AnnualTargetBonus, AnnualEmployerCosts |
| Budgets | BudgetID, OrgUnitID, BudgetYear, Currency, ApprovedEnvelope, DirectAllocation |
| Objectives | ObjectiveID, OrgUnitID, OwnerEmployeeID, ParentObjectiveID, ObjectiveText, PeriodStart, PeriodEnd, Status |
| KeyResults | KeyResultID, ObjectiveID, OwnerEmployeeID, MetricName, Unit, Baseline, CurrentValue, TargetValue, Direction, LastUpdated |

Document column definitions, required values, date formats, allowed statuses, and examples. Allow the configured CEO to have a blank ManagerID. Flag additional roots for review rather than silently dropping employees. Validate all hierarchy and owner references.

## Import, refresh, and data ownership

Start with drag-and-drop or file-picker upload of .xlsx files. Show a preview and change summary before committing an import: additions, updates, reporting changes, unit moves, and deactivations. Report errors by sheet, row, and field.

Validate duplicate IDs, missing required values, unresolved references, self-management, hierarchy cycles, invalid FTE values, overlapping compensation effective dates, and invalid or incompatible monetary data. Treat missing compensation as unknown, not zero. Keep the last successful dataset active when an import fails.

Make imports atomic and idempotent. Importing the same workbook twice must not duplicate people, budgets, or objectives. Default to incremental updates; missing rows do not imply termination or deletion. An explicitly selected full-snapshot mode must preview and confirm any resulting deactivations. Preserve history rather than hard-deleting records referenced by past budgets or OKRs.

Define field ownership clearly:

- Excel is authoritative for imported employee records, primary reporting relationships, compensation, and explicitly Excel-managed organizational units.
- The application is authoritative for owner-created subdepartments, app-managed planning assignments, budget allocations, and OKR updates after their initial import, unless an administrator explicitly selects another ownership mode.
- Preserve app-owned records and fields on subsequent uploads. Surface conflicting changes for resolution. Never overwrite department-owner work silently or change ownership implicitly.
- Track source, import version, editor, and modification time. Record moves, deactivations, and planning changes in an audit history.

After manual import works, add a SharePoint/OneDrive integration when credentials are available. Use Microsoft Graph to check a configured workbook for changes, import through the same validation pipeline, and show last successful refresh, source file, errors, and a manual refresh action. Make the polling interval configurable. Automatic refresh must honor the established import policy; destructive or conflicting changes should enter review. An ordinary hosted page cannot automatically monitor an arbitrary local Excel file without an additional integration.

## Chart and navigation experience

- On first load, show Lukas Czinger as the example root. In real data, use the configured CEO or validated root rather than hard-coding a person by name.
- Clicking a person card selects it, reveals that person's direct reports one level down, and opens its detail panel. Provide an explicit collapse control; expanding one branch must preserve other branches.
- Provide Expand Next Layer, Collapse All, Fit to View, zoom, pan, and Focus on This Organization. Keep the selected node visible during layout changes.
- Search names, titles, and departments. Selecting a result should reveal the required ancestor path and focus the result.
- Show name, title, unit, direct-report count, and an optional selected metric on compact cards. Include a visible indication that a collapsed node has reports.
- The detail panel should distinguish direct reports, all downstream reports, and subtree headcount including the selected leader. For units, distinguish directly assigned employees from the total including child units.
- Allow switching card overlays between headcount, payroll, and OKRs. Keep the chart uncluttered; place detailed measures and editing controls in the side panel.
- Preserve expansion, selection, and filter state where practical after refresh. Handle deactivated or moved selected records gracefully.
- Render only the visible portion of the graph while calculating totals from the complete authorized dataset. Changing expansion state must never change totals.
- Make controls keyboard-accessible and provide a usable narrow-screen layout. Avoid a chart that requires unreadably small text to fit the entire company.

## Payroll and budgets

Calculate headcount from unique active employee IDs as of the selected date. Calculate FTE separately. Each employee and compensation record must contribute at most once to a given aggregation.

Define annualized loaded payroll as AnnualBasePay + AnnualTargetBonus + AnnualEmployerCosts using the effective compensation record. In the default template, these are the employee's actual annual amounts at their contracted FTE, so do not multiply them by FTE again. Document this convention visibly in the template. Any alternative input basis needs an explicit mapping and normalization step.

Label this measure **annualized payroll run rate**. It is not actual year-to-date spend or a forecast with modeled future hires, departures, and raises. Show missing-data counts and mark totals incomplete when needed. Do not combine currencies without an explicit conversion policy.

For the first release, use annual budget envelopes attached to units:

- A unit's ApprovedEnvelope includes that unit and all descendants.
- DirectAllocation is the portion reserved for employees assigned directly to that unit.
- Immediate child-unit envelopes are allocations within the parent envelope.
- Unallocated budget = parent ApprovedEnvelope minus parent DirectAllocation minus the sum of immediate child envelopes.
- Do not add a parent's envelope to its children's envelopes to calculate company budget. That would double count the same approved dollars.
- Show direct payroll against DirectAllocation, and total unit payroll against ApprovedEnvelope, using matching year, currency, and scope. Label the resulting difference as annual run-rate headroom or overage, not remaining cash spend.
- Flag over-allocation and distinguish missing budgets from zero budgets. Owners can allocate their assigned envelope; increasing the parent-approved envelope requires the authorized finance or executive role.

Provide these measures at company, department-group, department, and subdepartment levels. Keep payroll actuals, vacancy planning, monthly forecasts, and multi-currency reporting as clearly identified later extensions unless they are explicitly requested during implementation.

## OKRs and department ownership

Support company objectives and contributing objectives at every organizational level. Each objective needs an accountable owner, period, and optional link to a parent objective. Each key result needs a measurable baseline, current value, target, unit, direction, owner, and last-updated date.

Allow department owners to create and maintain subdepartments within their scope, distribute their budget envelope, and create or update contributing OKRs. Preserve an audit trail. The interface should make the relationship to the company objective visible.

Display per-key-result progress using its own measurement rules, including increasing and decreasing targets. Handle equal baseline/target and missing values explicitly. Do not average unrelated percentages or imply a department metric automatically measures company achievement. Add objective-level scoring only with a defined and visible scoring rule. Distinguish user-entered health status from calculated progress and flag stale updates.

## Access and persistence

Store approved imports, app-owned changes, and history durably. Reloading the browser must preserve them.

Implement configurable roles and scopes rather than assuming a manager may see every salary:

- Administrator: imports, configuration, user access, and data-source ownership.
- Executive/Finance: authorized company-wide budget and compensation access.
- Department Owner: permitted units and descendants, with separate permissions for aggregate payroll and individual compensation.
- Viewer: only the chart and measures explicitly permitted for that user.

Enforce permissions on the server for records, fields, aggregate queries, search results, downloads, and mutations. Do not download the full salary dataset to unauthorized browsers and hide it with interface controls. Restrict compensation imports to authorized users. Protect aggregate outputs that would otherwise reveal restricted individual pay by subtraction or tiny groups; document the chosen policy.

Use company SSO in the production environment when available. Keep development role switching visibly labeled and disabled in production. Include backups and a documented restore process in the production deployment plan. Support restoring an imported snapshot without erasing unrelated app-managed changes made afterward.

## Visual direction

Create an original executive-grade interface: generous whitespace, strong typography, restrained neutral colors, a limited accent palette, readable cards, thin connectors, and smooth expansion. Borrow OrgPlus's useful interaction concepts without copying its branding or visual assets. Prioritize the hierarchy and selected organization over decorative dashboard elements.

Use a compact toolbar, a large central chart, and a contextual detail panel. Surface useful states for no workbook, invalid import, missing compensation, unbudgeted units, no direct reports, restricted access, and stale OKRs. Label all sample content clearly.

## Build sequence

1. Establish the project, schema, synthetic workbook, import validation, and working expandable People and Organizational Units views.
2. Add durable imports, snapshots, safe refresh behavior, search, scope selection, payroll calculations, and budget allocation rules.
3. Add linked OKRs, owner-managed subdepartments, editing workflows, audit history, and server-enforced roles.
4. Add the available hosting and authentication integration. Add SharePoint refresh when configured; otherwise deliver the tested integration boundary and exact setup steps.

Show a usable first version early, then refine it against these requirements. Clearly distinguish completed behavior from integrations that remain unconfigured. Do not stop at a static mockup or substitute nonfunctional controls for required workflows.

## Acceptance checks

Verify the following with meaningful automated checks and browser interaction where available:

1. Expanding Lukas reveals only his direct reports. Expanding one of them reveals that person's next layer while preserving other branches.
2. Search can reveal a person hidden below collapsed ancestors. Collapse and focus actions leave navigation usable.
3. Moving an employee by stable ID changes the hierarchy without creating a duplicate. Reimporting the same workbook is idempotent.
4. Duplicate IDs, missing managers, and cycles produce actionable errors and leave the last valid dataset unchanged.
5. Owner-created units, budget allocations, and OKR edits survive subsequent employee imports.
6. Hand-calculated fixtures verify direct and inclusive headcount, FTE, and loaded payroll. Collapsing nodes never changes totals; missing pay is reported.
7. Budget fixtures verify parent/child allocation constraints, unallocated amounts, overages, and no double counting of envelopes.
8. Reporting and organizational hierarchies can differ without incorrect scope comparisons or duplicated people.
9. Owners cannot read or edit unauthorized units or compensation by changing an API request, export request, or identifier. Verify aggregate restrictions too.
10. OKR ownership, alignment, increasing/decreasing metrics, and missing-data states behave correctly.
11. Authorized edits persist across sessions, and a failed refresh or restoration does not erase app-owned work.
12. Exercise a representative synthetic organization of at least 1,000 employees. Report observed responsiveness and any practical limits; avoid rendering every hidden node.

## Deliverables and handoff

Provide the implemented application, source code, database schema and migrations, Excel template, synthetic sample workbook, and concise README with run, import, configuration, and deployment instructions. Include an environment-variable example containing placeholders only. Document import ownership rules, metric definitions, role rules, and any limitations.

At handoff, provide the working preview or private URL if available, summarize what was verified, and list only the concrete remaining setup tasks. Start now by inspecting the available project and any attached workbook, outlining a short implementation plan, and building the first working milestone.
