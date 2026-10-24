from io import BytesIO
import copy
import pytest
from openpyxl import Workbook
from fastapi.testclient import TestClient
from backend import app as module, auth
from backend.db import Database
from backend.sample import sample_state
from backend.domain import validate
from backend.organizer import organizer_import


def workbook(rows=None):
    w=Workbook();s=w.active;s.title='Org Structure'
    s.append(['Org Chart']);s.append([])
    s.append(['Department ID','Parent ID','Department Title','Department Owner','Department Purpose','Tier'])
    for r in rows or [('0000','','Corporation','','One organization',0),('1000','0000','Growth','Unlinked owner','Revenue',1),('1100','1000','Sales','','Selling',None)]:s.append(r)
    s=w.create_sheet('Position Control');s.append(['Unique Company ID','Department ID','Company'])
    s.append(['030','1100','CZV'])
    s.append(['021',None,'DTI'])
    b=BytesIO();w.save(b);return b.getvalue()


@pytest.fixture
def client(monkeypatch,tmp_path):
    db=Database('sqlite:///'+str(tmp_path/'corporate.db'));db.save(sample_state(),0,'test','seed')
    monkeypatch.setattr(module,'DB',db);monkeypatch.setattr(auth,'MODE','development')
    with TestClient(module.app) as c: yield c


def test_organizer_preserves_leading_zero_tiers_purpose_and_existing_records():
    state=sample_state();before=copy.deepcopy(state)
    new,_,_,errors,_=organizer_import(workbook(),state,'test')
    assert state == before
    assert not errors and not validate(new)[0]
    assert new['OrganizationalUnits']['0000']['UnitType']=='corporate'
    assert new['OrganizationalUnits']['1100']['Tier']=='2'
    assert new['OrganizationalUnits']['1000']['DepartmentOwner']=='Unlinked owner'
    assert new['OrganizationalUnits']['1000']['DepartmentPurpose']=='Revenue'
    assert new['Employees']['030']['OrgUnitID']=='1100'
    assert new['Employees']['030']['SourceCompany']=='czinger'
    assert new['Employees']['021']['OrgUnitID']==state['Employees']['021']['OrgUnitID']
    assert new['Compensation']==state['Compensation']
    assert new['Budgets']==state['Budgets']
    assert new['Objectives']==state['Objectives']
    assert {k:r['ManagerID'] for k,r in new['Employees'].items()}=={k:r['ManagerID'] for k,r in state['Employees'].items()}
    again,_,_,errors,_=organizer_import(workbook(),new,'test')
    assert not errors and not validate(again)[0]
    assert again['OrganizationalUnits']==new['OrganizationalUnits']


def test_organizer_reimport_preserves_app_edits_and_custom_branch():
    state,*_=organizer_import(workbook(),sample_state(),'test')
    state['OrganizationalUnits']['1000'].update(_source='app',OrgUnitName='Edited title',DepartmentPurpose='Edited purpose')
    state['OrganizationalUnits']['custom']=dict(OrgUnitID='custom',OrgUnitName='Custom',ParentOrgUnitID='1000',UnitType='group',Tier='2',_source='app')
    state['Employees']['030'].update(_source='app',OrgUnitID='custom')
    after,_,conflicts,errors,_=organizer_import(workbook(),state,'test')
    assert not errors and not validate(after)[0]
    assert after['OrganizationalUnits']['1000']==state['OrganizationalUnits']['1000']
    assert after['OrganizationalUnits']['custom']==state['OrganizationalUnits']['custom']
    assert after['Employees']['030']['OrgUnitID']=='custom'
    assert conflicts


def test_organizer_api_preview_commit_then_table_edit(client):
    before=module.DB.read()
    response=client.post('/api/imports/preview',files={'file':('organizer.xlsx',workbook())},data={'mode':'snapshot'})
    assert response.status_code==200,response.text
    preview=response.json();assert preview['errors']==[]
    assert preview['mode']=='incremental' and module.DB.read()==before
    response=client.post('/api/imports/'+preview['id']+'/commit',json={'acknowledgeWarnings':True})
    assert response.status_code==200,response.text
    data=client.get('/api/organization').json()
    unit=next(u for u in data['units'] if u['OrgUnitID']=='1100')
    unit.update(OrgUnitName='Edited in table',DepartmentPurpose='A saved purpose',Entity='czinger')
    response=client.put('/api/planning/OrganizationalUnits/1100',json={'version':data['version'],'record':unit})
    assert response.status_code==200,response.text
    unit=next(u for u in client.get('/api/organization').json()['units'] if u['OrgUnitID']=='1100')
    assert unit['OrgUnitName']=='Edited in table' and unit['DepartmentPurpose']=='A saved purpose'
    assert unit['Entity']=='czinger'
    assert client.put('/api/planning/OrganizationalUnits/1100',json={'version':data['version'],'record':unit}).status_code==409


def test_organizer_invalid_parent_and_duplicate_preview_no_changes(client):
    before=module.DB.read()
    response=client.post('/api/imports/preview',files={'file':('broken.xlsx',workbook([('0000','','Corporate','','',0),('1000','missing','Invalid','','',1)]))})
    assert response.status_code==400
    assert module.DB.read()==before
    response=client.post('/api/imports/preview',files={'file':('duplicate.xlsx',workbook([('0000','','Corporate','','',0),('1000','0000','A','','',1),('1000','0000','B','','',1)]))})
    assert response.status_code==200 and response.json()['errors']
    assert module.DB.read()==before


def set_entities():
    state,v=module.DB.read()
    for p in state['Employees'].values(): p['SourceCompany']='divergent'
    state['Employees']['030']['SourceCompany']='czinger'
    state['Employees']['021']['SourceCompany']='czinger'
    module.DB.save(state,v,'test','fixture')
    return state


def test_entity_filter_payroll_counts_reconnects_without_mutation(client):
    state=set_entities();before=module.DB.read()
    both=client.get('/api/organization?entity=both').json()
    cz=client.get('/api/organization?entity=czinger').json()
    div=client.get('/api/organization?entity=divergent').json()
    assert {p['EmployeeID'] for p in cz['employees']}=={'030','021'}
    assert cz['summary']['headcount']+div['summary']['headcount']==both['summary']['headcount']
    assert cz['summary']['payroll']+div['summary']['payroll']==both['summary']['payroll']
    for p in cz['employees']:
        assert p['ManagerID'] in {'','030','021'}
        assert p['StoredManagerID']==state['Employees'][p['EmployeeID']]['ManagerID']
    assert cz['summary']['payroll']==sum(client.get(f"/api/people/{i}/compensation").json()[0]['AnnualTotal'] for i in ['030','021'])
    assert module.DB.read()==before
    assert client.get('/api/organization?entity=invalid').status_code==400


@pytest.mark.parametrize('role',['viewer','owner'])
def test_filtered_view_does_not_expose_pay_or_allow_structure_import(client,role):
    set_entities();client.post('/api/dev-session',json={'role':role})
    for entity in ['divergent','czinger']:
        data=client.get('/api/organization?entity='+entity).json()
        assert data['summary']['payroll'] is None
        assert all(p['metrics']['payroll'] is None for p in data['employees'])
        assert all(u['metrics']['total']['payroll'] is None for u in data['units'])
    assert client.post('/api/imports/preview',files={'file':('organizer.xlsx',workbook())}).status_code==403


def test_unit_entity_visibility_retains_ancestors_and_corporate_overhead(client):
    state,v=module.DB.read()
    state,*_=organizer_import(workbook(),state,'test')
    state['OrganizationalUnits']['1100']['Entity']='czinger'
    module.DB.save(state,v,'test','fixture')
    before=module.DB.read()
    div=client.get('/api/organization?entity=divergent').json()
    cz=client.get('/api/organization?entity=czinger').json()
    assert '1100' not in {u['OrgUnitID'] for u in div['units']}
    assert {'0000','1000','1100'} <= {u['OrgUnitID'] for u in cz['units']}
    response=client.get('/api/model');assert response.status_code==200,response.text
    model=response.json()
    assert model['config']['divergentUnit']=='divergent' and model['config']['czingerUnit']=='czinger'
    assert module.DB.read()==before
    assert client.put('/api/model',json={'version':model['version'],'config':model['config']}).status_code==200


def test_organizer_can_initialize_an_empty_structure():
    from backend.importer import parse_workbook
    state,errors,_,_=parse_workbook(workbook())
    assert not errors and not validate(state)[0]
    assert set(state['OrganizationalUnits'])=={'0000','1000','1100'}
    assert not state['Employees']
