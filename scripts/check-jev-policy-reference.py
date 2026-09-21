#!/usr/bin/env python3
"""Offline parity of every visited action AND actual executed frame."""
import importlib.util,json,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('frozen_adapter',ROOT/'scripts/check-jev-controller-reference.py')
assert spec and spec.loader
reference=importlib.util.module_from_spec(spec);spec.loader.exec_module(reference)
def verify(runs):
 result=reference.verify(runs)
 executed=0
 for run in runs:
  state=run['frames'][0]
  for event in run['decisions']:
   assert event['before']==state
   if event.get('answers'):
    assert event['action']==event['answers']['human_action']['choice']
    action=next(a for a in event['truth']['actions'] if a['action']==event['action'])
    state=action['successor']
    assert run['frames'][state['tick']]==state
    assert (state['status']=='caught')==action['capture']
    executed+=1
   else:
    assert event is run['decisions'][-1]
  assert run['frames'][-1]==state
  assert len(run['frames'])==sum(bool(e.get('answers')) for e in run['decisions'])+1
  if run['outcome']=='capture':assert state['status']=='caught'
  if run['outcome']=='unresolved':assert state['tick']==12 and state['status']=='limit'
 result['executedFrames']=executed
 return result
if __name__=='__main__':
 directory=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'evidence/jev-policy/recording'
 runs=[json.loads(p.read_text()) for p in sorted(directory.glob('*.trajectory.json'))]
 assert runs,'No recordings; cannot claim a vacuous parity pass'
 print(json.dumps(verify(runs)))
