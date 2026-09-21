import importlib.util,pathlib,json,unittest,subprocess
ROOT=pathlib.Path(__file__).resolve().parent.parent
FILE=ROOT/'scripts/check-jev-safe-reference.py';checker=None
if FILE.exists():
 sp=importlib.util.spec_from_file_location('check',FILE);assert sp and sp.loader
 checker=importlib.util.module_from_spec(sp);sp.loader.exec_module(checker)
class Reference(unittest.TestCase):
 def test_forced_frame_and_mask_mutations_are_rejected(self):
  self.assertIsNotNone(checker,'safe postrun checker exists')
  # Derive the real singleton transition through the bridge then validate independently.
  s=json.loads((ROOT/'evidence/jev-controller/frozen/manifest.json').read_text())['starts'][0]['state']
  s.update(human={'x':0,'y':2},zombies=[{'x':0,'y':0},{'x':1,'y':0}])
  p=checker.runner.bridge({'op':'prepare','state':s});d=checker.runner.bridge({'op':'forced','state':s})
  e={'before':s,'truth':p['facts'],'mask':p['mask'],'action':d['action'],'agency':'forced_guardrail','answers':None,'receipt':None}
  run={'frames':[s,d['successor']],'decisions':[e],'outcome':'fixture'}
  self.assertEqual(checker.verify([run])['executedFrames'],1)
  e['mask']['safeActions']=['N']
  with self.assertRaises(AssertionError):checker.verify([run])
  e['mask']=p['mask']=checker.runner.bridge({'op':'prepare','state':s})['mask'];run['frames'][1]['human']['x']=1
  with self.assertRaises(AssertionError):checker.verify([run])
if __name__=='__main__':unittest.main()
