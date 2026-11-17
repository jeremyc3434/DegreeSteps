"""No-network identity guards for retained, reviewed transfer supplements."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('wgu', ROOT/'scripts/import-wgu-curricula.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
document = json.loads((ROOT/'content/curricula/wgu.json').read_text())
MODEL_ID = 'curriculum-wgu-catalog-ecceaa488637ac83'


class SupplementIdentity(unittest.TestCase):
    def test_changed_identities_stop_regeneration(self):
        for change in ['catalog', 'credits', 'source']:
            with self.subTest(change=change):
                value = copy.deepcopy(document)
                model = next(m for m in value['models'] if m['id'] == MODEL_ID)
                if change == 'catalog':
                    model['catalog'] = '999999'
                elif change == 'credits':
                    next(r for r in model['requirements'] if r['id'] == 'bsmgt-organizational-behavior')['credits'] = 4
                else:
                    next(s for s in value['sources'] if s['id'] == 'wgu-bsmgt-study-provider-2026-11')['url'] = 'https://example.edu/changed'
                with self.assertRaises(AssertionError):
                    module.apply_reviewed_supplements(value)

    def test_policy_cannot_move_to_another_catalog_or_credit_system(self):
        patch=json.loads((ROOT/'content/curricula/overlays/wgu-bsmgt-university-policy-20261117.json').read_text())
        original=next(m for m in document['models']if m['id']==MODEL_ID)
        refs={source['id']:source for source in document['sources']}
        for field,value in [('catalog','202503'),('totalCredits',120),('creditSystem','semester')]:
            with self.subTest(field=field):
                model=copy.deepcopy(original);model[field]=value
                with self.assertRaises(AssertionError):
                    module.validate_reviewed_model_updates(model,patch['modelUpdates'],refs)

    def test_capstone_and_fee_basis_cannot_be_silently_changed(self):
        patch=json.loads((ROOT/'content/curricula/overlays/wgu-bsmgt-university-policy-20261117.json').read_text())
        original=next(m for m in document['models']if m['id']==MODEL_ID)
        refs={source['id']:source for source in document['sources']}
        for change in ['capstone','residency','transfer-cap','term-fee','application-fee','upper-review']:
            with self.subTest(change=change):
                model=copy.deepcopy(original);updates=copy.deepcopy(patch['modelUpdates'])
                if change=='capstone':
                    next(r for r in model['requirements']if r['code']=='QGT1')['institutionalOnly']=False
                elif change=='residency':updates['residencyPolicy']['conservativeSufficientCondition']['minimumNonCapstoneInstitutionCUs']=26.5
                elif change=='transfer-cap':updates['externalMaxCredits']=90
                elif change=='term-fee':updates['pricing']['amount']=3850
                elif change=='application-fee':updates['pricing']['oneTimeFees'][0]['frequency']='per-term'
                else:updates['policyReview'][0]['sourceIds']=[]
                with self.assertRaises(AssertionError):
                    module.validate_reviewed_model_updates(model,updates,refs)

    def test_current_business_grade_scope_uses_reviewed_receiving_areas(self):
        review=json.loads((ROOT/'content/curricula/snapshots/wgu/bsmgt-202611-current-partner-api-reviewed-evidence.json').read_text())
        model=next(m for m in document['models']if m['id']==MODEL_ID)
        rules=model['transferRules']
        self.assertEqual(rules['businessReceivingCourseCodes'],sorted(row['code']for row in review['requirements']if row['transferArea']in['Core','Additional Transfer']))
        self.assertEqual(rules['otherReceivingCourseCodes'],sorted(row['code']for row in review['requirements']if row['transferArea']=='General Education'))
        self.assertEqual(rules['gradeScopeSourceIds'],['wgu-bsmgt-transfer-guidelines-api-240-reviewed'])
        self.assertIn('C273',rules['otherReceivingCourseCodes'])
        self.assertIn('D428',rules['otherReceivingCourseCodes'])
        self.assertNotIn('D333',rules['businessReceivingCourseCodes'])
        self.assertEqual(len(rules['businessReceivingCourseCodes']),18)


if __name__ == '__main__':
    unittest.main()
