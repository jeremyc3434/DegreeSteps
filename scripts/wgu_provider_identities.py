"""Validate reusable provider facts independently of any university award.

The reviewed bundle deliberately has no receiving program, receiving quantity,
or transfer promise. A current school agreement must supply those separately.
Native web-reader extracts are identified as extracts, not origin HTTP bodies.
"""
from copy import deepcopy
from datetime import date
import json
import math
from pathlib import Path
import re
from urllib.parse import urlparse


INDEPENDENT_HOSTS = {
    'study.com', 'www.study.com', 'acenet.edu', 'www.acenet.edu',
    'credly.com', 'www.credly.com', 'nationalccrs.org', 'www.nationalccrs.org',
}
RECEIVING_FIELDS = {
    'receivingCode', 'receivingTitle', 'receivingCredits', 'mappingEvidence',
    'universityMapRecord', 'modelId', 'programId', 'catalogTerm', 'school',
    'evidence', 'credits', 'creditSystem', 'sourceIds', 'requirementId',
}


def positive_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def validate_provider_bundle(bundle, as_of=None):
    """Fail closed on quantity substitution, unrelated sources, or future reviews."""
    checked = date.fromisoformat(bundle['checkedOn'])
    assert checked <= (date.fromisoformat(as_of) if as_of else date.today())
    assert bundle['version'] == 1 and bundle['id'] and bundle['provider'] == 'Study.com'
    assert not RECEIVING_FIELDS.intersection(bundle), 'A provider bundle cannot carry receiving-school scope'
    references = {}
    for source in bundle['sources']:
        assert source['id'] and source['id'] not in references, 'Duplicate provider source'
        parsed = urlparse(source['url'])
        assert parsed.scheme == 'https' and parsed.hostname in INDEPENDENT_HOSTS, 'An independent provider or recommender source is required'
        assert 'provider-identity' in source['roles']
        source_checked = date.fromisoformat(source.get('checkedOn', source.get('checked', '')))
        assert source_checked <= checked, 'A source cannot have been checked after its review'
        if source.get('extractedTextSha256'):
            assert re.fullmatch(r'[0-9a-f]{64}', source['extractedTextSha256'])
            assert source['captureMethod'] == 'native-public-web-rendered-extract'
            assert source['rawBodyCaptured'] is False, 'A rendered-text hash is not an origin-body hash'
        references[source['id']] = source
    assert references and bundle['courses']
    codes = set()
    for course in bundle['courses']:
        assert course['provider'] == 'Study.com' and re.fullmatch(r'SDCM-\d{4}', course['code'])
        assert course['code'] not in codes, 'One version-specific identity per code is required'
        codes.add(course['code'])
        assert not RECEIVING_FIELDS.intersection(course), 'Provider identities cannot carry receiving-school awards'
        assert course['title'] and course['sourceCreditStatus'] == 'verified'
        assert positive_number(course['sourceCredits']) and course['sourceCreditSystem'] == 'semester'
        assert course['identitySourceIds'] and set(course['identitySourceIds']) <= references.keys()
        verification = course['sourceCreditVerification']
        assert verification['credits'] == course['sourceCredits'] and verification['creditSystem'] == course['sourceCreditSystem']
        assert verification['sourceIds'] and set(verification['sourceIds']) <= set(course['identitySourceIds'])
        for sid in course['identitySourceIds']:
            source = references[sid]
            if source.get('aceId'):
                assert source['aceId'] == course['code'], 'The ACE exhibit must identify this exact course'
            observed = source.get('observed', {})
            if observed:
                assert observed['aceId'] == course['code'], 'The cited source must identify this exact course'
                assert observed.get('offered') is True
            if sid in verification['sourceIds']:
                facts = source.get('reviewedFacts', observed)
                if facts:
                    assert facts['sourceCredits'] == course['sourceCredits'] and facts['sourceCreditSystem'] == course['sourceCreditSystem'], 'Original credits must match the independent source, not a receiving award'
        for key in ['recommendationPeriodSourceIds', 'providerCoursePassingSourceIds']:
            if course.get(key):
                assert set(course[key]) <= references.keys()
        if course.get('recommendationStart') or course.get('recommendationEnd'):
            assert course.get('recommendationStart') and course.get('recommendationEnd') and course.get('recommendationPeriodSourceIds')
            assert date.fromisoformat(course['recommendationStart']) <= checked <= date.fromisoformat(course['recommendationEnd']), 'A historical recommendation cannot verify a future course'
        if 'sourceUpper' in course:
            assert isinstance(course['sourceUpper'], bool)
        assert urlparse(course['url']).hostname in {'study.com', 'www.study.com'}
        assert course['url'].startswith('https://')
        assert date.fromisoformat(course.get('identityCheckedOn', bundle['checkedOn'])) <= checked
    return bundle


def load_provider_bundle(path, as_of=None):
    return deepcopy(validate_provider_bundle(json.loads(Path(path).read_text()), as_of))


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path', nargs='?', default='content/reuse/wgu-provider-identities.json')
    parser.add_argument('--as-of', default=None)
    args = parser.parse_args()
    packet = load_provider_bundle(args.path, args.as_of)
    print(json.dumps({'id': packet['id'], 'providerIdentities': len(packet['courses']), 'independentSources': len(packet['sources']), 'receivingAwards': 0}))
