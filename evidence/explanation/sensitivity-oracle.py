"""Read-only independent analysis of frozen ZL-006 exhaustive rows."""
import collections
import hashlib
import json
from pathlib import Path

ROOT = Path('/Users/tr/Projects/zombie-lab-explain')
SOURCE = ROOT / 'evidence/all-starts/sweep.json'
raw = SOURCE.read_bytes()
data = json.loads(raw)
w, h = data['config']['width'], data['config']['height']
n = w * h
rows = data['results']
lookup = {(r['zombieId'], r['humanId']): r for r in rows}
expected = {(z, u) for z in range(n) for u in range(n) if z != u}
assert len(rows) == len(lookup) == len(expected) == data['summary']['total']
assert set(lookup) == expected
assert all(r['id'] == f'z{z}-h{u}' and r['outcome'] == 'capture' and
           type(r['stopTick']) is int and r['stopTick'] >= 0 and
           r['cycleStart'] is None and r['period'] is None
           for (z, u), r in lookup.items())

def neighbors(u):
    x, y = u % w, u // w
    return sorted((ny * w + nx) for nx, ny in
                  [(x-1, y), (x+1, y), (x, y-1), (x, y+1)]
                  if 0 <= nx < w and 0 <= ny < h)

def edge(z, a, b):
    ta, tb = lookup[z, a]['stopTick'], lookup[z, b]['stopTick']
    return {'zombieId': z, 'humanAId': a, 'humanBId': b,
            'captureA': ta, 'captureB': tb,
            'signedDifferenceBMinusA': tb-ta, 'absoluteDifference': abs(tb-ta)}

result = []
edges = []
per_zombie = []
for z in range(n):
    local_edges = []
    for u in range(n):
        if u == z:
            continue
        rank = lookup[z, u]['stopTick']
        legal = [v for v in neighbors(u) if v != z]
        witness = min(legal, key=lambda v: (-abs(lookup[z, v]['stopTick']-rank), v)) if legal else None
        result.append({'id': f'z{z}-h{u}', 'zombieId': z, 'humanId': u,
                       'stopTick': rank,
                       'sensitivity': abs(lookup[z, witness]['stopTick']-rank) if witness is not None else None,
                       'witnessHumanId': witness,
                       'witnessStopTick': lookup[z, witness]['stopTick'] if witness is not None else None,
                       'signedDifferenceToWitness': lookup[z, witness]['stopTick']-rank if witness is not None else None,
                       'legalNeighborCount': len(legal)})
        local_edges.extend(edge(z, u, v) for v in legal if u < v)
    maximum = max(e['absoluteDifference'] for e in local_edges)
    per_zombie.append({'zombieId': z, 'undirectedEdges': len(local_edges),
                       'zeroDifferenceEdges': sum(e['absoluteDifference'] == 0 for e in local_edges),
                       'nonzeroDifferenceEdges': sum(e['absoluteDifference'] != 0 for e in local_edges),
                       'maximumAbsoluteDifference': maximum,
                       'maximumEdges': [e for e in local_edges if e['absoluteDifference'] == maximum],
                       'zeroDifferenceWitness': next((e for e in local_edges if e['absoluteDifference'] == 0), None)})
    edges.extend(local_edges)
maximum = max(e['absoluteDifference'] for e in edges)
summary = {'rows': len(result), 'zombies': n, 'humansPerZombie': n-1,
           'distinctInitialContactRows': sum(r['stopTick'] == 0 for r in rows),
           'maximumCaptureTick': max(r['stopTick'] for r in rows),
           'maximumCaptureTickRows': sum(r['stopTick'] == max(q['stopTick'] for q in rows) for r in rows),
           'undirectedEdges': len(edges), 'directedEdges': 2*len(edges),
           'zeroDifferenceEdges': sum(e['absoluteDifference'] == 0 for e in edges),
           'nonzeroDifferenceEdges': sum(e['absoluteDifference'] != 0 for e in edges),
           'maximumAbsoluteDifference': maximum,
           'maximumMagnitudeEdges': [e for e in edges if e['absoluteDifference'] == maximum],
           'absoluteEdgeDifferenceHistogram': dict(sorted(collections.Counter(e['absoluteDifference'] for e in edges).items())),
           'zeroSensitivityRows': sum(r['sensitivity'] == 0 for r in result),
           'nullSensitivityRows': sum(r['sensitivity'] is None for r in result),
           'maximumSensitivityRows': sum(r['sensitivity'] == maximum for r in result)}
output = {'schemaVersion': 1,
          'source': {'path': str(SOURCE), 'sha256': hashlib.sha256(raw).hexdigest(),
                     'simulationSha256': hashlib.sha256((ROOT/'simulation.js').read_bytes()).hexdigest()},
          'definition': {'width': w, 'height': h, 'cellId': 'y*width+x',
                         'domain': '4830 ordered distinct (zombieId,humanId) pairs; same-cell starts excluded',
                         'neighbor': 'One in-bounds cardinal human move with zombie fixed; exclude human neighbor equal to zombieId; include initially adjacent terminal starts',
                         'sensitivity': 'max(abs(T(z,hNeighbor)-T(z,human)))',
                         'witness': 'Lowest human neighbor ID among maximizers, including all-zero ties; null only if no legal neighbor',
                         'edgeCounting': 'Undirected per fixed zombie, humanAId<humanBId; each edge counted once'},
          'summary': summary, 'defaultComparison': edge(42, 1, 2),
          'defaultRows': [r for r in result if r['zombieId'] == 42 and r['humanId'] in (1,2)],
          'perZombie': per_zombie, 'results': result}
out = Path('/tmp/zl007-sensitivity-oracle.json')
out.write_text(json.dumps(output, indent=2)+'\n')
# Verify persisted output and independently enumerate edges from coordinate geometry.
saved = json.loads(out.read_text())
assert len(saved['results']) == len(expected)
assert len({r['id'] for r in saved['results']}) == len(expected)
expected_edges = sum(1 for z in range(n) for a in range(n) for b in range(a+1,n)
                     if a != z and b != z and abs(a%w-b%w)+abs(a//w-b//w) == 1)
assert len(edges) == expected_edges
assert sum(r['legalNeighborCount'] for r in result) == 2*expected_edges
for r in saved['results']:
    z, u = r['zombieId'], r['humanId']
    candidates = sorted((v for v in range(n) if v != z and
                        abs(u%w-v%w)+abs(u//w-v//w) == 1),
                        key=lambda v: (-abs(lookup[z,v]['stopTick']-lookup[z,u]['stopTick']), v))
    assert r['witnessHumanId'] == (candidates[0] if candidates else None)
    assert r['sensitivity'] == (abs(lookup[z,candidates[0]]['stopTick']-lookup[z,u]['stopTick']) if candidates else None)
compact = {k: v for k,v in summary.items() if k != 'absoluteEdgeDifferenceHistogram'}
print(json.dumps({'summary': compact, 'defaultComparison': output['defaultComparison'],
                  'defaultRows': output['defaultRows'], 'z42': per_zombie[42],
                  'firstZeroSensitivityWitness': next(r for r in result if r['sensitivity'] == 0),
                  'outputPath': str(out), 'outputBytes': out.stat().st_size,
                  'verification': 'complete coverage; all witnesses/maxima checked by separate coordinate enumeration; edge totals reconciled'}, indent=2))
