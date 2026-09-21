import json
import unittest
from pathlib import Path
try:
    import semantic_gate_io as gio
except ImportError:
    gio = None
ROOT = Path(__file__).resolve().parents[1]

class DecoderTests(unittest.TestCase):
    def test_duplicate_keys_rejected_at_every_depth(self):
        self.assertIsNotNone(gio, 'new duplicate-rejecting decoder missing')
        for raw in ('{"x":1,"x":2}', '{"a":{"x":1,"x":1}}', '{"a":[{"x":0,"x":0}]}'):
            with self.assertRaises(ValueError): gio.loads(raw)
        old = ROOT/'evidence/jev-semantics'
        req = json.loads((old/'frozen/requests/s06a.request.json').read_text())
        body = (old/'recording/s06a.response.raw').read_bytes()
        out = gio.decode(body, req)
        self.assertEqual(out['clarification'], 'none')
        self.assertEqual(out['ash_in_east'], 'suspected_positive')
        with self.assertRaises(ValueError): gio.decode(body.replace(b'"model":', b'"model":"jev-1.13.0","model":',1), req)
        obj = json.loads(body); a = obj['answers']['clarification']
        a['probabilities'] = dict(none=.49, goal=0, evidence=.50, both=.01)
        with self.assertRaises(ValueError): gio.decode(json.dumps(obj), req)

if __name__ == '__main__': unittest.main()
