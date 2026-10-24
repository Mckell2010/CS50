/** Card backgrounds follow unit ancestry, independently of reporting lines or allocations. */
export type ColorUnit = {
  OrgUnitID: string;
  OrgUnitName: string;
  ParentOrgUnitID: string;
  UnitType: string;
  Tier?: string | number;
};
export const tierNames: Record<number, string> = {
  0: "Corporate",
  1: "Function",
  2: "Group",
  3: "Department",
  4: "Team",
  5: "Subteam",
};
export function unitTier(unit: ColorUnit): number | undefined {
  if (unit.Tier !== undefined && unit.Tier !== "") {
    const value = Number(unit.Tier);
    if (Number.isInteger(value) && value >= 0) return value;
  }
  return (
    {
      corporate: 0,
      company: 0,
      function: 1,
      group: 2,
      department: 3,
      team: 4,
      subteam: 5,
      subdepartment: 4,
    } as Record<string, number>
  )[unit.UnitType];
}
export function tierName(tier: number): string {
  return tierNames[tier] || `Level ${tier}`;
}
export type CardColor = {
  id: string;
  label: string;
  background: string;
  accent: string;
  tier?: number;
  fallback: boolean;
};
function palette(id: string): { background: string; accent: string } {
  // Full-ID hash: stable across filtering, expansion, company splits and reloads.
  let hash = 2166136261;
  for (const ch of id)
    hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  const hue = hash % 360;
  return { background: `hsl(${hue} 52% 89%)`, accent: `hsl(${hue} 40% 32%)` };
}
export function cardColors(
  units: ColorUnit[],
  targetTier: number,
): Map<string, CardColor> {
  const byID = new Map(units.map((u) => [u.OrgUnitID, u]));
  const result = new Map<string, CardColor>();
  for (const source of units) {
    let unit: ColorUnit | undefined = source;
    let best: ColorUnit | undefined;
    const seen = new Set<string>();
    while (unit && !seen.has(unit.OrgUnitID)) {
      seen.add(unit.OrgUnitID);
      const tier = unitTier(unit);
      if (
        tier !== undefined &&
        tier <= targetTier &&
        (!best || tier > unitTier(best)!)
      )
        best = unit;
      unit = byID.get(unit.ParentOrgUnitID);
    }
    result.set(
      source.OrgUnitID,
      best
        ? {
            id: best.OrgUnitID,
            label: best.OrgUnitName,
            ...palette(best.OrgUnitID),
            tier: unitTier(best),
            fallback: unitTier(best) !== targetTier,
          }
        : {
            id: "unmapped",
            label: "No assignment at this tier",
            background: "#eeeeec",
            accent: "#686868",
            fallback: true,
          },
    );
  }
  return result;
}
export function automaticColorTier(
  records: { id: string; parent: string }[],
  visible: Set<string>,
  units: ColorUnit[],
): number {
  const ids = new Set(records.map((r) => r.id));
  const children = new Map<string, string[]>();
  for (const r of records)
    children.set(r.parent, [...(children.get(r.parent) || []), r.id]);
  const queue = records
    .filter((r) => !r.parent || !ids.has(r.parent))
    .map((r) => ({ id: r.id, depth: 0 }));
  let depth = 0;
  const seen = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    if (visible.has(current.id)) depth = Math.max(depth, current.depth);
    for (const child of children.get(current.id) || [])
      queue.push({ id: child, depth: current.depth + 1 });
  }
  const tiers = units.map(unitTier).filter((t): t is number => t !== undefined);
  return Math.min(
    Math.max(5, ...tiers),
    (tiers.length ? Math.min(...tiers) : 0) + depth,
  );
}
