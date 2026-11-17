"""Current official business ledgers close only the policies they substantiate."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('wgu_policies', ROOT/'scripts/wgu_undergraduate_policies.py')
policies = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policies)
REVIEW = ROOT/'content/curricula/snapshots/wgu/business-current-ledgers-policy-review-2026-11-17.json'


class ReviewedBusinessPolicyBatch(unittest.TestCase):
    def setUp(self):
        self.batch = json.loads(REVIEW.read_text())
        self.document = json.loads((ROOT/'content/curricula/wgu.json').read_text())

    def test_seven_current_ledgers_match_without_changing_any_outside_option(self):
        before = deepcopy(self.document)
        result = policies.apply_reviewed_undergraduate_policies(deepcopy(self.document), self.batch)
        expected = {'BSACC': (40, 121), 'BSHR': (39, 117), 'BSMKT': (37, 112), 'BSFIN': (40, 121), 'BSITM': (37, 112), 'BSUXD': (38, 115), 'BSC': (38, 115)}
        self.assertEqual({row['programCode'] for row in self.batch['programs']}, set(expected))
        reviewed = {row['modelId']: row for row in self.batch['programs']}
        for model in result['models']:
            original = next(row for row in before['models'] if row['id'] == model['id'])
            if model['id'] not in reviewed:
                self.assertEqual(model, original, 'Unmatched, graduate, clinical and protected Business Management models stay unchanged')
                continue
            review = reviewed[model['id']]
            self.assertEqual((len(model['requirements']), model['totalCredits']), expected[review['programCode']])
            self.assertEqual(model['catalog'], review['catalogTerm'])
            self.assertEqual([row['options'] for row in model['requirements']], [row['options'] for row in original['requirements']])
            self.assertTrue(all(row['code'] for row in model['requirements']))
            self.assertEqual(model['externalMaxCredits'], model['totalCredits'] * .75)
            self.assertEqual(model['alternativeMaxCredits'], model['externalMaxCredits'])
            self.assertIsNone(model.get('upperMinCredits'), 'No synthetic zero upper-level aggregate is introduced')
            upper = [row for row in model['policyReview'] if row['field'] == 'upperMinCredits']
            self.assertEqual(len(upper), 1)
            self.assertEqual(upper[0]['resolution'], 'covered-by-complete-named-curriculum')
            self.assertEqual(set(upper[0]['sourceIds']), {policies.CATALOG_SOURCE, review['curriculumSourceId']})
        self.assertEqual(self.document, before)
        self.assertEqual(policies.apply_reviewed_undergraduate_policies(deepcopy(result), self.batch), result, 'Reapplying the same reviewed batch is stable')

    def test_five_caps_have_explicit_role_proof_even_when_the_api_subject_area_is_different(self):
        result = policies.apply_reviewed_undergraduate_policies(deepcopy(self.document), self.batch)
        floors = {'BSHR': 32.25, 'BSMKT': 31, 'BSFIN': 33.25, 'BSUXD': 31.75, 'BSC': 31.75}
        for review in self.batch['programs']:
            model = next(row for row in result['models'] if row['id'] == review['modelId'])
            if review['programCode'] in floors:
                self.assertTrue(review['capstoneEvidence'])
                self.assertTrue(all(row['areaOfStudy'] != 'Capstone' for row in review['requirements']))
                self.assertEqual(model['residencyPolicy']['calculatedMinimumInstitutionCUs'], floors[review['programCode']])
                caps = [row for row in model['requirements'] if row['id'] in model['residencyPolicy']['capstoneRequirementIds']]
                self.assertEqual([row['code'] for row in caps], review['capstoneCourseCodes'])
                self.assertTrue(all(row['institutionalOnly'] and not row['options'] for row in caps))
            else:
                self.assertIn(review['programCode'], ['BSACC', 'BSITM'])
                self.assertFalse(review['applyResidency'])
                self.assertNotIn('residencyPolicy', model)
                self.assertIsNone(model.get('institutionMinCredits'))
                self.assertTrue(any('required-capstone applicability' in note for note in model['unresolved']))

    def test_a_simulation_label_or_wrong_description_source_cannot_become_capstone_proof(self):
        for mutation in ['simulation', 'wrong-source', 'wrong-course-description', 'missing-role-proof']:
            with self.subTest(mutation=mutation):
                batch = deepcopy(self.batch)
                marketing = next(row for row in batch['programs'] if row['programCode'] == 'BSMKT')
                if mutation == 'simulation':
                    marketing['capstoneCourseCodes'] = ['D361']
                    marketing['capstoneEvidence'] = [{'courseCode': 'D361', 'designationBasis': 'official-course-title', 'sourceIds': [marketing['curriculumSourceId']]}]
                elif mutation == 'wrong-source':
                    marketing['capstoneEvidence'][0]['sourceIds'] = [marketing['metadataSourceId']]
                elif mutation == 'wrong-course-description':
                    marketing['capstoneEvidence'][0]['proofText'] = 'A different named subject is the capstone course for the marketing major.'
                else:
                    del marketing['capstoneEvidence']
                with self.assertRaises(AssertionError):
                    policies.validate_policy_batch(batch)

    def test_two_line_wrap_mismatches_are_explicit_holds_instead_of_silent_course_aliases(self):
        self.assertEqual({row['programCode'] for row in self.batch['heldPrograms']}, {'BSSCOM', 'BSPM'})
        for held in self.batch['heldPrograms']:
            self.assertEqual(len(held['officialOnlyTitles']), 2)
            self.assertEqual(len(held['retainedOnlyTitles']), 2)
            self.assertEqual(held['status'], 'held-until-explicit-course-identity-repair')
            self.assertNotIn(held['modelId'], [row['modelId'] for row in self.batch['programs']])

    def test_invalid_month_or_misstated_derived_floor_is_rejected(self):
        for mutation in ['invalid-month', 'floor']:
            with self.subTest(mutation=mutation):
                batch = deepcopy(self.batch)
                review = next(row for row in batch['programs'] if row['programCode'] == 'BSMKT')
                if mutation == 'invalid-month':
                    review['catalogTerm'] = '202613'
                else:
                    review['calculatedInstitutionMinimumCUs'] = 28
                with self.assertRaises(AssertionError):
                    policies.validate_policy_batch(batch)


if __name__ == '__main__':
    unittest.main()
