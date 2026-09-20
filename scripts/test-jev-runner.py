"""Offline runner tests: injected transport, never real network."""
import importlib.util
import json
import pathlib
import tempfile
import unittest

HERE = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location('run_jev', HERE / 'run-jev.py')
runner = None
if pathlib.Path(spec.origin).exists():
    runner = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(runner)

class AdmissionTest(unittest.TestCase):
    def test_failures_consume_admission_before_transport_and_no_retry(self):
        self.assertIsNotNone(runner, 'bounded runner exists')
        with tempfile.TemporaryDirectory() as d:
            ledger = pathlib.Path(d) / 'admission.jsonl'
            calls = []
            def fail(raw):
                self.assertEqual(len(ledger.read_text().splitlines()), 1)
                calls.append(raw)
                raise TimeoutError()
            row = {'id': 'sample-01', 'sha256': runner.digest(b'{}')}
            result = runner.attempt(row, b'{}', pathlib.Path(d), fail)
            self.assertEqual(result['outcome'], 'transport_error')
            self.assertEqual(len(calls), 1)
            with self.assertRaises(ValueError):
                runner.attempt(row, b'{}', pathlib.Path(d), fail)
            self.assertEqual(len(calls), 1)
            for i in range(2,25):
                with ledger.open('a') as f:
                    f.write(json.dumps({'id': 'sample-%02d' % i})+'\n')
            with self.assertRaises(ValueError):
                runner.attempt({'id':'sample-25','sha256':runner.digest(b'{}')}, b'{}', pathlib.Path(d), fail)
            self.assertEqual(len(calls), 1)

class LimitsTest(unittest.TestCase):
    def test_transport_refuses_redirects_and_oversize_without_second_call(self):
        assert runner is not None
        for status, body, expected in [(302,b'{}','http_error'),(200,b'x'*65537,'transport_error'),(200,b'{','invalid_json'),(200,b'{"model":"other"}','model_mismatch')]:
            with tempfile.TemporaryDirectory() as d:
                calls=[]
                def transport(raw):
                    calls.append(raw)
                    return status,body
                row={'id':'sample-01','sha256':runner.digest(b'{}')}
                got=runner.attempt(row,b'{}',pathlib.Path(d),transport)
                self.assertEqual(got['outcome'],expected)
                self.assertEqual(len(calls),1)
                self.assertEqual(len((pathlib.Path(d)/'admission.jsonl').read_text().splitlines()),1)
    def test_invalid_request_never_admitted(self):
        assert runner is not None
        with tempfile.TemporaryDirectory() as d:
            raw=b'x'*16385
            with self.assertRaises(ValueError):
                runner.attempt({'id':'x','sha256':runner.digest(raw)},raw,pathlib.Path(d),lambda raw:self.fail('Network must not run'))
            self.assertFalse((pathlib.Path(d)/'admission.jsonl').exists())
    def test_ci_refuses_live_mode_without_network(self):
        import os,subprocess
        env=dict(os.environ,CI='true')
        result=subprocess.run(['python3','-B',str(HERE/'run-jev.py'),'--live-authorized'],env=env,capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0)
        self.assertIn('CI real calls prohibited',result.stdout)

if __name__ == '__main__': unittest.main()
