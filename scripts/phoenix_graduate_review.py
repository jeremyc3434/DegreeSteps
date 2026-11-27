"""Bind the exact Phoenix graduate CBE baselines to retained primary evidence.

This is an academic authoring review, not an admissions decision or an incoming
credit approval. Undergraduate Phoenix models are intentionally outside scope.
"""
import copy
import hashlib
import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVIEW_PATH = 'content/curricula/snapshots/cbe/phoenix-graduate-review-2026-11-27.json'
ROUTES = {'phoenix-cb-mba', 'phoenix-cb-mis', 'phoenix-cb-mha', 'phoenix-da-ms-psychology'}


def normalize(value):
    value = unicodedata.normalize('NFKC', str(value)).replace('’', "'").replace('–', '-').replace('—', '-')
    return re.sub(r'\s+', ' ', value).strip()


@lru_cache(maxsize=1)
def load_review():
    review = json.loads((ROOT / REVIEW_PATH).read_text())
    assert review['version'] == 1 and review['id'] == 'phoenix-graduate-cbe-primary-review-2026-11-27'
    assert review['checkedOn'] == '2026-11-27' and review['school'] == 'University of Phoenix'
    assert {p['routeId'] for p in review['programs']} == ROUTES
    assert review['individualAwardsCreated'] == 0 and review['transferAwardsCreated'] == 0
    texts = {}
    for source in review['sources']:
        assert re.fullmatch(r'content/source-captures/[a-f0-9]{16}\.txt', source['capture'])
        raw = (ROOT / source['capture']).read_bytes()
        metadata = json.loads((ROOT / source['capture'].replace('.txt', '.json')).read_text())
        assert hashlib.sha256(raw).hexdigest() == source['sha256'] == metadata['sha256']
        assert metadata['status'] == 200 and metadata['url'] == source['url']
        assert metadata['fetchedAt'] == source['originalRetrievedAt']
        assert source['checked'] == review['checkedOn'] and source['originalRetrievedAt'][:10] == review['checkedOn']
        assert source['url'].startswith('https://www.phoenix.edu/')
        if 'pages' in source:
            assert metadata['pages'] == source['pages'] and metadata['columns'] == source['columns']
            assert metadata['documentSha256'] == source['documentSha256']
        role = source['id'].removeprefix('phoenix-graduate-').removesuffix('-20261127')
        texts[role] = normalize(raw.decode())
    cover = texts['cover']
    assert 'Effective July 1, 2026' in cover and 'Through June 30, 2027' in cover and 'November 1, 2026' in cover
    for program in review['programs']:
        for quote in program['quotes']:
            assert normalize(quote['text']).lower() in texts[quote['sourceRole']].lower(), (program['routeId'], quote)
        body = texts[program['catalogRole']]
        rows = list(re.finditer(r'([A-Z]{3,6} \d{3})[.\s]+(\d+) (credits|CUs)\b', body))
        expected = program['requirements']
        assert len(rows) == len(expected), (program['routeId'], len(rows), len(expected))
        assert [(x.group(1), int(x.group(2))) for x in rows] == [(r['code'], r['credits']) for r in expected]
        for index, (row, original) in enumerate(zip(rows, expected)):
            # PDF full-width headings cause a few unrelated left-column lines
            # to interleave in the MBA capture. Keep the complete evidence, and
            # bind each title between its own printed code/quantity and the next
            # course row rather than silently removing those original lines.
            end = rows[index + 1].start() if index + 1 < len(rows) else len(body)
            assert normalize(original['title']) in body[row.end():end], (program['routeId'], original)
        assert sum(x['credits'] for x in expected) == program['totalCredits']
        assert all(x.group(3) == ('CUs' if program['creditSystem'] == 'competency-unit' else 'credits') for x in rows)
    return review


def apply_graduate_review(model, program):
    if program['routeId'] not in ROUTES:
        return model
    review = load_review()
    scope = next(p for p in review['programs'] if p['routeId'] == program['routeId'])
    assert model['id'] == scope['modelId'] and model['school'] == review['school'] and model['level'] == 'master'
    assert normalize(model['catalog']) == review['catalog'] and model['format'] == 'Online'
    assert model['totalCredits'] == scope['totalCredits'] and model['creditSystem'] == scope['creditSystem']
    assert [{key: r[key] for key in ['code', 'title', 'credits']} for r in model['requirements']] == scope['requirements']
    assert all(r['institutionalOnly'] is True and not r['options'] for r in model['requirements'])
    is_da = scope['creditSystem'] == 'competency-unit'
    result = copy.deepcopy(model)
    roles = {scope['catalogRole'], scope['programRole'], 'cover', 'prices', 'fees'}
    if is_da:
        roles.update({'da-policies', 'da-annual', 'admissions-page'})
    sid = lambda role: 'phoenix-graduate-' + role + '-20261127'
    catalog_id, page_id, prices_id = sid(scope['catalogRole']), sid(scope['programRole']), sid('prices')
    result['sources'] = [copy.deepcopy(source) for source in review['sources'] if source['id'] in {sid(role) for role in roles}]
    result['sourceIds'] = [source['id'] for source in result['sources']]
    result['modalities'] = ['online']
    result['catalogYear'] = '2026-2027'
    result['paceSourceUrl'] = next(source['url'] for source in result['sources'] if source['id'] == page_id)
    for row in result['requirements']:
        row['sourceIds'] = [catalog_id]
        if row['code'] == scope['capstoneCode']:
            assert row['minimumCompletedCredits'] == scope['capstoneMinimumCredits']
            row['prerequisitePolicy'] = {'status': 'reviewed-numeric-completion-minimum', 'sourceIds': [catalog_id], 'checkedOn': review['checkedOn'], 'minimumCompletedCredits': scope['capstoneMinimumCredits'], 'creditSystem': scope['creditSystem']}
    for section in result['curriculumSections']:
        section['sourceId'] = catalog_id
    result['institutionMinCredits'] = result['totalCredits']
    result['externalMaxCredits'] = result['alternativeMaxCredits'] = 0
    result['policySourceIds'] = [catalog_id]
    result['policyEvidence'] = {key: {'value': result[key], 'creditSystem': result['creditSystem'], 'sourceIds': [catalog_id], 'basis': 'All required courses must be completed in this exact Phoenix competency-based or direct-assessment program; outside transfer and courses from another UOPX program cannot waive the required coursework.'} for key in ['institutionMinCredits', 'externalMaxCredits', 'alternativeMaxCredits']}
    result['policyReview'] = [{'field': 'upperMinCredits', 'status': 'resolved', 'resolution': 'covered-by-complete-named-curriculum', 'sourceIds': [catalog_id], 'message': 'The complete named graduate course ledger is enforced; no undergraduate upper-division aggregate is imported.'}]
    result['admissionRequirements'] = [{'message': text, 'sourceIds': [catalog_id, page_id] + ([sid('admissions-page')] if is_da else [])} for text in scope['admissionRequirements']]
    result['curriculumReview'] = {'id': review['id'], 'checkedOn': review['checkedOn'], 'sourceIds': [catalog_id, sid('cover')], 'requirementsComplete': True, 'outsideAwardsProposed': 0, 'waiversAssumed': 0, 'programIdentity': scope['routeId']}
    result['admissionReview'] = {'id': review['id'], 'checkedOn': review['checkedOn'], 'sourceIds': [catalog_id, page_id], 'publishedRulesEstablished': True, 'individualAdmissionGranted': False, 'allStatesEligible': False, 'basis': 'Current official program offering and governing catalog requirements are retained. State availability, official transcripts, experience evidence and personal admission remain university decisions.'}
    result['pricing']['sourceUrl'] = result['paceSourceUrl']
    result['pricing']['sourceIds'] = [page_id, prices_id, sid('fees')]
    result['pricing']['checkedOn'] = review['checkedOn']
    assert result['pricing']['amount'] == (2749 if is_da else 300)
    assert result['pricing']['period'] == ('12 weeks' if is_da else 'credit')
    result['pricing']['notes'] = ['Published current ' + ('tuition per 12-week term; the paid term count depends on the 2–4-course schedule and demonstrated mastery.' if is_da else 'tuition per credit; the program page states no additional fees. Repeats, applicable tax and personal living costs are separate.'), 'The price is a planning input before aid, not an admission offer or guaranteed total cost.']
    result['pacePolicy'] = {'sourceIds': [page_id] + ([sid('da-policies'), sid('da-annual')] if is_da else []), 'sessionWeeks': 12 if is_da else 16, 'maximumCoursesPerTerm': 4, 'selfPacedWithinTerm': True, 'basis': 'Direct Assessment permits two, three or four courses per university-scheduled twelve-week term; mastery may accelerate work within the term, not unlimited course enrollment.' if is_da else 'Faculty-supported competency-based groups of three to four courses within sixteen-week periods; students demonstrate mastery within that university schedule, not an unlimited subscription.'}
    # CBE and billing are independent: these per-credit CB degrees must remain
    # discoverable under the existing competency-based filter without falsely
    # relabelling their tuition as a subscription.
    result['competencyBased'] = True
    result['selfPaced'] = True
    result['paceSourceIds'] = list(result['pacePolicy']['sourceIds'])
    result['paceCheckedOn'] = review['checkedOn']
    result['pacing']['sourceIds'] = result['pacePolicy']['sourceIds']
    if is_da:
        result['financialAid'] = {'federalAidEligible': False, 'sourceUrl': next(source['url'] for source in result['sources'] if source['id'] == catalog_id), 'sourceIds': [catalog_id, page_id], 'checkedOn': review['checkedOn'], 'notes': 'This exact Direct Assessment psychology program is not eligible for Title IV financial aid.'}
    result['assessmentPolicy'] = {'coursePassingMark': 'ME', 'maximumAssessmentAttempts': 3, 'sourceIds': [catalog_id] + ([sid('da-policies')] if is_da else []), 'notes': 'All competencies in each required course must receive Met or better. University progression, engagement, repeat and assessment-attempt rules still apply.'}
    result['unresolved'] = [{'message': 'Apply to this exact competency-based program, supply original degree/transcript and work-experience records, and meet its published admission conditions. Phoenix makes the individual admission and state-of-residence availability decision.', 'owner': 'student', 'status': 'personal-task', 'sourceIds': [catalog_id, page_id]}, {'message': 'Follow the university-assigned course groups and obtain accepted completed credit before the capstone; actual future section and term availability remain personal registration tasks.', 'owner': 'student', 'status': 'personal-task', 'sourceIds': [catalog_id, page_id]}]
    if is_da:
        result['unresolved'].append({'message': 'Plan financing without Title IV federal financial aid; this Direct Assessment psychology program is not eligible.', 'owner': 'student', 'status': 'personal-task', 'sourceIds': [catalog_id, page_id]})
    result['rulesNotes'] = [note for note in result['rulesNotes'] if not note.startswith('Admission, state-of-residence')]
    result['rulesNotes'] += ['Published admission routes include program-specific degree, GPA and recent work-experience conditions; an undergraduate degree alone does not establish eligibility.', 'State-of-residence availability and individual admission are decided by Phoenix. This source-backed plan is not a personal enrollment approval.']
    result['obligations'] = [{'title': 'Capstone credit prerequisite', 'notes': f"At least {scope['capstoneMinimumCredits']} completed {'CUs' if is_da else 'credits'} are required before {scope['capstoneCode']}; no fixed first-seven-course dependency is assumed.", 'sourceIds': [catalog_id]}, {'title': 'Apply to the correct competency-based program', 'notes': 'Submit official transcripts, recent work-experience evidence and applicable state/English-proficiency documentation; the university decides eligibility under the published program rules.', 'sourceIds': [catalog_id, page_id]}]
    result['evidenceCheckedOn'] = review['checkedOn']
    result['coverageLabel'] = 'Complete source-linked graduate CBE course plan; all required coursework at Phoenix, with published admission, pacing and price rules'
    result['graduateCBEReview'] = {'id': review['id'], 'checkedOn': review['checkedOn'], 'requirementsComplete': True, 'totalUniversityCredits': scope['totalCredits'], 'creditSystem': scope['creditSystem'], 'individualAdmissionGranted': False, 'outsideAwardsCreated': 0}
    return result
