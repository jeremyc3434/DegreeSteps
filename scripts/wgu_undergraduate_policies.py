"""Apply a reviewed WGU undergraduate policy only to its exact current CU ledger.

The public academic API supplies receiving course identities, never provider awards.
This helper does not change outside options or infer original source credit units.
"""
from copy import deepcopy
import hashlib
import json
import math
import re

SCHOOL = 'Western Governors University'
PUBLIC = 'https://marketing-api-gateway.wgu.edu/partner/v1/public/'
PRESERVED_BSMGT = 'curriculum-wgu-catalog-ecceaa488637ac83'
HELD_CODES = {'MBA', 'BSHA', 'BSHIM'}
CATALOG_SOURCE = 'wgu-undergraduate-institutional-catalog-202611'
RESIDENCY_SOURCE = 'wgu-undergraduate-residency-policy-23797-20260918'


def norm(value):
    return re.sub('[^a-z0-9]', '', str(value).lower())


def ledger_hash(rows):
    values = sorted([[row['code'], row['title'], row['credits'], row['areaOfStudy']] for row in rows])
    return hashlib.sha256(json.dumps(values, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def reviewed_capstone_codes(program):
    """A subject-area label need not identify the required capstone's role."""
    rows = {row['code']: row for row in program['requirements']}
    area_codes = [row['code'] for row in program['requirements'] if row['areaOfStudy'] == 'Capstone']
    if 'capstoneEvidence' not in program:
        return area_codes
    evidence = program['capstoneEvidence']
    assert isinstance(evidence, list)
    codes = []
    for item in evidence:
        assert item['courseCode'] in rows and item['courseCode'] not in codes
        assert item['sourceIds'] == [program['curriculumSourceId']], 'Capstone role needs its exact current receiving-curriculum source'
        row = rows[item['courseCode']]
        if item['designationBasis'] == 'official-course-title':
            assert re.search(r'\bcapstone\b', row['title'], re.I), 'A discipline label or simulation title alone is not capstone evidence'
        else:
            assert item['designationBasis'] == 'official-course-description'
            proof = item.get('proofText', '')
            assert isinstance(proof, str) and 1 <= len(proof) <= 400
            assert norm(row['title']) in norm(proof) and re.search(r'\bis the capstone course\b', proof, re.I), 'The official description must identify this exact named course as the capstone'
        codes.append(item['courseCode'])
    assert set(area_codes) <= set(codes), 'An explicit review cannot discard a published capstone designation'
    return [row['code'] for row in program['requirements'] if row['code'] in codes]


def _no_private_fields(value):
    if isinstance(value, dict):
        assert not {'createdBy', 'modifiedBy', 'checkedOutBy', 'sec', 'builderKey', 'access_token', 'client_secret'} & set(value), 'Retain academic fields only'
        for nested in value.values():
            _no_private_fields(nested)
    elif isinstance(value, list):
        for nested in value:
            _no_private_fields(nested)


def validate_policy_batch(batch):
    """Fail closed on changed program versions, quantities, or policy sources."""
    assert batch['version'] == 1 and batch['checkedOn'] == '2026-11-17'
    assert batch['scope'] == {'school': SCHOOL, 'level': 'bachelor', 'modality': 'online', 'creditSystem': 'competency-unit'}
    facts = batch['policyFacts']
    assert facts['overallTransferFraction'] == .75 and facts['undergraduateResidencyFraction'] == .25 and facts['requiredCapstonesAdditional'] is True
    sources = {source['id']: source for source in batch['sources']}
    assert len(sources) == len(batch['sources']) and {CATALOG_SOURCE, RESIDENCY_SOURCE} <= set(sources)
    assert sources[RESIDENCY_SOURCE]['url'] == 'https://cm.wgu.edu/t5/WGU-Student-Policy-Handbook/2-1-11-Residency-Requirements-and-Credentialing/ta-p/23797'
    assert sources[RESIDENCY_SOURCE]['published'] == '2026-09-18' and sources[RESIDENCY_SOURCE]['scope'] == batch['scope']
    assert sources[CATALOG_SOURCE]['url'] == 'https://www.wgu.edu/content/dam/wgu-65-assets/western-governors/documents/institutional-catalog/2026/WGU%20Institutional%20Catalog%20-%20November%202026.pdf'
    assert sources[CATALOG_SOURCE]['sourcePages']['transferPolicy'] == [35] and sources[CATALOG_SOURCE]['sourcePages']['completeNamedCurriculum'] == [65]
    seen = set()
    for program in batch['programs']:
        assert program['modelId'] != PRESERVED_BSMGT and program['programCode'] not in HELD_CODES
        assert program['modelId'] not in seen
        seen.add(program['modelId'])
        assert re.fullmatch(r'BS[A-Z]+', program['programCode']) and re.fullmatch(r'20\d{2}(?:0[1-9]|1[0-2])', program['catalogTerm'])
        assert program['programId'] > 0 and program['recordVersion'] > 0 and program['active'] is True and program['approvalStatus'] == 'Approved'
        assert program['collegeCode'] in ['BU', 'IT', 'HE'] and program['residencyNoteFraction'] == .25
        assert program['metadataSourceUrl'] == PUBLIC + 'program/college/' + program['collegeCode']
        assert program['curriculumSourceUrl'] == PUBLIC + 'program-data?pamsCodes=' + program['programCode'] + '%3B' + program['catalogTerm']
        rows = program['requirements']
        assert rows and len(rows) == program['requirementCount'] and len({row['code'] for row in rows}) == len(rows) and len({norm(row['title']) for row in rows}) == len(rows)
        for row in rows:
            assert row['code'] and row['title'] and row['areaOfStudy'] and isinstance(row['credits'], (int, float)) and not isinstance(row['credits'], bool) and math.isfinite(row['credits']) and row['credits'] > 0
            assert not re.search(r'clinical|practicum|professional practice', row['title'] + ' ' + row['areaOfStudy'], re.I), 'Clinical or placement-dependent ledgers need a separate review'
        assert sum(row['credits'] for row in rows) == program['totalCredits'] and ledger_hash(rows) == program['ledgerSha256']
        capstones = reviewed_capstone_codes(program)
        assert program['capstoneCourseCodes'] == capstones
        assert program['applyResidency'] is bool(capstones), 'Do not infer a zero-capstone rule from a missing designation'
        if program['applyResidency'] and 'calculatedInstitutionMinimumCUs' in program:
            minimum = program['totalCredits'] * .25 + sum(row['credits'] for row in rows if row['code'] in capstones)
            assert program['calculatedInstitutionMinimumCUs'] == minimum <= program['totalCredits']
        assert {program['curriculumSourceId'], program['metadataSourceId']} <= set(program['sourceIds']) <= set(sources)
        ledger_source = sources[program['curriculumSourceId']]
        metadata_source = sources[program['metadataSourceId']]
        assert metadata_source['url'] == program['metadataSourceUrl']
        for source in [ledger_source, metadata_source]:
            assert source['kind'] == 'university' and source['checked'] == batch['checkedOn']
            assert source['scope']['schoolName'] == SCHOOL and source['scope']['programId'] == program['programId'] and source['scope']['catalogYear'] == program['catalogTerm'] and source['scope']['programCode'] == program['programCode'] and source['scope']['level'] == 'bachelor' and source['scope']['modality'] == 'online' and source['scope']['creditSystem'] == 'competency-unit'
        assert ledger_source['url'] == program['curriculumSourceUrl']
    _no_private_fields(batch)
    return batch


def apply_reviewed_undergraduate_policies(document, batch):
    validate_policy_batch(batch)
    references = {source['id']: source for source in document['sources']}
    for source in batch['sources']:
        assert source['id'] not in references or references[source['id']] == source, 'Conflicting reviewed WGU policy source'
        if source['id'] not in references:
            document['sources'].append(deepcopy(source))
            references[source['id']] = document['sources'][-1]
    for review in batch['programs']:
        candidates = [model for model in document['models'] if model['id'] == review['modelId']]
        assert len(candidates) == 1, 'Reviewed policy model must exist exactly once'
        model = candidates[0]
        assert model['school'] == SCHOOL and model['level'] == 'bachelor' and model['modalities'] == ['online'] and model['creditSystem'] == 'competency-unit'
        assert model['catalog'] in [review['baseCatalog'], review['catalogTerm']], 'Changed retained guide needs version reconciliation'
        if re.fullmatch(r'20\d{4}', model['catalog']):
            assert model['catalog'] == review['catalogTerm'], 'Do not carry a policy across changed catalog versions'
        assert model['totalCredits'] == review['totalCredits'] and len(model['requirements']) == review['requirementCount']
        original_options = deepcopy([row['options'] for row in model['requirements']])
        reviewed = {norm(row['title']): row for row in review['requirements']}
        assert {norm(row['title']) for row in model['requirements']} == set(reviewed), 'Current complete named curriculum must match the retained ledger'
        caps = []
        for row in model['requirements']:
            current = reviewed[norm(row['title'])]
            assert row['credits'] == current['credits'] and (not row.get('code') or row['code'] == current['code']), 'Receiving course identity or CU value changed'
            row['code'] = current['code']
            row['sourceIds'] = list(dict.fromkeys(row['sourceIds'] + [review['curriculumSourceId']]))
            if current['code'] in review['capstoneCourseCodes']:
                assert not row['options'], 'A required institutional capstone cannot retain an outside option'
                row['institutionalOnly'] = True
                row['category'] = 'capstone'
                caps.append(row)
        model['catalog'] = review['catalogTerm']
        model['externalMaxCredits'] = model['alternativeMaxCredits'] = review['totalCredits'] * .75
        model['policySourceIds'] = list(dict.fromkeys(model.get('policySourceIds', []) + [CATALOG_SOURCE, RESIDENCY_SOURCE] + review['sourceIds']))
        model['alternativeCapSourceIds'] = list(dict.fromkeys(model.get('alternativeCapSourceIds', []) + [CATALOG_SOURCE]))
        model['policyEvidence'] = {**model.get('policyEvidence', {}), 'externalMaxCredits': {'value': model['externalMaxCredits'], 'fraction': .75, 'basisCredits': model['totalCredits'], 'creditSystem': 'competency-unit', 'sourceIds': [CATALOG_SOURCE], 'note': 'Overall university ceiling. Exact receiving-course approval and required WGU coursework may allow fewer outside CUs.'}, 'alternativeMaxCredits': {'value': model['alternativeMaxCredits'], 'creditSystem': 'competency-unit', 'sourceIds': [CATALOG_SOURCE], 'note': 'Alternative credit shares the overall ceiling; this is not approval of any provider or outside course.'}}
        resolved = {'field': 'upperMinCredits', 'status': 'resolved', 'resolution': 'covered-by-complete-named-curriculum', 'sourceIds': [CATALOG_SOURCE, review['curriculumSourceId']], 'sourcePages': {CATALOG_SOURCE: [65]}, 'message': f"The complete {review['requirementCount']}-course, {review['totalCredits']}-CU {review['programCode']} {review['catalogTerm']} curriculum is enforced through its current named receiving requirements. A separate semester upper-level aggregate is not assumed; outside-course approvals and required institutional work remain separate checks."}
        model['policyReview'] = [item for item in model.get('policyReview', []) if item['field'] != 'upperMinCredits'] + [resolved]
        if review['applyResidency']:
            credits = sum(row['credits'] for row in caps)
            non_capstone = model['totalCredits'] * .25
            model['residencyPolicy'] = {'type': 'institution-fraction-with-capstone-exclusion', 'creditScope': 'active-program', 'creditSystem': 'competency-unit', 'fraction': .25, 'capstoneRequirementIds': [row['id'] for row in caps], 'capstoneCredits': credits, 'sourceIds': [RESIDENCY_SOURCE, review['curriculumSourceId']] + review['sourceIds'], 'interpretationStatus': 'verified-additional-capstone', 'calculatedMinimumInstitutionCUs': non_capstone + credits, 'primaryPolicySections': ['IV.2', 'IV.3.a', 'IV.3.b.i'], 'conservativeSufficientCondition': {'minimumNonCapstoneInstitutionCUs': non_capstone, 'basisCredits': model['totalCredits'], 'derivation': '25% of active undergraduate degree CUs earned directly in that WGU program, in addition to required capstone CUs.'}, 'notes': ['Only passed CUs earned within the active WGU program count toward this rule. Prior WGU or other outside credit is not automatically counted as active-program residency.']}
        obsolete = {'Confirm the student’s applicable program catalog; the official program-guide version is recorded above.', 'WGU course identifiers are not printed in the guide; titles are retained without invented course codes.'}
        old_residency_note = 'Confirm the exact residency calculation, including the capstone exclusion, with WGU. No guessed numeric institutional minimum or overall transfer cap is assigned.'
        if review['applyResidency']:
            obsolete.add('Confirm the exact residency calculation, including the capstone exclusion, with WGU. No guessed numeric institutional minimum or overall transfer cap is assigned.')
        model['unresolved'] = ['DegreeSteps must review required-capstone applicability for this exact program before calculating its institutional minimum; the overall 75% ceiling is already source-backed.' if note == old_residency_note else note for note in model['unresolved'] if note not in obsolete]
        model['policyCheckedOn'] = batch['checkedOn']
        model['curriculumReview'] = {'status': 'current-complete-named-ledger', 'programId': review['programId'], 'programCode': review['programCode'], 'catalog': review['catalogTerm'], 'recordVersion': review['recordVersion'], 'ledgerSha256': review['ledgerSha256'], 'sourceIds': review['sourceIds'], 'checkedOn': batch['checkedOn'], 'outsideEquivalenciesReviewed': False}
        assert original_options == [row['options'] for row in model['requirements']], 'Institutional policy review must not change outside-course evidence or quantities'
    document['checkedOn'] = max(document['checkedOn'], batch['checkedOn'])
    return document
