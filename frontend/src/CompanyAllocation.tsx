import type { CompanyAllocation } from "./types";

export default function CompanyAllocationView({
  allocation,
  compact = false,
}: {
  allocation: CompanyAllocation;
  compact?: boolean;
}) {
  const a = allocation;
  const calculated = a.mode === "calculated";
  const text =
    a.status === "complete"
      ? `Divergent ${a.divergentPercent}% · Czinger ${a.czingerPercent}%`
      : a.status === "restricted"
        ? "Team allocation outside your scope"
        : a.status === "incomplete"
          ? `${a.unassignedCount} contributor allocation${a.unassignedCount === 1 ? "" : "s"} missing`
          : a.status === "no-contributors"
            ? "No active individual contributors"
            : a.status === "missing-fte"
              ? "Contributor FTE is missing"
              : a.status === "zero-fte"
                ? "No contributor FTE to weight"
                : "Company allocation not set";
  return (
    <div
      className={`company-allocation ${compact ? "compact" : ""}`}
      title={`${calculated ? "Calculated team composition" : "Explicit contributor allocation"}: ${text}`}
    >
      <span className="allocation-label">{text}</span>
      {a.status === "complete" && (
        <div className="allocation-bar" aria-hidden="true">
          <span
            className="allocation-divergent"
            style={{ width: `${a.divergentPercent}%` }}
          />
          <span
            className="allocation-czinger"
            style={{ width: `${a.czingerPercent}%` }}
          />
        </div>
      )}
      {!compact && (
        <p className="fine-print">
          {calculated
            ? "Calculated from all downstream individual contributors, weighted by FTE. Team composition only; the manager’s own FTE and payroll are not allocated."
            : "Explicitly assigned to this contributor. Czinger receives the remainder of the Divergent percentage."}
          {calculated &&
            a.status !== "restricted" &&
            ` ${a.contributorCount} contributors · ${a.contributorFTE} FTE.`}
        </p>
      )}
    </div>
  );
}
