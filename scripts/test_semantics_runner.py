import unittest,tempfile,json,os
from pathlib import Path

class RunnerTests(unittest.TestCase):
    def test_single_use_durable_failure_admission_and_ci(self):
        self.assertTrue(Path(__file__).with_name('run_semantics.py').exists(), 'paid boundary not implemented')
        import run_semantics as s
        for env in ({'CI':'true'},{'GITHUB_ACTIONS':'true'},{'CI':'1'}):
            with self.assertRaises(ValueError): s.authorize(True,env)
        with self.assertRaises(ValueError): s.authorize(False,{})
        s.authorize(True,{})
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); requests=[('q1',b'{}'),('q2',b'{}')]
            calls=[]
            def transport(raw):
                ledger=(root/'admission.jsonl').read_text().splitlines()
                self.assertEqual(len(ledger),1)
                self.assertEqual(json.loads(ledger[0])['id'],'q1')
                calls.append(raw)
                raise TimeoutError('synthetic boundary failure, no paid API')
            summary=s.campaign(root,requests,transport,0.042,dict(test=True))
            self.assertEqual(len(calls),1)
            self.assertEqual(summary['admissions'],1)
            self.assertEqual(summary['failures'],1)
            self.assertEqual(summary['unattempted'],1)
            before={p.name:p.read_bytes() for p in root.iterdir()}
            with self.assertRaises(FileExistsError): s.campaign(root,requests,transport,0.042,{})
            self.assertEqual(before,{p.name:p.read_bytes() for p in root.iterdir()})
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError): s.campaign(Path(d),[('same',b'{}')]*25,lambda _:None,0.042,{})
            with self.assertRaises(ValueError): s.campaign(Path(d),[('q',b'x'*32768)],lambda _:None,99,{})
            self.assertEqual(list(Path(d).iterdir()),[])

    def test_live_price_table_is_parsed_not_substring_matched(self):
        import run_semantics as s
        self.assertTrue(hasattr(s,'checked_price'),'live price parser not implemented')
        text=(Path(__file__).resolve().parents[1]/'evidence/jev-semantics/sources/models.md').read_text()
        self.assertEqual(s.checked_price(text),0.042)
        with self.assertRaises(ValueError): s.checked_price(text.replace('\\$0.042','\\$0.420')+' old price 0.042')
        with self.assertRaises(ValueError): s.checked_price(text.replace('Output tokens are free','Output tokens cost money'))

if __name__=='__main__': unittest.main()
