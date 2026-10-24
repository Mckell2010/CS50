import { useState } from "react";
import { X, Check, AlertTriangle } from "lucide-react";
import { api, money, type Organization, type RecordData } from "./types";
import { unitTier } from "./orgColors";
const LOCATION_OPTIONS = [
  "Los Angeles - HQ",
  "Los Angeles - LB",
  "Washington DC",
  "Remote",
];
export const FIELDS: Record<string, string[]> = {
  Employees: [
    "EmployeeID",
    "Name",
    "JobTitle",
    "ManagerID",
    "OrgUnitID",
    "EmploymentStatus",
    "FTE",
    "StartDate",
    "EndDate",
    "EmploymentType",
    "ExemptionStatus",
    "Location",
    "SourceCompany",
    "FTEBasis",
  ],
  Compensation: [
    "EmployeeID",
    "EffectiveFrom",
    "EffectiveTo",
    "Currency",
    "AnnualBasePay",
    "AnnualTargetBonus",
    "HourlyRate",
    "AnnualHours",
    "MonthlyRate",
  ],
  CompanyAllocations: ["EmployeeID", "DivergentPercent"],
  OrganizationalUnits: [
    "OrgUnitID",
    "OrgUnitName",
    "ParentOrgUnitID",
    "UnitType",
    "OwnerEmployeeID",
    "Tier",
    "DepartmentCode",
    "DepartmentOwner",
    "DepartmentPurpose",
    "Entity",
  ],
  Budgets: [
    "BudgetID",
    "OrgUnitID",
    "BudgetYear",
    "Currency",
    "ApprovedEnvelope",
    "DirectPercent",
    "AllocationPercent",
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
  Employees: "Person / position",
  Compensation: "Compensation",
  CompanyAllocations: "Contributor company allocation",
  OrganizationalUnits: "Organizational unit",
  Budgets: "Budget allocation",
  Objectives: "Objective",
  KeyResults: "Key result",
};
const label = (s: string) =>
  (
    ({
      AnnualBasePay: "Annual salary",
      AnnualTargetBonus: "Annual bonus",
      AnnualHours: "Expected annual hours",
      ExemptionStatus: "FTE classification",
      AllocationPercent: "Share of parent budget (%)",
      DirectPercent: "Reserved for direct employees (%)",
    })[s] || s
  )
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
  const [form, setForm] = useState<RecordData>(sheet === "Employees" ? {...record, ManagerID: record.StoredManagerID ?? record.ManagerID} : record),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const budgetUnit = data.units.find((u) => u.OrgUnitID === form.OrgUnitID);
  const budgetParent = data.units.find(
    (u) => u.OrgUnitID === budgetUnit?.ParentOrgUnitID,
  );
  const isChildBudget =
    !!budgetUnit?.ParentOrgUnitID && budgetUnit.UnitType !== "company";
  const matchingPeriod =
    String(form.BudgetYear) === data.asOf.slice(0, 4) &&
    form.Currency === data.currency;
  const parentAmount = matchingPeriod
    ? budgetParent?.metrics.envelope
    : undefined;
  const budgetPreview = isChildBudget
    ? parentAmount != null && form.AllocationPercent !== ""
      ? (parentAmount * Number(form.AllocationPercent)) / 100
      : undefined
    : form.AllocationPercent
      ? budgetUnit?.metrics.envelope
      : Number(form.ApprovedEnvelope || 0);
  const parentReserved = budgetParent?.metrics.directAllocation || 0;
  const siblingAmount = data.units
    .filter(
      (u) =>
        u.ParentOrgUnitID === budgetUnit?.ParentOrgUnitID &&
        u.OrgUnitID !== form.OrgUnitID,
    )
    .reduce((sum, u) => sum + (u.metrics.envelope || 0), 0);
  const remaining =
    isChildBudget && parentAmount != null && budgetPreview != null
      ? parentAmount - parentReserved - siblingAmount - budgetPreview
      : undefined;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        `/planning/${sheet}/${encodeURIComponent(sheet === "Compensation" ? `${form.EmployeeID}@${form.EffectiveFrom}` : form[FIELDS[sheet][0]])}`,
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
          {sheet === "Budgets" && (
            <div className="notice budget-percentage-preview">
              <strong>{budgetUnit?.OrgUnitName}</strong>
              <p>
                {isChildBudget
                  ? "Set the percentage of the immediate parent budget. The resulting dollars and percentage-based descendants update when the parent changes."
                  : "Set the Corporate payroll budget in dollars. Lower tiers receive percentages of their immediate parent."}
              </p>
              {isChildBudget && (
                <p>
                  Parent budget:{" "}
                  {parentAmount == null
                    ? "Select a period with a saved parent budget"
                    : money(parentAmount, form.Currency)}
                </p>
              )}
              <p aria-live="polite">
                Resulting budget:{" "}
                <strong>
                  {budgetPreview == null
                    ? "Enter a percentage"
                    : money(budgetPreview, form.Currency)}
                </strong>
              </p>
              {budgetPreview != null && (
                <p>
                  Direct employee reserve:{" "}
                  {money(
                    (budgetPreview * Number(form.DirectPercent || 0)) / 100,
                    form.Currency,
                  )}
                </p>
              )}
              {remaining != null && (
                <p className={remaining < -0.005 ? "stale" : ""}>
                  {remaining < -0.005
                    ? `Parent over-allocated by ${money(-remaining, form.Currency)}. Reduce this share or another allocation.`
                    : `Parent remaining after this change: ${money(remaining, form.Currency)}`}
                </p>
              )}
              <small>
                Existing fixed budgets convert to their current percentages
                where possible when you save. Zero or missing parent amounts
                need an explicit percentage. Final amounts reconcile to cents
                across siblings.
              </small>
            </div>
          )}
          {sheet === "OrganizationalUnits" && (
            <p className="notice">
              Parent Org Unit places this unit in the budget hierarchy; it does
              not change anyone’s reporting manager. Use Tier 0 for companies, 1
              functions, 2 groups, 3 departments, 4 teams, and 5 or deeper for
              subteams. Department Code identifies the department independently
              of its name.
              {record.ParentOrgUnitID !== form.ParentOrgUnitID &&
                " Moving this unit moves its full subtree. Existing budgets and OKRs stay with their units; review budget envelopes and objective alignment after the move."}
            </p>
          )}
          {sheet === "CompanyAllocations" && (
            <p className="notice">
              {
                data.employees.find((e) => e.EmployeeID === form.EmployeeID)
                  ?.Name
              }{" "}
              · Individual contributor. This assignment updates the calculated
              team composition of every manager above them.
            </p>
          )}
          {sheet === "Compensation" && (
            <p className="notice">
              {form.PayBasis === "hourly"
                ? "Non-exempt FTE · Hourly rate × expected annual hours. Hours default to 2,080; edit them for the actual schedule. Overtime is not included."
                : form.PayBasis === "monthly"
                  ? "Contractor · Monthly rate × 12 for annual payroll."
                  : "Exempt FTE · Annual salary plus annual bonus."}
              {Number(form.AnnualEmployerCosts) > 0 &&
                ` Existing annual employer costs (${form.Currency} ${form.AnnualEmployerCosts}) are retained separately.`}{" "}
              Pay amounts are not multiplied by the FTE allocation again.
              Effective periods cannot overlap.
            </p>
          )}
          <div className="editor-grid">
            {FIELDS[sheet].map((field, i) => {
              if (
                sheet === "Budgets" &&
                ((field === "ApprovedEnvelope" && isChildBudget) ||
                  (field === "AllocationPercent" && !isChildBudget))
              )
                return null;
              if (field === "ExemptionStatus" && form.EmploymentType !== "FTE")
                return null;
              if (
                sheet === "Compensation" &&
                ((["AnnualBasePay", "AnnualTargetBonus"].includes(field) &&
                  form.PayBasis !== "salary") ||
                  (["HourlyRate", "AnnualHours"].includes(field) &&
                    form.PayBasis !== "hourly") ||
                  (field === "MonthlyRate" && form.PayBasis !== "monthly"))
              )
                return null;
              let options: { value: string; label: string }[] | undefined;
              if (
                (field === "OrgUnitID" && sheet !== "OrganizationalUnits") ||
                field === "ParentOrgUnitID"
              )
                options = data.units.map((u) => ({
                  value: u.OrgUnitID,
                  label: u.OrgUnitName,
                }));
              if (field === "OwnerEmployeeID" || field === "ManagerID")
                options = data.employees.map((e) => ({
                  value: e.EmployeeID,
                  label: e.Name,
                }));
              if (
                (field === "ObjectiveID" && sheet === "KeyResults") ||
                field === "ParentObjectiveID"
              )
                options = data.objectives
                  .filter((o) => {
                    if (o.ObjectiveID === form.ObjectiveID) return false;
                    if (field !== "ParentObjectiveID") return true;
                    const unit = data.units.find(
                      (u) => u.OrgUnitID === form.OrgUnitID,
                    );
                    return (
                      o.ObjectiveID === form.ParentObjectiveID ||
                      (unit?.ParentOrgUnitID
                        ? o.OrgUnitID === unit.ParentOrgUnitID
                        : !["company", "corporate"].includes(unit?.UnitType || "") && o.readOnly)
                    );
                  })
                  .map((o) => ({
                    value: o.ObjectiveID,
                    label: o.ObjectiveText,
                  }));
              if (field === "DivergentPercent")
                options = [100, 75, 50, 25, 0].map((value) => ({
                  value: String(value),
                  label: `Divergent ${value}% / Czinger ${100 - value}%`,
                }));
              if (field === "UnitType")
                options = [
                  "corporate",
                  "company",
                  "function",
                  "group",
                  "department",
                  "team",
                  "subteam",
                  "subdepartment",
                ].map((value) => ({ value, label: value }));
              if (field === "EmploymentStatus")
                options = [
                  "active",
                  "leave",
                  "inactive",
                  "vacant",
                  "draft",
                ].map((value) => ({ value, label: value }));
              if (field === "EmploymentType")
                options = ["FTE", "Contractor"].map((value) => ({
                  value,
                  label: value,
                }));
              if (field === "ExemptionStatus")
                options = [
                  { value: "exempt", label: "Exempt" },
                  { value: "non-exempt", label: "Non-exempt" },
                ];
              if (field === "Location")
                options = LOCATION_OPTIONS.map((value) => ({
                  value,
                  label: value,
                }));
              if (field === "Entity")
                options = [{value:"both",label:"Both"},{value:"divergent",label:"Divergent"},{value:"czinger",label:"Czinger Vehicles"}];
              if (field === "SourceCompany")
                options = ["divergent", "czinger"].map((value) => ({
                  value,
                  label: value,
                }));
              if (options && form[field] && !options.some(o => o.value === form[field]))
                options.push({value: form[field], label: `${form[field]} (outside selected view)`});
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
                value:
                  (field === "Location" &&
                    !LOCATION_OPTIONS.includes(form[field])) ||
                  (field === "EmploymentType" &&
                    !["FTE", "Contractor"].includes(form[field]))
                    ? ""
                    : (form[field] ?? ""),
                onChange: (
                  e: React.ChangeEvent<
                    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
                  >,
                ) =>
                  setForm((f) => ({
                    ...f,
                    [field]: e.target.value,
                    ...(field === "DepartmentOwner" ? {OwnerEmployeeID: ""} : {}),
                    ...(field === "OwnerEmployeeID" && sheet === "OrganizationalUnits" ? {DepartmentOwner: data.employees.find(p => p.EmployeeID === e.target.value)?.Name || ""} : {}),
                    ...(field === "EmploymentType"
                      ? { ExemptionStatus: "" }
                      : {}),
                    ...(sheet === "OrganizationalUnits" && field === "UnitType"
                      ? {
                          Tier: String(
                            (
                              {
                                corporate: 0,
                                company: 0,
                                function: 1,
                                group: 2,
                                department: 3,
                                team: 4,
                                subdepartment: 4,
                              } as Record<string, number>
                            )[e.target.value] ??
                              Math.max(
                                5,
                                (unitTier(
                                  data.units.find(
                                    (u) => u.OrgUnitID === f.ParentOrgUnitID,
                                  ) || ({ UnitType: "company" } as any),
                                ) ?? 0) + 1,
                              ),
                          ),
                        }
                      : {}),
                    ...(sheet === "Objectives" && field === "OrgUnitID"
                      ? { ParentObjectiveID: "" }
                      : {}),
                    ...(field === "FTE"
                      ? { FTEBasis: "Manually entered" }
                      : {}),
                  })),
              };
              return (
                <label
                  key={field}
                  className={field === "ObjectiveText" ? "full-width" : ""}
                >
                  {label(field)}
                  {field === "Location" &&
                    form.Location &&
                    !LOCATION_OPTIONS.includes(form.Location) && (
                      <small>
                        Saved location: {form.Location}. Choose one of the
                        listed locations to replace it.
                      </small>
                    )}
                  {field === "EmploymentType" &&
                    form.EmploymentType &&
                    !["FTE", "Contractor"].includes(form.EmploymentType) && (
                      <small>
                        Imported type: {form.EmploymentType}. Choose FTE or
                        Contractor to classify compensation.
                      </small>
                    )}
                  {options ? (
                    <select
                      {...props}
                      required={
                        field === "DivergentPercent" ||
                        field === "ExemptionStatus" ||
                        (field === "Currency" && sheet === "Compensation") ||
                        (field === "EmploymentType" && !record.EmploymentType)
                      }
                    >
                      <option value="">Select…</option>
                      {options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : ["ObjectiveText", "DepartmentPurpose"].includes(field) ? (
                    <textarea {...props} required={field === "ObjectiveText"} rows={3} />
                  ) : (
                    <input
                      {...props}
                      readOnly={
                        (sheet === "Budgets" &&
                          field === "ApprovedEnvelope" &&
                          !!form.AllocationPercent &&
                          !isChildBudget) ||
                        i === 0 ||
                        (sheet === "Compensation" &&
                          field === "EffectiveFrom" &&
                          !!record.existing)
                      }
                      type={
                        [
                          "PeriodStart",
                          "PeriodEnd",
                          "LastUpdated",
                          "StartDate",
                          "EndDate",
                          "EffectiveFrom",
                          "EffectiveTo",
                        ].includes(field)
                          ? "date"
                          : [
                                "FTE",
                                "AnnualBasePay",
                                "AnnualTargetBonus",
                                "HourlyRate",
                                "AnnualHours",
                                "MonthlyRate",
                                "Tier",
                                "BudgetYear",
                                "ApprovedEnvelope",
                                "DirectPercent",
                                "AllocationPercent",
                                "Baseline",
                                "CurrentValue",
                                "TargetValue",
                              ].includes(field)
                            ? "number"
                            : "text"
                      }
                      step={field === "Tier" ? "1" : "any"}
                      max={
                        ["AllocationPercent", "DirectPercent"].includes(field)
                          ? 100
                          : undefined
                      }
                      min={
                        field === "Tier" ||
                        sheet === "Compensation" ||
                        sheet === "Budgets"
                          ? 0
                          : undefined
                      }
                      required={
                        (sheet === "Budgets" &&
                          [
                            "ApprovedEnvelope",
                            "AllocationPercent",
                            "DirectPercent",
                          ].includes(field)) ||
                        i === 0 ||
                        ["OrgUnitName", "MetricName"].includes(field) ||
                        (sheet === "Compensation" && field !== "EffectiveTo")
                      }
                    />
                  )}
                </label>
              );
            })}
          </div>
          {sheet === "OrganizationalUnits" && (
            <p className="fine-print">
              Tier 0: Corporate · 1: function · 2: group · 3: department · 4: team
              · 5+: subteam. Leave Tier blank for existing units awaiting
              classification. Department codes are text and may repeat across
              companies.
            </p>
          )}
          <p className="fine-print">
            Saved planning records become app-owned and survive future Excel
            imports. Every edit is recorded in the audit history.
          </p>
          {sheet === "Budgets" && (
            <p className="notice">
              The budget includes this unit and descendants. The direct reserve
              percentage reserves money for people assigned directly to this
              unit. Owners cannot increase their finance-approved envelope.
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
