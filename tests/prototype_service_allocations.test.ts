import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../prototypes/org-chart.html',import.meta.url),'utf8');
const section=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b));
const api=runInNewContext(section('function departmentCode(','function setStatus(')+section('function companyEntity(','function selectedCompanies(')+section('// BEGIN DEMO PAYROLL MODEL','// END DEMO PAYROLL MODEL')+section('// BEGIN WORKBOOK EDIT MODEL','// END WORKBOOK EDIT MODEL')+';({serviceAllocationRollups,departmentSlaRules,prepareDepartmentCompanyEdit,validateDepartmentSlas});');
const {serviceAllocationRollups,departmentSlaRules,prepareDepartmentCompanyEdit,validateDepartmentSlas}=api;
const dept=(id,parent,entity='divergent',extra={})=>({id,parent,name:id,departmentCompany:entity,...extra});
const record=(key,unitId,extra={})=>({key,name:key,unitId,company:'DTI',...extra});
function scenario(rows,amount=100000){return {compensation:Object.fromEntries(rows.map(r=>[r.key,{kind:'salary',salary:amount,bonus:0}]))};}
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.000001,`${actual} != ${expected}`);
test('support shares weight each direct salary once, including managers; active and planned stay separate',()=>{
 const units=[dept('root',''),dept('3400','root'),dept('cz','3400','czinger'),dept('dt','3400')];
 const people=[record('manager','3400'),...Array.from({length:4},(_,i)=>record('c'+i,'cz')),...Array.from({length:6},(_,i)=>record('d'+i,'dt'))];
 const open=[record('filled','cz',{kind:'open',pipelineStatus:'filled'}),record('approved','dt',{kind:'open',pipelineStatus:'sourcing'})];
 const report={people,pipeline:{people:open}},s=scenario([...people,...open]);s.compensation.manager.salary=200000;for(let i=0;i<4;i++)s.compensation['c'+i].salary=150000;s.compensation.filled.salary=200000;
 const result=serviceAllocationRollups(units,report,s),all=result.counts.get('3400').all;
 close(all.active.total,1400000);close(all.active.czinger,600000);close(all.active.divergent,800000);assert.equal(all.active.count,11);close(all.planned.total,1700000);close(all.planned.czinger,800000);assert.equal(all.planned.count,13);assert.equal(result.counts.get('cz').direct.active.count,4);close(result.counts.get('root').all.active.total,all.active.total);
});
test('10% People Ops branch SLA needs no Czinger employees and conserves total payroll',()=>{
 const units=[dept('root',''),dept('ops','root','divergent',{slaPercent:'10',slaTarget:'czinger',slaScope:'branch'}),dept('recruiting','ops')],rows=[record('a','ops'),record('b','recruiting')];
 const result=serviceAllocationRollups(units,{people:rows},scenario(rows));const all=result.counts.get('ops').all.active;close(all.total,200000);close(all.czinger,20000);close(all.divergent,180000);close(all.slaCzinger,20000);assert.equal(result.rules.get('recruiting').sourceId,'ops');assert.equal(rows.every(r=>r.company==='DTI'),true);
});
test('nested SLAs replace rather than stack, 0% overrides and ownership boundaries stop inheritance',()=>{
 const units=[dept('root',''),dept('ops','root','divergent',{slaPercent:'10',slaTarget:'czinger',slaScope:'branch'}),dept('local','ops','divergent',{slaPercent:'25',slaTarget:'czinger',slaScope:'branch'}),dept('leaf','local'),dept('zero','ops','divergent',{slaPercent:'0',slaTarget:'czinger',slaScope:'branch'}),dept('cz','ops','czinger'),dept('dt','cz')];
 const rows=units.slice(1).map(u=>record(u.id,u.id)),result=serviceAllocationRollups(units,{people:rows},scenario(rows));close(result.counts.get('leaf').direct.active.czinger,25000);close(result.counts.get('zero').direct.active.czinger,0);close(result.counts.get('cz').direct.active.czinger,100000);close(result.counts.get('dt').direct.active.czinger,0);close(result.counts.get('ops').all.active.czinger,160000);close(result.counts.get('root').all.active.total,600000);
});
test('direct-only SLAs and reverse Czinger-to-Divergent service apply to their intended records',()=>{
 const units=[dept('root',''),dept('cz','root','czinger',{slaPercent:'40',slaTarget:'divergent',slaScope:'direct'}),dept('child','cz','czinger')],rows=[record('a','cz'),record('b','child')];const result=serviceAllocationRollups(units,{people:rows},scenario(rows));close(result.counts.get('cz').all.active.divergent,40000);close(result.counts.get('cz').all.active.czinger,160000);assert.equal(result.rules.get('child'),null);
});
test('empty/zero payroll does not fabricate percentages, missing pay is flagged, unassigned cost stays separate',()=>{
 const units=[dept('root',''),dept('empty','root')],rows=[record('zero','empty'),record('missing','empty'),record('outside','')],s=scenario(rows);s.compensation.zero.salary=0;delete s.compensation.missing;
 const result=serviceAllocationRollups(units,{people:rows},s);assert.equal(result.counts.get('empty').all.active.total,0);assert.equal(result.counts.get('empty').all.active.missing,1);close(result.unassigned.active.total,100000);assert.equal(result.counts.get('root').all.active.count,2);
});
test('SLA edits validate atomically, retain zero overrides and clear settings explicitly',()=>{
 const units=[dept('root',''),dept('ops','root')];units.roster={available:true,rows:[record('x','ops')]};const original=JSON.stringify(units);
 for(const slaPercent of ['-1','101','NaN'])assert.throws(()=>prepareDepartmentCompanyEdit(units,'ops','divergent',{slaPercent,slaTarget:'czinger',slaScope:'branch'}),/percentage/);
 assert.throws(()=>prepareDepartmentCompanyEdit(units,'ops','divergent',{slaPercent:'10',slaTarget:'divergent',slaScope:'branch'}),/other company/);
 const next=prepareDepartmentCompanyEdit(units,'ops','divergent',{slaPercent:'0',slaTarget:'czinger',slaScope:'branch'});assert.equal(next[1].slaPercent,'0');assert.equal(departmentSlaRules(next).get('ops').percentage,0);assert.equal(JSON.stringify(units),original);
 const cleared=prepareDepartmentCompanyEdit(next,'ops','divergent',{});assert.equal(cleared[1].changes.slaPercent,'');assert.equal(departmentSlaRules(cleared).get('ops'),null);
 assert.throws(()=>validateDepartmentSlas([dept('root',''),dept('bad','root','divergent',{slaTarget:'czinger'})]),/percentage/);
});
