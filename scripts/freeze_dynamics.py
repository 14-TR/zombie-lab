#!/usr/bin/env python3
"""Generate a single new ZL-018 freeze; no network or model calls."""
import hashlib
import json
from pathlib import Path
import subprocess
from datetime import datetime,timezone
import dynamics as d
import dynamics_reference as ref

ROOT=Path(__file__).resolve().parent.parent
E=ROOT/'evidence/jev-dynamics'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
compact=lambda v:json.dumps(v,sort_keys=True,separators=(',',':'),allow_nan=False).encode()

def bundle(config):
    width,height=config['board']['width'],config['board']['height']
    requests=[];truth=[];eval_groups=[];example_groups=[];checked=0
    for case in config['cases']:
        query=dict(case,width=width,height=height)
        # Stronger than dimensions alone: a coordinate tuple cannot be an old10x7 configuration.
        if all(0<=case['start'][a][0]<10 and 0<=case['start'][a][1]<7 for a in ['H','Z1','Z2']):
            raise ValueError('Historical exhaustive-domain configuration')
        for law in config['laws']:
            frames=d.rollout(case['start'],case['actions'],law,width,height)
            if frames!=ref.frames(case['start'],case['actions'],law,width,height):raise ValueError('Independent transition mismatch')
            checked+=len(case['actions'])
            eval_groups.extend(dict(width=width,height=height,start=s) for s in frames)
            observations=[]
            for o in config['examplePanels'][case['panel']]:
                after=d.transition(o['before'],o['action'],law,width,height)
                if after!=ref.step(o['before'],o['action'],law,width,height):raise ValueError('Example reference mismatch')
                observations.append(dict(o,after=after));checked+=1
                example_groups.extend(dict(width=width,height=height,start=s) for s in [o['before'],after])
            truth.append({'caseId':case['id'],'law':law,'panel':case['panel'],'frames':frames,
                          'horizons':{str(t):d.components(frames[t]) for t in [1,3]}})
            for condition in config['conditions']:
                request=d.request(query,condition,active_rule=d.RULES[law],observations=observations)
                baseline=d.baseline(request['state'])
                for hypothesis in baseline['hypotheses']:
                    if d.rollout(case['start'],case['actions'],hypothesis,width,height)!=ref.frames(case['start'],case['actions'],hypothesis,width,height):
                        raise ValueError('Baseline reference mismatch')
                    checked+=3
                requests.append({'id':'q%02d'%(len(requests)+1),'caseId':case['id'],'law':law,'condition':condition,
                                 'panel':case['panel'],'request':request,'baseline':baseline})
    d.assert_disjoint(eval_groups,example_groups)
    unique={d.group(dict(c,width=width,height=height)) for c in config['cases']}
    if len(unique)!=len(config['cases']):raise ValueError('Duplicate/swapped evaluation starts')
    return {'requests':requests,'truth':truth,
            'independentCheck':{'valid':True,'transitionComparisons':checked,'method':'independent coordinate-sign reference; same author, not blind external review'},
            'splitCheck':{'overlaps':0,'evaluationStartGroups':len(unique),
                          'evaluationTrajectoryGroups':len({d.group(q) for q in eval_groups}),
                          'exampleGroups':len({d.group(q) for q in example_groups}),
                          'historicalDomain':'All configurations in10x7 excluded by at least one coordinate outside support; swaps included',
                          'developmentBoards':config['developmentBoards']}}

def main():
    frozen=E/'frozen'
    if frozen.exists():raise ValueError('Freeze already exists; never overwrite')
    config=json.loads((E/'inputs.json').read_text());result=bundle(config)
    # Verify actual legacy production on all unchanged-law frames via independent JS engine.
    legacy_rows=[]
    for row in result['truth']:
        if row['law']!='old_NESW':continue
        case=next(c for c in config['cases'] if c['id']==row['caseId'])
        for i,action in enumerate(case['actions']):
            legacy_rows.append({'before':row['frames'][i],'action':action,'after':row['frames'][i+1],**config['board']})
    check=subprocess.run(['node',str(ROOT/'scripts/check-dynamics-legacy.cjs')],input=compact(legacy_rows),capture_output=True,check=True)
    result['independentCheck']['legacy']=json.loads(check.stdout)
    frozen.mkdir()
    (frozen/'requests').mkdir()
    metadata=[]
    for row in result['requests']:
        raw=compact(row['request']);file='evidence/jev-dynamics/frozen/requests/'+row['id']+'.json'
        if len(raw)>16384:raise ValueError('request16KiB budget')
        (ROOT/file).write_bytes(raw)
        metadata.append({k:v for k,v in row.items() if k!='request'}|{'file':file,'sha256':sha(raw),'bytes':len(raw)})
    def save(name,value):
        (frozen/name).write_text(json.dumps(value,indent=2,sort_keys=True,allow_nan=False)+'\n')
    save('truth.json',result['truth']);save('request-index.json',metadata)
    save('checks.json',{'independent':result['independentCheck'],'split':result['splitCheck']})
    base='1c68578d18908ad146a6e8f1b22c96d380aa1566'
    historical_files=subprocess.check_output(['git','ls-tree','-r','--name-only',base],cwd=ROOT,text=True).splitlines()
    history={p:sha((ROOT/p).read_bytes()) for p in historical_files}
    save('historical-preservation.json',history)
    sources=['experiments/ZL-018-protocol.md','evidence/jev-dynamics/inputs.json','two-zombies.js','scripts/run-jev.py']
    sources.extend(str(p.relative_to(ROOT)) for p in (ROOT/'scripts').glob('*dynamics*') if p.is_file())
    sources.extend(str(p.relative_to(ROOT)) for p in (E/'docs').glob('*') if p.is_file())
    sources.extend(str(p.relative_to(ROOT)) for p in frozen.rglob('*') if p.is_file())
    manifest={'campaign':'ZL-018','model':'jev-1.13.0','generatedAt':datetime.now(timezone.utc).isoformat(),
              'base':base,'sourceParent':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
              'requests':[{k:r[k] for k in ['id','file','sha256','bytes']} for r in metadata],
              'independentCheck':result['independentCheck'],'splitCheck':result['splitCheck'],
              'inputUSDPerMillion':.042,'outputFree':True,
              'conservativeEstimatedUSD':sum((r['bytes']+8192)*.042/1e6 for r in metadata),
              'hashes':{p:sha((ROOT/p).read_bytes()) for p in sorted(set(sources))}}
    if len(metadata)!=24 or manifest['conservativeEstimatedUSD']>.05:raise ValueError('paid budget')
    save('manifest.json',manifest)
    print(json.dumps({k:manifest[k] for k in ['conservativeEstimatedUSD','independentCheck','splitCheck']},indent=2))

if __name__=='__main__':main()
