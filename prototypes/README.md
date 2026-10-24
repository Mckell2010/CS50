# Interactive organization chart prototype

Open `org-chart.html` in a current Microsoft Edge or Google Chrome browser. No installation, server, or internet connection is needed.

Click **Open Excel workbook** and select **Org Chart Organizer.xlsx**. The **Org Structure** sheet supplies the hierarchy, owners, and charters. **Position Control** supplies named active people and their department assignments. The workbook is processed locally and is never uploaded or changed. The core viewer runs offline. Optional HTTPS portrait URLs load images from their hosts; uploaded local portraits work offline.

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

The included example is synthetic and demonstrates **2 direct + 5 + 5 + 5 = 17 people**. This prototype supports structure exploration and temporary assignment review, separate from the full application. It does not edit workbook structure or calculate budgets. The Divergent and Czinger checkboxes filter by the employing company in Position Control. Reloading or reopening a workbook resets temporary assignment edits; **Export assignments** saves a CSV review copy. Parent IDs determine displayed hierarchy depth; the root is displayed as Tier 1 without changing the workbook’s Tier values. Department IDs should be stored as text in Excel to preserve leading zeros.

Workbook updates replace the currently displayed structure, using the workbook’s current names, owners, codes, and purpose statements. No earlier code-to-department mappings are hard-coded.

If multiple units share a Department ID, the viewer keeps them separate and displays an import-review notice with their Excel row numbers. Original department codes remain visible. This works when parent references are unambiguous; if a Parent ID could refer to multiple units, the import explains which rows need unique codes and leaves the current chart unchanged.


## People and headcount

Each card shows **Total headcount = Active + Filled + Approved**, with **Active** on the left and **Inactive** on the right underneath. Here, Inactive means roles that are not yet active (Filled + Approved); it does not include historical records whose Excel status is Inactive. Approved is the same approved/unfilled bucket previously labeled Sourcing. Each column shows Divergent/Czinger totals when both companies are selected; hover over Inactive for company counts by recruiting status or click to review the roles. The total and both columns use the same direct/subtree scope and company filters. Estimated assignments are summarized once beneath the columns.

- The person icon at the bottom of each card opens its people list. A **collapsed** parent shows direct people plus everyone below it. An **expanded** parent shows only directly assigned people; its children show their own breakdowns. The secondary text always identifies direct, below, and total counts.
- Counts use the full organizational hierarchy even when search or focus hides branches. These are people counts, not FTE-weighted totals. Department owners are not added automatically; their person records count only in their assigned unit.
- Current people are named **Active** records in Position Control, including contractors. Approved, Filled, inactive, and unnamed open positions are excluded from active-people counts. Open roles are counted separately as described below. Repeated matching person identifiers and names are consolidated; company-only placeholder IDs do not combine different people. Conflicting assignments or ambiguous source department codes remain unassigned and appear in review.
- Existing Department ID assignments are preserved. For blank codes, **Include title-based estimates** uses job-title keywords and company context to suggest a unit by its current name and hierarchy. Suggestions have qualitative confidence and rationale; they are not confirmed HR assignments. Generic titles that cannot be placed reasonably remain unassigned. Turning estimates off shows workbook assignments plus any manual review edits.
- **Review suggestions** and **Review unassigned** open the review list. **Change** lets you select a department or leave the person unassigned. Changes immediately update rollups. They stay in this browser page until reset; export before closing to retain them.
- **Export assignments** downloads a CSV with record type (active person or open role), recruiting bucket, source Excel row numbers, position IDs, original and proposed department codes, parent codes, and the source/confidence/rationale for each assignment. The export always includes both companies, even if the chart is filtered. Use it as a review record, then apply accepted assignments to the source workbook. Import department-code columns as text in Excel to retain leading zeros. The export excludes compensation and performance fields.
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
