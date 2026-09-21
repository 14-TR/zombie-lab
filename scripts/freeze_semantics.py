"""Pre-inference source/input/gold/request freeze and blind-only export."""
import argparse
import collections
import hashlib
import json
from pathlib import Path
import subprocess
from semantics_core import OPTIONS, valid, parse, controller
from semantics_io import request, wire

ROOT=Path(__file__).resolve().parents[1]
REL='evidence/jev-semantics'
BASE='ca6ea28007e3daacd49c5a765ee52f1d24533526'


def sha(raw): return hashlib.sha256(raw).hexdigest()
def dump(path,value): path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(value,sort_keys=True,indent=2)+'\n')
def git(root,*args): return subprocess.check_output(['git',*args],cwd=root)


def check_split(cases,gold,development):
    ids=[c['id'] for c in cases]
    groups={c['group'] for c in cases}
    if len(cases)!=20 or len(set(ids))!=20 or len(groups)!=10 or set(ids)!=set(gold): raise ValueError('Membership/count mismatch')
    if groups & {d['group'] for d in development}: raise ValueError('Group leakage')
    if any(n!=2 for n in collections.Counter(c['group'] for c in cases).values()): raise ValueError('Paraphrase group mismatch')
    if {c['text'] for c in cases} & {d['text'] for d in development}: raise ValueError('Text leakage')
    dev_labels={tuple(d['interpretation'][k] for k in OPTIONS) for d in development}
    for c in cases:
        target=gold[c['id']]
        if not valid(target['interpretation']) or any(type(v) is not bool for v in target['world'].values()): raise ValueError('Invalid gold')
        if tuple(target['interpretation'][k] for k in OPTIONS) in dev_labels: raise ValueError('Complete development signature reused')
        for field in ('mara_at_depot','ash_in_east','west_blocked'):
            label=target['interpretation'][field]
            if label=='known' and not target['world'][field] or label=='negated' and target['world'][field]: raise ValueError('Gold firsthand/world inconsistency')
    for group in groups:
        pair=[gold[c['id']] for c in cases if c['group']==group]
        if pair[0]!=pair[1]: raise ValueError('Paraphrases not same scenario')


def blind_bundle(directory,cases,spec,development):
    directory.mkdir(parents=True,exist_ok=True)
    if any(directory.iterdir()): raise FileExistsError('Blind bundle destination must be empty')
    dump(directory/'test-texts.json',[{'id':c['id'],'text':c['text']} for c in cases])
    dump(directory/'instructions.json',spec)
    dump(directory/'development.json',[{'text':d['text'],'interpretation':d['interpretation']} for d in development])
    interpretation={'type':'object','additionalProperties':False,'required':list(OPTIONS),'properties':{k:{'type':'string','enum':list(values)} for k,values in OPTIONS.items()}}
    schema={'$schema':'https://json-schema.org/draft/2020-12/schema','type':'object','additionalProperties':False,'required':['predictions'],'properties':{'predictions':{'type':'array','minItems':20,'maxItems':20,'items':{'type':'object','additionalProperties':False,'required':['id','interpretation'],'properties':{'id':{'type':'string','enum':[c['id'] for c in cases]},'interpretation':interpretation}}}}}
    dump(directory/'output-schema.json',schema)
    (directory/'README.md').write_text('# Blind semantic interpretation input\n\nRead ONLY the five files in this directory. Interpret every test text using instructions.json, the exact answer options in its questions, and the permitted labeled development examples. Questions are independent interpretations of the same text. Return a JSON object matching output-schema.json, exactly one prediction per test id, no missing or duplicate ids. Use the five wire fields exactly as named. Do not access sibling directories, evaluation labels, parser/model outputs, reports, outcomes or outside tools/sources. Do not infer nonexistent facts. Do not calculate routes or simulator outcomes.\n\nOutput shape: {"predictions":[{"id":"<test id>","interpretation":{"mara_at_depot":"<option>","ash_in_east":"<option>","west_blocked":"<option>","policy":"<option>","clarification":"<option>"}}]}.\n')


def verify_files(root,hashes):
    for name,expected in hashes.items():
        path=root/name
        if not path.is_file() or sha(path.read_bytes())!=expected: raise ValueError('Byte preservation failure: '+name)


def verify(root=ROOT,require_clean=False):
    frozen=root/REL/'frozen'; manifest_path=frozen/'manifest.json'
    manifest=json.loads(manifest_path.read_text())
    verify_files(root,manifest['files'])
    verify_files(root,json.loads((frozen/'historical.json').read_text()))
    rel=str(manifest_path.relative_to(root))
    commit=git(root,'log','--diff-filter=A','--format=%H','-1','--',rel).decode().strip()
    if not commit or git(root,'show',commit+':'+rel)!=manifest_path.read_bytes(): raise ValueError('Manifest not in pre-inference commit')
    for name,expected in manifest['files'].items():
        if sha(git(root,'show',commit+':'+name))!=expected: raise ValueError('Source not committed before inference: '+name)
    if require_clean and git(root,'status','--porcelain').strip(): raise ValueError('Live requires clean frozen worktree')
    manifest['freeze_commit']=commit
    return manifest


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--blind-dir',type=Path,required=True); args=parser.parse_args()
    e=ROOT/REL; data=e/'data'; frozen=e/'frozen'
    if frozen.exists(): raise FileExistsError('Freeze is single-use')
    cases=json.loads((data/'test-inputs.json').read_text()); gold=json.loads((data/'test-gold.json').read_text()); dev=json.loads((data/'development.json').read_text()); spec=json.loads((data/'spec.json').read_text())
    check_split(cases,gold,dev)
    frozen.mkdir()
    historical={name:sha((ROOT/name).read_bytes()) for name in git(ROOT,'ls-tree','-r','--name-only',BASE).decode().splitlines()}
    for name,expected in historical.items():
        if sha(git(ROOT,'show',BASE+':'+name))!=expected: raise ValueError('Historical mismatch before freeze')
    dump(frozen/'historical.json',historical)
    blind_bundle(frozen/'blind-input',cases,spec,dev)
    blind_bundle(args.blind_dir,cases,spec,dev)
    requests=[]
    for case in cases:
        req=request(case,spec,dev); raw=wire(req)
        name=case['id']+'.request.json'; path=frozen/'requests'/name; path.parent.mkdir(exist_ok=True); path.write_bytes(raw)
        requests.append(dict(id=case['id'],path=str(path.relative_to(ROOT)),bytes=len(raw),sha256=sha(raw)))
        dump(frozen/'parser'/(case['id']+'.json'),parse(req))
    # Hash all new science/source/data and protocol; generated report/browser can be added later, not change these.
    paths=[p for p in e.rglob('*') if p.is_file()]+[ROOT/'experiments/ZL-019-protocol.md']
    paths += [p for p in (ROOT/'scripts').glob('*.py') if 'semantics' in p.name]
    files={str(p.relative_to(ROOT)):sha(p.read_bytes()) for p in paths}
    ceiling=sum((r['bytes']+8192)*0.042/1e6 for r in requests)
    if ceiling>0.05 or any(r['bytes']>32768 for r in requests): raise ValueError('Estimated budget/request cap')
    manifest=dict(base_commit=BASE,files=files,requests=requests,planned_requests=len(requests),scenario_groups=len({c['group'] for c in cases}),input_price_usd_per_million=0.042,estimated_ceiling_usd=ceiling,blind_bundle_sha256={p.name:sha(p.read_bytes()) for p in args.blind_dir.iterdir()})
    dump(frozen/'manifest.json',manifest)
    print(json.dumps(dict(requests=len(requests),groups=manifest['scenario_groups'],freeze_files=len(files),historical_files=len(historical),estimated_ceiling_usd=ceiling,blind_bundle=str(args.blind_dir)),indent=2))

if __name__=='__main__': main()
