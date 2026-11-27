"""Academic-authoring regression checks; no network, admission or student data."""
import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import phoenix_graduate_review as review

ROOT=Path(__file__).resolve().parents[1]
class PhoenixGraduateReview(unittest.TestCase):
    def setUp(self):
        self.document=json.loads((ROOT/'content/curricula/cbe.json').read_text())
        self.programs=json.loads((ROOT/'content/curricula/snapshots/cbe/phoenix-2026-2027-facts.json').read_text())['programs']
    def test_exact_evidence_and_course_rows_are_bound(self):
        packet=review.load_review();self.assertEqual(len(packet['programs']),4)
        for program in self.programs:
            model=next(x for x in self.document['models'] if x['id']=='curriculum-'+program['routeId'])
            result=review.apply_graduate_review(model,program)
            self.assertEqual(result['externalMaxCredits'],0)
            self.assertEqual(result['totalCredits'],sum(x['credits'] for x in result['requirements']))
            self.assertEqual(result['graduateCBEReview']['outsideAwardsCreated'],0)
    def test_modified_credit_units_ledger_and_invented_provider_fail_closed(self):
        program=self.programs[0];base=self.document['models'][0]
        def change_total(x):x['totalCredits']+=3
        def change_unit(x):x['creditSystem']='competency-unit'
        def change_code(x):x['requirements'][0]['code']='MADEUP 999'
        def change_outside(x):x['requirements'][0]['options'].append({'provider':'Sophia','code':'SOPH-0015','credits':3})
        def change_institution(x):x['requirements'][0]['institutionalOnly']=False
        for mutate in [change_total,change_unit,change_code,change_outside,change_institution]:
            model=copy.deepcopy(base);mutate(model)
            with self.assertRaises(AssertionError):review.apply_graduate_review(model,program)
    def test_retained_source_hash_and_http_receipt_cannot_be_relabelled(self):
        original=copy.deepcopy(review.load_review())
        for key,value in [('sha256','0'*64),('originalRetrievedAt','2026-11-27T00:00:00.000Z'),('url','https://www.phoenix.edu/unrelated')]:
            packet=copy.deepcopy(original);packet['sources'][0][key]=value
            with tempfile.TemporaryDirectory() as folder:
                path=Path(folder)/'bad-review.json';path.write_text(json.dumps(packet));review.load_review.cache_clear()
                with patch.object(review,'REVIEW_PATH',str(path)):
                    with self.assertRaises(AssertionError):review.load_review()
            review.load_review.cache_clear()
    def test_regeneration_is_exact_and_preserves_existing_undergraduate_fingerprints(self):
        before=(ROOT/'content/curricula/cbe.json').read_bytes()
        spec=importlib.util.spec_from_file_location('phoenix_cbe_writer',ROOT/'scripts/import-cbe-curricula.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.build()
        self.assertEqual((ROOT/'content/curricula/cbe.json').read_bytes(),before)
        fingerprints=json.loads((ROOT/'content/curricula/snapshots/cbe/phoenix-da-undergraduate-facts.json').read_text())['preservedUndergraduateModelSha256']
        self.assertEqual(len(fingerprints),2)
if __name__=='__main__':unittest.main()
