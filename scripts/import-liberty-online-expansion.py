#!/usr/bin/env python3
"""RETIRED as a Liberty source of truth (2026-11-20). Liberty curricula now compile from content/pathway-kits/liberty
via `npm run factory:publish`; its invariants live in content/pathway-kits/liberty/guards.mjs. Kept for history;
do not run it to regenerate content/curricula/liberty*.json.

Reproduce complete online ledgers from separately reviewed official facts.

This does not infer degree requirements or transfer awards from degree titles.
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FACT_PATH = ROOT / 'content/curricula/snapshots/liberty/healthcare-administration-online-2026-2027-reviewed.json'
OUTPUT = ROOT / 'content/curricula/liberty-online-expansion.json'


def compile_document():
    facts = json.loads(FACT_PATH.read_text())
    published = facts['published']
    assert facts['catalog'] == '2026-2027'
    assert published['totalCredits'] == 120
    assert sum(row[2] for row in facts['foundations']) == published['majorFoundationCredits'] == 9
    assert sum(row[2] for row in facts['majorCore']) == published['majorCoreCredits'] == 57
    assert published['generalEducationCredits'] == [39, 42]
    assert published['univ104Credits'] == [0, 3]
    assert published['freeElectiveCredits'] == [12, 24]
    catalog = json.loads((ROOT / 'dist/data/program-catalog.json').read_text())
    parents = [route for route in catalog['programs']
               if route['school'] == facts['school'] and route['title'] == 'Healthcare Administration Major (B.S.)']
    assert len(parents) == 1, 'Keep the exact reviewed directory target'
    parent = parents[0]
    route_id = parent['id'] + '-online'
    sid = 'liberty-healthcare-administration-online-2026-2027'
    gen_sid = 'liberty-online-approved-gened'
    source = {'id': sid, 'title': facts['title'] + ' official degree completion plan, 2026–27',
              'url': facts['sourceUrl'], 'checked': facts['checkedOn']}
    gen_source = {'id': gen_sid, 'title': 'Liberty approved general-education courses for online programs, 2026–27',
                  'url': facts['generalEducationSelectionEvidence']['url'],
                  'checked': facts['generalEducationSelectionEvidence']['checkedOn']}
    tuition_source = {'id': 'liberty-healthcare-online-tuition-2026-2027',
                      'title': 'Liberty 2026–27 standard online undergraduate tuition',
                      'url': 'https://catalog.liberty.edu/undergraduate/admission/expenses-financial-policy-online-program/',
                      'checked': facts['checkedOn'], 'evidenceType': 'official-tuition',
                      'scope': 'Standard undergraduate per-credit tuition before financial aid. Fees and other expenses require separate estimates.'}

    def row(code, title, credits, category, group):
        upper = 300 <= int(code.split()[1]) < 500
        result = {'id': code.lower().replace(' ', '-'), 'code': code, 'title': title,
                  'credits': credits, 'category': category, 'group': group, 'upper': upper,
                  'sourceIds': [sid], 'options': []}
        if category == 'major' and upper:
            result['minimumGrade'] = 'C'
        return result

    requirements = []
    for code, title, credits, group in facts['generalEducationSelection']:
        requirement = row(code, title, credits, 'general', group)
        requirement['sourceIds'] = [sid, gen_sid]
        requirement['allocationBasis'] = 'Proposed approved general-education course choice; no overlap with this baseline’s major foundations.'
        requirements.append(requirement)
    assert sum(req['credits'] for req in requirements) == 39
    requirements.append(row('UNIV 104', 'Instructional Technology for Successful Online Learning', 3, 'general', 'technology'))
    requirements.extend(row(*fact, 'major', 'major-foundations') for fact in facts['foundations'])
    requirements.extend(row(*fact, 'major', 'major-core') for fact in facts['majorCore'])
    requirements.append({'id': 'free-electives', 'title': 'Free electives', 'credits': 12,
                         'category': 'electives', 'group': 'free-electives', 'bucket': True,
                         'freeElective': True, 'upper': False, 'sourceIds': [sid], 'options': [],
                         'notes': 'Twelve credits are the published lower end of the 12–24-credit free-elective range, under the retained three-credit UNIV 104 and no-overlap general-education scenario.'})
    assert sum(req['credits'] for req in requirements) == published['totalCredits']
    assert len({req['id'] for req in requirements}) == len(requirements)
    major_ids = [req['id'] for req in requirements if req['category'] == 'major']
    model = {
        'id': 'curriculum-liberty-healthcare-administration-bs-online', 'routeIds': [route_id],
        'school': facts['school'], 'title': 'Healthcare Administration (B.S.) — Online',
        'level': 'bachelor', 'format': 'Online', 'modalities': ['online'],
        'defaultProviders': ['Sophia', 'Study.com', 'StraighterLine', 'CLEP'],
        'catalog': '2026–2027', 'catalogYear': '2026-2027', 'creditSystem': 'semester',
        'totalCredits': published['totalCredits'], 'institutionMinCredits': published['institutionMinCredits'],
        'externalMaxCredits': published['totalCredits'] - published['institutionMinCredits'],
        'upperMinCredits': published['upperMinCredits'],
        'majorInstitutionFraction': published['majorInstitutionFraction'],
        'majorResidencyBasisCredits': published['majorFoundationCredits'] + published['majorCoreCredits'],
        'catalogParentId': parent['id'], 'coverage': 'complete', 'completeExecutablePathway': False,
        'coverageLabel': 'Published complete requirement ledger with proposed approved-course choices; transfer placements require separate evidence.',
        'requirements': requirements, 'sources': [source, gen_source, tuition_source],
        'tuitionComparison': {'entryId': 'liberty-online', 'checkedOn': facts['checkedOn'],
                              'sourceUrl': tuition_source['url'], 'catalogYear': facts['catalog']},
        'rulesNotes': facts['notes'],
        'unresolved': ['Confirm your catalog, home-state general-education additions, prerequisites, and individual transfer evaluation before enrolling.',
                       'Major-foundation overlap is optional in the published plan. This baseline uses no overlap; a different approved allocation can change elective quantities.',
                       'An outside course is proposed only when a separately sourced receiving-course equivalency is available; university fallback rows do not establish that outside credit is prohibited.'],
        'univ104Scenario': {'baselineCredits': 3, 'publishedCreditsRange': [0, 3],
                            'zeroCreditCaseRequiresIndividualConfirmation': True,
                            'replacementElectiveCreditsIfZero': 3, 'sourceIds': [sid]},
        'obligations': [{'title': 'UNIV 104 evaluation', 'notes': 'The source prints 0–3 credits. This ledger retains 3; only a university-confirmed zero-credit case releases 3 credits for additional electives.', 'sourceIds': [sid]}],
        'gradePolicy': {'minimumGrade': 'C', 'scope': 'upper-level-major', 'checked': facts['checkedOn'], 'sourceIds': [sid],
                        'detail': 'C minimum in upper-level major courses only; this statement is not extended to lower-level foundations or all general education.'},
        'graduationRequirements': [
            {'id': 'gpa', 'title': 'Overall GPA', 'description': 'At least 2.0 overall GPA.', 'sourceIds': [sid]},
            {'id': 'degree-application', 'title': 'Graduation application', 'description': 'Submit the degree completion application within the final semester of anticipated graduation.', 'sourceIds': [sid]},
            {'id': 'major-minimum-grade', 'title': 'Upper-level major course grades', 'description': 'At least C in upper-level major courses.', 'sourceIds': [sid]}],
        'curriculumSections': [
            {'id': 'general-education', 'title': 'General education / foundational skills', 'parentId': 'general',
             'requirementIds': [req['id'] for req in requirements if req['category'] == 'general'], 'sourceId': sid},
            {'id': 'major-foundations', 'title': 'Major foundational courses', 'parentId': 'major',
             'requirementIds': [req['id'] for req in requirements if req['group'] == 'major-foundations'], 'sourceId': sid},
            {'id': 'major-core', 'title': 'Healthcare administration major core', 'parentId': 'major',
             'requirementIds': [req['id'] for req in requirements if req['group'] == 'major-core'], 'sourceId': sid},
            {'id': 'free-electives', 'title': 'Free electives', 'parentId': 'elective',
             'requirementIds': ['free-electives'], 'sourceId': sid}]
    }
    assert sum(req['credits'] for req in requirements if req['id'] in major_ids) == model['majorResidencyBasisCredits'] == 66
    route = {'id': route_id, 'parentId': parent['id'], 'school': facts['school'], 'title': model['title'],
             'level': 'bachelor', 'modalities': ['online'], 'url': facts['sourceUrl'], 'field': 'health',
             'fields': ['health', 'business'], 'goals': ['any-degree', 'career-growth', 'change-career']}
    return {'version': 1, 'checkedOn': facts['checkedOn'], 'routes': [route], 'models': [model]}


if __name__ == '__main__':
    encoded = json.dumps(compile_document(), ensure_ascii=False, indent=2) + '\n'
    if '--check' in sys.argv:
        assert OUTPUT.read_text() == encoded, 'Regenerate the reviewed Liberty online expansion'
    else:
        OUTPUT.write_text(encoded)
    print(json.dumps({'file': str(OUTPUT.relative_to(ROOT)), 'models': 1, 'degreeCredits': 120,
                      'majorBasisCredits': 66, 'check': '--check' in sys.argv}))
