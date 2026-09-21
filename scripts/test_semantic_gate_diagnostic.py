"""Additive reporting tests; frozen experiment scoring is not modified."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'evidence/jev-semantic-gate'


class DiagnosticTests(unittest.TestCase):
    def test_real_recorded_report_reconciles_denominators_and_authority(self):
        module = importlib.util.find_spec('semantic_gate_diagnostic')
        self.assertIsNotNone(module, 'additive diagnostic reporter must exist')
        from semantic_gate_diagnostic import report, csv_report
        from build_semantic_gate import collect, summary
        rows, metadata = collect(json.loads((EVIDENCE / 'authoring/inputs.json').read_bytes()),
                                 json.loads((EVIDENCE / 'authoring/gold.json').read_bytes()))
        data = dict(cases=rows, summary=summary(rows), metadata=metadata)
        result = report(data, ROOT / 'evidence/jev-semantic-gate/recording')
        self.assertEqual(result['denominators']['planned_texts'], 24)
        self.assertEqual(result['denominators']['scenario_groups'], 12)
        self.assertEqual(result['denominators']['fact_fields'], 72)
        self.assertEqual(result['denominators']['all_fields'], 120)
        self.assertEqual(result['denominators']['gold_suspected_fact_fields'], 12)
        self.assertEqual(result['denominators']['gold_uncertain_fact_fields'], 18)
        self.assertEqual(result['summary'], data['summary'])
        self.assertNotIn('\r', csv_report(result), 'new report CSV must be Git-portable LF text')
        self.assertEqual(result['gold']['actions'], {'ask': 16, 'move': 6, 'wait': 2})
        self.assertEqual(result['gold']['useful_coverage'], 8)
        self.assertEqual(result['accounting']['admissions'], 24)
        self.assertEqual(result['accounting']['input_tokens'], 90171)
        self.assertAlmostEqual(result['accounting']['usage_derived_cost_usd'], .003787182)
        self.assertEqual(result['attributions']['jev']['changed_ids'], [])
        self.assertEqual(result['attributions']['jev']['already_asked_ids'], ['zl020-s01b', 'zl020-s10a', 'zl020-s10b'])
        self.assertEqual(result['attributions']['jev']['preserved_overabstention_ids'], ['zl020-s08a', 'zl020-s08b'])
        self.assertEqual(result['attributions']['parser']['false_action_ids'], ['zl020-s04b'])
        self.assertEqual(result['comparator']['status'], 'pending_parent_owned')
        self.assertEqual(result['disposition'], 'recorded diagnostic; incremental gate benefit not demonstrated; no adoption claim')

    def test_additive_phone_presentation_preserves_frozen_payload(self):
        import semantic_gate_diagnostic as module
        self.assertTrue(callable(getattr(module, 'decorate', None)), 'additive phone presentation required')
        html = (ROOT / 'scripts/semantic_gate.html').read_text()
        result = json.loads((EVIDENCE / 'results/report.json').read_bytes())
        decorated = module.decorate(html, result)
        self.assertIn('id="diagnostic-status"', decorated)
        self.assertIn('value="gold"', decorated)
        self.assertIn('id="gold-reference"', decorated)
        self.assertIn('recorded diagnostic', decorated)
        self.assertIn('connect-src \'none\'', decorated)
        self.assertEqual(decorated.count('__DATA__'), 1)
        self.assertIn('font-size:18px', decorated)
        self.assertIn('id="replay-authority"', decorated)
        self.assertIn('secondary goal completed:', decorated)
        self.assertNotIn('authorized goal completed:', decorated)
        self.assertNotIn('fetch(', decorated)
        self.assertNotIn('textarea', decorated)
        self.assertEqual((ROOT / 'scripts/semantic_gate.html').read_text(), html)


if __name__ == '__main__':
    unittest.main()
