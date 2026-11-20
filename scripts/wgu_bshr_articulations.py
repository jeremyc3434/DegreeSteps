"""Apply exact BSHR receiving maps while reusing only independent provider facts.

The reviewed agreement contains several business programs. A provider course's
identity may be reused; another program's receiving award may never be reused.
No network access or student record is involved in this compilation step.
"""
from copy import deepcopy
import hashlib
import json
import re

MODEL = 'curriculum-wgu-catalog-2e49db64c32dfc79'
IDENTITY_MODEL = 'curriculum-wgu-catalog-ecceaa488637ac83'
PUBLIC = 'https://marketing-api-gateway.wgu.edu/partner/v1/public/'


def ledger_hash(rows):
    rows = sorted([[r['code'], r['title'], r['credits'], r['areaOfStudy']] for r in rows])
    return hashlib.sha256(json.dumps(rows, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def validate_review(packet):
    assert packet['version'] == 1 and packet['checkedOn'] == '2026-11-17'
    assert packet['scope'] == {'school': 'Western Governors University', 'modelId': MODEL, 'programId': 209, 'programCode': 'BSHR', 'catalog': '202509', 'level': 'bachelor', 'modality': 'online', 'creditSystem': 'competency-unit', 'totalCredits': 117}
    p = packet['program']
    assert p['id'] == 209 and p['programCode'] == 'BSHR' and p['catalogTerm'] == '202509' and p['active'] is True and p['approvalStatus'] == 'Approved' and p['recordVersion'] == 19
    assert p['sourceUrl'] == PUBLIC + 'program/college/BU'
    rows = {r['code']: r for r in packet['requirements']}
    assert len(rows) == len(packet['requirements']) == 39 and sum(r['credits'] for r in rows.values()) == 117
    assert ledger_hash(packet['requirements']) == packet['ledgerSha256']
    agreements = {a['provider']: a for a in packet['agreements']}
    assert set(agreements) == {'Sophia', 'Study.com'}
    for provider, aid, version in [('Sophia', 7112, 186), ('Study.com', 4429, 114)]:
        a = agreements[provider]
        assert a['id'] == aid and a['recordVersion'] == version and a['published'] is True and a['status'] == 'APPROVED'
        assert a['sourceUrl'] == PUBLIC + 'partner-agreement/' + str(aid) and a['checkedOn'] == packet['checkedOn']
    seen = set()
    assert len(packet['receivingClaims']) == 50
    for claim in packet['receivingClaims']:
        key = (claim['provider'], claim['receivingCode'])
        assert key not in seen and claim['receivingCode'] in rows
        seen.add(key)
        row, a = rows[claim['receivingCode']], agreements[claim['provider']]
        assert claim['programId'] == 209 and claim['programCode'] == 'BSHR' and claim['catalogTerm'] == '202509'
        assert claim['creditSystem'] == 'competency-unit' and claim['credits'] == row['credits'] and claim['receivingTitle'] == row['title']
        assert claim['agreementId'] == a['id'] and claim['agreementRecordVersion'] == a['recordVersion'] and claim['sourceUrl'] == a['sourceUrl']
        assert claim['pathwayId'] > 0 and claim['mappingId'] > 0 and claim['approvedSourceCodes']
        assert len(set(claim['approvedSourceCodes'])) == len(claim['approvedSourceCodes'])
        for code in claim['approvedSourceCodes']:
            assert re.fullmatch(r'(SOPH|SDCM)-\d{4}', code) and code.startswith('SOPH-' if claim['provider'] == 'Sophia' else 'SDCM-') and code in claim['originalPartnerCourseText']
    assert 'D360' not in {r['receivingCode'] for r in packet['receivingClaims']}, 'Capstone must remain university coursework'
    def public_only(value):
        if isinstance(value, dict):
            assert not {'createdBy', 'modifiedBy', 'checkedOutBy', 'sec', 'builderKey', 'access_token', 'client_secret'} & set(value)
            for v in value.values(): public_only(v)
        elif isinstance(value, list):
            for v in value: public_only(v)
    public_only(packet)
    return packet


def apply_bshr_articulations(document, packet):
    validate_review(packet)
    model = next(m for m in document['models'] if m['id'] == MODEL)
    identity_model = next(m for m in document['models'] if m['id'] == IDENTITY_MODEL)
    assert model['school'] == packet['scope']['school'] and model['catalog'] == '202509' and model['totalCredits'] == 117 and model['creditSystem'] == 'competency-unit'
    assert model['curriculumReview']['ledgerSha256'] == packet['ledgerSha256'] and model['curriculumReview']['programId'] == 209
    rows = {r['code']: r for r in model['requirements']}
    assert len(rows) == 39 and all(rows[r['code']]['title'] == r['title'] and rows[r['code']]['credits'] == r['credits'] for r in packet['requirements'])
    assert rows['D360']['institutionalOnly'] and model['residencyPolicy']['calculatedMinimumInstitutionCUs'] == 32.25
    refs = {s['id']: s for s in document['sources']}
    identities = {}
    for row in identity_model['requirements']:
        for option in row['options']:
            if option['evidence'] != 'published': continue
            assert option['sourceCreditStatus'] == 'verified' and option['sourceCredits'] > 0 and option['sourceCreditSystem'] == 'semester'
            assert option['identitySourceIds'] and set(option['identitySourceIds']) <= set(refs)
            identities[(option['provider'], option['code'])] = option
    source_ids = {}
    for agreement in packet['agreements']:
        provider = agreement['provider']
        sid = 'wgu-bshr-' + ('sophia' if provider == 'Sophia' else 'study') + '-approved-' + str(agreement['id']) + '-v' + str(agreement['recordVersion'])
        source = {'id': sid, 'title': 'WGU published approved ' + provider + ' Human Resource Management 202509 course map', 'url': agreement['sourceUrl'], 'kind': 'university', 'roles': ['receiving-map'], 'scope': {'schoolName': model['school'], 'programName': model['title'], 'level': 'bachelor', 'modality': 'online', 'catalogYear': '202509'}, 'provider': provider, 'checked': packet['checkedOn'], 'evidenceType': 'official-receiving-school-equivalency', 'programId': 209, 'catalogTerm': '202509', 'agreementId': agreement['id'], 'agreementRecordVersion': agreement['recordVersion'], 'published': True, 'approvalStatus': 'APPROVED'}
        assert sid not in refs or refs[sid] == source
        if sid not in refs: document['sources'].append(source); refs[sid] = source
        source_ids[provider] = sid
    prior_ids = {}
    for row in model['requirements']:
        for option in row['options']:
            key = (row['id'], option['provider'], option.get('code'), option['credits'])
            assert key not in prior_ids, 'Ambiguous old course identity needs review before retaining an option ID'
            prior_ids[key] = option['id']
        row['options'] = [o for o in row['options'] if o['provider'] not in source_ids]
    count = 0
    identity_fields = ['provider', 'title', 'code', 'codeAliases', 'sourceCredits', 'sourceCreditSystem', 'creditOrigin', 'sourceType', 'url', 'identitySourceIds', 'sourceCreditStatus', 'sourceCreditVerification', 'sourceCreditBasis', 'sourceUpper']
    for claim in packet['receivingClaims']:
        row = rows[claim['receivingCode']]
        assert not row.get('institutionalOnly'), 'A mapped outside course cannot replace the required capstone'
        for code in claim['approvedSourceCodes']:
            identity = identities.get((claim['provider'], code))
            if identity is None: continue
            option = {key: deepcopy(identity[key]) for key in identity_fields if key in identity}
            sid = source_ids[claim['provider']]
            option.update({'id': 'wgu-bshr-' + ('sophia' if claim['provider'] == 'Sophia' else 'study') + '-' + code.lower() + '-' + row['code'].lower(), 'credits': row['credits'], 'creditSystem': 'competency-unit', 'receivingCode': row['code'], 'receivingTitle': row['title'], 'sourceIds': [sid], 'evidence': 'published', 'evidenceType': 'official-receiving-school-equivalency', 'conditions': ['This exact published match applies to WGU Human Resource Management catalog202509/program209. Complete coursework and send original issuer records before starting at WGU.', 'One original source course may satisfy only one WGU requirement; alternative placements do not create duplicate credit.'], 'mappingChecked': packet['checkedOn'], 'mappingReviewId': packet['id'], 'universityMapRecord': {k: claim[k] for k in ['programId', 'catalogTerm', 'agreementId', 'agreementRecordVersion', 'pathwayId', 'pathwayRecordVersion', 'mappingId', 'mappingRecordVersion']}, 'mappingEvidence': {'schoolName': model['school'], 'programName': model['title'], 'level': 'bachelor', 'modality': 'online', 'catalogYear': '202509', 'provider': claim['provider'], 'providerCourseCode': code, 'receivingCode': row['code'], 'credits': row['credits'], 'creditSystem': 'competency-unit', 'creditOrigin': option['creditOrigin'], 'sourceIds': [sid], 'programId': 209, 'agreementId': claim['agreementId'], 'mappingId': claim['mappingId']}})
            old_id = prior_ids.get((row['id'], option['provider'], option['code'], option['credits']))
            if old_id: option['id'] = old_id
            row['options'].append(option); count += 1
    assert count == 39, 'Changed reusable provider identities need explicit review'
    obsolete = {'These are the complete named standard-path courses in the cited WGU guide. Current individual transfer approval and receiving level remain unresolved on each outside option.', 'University courses without an outside option are not proof that no transfer exists. Additional approved provider matches require further current program-specific research.'}
    model['unresolved'] = [note for note in model['unresolved'] if note not in obsolete]
    model['rulesNotes'] += ['The reviewed template uses exact published program209/catalog202509 receiving maps and separately verified provider course identities. Other credit sources may offer additional options; this template does not claim every possible source has been exhausted.']
    model['transferEvidenceReview'] = {'id': packet['id'], 'checkedOn': packet['checkedOn'], 'programId': 209, 'catalog': '202509', 'receivingClaimsReviewed': 50, 'sourceIdentitiesReusedByExactProviderCode': count, 'sourceIds': list(source_ids.values()), 'studentCreditsAwarded': 0}
    model['mappingCheckedOn'] = max(model.get('mappingCheckedOn', ''), packet['checkedOn'])
    return document
