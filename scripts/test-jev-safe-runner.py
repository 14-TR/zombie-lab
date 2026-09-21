import importlib.util,json,pathlib,tempfile,unittest,subprocess,os
ROOT=pathlib.Path(__file__).resolve().parent.parent
FILE=ROOT/'scripts/run-jev-safe.py';runner=None
if FILE.exists():
 s=importlib.util.spec_from_file_location('safe_runner',FILE);runner=importlib.util.module_from_spec(s);s.loader.exec_module(runner)
def manifest():return json.loads((ROOT/'evidence/jev-controller/frozen/manifest.json').read_text())
class SafeRunner(unittest.TestCase):
 def test_malformed_and_out_of_set_consume_one_then_stop(self):
  self.assertIsNotNone(runner,'separate safe runner exists')
  for response in [{'model':'jev-1.13.0','answers':{}},json.loads((ROOT/'evidence/jev-controller/recording/run-01-tick-01.response.json').read_text())]:
   if response['answers']:response['answers']['human_action']['choice']='stay'
   with tempfile.TemporaryDirectory() as d:
    out=pathlib.Path(d);calls=[]
    def transport(raw):
     calls.append(raw);self.assertEqual(len((out/'admission.jsonl').read_text().splitlines()),1)
     proof=json.loads((out/'run-01-tick-01.truth.json').read_text());self.assertTrue(proof['reference']['valid']);self.assertEqual(proof['mask']['safeActions'],['E','S'])
     return 200,json.dumps(response).encode()
    result=runner.campaign(manifest(),out,transport)
    self.assertEqual(result['admitted'],1);self.assertTrue(result['halted']);self.assertEqual(len(calls),1)
    trace=json.loads((out/'run-01.trajectory.json').read_text());self.assertEqual(trace['outcome'],'invalid_response');self.assertEqual(len(trace['frames']),1)
    with self.assertRaises(ValueError):runner.campaign(manifest(),out,transport)
 def test_singletons_never_call_and_tick_cap_is_simulation_not_admissions(self):
  self.assertIsNotNone(runner)
  m=manifest()
  # Real independently generated singleton fixture placed at final simulation tick.
  w=json.loads((ROOT/'evidence/jev-safe/tests/independent-witnesses.json').read_text())['singleton'];cells=w['cells']
  for start in m['starts']:
   s=start['state'];s['human']={'x':cells[0]%10,'y':cells[0]//10};s['zombies']=[{'x':c%10,'y':c//10} for c in cells[1:]];s['tick']=11
  with tempfile.TemporaryDirectory() as d:
   out=pathlib.Path(d);result=runner.campaign(m,out,lambda raw:self.fail('Forced decisions must not call'))
   self.assertEqual(result['admitted'],0);self.assertEqual(result['forcedSteps'],2);self.assertFalse((out/'admission.jsonl').exists())
   for start in m['starts']:
    r=json.loads((out/(start['id']+'.trajectory.json')).read_text());self.assertEqual(r['frames'][-1]['tick'],12);self.assertEqual(len(r['decisions']),1);self.assertIsNone(r['decisions'][0]['answers']);self.assertIsNone(r['decisions'][0]['receipt'])
 def test_oracle_disagreement_in_mask_stops_before_admission(self):
  self.assertIsNotNone(runner)
  from unittest.mock import patch
  real=runner.bridge
  def corrupted(payload):
   result=real(payload)
   if payload['op']=='prepare':result['mask']['safeActions']=['stay']
   return result
  with tempfile.TemporaryDirectory() as d,patch.object(runner,'bridge',side_effect=corrupted):
   with self.assertRaises(AssertionError):runner.campaign(manifest(),pathlib.Path(d),lambda raw:self.fail('No unverified call'))
   self.assertFalse((pathlib.Path(d)/'admission.jsonl').exists())
 def test_service_failure_counts_and_halts(self):
  self.assertIsNotNone(runner)
  for status,body in [(503,b'{}'),(200,b'{'),(200,b'{"model":"other"}')]:
   with tempfile.TemporaryDirectory() as d:
    calls=[]
    def transport(raw):calls.append(raw);return status,body
    result=runner.campaign(manifest(),pathlib.Path(d),transport)
    self.assertEqual(len(calls),1);self.assertEqual(result['admitted'],1);self.assertTrue(result['halted'])
 def test_ci_refusal_before_any_network_or_recording(self):
  self.assertTrue(FILE.exists())
  p=subprocess.run(['python3','-B',str(FILE),'--live-authorized'],env=dict(os.environ,CI='true'),text=True,capture_output=True)
  self.assertEqual(p.returncode,1);self.assertIn('Safe controller stopped: ValueError',p.stdout)
if __name__=='__main__':unittest.main()
