#!/usr/bin/env python3
"""Separate ZL-016 authorization and ledger; ZL-014 is never resumed."""
import argparse,fcntl,importlib.util,json,os,pathlib,subprocess,time
ROOT=pathlib.Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('transport',ROOT/'scripts/run-jev.py')
transport_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(transport_module)
FROZEN=ROOT/'evidence/jev-policy/frozen/manifest.json'
OUT=ROOT/'evidence/jev-policy/recording'
ORACLE=ROOT/'evidence/jev/independent-reference/oracle.py'
reference_spec=importlib.util.spec_from_file_location('portable_reference',ROOT/'scripts/check-jev-controller-reference.py')
reference=importlib.util.module_from_spec(reference_spec);reference_spec.loader.exec_module(reference)

def bridge(payload):
 p=subprocess.run(['node',str(ROOT/'scripts/jev-policy.cjs')],input=json.dumps(payload),capture_output=True,text=True,timeout=15)
 if p.returncode:raise ValueError('Controller bridge rejected input/response')
 return json.loads(p.stdout)

def independently_check(state,facts):
 # Frozen Python algorithm, only filesystem location rebased by inherited adapter.
 proof=reference.verify([{'decisions':[{'before':state,'truth':facts}]}])
 assert proof['decisions']==1
 return dict(proof,stateIndex=facts['stateIndex'],checkedAt=transport_module.utc())

def campaign(manifest,out,transport):
 assert manifest['maxRequests']==24 and manifest['ticksPerRun']==12 and len(manifest['starts'])==2
 out.mkdir(parents=True,exist_ok=True)
 if (out/'run.json').exists():raise ValueError('ZL-016 already started; no second batch')
 transport_module.durable(out/'run.json',{'startedAt':transport_module.utc(),'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'runnerSHA256':transport_module.digest(pathlib.Path(__file__).read_bytes()),'manifestCanonicalSHA256':transport_module.digest(json.dumps(manifest,sort_keys=True).encode()),'price':manifest.get('checkedPrice')},'x')
 started=time.monotonic();halt=False;admitted=0
 for start in manifest['starts']:
  state=start['state'];run={'id':start['id'],'frames':[state],'decisions':[],'outcome':'not_started'}
  while state['status']=='running' and state['tick']<12 and not halt:
   if time.monotonic()-started>=900:run['outcome']='deadline';halt=True;break
   prepared=bridge({'op':'prepare','state':state})
   proof=independently_check(state,prepared['facts'])
   attempt_id=start['id']+'-tick-'+str(state['tick']+1).zfill(2)
   raw=json.dumps(prepared['request'],separators=(',',':')).encode()
   assert len(raw)<=16384 and len(prepared['request']['questions'])==3
   # Freeze checked evaluator-only truth and exact request BEFORE admission.
   transport_module.durable(out/(attempt_id+'.truth.json'),{'before':state,'truth':prepared['facts'],'reference':proof},'x')
   with (out/(attempt_id+'.request.json')).open('xb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
   receipt=transport_module.attempt({'id':attempt_id,'sha256':transport_module.digest(raw)},raw,out,transport)
   admitted+=1
   event={'id':attempt_id,'before':state,'truth':prepared['facts'],'reference':proof,'receipt':receipt,'answers':None}
   run['decisions'].append(event)
   if receipt['outcome']!='received':run['outcome']='service_failure';halt=True;break
   response=json.loads((out/(attempt_id+'.response.json')).read_text())
   try:decision=bridge({'op':'decision','state':state,'response':response})
   except ValueError:run['outcome']='invalid_response';halt=True;break
   event['answers']=decision['answers'];event['action']=decision['action'];state=decision['successor'];run['frames'].append(state)
   run['outcome']='capture' if state['status']=='caught' else 'unresolved'
   transport_module.durable(out/(start['id']+'.trajectory.json'),run)
  transport_module.durable(out/(start['id']+'.trajectory.json'),run)
  if halt:break
 result={'completedAt':transport_module.utc(),'admitted':admitted,'elapsedMs':(time.monotonic()-started)*1000,'halted':halt}
 transport_module.durable(out/'complete.json',result,'x');return result

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--live-authorized',action='store_true');args=parser.parse_args()
 if not args.live_authorized or os.environ.get('CI') or os.environ.get('GITHUB_ACTIONS'):raise ValueError('Explicit local consent required; CI paid calls prohibited')
 key=os.environ.get('TYPESAFE_API_KEY')
 if not key:raise ValueError('Key absent')
 manifest=json.loads(FROZEN.read_text())
 assert manifest['model']=='jev-1.13.0' and manifest['maxRequests']==24 and manifest['ticksPerRun']==12 and len(manifest['starts'])==2
 for file,digest in {**manifest['sourceHashes'],**manifest['baselineHashes']}.items():
  assert transport_module.digest((ROOT/file).read_bytes())==digest,'Frozen source changed'
  assert subprocess.check_output(['git','show','HEAD:'+file],cwd=ROOT)==(ROOT/file).read_bytes(),'Uncommitted source'
 assert subprocess.check_output(['git','show','HEAD:'+str(FROZEN.relative_to(ROOT))],cwd=ROOT)==FROZEN.read_bytes(),'Manifest not committed'
 manifest['checkedPrice']=transport_module.check_price()
 OUT.mkdir(parents=True,exist_ok=True)
 with (OUT/'run.lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  start=time.monotonic()
  result=campaign(manifest,OUT,lambda raw:transport_module.send(raw,key,min(30,900-(time.monotonic()-start))))
  print(json.dumps(result))
if __name__=='__main__':
 try:main()
 except Exception as exc:print('Controller stopped: '+type(exc).__name__);raise SystemExit(1)
