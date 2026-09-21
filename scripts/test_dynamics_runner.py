import importlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

class RunnerTests(unittest.TestCase):
    def load(self):
        self.assertTrue((Path(__file__).parent/'run_dynamics.py').exists(), 'bounded runner missing')
        return importlib.import_module('run_dynamics')
    def test_failure_durably_consumes_and_rerun_refuses(self):
        r=self.load()
        raw=json.dumps({'model':'jev-1.13.0','state':{},'questions':{}}).encode()
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);calls=[]
            def fail(body):
                calls.append(body)
                self.assertEqual(len((root/'admission.jsonl').read_text().splitlines()),1)
                self.assertTrue((root/'run.json').exists())
                raise TimeoutError()
            result=r.run_batch([{'id':'test-01','raw':raw}],root,fail,{'testFixture':True})
            self.assertEqual(len(calls),1)
            self.assertEqual(result['admitted'],1)
            self.assertTrue(result['halted'])
            self.assertEqual(json.loads((root/'test-01.receipt.json').read_text())['outcome'],'transport_error')
            with self.assertRaises(ValueError): r.run_batch([{'id':'test-01','raw':raw}],root,fail,{})
            self.assertEqual(len(calls),1)
    def test_ci_refuses_before_any_network_or_directory(self):
        r=self.load()
        for key in ['CI','GITHUB_ACTIONS']:
            with patch.dict(os.environ,{key:'true'}):
                with self.assertRaises(ValueError): r.gate(True)
        with self.assertRaises(ValueError): r.gate(False)
    def test_budget_and_duplicate_admission(self):
        r=self.load()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            row={'id':'test-01','raw':b'{}'}
            with self.assertRaises(ValueError):r.run_batch([row]*25,root,lambda b:None,{})
            self.assertFalse((root/'run.json').exists())
            with self.assertRaises(ValueError):r.run_batch([row,row],root,lambda b:None,{})
            self.assertFalse((root/'run.json').exists())
            with self.assertRaises(ValueError):r.run_batch([dict(row,raw=b'x'*16385)],root,lambda b:None,{})
    def test_malformed_http_json_and_out_of_set_are_no_retry(self):
        r=self.load()
        req={'model':'jev-1.13.0','state':{},'questions':{'t1_H_x':{'type':'choice','criteria':{'0':'zero','1':'one'}}}}
        bad={'model':'jev-1.13.0','answers':{'t1_H_x':{'type':'choice','choice':'999','confidence':1,'probabilities':{'0':0,'1':1}}}}
        for status,body in [(500,b'{}'),(200,b'not-json'),(200,json.dumps(bad).encode())]:
            with tempfile.TemporaryDirectory() as tmp:
                calls=[]
                def transport(raw):calls.append(raw);return status,body
                result=r.run_batch([{'id':'t','raw':json.dumps(req).encode()}],Path(tmp),transport,{'testFixture':True})
                self.assertTrue(result['halted']);self.assertEqual(len(calls),1)
                self.assertEqual((Path(tmp)/'t.response.json').read_bytes(),body)

if __name__=='__main__':unittest.main()
