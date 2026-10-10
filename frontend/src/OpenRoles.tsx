import { useState } from "react";
import { BriefcaseBusiness, Search } from "lucide-react";
import type { Organization, Person } from "./types";
import { departmentFor } from "./openRoles";

export default function OpenRoles({
  data,
  onView,
  onEdit,
}: {
  data: Organization;
  onView: (id: string) => void;
  onEdit?: (person: Person) => void;
}) {
  const [groupBy, setGroupBy] = useState("manager");
  const [query, setQuery] = useState("");
  const managers = new Map(data.employees.map((p) => [p.EmployeeID, p]));
  const units = new Map(data.units.map((u) => [u.OrgUnitID, u]));
  const managerName = (p: Person) =>
    managers.get(p.ManagerID)?.Name ||
    (p.ManagerID ? "Manager outside current view" : "No manager assigned");
  const departmentName = (p: Person) =>
    departmentFor(p.OrgUnitID, data.units)?.OrgUnitName ||
    "Department not assigned";
  const all = data.employees.filter((p) => p.EmploymentStatus === "vacant");
  const rows = all.filter((p) =>
    `${p.Name} ${p.JobTitle} ${p.EmployeeID} ${managerName(p)} ${departmentName(p)} ${units.get(p.OrgUnitID)?.OrgUnitName || ""} ${p.Location || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const groups = new Map<string, { name: string; people: Person[] }>();
  rows.forEach((p) => {
    const department = departmentFor(p.OrgUnitID, data.units);
    const key =
      groupBy === "manager"
        ? p.ManagerID || "unassigned"
        : department?.OrgUnitID || "unassigned";
    if (!groups.has(key))
      groups.set(key, {
        name: groupBy === "manager" ? managerName(p) : departmentName(p),
        people: [],
      });
    groups.get(key)!.people.push(p);
  });
  return (
    <section className="open-roles-page">
      <div className="open-roles-toolbar">
        <strong>
          <BriefcaseBusiness size={18} /> {rows.length} of {all.length} open
          roles
        </strong>
        <label>
          Group by{" "}
          <select
            aria-label="Group open roles by"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
          >
            <option value="manager">Manager</option>
            <option value="department">Department</option>
          </select>
        </label>
        <label className="open-roles-search">
          <Search size={16} />
          <input
            aria-label="Search open roles"
            placeholder="Search roles, managers or departments"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <p className="muted">
        Unfilled positions in your current scope. Open roles are excluded from
        headcount, contributor FTE and payroll.
      </p>
      {rows.length === 0 && (
        <div className="notice">
          {all.length
            ? "No open roles match your search."
            : "No open roles in this scope."}
        </div>
      )}
      {[...groups.entries()]
        .sort((a, b) => a[1].name.localeCompare(b[1].name))
        .map(([key, group]) => (
          <section className="open-role-group" key={key}>
            <h2>
              {group.name} <span>{group.people.length} open</span>
            </h2>
            <div className="open-role-list">
              {group.people
                .sort(
                  (a, b) =>
                    a.JobTitle.localeCompare(b.JobTitle) ||
                    a.EmployeeID.localeCompare(b.EmployeeID),
                )
                .map((p) => (
                  <article className="open-role-card" key={p.EmployeeID}>
                    <span className="open-role-badge">
                      <BriefcaseBusiness size={13} /> OPEN ROLE
                    </span>
                    <h3>{p.JobTitle}</h3>
                    <p>
                      {p.Name} · Position {p.EmployeeID}
                    </p>
                    <dl>
                      <dt>Manager</dt>
                      <dd>{managerName(p)}</dd>
                      <dt>Department</dt>
                      <dd>{departmentName(p)}</dd>
                      <dt>Assigned unit</dt>
                      <dd>
                        {units.get(p.OrgUnitID)?.OrgUnitName || "Unassigned"}
                      </dd>
                      <dt>Location</dt>
                      <dd>{p.Location || "Not assigned"}</dd>
                    </dl>
                    <div className="open-role-actions">
                      <button
                        className="secondary"
                        onClick={() => onView(p.EmployeeID)}
                      >
                        View in organization
                      </button>
                      {onEdit && (
                        <button
                          className="text-button"
                          onClick={() => onEdit(p)}
                        >
                          Edit open role
                        </button>
                      )}
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))}
    </section>
  );
}
