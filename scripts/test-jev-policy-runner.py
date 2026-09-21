import importlib.util,json,pathlib,tempfile,unittest
ROOT=pathlib.Path(__file__).resolve().parent.parent
FILE=ROOT/'scripts/run-jev-policy.py'
runner=None
if FILE.exists():
 spec=importlib.util.spec_from_file_location('policy_runner',FILE);runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
class PolicyAdmission(unittest.TestCase):
 def test_malformed_zombie_consumes_one_admission_after_real_reference_gate_then_halts(self):
  self.assertIsNotNone(runner,'separate policy runner exists')
  manifest=json.loads((ROOT/'evidence/jev-controller/frozen/manifest.json').read_text())
  response=json.loads((ROOT/'evidence/jev-controller/recording/run-01-tick-01.response.json').read_text())
  del response['answers']['zombie1_move'];calls=[]
  with tempfile.TemporaryDirectory() as d:
   out=pathlib.Path(d)
   def transport(raw):
    calls.append(raw)
    proof=json.loads((out/'run-01-tick-01.truth.json').read_text())
    self.assertTrue(proof['reference']['valid'])
    self.assertEqual(len((out/'admission.jsonl').read_text().splitlines()),1)
    request=json.loads(raw)
    self.assertNotIn('truth',request['state'])
    self.assertNotIn('actions',request['state'])
    return 200,json.dumps(response).encode()
   result=runner.campaign(manifest,out,transport)
   self.assertEqual(result['admitted'],1);self.assertEqual(len(calls),1);self.assertTrue(result['halted'])
   run=json.loads((out/'run-01.trajectory.json').read_text())
   self.assertEqual(run['outcome'],'invalid_response');self.assertEqual(len(run['frames']),1)
   self.assertFalse((out/'run-02.trajectory.json').exists())
   with self.assertRaises(ValueError):runner.campaign(manifest,out,transport)
   self.assertEqual(len(calls),1)
 def test_postrun_checker_rejects_mutated_executed_frame(self):
  file=ROOT/'scripts/check-jev-policy-reference.py'
  self.assertTrue(file.exists(),'policy postrun checker exists')
  spec=importlib.util.spec_from_file_location('policy_check',file);check=importlib.util.module_from_spec(spec);spec.loader.exec_module(check)
  runs=[json.loads(f.read_text()) for f in sorted((ROOT/'evidence/jev-controller/recording').glob('*.trajectory.json'))]
  self.assertEqual(check.verify(runs)['decisions'],19)
  runs[1]['frames'][-1]['human']['x']=9
  with self.assertRaises(AssertionError):check.verify(runs)
if __name__=='__main__':unittest.main()
