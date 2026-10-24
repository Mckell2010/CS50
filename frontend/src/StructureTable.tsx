import { useState } from "react";
import { api, type Organization, type Unit, type RecordData, type Session } from "./types";

export default function StructureTable({data, session, units, onSaved, onView}: {
  data: Organization; session: Session; units: Unit[]; onSaved: () => void; onView: (id: string) => void;
}) {
  const [draft, setDraft] = useState<RecordData | null>(null);
  const [version, setVersion] = useState(data.version);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (field: string, value: string) => setDraft(d => ({...d, [field]: value,
    ...(field === "Tier" ? {UnitType: ["corporate", "function", "group", "department", "team"][Number(value)] || "subteam"} : {}),
    ...(field === "DepartmentOwner" ? {OwnerEmployeeID: ""} : {}),
  }));
  const save = async () => {
    if (!draft) return;
    setBusy(true); setError("");
    try {
      const owners = data.employees.filter(p => p.Name.trim().toLowerCase() === String(draft.DepartmentOwner || "").trim().toLowerCase());
      const record = {...draft, OwnerEmployeeID: draft.OwnerEmployeeID || (owners.length === 1 ? owners[0].EmployeeID : "")};
      await api(`/planning/OrganizationalUnits/${encodeURIComponent(draft.OrgUnitID)}`, {method:"PUT", body: JSON.stringify({version, record})});
      setDraft(null); onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const input = (field: string, unit: Unit) => <input aria-label={`${field} for ${unit.OrgUnitID}`} value={draft?.[field] ?? ""} onChange={e => set(field,e.target.value)} type={field === "Tier" ? "number" : "text"} min={field === "Tier" ? 0 : undefined} disabled={busy} />;
  return <section aria-label="Editable structure table">
    <p className="notice">Each row is one organizational unit. Save a row to update the viewer, budgets and objectives together. Department IDs stay stable; change Parent ID to move a branch.</p>
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="table-scroll"><table className="structure-table"><thead><tr>{["Department ID","Parent ID","Department Title","Department Owner","Department Purpose","Tier","Entity","Actions"].map(h=><th key={h}>{h}</th>)}</tr></thead>
    <tbody>{units.map(unit => {
      const editing = draft?.OrgUnitID === unit.OrgUnitID;
      return <tr key={unit.OrgUnitID} data-structure-table-unit={unit.OrgUnitID}>
        <td><button className="text-button" onClick={()=>onView(unit.OrgUnitID)}>{unit.DepartmentCode || unit.OrgUnitID}</button></td>
        <td>{editing ? <select aria-label={`Parent ID for ${unit.OrgUnitID}`} value={draft.ParentOrgUnitID || ""} disabled={busy} onChange={e=>set("ParentOrgUnitID",e.target.value)}><option value="">No parent (Corporate root)</option>{data.units.filter(u=>u.OrgUnitID!==unit.OrgUnitID).map(u=><option value={u.OrgUnitID} key={u.OrgUnitID}>{u.DepartmentCode || u.OrgUnitID} · {u.OrgUnitName}</option>)}</select> : unit.ParentOrgUnitID || "—"}</td>
        <td>{editing ? input("OrgUnitName",unit) : unit.OrgUnitName}</td>
        <td>{editing ? input("DepartmentOwner",unit) : unit.DepartmentOwner || data.employees.find(p=>p.EmployeeID===unit.OwnerEmployeeID)?.Name || "Unassigned"}</td>
        <td>{editing ? <textarea aria-label={`DepartmentPurpose for ${unit.OrgUnitID}`} value={draft.DepartmentPurpose || ""} onChange={e=>set("DepartmentPurpose",e.target.value)} disabled={busy}/> : unit.DepartmentPurpose || "—"}</td>
        <td>{editing ? input("Tier",unit) : unit.Tier ?? "—"}</td>
        <td>{editing ? <select aria-label={`Entity for ${unit.OrgUnitID}`} value={draft.Entity || "both"} onChange={e=>set("Entity",e.target.value)} disabled={busy}><option value="both">Both</option><option value="divergent">Divergent</option><option value="czinger">Czinger Vehicles</option></select> : unit.Entity === "czinger" ? "Czinger Vehicles" : unit.Entity === "divergent" ? "Divergent" : "Both"}</td>
        <td>{editing ? <div className="inline-actions"><button className="primary" onClick={save} disabled={busy}>Save row</button><button className="secondary" onClick={()=>{setDraft(null);setError("");}} disabled={busy}>Cancel</button></div> : session.canEdit && <button className="text-button" disabled={!!draft} onClick={()=>{setDraft({...unit,DepartmentOwner:unit.DepartmentOwner || data.employees.find(p=>p.EmployeeID===unit.OwnerEmployeeID)?.Name || ""});setVersion(data.version);setError("");}}>Edit row</button>}</td>
      </tr>;
    })}</tbody></table></div>
  </section>;
}
