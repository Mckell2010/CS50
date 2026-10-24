# Interactive organization chart prototype

Open `org-chart.html` in a current Microsoft Edge or Google Chrome browser. No installation, server, or internet connection is needed.

Click **Open Excel workbook** and select **Org Chart Organizer.xlsx**. The **Org Structure** sheet supplies the hierarchy, owners, and charters. **Position Control** supplies named active people and their department assignments. The file is processed locally; the page makes no network requests and never changes the original workbook.

- The left **Org Structure** sidebar follows the workbook’s **Department ID / Parent ID** hierarchy. Its expand/collapse controls are independent of the chart.
- Each card shows **Department code** (the workbook’s Department ID), **Department owner**, and the full **Charter / Purpose statement**. Purpose text comes from the **Department Purpose** column (or **Charter / Purpose statement** if provided). Blank owners display **Not assigned**; blank purposes display **Purpose not yet provided**. The optional **Purpose status** column labels draft statements. The selection bar shows the complete ancestor code path, preserving leading zeros.
- **Tier 1 · Corporation, Tier 2 · Function, etc.** appear once above their columns, remain visible when panning vertically, and track horizontal pan and zoom. Cards use consistent white/charcoal styling with an orange selection outline. Card heights expand to show their full purpose statements.
- The table also includes the full purpose statement. Use zoom controls or focus on a branch to read a dense chart.
- **+ / −** on a card expands or collapses its children to the right.
- Drag the background to pan; scroll or use the zoom buttons to zoom.
- Select a card and choose **Focus branch** to keep its ancestors and descendants visible. **Whole organization** restores other branches.
- **Expand one tier**, **Collapse all**, and **Fit view** adjust the visible tree.
- Search by unit name, ID, or owner. Search reveals matching branches and their ancestors.
- Click a sidebar item to focus it. **Table** shows the structure as rows; click a row to locate it in the tree.

The included example is synthetic and demonstrates **2 direct + 5 + 5 + 5 = 17 people**. This prototype supports structure exploration and temporary assignment review, separate from the full application. It does not edit workbook structure, calculate budgets, or filter by employing entity. Reloading or reopening a workbook resets temporary assignment edits; **Export assignments** saves a CSV review copy. Parent IDs determine displayed hierarchy depth; the root is displayed as Tier 1 without changing the workbook’s Tier values. Department IDs should be stored as text in Excel to preserve leading zeros.

Workbook updates replace the currently displayed structure, using the workbook’s current names, owners, codes, and purpose statements. No earlier code-to-department mappings are hard-coded.

If multiple units share a Department ID, the viewer keeps them separate and displays an import-review notice with their Excel row numbers. Original department codes remain visible. This works when parent references are unambiguous; if a Parent ID could refer to multiple units, the import explains which rows need unique codes and leaves the current chart unchanged.


## People and headcount

- The person icon at the bottom of each card opens its people list. A **collapsed** parent shows direct people plus everyone below it. An **expanded** parent shows only directly assigned people; its children show their own breakdowns. The secondary text always identifies direct, below, and total counts.
- Counts use the full organizational hierarchy even when search or focus hides branches. These are people counts, not FTE-weighted totals. Department owners are not added automatically; their person records count only in their assigned unit.
- Current people are named **Active** records in Position Control, including contractors. Planned, approved, filled-history, inactive, and unnamed open roles are excluded. Repeated matching person identifiers and names are consolidated; company-only placeholder IDs do not combine different people. Conflicting assignments or ambiguous source department codes remain unassigned and appear in review.
- Existing Department ID assignments are preserved. For blank codes, **Include title-based estimates** uses job-title keywords and company context to suggest a unit by its current name and hierarchy. Suggestions have qualitative confidence and rationale; they are not confirmed HR assignments. Generic titles that cannot be placed reasonably remain unassigned. Turning estimates off shows workbook assignments plus any manual review edits.
- **Review suggestions** and **Review unassigned** open the review list. **Change** lets you select a department or leave the person unassigned. Changes immediately update rollups. They stay in this browser page until reset; export before closing to retain them.
- **Export assignments** downloads a CSV with source Excel row numbers, position IDs, original and proposed department codes, parent codes, and the source/confidence/rationale for each assignment. Use it as a review record, then apply accepted assignments to the source workbook. Import department-code columns as text in Excel to retain leading zeros. The export excludes compensation and performance fields.
- If Position Control is absent or missing required headers, headcount is shown as unavailable rather than zero. The structure still opens.
- Small monochrome icons represent each organizational unit’s function; all cards retain the same visual color scheme.
