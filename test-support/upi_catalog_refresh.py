"""Offline integration cases for a partial legacy-directory refresh."""
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

REPO = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("course_importer", REPO / "scripts/import-course-catalog.py")
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class Refresh(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="degreesteps-catalog-refresh-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        data = self.root / "dist/data"
        data.mkdir(parents=True)
        (self.root / "content/catalog").mkdir(parents=True)
        self.cache = self.root / "captures"
        self.cache.mkdir()
        fixtures = {
            "sophia": '<a href="/online-courses/math/college-algebra/" data-modulename="College Algebra">College Algebra</a>',
            "straighterline": '<h4>College Algebra</h4><p>3 credits</p><a href="https://www.straighterline.com/online-college-courses/college-algebra/">Course</a>',
            "clep": '<a href="/clep-exams/college-algebra" aria-labelledby="algebra">College Algebra</a>',
        }
        for provider, body in fixtures.items():
            (self.cache / (provider + ".html")).write_text(body)
        for name in ["tesu", "liberty", "liberty-criminal-justice-residential", "liberty-criminal-justice-online"]:
            # The source adapter must not mistake a receiving three-credit UPI
            # option for independently established original source credit.
            model = {"id": name, "requirements": [{"id": "example", "options": [
                {"provider": "University", "title": "Institution Course", "credits": 3},
                {"provider": "UPI Study", "id": "upi-example", "title": "Environmental Science", "code": "UPIS-0025", "credits": 3, "sourceCredits": 1},
                {"provider": "Unresearched Provider", "id": "unsupported", "title": "An Outside Course", "code": "UNKNOWN-123", "credits": 3},
            ]}]}
            (data / (name + ".json")).write_text(json.dumps(model))
        self.retained = [
            {"id": "retained-study", "provider": "Study.com", "title": "Example Business", "mappingCode": "SDCM-EXAMPLE", "credits": 3, "checkedAt": "2026-10-01"},
            {"id": "retained-saylor", "provider": "Saylor", "title": "Example Math", "mappingCode": "SAYL-EXAMPLE", "credits": 3, "checkedAt": "2026-10-02"},
            {"id": "retained-dsst", "provider": "DSST", "title": "Example Exam", "mappingCode": "DSST-EXAMPLE", "credits": None, "checkedAt": "2026-10-03"},
            {"id": "retained-cli", "provider": "Christian Leaders Institute", "title": "Example Theology", "mappingCode": "CLI-EXAMPLE", "credits": 3, "checkedAt": "2026-10-04"},
            {"id": "retained-upi", "provider": "UPI Study", "title": "Environmental Science", "mappingCode": "UPIS-0025", "credits": 1, "creditSystem": "semester", "checkedAt": "2026-11-25", "identityReviewId": "synthetic-reviewed-source"},
        ]
        self.old_source = {"id": "upi-source-proof", "provider": "UPI Study", "url": "https://www.upistudy.com/courses/environmental-science", "checkedAt": "2026-11-25", "status": "source-course-review", "count": 1}
        self.target = data / "course-catalog.json"
        self.original = {"version": 1, "courses": self.retained, "sources": [self.old_source]}
        self.target.write_text(json.dumps(self.original, indent=2) + "\n")
        (data / "credit-sources.json").write_text(json.dumps({"checkedOn": "2026-11-25", "sources": [{"id": "upi-study", "name": "UPI Study", "url": "https://www.upistudy.com/collections"}]}))

    def refresh(self, child=None):
        sources = [{**source, "minimum": 1} for source in importer.SOURCES]
        with patch.object(importer, "ROOT", self.root), patch.object(importer, "SOURCES", sources), \
             patch.object(sys, "argv", ["import-course-catalog.py", "--cache-dir", str(self.cache)]), \
             patch.object(importer.urllib.request, "urlopen", side_effect=AssertionError("No network during a cached refresh")), \
             patch.object(importer.subprocess, "run", side_effect=child) as processes, contextlib.redirect_stdout(io.StringIO()):
            importer.main()
            return processes.call_args_list

    def test_new_provider_options_do_not_crash_or_rewrite_original_quantities(self):
        calls = self.refresh()
        result = json.loads(self.target.read_text())
        for row in self.retained:
            self.assertIn(row, result["courses"])
        self.assertEqual(next(row["credits"] for row in result["courses"] if row["id"] == "retained-upi"), 1)
        self.assertFalse(any(row["provider"] == "Unresearched Provider" for row in result["courses"]))
        self.assertIn(self.old_source, result["sources"])
        self.assertEqual([Path(call.args[0][1]).name for call in calls], ["reviewed-course-identities.mjs", "upi-course-catalog.mjs"])
        manifest = json.loads((self.root / "content/catalog/course-sources.json").read_text())
        self.assertEqual(manifest["sources"], result["sources"])

    def test_source_adapter_failure_restores_the_previous_catalog_exactly(self):
        original = self.target.read_bytes()
        with self.assertRaises(subprocess.CalledProcessError):
            self.refresh(child=subprocess.CalledProcessError(1, ["node", "source-review"]))
        self.assertEqual(self.target.read_bytes(), original)
        self.assertFalse((self.root / "content/catalog/course-sources.json").exists())

    def test_identical_titles_do_not_erase_distinct_retained_source_records(self):
        second = {**copy.deepcopy(self.retained[0]), "id": "another-original-business", "mappingCode": "SDCM-OTHER", "credits": 4}
        self.original["courses"].append(second)
        self.target.write_text(json.dumps(self.original))
        self.refresh()
        result = json.loads(self.target.read_text())
        self.assertIn(self.retained[0], result["courses"])
        self.assertIn(second, result["courses"])


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Refresh))
    print(json.dumps({"suite": "partial-provider-catalog-refresh", "tests": result.testsRun, "failures": len(result.failures), "errors": len(result.errors), "passed": result.wasSuccessful()}))
    raise SystemExit(0 if result.wasSuccessful() else 1)
