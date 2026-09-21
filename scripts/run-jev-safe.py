#!/usr/bin/env python3
"""ZL-017 single-use bounded admission; never invoked by offline builds."""
import argparse,fcntl,importlib.util,json,os,pathlib,subprocess,time
ROOT=pathlib.Path(__file__).resolve().parent.parent
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,ROOT/file);assert spec and spec.loader
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
transport_module=load('safe_transport','scripts/run-jev.py')
reference=load('safe_reference','scripts/check-jev-controller-reference.py')
FROZEN=ROOT/'evidence/jev-safe/frozen/manifest.json'
OUT=ROOT/'evidence/jev-safe/recording'
def bridge(payload):
 p=subprocess.run(['node',str(ROOT/'scripts/jev-safe.cjs')],input=json.dumps(payload),capture_output=True,text=True,timeout=15)
 if p.returncode:raise ValueError('Safe controller bridge rejected input/response')
 return json.loads(p.stdout)
def independently_check(state,prepared):
 facts=prepared['facts']
 proof=reference.verify([{'decisions':[{'before':state,'truth':facts}]}])
 assert proof['decisions']==1
 safe=[a['action'] for a in facts['actions'] if not a['capture']]
 retained=safe or [a['action'] for a in facts['actions']]
 expected={'safeActions':safe,'retainedActions':retained,'safeSetSize':len(safe),'mode':'safe_candidates' if safe else 'all_unsafe_fallback','agency':'forced_guardrail' if len(safe)==1 else 'jev_choice'}
 assert prepared['mask']==expected,'Candidate mask differs from independently checked transitions'
 if len(safe)==1:assert prepared['request'] is None
 else:assert list(prepared['request']['questions']['human_action']['criteria'])==retained
 return dict(proof,stateIndex=facts['stateIndex'],maskVerified=True,checkedAt=transport_module.utc())
def campaign(manifest,out,transport):
 assert manifest['maxRequests']==24 and manifest['ticksPerRun']==12 and len(manifest['starts'])==2
 out.mkdir(parents=True,exist_ok=True)
 if (out/'run.json').exists():raise ValueError('ZL-017 already started; no second batch')
 transport_module.durable(out/'run.json',{'startedAt':transport_module.utc(),'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'runnerSHA256':transport_module.digest(pathlib.Path(__file__).read_bytes()),'manifestCanonicalSHA256':transport_module.digest(json.dumps(manifest,sort_keys=True).encode()),'price':manifest.get('checkedPrice')},'x')
 started=time.monotonic();halt=False;admitted=0;forced=0;executed=0
 for start in manifest['starts']:
  state=start['state'];run={'id':start['id'],'frames':[state],'decisions':[],'outcome':'not_started'}
  while state['status']=='running' and state['tick']<12 and not halt:
   if time.monotonic()-started>=900:run['outcome']='deadline';halt=True;break
   prepared=bridge({'op':'prepare','state':state})
   proof=independently_check(state,prepared)
   attempt_id=start['id']+'-tick-'+str(state['tick']+1).zfill(2)
   truth={'before':state,'truth':prepared['facts'],'mask':prepared['mask'],'reference':proof}
   transport_module.durable(out/(attempt_id+'.truth.json'),truth,'x')
   event=dict(truth,id=attempt_id,receipt=None,answers=None,action=None,agency=prepared['mask']['agency'])
   run['decisions'].append(event)
   if event['agency']=='forced_guardrail':
    decision=bridge({'op':'forced','state':state});forced+=1
   else:
    if admitted>=24:raise ValueError('Request bound exhausted before decision')
    raw=json.dumps(prepared['request'],separators=(',',':')).encode()
    assert len(raw)<=16384 and len(prepared['request']['questions'])==3
    with (out/(attempt_id+'.request.json')).open('xb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
    receipt=transport_module.attempt({'id':attempt_id,'sha256':transport_module.digest(raw)},raw,out,transport)
    admitted+=1;event['receipt']=receipt
    if receipt['outcome']!='received':run['outcome']='service_failure';halt=True;break
    response=json.loads((out/(attempt_id+'.response.json')).read_text())
    try:decision=bridge({'op':'decision','state':state,'response':response})
    except ValueError:run['outcome']='invalid_response';halt=True;break
   selected=next(a for a in prepared['facts']['actions'] if a['action']==decision['action'])
   assert decision['successor']==selected['successor'],'Execution differs from prechecked oracle transition'
   assert (decision['successor']['status']=='caught')==selected['capture']
   event['answers']=decision['answers'];event['action']=decision['action'];state=decision['successor'];run['frames'].append(state);executed+=1
   run['outcome']='capture' if state['status']=='caught' else 'unresolved'
   transport_module.durable(out/(start['id']+'.trajectory.json'),run)
  transport_module.durable(out/(start['id']+'.trajectory.json'),run)
  if halt:break
 result={'completedAt':transport_module.utc(),'admitted':admitted,'forcedSteps':forced,'executedSimulationTicks':executed,'elapsedMs':(time.monotonic()-started)*1000,'halted':halt}
 transport_module.durable(out/'complete.json',result,'x');return result

def validate_frozen():
 manifest=json.loads(FROZEN.read_text())
 assert manifest['model']=='jev-1.13.0' and manifest['maxRequests']==24 and manifest['ticksPerRun']==12 and len(manifest['starts'])==2
 for file,digest in {**manifest['sourceHashes'],**manifest['baselineHashes'],**manifest['inputHashes']}.items():
  raw=(ROOT/file).read_bytes();assert transport_module.digest(raw)==digest,'Frozen bytes changed'
  assert subprocess.check_output(['git','show','HEAD:'+file],cwd=ROOT)==raw,'Uncommitted frozen bytes'
 assert subprocess.check_output(['git','show','HEAD:'+str(FROZEN.relative_to(ROOT))],cwd=ROOT)==FROZEN.read_bytes(),'Manifest not committed'
 return manifest

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--live-authorized',action='store_true');args=parser.parse_args()
 if not args.live_authorized or os.environ.get('CI') or os.environ.get('GITHUB_ACTIONS'):raise ValueError('Explicit local consent required; CI paid calls prohibited')
 key=os.environ.get('TYPESAFE_API_KEY')
 if not key:raise ValueError('Key absent')
 manifest=validate_frozen()
 OUT.mkdir(parents=True,exist_ok=True)
 with (OUT/'run.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  if (OUT/'run.json').exists():raise ValueError('ZL-017 already started; no second batch')
  manifest['checkedPrice']=transport_module.check_price();start=time.monotonic()
  result=campaign(manifest,OUT,lambda raw:transport_module.send(raw,key,min(30,900-(time.monotonic()-start))))
  print(json.dumps(result))
if __name__=='__main__':
 try:main()
 except Exception as exc:print('Safe controller stopped: '+type(exc).__name__);raise SystemExit(1)
