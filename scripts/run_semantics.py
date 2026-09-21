"""Single-use ZL019 admission boundary. No SDK, retries, or warmups."""
import argparse
import datetime
import hashlib
import http.client
import json
import os
from pathlib import Path
import resource
import signal
import time
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
EVIDENCE=ROOT/'evidence/jev-semantics'
MODEL='jev-1.13.0'
PRICE=0.042
MAX_CALLS=24
MAX_WIRE=32768
MAX_RESPONSE=131072


def utc(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def digest(raw): return hashlib.sha256(raw).hexdigest()


def authorize(live,env):
    if not live or any(env.get(k) for k in ('CI','GITHUB_ACTIONS')):
        raise ValueError('Live inference refused: explicit local authorization required; never CI')


def durable(path,raw,mode='xb'):
    with open(path,mode) as f:
        f.write(raw); f.flush(); os.fsync(f.fileno())


def json_bytes(value): return (json.dumps(value,sort_keys=True,indent=2,allow_nan=False)+'\n').encode()


def campaign(directory,requests,transport,price,metadata):
    if not 0<len(requests)<=MAX_CALLS or len({i for i,_ in requests})!=len(requests): raise ValueError('Invalid admission set')
    if any(len(raw)>MAX_WIRE for _,raw in requests): raise ValueError('Request bound')
    estimate=sum((len(raw)+8192)*price/1e6 for _,raw in requests)
    if price<=0 or estimate>0.05: raise ValueError('Conservative estimated cost cap')
    directory.mkdir(parents=True,exist_ok=True)
    start=time.monotonic_ns()
    durable(directory/'run.json',json_bytes(dict(started_utc=utc(),model=MODEL,estimated_ceiling_usd=estimate,planned=len(requests),hard_admission_cap=MAX_CALLS,metadata=metadata)))
    # Exclusive marker persists forever, including crashes before first admission.
    fd=os.open(directory,os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)
    admissions=failures=0
    for ident,raw in requests:
        if (time.monotonic_ns()-start)/1e9>=900: break
        admission=dict(sequence=admissions+1,id=ident,request_sha256=digest(raw),wire_bytes=len(raw),admitted_utc=utc())
        durable(directory/'admission.jsonl',(json.dumps(admission,sort_keys=True)+'\n').encode(),'ab')
        admissions+=1
        durable(directory/(ident+'.request.json'),raw)
        before=time.monotonic_ns(); status=None; body=b''; error=None
        try:
            status,body=transport(raw)
            if len(body)>MAX_RESPONSE: raise ValueError('Response size bound')
            if status!=200: error='HTTP_'+str(status)
        except Exception as exc:
            error=type(exc).__name__ # Do not log exception text / secrets.
        elapsed=(time.monotonic_ns()-before)/1e6
        if body: durable(directory/(ident+'.response.raw'),body)
        durable(directory/(ident+'.receipt.json'),json_bytes(dict(id=ident,http_status=status,error=error,latency_ms=elapsed,response_bytes=len(body),response_sha256=digest(body),request_sha256=digest(raw),finished_utc=utc())))
        if error:
            failures+=1
            break
    summary=dict(admissions=admissions,failures=failures,unattempted=len(requests)-admissions,wall_ms=(time.monotonic_ns()-start)/1e6,client_peak_rss_bytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,finished_utc=utc())
    durable(directory/'complete.json',json_bytes(summary))
    return summary


def http_transport(key):
    def send(raw):
        def timeout(_signum,_frame): raise TimeoutError('deadline')
        old=signal.signal(signal.SIGALRM,timeout)
        connection=http.client.HTTPSConnection('api.typesafe.ai',timeout=30)
        started=time.monotonic()
        signal.setitimer(signal.ITIMER_REAL,30)
        try:
            connection.request('POST','/v1/systemone',body=raw,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','Accept':'application/json'})
            response=connection.getresponse()
            body=response.read(MAX_RESPONSE+1)
            if time.monotonic()-started>=30: raise TimeoutError('deadline')
            return response.status,body
        finally:
            connection.close(); signal.setitimer(signal.ITIMER_REAL,0); signal.signal(signal.SIGALRM,old)
    return send


def checked_price(text):
    import re
    cleaned=text.replace('\\','')
    lines=[line for line in cleaned.splitlines() if line.startswith('| Price (per Btok / per Mtok)')]
    if len(lines)!=1 or MODEL not in text or 'Output tokens are free' not in text: raise ValueError('Unrecognized live price/model')
    match=re.search(r'\$([0-9.]+)\s*/\s*\$([0-9.]+)',lines[0])
    if not match or float(match[1])!=42 or float(match[2])!=PRICE: raise ValueError('Current price differs from freeze')
    return float(match[2])


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--live-authorized',action='store_true'); args=parser.parse_args()
    authorize(args.live_authorized,os.environ)
    directory=EVIDENCE/'recording'
    if (directory/'run.json').exists(): raise FileExistsError('ZL019 campaign permanently single-use; never refill')
    from freeze_semantics import verify
    manifest=verify(ROOT,require_clean=True)
    key=os.environ.get('TYPESAFE_API_KEY')
    if not key: raise ValueError('Existing environment key required')
    with urllib.request.urlopen('https://docs.typesafe.ai/models.md',timeout=20) as r:
        raw_price=r.read(65537)
        if r.status!=200 or len(raw_price)>65536: raise ValueError('Price check failed')
    text=raw_price.decode()
    checked_price(text)
    requests=[(item['id'],(ROOT/item['path']).read_bytes()) for item in manifest['requests']]
    directory.mkdir(exist_ok=True)
    durable(directory/'price-check.md',raw_price)
    summary=campaign(directory,requests,http_transport(key),PRICE,dict(freeze_commit=manifest['freeze_commit'],price_url='https://docs.typesafe.ai/models.md',price_checked_utc=utc(),price_sha256=digest(raw_price),input_usd_per_million=PRICE,output_usd_per_million=0))
    print(json.dumps(summary,indent=2))

if __name__=='__main__': main()
