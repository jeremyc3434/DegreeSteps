"""Identity, provenance and unit guards for the WGU undergraduate policy batch."""
from copy import deepcopy
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('wgu_policies', ROOT/'scripts/wgu_undergraduate_policies.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture():
    # Deliberately synthetic academic rows: these are never written to content.
    scope = {'schoolName': module.SCHOOL, 'programId': 123456, 'programCode': 'BSZZZ', 'catalogYear': '202611', 'level': 'bachelor', 'modality': 'online', 'creditSystem': 'competency-unit'}
    rows = [{'code': 'TEST1', 'title': 'Fixture subject', 'credits': 3, 'areaOfStudy': 'Core'}, {'code': 'TEST2', 'title': 'Fixture capstone', 'credits': 1, 'areaOfStudy': 'Capstone'}]
    metadata_url = module.PUBLIC+'program/college/BU'
    ledger_url = module.PUBLIC+'program-data?pamsCodes=BSZZZ%3B202611'
    metadata_id, ledger_id = 'fixture-metadata', 'fixture-ledger'
    sources = [
        {'id': module.CATALOG_SOURCE, 'url': 'https://www.wgu.edu/content/dam/wgu-65-assets/western-governors/documents/institutional-catalog/2026/WGU%20Institutional%20Catalog%20-%20November%202026.pdf', 'sourcePages': {'transferPolicy': [35], 'completeNamedCurriculum': [65]}},
        {'id': module.RESIDENCY_SOURCE, 'url': 'https://cm.wgu.edu/t5/WGU-Student-Policy-Handbook/2-1-11-Residency-Requirements-and-Credentialing/ta-p/23797', 'published': '2026-09-18', 'scope': {'school': module.SCHOOL, 'level': 'bachelor', 'modality': 'online', 'creditSystem': 'competency-unit'}},
        {'id': metadata_id, 'url': metadata_url, 'scope': scope, 'kind': 'university', 'checked': '2026-11-17'},
        {'id': ledger_id, 'url': ledger_url, 'scope': scope, 'kind': 'university', 'checked': '2026-11-17'},
    ]
    review = {'modelId': 'fixture-wgu-undergraduate', 'programId': 123456, 'programCode': 'BSZZZ', 'catalogTerm': '202611', 'baseCatalog': '202611', 'recordVersion': 1, 'active': True, 'approvalStatus': 'Approved', 'collegeCode': 'BU', 'residencyNoteFraction': .25, 'metadataSourceUrl': metadata_url, 'curriculumSourceUrl': ledger_url, 'metadataSourceId': metadata_id, 'curriculumSourceId': ledger_id, 'sourceIds': [metadata_id, ledger_id], 'requirements': rows, 'requirementCount': 2, 'totalCredits': 4, 'ledgerSha256': module.ledger_hash(rows), 'capstoneCourseCodes': ['TEST2'], 'applyResidency': True}
    batch = {'version': 1, 'checkedOn': '2026-11-17', 'scope': sources[1]['scope'], 'policyFacts': {'overallTransferFraction': .75, 'undergraduateResidencyFraction': .25, 'requiredCapstonesAdditional': True}, 'sources': sources, 'programs': [review]}
    option = {'id': 'fixture-outside', 'provider': 'Fixture provider', 'credits': 3, 'creditSystem': 'competency-unit', 'sourceCredits': 5, 'sourceCreditSystem': 'semester', 'evidence': 'conditional'}
    model = {'id': review['modelId'], 'school': module.SCHOOL, 'title': 'Fixture degree', 'level': 'bachelor', 'modalities': ['online'], 'catalog': '202611', 'creditSystem': 'competency-unit', 'totalCredits': 4, 'requirements': [{'id': 'fixture-subject', 'code': '', 'title': rows[0]['title'], 'credits': 3, 'sourceIds': ['original-guide'], 'category': 'core', 'options': [option]}, {'id': 'fixture-capstone', 'code': '', 'title': rows[1]['title'], 'credits': 1, 'sourceIds': ['original-guide'], 'category': 'capstone', 'options': []}], 'unresolved': ['Confirm the student’s applicable program catalog; the official program-guide version is recorded above.', 'Keep the provider-specific equivalency unresolved.']}
    document = {'sources': [{'id': 'original-guide', 'url': 'https://www.wgu.edu/fixture-guide.pdf'}], 'models': [model], 'checkedOn': '2026-11-09'}
    return document, batch


class UndergraduatePolicyGuards(unittest.TestCase):
    def test_exact_ledger_resolves_policy_without_promoting_options_or_units(self):
        document, batch = fixture()
        options = deepcopy([row['options'] for row in document['models'][0]['requirements']])
        result = module.apply_reviewed_undergraduate_policies(document, batch)['models'][0]
        self.assertEqual(result['externalMaxCredits'], 3)
        self.assertEqual(result['residencyPolicy']['calculatedMinimumInstitutionCUs'], 2)
        self.assertEqual(result['residencyPolicy']['capstoneRequirementIds'], ['fixture-capstone'])
        self.assertTrue(result['requirements'][1]['institutionalOnly'])
        self.assertNotIn('institutionMinCredits', result)
        self.assertNotIn('upperMinCredits', result)
        self.assertEqual(options, [row['options'] for row in result['requirements']])
        self.assertEqual(result['unresolved'], ['Keep the provider-specific equivalency unresolved.'])

    def test_changed_catalog_cu_title_or_scope_cannot_reuse_review(self):
        for mutation in ['catalog', 'total', 'title', 'course-cu', 'master', 'campus', 'semester']:
            with self.subTest(mutation=mutation):
                document, batch = fixture(); model = document['models'][0]
                if mutation == 'catalog': model['catalog'] = '202610'
                elif mutation == 'total': model['totalCredits'] = 5
                elif mutation == 'title': model['requirements'][0]['title'] = 'Different subject'
                elif mutation == 'course-cu': model['requirements'][0]['credits'] = 4
                elif mutation == 'master': model['level'] = 'master'
                elif mutation == 'campus': model['modalities'] = ['campus']
                else: model['creditSystem'] = 'semester'
                with self.assertRaises(AssertionError): module.apply_reviewed_undergraduate_policies(document, batch)

    def test_inactive_unapproved_or_changed_public_record_is_held(self):
        for key, value in [('active', False), ('approvalStatus', 'Draft'), ('residencyNoteFraction', .5), ('ledgerSha256', 'changed')]:
            with self.subTest(key=key):
                document, batch = fixture(); batch['programs'][0][key] = value
                with self.assertRaises(AssertionError): module.apply_reviewed_undergraduate_policies(document, batch)

    def test_capstone_scope_and_outside_claims_cannot_be_guessed(self):
        for mutation in ['field', 'outside', 'quantity', 'clinical']:
            with self.subTest(mutation=mutation):
                document, batch = fixture(); review = batch['programs'][0]
                if mutation == 'field': review['requirements'][1]['areaOfStudy'] = 'Core'
                elif mutation == 'outside': document['models'][0]['requirements'][1]['options'] = [{'id': 'not-allowed'}]
                elif mutation == 'quantity': review['requirements'][1]['credits'] = 2
                else: review['requirements'][0]['title'] = 'Clinical practicum'
                review['ledgerSha256'] = module.ledger_hash(review['requirements'])
                with self.assertRaises(AssertionError): module.apply_reviewed_undergraduate_policies(document, batch)

    def test_current_bsmgt_and_placement_programs_cannot_be_overwritten(self):
        for key, value in [('modelId', module.PRESERVED_BSMGT), ('programCode', 'BSHIM'), ('programCode', 'BSHA'), ('programCode', 'MBA')]:
            with self.subTest(value=value):
                document, batch = fixture(); batch['programs'][0][key] = value
                with self.assertRaises(AssertionError): module.apply_reviewed_undergraduate_policies(document, batch)

    def test_staff_fields_or_wrong_scope_sources_are_rejected(self):
        for mutation in ['staff', 'source-catalog', 'source-id', 'source-date']:
            with self.subTest(mutation=mutation):
                document, batch = fixture()
                if mutation == 'staff': batch['programs'][0]['createdBy'] = 'omitted'
                elif mutation == 'source-catalog': batch['sources'][3]['scope'] = {**batch['sources'][3]['scope'], 'catalogYear': '202610'}
                elif mutation == 'source-date': batch['sources'][3]['checked'] = '2026-01-01'
                else: batch['programs'][0]['sourceIds'] = ['unknown']
                with self.assertRaises(AssertionError): module.apply_reviewed_undergraduate_policies(document, batch)


if __name__ == '__main__':
    unittest.main()
