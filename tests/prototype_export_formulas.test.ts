import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync(new URL('../prototypes/org-chart.html',import.meta.url),'utf8');
const part=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b));
const translate=runInNewContext(part('function columnName(','function xmlCell(')+part('function translateCellFormula(','function sharedFormulaBases(')+';translateCellFormula;');
test('new Excel row formulas translate relative references and retain absolute references and quoted strings',()=>{assert.equal(translate('IF($Y10="A10",SUM(A10:B$20)+$C$2,CONCATENATE(F10,B10))','AA10','AA25'),'IF($Y25="A10",SUM(A25:B$20)+$C$2,CONCATENATE(F25,B25))');assert.equal(translate("'Sheet A10'!B10+Table1[A10]+LOG10(A10)",'A10','B12'),"'Sheet A10'!C12+Table1[A10]+LOG10(B12)");});
test('shared formula translation handles row and column offsets and invalid references',()=>{assert.equal(translate('A2+$B2+C$1+$D$4','B2','D5'),'C5+$B5+E$1+$D$4');assert.equal(translate('A1','A2','A1'),'#REF!');});
