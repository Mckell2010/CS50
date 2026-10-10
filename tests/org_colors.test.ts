import test from "node:test";
import assert from "node:assert/strict";
import {
  cardColors,
  automaticColorTier,
  unitTier,
  type ColorUnit,
} from "../frontend/src/orgColors.ts";
const units: ColorUnit[] = [
  {
    OrgUnitID: "divergent",
    OrgUnitName: "Divergent",
    ParentOrgUnitID: "",
    UnitType: "company",
    Tier: "0",
  },
  {
    OrgUnitID: "czinger",
    OrgUnitName: "Czinger",
    ParentOrgUnitID: "",
    UnitType: "company",
    Tier: "0",
  },
  {
    OrgUnitID: "engineering",
    OrgUnitName: "Engineering",
    ParentOrgUnitID: "divergent",
    UnitType: "function",
    Tier: "1",
  },
  {
    OrgUnitID: "product",
    OrgUnitName: "Product",
    ParentOrgUnitID: "engineering",
    UnitType: "group",
    Tier: "2",
  },
  {
    OrgUnitID: "structures",
    OrgUnitName: "Structures",
    ParentOrgUnitID: "product",
    UnitType: "department",
    Tier: "3",
  },
  {
    OrgUnitID: "test",
    OrgUnitName: "Test",
    ParentOrgUnitID: "product",
    UnitType: "department",
    Tier: "3",
  },
  {
    OrgUnitID: "alpha",
    OrgUnitName: "Alpha",
    ParentOrgUnitID: "structures",
    UnitType: "team",
    Tier: "4",
  },
  {
    OrgUnitID: "beta",
    OrgUnitName: "Beta",
    ParentOrgUnitID: "structures",
    UnitType: "team",
    Tier: "4",
  },
];
test("company, department and team backgrounds resolve independently of reporting lines", () => {
  const companies = cardColors(units, 0),
    departments = cardColors(units, 3),
    teams = cardColors(units, 4);
  assert.equal(companies.get("alpha")!.id, "divergent");
  assert.equal(
    companies.get("alpha")!.background,
    companies.get("test")!.background,
  );
  assert.notEqual(
    companies.get("divergent")!.background,
    companies.get("czinger")!.background,
  );
  assert.equal(
    departments.get("alpha")!.background,
    departments.get("beta")!.background,
  );
  assert.notEqual(
    departments.get("alpha")!.background,
    departments.get("test")!.background,
  );
  assert.notEqual(
    teams.get("alpha")!.background,
    teams.get("beta")!.background,
  );
});
test("missing teams fall back to the known department and expose that fact", () => {
  const color = cardColors(units, 4).get("structures")!;
  assert.equal(color.id, "structures");
  assert.equal(color.tier, 3);
  assert.equal(color.fallback, true);
  assert.equal(cardColors(units, 3).get("alpha")!.fallback, false);
});
test("scoped and missing ancestry does not invent an unseen company", () => {
  const scoped = units.filter((u) =>
    ["structures", "alpha", "beta"].includes(u.OrgUnitID),
  );
  assert.equal(cardColors(scoped, 0).get("alpha")!.id, "unmapped");
  assert.equal(cardColors(scoped, 3).get("alpha")!.id, "structures");
});
test("colors stay stable across reorder, filtering and renamed labels", () => {
  const initial = cardColors(units, 3).get("alpha")!;
  const changed = cardColors(
    [...units].reverse().map((u) => ({ ...u, OrgUnitName: "Updated label" })),
    3,
  ).get("alpha")!;
  assert.equal(initial.background, changed.background);
  assert.equal(
    cardColors(
      units.filter((u) => u.OrgUnitID !== "czinger"),
      3,
    ).get("alpha")!.background,
    initial.background,
  );
});
test("auto follows expanded layers, including a focused branch, not zoom or allocations", () => {
  const records = [
    { id: "ceo", parent: "" },
    { id: "leader", parent: "ceo" },
    { id: "manager", parent: "leader" },
    { id: "contributor", parent: "manager" },
  ];
  assert.equal(automaticColorTier(records, new Set(["ceo"]), units), 0);
  assert.equal(
    automaticColorTier(records, new Set(["ceo", "leader"]), units),
    1,
  );
  assert.equal(
    automaticColorTier(records, new Set(["manager", "contributor"]), units),
    3,
  );
  const scopedUnits = units.filter((u) =>
    ["structures", "alpha"].includes(u.OrgUnitID),
  );
  assert.equal(
    automaticColorTier(
      [{ id: "manager", parent: "" }],
      new Set(["manager"]),
      scopedUnits,
    ),
    3,
  );
});
test("legacy unit types, deeper tiers and malformed cycles terminate safely", () => {
  assert.equal(unitTier({ ...units[0], Tier: "", UnitType: "group" }), 2);
  assert.equal(unitTier({ ...units[0], Tier: "7", UnitType: "subteam" }), 7);
  const malformed = units.map((u) =>
    u.OrgUnitID === "engineering" ? { ...u, ParentOrgUnitID: "alpha" } : u,
  );
  assert.equal(cardColors(malformed, 3).get("alpha")!.id, "structures");
});
