export type RecordData = Record<string, any>;
export type Metric = {
  headcount: number;
  fte: number;
  payroll: number | null;
  restricted?: boolean;
  missingPay?: number;
  missingFTE?: number;
  otherCurrency?: number;
  complete?: boolean;
};
export type CompanyAllocation = {
  mode: "explicit" | "calculated";
  status:
    | "complete"
    | "unassigned"
    | "incomplete"
    | "restricted"
    | "no-contributors"
    | "zero-fte"
    | "missing-fte";
  canEdit: boolean;
  contributorCount?: number;
  contributorFTE?: number;
  unassignedCount?: number;
  divergentPercent?: number | null;
  czingerPercent?: number | null;
};
export type Person = RecordData & {
  companyAllocation: CompanyAllocation;
  EmployeeID: string;
  Name: string;
  JobTitle: string;
  ManagerID: string;
  OrgUnitID: string;
  directReports: number;
  downstreamReports: number;
  metrics: Metric;
};
export type Unit = RecordData & {
  OrgUnitID: string;
  OrgUnitName: string;
  ParentOrgUnitID: string;
  UnitType: string;
  metrics: {
    total: Metric;
    direct: Metric;
    budget?: RecordData;
    envelope?: number;
    unallocated?: number;
    headroom?: number;
    directAllocation?: number;
    directHeadroom?: number;
    childEnvelopes?: number;
    missingChildBudgets?: number;
  };
};
export type Session = {
  id: string;
  role: string;
  unit: string | null;
  development: boolean;
  canImport: boolean;
  canEdit: boolean;
  canViewCompensation: boolean;
};
export type Organization = {
  demoNotes?: string[];
  employees: Person[];
  units: Unit[];
  objectives: RecordData[];
  keyResults: RecordData[];
  summary: Metric & {
    scope: string;
    aggregationPolicy: string;
    employmentCounts: { fte: number; contractor: number; unclassified: number };
  };
  version: number;
  asOf: string;
  currency: string;
  synthetic: boolean;
  rootEmployee: string;
};
export async function api(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const { accessToken } = await import("./auth");
  const token = await accessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch("/api" + path, { ...options, headers });
  const data = await response.json();
  if (!response.ok) {
    const detail = data.detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : detail?.message +
            (detail?.errors
              ? " — " +
                detail.errors
                  .slice(0, 3)
                  .map((e: RecordData) => `${e.field}: ${e.message}`)
                  .join("; ")
              : "") || "Request failed",
    );
  }
  return data;
}
export function money(
  value: number | null | undefined,
  currency = "USD",
  compact = false,
) {
  return value == null
    ? "Restricted"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: compact ? 1 : 0,
        notation: compact ? "compact" : "standard",
      }).format(value);
}
export function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
}
