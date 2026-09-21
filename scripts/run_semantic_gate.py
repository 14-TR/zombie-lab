"""ZL020 only. Never resumes/refills ZL019. CLI is PHASE2 only; zero warmups/retries."""
import argparse
import json
import os
from pathlib import Path
import re
import urllib.request
from run_semantics import campaign as bounded_campaign, http_transport, checked_price, durable, utc, digest, PRICE, MODEL
from semantic_gate_io import loads

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT/'evidence/jev-semantic-gate'
ID = re.compile(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}\Z')


def authorize(live, env, phase2):
    if not live or not phase2 or any(env.get(k) for k in ('CI','GITHUB_ACTIONS')):
        raise ValueError('Refused: local PHASE2 and explicit live authorization required; never CI')


def campaign(directory, requests, transport, metadata):
    # Fully validate before exclusive run marker and before any transport call.
    if not 0 < len(requests) <= 24 or len({i for i,_ in requests}) != len(requests):
        raise ValueError('admission set bound')
    for ident, raw in requests:
        if not ID.fullmatch(ident) or not 0 < len(raw) <= 32768:
            raise ValueError('unsafe ID/request size')
        req = loads(raw)
        if set(req) != {'model','state','questions'} or req['model'] != MODEL:
            raise ValueError('unfrozen request/model')
    return bounded_campaign(directory, requests, transport, PRICE, metadata)


def main():
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--phase2-authorized',action='store_true')
    cli.add_argument('--live-authorized',action='store_true')
    args=cli.parse_args()
    authorize(args.live_authorized,os.environ,args.phase2_authorized) # before even docs network
    if (EVIDENCE/'recording/run.json').exists():
        raise FileExistsError('ZL020 permanently closed: existing single-use run marker')
    from freeze_semantic_gate import verify_source, verify_prepared
    freeze=verify_source(); prepared=verify_prepared()
    key=os.environ.get('TYPESAFE_API_KEY')
    if not key: raise ValueError('Existing environment key required')
    # Public price preflight is not an inference request. No key in this request.
    with urllib.request.urlopen('https://docs.typesafe.ai/models.md',timeout=20) as response:
        price_body=response.read(65537)
        if response.status != 200 or len(price_body)>65536: raise ValueError('price preflight bound')
    checked_price(price_body.decode())
    directory=EVIDENCE/'recording'; directory.mkdir(parents=True,exist_ok=True)
    durable(directory/'price-check.md',price_body)
    requests=[(r['id'],(EVIDENCE/'prepared/requests'/(r['id']+'.json')).read_bytes()) for r in prepared['requests']]
    summary=campaign(directory, requests, http_transport(key), dict(experiment='ZL020',source_freeze_commit=freeze,
        request_manifest_sha256=digest((EVIDENCE/'prepared/manifest.json').read_bytes()),
        price_sha256=digest(price_body),price_checked_utc=utc(),input_usd_per_million=PRICE,output_usd_per_million=0))
    print(json.dumps(summary,indent=2))

if __name__=='__main__': main()
