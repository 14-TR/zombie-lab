#!/usr/bin/env python3
"""Portable offline adapter; independent oracle source is never modified."""
import hashlib,importlib.util,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
SOURCE=ROOT/'evidence/jev/independent-reference/oracle.py'
spec=importlib.util.spec_from_file_location('frozen_independent_oracle',SOURCE)
oracle=importlib.util.module_from_spec(spec);spec.loader.exec_module(oracle)
# Rebind only filesystem location, preserving all pinned source/certificate hashes.
oracle.BASELINE=ROOT

def verify(runs):
 ranks=oracle.load_certificate(ROOT/'evidence/avoidability/data/avoidability-certificate.json')['ranks']
 count=0;actions=0
 for run in runs:
  for event in run['decisions']:
   s=event['before'];f=event['truth'];r=oracle.record_truth({'stateIndex':f['stateIndex'],'human':s['human'],'zombie1':s['zombies'][0],'zombie2':s['zombies'][1]},ranks)
   assert r['rank']==f['rank'] and r['terminal'] is False
   assert [z['actionName'] for z in r['zombieMoves']]==f['zombieMoves']
   assert len(r['actions'])==len(f['actions'])
   for a,b in zip(f['actions'],r['actions']):
    assert a['action']==b['actionName'] and a['successorIndex']==b['successorIndex']
    assert a['capture']==b['captured'] and a['rank']==b['successorRank'] and a['avoidable']==b['successorAvoidable']
    assert a['successor']['human']==b['successor']['human']
    assert a['successor']['zombies']==[b['successor']['zombie1'],b['successor']['zombie2']]
    assert a['successor']['tick']==s['tick']+1
    actions+=1
   count+=1
 return {'valid':True,'runs':len(runs),'decisions':count,'legalActions':actions,'oracleSHA256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'scope':'all visited-state labels checked by frozen independent algorithm; not independent implementation review'}
if __name__=='__main__':
 files=sorted((ROOT/'evidence/jev-controller/recording').glob('*.trajectory.json'))
 result=verify([json.loads(p.read_text()) for p in files]);print(json.dumps(result))
