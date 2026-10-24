import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../prototypes/org-chart.html',import.meta.url),'utf8');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b));
const {buildReportingModel,reportingScope}=runInNewContext(slice('// BEGIN REPORTING MODEL','// END REPORTING MODEL')+slice('function companyEntity(','function filterHeadcounts(')+';({buildReportingModel,reportingScope});');
const person=(key,name,company='DTI',extra={})=>({key,name,company,sourceRows:[Number(key)],positionIds:[key],...extra});
const make=(people,managers,open=[])=>buildReportingModel({people,pipeline:{people:open},available:true},{available:true,managerColumn:true,rows:[...people,...open].map(p=>({sourceRow:p.sourceRows[0],directManager:managers[p.key]||''}))});
test('uses names or explicit position IDs and preserves direct versus transitive reports',()=>{
 const m=make([person('1','Morgan Lead'),person('2','Jamie Person'),person('3','Casey Person')],{'2':'LEAD, Morgan','3':'Pos ID: 002'});
 assert.equal(m.nodes.get('person:2').parent,'person:1');assert.equal(m.nodes.get('person:3').parent,'person:2');assert.equal(m.nodes.get('person:3').link,'position-id');
 const s=reportingScope(m,new Set(['divergent','czinger']),true);assert.equal(s.counts.get('person:1').active,3);assert.equal(s.counts.get('person:1').direct,1);
 const noManager=make([person('4','No Manager')],{'4':'N/A'});assert.equal(noManager.issues.length,0);assert.equal(noManager.nodes.get('person:4').parent,'report-root');
});
test('unique nicknames are flagged; unknown and ambiguous managers remain review placeholders',()=>{
 const m=make([person('1','Matthew Example'),person('2','Person Two'),person('3','Person Three'),person('4','Duplicate Name'),person('5','Duplicate Name','CZV'),person('6','Person Six')],{'2':'Matt Example','3':'Missing Manager','6':'Duplicate Name'});
 assert.equal(m.nodes.get('person:2').link,'nickname');assert.equal(m.nodes.get('person:2').parent,'person:1');assert.equal(m.nodes.get('person:3').link,'unresolved');assert.equal(m.nodes.get('person:6').link,'unresolved');assert.equal(m.issues.length,2);
});
test('cycles and self-reporting are isolated without losing or double-counting people',()=>{
 const m=make([person('1','Person One'),person('2','Person Two'),person('3','Person Three')],{'1':'Person Two','2':'Person One','3':'Person Three'});assert.equal(m.issues.length,3);
 const s=reportingScope(m,new Set(['divergent','czinger']),true);assert.equal(s.counts.get('report-root').active,3);for(const n of m.nodes.values()){const seen=new Set();let current=n;while(current){assert.ok(!seen.has(current.id));seen.add(current.id);current=m.nodes.get(current.parent);}}
});
test('company filters keep other-company managers as context without counting them',()=>{
 const m=make([person('1','Divergent Manager'),person('2','Czinger Person','CZV')],{'2':'Divergent Manager'});const s=reportingScope(m,new Set(['czinger']),true);
 assert.ok(s.visible.has('person:1'));assert.ok(!s.counted.has('person:1'));assert.ok(s.counted.has('person:2'));assert.equal(s.counts.get('report-root').active,1);
});
test('open roles appear under their manager and can be excluded without losing active people',()=>{
 const open=[person('2','Incoming Example','CZV',{kind:'open',pipelineStatus:'filled'}),person('3','Unfilled role','DTI',{kind:'open',pipelineStatus:'sourcing'})];const m=make([person('1','Manager One')],{'2':'Manager One','3':'Manager One'},open);
 const all=reportingScope(m,new Set(['divergent','czinger']),true),active=reportingScope(m,new Set(['divergent','czinger']),false);assert.equal(all.counts.get('report-root').filled,1);assert.equal(all.counts.get('report-root').approved,1);assert.equal(active.counted.size,1);
});
test('manual manager choices are explicit and do not mutate the roster or departments',()=>{
 const people=[person('1','Manager One'),person('2','Person Two')],roster={managerColumn:true,rows:[{sourceRow:1,directManager:''},{sourceRow:2,directManager:'Unknown'}]},report={people,pipeline:{people:[]},available:true};const before=JSON.stringify(roster),m=buildReportingModel(report,roster,new Map([['unknown','1']]));assert.equal(m.nodes.get('person:2').parent,'person:1');assert.equal(m.nodes.get('person:2').link,'reviewed');assert.equal(JSON.stringify(roster),before);
});
