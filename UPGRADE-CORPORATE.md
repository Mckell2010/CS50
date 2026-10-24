# Run the Corporate organization update

This source download contains the app, not your private roster or database.

1. Extract the ZIP into a new folder.
2. Stop your existing demo. Copy its `data/private-demo.db` into the new folder's `data/private-demo.db`. Keep the original folder as your backup. If there are `private-demo.db-wal` or `private-demo.db-shm` files after stopping the app, use the app's workbook export/import workflow instead of copying a live database.
3. Double-click `demo.cmd` on Windows, or run `python scripts/run_demo.py` from the new folder. The launcher installs dependencies, builds the app and opens the browser.
4. Choose **Import workbook** and select your **Org Chart Organizer.xlsx**. Review the proposed changes and apply them.
5. Explore **Organization → Organizational units**, or **Org structure → Viewer / Table**. Use **Entity → Both / Divergent / Czinger Vehicles** to filter by employing company.

Saved table and viewer edits update the same records. The import preserves app-owned edits, existing compensation, budgets and objectives. Exact existing person IDs with new Department IDs are mapped; unmatched assignments stay under **Assignments to review**. This import updates the structure and matching assignments; it does not replace the full position roster or refresh hiring statuses.

If you have no existing database, choose the organizer workbook when the launcher asks. It initializes the structure, with owner names from the workbook, but does not create the position roster. Use your previous organization-chart workbook first if you need to initialize the people data, then import the organizer through the app.

## Export the completed organizer

After updating, import your original organizer workbook once so its recruiting/approval fields can be retained alongside your saved app edits. In **Org structure**, choose **Export organizer Excel**. The file includes the original two layouts plus stable-ID Power BI tables and review notes for unknown or unmatched data. Export is available to Administrator and Finance roles and includes both entities; it excludes compensation and performance records. In Power BI, use **Get data → Excel workbook**, then select `tblOrgUnits` and `tblPeople` for the current app snapshot.
