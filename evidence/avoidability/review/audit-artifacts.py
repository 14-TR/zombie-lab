#!/usr/bin/env python3
"""Read-only science audit. Rank proof is separate from commit acceptance."""
import collections
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import time

ROOT = Path('/Users/tr/Projects/zombie-lab-solver')
OUT = Path('/tmp/zl010-review')
ART = Path('/tmp/zl010-engine/outputs')
started = time.monotonic()
sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
spec = importlib.util.spec_from_file_location('checker', ROOT/'scripts/check-avoidability.py')
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)
cert_path = ART/'avoidability-certificate.json'
certificate = json.loads(cert_path.read_bytes())
data = json.loads((ART/'avoidability.json').read_bytes())
legacy = json.loads((ROOT/'evidence/two-zombies/two-zombies.json').read_bytes())
assert certificate['metadata'] == data['metadata']
checker.verify_sources(ROOT, certificate['metadata']['sourceHashes'])
try:
    checker.load_certificate(cert_path, ROOT)
except checker.VerificationError as error:
    identity_error = str(error)
    assert identity_error == 'commit must be a full lowercase 40-hex identifier'
else:
    identity_error = None
ranks = certificate['ranks']
audit = checker.scan_graph(ranks, max_seconds=90)
# Explicitly do not convert an API rank-proof pass into a CLI identity pass.
audit.update({'scope': 'rank-only mathematical proof on original unchanged engine artifact; not commit acceptance',
              'certificateIdentityAccepted': identity_error is None,
              'certificateIdentityError': identity_error,
              'inputCertificateSha256': sha(cert_path),
              'inputMetadata': certificate['metadata']})
assert audit['transitionSha256'] == json.loads((OUT/'production-parity.json').read_bytes())['transitionSha256']
assert audit['winningStates'] == 298396
assert audit['terminalStates'] == 42788
assert audit['losingStates'] - audit['terminalStates'] == 1816
assert audit['maximumFiniteRank'] == 9
assert audit['rankHistogram'] == {'-1':298396, '0':42788, '1':206, '2':264, '3':336, '4':408, '5':418, '6':86, '7':52, '8':36, '9':10}
(OUT/'rank-proof.json').write_text(json.dumps(audit,indent=2,sort_keys=True)+'\n')
physics = checker.Physics()
rows = data['results']
expected_ids = [f'z2-{z}-h{h}' for z in range(70) for h in range(70) if h!=42 and h!=z]
assert [r['id'] for r in rows] == expected_ids
assert len(rows) == len(set(expected_ids)) == len(legacy['results']) == 4761
point = lambda c: {'x':c%10,'y':c//10}
cell = lambda p: p['y']*10+p['x']
idx = lambda f: ((cell(f['zombie1'])*70+cell(f['zombie2']))*70+cell(f['human']))
classes = collections.Counter()
policy_counts = {}
for r, old in zip(rows, legacy['results']):
    index = (42*70+old['zombie2Id'])*70+old['humanId']
    assert r == {'id':old['id'],'human':point(old['humanId']),'zombie1':point(42),
                 'zombie2':point(old['zombie2Id']),'stateIndex':index,'avoidable':ranks[index]==-1,
                 'maxCaptureTicks':None if ranks[index]==-1 else ranks[index], 'policies':old['outcomes']}
    classes['avoidable' if ranks[index]==-1 else 'initialContact' if ranks[index]==0 else 'noninitialUnavoidable']+=1
assert classes == {'initialContact':502,'noninitialUnavoidable':42,'avoidable':4217}
assert max(r['maxCaptureTicks'] or 0 for r in rows) == 8
for p in ['greedy','depth1','depth2']:
    counts = collections.Counter(r['policies'][p]['outcome'] for r in rows)
    av = [r['id'] for r in rows if r['avoidable'] and r['policies'][p]['outcome']=='capture']
    finite = [r for r in rows if not r['avoidable'] and r['policies'][p]['outcome']=='capture']
    assert len(finite)==544
    shortfalls = [(r['id'],r['maxCaptureTicks']-r['policies'][p]['stopTick']) for r in finite]
    assert all(d>=0 for _,d in shortfalls)
    positive = [(i,d) for i,d in shortfalls if d]
    policy_counts[p] = {'outcomes':dict(counts),'avoidableCaptures':len(av),'finiteCapturedStarts':len(finite),'actionableFiniteCapturedStarts':sum(r['maxCaptureTicks']>0 for r in finite),'positiveShortfalls':positive,'sumShortfall':sum(d for _,d in shortfalls),'maxShortfall':max(d for _,d in shortfalls)}
    summary=data['summary']['policies'][p]
    assert summary['avoidableCaptures']==len(av)
    assert summary['captureDelayShortfall']['totalTicks']==sum(d for _,d in shortfalls)
    assert summary['captureDelayShortfall']['histogram']=={str(k):v for k,v in collections.Counter(d for _,d in shortfalls).items()}
assert [policy_counts[p]['avoidableCaptures'] for p in policy_counts]==[4217,24,24]
assert [(len(v['positiveShortfalls']),v['sumShortfall'],v['maxShortfall']) for v in policy_counts.values()]==[(10,21,4),(1,1,1),(1,2,2)]
assert policy_counts['depth1']['positiveShortfalls']==[('z2-10-h60',1)]
assert policy_counts['depth2']['positiveShortfalls']==[('z2-10-h60',2)]
byid = {r['id']:r for r in rows}
disagreements = data['summary']['depthDisagreements']['cases']
assert [d['id'] for d in disagreements] == [r['id'] for r in rows if r['policies']['depth1']['outcome']!=r['policies']['depth2']['outcome']]
assert len(disagreements)==30 and all(d['avoidable'] for d in disagreements)
cross = collections.Counter((d['depth1']['outcome'],d['depth2']['outcome']) for d in disagreements)
assert cross == {('capture','cycle'):15,('cycle','capture'):15}
semantics = collections.Counter()
report=(ROOT/'experiments/ZL-010-avoidability.md').read_text()
for d in disagreements:
    f=d['firstDivergence']; edges={a:(target,caught) for a,target,caught in physics.transitions(f['stateIndex'])}
    assert f['stateIndex']==idx(f)
    for p in ['depth1','depth2']:
        action=f[p]; target,caught=edges[action['actionIndex']]
        assert target==action['successorIndex'] and cell(action['human'])==target%70
        assert action['avoidable']==(ranks[target]==-1)
        assert action['maxCaptureTicks']==(None if ranks[target]==-1 else ranks[target])
    semantics['bothWinning' if all(f[p]['avoidable'] for p in ['depth1','depth2']) else 'winningVersusLosing']+=1
    coordinate=lambda p:f"({p['x']},{p['y']})"
    dest=lambda p:f[p]['action']+' → '+('winning' if f[p]['avoidable'] else f"rank {f[p]['maxCaptureTicks']}")
    line=f"| `{d['id']}` | {d['depth1']['outcome']} / {d['depth2']['outcome']} | {f['tick']} | {coordinate(f['human'])}; {coordinate(f['zombie1'])}; {coordinate(f['zombie2'])} | {dest('depth1')} | {dest('depth2')} |"
    assert line in report, line
assert semantics=={'bothWinning':15,'winningVersusLosing':15}
sets=[{r['id'] for r in rows if r['avoidable'] and r['policies'][p]['outcome']=='capture'} for p in ['depth1','depth2']]
assert len(sets[0]&sets[1])==9
selected=set(d['id'] for d in disagreements)
for predicate in [lambda r:r['avoidable'] and any(v['outcome']=='capture' for v in r['policies'].values()),lambda r:r['maxCaptureTicks'] is not None and r['maxCaptureTicks']>0 and any(v['outcome']=='capture' for v in r['policies'].values())]:
    first=next((r for r in rows if predicate(r)),None)
    if first: selected.add(first['id'])
assert [w['id'] for w in data['witnesses']]==[r['id'] for r in rows if r['id'] in selected]
frames=transitions=candidates=0
for w in data['witnesses']:
    row=byid[w['id']]; assert idx(w['frames'][0])==row['stateIndex']; seen={}
    assert len(w['frames'])==w['stopTick']+1
    for t,f in enumerate(w['frames']):
        s=idx(f); frames+=1; assert f['tick']==t
        if t==w['stopTick']:
            if w['outcome']=='capture':
                assert physics.terminal(s) and t==row['maxCaptureTicks'] and w['cycleStart'] is None and w['cyclePeriod'] is None
            else:
                assert w['outcome']=='cycle' and not physics.terminal(s) and row['avoidable']
                assert seen[s]==w['cycleStart'] and w['cyclePeriod']==t-seen[s]
            break
        assert not physics.terminal(s) and s not in seen
        seen[s]=t
        edges=list(physics.transitions(s)); candidates+=len(edges)
        best=next(e for e in edges if ranks[e[1]]==-1) if ranks[s]==-1 else max(edges,key=lambda e:ranks[e[1]])
        assert idx(w['frames'][t+1])==best[1]
        transitions+=1
assert (len(data['witnesses']),frames,transitions,candidates)==(32,734,702,3003)
frozen=json.loads(Path('/tmp/zl010-oracle/checker-frozen.json').read_bytes())
for file,digest in frozen['files'].items(): assert sha(ROOT/file)==digest
protocol=subprocess.check_output(['git','show','7cb59fe:experiments/ZL-010-protocol.md'],cwd=ROOT)
assert protocol==(ROOT/'experiments/ZL-010-protocol.md').read_bytes()
source_hashes={p:sha(ROOT/p) for p in ['scripts/build-avoidability.cjs','scripts/check-avoidability.py','scripts/test-avoidability.cjs','scripts/test-avoidability-checker.py','experiments/ZL-010-avoidability.md','experiments/ZL-010-protocol.md','two-zombies.js']}
receipt={'status':'PASS','rankProofVerified':True,'rankSha256':audit['rankSha256'],'rankProofReceipt':str(OUT/'rank-proof.json'),'certificateIdentityError':identity_error,'allLegacyRowsMatchHistoricalEvidence':4761,'partition':dict(classes),'policies':policy_counts,'disagreements':{'total':30,**semantics,'commonAvoidableCaptures':len(sets[0]&sets[1]),'reportRowsExactlyMatched':30},'witnesses':{'total':32,'frames':frames,'transitions':transitions,'independentCandidates':candidates},'sourceHashes':source_hashes,'inputDataSha256':sha(ART/'avoidability.json'),'inputCertificateSha256':sha(cert_path),'scriptSha256':sha(__file__),'elapsedSeconds':time.monotonic()-started}
(OUT/'science-audit.json').write_text(json.dumps(receipt,indent=2,sort_keys=True)+'\n')
print(json.dumps(receipt,indent=2,sort_keys=True))
