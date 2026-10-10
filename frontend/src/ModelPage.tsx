import { useEffect, useMemo, useState } from "react";
import {
  api,
  money,
  type Organization,
  type RecordData,
  type Session,
} from "./types";
export default function ModelPage({
  data,
  session,
  onEdit,
  onSaved,
}: {
  data: Organization;
  session: Session;
  onEdit: (sheet: string, record: RecordData) => void;
  onSaved: () => void;
}) {
  const [model, setModel] = useState<RecordData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(""),
    [company, setCompany] = useState(""),
    [kind, setKind] = useState("all"),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [percent, setPercent] = useState("100"),
    [page, setPage] = useState(0);
  const load = () =>
    api("/model")
      .then(setModel)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [data.version]);
  const change = (key: string, value: any) =>
    setModel((m) => (m ? { ...m, config: { ...m.config, [key]: value } } : m));
  const matches = useMemo(
    () =>
      ((model?.people || data.employees) as typeof data.employees).filter(
        (e) =>
          (!query ||
            `${e.Name} ${e.JobTitle} ${e.EmployeeID}`
              .toLowerCase()
              .includes(query.toLowerCase())) &&
          (!company || e.SourceCompany === company) &&
          (kind === "all" ||
            (kind === "contributors"
              ? e.companyAllocation.canEdit
              : e.EmploymentStatus === kind)),
      ),
    [data, model?.people, query, company, kind],
  );
  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [query, company, kind]);
  const run = async (fn: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
      await load();
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!session.canViewCompensation)
    return (
      <section className="model-panel">
        <h2>Model settings require administrator or finance access</h2>
      </section>
    );
  if (!model) return <p>{error || "Loading model settings…"}</p>;
  const config = model.config,
    preview = model.preview;
  const companies = data.units.filter((u) => u.UnitType === "company");
  const filled = (model.people as typeof data.employees).filter(
    (e) => !["vacant", "draft"].includes(e.EmploymentStatus),
  );
  const eligible = matches.filter((e) => e.companyAllocation.canEdit);
  return (
    <div className="model-page">
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <section className="model-panel">
        <h2>People, roles & contributor allocations</h2>
        <p className="fine-print">
          Edit names, titles, managers, departments and FTE. Vacancies are
          positions, not headcount. Contributor percentages must be explicitly
          assigned; managers calculate automatically.
        </p>
        {session.role === "admin" && (
          <button
            className="secondary"
            onClick={() =>
              onEdit("Employees", {
                EmployeeID: `person-${crypto.randomUUID()}`,
                Name: "",
                JobTitle: "",
                ManagerID: "",
                OrgUnitID:
                  config.divergentUnit || data.units[0]?.OrgUnitID || "",
                EmploymentStatus: "draft",
                FTE: "",
                StartDate: "",
                EndDate: "",
                EmploymentType: "",
                Location: "",
                SourceCompany: "",
                FTEBasis: "Not yet supplied",
              })
            }
          >
            Add person or open role
          </button>
        )}
        <div className="model-toolbar">
          <label>
            Find people
            <input
              aria-label="Find model people"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, title or ID"
            />
          </label>
          <label>
            Source company
            <select
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option value="">All companies</option>
              <option value="divergent">Divergent</option>
              <option value="czinger">Czinger</option>
            </select>
          </label>
          <label>
            Show
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">People and positions</option>
              <option value="contributors">Individual contributors</option>
              <option value="vacant">Open roles</option>
              <option value="draft">Draft people</option>
            </select>
          </label>
        </div>
        {session.role === "admin" && (
          <div className="model-toolbar">
            <button
              className="secondary"
              onClick={() =>
                setSelected(new Set(eligible.map((e) => e.EmployeeID)))
              }
            >
              Select {eligible.length} matching contributors
            </button>
            <label>
              Explicit assignment
              <select
                aria-label="Bulk company allocation"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
              >
                {[100, 75, 50, 25, 0].map((p) => (
                  <option key={p} value={p}>
                    Divergent {p}% / Czinger {100 - p}%
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              disabled={!selected.size || busy}
              onClick={() =>
                run(async () => {
                  await api("/model/allocations", {
                    method: "PUT",
                    body: JSON.stringify({
                      version: data.version,
                      employeeIDs: [...selected],
                      divergentPercent: Number(percent),
                    }),
                  });
                  setSelected(new Set());
                })
              }
            >
              Assign {selected.size} selected
            </button>
          </div>
        )}
        <div className="model-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Select</th>
                <th>Person / position</th>
                <th>Reports to</th>
                <th>FTE</th>
                <th>Company split</th>
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {matches.slice(page * 40, (page + 1) * 40).map((e) => (
                <tr key={e.EmployeeID}>
                  <td>
                    {session.role === "admin" &&
                      e.companyAllocation.canEdit && (
                        <input
                          type="checkbox"
                          aria-label={`Select contributor ${e.Name}`}
                          checked={selected.has(e.EmployeeID)}
                          onChange={(ev) =>
                            setSelected((old) => {
                              const next = new Set(old);
                              ev.target.checked
                                ? next.add(e.EmployeeID)
                                : next.delete(e.EmployeeID);
                              return next;
                            })
                          }
                        />
                      )}
                  </td>
                  <td>
                    <strong>{e.Name}</strong>
                    <small>{e.JobTitle}</small>
                    <small>
                      {e.EmploymentStatus === "vacant"
                        ? "OPEN ROLE"
                        : e.EmploymentStatus === "draft"
                          ? "DRAFT"
                          : e.EmploymentStatus === "inactive"
                            ? `ENDED ${e.EndDate || ""}`
                            : e.EmploymentType}
                    </small>
                  </td>
                  <td>
                    {(model.people as typeof data.employees).find(
                      (p) => p.EmployeeID === e.ManagerID,
                    )?.Name || "Top level / outside view"}
                  </td>
                  <td>
                    {e.FTE === "" ? "Not supplied" : e.FTE}
                    <small>{e.FTEBasis}</small>
                  </td>
                  <td>
                    {e.companyAllocation.status === "complete"
                      ? `${e.companyAllocation.divergentPercent}% / ${e.companyAllocation.czingerPercent}%`
                      : e.companyAllocation.status.replaceAll("-", " ")}
                    <small>
                      {e.companyAllocation.mode === "calculated"
                        ? "Calculated team"
                        : "Explicit contributor"}
                    </small>
                  </td>
                  <td>
                    {session.role === "admin" && (
                      <button
                        className="secondary"
                        onClick={() => onEdit("Employees", e)}
                      >
                        Edit person
                      </button>
                    )}
                    {e.companyAllocation.canEdit && (
                      <button
                        className="secondary"
                        onClick={() =>
                          onEdit("CompanyAllocations", {
                            EmployeeID: e.EmployeeID,
                            DivergentPercent:
                              e.companyAllocation.divergentPercent ?? "",
                          })
                        }
                      >
                        Set split
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="model-toolbar">
          <button
            className="secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>
            {matches.length} matches · Page {page + 1}
          </span>
          <button
            className="secondary"
            disabled={(page + 1) * 40 >= matches.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </section>
      <section className="model-panel">
        <h2>Executive overhead · informational model</h2>
        <p className="fine-print">
          Shares are attributed across functions within each company. They never
          change direct department costs, payroll, or consolidated totals. USD
          annual run rate, using today’s roster.
        </p>
        <div className="editor-grid">
          <label>
            Divergent company
            <select
              value={config.divergentUnit}
              onChange={(e) => change("divergentUnit", e.target.value)}
            >
              <option value="">Choose company</option>
              {companies.map((u) => (
                <option key={u.OrgUnitID} value={u.OrgUnitID}>
                  {u.OrgUnitName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Czinger company
            <select
              value={config.czingerUnit}
              onChange={(e) => change("czingerUnit", e.target.value)}
            >
              <option value="">Choose company</option>
              {companies.map((u) => (
                <option key={u.OrgUnitID} value={u.OrgUnitID}>
                  {u.OrgUnitName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Weight functions by
            <select
              value={config.weighting}
              onChange={(e) => change("weighting", e.target.value)}
            >
              <option value="contributor-fte">Contributor FTE</option>
              <option value="contributor-count">
                Contributor count (scenario)
              </option>
            </select>
          </label>
          <label>
            Contractor participation
            <select
              value={String(config.includeContractors)}
              onChange={(e) =>
                change("includeContractors", e.target.value === "true")
              }
            >
              <option value="true">Include contractor FTE</option>
              <option value="false">
                Exclude contractors from company composition and overhead
                weights
              </option>
            </select>
          </label>
          <label>
            Executive pool company split
            <select
              value={config.companySplitBasis}
              onChange={(e) => change("companySplitBasis", e.target.value)}
            >
              <option value="manual">
                Enter an informational company split
              </option>
              <option value="team-estimate">
                Use leader’s team composition as an estimate
              </option>
            </select>
          </label>
          {config.companySplitBasis === "manual" ? (
            <label>
              Divergent executive-pool percentage
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={config.divergentPercent ?? ""}
                onChange={(e) =>
                  change(
                    "divergentPercent",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
                placeholder="Not yet specified"
              />
            </label>
          ) : (
            <label>
              Leader for team estimate
              <select
                value={config.executiveLeader}
                onChange={(e) => change("executiveLeader", e.target.value)}
              >
                <option value="">Choose leader</option>
                {filled
                  .filter((e) => e.companyAllocation.mode === "calculated")
                  .map((e) => (
                    <option key={e.EmployeeID} value={e.EmployeeID}>
                      {e.Name}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </div>
        <label className="pool-selector">
          Executive pool members
          <select
            multiple
            aria-label="Executive pool members"
            value={config.executiveIDs}
            onChange={(e) =>
              change(
                "executiveIDs",
                Array.from(e.target.selectedOptions, (o) => o.value),
              )
            }
          >
            {[...filled]
              .sort((a, b) => a.Name.localeCompare(b.Name))
              .map((e) => (
                <option key={e.EmployeeID} value={e.EmployeeID}>
                  {e.Name} — {e.JobTitle}
                </option>
              ))}
          </select>
          <small>
            Selected:{" "}
            {filled
              .filter((e) => config.executiveIDs.includes(e.EmployeeID))
              .map((e) => e.Name)
              .join(", ") || "No executive pool selected"}
          </small>
          <small>
            Use Ctrl/Cmd to select multiple people. Pool members roll up
            separately at company level, outside department costs, and are
            excluded from recipient weights.
          </small>
        </label>
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api("/model", {
                method: "PUT",
                body: JSON.stringify({ version: model.version, config }),
              });
            })
          }
        >
          Save model & refresh preview
        </button>
        <div className="notice">
          Preview reflects saved settings. {preview.missingAssignments}{" "}
          contributors need company allocations; {preview.missingFTE} need FTE.
          Unmapped functions remain visible.{" "}
          {preview.pool.missingPay
            ? `${preview.pool.missingPay} executive pool members have no compensation supplied.`
            : ""}
        </div>
        <p>
          Executive pool:{" "}
          <strong>
            {config.executiveIDs.length && preview.pool.complete
              ? money(preview.pool.payroll, "USD")
              : "Compensation not available"}
          </strong>{" "}
          · Informational Divergent/Czinger split:{" "}
          {preview.companyDivergentPercent == null
            ? "Not specified"
            : `${preview.companyDivergentPercent}% / ${100 - preview.companyDivergentPercent}%`}
        </p>
        <div className="model-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Function</th>
                <th>Contributor weight</th>
                <th>Share of company pool</th>
                <th>Informational overhead</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r: RecordData) => (
                <tr key={`${r.companyID}:${r.functionID}`}>
                  <td>{r.companyName}</td>
                  <td>{r.functionName}</td>
                  <td>{r.contributorWeight.toFixed(2)}</td>
                  <td>
                    {r.sharePercent == null
                      ? "Incomplete"
                      : `${r.sharePercent}%`}
                  </td>
                  <td>
                    {r.overhead == null
                      ? "Not available"
                      : money(r.overhead, "USD")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="department-overhead">
          <summary>Department overhead breakdown</summary>
          <p className="fine-print">
            The same company pool shown by department. These are alternative
            views of one pool; do not add them to function amounts or direct
            department costs.
          </p>
          <div className="model-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Department</th>
                  <th>Contributor weight</th>
                  <th>Share of company pool</th>
                  <th>Informational overhead</th>
                </tr>
              </thead>
              <tbody>
                {preview.departmentRows.map((r: RecordData) => (
                  <tr key={`${r.companyID}:${r.departmentID}`}>
                    <td>{r.companyName}</td>
                    <td>{r.departmentName}</td>
                    <td>{r.contributorWeight.toFixed(2)}</td>
                    <td>
                      {r.sharePercent == null
                        ? "Incomplete"
                        : `${r.sharePercent}%`}
                    </td>
                    <td>
                      {r.overhead == null
                        ? "Not available"
                        : money(r.overhead, "USD")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  );
}
