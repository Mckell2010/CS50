# Interactive organization chart prototype

Open `org-chart.html` in a current Microsoft Edge or Google Chrome browser. No installation, server, or internet connection is needed.

Click **Open Excel workbook** and select **Org Chart Organizer.xlsx**. Only the **Org Structure** sheet is displayed. The file is processed locally; this page makes no network requests and does not save your workbook or changes.

- The left **Org Structure** sidebar follows the workbook’s **Department ID / Parent ID** hierarchy. Its expand/collapse controls are independent of the chart.
- Each card shows **Department code** (the workbook’s Department ID), **Department owner**, and the full **Charter / Purpose statement**. Purpose text comes from the **Department Purpose** column (or **Charter / Purpose statement** if provided). Blank owners display **Not assigned**; blank purposes display **Purpose not yet provided**. The optional **Purpose status** column labels draft statements. The selection bar shows the complete ancestor code path, preserving leading zeros.
- **Tier 0, Tier 1, etc.** appear once above their columns, remain visible when panning vertically, and track horizontal pan and zoom. Cards use consistent white/charcoal styling with an orange selection outline. Card heights expand to show their full purpose statements.
- The table also includes the full purpose statement. Use zoom controls or focus on a branch to read a dense chart.
- **+ / −** on a card expands or collapses its children to the right.
- Drag the background to pan; scroll or use the zoom buttons to zoom.
- Select a card and choose **Focus branch** to keep its ancestors and descendants visible. **Whole organization** restores other branches.
- **Expand one tier**, **Collapse all**, and **Fit view** adjust the visible tree.
- Search by unit name, ID, or owner. Search reveals matching branches and their ancestors.
- Click a sidebar item to focus it. **Table** shows the structure as rows; click a row to locate it in the tree.

The included example is synthetic. This is a read-only interaction prototype, separate from the full application: it does not edit data, calculate budgets, or filter by employing entity. Reloading resets the view; reopen your workbook to restore its data. Parent IDs determine displayed hierarchy depth. Department IDs should be stored as text in Excel to preserve leading zeros.
