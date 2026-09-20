import importlib.util,json,pathlib,tempfile,unittest
p=pathlib.Path(__file__).with_name('run-jev-controller.py')
runner=None
if p.exists():
 spec=importlib.util.spec_from_file_location('controller_runner',p);runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
class ControllerAdmission(unittest.TestCase):
 def test_invalid_human_choice_consumes_one_call_and_never_moves_or_retries(self):
  self.assertIsNotNone(runner,'controller runner exists')
  starts=json.loads((p.parent.parent/'evidence/jev/frozen/dataset.json').read_text())['samples']
  manifest={'starts':[dict(id='run-01',state=dict(starts[0]['state'],tickLimit=12)),dict(id='run-02',state=dict(starts[-1]['state'],tickLimit=12))]}
  calls=[]
  def transport(raw):
   calls.append(raw);return 200,json.dumps({'model':'jev-1.13.0','answers':{},'usage':{'input_tokens':1,'output_tokens':0}}).encode()
  with tempfile.TemporaryDirectory() as d:
   result=runner.campaign(manifest,pathlib.Path(d),transport)
   self.assertEqual(len(calls),1);self.assertEqual(result['admitted'],1)
   run=json.loads((pathlib.Path(d)/'run-01.trajectory.json').read_text())
   self.assertEqual(run['outcome'],'invalid_response');self.assertEqual(len(run['frames']),1)
   with self.assertRaises(ValueError):runner.campaign(manifest,pathlib.Path(d),transport)
   self.assertEqual(len(calls),1)
if __name__=='__main__':unittest.main()
