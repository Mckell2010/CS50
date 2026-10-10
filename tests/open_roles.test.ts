import test from "node:test";
import assert from "node:assert/strict";
import { withoutOpenRoles, departmentFor } from "../frontend/src/openRoles.ts";
const person = (id: string, manager: string, status = "active") =>
  ({ EmployeeID: id, ManagerID: manager, EmploymentStatus: status }) as any;
test("hiding open roles reconnects occupied descendants without changing source reporting lines", () => {
  const source = [
    person("ceo", ""),
    person("open1", "ceo", "vacant"),
    person("open2", "open1", "vacant"),
    person("staff", "open2"),
    person("draft", "ceo", "draft"),
  ];
  const result = withoutOpenRoles(source);
  assert.deepEqual(
    result.map((p) => p.EmployeeID),
    ["ceo", "staff", "draft"],
  );
  assert.equal(result[1].ManagerID, "ceo");
  assert.equal(result[1].hiddenVacantManager, true);
  assert.equal(source[3].ManagerID, "open2");
});
test("vacant roots and outside-scope managers do not hide filled staff", () => {
  const result = withoutOpenRoles([
    person("open", "", "vacant"),
    person("staff", "open"),
    person("outside", "hidden"),
  ]);
  assert.equal(result[0].ManagerID, "");
  assert.equal(result[1].ManagerID, "hidden");
});
test("department grouping follows unit ancestry and does not invent missing departments", () => {
  const units = [
    { OrgUnitID: "company", UnitType: "company" },
    { OrgUnitID: "dept", UnitType: "department", ParentOrgUnitID: "company" },
    { OrgUnitID: "team", UnitType: "team", ParentOrgUnitID: "dept" },
  ] as any;
  assert.equal(departmentFor("team", units)?.OrgUnitID, "dept");
  assert.equal(departmentFor("company", units), undefined);
  assert.equal(departmentFor("missing", units), undefined);
});
