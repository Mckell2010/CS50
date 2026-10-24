import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Exercise the exact offline HTML implementation with synthetic records only.
const html = readFileSync(new URL('../prototypes/org-chart.html', import.meta.url), 'utf8');
const section = (start, end) => html.slice(html.indexOf(start), html.indexOf(end));
const { buildHeadcounts, buildReports, filterHeadcounts, visibleCompanyUnits } = runInNewContext(
  section('function departmentCode(', 'function setStatus(') +
  section('function buildHeadcounts(', 'function updatePeopleSummary(') +
  section('function suggestDepartment(', 'function unitIcon(') +
  ';({buildHeadcounts, buildReports, filterHeadcounts, visibleCompanyUnits});'
);
const unit = (id, parent, name = id, code = id) => ({ id, parent, name, code });
const person = (n, department, extra = {}) => ({
  name: `Example Person ${n}`, company: 'DTI', companyId: `DTI${n}`,
  positionId: `POS${n}`, status: 'Active', department, title: 'Example role',
  sourceRow: n + 3, ...extra,
});
const roster = rows => ({ available: true, rows });

test('rollups conserve 2 direct plus three child teams of 5, including nested levels', () => {
  const units = [unit('root', ''), unit('1000', 'root'), unit('1100', '1000'), unit('1200', '1000'), unit('1300', '1000')];
  const rows = Array.from({ length: 17 }, (_, i) => person(i, i < 2 ? '1000' : i < 7 ? '1100' : i < 12 ? '1200' : '1300'));
  const result = buildHeadcounts(units, roster(rows));
  assert.equal(result.counts.get('1000').direct.length, 2);
  assert.equal(result.counts.get('1000').all.length, 17);
  assert.equal(result.counts.get('root').all.length, 17);
  for (const code of ['1100', '1200', '1300']) assert.equal(result.counts.get(code).all.length, 5);
  assert.equal([...result.counts.values()].reduce((n, c) => n + c.direct.length, 0), 17);
});

test('includes active contractors, excludes non-current positions, and never counts an owner field', () => {
  const root = { ...unit('root', ''), owner: 'Example Owner' };
  const result = buildHeadcounts([root], roster([
    person(1, 'root', { employmentType: '1099 Contractor' }),
    person(2, 'root', { status: 'Inactive' }),
    person(3, 'root', { status: 'Approved' }),
    person(4, 'root', { status: 'Filled' }),
    person(5, 'root', { name: '' }),
  ]));
  assert.equal(result.people.length, 1);
  assert.equal(result.counts.get('root').all.length, 1);
});

test('deduplicates repeated identified people, preserves distinct names with placeholder IDs, and isolates conflicts', () => {
  const units = [unit('root', ''), unit('a', 'root'), unit('b', 'root')];
  const rows = [person(1, 'a'), person(1, 'a'), person(2, 'a', { companyId: 'DTI' }), person(3, 'a', { companyId: 'DTI' }), person(4, 'a'), person(4, 'b')];
  const result = buildHeadcounts(units, roster(rows));
  assert.equal(result.people.length, 4);
  assert.equal(result.counts.get('root').all.length, 3);
  assert.equal(result.unassigned.length, 1);
  assert.match(result.unassigned[0].reason, /Conflicting/);
});

test('title suggestions use current unit names and company context rather than hard-coded department numbers', () => {
  const units = [unit('root', ''), unit('supply', 'root', 'Supply Chain'), unit('new-dti', 'supply', 'Divergent Procurement'), unit('new-czv', 'supply', 'Czinger Procurement')];
  const rows = [person(1, '', { title: 'Senior Buyer' }), person(2, '', { title: 'Senior Buyer', company: 'CZV' }), person(3, 'new-dti', { title: 'Senior Buyer', company: 'CZV' })];
  const result = buildHeadcounts(units, roster(rows), { suggest: true });
  assert.equal(result.people[0].unitId, 'new-dti');
  assert.equal(result.people[1].unitId, 'new-czv');
  assert.equal(result.people[2].unitId, 'new-dti');
  assert.equal(result.people[2].source, 'workbook');
  assert.equal(result.people[0].source, 'suggested');
});

test('duplicate source department codes are not guessed; distinct inferred titles can resolve separate units', () => {
  const units = [unit('root', ''), unit('am-row', 'root', 'AM Development', '2340'), unit('it-row', 'root', 'Infrastructure', '2340')];
  const result = buildHeadcounts(units, roster([
    person(1, '2340', { title: 'AM Development Engineer' }),
    person(2, '', { title: 'AM Development Engineer' }),
    person(3, '', { title: 'Senior Network Engineer' }),
  ]), { suggest: true });
  assert.equal(result.unassigned.length, 1);
  assert.equal(result.counts.get('am-row').all.length, 1);
  assert.equal(result.counts.get('it-row').all.length, 1);
});

test('turning estimates off and explicitly clearing a reviewed assignment restores unassigned counts', () => {
  const units = [unit('root', ''), unit('am', 'root', 'AM Development')];
  const rows = roster([person(1, '', { title: 'AM Development Engineer' })]);
  const estimated = buildHeadcounts(units, rows, { suggest: true });
  const withoutEstimates = buildHeadcounts(units, rows, { suggest: false });
  assert.equal(estimated.counts.get('root').all.length, 1);
  assert.equal(withoutEstimates.counts.get('root').all.length, 0);
  const key = estimated.people[0].key;
  const reviewed = buildHeadcounts(units, rows, { suggest: true, overrides: new Map([[key, 'root']]) });
  assert.equal(reviewed.counts.get('root').direct.length, 1);
  assert.equal(reviewed.people[0].source, 'reviewed');
  const cleared = buildHeadcounts(units, rows, { suggest: true, overrides: new Map([[key, '']]) });
  assert.equal(cleared.counts.get('root').all.length, 0);
  assert.equal(cleared.unassigned.length, 1);
});

test('a missing roster is unavailable, not a zero-person organization', () => {
  const result = buildHeadcounts([unit('root', '')]);
  assert.equal(result.available, false);
});

test('open roles split filled from approved/unfilled without including active, held, gated, pending, or inactive positions', () => {
  const units = [unit('root', '')];
  const rows = [
    person(1, 'root'),
    person(2, 'root', { status: 'Filled' }),
    person(3, 'root', { status: 'Approved', name: '' }),
    person(4, 'root', { status: 'Approved - Hide', name: '' }),
    person(5, 'root', { status: 'Approved-2026 Intern Conversion ONLY' }),
    person(6, 'root', { status: 'HOLD - Approved' }),
    person(7, 'root', { status: 'GATED' }),
    person(8, 'root', { status: 'PENDING' }),
    person(9, 'root', { status: 'Inactive' }),
    person(10, 'root', { status: 'Approved', stage: 'Offer accepted' }),
    person(1, 'root', { status: 'Filled' }),
  ];
  const report = buildReports(units, roster(rows), { suggest: false });
  assert.equal(report.people.length, 1);
  assert.equal(report.pipeline.people.length, 5);
  assert.equal(report.pipeline.people.filter(r => r.pipelineStatus === 'filled').length, 2);
  assert.equal(report.pipeline.people.filter(r => r.pipelineStatus === 'sourcing').length, 3);
  assert.equal(report.pipeline.held.length, 3);
  assert.equal(report.pipeline.counts.get('root').all.length, 5);
  assert.ok(report.notes.some(note => note.includes('Active record')));
});

test('pipeline rollups retain direct roles and deduplicate repeated Position IDs', () => {
  const units = [unit('root', ''), unit('child', 'root')];
  const report = buildReports(units, roster([
    person(1, 'root', { status: 'Filled' }),
    person(2, 'child', { status: 'Approved', name: '' }),
    person(2, 'child', { status: 'Approved', name: '' }),
  ]), { suggest: false });
  assert.equal(report.pipeline.counts.get('root').direct.length, 1);
  assert.equal(report.pipeline.counts.get('root').all.length, 2);
  assert.equal(report.pipeline.counts.get('child').all.length, 1);
  assert.throws(() => buildReports(units, roster([
    person(3, 'child', { status: 'Filled' }), person(3, 'child', { status: 'Approved' }),
  ]), { suggest: false }), /conflicting Filled/);
});

test('employing-company filters reconcile active and open totals and keep required ancestors', () => {
  const units = [
    unit('root', '', 'Corporation'), unit('brand', 'root', 'Czinger Sales, Brand and Marketing'),
    unit('div-brand', 'brand', 'Divergent Brand & Marketing'),
    unit('cz-brand', 'brand', 'CZV Brand & Marketing'),
  ];
  const report = buildReports(units, roster([
    person(1, 'div-brand', { company: 'DTI' }),
    person(2, 'div-brand', { company: 'DII' }),
    person(3, 'cz-brand', { company: 'CZV' }),
    person(4, 'cz-brand', { company: 'CZV', status: 'Filled' }),
    person(5, 'div-brand', { company: 'DTI', status: 'Approved', name: '' }),
  ]), { suggest: false });
  const divergent = filterHeadcounts(report, units, new Set(['divergent']));
  const czinger = filterHeadcounts(report, units, new Set(['czinger']));
  assert.equal(divergent.people.length, 2);
  assert.equal(czinger.people.length, 1);
  assert.equal(divergent.pipeline.people.length, 1);
  assert.equal(czinger.pipeline.people.length, 1);
  assert.equal(divergent.counts.get('root').all.length + czinger.counts.get('root').all.length, report.counts.get('root').all.length);
  const visible = visibleCompanyUnits(units, report, divergent, new Set(['divergent']));
  assert.ok(visible.has('brand')); // Structural ancestor of the Divergent brand team.
  assert.ok(visible.has('div-brand'));
  assert.equal(visible.has('cz-brand'), false);
});
