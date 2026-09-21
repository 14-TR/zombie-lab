"""Offline source freeze and PHASE2 label-free materialization. No live I/O."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from semantic_gate_io import loads, request, wire
from semantic_gate_parser import parse
from run_semantic_gate import ID

ROOT=Path(__file__).resolve().parents[1]
E=ROOT/'evidence/jev-semantic-gate'
BASE='e87d88b7335d556d8c0ed5ac240ac8ddbd24aeb0'


def sha(raw): return hashlib.sha256(raw).hexdigest()
def git(*args): return subprocess.check_output(['git',*args],cwd=ROOT)
def encoded(value): return (json.dumps(value,indent=2,sort_keys=True,allow_nan=False)+'\n').encode()


def prepare(directory, cases, source_commit, spec, development):
    if not 0 < len(cases) <= 24 or len({c['id'] for c in cases}) != len(cases): raise ValueError('case bound/duplicates')
    built=[]
    for case in cases:
        ident=case['id']
        if not isinstance(ident,str) or not ID.fullmatch(ident) or not isinstance(case['text'],str) or not case['text'].strip(): raise ValueError('invalid case')
        req=request({'text':case['text']},spec,development); raw=wire(req)
        if len(raw)>32768: raise ValueError('request bound')
        built.append((ident,raw,parse(req)))
    estimate=sum((len(raw)+8192)*.042/1e6 for _,raw,_ in built)
    if estimate>.05: raise ValueError('cost estimate bound')
    directory.mkdir(parents=True,exist_ok=False)
    (directory/'requests').mkdir(); (directory/'parser').mkdir()
    files={}; requests=[]
    for ident,raw,pred in built:
        for rel,data in [('requests/'+ident+'.json',raw),('parser/'+ident+'.json',encoded(pred))]:
            (directory/rel).write_bytes(data); files[rel]=sha(data)
        requests.append(dict(id=ident,sha256=sha(raw),wire_bytes=len(raw)))
    manifest=dict(source_freeze_commit=source_commit,requests=requests,files=files,conservative_estimate_usd=estimate,
                  spec_sha256=sha(wire(spec)),development_sha256=sha(wire(development)))
    (directory/'manifest.json').write_bytes(encoded(manifest))
    return manifest


def verify_files(directory):
    manifest=loads((directory/'manifest.json').read_bytes())
    for rel,digest in manifest['files'].items():
        # Only request/parser leaf files are permitted; never follow path traversal.
        p=Path(rel)
        if len(p.parts)!=2 or p.parts[0] not in ('requests','parser') or not ID.fullmatch(p.stem) or p.suffix!='.json': raise ValueError('manifest path')
        if (directory/p).is_symlink() or sha((directory/p).read_bytes())!=digest: raise ValueError('prepared byte mismatch')
    return manifest


def verify_source():
    manifest_path=E/'source-freeze.json'; rel=str(manifest_path.relative_to(ROOT))
    manifest=loads(manifest_path.read_bytes())
    commit=git('log','--diff-filter=A','--format=%H','-1','--',rel).decode().strip()
    if not commit or git('show',commit+':'+rel)!=manifest_path.read_bytes(): raise ValueError('source freeze not committed')
    for path,digest in manifest['files'].items():
        data=(ROOT/path).read_bytes()
        if sha(data)!=digest or git('show',commit+':'+path)!=data: raise ValueError('source drift: '+path)
    # Additions allowed in phase 2, mutations/deletions of ANY inherited path not.
    if git('diff','--name-only','--diff-filter=DMRT',BASE,'--').strip(): raise ValueError('inherited tracked content changed')
    return commit


def verify_prepared():
    commit=verify_source(); directory=E/'prepared'; manifest=verify_files(directory)
    if manifest['source_freeze_commit']!=commit: raise ValueError('wrong source freeze')
    rel=str((directory/'manifest.json').relative_to(ROOT))
    frozen=git('log','--diff-filter=A','--format=%H','-1','--',rel).decode().strip()
    if not frozen or git('show',frozen+':'+rel)!=(directory/'manifest.json').read_bytes(): raise ValueError('request manifest must be committed before admission')
    for path in manifest['files']:
        rel=str((directory/path).relative_to(ROOT))
        if git('show',frozen+':'+rel)!=(directory/path).read_bytes(): raise ValueError('request bytes not committed')
    for row in manifest['requests']:
        raw=(directory/'requests'/(row['id']+'.json')).read_bytes()
        if sha(raw)!=row['sha256'] or len(raw)!=row['wire_bytes']: raise ValueError('request binding')
    return manifest


def main():
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--phase2-authorized',action='store_true'); cli.add_argument('--inputs',type=Path)
    args=cli.parse_args()
    if not args.phase2_authorized or args.inputs is None: raise ValueError('PHASE2 authorization required before opening new inputs')
    commit=verify_source()
    result=prepare(E/'prepared',loads(args.inputs.read_bytes()),commit,loads((E/'spec.json').read_bytes()),loads((E/'development.json').read_bytes()))
    print(json.dumps(dict(requests=len(result['requests']),estimate=result['conservative_estimate_usd'],source=commit)))

if __name__=='__main__': main()
