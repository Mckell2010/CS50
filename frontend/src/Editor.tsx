import { useState } from "react";
import { X, Check, AlertTriangle } from "lucide-react";
import { api, type Organization, type RecordData } from "./types";
export const FIELDS: Record<string, string[]> = {
  OrganizationalUnits: [
    "OrgUnitID",
    "OrgUnitName",
    "ParentOrgUnitID",
    "UnitType",
    "OwnerEmployeeID",
  ],
  Budgets: [
    "BudgetID",
    "OrgUnitID",
    "BudgetYear",
    "Currency",
    "ApprovedEnvelope",
    "DirectAllocation",
  ],
  Objectives: [
    "ObjectiveID",
    "OrgUnitID",
    "OwnerEmployeeID",
    "ParentObjectiveID",
    "ObjectiveText",
    "PeriodStart",
    "PeriodEnd",
    "Status",
  ],
  KeyResults: [
    "KeyResultID",
    "ObjectiveID",
    "OwnerEmployeeID",
    "MetricName",
    "Unit",
    "Baseline",
    "CurrentValue",
    "TargetValue",
    "Direction",
    "LastUpdated",
  ],
};
const TITLES: Record<string, string> = {
  OrganizationalUnits: "Organizational unit",
  Budgets: "Budget allocation",
  Objectives: "Objective",
  KeyResults: "Key result",
};
const label = (s: string) =>
  s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace("ID", " ID")
    .replace(/\s+/g, " ");
export default function Editor({
  sheet,
  record,
  data,
  onClose,
  onSaved,
}: {
  sheet: string;
  record: RecordData;
  data: Organization;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<RecordData>(record),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        `/planning/${sheet}/${encodeURIComponent(form[FIELDS[sheet][0]])}`,
        {
          method: "PUT",
          body: JSON.stringify({ version: data.version, record: form }),
        },
      );
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">ORGANIZATIONAL PLANNING</span>
            <h2 id="editor-title">{TITLES[sheet]}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close editor"
          >
            <X />
          </button>
        </header>
        <div className="modal-body">
          {error && (
            <div className="notice error" role="alert">
              <AlertTriangle />
              {error}
            </div>
          )}
          <div className="editor-grid">
            {FIELDS[sheet].map((field, i) => {
              let options: { value: string; label: string }[] | undefined;
              if (
                (field === "OrgUnitID" && sheet !== "OrganizationalUnits") ||
                field === "ParentOrgUnitID"
              )
                options = data.units.map((u) => ({
                  value: u.OrgUnitID,
                  label: u.OrgUnitName,
                }));
              if (field === "OwnerEmployeeID")
                options = data.employees.map((e) => ({
                  value: e.EmployeeID,
                  label: e.Name,
                }));
              if (
                (field === "ObjectiveID" && sheet === "KeyResults") ||
                field === "ParentObjectiveID"
              )
                options = data.objectives
                  .filter((o) => o.ObjectiveID !== form.ObjectiveID)
                  .map((o) => ({
                    value: o.ObjectiveID,
                    label: o.ObjectiveText,
                  }));
              if (field === "UnitType")
                options = [
                  "subdepartment",
                  "department",
                  "group",
                  "company",
                ].map((value) => ({ value, label: value }));
              if (field === "Status")
                options = [
                  "on-track",
                  "at-risk",
                  "off-track",
                  "complete",
                  "not-started",
                ].map((value) => ({ value, label: value }));
              if (field === "Direction")
                options = ["increase", "decrease"].map((value) => ({
                  value,
                  label: value,
                }));
              if (field === "Currency")
                options = [
                  "USD",
                  "EUR",
                  "GBP",
                  "CAD",
                  "JPY",
                  "AUD",
                  "CHF",
                  "CNY",
                  "INR",
                ].map((value) => ({ value, label: value }));
              const props = {
                "aria-label": label(field),
                value: form[field] ?? "",
                onChange: (
                  e: React.ChangeEvent<
                    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
                  >,
                ) => setForm((f) => ({ ...f, [field]: e.target.value })),
              };
              return (
                <label
                  key={field}
                  className={field === "ObjectiveText" ? "full-width" : ""}
                >
                  {label(field)}
                  {options ? (
                    <select {...props}>
                      <option value="">Select…</option>
                      {options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : field === "ObjectiveText" ? (
                    <textarea {...props} required rows={3} />
                  ) : (
                    <input
                      {...props}
                      readOnly={i === 0}
                      type={
                        ["PeriodStart", "PeriodEnd", "LastUpdated"].includes(
                          field,
                        )
                          ? "date"
                          : [
                                "BudgetYear",
                                "ApprovedEnvelope",
                                "DirectAllocation",
                                "Baseline",
                                "CurrentValue",
                                "TargetValue",
                              ].includes(field)
                            ? "number"
                            : "text"
                      }
                      step="any"
                      required={
                        i === 0 || ["OrgUnitName", "MetricName"].includes(field)
                      }
                    />
                  )}
                </label>
              );
            })}
          </div>
          <p className="fine-print">
            Saved planning records become app-owned and survive future Excel
            imports. Every edit is recorded in the audit history.
          </p>
          {sheet === "Budgets" && (
            <p className="notice">
              The envelope includes this unit and descendants. Direct allocation
              reserves money for people assigned directly to this unit. Owners
              cannot increase their finance-approved envelope.
            </p>
          )}
          <div className="form-actions">
            <button className="secondary" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              <Check size={16} />
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
