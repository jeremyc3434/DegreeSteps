"""Compose exact WGU business awards from shared approved university agreements.

Provider identities are reused independently of receiving awards. An agreement
can contain many programs; every receiving claim retains its own program,
catalog, receiving quantity and mapping revision. No title-only award reuse or
student credit award occurs here. Network capture is a separate operator step.
"""
from copy import deepcopy
from datetime import date
import hashlib
import html
import json
import math
import re

SCHOOL = 'Western Governors University'
PUBLIC = 'https://marketing-api-gateway.wgu.edu/partner/v1/public/'
PROVIDERS = {
    'Sophia': {'prefix': 'SOPH', 'slug': 'sophia', 'capture': 'sophia-7112', 'agreementId': 7112, 'institutionId': 796, 'domain': 'sophia.org'},
    'Study.com': {'prefix': 'SDCM', 'slug': 'study', 'capture': 'study-4429', 'agreementId': 4429, 'institutionId': 678, 'domain': 'study.com'},
    'StraighterLine': {'prefix': 'OOSL', 'slug': 'straighterline', 'capture': 'straighterline-550', 'agreementId': 550, 'institutionId': 151, 'domain': 'straighterline.com'},
    'Saylor': {'prefix': 'SAYA', 'slug': 'saylor', 'capture': 'saylor-668', 'agreementId': 668, 'institutionId': 186, 'domain': 'saylor.org'},
}
IDENTITY_MODEL = 'curriculum-wgu-catalog-ecceaa488637ac83'
PRESERVED_MODELS = {IDENTITY_MODEL, 'curriculum-wgu-catalog-2e49db64c32dfc79'}
# Reviewed common university transfer conditions; changed prose needs semantic review.
COMMON_TRANSFER_NOTES_SHA256 = '4e6fc95f10da65d3c3f8de4febe8d8607d64b1a48f38bcb445045afc5351148a'
IDENTITY_FIELDS = ('provider', 'title', 'code', 'codeAliases', 'sourceCredits',
                   'sourceCreditSystem', 'creditOrigin', 'sourceType', 'url',
                   'identitySourceIds', 'sourceCreditStatus',
                   'sourceCreditVerification', 'sourceCreditBasis', 'sourceUpper',
                   'providerCourseEffectiveDates', 'aceId', 'courseVersion',
                   'recommendationStart', 'recommendationEnd',
                   'recommendationPeriodSourceIds', 'providerCourseCode',
                   'identityReviewId', 'identityCheckedOn', 'minScore',
                   'providerCoursePassingPercent', 'providerCoursePassingSourceIds',
                   'studyMethods', 'assessmentFormat', 'proctoringRequired')


def finite_positive(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def positive_integer(value):
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def ledger_hash(rows):
    values = sorted([[row['code'], row['title'], row['credits'], row['areaOfStudy']] for row in rows])
    return hashlib.sha256(json.dumps(values, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def source_expression(provider, text):
    """Preserve required combinations; a constituent is never a full award."""
    pattern = r'\b' + re.escape(PROVIDERS[provider]['prefix']) + r'-\d{4}\b'
    groups = [sorted(set(re.findall(pattern, part))) for part in re.split(r'\band\b', text, flags=re.I)]
    if len(groups) > 1:
        if not all(groups):
            return {'kind': 'unclassified-source-combination', 'groups': groups, 'executableAsSingleCourse': False}
        return {'kind': 'multiple-required-source-groups', 'groups': groups, 'executableAsSingleCourse': False}
    if re.search(r'\b(?:both|combination|plus|at least)\b|\+', text, re.I):
        return {'kind': 'unclassified-source-combination', 'groups': groups, 'executableAsSingleCourse': False}
    return {'kind': 'single-source-alternatives', 'groups': groups, 'executableAsSingleCourse': True}


def plain_note(value):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', value))).strip()


def recency_rules(notes, rows):
    """Bind only explicitly named receiving courses to the printed year limit."""
    result = []
    for field in ['notesCore', 'notesAdditional']:
        text = notes.get(field, '')
        if not text:
            continue
        matches = list(re.finditer(r'(.+?) must have been taken within the past (\d+) years\.?', text))
        assert matches, 'An unrecognized transfer restriction needs explicit review'
        cursor = 0
        for match in matches:
            assert not text[cursor:match.start()].strip(' ,.'), 'An unparsed transfer restriction cannot be discarded'
            names = re.sub(r'^[, .]*(?:and )?', '', match[1]).strip()
            mentioned = [row for row in rows if re.search(r'(?<![A-Za-z0-9])' + re.escape(row['title']) + r'(?![A-Za-z0-9])', names)]
            assert mentioned, 'A recency restriction must identify actual receiving courses'
            remaining = names
            for row in sorted(mentioned, key=lambda item: -len(item['title'])):
                remaining = remaining.replace(row['title'], '')
                result.append({'receivingCode': row['code'], 'years': int(match[2]), 'sourceField': field, 'sourceText': text})
            assert not re.sub(r'\band\b|[, .]', '', remaining), 'Every restricted receiving title must be bound explicitly'
            cursor = match.end()
        assert not text[cursor:].strip(' ,.'), 'An unparsed transfer restriction cannot be discarded'
    assert len({item['receivingCode'] for item in result}) == len(result)
    return sorted(result, key=lambda item: item['receivingCode'])


def apply_curriculum_areas(model, review, references):
    current = model['curriculumReview']
    expected_url = PUBLIC + 'program-data?pamsCodes=' + review['programCode'] + '%3B' + review['catalogTerm']
    source_ids = [sid for sid in current['sourceIds'] if references[sid]['url'] == expected_url]
    assert len(source_ids) == 1, 'Curriculum grouping needs its exact receiving-ledger source'
    source_id = source_ids[0]
    ledger = {row['code']: row for row in review['requirements']}
    capstone_ids = set(model.get('residencyPolicy', {}).get('capstoneRequirementIds', []))
    groups = {}
    for row in model['requirements']:
        area = ledger[row['code']]['areaOfStudy']
        is_capstone = row['id'] in capstone_ids
        if is_capstone:
            assert row.get('institutionalOnly') is True
        category = 'capstone' if is_capstone else 'general' if area == 'General Education' else 'core'
        group = re.sub(r'[^a-z0-9]+', '-', area.lower()).strip('-')
        row['category'] = category
        row['group'] = group
        row['curriculumAreaEvidence'] = {'areaOfStudy': area, 'sourceIds': [source_id], 'programId': review['programId'], 'catalogTerm': review['catalogTerm'], 'ledgerSha256': review['ledgerSha256']}
        identity = (category, area)
        if identity not in groups:
            groups[identity] = {'id': 'wgu-' + review['programCode'].lower() + '-' + category + '-' + group, 'parentId': category, 'title': area, 'credits': 0, 'requirementIds': [], 'sourceId': source_id}
        groups[identity]['credits'] += row['credits']
        groups[identity]['requirementIds'].append(row['id'])
    model['curriculumSections'] = list(groups.values())
    assert sum(section['credits'] for section in model['curriculumSections']) == model['totalCredits']


def public_only(value):
    if isinstance(value, dict):
        assert not {'createdBy', 'modifiedBy', 'checkedOutBy', 'sec', 'builderKey', 'access_token', 'client_secret'} & set(value), 'Only public academic fields may enter the review packet'
        for nested in value.values():
            public_only(nested)
    elif isinstance(value, list):
        for nested in value:
            public_only(nested)


def validate_batch(packet):
    assert packet['version'] == 1 and packet['kind'] == 'wgu-program-scoped-business-awards'
    assert packet['school'] == SCHOOL and packet['level'] == 'bachelor' and packet['modality'] == 'online' and packet['creditSystem'] == 'competency-unit'
    assert date.fromisoformat(packet['checkedOn']) <= date.today()
    assert packet['id'] and packet['studentCreditsAwarded'] == 0
    public_only(packet)
    captures = packet['captureIntegrity']
    assert len(captures) >= 3 and len({item['url'] for item in captures}) == len(captures)
    assert all(re.fullmatch(r'[a-f0-9]{64}', item['sha256']) and item['url'].startswith(PUBLIC) for item in captures)
    by_url = {item['url']: item for item in captures}
    assert PUBLIC + 'program/college/BU' in by_url
    agreements = {item['provider']: item for item in packet['agreements']}
    assert set(agreements) == set(PROVIDERS)
    for provider, agreement in agreements.items():
        assert positive_integer(agreement['id']) and positive_integer(agreement['recordVersion'])
        assert agreement['published'] is True and agreement['status'] == 'APPROVED'
        assert agreement['sourceUrl'] == PUBLIC + 'partner-agreement/' + str(agreement['id']) and agreement['sourceUrl'] in by_url
        assert agreement['checkedOn'] == packet['checkedOn']
    seen = set()
    for program in packet['programs'] + packet.get('existingPrograms', []):
        assert program['modelId'] not in seen
        assert (program['modelId'] in PRESERVED_MODELS) is (program.get('mode') == 'additive-existing-review')
        seen.add(program['modelId'])
        assert re.fullmatch(r'BS[A-Z]+', program['programCode']) and re.fullmatch(r'20\d{2}(?:0[1-9]|1[0-2])', program['catalogTerm'])
        assert positive_integer(program['programId']) and positive_integer(program['recordVersion']) and program['active'] is True and program['approvalStatus'] == 'Approved'
        assert program['metadataSourceUrl'] == PUBLIC + 'program/college/BU'
        rows = {row['code']: row for row in program['requirements']}
        assert len(rows) == len(program['requirements']) == program['requirementCount']
        assert all(row['code'] and row['title'] and row['areaOfStudy'] and finite_positive(row['credits']) for row in rows.values())
        assert sum(row['credits'] for row in rows.values()) == program['totalCredits'] and ledger_hash(program['requirements']) == program['ledgerSha256']
        assert hashlib.sha256(program['transferNotes'].get('notesFinal', '').encode()).hexdigest() == COMMON_TRANSFER_NOTES_SHA256, 'Changed common transfer conditions need a new explicit review'
        assert program['recencyRules'] == recency_rules(program['transferNotes'], program['requirements'])
        seen_claims = set()
        for claim in program['receivingClaims']:
            key = (claim['provider'], claim['receivingCode'])
            assert key not in seen_claims and claim['provider'] in agreements and claim['receivingCode'] in rows
            seen_claims.add(key)
            row = rows[claim['receivingCode']]
            agreement = agreements[claim['provider']]
            assert claim['programId'] == program['programId'] and claim['programCode'] == program['programCode'] and claim['catalogTerm'] == program['catalogTerm']
            assert claim['credits'] == row['credits'] and claim['receivingTitle'] == row['title'] and claim['creditSystem'] == 'competency-unit'
            assert claim['agreementId'] == agreement['id'] and claim['agreementRecordVersion'] == agreement['recordVersion'] and claim['sourceUrl'] == agreement['sourceUrl']
            assert positive_integer(claim['pathwayId']) and positive_integer(claim['mappingId']) and isinstance(claim['pathwayRecordVersion'], int) and not isinstance(claim['pathwayRecordVersion'], bool) and claim['pathwayRecordVersion'] >= 0 and isinstance(claim['mappingRecordVersion'], int) and not isinstance(claim['mappingRecordVersion'], bool) and claim['mappingRecordVersion'] >= 0
            assert claim['approvedSourceCodes'] and len(set(claim['approvedSourceCodes'])) == len(claim['approvedSourceCodes'])
            assert claim['sourceExpression'] == source_expression(claim['provider'], claim['originalPartnerCourseText'])
            for code in claim['approvedSourceCodes']:
                assert re.fullmatch(re.escape(PROVIDERS[claim['provider']]['prefix']) + r'-\d{4}', code) and code in claim['originalPartnerCourseText']
    return packet


def reviewed_provider_identities(document):
    """Use independent provider facts from every input model, irrespective of awards.

    Receiving approval, degree placement, and source identity have independent
    review states. A conditional school award cannot downgrade a proved source
    quantity, and a published school award cannot establish that quantity.
    """
    from urllib.parse import urlparse
    references = {source['id']: source for source in document['sources']}
    identities = {}
    for model in document['models']:
        for row in model['requirements']:
            for option in row['options']:
                if option.get('sourceCreditStatus') != 'verified':
                    continue
                if option['provider'] not in PROVIDERS:
                    continue
                key = (option['provider'], option['code'])
                assert finite_positive(option['sourceCredits']) and option['sourceCreditSystem'] == 'semester'
                assert option['identitySourceIds'] and set(option['identitySourceIds']) <= set(references)
                for sid in option['identitySourceIds']:
                    host = (urlparse(references[sid]['url']).hostname or '').lower()
                    domain = PROVIDERS[option['provider']]['domain']
                    assert host == domain or host.endswith('.' + domain) or host in {'acenet.edu', 'www.acenet.edu', 'credly.com', 'www.credly.com', 'nationalccrs.org', 'www.nationalccrs.org'}, 'A school award cannot independently establish provider credit quantities'
                verification = option['sourceCreditVerification']
                assert verification['credits'] == option['sourceCredits'] and verification['creditSystem'] == option['sourceCreditSystem'] and verification['sourceIds'] and set(verification['sourceIds']) <= set(option['identitySourceIds'])
                identity = {field: deepcopy(option[field]) for field in IDENTITY_FIELDS if field in option}
                if key in identities:
                    prior = identities[key]
                    assert prior['sourceCredits'] == identity['sourceCredits'] and prior['sourceCreditSystem'] == identity['sourceCreditSystem'], 'Conflicting provider source quantities require version-specific review'
                else:
                    identities[key] = identity
    return identities


def merge_identity_bundles(document, identities, bundles, checked_on):
    """Import separately reviewed provider facts without any receiving award."""
    from urllib.parse import urlparse
    references = {source['id']: source for source in document['sources']}
    for bundle in bundles:
        assert bundle['version'] == 1 and bundle['id'] and bundle['provider'] in PROVIDERS
        assert date.fromisoformat(bundle['checkedOn']) <= date.fromisoformat(checked_on)
        public_only(bundle)
        for source in bundle['sources']:
            assert source['id'] and source['url'].startswith('https://')
            assert source['id'] not in references or references[source['id']] == source, 'Conflicting independent provider source'
            if source['id'] not in references:
                document['sources'].append(deepcopy(source)); references[source['id']] = source
        for course in bundle['courses']:
            assert course['provider'] == bundle['provider'] and re.fullmatch(re.escape(PROVIDERS[course['provider']]['prefix']) + r'-\d{4}', course['code'])
            assert course['code'].startswith(PROVIDERS[course['provider']]['prefix'] + '-')
            assert not {'receivingCode', 'receivingTitle', 'mappingEvidence', 'universityMapRecord'} & set(course), 'Provider identities cannot carry receiving-school awards'
            assert course['sourceCreditStatus'] == 'verified' and finite_positive(course['sourceCredits']) and course['sourceCreditSystem'] == 'semester'
            assert course['identitySourceIds'] and set(course['identitySourceIds']) <= set(references)
            verification = course['sourceCreditVerification']
            assert verification['credits'] == course['sourceCredits'] and verification['creditSystem'] == course['sourceCreditSystem'] and verification['sourceIds'] and set(verification['sourceIds']) <= set(course['identitySourceIds'])
            for field in ['recommendationPeriodSourceIds', 'providerCoursePassingSourceIds']:
                if course.get(field):
                    assert isinstance(course[field], list) and set(course[field]) <= set(references), 'Independent recommendation or passing facts need their original source references'
            for sid in course['identitySourceIds']:
                host = (urlparse(references[sid]['url']).hostname or '').lower()
                domain = PROVIDERS[course['provider']]['domain']
                official = host == domain or host.endswith('.' + domain)
                assert official or host in {'acenet.edu', 'www.acenet.edu', 'credly.com', 'www.credly.com', 'nationalccrs.org', 'www.nationalccrs.org'}, 'A receiving-school guide cannot independently verify a provider course'
            if course.get('recommendationStart'):
                assert date.fromisoformat(course['recommendationStart']) <= date.fromisoformat(checked_on)
            if course.get('recommendationEnd'):
                assert date.fromisoformat(checked_on) <= date.fromisoformat(course['recommendationEnd'])
            identity = {field: deepcopy(course[field]) for field in IDENTITY_FIELDS if field in course}
            key = (course['provider'], course['code'])
            if key in identities:
                prior = identities[key]
                assert prior['sourceCredits'] == identity['sourceCredits'] and prior['sourceCreditSystem'] == identity['sourceCreditSystem'], 'Changed source quantities require version-specific award review'
                continue
            identities[key] = identity
    return identities


def apply_business_awards(document, packet, identity_bundles=()):
    """Compile all exact programs in a reviewed packet in one deterministic pass."""
    validate_batch(packet)
    result = deepcopy(document)
    references = {source['id']: source for source in result['sources']}
    identities = reviewed_provider_identities(result)
    identities = merge_identity_bundles(result, identities, identity_bundles, packet['checkedOn'])
    references = {source['id']: source for source in result['sources']}
    agreements = {agreement['provider']: agreement for agreement in packet['agreements']}
    report = {'packetId': packet['id'], 'checkedOn': packet['checkedOn'], 'programs': [], 'studentCreditsAwarded': 0}
    for review in packet['programs'] + packet.get('existingPrograms', []):
        additive = review.get('mode') == 'additive-existing-review'
        candidates = [model for model in result['models'] if model['id'] == review['modelId']]
        assert len(candidates) == 1
        model = candidates[0]
        assert model.get('auditProvenance', {}).get('status') != 'student-provided'
        assert model['school'] == SCHOOL and model['level'] == 'bachelor' and model['modalities'] == ['online'] and model['creditSystem'] == 'competency-unit'
        assert model['catalog'] == review['catalogTerm'] and model['totalCredits'] == review['totalCredits']
        if additive:
            existing = model['transferEvidenceReview']
            assert existing['programId'] == review['programId'] and existing['catalog'] == review['catalogTerm'] and existing.get('studentCreditsAwarded', 0) == 0, 'An additive update requires the exact existing reviewed receiving program'
        else:
            current_review = model['curriculumReview']
            assert current_review['status'] == 'current-complete-named-ledger' and current_review['programId'] == review['programId'] and current_review['programCode'] == review['programCode'] and current_review['catalog'] == review['catalogTerm'] and current_review['ledgerSha256'] == review['ledgerSha256']
        rows = {row['code']: row for row in model['requirements']}
        normalize = lambda value: re.sub(r'[^a-z0-9]', '', value.lower())
        assert len(rows) == review['requirementCount'] and all(normalize(rows[row['code']]['title']) == normalize(row['title']) and rows[row['code']]['credits'] == row['credits'] for row in review['requirements'])
        if not additive:
            apply_curriculum_areas(model, review, references)
        metadata_id = 'wgu-business-' + review['programCode'].lower() + '-transfer-notes-v' + str(review['recordVersion'])
        metadata_source = {'id': metadata_id, 'title': 'WGU exact ' + review['programCode'] + ' transfer conditions and course recency', 'url': review['metadataSourceUrl'], 'kind': 'university', 'roles': ['policy'], 'scope': {'schoolName': SCHOOL, 'programName': model['title'], 'programId': review['programId'], 'catalogYear': review['catalogTerm'], 'level': 'bachelor', 'modality': 'online'}, 'checked': packet['checkedOn'], 'publicRecordId': review['programId'], 'publicRecordVersion': review['recordVersion'], 'sha256': next(item['sha256'] for item in packet['captureIntegrity'] if item['url'] == review['metadataSourceUrl']), 'notes': deepcopy(review['transferNotes'])}
        assert metadata_id not in references or references[metadata_id] == metadata_source
        if metadata_id not in references:
            result['sources'].append(metadata_source); references[metadata_id] = metadata_source
        recencies = {}
        for rule in review['recencyRules']:
            row = rows[rule['receivingCode']];row['transferRecencyYears'] = rule['years'];row['transferRecencySourceIds'] = [metadata_id];recencies[row['code']] = rule['years']
        model['transferRules'] = {**model.get('transferRules', {}), 'courseSpecificRecencyYears': {**model.get('transferRules', {}).get('courseSpecificRecencyYears', {}), **recencies}, 'recencySourceIds': [metadata_id], 'publishedNotes': deepcopy(review['transferNotes'])}
        model['rulesNotes'] = list(dict.fromkeys(model.get('rulesNotes', []) + [review['transferNotes']['notesFinal']]))
        source_ids = {}
        for provider, agreement in agreements.items():
            sid = 'wgu-business-' + review['programCode'].lower() + '-' + PROVIDERS[provider]['slug'] + '-' + str(agreement['id']) + '-v' + str(agreement['recordVersion'])
            scope = {'schoolName': SCHOOL, 'programName': model['title'], 'level': 'bachelor', 'modality': 'online', 'catalogYear': review['catalogTerm']}
            source = {'id': sid, 'title': 'WGU approved ' + provider + ' receiving map for ' + review['programCode'] + ' ' + review['catalogTerm'], 'url': agreement['sourceUrl'], 'kind': 'university', 'roles': ['receiving-map'], 'scope': scope, 'provider': provider, 'checked': packet['checkedOn'], 'evidenceType': 'official-receiving-school-equivalency', 'programId': review['programId'], 'catalogTerm': review['catalogTerm'], 'agreementId': agreement['id'], 'agreementRecordVersion': agreement['recordVersion'], 'published': True, 'approvalStatus': 'APPROVED', 'sha256': next(item['sha256'] for item in packet['captureIntegrity'] if item['url'] == agreement['sourceUrl'])}
            assert sid not in references or references[sid] == source
            if sid not in references:
                result['sources'].append(source)
                references[sid] = source
            source_ids[provider] = sid
        previous_review = model.get('additionalProviderIdentityReview' if additive else 'transferEvidenceReview', {})
        retired_invalid_options = deepcopy(previous_review.get('retiredInvalidSingleCourseOptions', [])) if previous_review.get('id') == packet['id'] else []
        complex_claims = {(claim['provider'], claim['receivingCode']): claim for claim in review['receivingClaims'] if not claim['sourceExpression']['executableAsSingleCourse']}
        prior_ids = {}
        for row in model['requirements']:
            retained = []
            for option in row['options']:
                combination = complex_claims.get((option['provider'], row['code']))
                if combination and option.get('code') in combination['approvedSourceCodes']:
                    retired_invalid_options.append({'requirementId': row['id'], 'optionId': option['id'], 'provider': option['provider'], 'sourceCode': option['code'], 'receivingCode': row['code'], 'reason': 'This source course is one constituent of a required combination; it cannot independently satisfy the complete receiving award.'})
                else:
                    retained.append(option)
            row['options'] = retained
            for option in row['options']:
                key = (row['id'], option['provider'], option.get('code'), option['credits'])
                assert key not in prior_ids, 'An ambiguous existing source identity needs review before preserving its ID'
                prior_ids[key] = option['id']
            if not additive:
                row['options'] = [option for option in row['options'] if option['provider'] not in source_ids]
        reused, missing, held_combinations = 0, set(), []
        for claim in review['receivingClaims']:
            row = rows[claim['receivingCode']]
            assert not row.get('institutionalOnly'), 'Outside coursework cannot replace university-required coursework'
            if not claim['sourceExpression']['executableAsSingleCourse']:
                held_combinations.append({'provider': claim['provider'], 'receivingCode': claim['receivingCode'], 'receivingCredits': claim['credits'], 'sourceGroups': claim['sourceExpression']['groups'], 'originalPartnerCourseText': claim['originalPartnerCourseText'], 'reason': 'This award requires multiple original source courses. Single-course options cannot award the complete receiving requirement.'})
                missing.update(claim['provider'] + ':' + code for code in claim['approvedSourceCodes'] if (claim['provider'], code) not in identities)
                continue
            for code in claim['approvedSourceCodes']:
                identity = identities.get((claim['provider'], code))
                if identity is None:
                    missing.add(claim['provider'] + ':' + code)
                    continue
                if additive and any(option['provider'] == claim['provider'] and option.get('code') == code for option in row['options']):
                    continue
                option = deepcopy(identity)
                sid = source_ids[claim['provider']]
                option_id = prior_ids.get((row['id'], claim['provider'], code, row['credits'])) or 'wgu-business-' + review['programCode'].lower() + '-' + code.lower() + '-' + row['code'].lower()
                option.update({'id': option_id, 'credits': row['credits'], 'creditSystem': 'competency-unit', 'receivingCode': row['code'], 'receivingTitle': row['title'], 'sourceIds': [sid], 'evidence': 'published', 'evidenceType': 'official-receiving-school-equivalency', 'conditions': ['This exact published match applies to WGU ' + review['programCode'] + ' catalog' + review['catalogTerm'] + '/program' + str(review['programId']) + '. Complete coursework and send original issuer records before starting at WGU.', 'One original source course may satisfy only one WGU requirement; alternative placements do not create duplicate credit.'], 'mappingChecked': packet['checkedOn'], 'mappingReviewId': packet['id'], 'universityMapRecord': {key: claim[key] for key in ['programId', 'catalogTerm', 'agreementId', 'agreementRecordVersion', 'pathwayId', 'pathwayRecordVersion', 'mappingId', 'mappingRecordVersion']}, 'mappingEvidence': {**scope, 'provider': claim['provider'], 'providerCourseCode': code, 'receivingCode': row['code'], 'credits': row['credits'], 'creditSystem': 'competency-unit', 'creditOrigin': option['creditOrigin'], 'sourceIds': [sid], 'programId': review['programId'], 'agreementId': claim['agreementId'], 'mappingId': claim['mappingId']}})
                option['conditions'] += list(dict.fromkeys(rule['sourceText'] for rule in review['recencyRules'] if rule['receivingCode'] == row['code']))
                option['conditionSourceIds'] = [metadata_id]
                row['options'].append(option)
                reused += 1
        retired_invalid_options = list({(item['requirementId'], item['optionId']): item for item in retired_invalid_options}.values())
        coverage = {}
        for provider, agreement in agreements.items():
            claims = [claim for claim in review['receivingClaims'] if claim['provider'] == provider]
            approved = {code for claim in claims for code in claim['approvedSourceCodes']}
            independently_verified = {code for code in approved if (provider, code) in identities}
            executable = [claim for claim in claims if claim['sourceExpression']['executableAsSingleCourse']]
            verified = {code for claim in executable for code in claim['approvedSourceCodes'] if (provider, code) in identities}
            coverage[provider] = {'officialReceivingClaimsReviewed': len(claims), 'approvedSourceCodeCount': len(approved), 'independentlyVerifiedSourceCodes': sorted(independently_verified), 'independentlyVerifiedSelectableSourceCodes': sorted(verified), 'selectableReceivingPlacements': sum(1 for claim in executable for code in claim['approvedSourceCodes'] if code in verified), 'unknownSourceIdentityCodesHeld': sorted(approved - independently_verified), 'multiSourceRequirementsHeld': [item for item in held_combinations if item['provider'] == provider], 'agreementId': agreement['id'], 'agreementRecordVersion': agreement['recordVersion'], 'sourceUrl': agreement['sourceUrl']}
        review_marker = {'id': packet['id'], 'checkedOn': packet['checkedOn'], 'programId': review['programId'], 'catalog': review['catalogTerm'], 'receivingClaimsReviewed': len(review['receivingClaims']), 'sourceIdentitiesReusedByExactProviderCode': sum(item['selectableReceivingPlacements'] for item in coverage.values()), 'sourceIds': list(source_ids.values()), 'studentCreditsAwarded': 0, 'scope': 'exact-program-receiving-awards-with-independent-shared-provider-identities', 'providerCoverage': coverage, 'allPossibleSourcesGloballyReviewed': False, 'retiredInvalidSingleCourseOptions': retired_invalid_options}
        if additive:
            model['additionalProviderIdentityReview'] = review_marker
            model['transferEvidenceReview'] = {**model['transferEvidenceReview'], 'providerCoverage': coverage, 'allPossibleSourcesGloballyReviewed': False}
        else:
            model['transferEvidenceReview'] = review_marker
        model['mappingCheckedOn'] = max(model.get('mappingCheckedOn', ''), packet['checkedOn'])
        report['programs'].append({'modelId': model['id'], 'programCode': review['programCode'], 'reviewedReceivingClaims': len(review['receivingClaims']), 'reusedProviderPlacements': reused, 'unavailableProviderIdentities': sorted(missing), 'residencyResolved': model.get('residencyPolicy', {}).get('interpretationStatus') == 'verified-additional-capstone', 'providerCoverage': coverage, 'allPossibleSourcesGloballyReviewed': False, 'retiredInvalidSingleCourseOptions': retired_invalid_options})
    result['checkedOn'] = max(result.get('checkedOn', ''), packet['checkedOn'])
    return result, report


def build_review_packet(capture_directory, policy_batch, checked_on):
    """Extract program-owned academic claims from byte-bound public API captures.

    The packet is compiled research, not a university evaluation. Identity-only
    reuse remains separate; this extractor never borrows another program's map.
    """
    from pathlib import Path
    directory = Path(capture_directory)
    captures, bodies = [], {}
    definitions = [('business-programs', PUBLIC + 'program/college/BU')] + [(config['capture'], PUBLIC + 'partner-agreement/' + str(config['agreementId'])) for config in PROVIDERS.values()]
    for name, url in definitions:
        raw = (directory / (name + '.json')).read_bytes()
        receipt = json.loads((directory / (name + '.receipt.json')).read_text())
        digest = hashlib.sha256(raw).hexdigest()
        assert receipt['url'] == url and receipt['sha256'] == digest and receipt['bytes'] == len(raw)
        assert receipt['capturedAt'][:10] == checked_on
        captures.append({'url': url, 'sha256': digest, 'capturedAt': receipt['capturedAt'], 'bytes': len(raw)})
        bodies[name] = json.loads(raw)
    metadata = {item['id']: item for item in bodies['business-programs']}
    assert len(metadata) == len(bodies['business-programs'])
    agreements = []
    for provider, config in PROVIDERS.items():
        name, aid, institution = config['capture'], config['agreementId'], config['institutionId']
        raw = bodies[name]
        assert raw['id'] == aid and raw['institutionId'] == institution and raw['college']['code'] == 'BU'
        assert raw['published'] is True and raw['status'] == 'APPROVED' and positive_integer(raw['recordVersion'])
        agreements.append({'provider': provider, 'id': aid, 'recordVersion': raw['recordVersion'], 'published': True, 'status': 'APPROVED', 'sourceUrl': PUBLIC + 'partner-agreement/' + str(aid), 'checkedOn': checked_on})
    programs, existing_programs = [], []
    ledgers = deepcopy(policy_batch['programs'])
    baseline_review = json.loads((Path(__file__).resolve().parents[1] / 'content/curricula/snapshots/wgu/bsmgt-202611-current-partner-api-reviewed-evidence.json').read_text())
    scope, official = baseline_review['scope'], baseline_review['program']
    ledger = {'modelId': IDENTITY_MODEL, 'programId': scope['programId'], 'programCode': scope['programCode'], 'catalogTerm': scope['catalog'], 'totalCredits': scope['totalCredits'], 'recordVersion': official['recordVersion'], 'requirementCount': len(baseline_review['requirements']), 'requirements': [{key: row[key] for key in ['code', 'title', 'credits', 'areaOfStudy']} for row in baseline_review['requirements']]}
    ledger['ledgerSha256'] = ledger_hash(ledger['requirements'])
    ledgers.append(ledger)
    for ledger in ledgers:
        current = metadata[ledger['programId']]
        assert current['inactiveProgram'] == 0 and current['approvalStatus'] == 'Approved' and current['pamsProgramCode'] == ledger['programCode'] and current['catalogTerm'] == ledger['catalogTerm']
        assert current['college']['code'] == 'BU' and current['recordVersion'] >= ledger['recordVersion']
        review = {key: deepcopy(ledger[key]) for key in ['modelId', 'programId', 'programCode', 'catalogTerm', 'totalCredits', 'requirementCount', 'ledgerSha256', 'requirements']}
        if review['modelId'] in PRESERVED_MODELS:
            review['mode'] = 'additive-existing-review'
        review.update({'recordVersion': current['recordVersion'], 'active': True, 'approvalStatus': 'Approved', 'metadataSourceUrl': PUBLIC + 'program/college/BU', 'receivingClaims': []})
        review['transferNotes'] = {key: plain_note(value) for key, value in current.items() if key.startswith('notes') and isinstance(value, str) and plain_note(value)}
        assert not any(review['transferNotes'].get(key) for key in ['notesGeneral', 'notesFundamental', 'notesNonTransfer']), 'New unclassified transfer conditions require review'
        review['recencyRules'] = recency_rules(review['transferNotes'], review['requirements'])
        rows = {row['code']: row for row in review['requirements']}
        for provider, config in PROVIDERS.items():
            raw = bodies[config['capture']]
            assert review['programId'] in json.loads(raw['agreementPrograms'])
            for pathway in raw['agreementPathways']:
                for mapping in pathway['pathwayMappings']:
                    if mapping['program']['id'] != review['programId']:
                        continue
                    assert mapping['program']['pamsProgramCode'] == review['programCode']
                    code = pathway['pamsBannerCode']
                    assert code in rows, 'An out-of-ledger receiving map requires explicit review'
                    row = rows[code]
                    text = mapping['partnerCourse']
                    codes = sorted(set(re.findall(r'\b' + re.escape(config['prefix']) + r'-\d{4}\b', text)))
                    if not codes:
                        continue
                    assert all(value.startswith(config['prefix'] + '-') for value in codes)
                    review['receivingClaims'].append({'provider': provider, 'programId': review['programId'], 'programCode': review['programCode'], 'catalogTerm': review['catalogTerm'], 'receivingCode': code, 'receivingTitle': row['title'], 'credits': row['credits'], 'creditSystem': 'competency-unit', 'agreementId': raw['id'], 'agreementRecordVersion': raw['recordVersion'], 'pathwayId': pathway['id'], 'pathwayRecordVersion': pathway['recordVersion'], 'mappingId': mapping['id'], 'mappingRecordVersion': mapping['recordVersion'], 'approvedSourceCodes': codes, 'originalPartnerCourseText': text, 'sourceExpression': source_expression(provider, text), 'sourceUrl': PUBLIC + 'partner-agreement/' + str(raw['id'])})
        review['receivingClaims'].sort(key=lambda claim: (claim['provider'], claim['receivingCode']))
        (existing_programs if review['modelId'] in PRESERVED_MODELS else programs).append(review)
    packet = {'version': 1, 'kind': 'wgu-program-scoped-business-awards', 'id': 'wgu-business-approved-agreement-batch-' + checked_on, 'checkedOn': checked_on, 'school': SCHOOL, 'level': 'bachelor', 'modality': 'online', 'creditSystem': 'competency-unit', 'studentCreditsAwarded': 0, 'captureIntegrity': captures, 'agreements': agreements, 'programs': programs, 'existingPrograms': existing_programs, 'methodology': ['One capture of each shared official agreement supplies distinct exact-program receiving claims; no course-title or cross-program award inference is used.', 'The independently reviewed current program ledger supplies receiving codes, names and CU quantities. Original provider semester quantities remain separately reviewed identity facts.', 'Only exact independently reviewed provider identities are reused in executable options. Other published source-code matches are retained as research leads and excluded from executable choices.', 'Existing Business Management and Human Resource Management maps use additive verified-identity expansion only. All original option IDs and receiving awards are preserved.']}
    return validate_batch(packet)


if __name__ == '__main__':
    import argparse
    from pathlib import Path
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture-dir', required=True)
    parser.add_argument('--checked-on', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    policy = json.loads((root / 'content/curricula/snapshots/wgu/business-current-ledgers-policy-review-2026-11-17.json').read_text())
    packet = build_review_packet(args.capture_dir, policy, args.checked_on)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(packet, indent=2) + '\n')
    print(json.dumps({'output': str(output), 'programs': len(packet['programs']), 'receivingClaims': sum(len(program['receivingClaims']) for program in packet['programs']), 'sharedAgreementCaptures': len(packet['agreements']), 'studentCreditsAwarded': 0}))
