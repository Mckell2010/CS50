import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2, Download } from "lucide-react";
import {
  api,
  money,
  type Organization,
  type Unit,
  type Session,
  type RecordData,
} from "./types";
import { unitTier, tierName } from "./orgColors";
import StructureTable from "./StructureTable";
import { downloadWorkbook } from "./ImportPanel";

export default function StructurePage({
  data,
  session,
  onEdit,
  onSaved,
  onBudget,
  onView,
}: {
  data: Organization;
  session: Session;
  onEdit: (sheet: string, record: RecordData) => void;
  onSaved: () => void;
  onBudget: (unit: Unit) => void;
  onView: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["organizer-review"]));
  const [format, setFormat] = useState("viewer");
  const [includeReview, setIncludeReview] = useState(false);
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<Unit | null>(null);
  const [promote, setPromote] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [assigning, setAssigning] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const byId = new Map(data.units.map((u) => [u.OrgUnitID, u]));
  const reviewUnit = (id: string) => {
    const seen = new Set<string>();
    while (id && !seen.has(id)) {
      if (id === "organizer-review") return true;
      seen.add(id); id = byId.get(id)?.ParentOrgUnitID || "";
    }
    return false;
  };
  const children = (id: string) =>
    data.units
      .filter((u) => u.ParentOrgUnitID === id)
      .sort((a, b) => a.OrgUnitName.localeCompare(b.OrgUnitName));
  const matches = new Set<string>();
  data.units
    .filter((u) =>
      `${u.OrgUnitName} ${u.DepartmentCode || ""} ${u.OrgUnitID}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .forEach((u) => {
      let current: Unit | undefined = u;
      const seen = new Set<string>();
      while (current && !seen.has(current.OrgUnitID)) {
        seen.add(current.OrgUnitID);
        matches.add(current.OrgUnitID);
        current = byId.get(current.ParentOrgUnitID);
      }
    });
  const add = (parent?: Unit) => {
    const tier = parent ? (unitTier(parent) ?? 0) + 1 : 0;
    const kind =
      ["corporate", "function", "group", "department", "team"][tier] || "subteam";
    onEdit("OrganizationalUnits", {
      OrgUnitID: "unit-" + crypto.randomUUID().slice(0, 8),
      OrgUnitName: "",
      ParentOrgUnitID: parent?.OrgUnitID || "",
      Tier: String(tier),
      UnitType: kind,
      DepartmentCode: "",
      OwnerEmployeeID: "",
      DepartmentOwner: "", DepartmentPurpose: "", Entity: "both",
    });
  };
  const remove = async () => {
    if (!deleting) return;
    setError("");
    setBusy(true);
    try {
      await api(`/units/${encodeURIComponent(deleting.OrgUnitID)}`, {
        method: "DELETE",
        body: JSON.stringify({
          version: data.version,
          promoteChildren: promote,
        }),
      });
      setDeleting(null);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const row = (unit: Unit, depth: number): React.ReactNode => {
    if (!matches.has(unit.OrgUnitID)) return null;
    const nested = children(unit.OrgUnitID);
    const expanded = query || !collapsed.has(unit.OrgUnitID);
    const tier = unitTier(unit);
    const owner = data.employees.find(
      (p) => p.EmployeeID === unit.OwnerEmployeeID,
    );
    return (
      <div key={unit.OrgUnitID} className="structure-branch">
        <article className="structure-row" data-structure-unit={unit.OrgUnitID}>
          <div className="structure-unit-title">
            {nested.length > 0 ? (
              <button
                className="icon-button"
                aria-label={`${expanded ? "Collapse" : "Expand"} structure ${unit.OrgUnitName}`}
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (next.has(unit.OrgUnitID)) next.delete(unit.OrgUnitID);
                    else next.add(unit.OrgUnitID);
                    return next;
                  })
                }
              >
                {expanded ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )}
              </button>
            ) : (
              <span className="structure-leaf" />
            )}
            <div>
              <small>
                {tier == null
                  ? "Tier not assigned"
                  : `Tier ${tier} · ${tierName(tier)}`}{" "}
                · {unit.UnitType}
              </small>
              <h3>{unit.OrgUnitName}</h3>
              <p>
                {unit.DepartmentCode
                  ? `Department ${unit.DepartmentCode}`
                  : "No department code"}{" "}
                · {unit.DepartmentOwner || owner?.Name || "Owner unassigned"}
              </p>
              {unit.DepartmentPurpose && <p>{unit.DepartmentPurpose}</p>}
            </div>
          </div>
          <div className="structure-metrics">
            <span>
              {unit.metrics.total.headcount} people in subtree ·{" "}
              {unit.metrics.direct.headcount} direct
            </span>
            {session.role !== "viewer" && (
              <span>
                Budget:{" "}
                {unit.metrics.budget
                  ? money(unit.metrics.envelope || 0, data.currency)
                  : "Not set"}
              </span>
            )}
          </div>
          <div className="structure-actions">
            <button
              className="text-button"
              onClick={() => onView(unit.OrgUnitID)}
            >
              View chart
            </button>
            {session.canEdit && (
              <>
                <button
                  className="text-button"
                  onClick={() => onEdit("OrganizationalUnits", unit)}
                >
                  Edit / move
                </button>
                <button className="text-button" onClick={() => add(unit)}>
                  <Plus size={13} />
                  Add child tier
                </button>
                <button className="text-button" onClick={() => onBudget(unit)}>
                  Set budget
                </button>
              </>
            )}
            {session.role === "admin" && (
              <button
                className="text-button"
                onClick={() => {
                  setAssigning(unit.OrgUnitID);
                  setPersonQuery("");
                }}
              >
                Assign people
              </button>
            )}
            {session.canViewCompensation && (
              <button
                className="text-button"
                aria-label={`Delete unit ${unit.OrgUnitName}`}
                onClick={() => {
                  setDeleting(unit);
                  setPromote(false);
                  setError("");
                }}
              >
                <Trash2 size={13} />
                Delete
              </button>
            )}
          </div>
        </article>
        {expanded && nested.length > 0 && (
          <div className="structure-children">
            {nested.map((u) => row(u, depth + 1))}
          </div>
        )}
      </div>
    );
  };
  return (
    <section className="structure-page">
      <p className="notice">
        Create the Corporate → function → group → department → team hierarchy,
        then add as many subtiers as needed. Budgets and OKRs follow this
        structure. Reporting lines are separate; department codes stay attached
        to their units.
      </p>
      {session.canViewCompensation && <div className="organizer-export">
        <button className="secondary" disabled={exporting} onClick={async () => {
          setExportError(""); setExporting(true);
          try { await downloadWorkbook("organizer"); } catch (e) { setExportError((e as Error).message); }
          finally { setExporting(false); }
        }}><Download size={14}/>{exporting ? "Preparing Excel…" : "Export organizer Excel"}</button>
        <small>Both entities · saved data · original layout + Power BI tables · no compensation or performance data</small>
        {exportError && <p role="alert">{exportError}</p>}
      </div>}
      <div className="structure-toolbar">
        <div className="view-tabs" aria-label="Structure format">
          <button aria-pressed={format === "viewer"} onClick={() => setFormat("viewer")}>Viewer</button>
          <button aria-pressed={format === "table"} onClick={() => setFormat("table")}>Table</button>
        </div>
        <input
          aria-label="Search organizational structure"
          placeholder="Find a unit or department code"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="secondary" onClick={() => setCollapsed(new Set())}>
          Expand all
        </button>
        <button
          className="secondary"
          onClick={() =>
            setCollapsed(new Set(data.units.map((u) => u.OrgUnitID)))
          }
        >
          Collapse all
        </button>
        {session.canViewCompensation && (
          <button className="primary" onClick={() => add()}>
            <Plus size={14} />
            Add Corporate / Tier 0
          </button>
        )}
      </div>
      {deleting && (
        <section
          className="structure-delete notice"
          aria-label="Review unit deletion"
        >
          <h3>Delete {deleting.OrgUnitName}?</h3>
          <p>
            People, budgets and objectives must be reassigned first, including
            historical records. Department codes on other units and saved
            reporting lines are preserved. Deleted units are skipped on workbook
            reimport.
          </p>
          {children(deleting.OrgUnitID).length > 0 && (
            <label>
              <input
                type="checkbox"
                checked={promote}
                disabled={!deleting.ParentOrgUnitID}
                onChange={(e) => setPromote(e.target.checked)}
              />
              Remove this level and move its{" "}
              {children(deleting.OrgUnitID).length} child units to{" "}
              {byId.get(deleting.ParentOrgUnitID)?.OrgUnitName ||
                "a parent (move children first)"}
              . Child tier numbers stay the same.
            </label>
          )}
          {error && <p role="alert">{error}</p>}
          <div className="structure-actions">
            <button className="primary" disabled={busy} onClick={remove}>
              Confirm deletion
            </button>
            <button className="secondary" onClick={() => setDeleting(null)}>
              Cancel deletion
            </button>
          </div>
        </section>
      )}
      {assigning && (
        <section
          className="notice structure-assign"
          aria-label="Assign people to unit"
        >
          <h3>Assign people to {byId.get(assigning)?.OrgUnitName}</h3>
          <p>
            Choose a person to review and save their unit assignment. Their
            manager stays the same.
          </p>
          <input
            aria-label="Find person to assign"
            value={personQuery}
            onChange={(e) => setPersonQuery(e.target.value)}
            placeholder="Search name or title"
          />
          {personQuery && (
            <div>
              {data.employees
                .filter((p) =>
                  `${p.Name} ${p.JobTitle}`
                    .toLowerCase()
                    .includes(personQuery.toLowerCase()),
                )
                .slice(0, 20)
                .map((p) => (
                  <button
                    className="text-button"
                    key={p.EmployeeID}
                    onClick={() =>
                      onEdit("Employees", { ...p, OrgUnitID: assigning })
                    }
                  >
                    {p.Name} · {p.JobTitle}
                  </button>
                ))}
            </div>
          )}
          <button className="text-button" onClick={() => setAssigning("")}>
            Close assignment
          </button>
        </section>
      )}
      {format === "table" && data.units.some(u => u.OrgUnitID === "organizer-review") && <label className="review-toggle"><input type="checkbox" checked={includeReview} onChange={e => setIncludeReview(e.target.checked)} /> Include previous assignments awaiting new department IDs</label>}
      {format === "table" ? <StructureTable data={data} session={session} units={data.units.filter(u => matches.has(u.OrgUnitID) && (includeReview || !reviewUnit(u.OrgUnitID))).sort((a,b) => (a.DepartmentCode || a.OrgUnitID).localeCompare(b.DepartmentCode || b.OrgUnitID))} onSaved={onSaved} onView={onView} /> : <div className="structure-tree">
        {data.units
          .filter((u) => !byId.has(u.ParentOrgUnitID))
          .sort((a, b) => a.OrgUnitName.localeCompare(b.OrgUnitName))
          .map((u) => row(u, 0))}
      </div>}
      {!matches.size && (
        <p className="notice">
          No matching units. Add Corporate to begin a new structure.
        </p>
      )}
    </section>
  );
}
