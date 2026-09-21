import json
import tempfile
import unittest
from pathlib import Path
try:
    import run_semantic_gate as runner
except ImportError:
    runner = None

class RunnerTests(unittest.TestCase):
    def test_ci_refuses_without_transport_and_failure_is_single_use(self):
        self.assertIsNotNone(runner, 'separate bounded runner missing')
        for env in ({'CI':'true'}, {'GITHUB_ACTIONS':'true'}, {}):
            with self.assertRaises(ValueError): runner.authorize(env == {}, env, False)
        runner.authorize(True, {}, True)
        calls=[]
        def fail(raw):
            calls.append(raw)
            raise TimeoutError('synthetic, not service')
        req=json.dumps({'model':'jev-1.13.0','state':{'text':'synthetic'},'questions':{}}).encode()
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'campaign'
            result=runner.campaign(path, [('a',req),('b',req)], fail, {})
            self.assertEqual((result['admissions'],result['failures']), (1,1))
            self.assertEqual(len(calls),1)
            self.assertEqual(len((path/'admission.jsonl').read_text().splitlines()),1)
            with self.assertRaises(FileExistsError): runner.campaign(path,[('a',req)],fail,{})
            self.assertEqual(len(calls),1)
        for rows in ([('a',req)]*25, [('../a',req)], [('a',req),('a',req)], [('a',req.replace(b'jev-1.13.0',b'jev-latest'))], [('a',b'x'*32769)]):
            with tempfile.TemporaryDirectory() as tmp:
                with self.assertRaises(ValueError): runner.campaign(Path(tmp)/'campaign',rows,fail,{})
        self.assertEqual(len(calls),1)

if __name__ == '__main__': unittest.main()
