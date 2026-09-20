#!/usr/bin/env python3
"""ZL-014 one-shot admission. Standard library only; never imported by CI builders."""
import argparse
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import signal
import ssl
import subprocess
import time
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
FROZEN = ROOT / 'evidence/jev/frozen'
RECORDING = ROOT / 'evidence/jev/recording'
MODEL = 'jev-1.13.0'
MAX_RESPONSE = 65536

def digest(raw):
    return hashlib.sha256(raw).hexdigest()

def utc():
    return datetime.now(timezone.utc).isoformat()

def durable(path, value, mode='w'):
    with path.open(mode) as f:
        f.write(json.dumps(value, sort_keys=True)+'\n')
        f.flush()
        os.fsync(f.fileno())

def attempt(row, raw, directory, transport):
    """Caller holds exclusive lock; admission survives all failures/crashes."""
    ledger = directory / 'admission.jsonl'
    prior = [json.loads(s) for s in ledger.read_text().splitlines()] if ledger.exists() else []
    if len(prior) >= 24 or any(p['id'] == row['id'] for p in prior):
        raise ValueError('Admission already consumed or 24-request limit exhausted')
    if digest(raw) != row['sha256'] or len(raw) > 16384:
        raise ValueError('Frozen request digest/size mismatch')
    admitted = {'id':row['id'], 'requestSHA256':digest(raw), 'admittedAt':utc(), 'number':len(prior)+1}
    durable(ledger, admitted, 'a')
    started = time.monotonic()
    result = dict(admitted, outcome='transport_error', httpStatus=None, responseSHA256=None, responseBytes=0)
    try:
        status, body = transport(raw)
        result['httpStatus'] = status
        if len(body) > MAX_RESPONSE:
            raise ValueError('Response exceeds 64 KiB')
        result['responseSHA256'] = digest(body)
        result['responseBytes'] = len(body)
        # Even error responses are recorded; authorization headers are never recorded.
        secret = os.environ.get('TYPESAFE_API_KEY', '')
        if secret and secret.encode() in body:
            raise ValueError('Credential reflection rejected; body not retained')
        with (directory / (row['id']+'.response.json')).open('xb') as f:
            f.write(body)
            f.flush()
            os.fsync(f.fileno())
        result['outcome'] = 'http_error' if status != 200 else 'received'
        try:
            parsed = json.loads(body)
            if status == 200 and parsed.get('model') != MODEL:
                result['outcome'] = 'model_mismatch'
            if isinstance(parsed.get('usage'),dict):
                result['usage'] = {k:parsed['usage'].get(k) for k in ['input_tokens','output_tokens']}
        except (ValueError, AttributeError):
            if status == 200:
                result['outcome'] = 'invalid_json'
    except Exception as exc:
        # Exception strings can contain URLs/headers/provider content. Retain class only.
        result['errorType'] = type(exc).__name__
    finally:
        result['latencyMs'] = (time.monotonic()-started)*1000
        result['completedAt'] = utc()
        durable(directory/(row['id']+'.receipt.json'),result,'x')
    return result

def alarm_handler(signum, frame):
    raise TimeoutError('Absolute request deadline')

def send(raw, key, seconds=30):
    """No redirect handling, retry layer, cookies, proxy or alternate host."""
    if not 0 < seconds <= 30:
        raise ValueError('Request deadline must be in (0,30] seconds')
    conn = http.client.HTTPSConnection('api.typesafe.ai',timeout=seconds,context=ssl.create_default_context())
    old = signal.signal(signal.SIGALRM,alarm_handler)
    signal.setitimer(signal.ITIMER_REAL,seconds)
    started = time.monotonic()
    try:
        conn.request('POST','/v1/systemone',body=raw,headers={
            'Authorization':'Bearer '+key,'Content-Type':'application/json','Accept':'application/json','Content-Length':str(len(raw))})
        response = conn.getresponse()
        body = response.read(MAX_RESPONSE+1)
        if time.monotonic()-started >= seconds:
            raise TimeoutError('Absolute request deadline')
        return response.status, body
    finally:
        signal.setitimer(signal.ITIMER_REAL,0)
        signal.signal(signal.SIGALRM,old)
        conn.close()

def validate_frozen():
    manifest = json.loads((FROZEN/'manifest.json').read_text())
    if manifest['model'] != MODEL or len(manifest['requests']) != 24:
        raise ValueError('Frozen model/count mismatch')
    if digest((FROZEN/'dataset.json').read_bytes()) != manifest['datasetSHA256']:
        raise ValueError('Frozen dataset mismatch')
    for row in manifest['requests']:
        raw = (FROZEN/row['file']).read_bytes()
        req = json.loads(raw)
        if digest(raw)!=row['sha256'] or len(raw)>16384 or len(req['questions'])>18 or req['model']!=MODEL:
            raise ValueError('Frozen request invalid')
    for file, sha in manifest['sourceHashes'].items():
        if digest((ROOT/file).read_bytes())!=sha:
            raise ValueError('Frozen source changed: '+file)
    if manifest['preflightEstimatedUSD'] >= 1:
        raise ValueError('Cost estimate exceeds preflight contract')
    # Every frozen byte must already exist identically in HEAD before a paid request.
    paths=['evidence/jev/frozen/manifest.json','evidence/jev/frozen/dataset.json']+[str((FROZEN/r['file']).relative_to(ROOT)) for r in manifest['requests']]
    for file in paths:
        committed=subprocess.check_output(['git','show','HEAD:'+file],cwd=ROOT)
        if committed != (ROOT/file).read_bytes():
            raise ValueError('Frozen inputs not committed')
    return manifest

def check_price():
    conn=http.client.HTTPSConnection('docs.typesafe.ai',timeout=15,context=ssl.create_default_context())
    try:
        conn.request('GET','/models.md')
        response=conn.getresponse()
        raw=response.read(65537)
        text=raw.decode()
        if response.status!=200 or len(raw)>65536 or MODEL not in text or '\\$0.042' not in text or 'Output tokens are free' not in text:
            raise ValueError('Official price/model changed or unavailable')
        return {'checkedAt':utc(),'url':'https://docs.typesafe.ai/models.md','sha256':digest(raw),'inputUSDPerMillion':.042,'outputFree':True}
    finally:
        conn.close()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live-authorized',action='store_true')
    args=parser.parse_args()
    if not args.live_authorized or os.environ.get('CI') or os.environ.get('GITHUB_ACTIONS'):
        raise ValueError('Explicit local authorization required; CI real calls prohibited')
    key=os.environ.get('TYPESAFE_API_KEY')
    if not key:
        raise ValueError('TYPESAFE_API_KEY missing')
    manifest=validate_frozen()
    # Parent-created independent check must bind this exact frozen dataset.
    reference=json.loads((ROOT/'evidence/jev/reference.json').read_text())
    if reference.get('datasetSHA256')!=manifest['datasetSHA256'] or reference.get('valid') is not True:
        raise ValueError('Independent reference gate missing or mismatched')
    RECORDING.mkdir(parents=True,exist_ok=True)
    with (RECORDING/'run.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        # Never start another batch, even after partial execution. A crash is a retained failure.
        if (RECORDING/'run.json').exists():
            raise ValueError('Pilot already started; no second batch authorized')
        price=check_price()
        durable(RECORDING/'run.json',{'startedAt':utc(),'manifestSHA256':digest((FROZEN/'manifest.json').read_bytes()),'runnerSHA256':digest(Path(__file__).read_bytes()),'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'price':price},'x')
        start=time.monotonic()
        for row in manifest['requests']:
            if time.monotonic()-start >= 900:
                break
            result=attempt(row,(FROZEN/row['file']).read_bytes(),RECORDING,lambda raw:send(raw,key,min(30,900-(time.monotonic()-start))))
            print(json.dumps({k:result[k] for k in ['id','outcome','httpStatus','latencyMs']}),flush=True)
            if result['outcome'] not in ['received','invalid_json']:
                break
        durable(RECORDING/'complete.json',{'completedAt':utc(),'elapsedMs':(time.monotonic()-start)*1000,'admitted':len((RECORDING/'admission.jsonl').read_text().splitlines())},'x')

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('Pilot stopped: '+type(exc).__name__+': '+str(exc) if isinstance(exc,ValueError) else 'Pilot stopped: '+type(exc).__name__)
        raise SystemExit(1)
