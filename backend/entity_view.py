"""Entity is a view over one corporate structure, never a second reporting tree."""
import copy
from backend.organizer import normalize_entity


def entity_view(state, entity):
    if entity == 'both': return state
    view = copy.deepcopy(state)
    original = state['Employees']
    selected = {k: e for k, e in view['Employees'].items() if normalize_entity(e.get('SourceCompany', '')) == entity}
    for key, person in selected.items():
        parent = person.get('ManagerID', '')
        person['StoredManagerID'] = parent
        seen = {key}
        while parent and parent not in selected and parent not in seen:
            seen.add(parent)
            parent = original.get(parent, {}).get('ManagerID', '')
        person['ManagerID'] = parent if parent in selected else ''
    view['Employees'] = selected
    return view


def entity_units(state, allowed, entity):
    if entity == 'both': return allowed
    units = state['OrganizationalUnits']
    keep = {k for k in allowed if units[k].get('Entity', '') in {'', 'both', entity}}
    keep |= {e['OrgUnitID'] for e in state['Employees'].values() if e['OrgUnitID'] in allowed}
    for key in list(keep):
        seen = set()
        while key in allowed and key not in seen:
            seen.add(key);keep.add(key);key=units[key].get('ParentOrgUnitID')
    return keep
