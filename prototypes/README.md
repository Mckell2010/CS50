# Interactive organization chart prototype

Open `org-chart.html` in a current Microsoft Edge or Google Chrome browser. No installation, server, or internet connection is needed.

Click **Open Excel workbook** and select **Org Chart Organizer.xlsx**. The **Org Structure** sheet supplies the hierarchy, owners, and charters. **Position Control** supplies named active people and their department assignments. The workbook is processed locally and is never uploaded. Edits update the working data; **Download updated Excel** writes an updated copy. The original file on disk changes only if you replace it with that copy. The core viewer runs offline. Optional HTTPS portrait URLs load images from their hosts; uploaded local portraits work offline.

- The left **Org Structure** sidebar follows the workbook’s **Department ID / Parent ID** hierarchy. Its expand/collapse controls are independent of the chart.
- Each card shows a prominent **Department owner** name and portrait/initials above the **Department code** (the workbook’s Department ID), followed by the full **Charter / Purpose statement**. Purpose text comes from the **Department Purpose** column (or **Charter / Purpose statement** if provided). Blank owners display **Not assigned**; blank purposes display **Purpose not yet provided**. The optional **Purpose status** column labels draft statements. The selection bar shows the complete ancestor code path, preserving leading zeros.
- **Tier 1 · Corporation, Tier 2 · Function, etc.** appear once above their columns, remain visible when panning vertically, and track horizontal pan and zoom. Cards use consistent white/charcoal styling with an orange selection outline. Card heights expand to show their full purpose statements.
- The table also includes the full purpose statement and active/open rollups. Use zoom controls or focus on a branch to read a dense chart.
- **+ / −** on a card expands or collapses its children to the right.
- Drag the background to pan; scroll or use the zoom buttons to zoom.
- Select a card and choose **Focus branch** to keep its ancestors and descendants visible. **Whole organization** restores other branches.
- **Expand one tier**, **Collapse all**, and **Fit view** adjust the visible tree.
- Search by unit name, ID, or owner. Search reveals matching branches and their ancestors.
- Click a sidebar item to focus it. **Table** shows the structure as rows; click a row to locate it in the tree.

The included example is synthetic and demonstrates **2 direct + 5 + 5 + 5 = 17 people**. This standalone viewer supports structure exploration, reporting-line edits, adding roles and departments, and confirmed department assignments. It can export those changes into an updated copy of the original workbook. The separate Payroll tab provides illustrative compensation and percentage-based budget planning. The Divergent and Czinger checkboxes filter by the employing company in Position Control. Reloading or reopening a workbook resets working edits. **Download updated Excel** saves structural, role, manager, and confirmed assignment changes; **Export assignments** saves a CSV review copy including unconfirmed suggestions. Parent IDs determine displayed hierarchy depth; the root is displayed as Tier 1 without changing the workbook’s Tier values. Department IDs should be stored as text in Excel to preserve leading zeros.

Workbook updates replace the currently displayed structure, using the workbook’s current names, owners, codes, and purpose statements. No earlier code-to-department mappings are hard-coded.

If multiple units share a Department ID, the viewer keeps them separate and displays an import-review notice with their Excel row numbers. Original department codes remain visible. This works when parent references are unambiguous; if a Parent ID could refer to multiple units, the import explains which rows need unique codes and leaves the current chart unchanged.


## People and headcount

Each card shows **Total headcount = Active + Filled + Approved**, with **Active** on the left and **Inactive** on the right underneath. Here, Inactive means roles that are not yet active (Filled + Approved); it does not include historical records whose Excel status is Inactive. Approved is the same approved/unfilled bucket previously labeled Sourcing. Each column shows Divergent/Czinger totals when both companies are selected; hover over Inactive for company counts by recruiting status or click to review the roles. The total and both columns use the same direct/subtree scope and company filters. Estimated assignments are summarized once beneath the columns.

- The person icon at the bottom of each card opens its people list. A **collapsed** parent shows direct people plus everyone below it. An **expanded** parent shows only directly assigned people; its children show their own breakdowns. The secondary text always identifies direct, below, and total counts.
- Counts use the full organizational hierarchy even when search or focus hides branches. These are people counts, not FTE-weighted totals. Department owners are not added automatically; their person records count only in their assigned unit.
- Current people are named **Active** records in Position Control, including contractors. Approved, Filled, inactive, and unnamed open positions are excluded from active-people counts. Open roles are counted separately as described below. Repeated matching person identifiers and names are consolidated; company-only placeholder IDs do not combine different people. Conflicting assignments or ambiguous source department codes remain unassigned and appear in review.
- Existing Department ID assignments are preserved. For blank codes, **Include title-based estimates** uses job-title keywords and company context to suggest a unit by its current name and hierarchy. Suggestions have qualitative confidence and rationale; they are not confirmed HR assignments. Generic titles that cannot be placed reasonably remain unassigned. Turning estimates off shows workbook assignments plus any manual review edits.
- **Review suggestions** and **Review unassigned** open the review list. **Change** lets you select a department or leave the person unassigned. Changes immediately update the working Position Control Department ID and rollups. Download updated Excel before closing to retain them in the workbook.
- **Export assignments** downloads a CSV with record type (active person or open role), recruiting bucket, source Excel row numbers, position IDs, original and proposed department codes, parent codes, and the source/confidence/rationale for each assignment. The export always includes both companies, even if the chart is filtered. Use it as a review record. Confirmed changes made with Change are included in Download updated Excel; unconfirmed title-based suggestions are not written to Excel. Import department-code columns as text in Excel to retain leading zeros. The export excludes compensation and performance fields.
- If Position Control is absent or missing required headers, headcount is shown as unavailable rather than zero. The structure still opens.
- Small monochrome icons represent each organizational unit’s function; all cards retain the same visual color scheme.


## Company views

Select **Divergent**, **Czinger**, or both. DTI and DII map to Divergent; CZV maps to Czinger. Filters use employing company, not allocation percentages. At least one company remains selected. Unknown employing companies are retained only in the combined view and labeled Unspecified in splits.

With both selected, cards show the company breakdown for the count currently displayed: direct assignments when expanded, or the full subtree when collapsed. Active and open counts both follow this rule. With one company selected, the chart, sidebar, table, counts, and review lists are scoped to that company. Ancestors needed to preserve the hierarchy remain visible. Units without staffing data remain visible when their company scope is shared or matches the selection.

## Open roles: filled and approved

- **Filled:** Position ID Status is Filled, or an approved position has a recognized accepted-offer/filled stage. These positions remain separate from Active people; hire dates do not automatically promote them to Active.
- **Approved:** approved but unfilled positions. This includes Approved - Hide and approved intern-conversion variants. When Stage is blank, this is an approved/unfilled planning bucket, not a claim that a recruiter is actively sourcing every role.
- **Held / gated / pending:** excluded from open-role counts and shown separately in the summary. Inactive positions are excluded.
- Open roles count unique Position IDs, not candidate names. Repeated records are deduplicated. A Position ID already present as Active is excluded from open counts. Conflicting filled/sourcing statuses or employing companies for the same Position ID must be corrected before importing.
- Click a card’s open-role count or **Review open roles** to inspect direct/below/all roles and the Filled/Approved tabs. Missing or legacy department codes can receive labeled title-based suggestions. Assignments can be reviewed and exported like active-person assignments.
- Card counts include assigned records only; the top summary also identifies unassigned people and roles, which are not silently allocated to a department.

## Owner portraits

Click an owner’s initials/portrait to choose a JPEG, PNG, or WebP file (up to 2 MB), or enter a direct HTTPS image URL. Uploaded portraits are reduced to lightweight thumbnails in the browser. The portrait is shared across units with the same owner name. **Export photo pack** and **Import photo pack** preserve local portraits between sessions without publishing them.

Optional workbook columns: **Department Owner Photo URL**, **Owner Photo URL**, or **Photo URL**; and **Owner Profile URL** or **LinkedIn URL** for the source reference. A LinkedIn profile-page URL is not an image URL. **Find on LinkedIn** opens a name/company search for manual verification; the viewer does not scrape profiles or invent photo matches. Missing or inaccessible images fall back to initials. No real employee portraits are bundled with the public download.


## Payroll tab — illustrative demo only

Switch between **Organization** and **Payroll · Demo** above the Tree/Table controls. Both viewers use the same workbook, assignments, company filters, hierarchy, owners, and purpose statements. Payroll comparisons always cover an organization and all descendants; direct payroll appears separately. The example includes synthetic Filled and Approved positions as well as the 17 active example people.

Public job postings were inaccessible from the development environment (HTTP 403). **No published salary bands were verified.** Every generated amount is fictional and based on editable title-family assumptions, not an estimate of an actual person's compensation. Demo payroll does not use workbook compensation fields. Updated Excel preserves original unrelated fields as part of the source file, without displaying them or using them to seed demo pay. It does not infer pay from names, photos, or protected characteristics. All public bundled records remain synthetic.

- **Active annual payroll:** annualized cost of active employees and contractors.
- **Committed annual payroll:** Active + Filled roles awaiting start.
- **Fully staffed annual payroll:** Active + Filled + Approved/unfilled roles, each included once. Open roles assume a full year of staffing, not their expected hire dates.
- **Annual budget / used % / remaining:** compares fully staffed payroll against the selected companies' budget. Cards also show their share of the parent budget and total payroll. Parent and descendant rollups overlap; do not add table rows together.
- **Unassigned payroll:** included in the overall summary but kept outside department rollups until assigned. Historical Inactive and held/gated/pending positions remain excluded.

**People & demo pay** opens all included records. A card's **People & pay** opens its branch, with direct/all scope controls. Edit demo compensation as salary plus annual bonus, hourly rate × editable annual hours (default 2,080), or monthly contractor rate × 12. Agency-paid temp/contractor labels default to the monthly basis. All compensation classifications are illustrative and editable. Benefits, employer taxes, equity, overtime, and start-date proration are excluded. The assumptions disclosure and each pay editor expose the title band used. Generated values are repeatable for each position/title/company and do not change when filtering, moving assignments, or selecting cards.

**Set corporate budgets** sets Divergent and Czinger annual envelopes (and Unspecified company when applicable). **Tune budget** on any lower unit edits only its percentage of each company's parent budget; resulting dollars calculate automatically. Sibling percentages cannot exceed 100%. The remainder is available for directly assigned staff or unallocated reserve. Default company budgets equal fully staffed demo payroll plus 8%, rounded up to $10,000. Initial child shares use payroll weights with small deterministic variation to illustrate over/under-budget cases. Editing compensation or assignments changes spend but leaves those budgets fixed. Changing a parent envelope scales descendants automatically.

**Save scenario** downloads a local JSON file with fictional pay, budgets, and assignment overrides. Reopen the same workbook and use **Load scenario** to restore it; mismatched structures/rosters or invalid allocations are rejected without changing the current scenario. **Reset demo numbers** regenerates pay and budgets from current assignments. Reloading the workbook resets the scenario, so save first. Scenario files include record identifiers and should be handled like your workbook; they are not uploaded or bundled in the public download. **Export rollups CSV** exports department totals for the current company filter, clearly marked DEMO ONLY, plus unassigned totals. It includes all matching departments, independent of search or selection.

## Selection focus in both viewers

Click a card to make it larger. Its ancestors and descendants keep their normal detail, while unrelated cards—including peers in the same tier—become compact summaries. Hierarchy, counts, budgets and company filtering do not change. Compact cards show the unit, owner, code and a headcount or payroll summary, and can still be expanded or selected. Curved lines attach to their resized edges. Click the selected card again or **Clear selection** to restore equal-sized cards. Enter/Space on a card supports the same selection toggle. **Focus branch** remains a separate option to hide unrelated branches entirely.


## Reporting Structure tab

The final **Reporting Structure** tab uses **Direct Manager** from Position Control to draw a separate, left-to-right people hierarchy. It does not treat department ownership or department nesting as a reporting relationship. Person cards show name, title, assigned department, employing company, Active/Filled/Approved status, manager, and direct/descendant headcounts. Open positions have dashed borders and can be hidden with **Open roles**. Historical Inactive and held/gated/pending positions stay excluded.

- **Gray = Divergent; blue = Czinger.** DTI/DII remain grouped as Divergent. Unknown companies use a neutral card.
- **Department overlay** adds subtle colored halos and matching department label accents with a legend. It is optional and does not rearrange or change reporting lines. Estimated department assignments remain labeled.
- Search people, titles, manager labels, or department names/codes. Expand/collapse, pan, zoom, and selection emphasis work independently of the organization-unit tree. Selecting a person enlarges their card and keeps ancestors/descendants readable while unrelated cards become compact. Clear selection or click again to reset.
- The first view centers a visible CEO or top manager at readable zoom. **Fit view** shows the whole tree. Drag to pan large trees.
- Company filters retain out-of-company managers as faded context wherever needed to preserve reporting chains. These context cards are excluded from the filtered headcounts. Counts include every selected person or open role once, independently of collapsed branches.

**Manager matching and review:** normalized exact names (including Last, First) or explicit `Pos ID:` references connect automatically. A unique common-nickname match is shown as unconfirmed with a dashed connector. Unknown managers, ambiguous duplicate names, conflicting manager entries, self-reporting, and cycles are grouped under **Manager links to review**, without inventing a manager record. Review entries report affected record counts, not unique-manager counts. A named unresolved manager placeholder is not a confirmed person or extra headcount. Blank manager fields remain top-level. If the Direct Manager column is absent, the viewer explains that reporting links are unavailable.

**Review manager links** lets you map each source manager label to the correct active person, or explicitly choose no manager. Changes apply to all records with that label. A choice that creates a reporting cycle is rejected. **Reset** returns the label to source matching. Applying a manager correction updates Direct Manager in the working Position Control data without changing department assignments. Download updated Excel saves the correction. Legacy settings-file manager overrides are also materialized into the exported Direct Manager cells.

**Card images:** built-in artwork now uses a recognizable silver printed structural part for Divergent and a dark bronze/carbon Czinger vehicle in a three-quarter view. These transparent product cutouts were prepared with image generation from the user-provided references; they are reference-based adaptations, not pixel-exact crops of the original photographs. They replace the earlier wireframe and car-outline badges. The larger thumbnail area keeps names clear of the artwork. Defaults are embedded in the HTML and work offline. Use **Card images** to upload replacement product photographs (PNG/JPEG/WebP, up to 5 MB); restore buttons return to these built-in product images. Uploaded replacements stay local and can be saved with reporting settings. No employee data or images are uploaded.

**Save reporting settings** keeps manager overrides and uploaded brand images in a local JSON file. Reopen the same workbook, then **Load settings** to restore them. Reloading a workbook resets manager overrides. Settings are separate from payroll scenarios; original workbook contents remain unchanged. No private workbooks, real employee photos, locally uploaded replacements, or reporting settings are included in the public ZIP. The two reference-based default product cutouts are bundled.


## Edit the trees and save back to Excel

All editing flows operate locally and validate before committing. **Download updated Excel** saves an `.xlsx` copy in the original workbook format. Browser upload access does not permit silent overwriting of the source file. Replace your original file with the exported copy if desired, or retain both versions. Reopen the exported workbook to continue from the saved state. **Undo last workbook edit** supports the last 30 edits in the current session; unrelated demo-pay and budget edits remain intact.

### Reconnect a reporting line

On a person/open-role card in **Reporting Structure**, drag **↗ Manager** onto the new manager’s card, then apply the proposed change. Clicking the same button opens a full manager selector, including managers outside the visible tree. Choose **No manager / top level** to remove a reporting link. Self-reporting and new reporting cycles are rejected. The person’s entire reporting branch moves; department assignments stay unchanged. Each affected original Position Control source row receives the updated **Direct Manager** value.

A uniquely named active manager is saved by name. Open-role managers or duplicate names use `Pos ID: <unique position ID>` so the link survives reimport without guessing. Alphanumeric Position IDs are supported. Individual reconnects take precedence over old label-wide display overrides.

### Add a role

Use **＋ Role** in the reporting toolbar or on a manager’s card. Enter a unique Position ID, title, Active/Filled/Approved status, person name when Active or Filled, direct manager (or explicit top-level choice), department, job level, employing company, location, and employment type. FTEs require Exempt/Non-exempt classification. Role type is optional. Department and job level are separate from reporting hierarchy and organizational tier.

The role is appended to Position Control and appears in reporting/headcount/payroll views immediately. Existing rows—including held and inactive positions—are preserved. IDs must be unique across the whole source sheet. Demo compensation is initialized using the selected pay classification; existing budgets remain fixed. A company filter is expanded when necessary to show the newly created role. **People table** displays current Position Control fields, including manager, department and level, and updates after edits.

### Add a department and assign people

Use **＋ Department** on an organizational card or in the Organization toolbar. Choose its parent, enter a unique department code/name, and optionally set an owner and charter. The viewer derives its organizational tier from its parent. Select the people and open roles to move into the new department, or leave it empty. Selection remains intact while searching the list. Assigning an owner does not automatically move that owner’s person record.

The new unit appears in the tree and structure table, and selected records receive its Department ID. Their direct managers remain unchanged. New departments start with 0% of the parent budget until allocated in Payroll; existing budgets do not silently rebalance. Shared/duplicate department codes cannot be used as the parent of a new unit or as its assignment target because that would produce an ambiguous exported hierarchy.

### What the Excel export preserves

The loaded workbook is the export template. With **Keep original column layout** enabled (the default), the latest Organizer layout stays intact: **Org Structure** headers on row 4 and **Position Control** headers on row 3, with their original column names and order. Load your latest workbook before editing to use its formatting. Sheet names, frozen panes, original cell styles, unrelated worksheets/fields, and validation definitions are retained. New rows inherit the last data row’s formatting and formulas, with relative references translated; filters and validation ranges extend for appended rows. Excel recalculates formulas when opened.

Extra viewer fields absent from the original columns, such as FLSA Classification, are saved in a custom workbook property and restored when reopened in this viewer. They do not add columns or worksheets in the default mode. Uncheck **Keep original column layout** if you want those extra fields exported as ordinary columns for tools such as Power BI. Department codes remain text, preserving leading zeros; formula-like user input remains literal text.

Deleted records are cleared in their original Excel rows, leaving blank formatted rows rather than shifting other rows and breaking their formula references. Cleared records are excluded on reimport. Appended records use new row numbers, so adding after a deletion cannot overwrite an earlier record.

Only explicit changes and reviewed assignments are saved. Unconfirmed title-based department guesses and nickname-based manager suggestions are not silently written into the source file. Fictional payroll and budgets remain separate scenario data and are not substituted for original compensation. Updated workbooks and locally edited roster data are never included in the public viewer package or uploaded anywhere.


### Delete a role

Use **Delete role** on a person/open-role card in Reporting Structure or in **People table**. If a person has several positions, select the Position ID to remove. Other positions remain. Before deleting a manager position, choose a replacement manager or explicitly choose **No manager / top level** for affected direct reports. Held/inactive source rows that reference the manager are included in reassignment. Self-reporting and new cycles are rejected. Direct reports are retained, and headcounts and demo payroll update immediately; budgets stay fixed.

### Delete a department

Use **Delete department** on an organizational card, or select a unit and use **Delete selected department** in the toolbar. The Corporation root cannot be deleted. Choose a remaining department or explicitly choose **Unassigned** for affected positions, including historical records. An explicit Unassigned choice will not be overwritten by title-based estimates, including after export/reimport.

Children move up to the deleted department’s parent, and descendant tiers are recalculated. People’s reporting lines stay unchanged. Child budget percentages are recalculated to preserve their dollar envelopes; the removed department’s remaining allocation returns to the parent reserve. The confirmation shows the impact before applying. **Undo last workbook edit** restores the deleted records and structure during the current session. Download updated Excel to save the result.


### Search department selectors

Department selectors in role creation, person assignment, parent selection, and department deletion accept typed names or codes. Choices follow the organizational tree, with children indented beneath their parents even when workbook rows are out of order. Search retains ancestor rows for context; searching a parent name also finds its descendants. Shared/ambiguous codes remain unavailable.

Click a result, or use the arrow keys and Enter to select it. Escape closes the menu; leaving a search without choosing a result retains the previous selection. Parent selections continue to update the new department’s tier. Unassigned remains available where supported.
