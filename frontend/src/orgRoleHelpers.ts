import type { Person, Unit } from "./types";

// Display-only connections: keep filled staff beneath vacant managers visible.
export function withoutOpenRoles(people: Person[]): Person[] {
  const byId = new Map(people.map((p) => [p.EmployeeID, p]));
  return people
    .filter((p) => p.EmploymentStatus !== "vacant")
    .map((p) => {
      let manager = p.ManagerID;
      const seen = new Set<string>();
      while (
        byId.get(manager)?.EmploymentStatus === "vacant" &&
        !seen.has(manager)
      ) {
        seen.add(manager);
        manager = byId.get(manager)!.ManagerID;
      }
      return { ...p, ManagerID: manager, hiddenVacantManager: seen.size > 0 };
    });
}

export function departmentFor(unitId: string, units: Unit[]): Unit | undefined {
  const byId = new Map(units.map((u) => [u.OrgUnitID, u]));
  let unit = byId.get(unitId);
  const seen = new Set<string>();
  while (unit && !seen.has(unit.OrgUnitID)) {
    if (unit.UnitType === "department" || String(unit.Tier) === "3")
      return unit;
    seen.add(unit.OrgUnitID);
    unit = byId.get(unit.ParentOrgUnitID);
  }
  return undefined;
}
