import json
import tempfile
import unittest
from pathlib import Path
try:
    import freeze_semantic_gate as freeze
except ImportError:
    freeze = None
ROOT=Path(__file__).resolve().parents[1]

class FreezeTests(unittest.TestCase):
    def test_prepare_is_label_free_and_hash_bound_offline(self):
        self.assertIsNotNone(freeze,'label-free materializer missing')
        spec=json.loads((ROOT/'evidence/jev-semantic-gate/spec.json').read_text())
        dev=json.loads((ROOT/'evidence/jev-semantic-gate/development.json').read_text())
        cases=[dict(id='fixture',text='Stay here.',world='must not leak',interpretation='must not leak')]
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp)/'prepared'
            result=freeze.prepare(out,cases,'synthetic-source-identity',spec,dev)
            raw=(out/'requests/fixture.json').read_bytes()
            self.assertNotIn(b'must not leak',raw)
            self.assertNotIn(b'fixture',raw)
            self.assertEqual(result['requests'][0]['sha256'],freeze.sha(raw))
            self.assertEqual(result['source_freeze_commit'],'synthetic-source-identity')
            self.assertLessEqual(len(raw),32768)
            self.assertLessEqual(result['conservative_estimate_usd'],.05)
            self.assertEqual(freeze.verify_files(out)['requests'],result['requests'])
            (out/'requests/fixture.json').write_bytes(raw+b' ')
            with self.assertRaises(ValueError): freeze.verify_files(out)
            with self.assertRaises(FileExistsError): freeze.prepare(out,cases,'x',spec,dev)

if __name__=='__main__': unittest.main()
