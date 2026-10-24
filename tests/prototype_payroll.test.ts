import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../prototypes/org-chart.html',import.meta.url),'utf8');
const section=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b));
const model=runInNewContext(section('// BEGIN DEMO PAYROLL MODEL','// END DEMO PAYROLL MODEL')+section('function companyEntity(', 'function filterHeadcounts(')+';({demoCompensation,demoAnnual,createPayrollScenario,payrollCosts,payrollBudgets,validatePayrollScenario,distributePercent});');
const units=[{id:'root',parent:''},{id:'a',parent:'root'},{id:'b',parent:'root'},{id:'team',parent:'a'}];
const record=(key,unitId,company='DTI',extra={})=>({key,name:'Synthetic '+key,title:'Senior Mechanical Engineer',unitId,company,positionIds:[key],employmentType:'Full Time',...extra});
const report={people:[record('one','root'),record('two','a'),record('three','team','CZV'),record('unassigned','','CZV'),record('contractor','b','DTI',{employmentType:'Agency-paid Temp'})],pipeline:{people:[record('four','a','DTI',{kind:'open',pipelineStatus:'filled'}),record('five','team','CZV',{kind:'open',pipelineStatus:'sourcing'})]}};
const both=new Set(['divergent','czinger']);
const close=(a,b)=>assert.ok(Math.abs(a-b)<.0001,`${a} != ${b}`);
test('annualized pay uses salary+bonus, hourly hours or monthly contractor rate',()=>{
 assert.equal(model.demoAnnual({kind:'salary',salary:100000,bonus:10000}),110000);
 assert.equal(model.demoAnnual({kind:'hourly',hourly:30,hours:2080}),62400);
 assert.equal(model.demoAnnual({kind:'monthly',monthly:12000}),144000);
 const c=model.demoCompensation(report.people[4]);assert.equal(c.kind,'monthly');assert.ok(c.monthly>0);
 assert.equal(model.demoCompensation(record('tech','a','DTI',{title:'AM Technician II'})).kind,'hourly');
 const original=model.demoCompensation(report.people[0]);assert.deepEqual(model.demoCompensation({...report.people[0],name:'Different name',unitId:'b'}),original);
});
test('payroll totals count every person and role once; unassigned stays outside department rollups',()=>{
 const s=model.createPayrollScenario(units,report),p=model.payrollCosts(units,report,s,both);
 assert.equal(p.summary.activeCount,5);assert.equal(p.summary.filledCount,1);assert.equal(p.summary.approvedCount,1);
 close(p.summary.planned,p.summary.active+p.summary.filled+p.summary.approved);
 close(p.summary.planned,p.counts.get('root').all.planned+p.unassigned.planned);
 close([...p.counts.values()].reduce((n,x)=>n+x.direct.planned,0),p.counts.get('root').all.planned);
 const a=model.payrollCosts(units,report,s,new Set(['divergent'])),b=model.payrollCosts(units,report,s,new Set(['czinger']));
 close(a.summary.planned+b.summary.planned,p.summary.planned);assert.equal(a.summary.approvedCount,0);
});
test('parent budgets conserve shares, compound through tiers, and scale with company envelope',()=>{
 const s=model.createPayrollScenario(units,report);s.budgets.divergent=1000000;s.budgets.czinger=2000000;
 s.shares.a.divergent=60;s.shares.b.divergent=20;s.shares.team.divergent=50;
 model.validatePayrollScenario(s,units,report);
 const b=model.payrollBudgets(units,s,new Set(['divergent']));assert.equal(b.totals.get('a'),600000);assert.equal(b.totals.get('team'),300000);assert.equal(b.root,1000000);
 s.budgets.divergent*=2;const scaled=model.payrollBudgets(units,s,new Set(['divergent']));assert.equal(scaled.totals.get('team'),600000);
 const combined=model.payrollBudgets(units,s,both),cz=model.payrollBudgets(units,s,new Set(['czinger']));for(const u of units)close(combined.totals.get(u.id),scaled.totals.get(u.id)+cz.totals.get(u.id));
});
test('pay edits and assignment changes affect spend without regenerating budgets',()=>{
 const s=model.createPayrollScenario(units,report),before=model.payrollCosts(units,report,s,both),budgets=JSON.stringify(s.budgets),shares=JSON.stringify(s.shares);
 s.compensation.one.salary+=10000;const after=model.payrollCosts(units,report,s,both);close(after.summary.planned,before.summary.planned+10000);
 const moved={...report,people:report.people.map(r=>r.key==='two'?{...r,unitId:'b'}:r)},m=model.payrollCosts(units,moved,s,both);close(m.summary.planned,after.summary.planned);assert.ok(m.counts.get('b').all.planned>after.counts.get('b').all.planned);
 assert.equal(JSON.stringify(s.budgets),budgets);assert.equal(JSON.stringify(s.shares),shares);model.validatePayrollScenario(s,units,moved);
});
test('scenario validation rejects over-allocation, invalid pay and wrong workbook without mutating inputs',()=>{
 const s=model.createPayrollScenario(units,report);assert.equal(model.validatePayrollScenario(s,units,report),s);
 for(const mutate of [x=>x.shares.a.divergent=101,x=>{x.shares.a.divergent=70;x.shares.b.divergent=40;},x=>x.compensation.one.salary=-1,x=>x.compensation.one.hours=9000,x=>x.budgets.divergent=Infinity,x=>x.signature='other']){const copy=structuredClone(s);mutate(copy);assert.throws(()=>model.validatePayrollScenario(copy,units,report));}
});
test('empty units reserve their parent allocation and unknown companies remain in Both only',()=>{
 assert.equal(model.distributePercent([0,0,0]).reduce((a,b)=>a+b),0);close(model.distributePercent([1,1,1]).reduce((a,b)=>a+b),100);
 const r={people:[record('unknown','team','Other')],pipeline:{people:[]}},s=model.createPayrollScenario(units,r),all=model.payrollCosts(units,r,s,both),div=model.payrollCosts(units,r,s,new Set(['divergent']));assert.equal(all.summary.activeCount,1);assert.equal(div.summary.activeCount,0);assert.ok(s.budgets.unknown>0);model.validatePayrollScenario(s,units,r);
});
