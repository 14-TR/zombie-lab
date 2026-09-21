#!/usr/bin/env python3
"""Offline immutable-oracle parity, including forced actions and exact controls."""
import importlib.util,json,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('safe_runner',ROOT/'scripts/run-jev-safe.py');assert spec and spec.loader
runner=importlib.util.module_from_spec(spec);spec.loader.exec_module(runner)
def verify(runs):
 result=runner.reference.verify(runs);executed=0;forced=0;exact=0
 for run in runs:
  state=run['frames'][0];frame_index=0
  for event in run['decisions']:
   assert event['before']==state
   facts=event['truth'];safe=[a['action'] for a in facts['actions'] if not a['capture']]
   mask={'safeActions':safe,'retainedActions':safe or [a['action'] for a in facts['actions']],'safeSetSize':len(safe),'mode':'safe_candidates' if safe else 'all_unsafe_fallback','agency':'forced_guardrail' if len(safe)==1 else 'jev_choice'}
   assert event['mask']==mask
   action=event.get('action')
   if action is not None:
    agency=event['agency']
    if agency=='forced_guardrail':
     assert len(safe)==1 and action==safe[0] and event['answers'] is None and event['receipt'] is None;forced+=1
    elif agency=='exact_planner':
     winners=[a for a in facts['actions'] if a['rank']==-1]
     optimal=winners or [a for a in facts['actions'] if a['rank']==max(a['rank'] for a in facts['actions'])]
     assert action==optimal[0]['action'];exact+=1
    else:
     assert agency=='jev_choice' and len(safe)!=1
     assert action==event['answers']['human_action']['choice'] and action in mask['retainedActions']
    selected=next(a for a in facts['actions'] if a['action']==action)
    state=selected['successor'];frame_index+=1
    assert run['frames'][frame_index]==state
    assert (state['status']=='caught')==selected['capture'];executed+=1
   else:assert event is run['decisions'][-1]
  assert len(run['frames'])==frame_index+1 and run['frames'][-1]==state
  if run['outcome']=='capture':assert state['status']=='caught'
  if run['outcome']=='unresolved':assert state['tick']==12 and state['status']=='limit'
 result.update(executedFrames=executed,forcedSteps=forced,exactPlannerSteps=exact);return result
if __name__=='__main__':
 if len(sys.argv)>1 and sys.argv[1]=='--decision':
  p=json.load(sys.stdin);print(json.dumps(runner.independently_check(p['state'],p['prepared'])))
 else:
  directory=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'evidence/jev-safe/recording'
  runs=[json.loads(p.read_text()) for p in sorted(directory.glob('*.trajectory.json'))]
  if not runs:raise ValueError('Missing actual recordings')
  result=verify(runs)
  controls=ROOT/'evidence/jev-safe/frozen/exact-controls.json'
  if controls.exists():result['exactControls']=verify(json.loads(controls.read_text()))
  print(json.dumps(result))
