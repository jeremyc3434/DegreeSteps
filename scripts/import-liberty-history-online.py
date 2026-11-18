#!/usr/bin/env python3
"""Compile the separately reviewed 2026–27 History online ledger; no network calls."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FACTS = ROOT / 'content/curricula/snapshots/liberty/history-online-2026-2027-reviewed.json'
OUTPUT = ROOT / 'content/curricula/liberty-history-online.json'


def compile_document():
    facts = json.loads(FACTS.read_text())
    published = facts['published']
    assert facts['catalog'] == '2026-2027' and published['totalCredits'] == 120
    catalog = json.loads((ROOT / 'dist/data/program-catalog.json').read_text())
    parents = [route for route in catalog['programs'] if route['school'] == facts['school'] and route['title'] == 'History Major (B.A. & B.S.)']
    assert len(parents) == 1, 'Keep the exact reviewed History directory family'
    parent = parents[0]
    sid = 'liberty-history-online-2026-2027'
    gen_sid = 'liberty-history-online-approved-gened'
    sources = [
        {'id': sid, 'title': 'History B.S. online degree completion plan, 2026–27', 'url': facts['sourceUrl'], 'checked': facts['checkedOn']},
        {'id': gen_sid, 'title': 'Approved online general-education selections, 2026–27', 'url': facts['generalEducationSelectionEvidence']['url'], 'checked': facts['generalEducationSelectionEvidence']['checkedOn']},
        {'id': 'liberty-history-online-academic-policy-2026-2027', 'title': 'Online academic policy and earned-credit student classification', 'url': facts['capstoneSequence']['classificationSourceUrl'], 'checked': facts['checkedOn']},
        {'id': 'liberty-history-online-tuition-2026-2027', 'title': 'Standard online undergraduate tuition and financial policy, 2026–27', 'url': 'https://catalog.liberty.edu/undergraduate/admission/expenses-financial-policy-online-program/', 'checked': '2026-11-17', 'scope': 'Existing separately reviewed standard online tuition, not a new price-source retrieval.'},
        *facts['courseCatalogEvidence']
    ]

    def row(code, title, credits, category, group, source_ids=None):
        upper = 300 <= int(code.split()[1]) <= 499
        result = {'id': code.lower().replace(' ', '-'), 'code': code, 'title': title,
                  'credits': credits, 'category': category, 'group': group, 'upper': upper,
                  'sourceIds': source_ids or [sid], 'options': []}
        if category == 'major' and upper:
            result['minimumGrade'] = 'C'
        return result

    requirements = [row(code, title, credits, 'general', group, [sid, gen_sid]) for code, title, credits, group in facts['generalEducationSelection']]
    assert sum(req['credits'] for req in requirements) == 36
    requirements += [row(*fact, 'major', 'major-foundations') for fact in facts['foundations']]
    requirements += [row(*fact, 'major', 'major-core') for fact in facts['requiredMajor']]
    next(req for req in requirements if req['code'] == 'HIEU 201')['allowedCourseCodes'] = ['HIEU 201', 'HIEU 202']
    for code, title, credits, group in facts['majorElectiveSelections']:
        restriction = facts['electiveRestrictions'][group]
        prefix, number = code.split()
        assert prefix in restriction['prefixes'] and restriction['minLevel'] <= int(number) <= restriction['maxLevel']
        req = row(code, title, credits, 'major', group, [sid, 'liberty-history-' + prefix.lower() + '-courses-2026-2027'])
        req['choiceNote'] = 'Proposed named online course in the published ' + group.replace('-', ' ') + ' elective block; a different eligible course may be chosen without counting the same award twice.'
        req['allocationBasis'] = 'Named online-offered selection satisfying the published department/upper-level restriction.'
        requirements.append(req)
    capstone = next(req for req in requirements if req['code'] == 'HIST 491')
    capstone['prerequisites'] = [code.lower().replace(' ', '-') for code in facts['capstoneSequence']['selectedPrerequisites']]
    capstone['prerequisiteNotes'] = facts['capstoneSequence']['scope']
    capstone['minimumCompletedCredits'] = facts['capstoneSequence']['minimumCompletedCredits']
    capstone['sourceIds'].append(facts['capstoneSequence']['sourceId'])
    capstone['sourceIds'].append('liberty-history-online-academic-policy-2026-2027')
    fixed_codes = {requirement['code'] for requirement in requirements}
    fallbacks = facts['freeElectiveFallbacks']
    assert len(fallbacks) == len({choice['code'] for choice in fallbacks}) == 14
    source_ids = {source['id'] for source in sources}
    for index, choice in enumerate(fallbacks, 1):
        code = choice['code']
        assert code not in fixed_codes and choice['credits'] == 3
        assert 'Online' in choice['offered'] and choice['formalPrerequisites'] == []
        assert choice['sourceId'] in source_ids
        identifier = 'free-electives-' + str(index)
        evidence = [sid, choice['sourceId']]
        requirements.append({'id': identifier, 'allocationOf': 'free-electives', 'title': 'Free elective ' + str(index), 'credits': 3,
                             'category': 'electives', 'group': 'free-electives', 'freeElective': True, 'excludeAlreadyUsed': True,
                             'upper': False, 'sourceIds': evidence,
                             'options': [{'id': 'university-' + identifier, 'provider': 'University', 'code': code,
                                          'receivingCode': code, 'title': choice['title'], 'credits': 3, 'upper': False,
                                          'creditSystem': 'semester', 'creditOrigin': 'institutional', 'sourceIds': evidence,
                                          'evidence': 'published', 'url': next(source['url'] for source in sources if source['id'] == choice['sourceId'])}],
                             'notes': 'Named online university fallback: ' + code + ' ' + choice['title'] + '. This is unrestricted free-elective capacity; a different eligible, nonduplicating course may be selected.'})
    assert sum(req['credits'] for req in requirements) == 120
    assert len({req['id'] for req in requirements}) == len(requirements)
    assert sum(req['credits'] for req in requirements if req['category'] == 'major') == 42
    assert sum(req['credits'] for req in requirements if req['upper']) == 30
    for group, restriction in facts['electiveRestrictions'].items():
        assert sum(req['credits'] for req in requirements if req['group'] == group) == restriction['credits']
    mid = 'curriculum-liberty-history-bs-online'
    route_id = parent['id'] + '-online'
    model = {'id': mid, 'routeIds': [route_id], 'catalogParentId': parent['id'], 'school': facts['school'],
             'title': 'History (B.S.) — Online', 'level': 'bachelor', 'format': 'Online', 'modalities': ['online'],
             'catalog': '2026–2027', 'catalogYear': facts['catalog'], 'creditSystem': 'semester',
             'totalCredits': 120, 'institutionMinCredits': 30, 'externalMaxCredits': 90, 'upperMinCredits': 30,
             'majorInstitutionFraction': .25, 'majorResidencyBasisCredits': 42,
             'coverage': 'complete', 'completeExecutablePathway': False,
             'coverageLabel': 'Complete 120-credit requirement ledger with named online major selections and separately sourced transfer options.',
             'defaultProviders': ['Sophia', 'Study.com', 'StraighterLine', 'CLEP'],
             'tuitionComparison': {'entryId': 'liberty-online', 'checkedOn': '2026-11-17', 'catalogYear': '2026-2027', 'sourceUrl': 'https://catalog.liberty.edu/undergraduate/admission/expenses-financial-policy-online-program/'},
             'requirements': requirements, 'sources': sources,
             'overlaps': [{'requirementId': overlap['code'].lower().replace(' ', '-'), 'alsoSatisfies': overlap['alsoSatisfies'], 'creditsCountedOnce': overlap['creditsCountedOnce']} for overlap in facts['overlaps']],
             'rulesNotes': facts['notes'],
             'univ104Scenario': {'baselineCredits': 3, 'publishedCreditsRange': [0, 3], 'zeroCreditCaseRequiresIndividualConfirmation': True, 'replacementElectiveCreditsIfZero': 3, 'sourceIds': [sid]},
             'obligations': [{'title': 'UNIV 104 evaluation', 'notes': 'The baseline retains the three-credit case. An individual zero-credit evaluation can replace these credits with three more elective credits within the published range.', 'sourceIds': [sid]}],
             'graduationRequirements': [
                 {'id': 'overall-gpa', 'title': 'Overall GPA', 'description': 'At least 2.0 overall GPA.', 'sourceIds': [sid]},
                 {'id': 'degree-application', 'title': 'Graduation application', 'description': 'Submit the degree completion application during the final anticipated semester.', 'sourceIds': [sid]}],
             'policyEvidence': {
                 'institutionMinCredits': {'value': 30, 'creditSystem': 'semester', 'sourceIds': [sid]},
                 'externalMaxCredits': {'value': 90, 'creditSystem': 'semester', 'sourceIds': [sid], 'calculation': '120 published total minus 30 required Liberty credits. This overall ceiling is separate from exact source acceptance.'},
                 'upperMinCredits': {'value': 30, 'creditSystem': 'semester', 'sourceIds': [sid]},
                 'majorInstitutionFraction': {'value': .25, 'sourceIds': [sid]},
                 'majorResidencyBasisCredits': {'value': 42, 'creditSystem': 'semester', 'sourceIds': [sid], 'calculation': '6 major-foundational plus 36 major-course credits under Major Requirements, with six shared general-education credits counted once.'}},
             'unresolved': ['State-specific general-education additions and a student’s admission/catalog rights depend on the individual record. Published outside-course options remain separate from an individual transfer award.']}
    sections = [('general-education', 'General education / foundational skills', 'general', [req['id'] for req in requirements if req['category'] == 'general']),
                ('major-foundations', 'Major foundational courses', 'major', [req['id'] for req in requirements if req['group'] == 'major-foundations']),
                ('major-core', 'Required history courses', 'major', [req['id'] for req in requirements if req['group'] == 'major-core'])]
    for group in facts['electiveRestrictions']:
        sections.append((group, group.replace('-', ' ').capitalize(), 'major', [req['id'] for req in requirements if req['group'] == group]))
    sections.append(('free-electives', 'Free electives', 'elective', [req['id'] for req in requirements if req['group'] == 'free-electives']))
    model['curriculumSections'] = [{'id': ident, 'title': title, 'parentId': parent_id, 'requirementIds': ids, 'sourceId': sid} for ident, title, parent_id, ids in sections]
    route = {'id': route_id, 'parentId': parent['id'], 'school': facts['school'], 'title': model['title'], 'level': 'bachelor',
             'modalities': ['online'], 'url': facts['sourceUrl'], 'field': 'humanities', 'fields': ['humanities'],
             'goals': ['any-degree', 'career-growth', 'change-career']}
    return {'version': 1, 'checkedOn': facts['checkedOn'], 'routes': [route], 'models': [model]}


if __name__ == '__main__':
    encoded = json.dumps(compile_document(), ensure_ascii=False, indent=2) + '\n'
    if '--check' in sys.argv:
        assert OUTPUT.read_text() == encoded, 'Regenerate the reviewed History ledger'
    else:
        OUTPUT.write_text(encoded)
    print(json.dumps({'model': 'curriculum-liberty-history-bs-online', 'credits': 120, 'majorCredits': 42, 'upperCredits': 30, 'check': '--check' in sys.argv}))
