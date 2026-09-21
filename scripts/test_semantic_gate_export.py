import json
import tempfile
import unittest
from pathlib import Path
try:
    import build_semantic_gate as builder
except ImportError:
    builder=None
ROOT=Path(__file__).resolve().parents[1]

class ExportTests(unittest.TestCase):
    def test_recorded_development_raw_vs_gated_export_and_bypass(self):
        self.assertIsNotNone(builder, 'recorded-case exporter missing')
        old=ROOT/'evidence/jev-semantics'
        case=next(c for c in json.loads((old/'data/test-inputs.json').read_text()) if c['id']=='s06a')
        gold=json.loads((old/'data/test-gold.json').read_text())['s06a']
        req=json.loads((old/'frozen/requests/s06a.request.json').read_text())
        body=(old/'recording/s06a.response.raw').read_bytes()
        row=builder.record(case,gold,req,body,{'scope':'historical development'})
        self.assertEqual(row['jev']['raw_interpretation']['clarification'],'none')
        self.assertEqual(row['jev']['required_clarification'],'evidence')
        self.assertEqual(row['jev']['raw_trace']['decision']['action'],'move')
        self.assertEqual(row['jev']['gated_trace']['decision']['action'],'ask')
        self.assertFalse(row['jev']['raw_exact'])
        self.assertTrue(row['jev']['gate_changed'])
        summary=builder.summary([row])
        self.assertIn('confusions',summary['jev'])
        self.assertEqual(summary['jev']['confusions']['clarification'],[{'gold':'evidence','prediction':'none','n':1}])
        self.assertEqual(summary['jev']['gated']['outcomes'],{'ask':1})
        self.assertEqual(summary['jev']['n'],1)
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'site'
            builder.export(out,[row],{'scope':'historical development; NOT fresh heldout','review':'pending'})
            html=(out/'index.html').read_text()
            self.assertIn('Recorded request / report',html)
            self.assertIn('raw vs gated',html)
            self.assertIn('type="range"',html)
            self.assertNotIn('fetch(',html)
            self.assertNotIn('api.typesafe.ai',html)
            self.assertNotIn('__DATA__',html)
            self.assertEqual(json.loads((out/'recorded-cases.json').read_text())['cases'][0]['id'],'s06a')
        wrong=dict(mara_at_depot='unreported',ash_in_east='negated',west_blocked='unreported',policy='solo',clarification='none')
        from semantic_gate import adapt,simulate
        self.assertEqual(adapt(wrong)['gated_decision']['action'],'move')
        trace=simulate(adapt(wrong)['gated_decision'],dict(mara_at_depot=False,ash_in_east=True,west_blocked=False),'solo')
        self.assertEqual(trace['outcome'],'captured') # Gate cannot repair wrong extraction.

if __name__=='__main__': unittest.main()
