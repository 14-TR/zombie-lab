import unittest, json, tempfile, shutil, subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
class FreezeTests(unittest.TestCase):
    def test_split_blind_bundle_whitelist_and_historical_corruption(self):
        self.assertTrue(Path(__file__).with_name('freeze_semantics.py').exists(), 'freeze integrity not implemented')
        import freeze_semantics as f
        data=ROOT/'evidence/jev-semantics/data'
        cases=json.loads((data/'test-inputs.json').read_text()); gold=json.loads((data/'test-gold.json').read_text()); dev=json.loads((data/'development.json').read_text()); spec=json.loads((data/'spec.json').read_text())
        f.check_split(cases,gold,dev)
        self.assertEqual(len(cases),20)
        self.assertEqual(len({c['group'] for c in cases}),10)
        bad=[dict(cases[0],group=dev[0]['group'])]+cases[1:]
        with self.assertRaises(ValueError): f.check_split(bad,gold,dev)
        with tempfile.TemporaryDirectory() as d:
            target=Path(d)
            f.blind_bundle(target,cases,spec,dev)
            self.assertEqual({p.name for p in target.iterdir()},{'README.md','test-texts.json','instructions.json','development.json','output-schema.json'})
            blind=json.loads((target/'test-texts.json').read_text())
            self.assertEqual(blind,[{'id':c['id'],'text':c['text']} for c in cases])
            self.assertEqual(json.loads((target/'instructions.json').read_text()),spec)
            self.assertEqual(json.loads((target/'development.json').read_text()),[{'text':d['text'],'interpretation':d['interpretation']} for d in dev])
            self.assertTrue(all(set(c)=={'id','text'} for c in blind))
            p=target/'history';p.write_bytes(b'original')
            manifest={'history':f.sha(p.read_bytes())}
            f.verify_files(target,manifest)
            p.write_bytes(b'changed')
            with self.assertRaises(ValueError): f.verify_files(target,manifest)
            p.unlink()
            with self.assertRaises(ValueError): f.verify_files(target,manifest)

if __name__=='__main__': unittest.main()
