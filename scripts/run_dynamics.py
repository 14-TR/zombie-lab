#!/usr/bin/env python3
"""ZL-018 single-use local runner; NEVER invoke an old campaign."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import resource
import subprocess
import time
from datetime import datetime,timezone
from dynamics_score import parse_response

ROOT=Path(__file__).resolve().parent.parent
EVIDENCE=ROOT/'evidence/jev-dynamics'
FROZEN=EVIDENCE/'frozen'
RECORDING=EVIDENCE/'recording'
_spec=importlib.util.spec_from_file_location('historical_transport',ROOT/'scripts/run-jev.py')
assert _spec is not None and _spec.loader is not None
transport_module=importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(transport_module)  # pure definitions; never historical main
sha=lambda raw:hashlib.sha256(raw).hexdigest()
utc=lambda:datetime.now(timezone.utc).isoformat()


def durable(path,value,mode='x'):
    with path.open(mode) as file:
        file.write(json.dumps(value,sort_keys=True,allow_nan=False)+'\n');file.flush();os.fsync(file.fileno())
    # Persist directory creation/name as well as file contents.
    descriptor=os.open(str(path.parent),os.O_RDONLY)
    try:os.fsync(descriptor)
    finally:os.close(descriptor)

def gate(authorized):
    if not authorized or os.environ.get('CI') or os.environ.get('GITHUB_ACTIONS'):
        raise ValueError('Explicit local consent required; CI refuses all paid calls')

def run_batch(rows,directory,transport,identity):
    if not 0<len(rows)<=24 or len({r['id'] for r in rows})!=len(rows):raise ValueError('Admission count/duplicates')
    if any(len(r['raw'])>16384 for r in rows):raise ValueError('16KiB request bound')
    estimate=sum((len(r['raw'])+8192)*.042/1e6 for r in rows)
    if estimate>.05:raise ValueError('Conservative estimated cost bound')
    directory.mkdir(parents=True,exist_ok=True)
    with (directory/'run.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if (directory/'run.json').exists() or (directory/'admission.jsonl').exists():
            raise ValueError('ZL-018 already started; no resume or second batch')
        durable(directory/'run.json',dict(identity,startedAt=utc(),campaign='ZL-018',maximumRequests=24,
                concurrency=1,retries=0,warmups=0,estimatedCeilingUSD=estimate))
        started=time.monotonic();count=0;halted=False
        for row in rows:
            if time.monotonic()-started>=900:halted=True;break
            raw=row['raw'];count+=1
            admission={'id':row['id'],'number':count,'admittedAt':utc(),'requestSHA256':sha(raw),'requestBytes':len(raw)}
            durable(directory/'admission.jsonl',admission,'a')
            receipt=dict(admission,outcome='transport_error',httpStatus=None,responseSHA256=None,responseBytes=0)
            clock=time.monotonic()
            try:
                status,body=transport(raw)
                receipt['httpStatus']=status
                if len(body)>65536:raise ValueError('response bound')
                secret=os.environ.get('TYPESAFE_API_KEY','')
                if secret and secret.encode() in body:raise ValueError('credential reflection')
                with (directory/(row['id']+'.response.json')).open('xb') as file:
                    file.write(body);file.flush();os.fsync(file.fileno())
                receipt.update(responseSHA256=sha(body),responseBytes=len(body))
                if status!=200:receipt['outcome']='http_error'
                else:
                    receipt['outcome']='invalid_json'
                    parsed=json.loads(body)
                    receipt['outcome']='invalid_schema'
                    parse_response(json.loads(raw),parsed)
                    receipt['outcome']='received'
                    usage=parsed.get('usage',{})
                    if isinstance(usage,dict):receipt['usage']={k:usage.get(k) for k in ['input_tokens','output_tokens']}
            except Exception as error:
                receipt['errorType']=type(error).__name__
            finally:
                receipt.update(completedAt=utc(),latencyMs=(time.monotonic()-clock)*1000)
                durable(directory/(row['id']+'.receipt.json'),receipt)
            print(json.dumps({k:receipt[k] for k in ['id','outcome','httpStatus','latencyMs']}),flush=True)
            if receipt['outcome']!='received':halted=True;break
        completed={'completedAt':utc(),'elapsedMs':(time.monotonic()-started)*1000,'admitted':count,
                   'planned':len(rows),'halted':halted,'peakRSSBytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}
        durable(directory/'complete.json',completed)
        return completed

def validate_frozen():
    manifest=json.loads((FROZEN/'manifest.json').read_text())
    if manifest['model']!='jev-1.13.0' or len(manifest['requests'])!=24:raise ValueError('model/count')
    for path,digest in manifest['hashes'].items():
        raw=(ROOT/path).read_bytes()
        if sha(raw)!=digest:raise ValueError('Frozen bytes changed: '+path)
        if subprocess.check_output(['git','show','HEAD:'+path],cwd=ROOT)!=raw:raise ValueError('Uncommitted freeze: '+path)
    manifest_path='evidence/jev-dynamics/frozen/manifest.json'
    if subprocess.check_output(['git','show','HEAD:'+manifest_path],cwd=ROOT)!=(ROOT/manifest_path).read_bytes():
        raise ValueError('Manifest not committed')
    if manifest['independentCheck']['valid'] is not True:raise ValueError('Independent gate missing')
    rows=[]
    for row in manifest['requests']:
        raw=(ROOT/row['file']).read_bytes()
        request=json.loads(raw)
        if sha(raw)!=row['sha256'] or request['model']!='jev-1.13.0' or len(request['questions'])!=14:
            raise ValueError('Frozen request invalid')
        rows.append({'id':row['id'],'raw':raw})
    return manifest,rows

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live-authorized',action='store_true')
    args=parser.parse_args();gate(args.live_authorized)
    if (RECORDING/'run.json').exists():raise ValueError('ZL-018 already started; permanently single-use')
    key=os.environ.get('TYPESAFE_API_KEY')
    if not key:raise ValueError('TYPESAFE_API_KEY absent')
    manifest,rows=validate_frozen()
    price=transport_module.check_price()  # docs GET only; never a model warmup
    identity={'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
              'manifestSHA256':sha((FROZEN/'manifest.json').read_bytes()),'price':price,
              'authorizationMessage':'1551433908577501254','authorizationThread':'1551351642509803581'}
    start=time.monotonic()
    result=run_batch(rows,RECORDING,lambda raw:transport_module.send(raw,key,min(30,900-(time.monotonic()-start))),identity)
    print(json.dumps(result))

if __name__=='__main__':
    try:main()
    except Exception as error:
        print('ZL-018 stopped: '+str(error) if isinstance(error,ValueError) else 'ZL-018 stopped: '+type(error).__name__)
        raise SystemExit(1)
