#!/usr/bin/env python3
"""Independent ZL-009 oracle. Reads only protocol and legacy controls."""
import unittest


def distance(a, b):
    return abs(a % 10 - b % 10) + abs(a // 10 - b // 10)


def contact(state):
    return min(distance(state[0], z) for z in state[1:]) <= 1


def resolve(state, human, zombies, tick=0, cap=10000):
    if contact(state):
        return state, tick, 'caught'
    if tick >= cap:
        return state, tick, 'limit'
    nxt = (human, *zombies)
    if len(nxt) != 3 or any(type(p) is not int or not 0 <= p < 70 or distance(p, old) > 1 for p, old in zip(nxt, state)):
        raise ValueError('illegal simultaneous moves')
    crossing = any(human == oldz and newz == state[0] for oldz, newz in zip(state[1:], zombies))
    caught = contact(nxt) or crossing
    return nxt, tick + 1, 'caught' if caught else ('limit' if tick + 1 >= cap else 'running')


from functools import lru_cache


def legal(pos):
    x, y = pos % 10, pos // 10
    return tuple(nx + 10 * ny for dx, dy in ((0, -1), (1, 0), (0, 1), (-1, 0), (0, 0))
                 if 0 <= (nx := x + dx) < 10 and 0 <= (ny := y + dy) < 7)


MOVES = tuple(legal(pos) for pos in range(70))
DIST = tuple(tuple(distance(a, b) for b in range(70)) for a in range(70))
CHASE = tuple(tuple(min(MOVES[z], key=lambda nxt: DIST[nxt][h]) for h in range(70)) for z in range(70))


def pursuers(state):
    h, z1, z2 = state
    return CHASE[z1][h], CHASE[z2][h]


@lru_cache(maxsize=None)
def plan(state, policy):
    h, z1, z2 = state
    if policy == 'greedy':
        move = max(MOVES[h], key=lambda candidate: min(DIST[candidate][z1], DIST[candidate][z2]))
        return move, (min(DIST[move][z1], DIST[move][z2]),), (move,)
    if policy not in ('depth1', 'depth2'):
        raise ValueError(policy)
    horizon = int(policy[-1])
    # Iterative depth-first leaf traversal: reverse pushes preserve N/E/S/W/stay.
    stack = [(state, 0, (), False)]
    best = None
    while stack:
        current, survived, path, caught = stack.pop()
        if caught or len(path) == horizon:
            h, z1, z2 = current
            score = (survived, min(DIST[h][z1], DIST[h][z2]))
            if best is None or score > best[1]:
                best = (path[0], score, path)
            continue
        zombies = pursuers(current)
        for candidate in reversed(MOVES[current[0]]):
            nxt, _, status = resolve(current, candidate, zombies)
            stack.append((nxt, survived + (status != 'caught'), path + (candidate,), status == 'caught'))
    return best


def classify(state, policy='greedy', cap=10000, transition=None, keep_frames=False, cached=True):
    seen = {}
    frames = [] if keep_frames else None
    tick = 0
    decision = plan if cached else plan.__wrapped__
    while True:
        if frames is not None:
            frames.append(state)
        if contact(state):
            result = {'outcome': 'capture', 'stopTick': tick, 'cycleStart': None, 'period': None}
            break
        if state in seen:
            result = {'outcome': 'cycle', 'stopTick': tick, 'cycleStart': seen[state], 'period': tick - seen[state]}
            break
        if tick >= cap:
            result = {'outcome': 'unresolved', 'stopTick': tick, 'cycleStart': None, 'period': None}
            break
        seen[state] = tick
        if transition is None:
            state, _, _ = resolve(state, decision(state, policy)[0], pursuers(state), tick=tick, cap=cap)
        else:
            # Explicit test seam; synthetic transitions do not assert legal physics.
            state = transition(state)
        tick += 1
    return result, frames


def reference_leaves(state, depth):
    # Deliberately distinct recursive coordinate implementation: no tables,
    # resolve(), pursuers(), plan(), or memoization from the tested oracle.
    points = tuple((p % 10, p // 10) for p in state)
    leaves = []
    def metric(a, b):
        return abs(a[0] - b[0]) + abs(a[1] - b[1])
    def actions(p):
        x, y = p
        for q in ((x, y - 1), (x + 1, y), (x, y + 1), (x - 1, y), (x, y)):
            if 0 <= q[0] < 10 and 0 <= q[1] < 7:
                yield q
    def visit(current, remaining, completed, path):
        h, a, b = current
        sep = min(metric(h, a), metric(h, b))
        if sep <= 1 or remaining == 0:
            leaves.append(((completed, sep), path))
            return
        za = min(actions(a), key=lambda move: metric(move, h))
        zb = min(actions(b), key=lambda move: metric(move, h))
        for move in actions(h):
            captured = min(metric(move, za), metric(move, zb)) <= 1 or (move == a and za == h) or (move == b and zb == h)
            visit((move, za, zb), remaining - 1, completed + (not captured), path + (move[0] + 10 * move[1],))
    visit(points, depth, 0, ())
    return leaves


@lru_cache(maxsize=1)
def old_controls():
    import json, subprocess
    script = r'''
    const fs = require('node:fs'), vm = require('node:vm');
    const context = vm.createContext({});
    for (const name of ['simulation.js', 'planner.js']) {
      vm.runInContext(fs.readFileSync('/Users/tr/Projects/zombie-lab-two-zombies/' + name, 'utf8'), context);
    }
    vm.runInContext(`
      const controls = [];
      for (let h = 0; h < 70; h++) {
        if (h === 42) continue;
        for (const policy of ['greedy', 'depth2']) {
          let s = {...ZombieLab.initialState(), human:{x:h%10,y:Math.floor(h/10)},tickLimit:10000};
          const frames=[],choices=[],seen=new Map();
          let result;
          while (true) {
            const hi=s.human.x+10*s.human.y, zi=s.zombie.x+10*s.zombie.y;
            frames.push([hi,zi,zi]);
            const key=hi+','+zi;
            const adjacent=Math.abs(s.human.x-s.zombie.x)+Math.abs(s.human.y-s.zombie.y)<=1;
            if (s.status==='caught'||adjacent) {
              result={outcome:'capture',stopTick:s.tick,cycleStart:null,period:null}; break;
            }
            if (seen.has(key)) {
              result={outcome:'cycle',stopTick:s.tick,cycleStart:seen.get(key),period:s.tick-seen.get(key)}; break;
            }
            if (s.tick>=s.tickLimit) {
              result={outcome:'unresolved',stopTick:s.tick,cycleStart:null,period:null}; break;
            }
            seen.set(key,s.tick);
            s=policy==='greedy'?ZombieLab.step(s):ZombiePlanner.step(s);
            choices.push(s.human.x+10*s.human.y);
          }
          controls.push({humanId:h,policy,result,frames,choices});
        }
      }
      globalThis.controls=controls;
    `, context, {timeout: 60000});
    process.stdout.write(JSON.stringify(context.controls));
    '''
    run = subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True, timeout=70)
    return json.loads(run.stdout)


POLICIES = ('greedy', 'depth1', 'depth2')
BASE_COMMIT = '0b6756dcc20255ce627a37dbc0be15f71980bc1f'


@lru_cache(maxsize=1)
def build():
    results, decisions = [], []
    summary = {'total': 4761, 'initialCapture': 0, 'policies': {p: {'capture': 0, 'cycle': 0, 'unresolved': 0} for p in POLICIES}}
    for z in range(70):
        for h in range(70):
            if h == 42 or h == z:
                continue
            state = (h, 42, z)
            row = {'id': f'z2-{z}-h{h}', 'humanId': h, 'zombie2Id': z, 'outcomes': {}}
            terminal = contact(state)
            summary['initialCapture'] += terminal
            for policy in POLICIES:
                if not terminal:
                    move = plan(state, policy)[0]
                    decisions.append({'id': row['id'], 'policy': policy, 'human': {'x': move % 10, 'y': move // 10}})
                outcome, _ = classify(state, policy)
                row['outcomes'][policy] = outcome
                summary['policies'][policy][outcome['outcome']] += 1
            results.append(row)
    return {'schemaVersion': 1, 'metadata': {'commit': BASE_COMMIT},
            'config': {'width': 10, 'height': 7, 'zombie1Id': 42, 'safetyTickLimit': 10000,
                       'policies': list(POLICIES), 'scope': 'fixed-zombie1-slice'},
            'summary': summary, 'results': results, 'decisions': decisions}


_VALIDATION = None


def validate(data):
    global _VALIDATION
    if _VALIDATION is not None:
        return _VALIDATION
    import hashlib, subprocess, time
    from pathlib import Path
    start = time.perf_counter()
    decision_rows = {(r['id'], r['policy']): r['human']['x'] + 10*r['human']['y'] for r in data['decisions']}
    unique = set()
    replay_count = initial_count = frame_count = 0
    partial_key_witness = None
    for row in data['results']:
        initial = (row['humanId'],42,row['zombie2Id'])
        for policy in POLICIES:
            outcome, frames = classify(initial, policy, cached=False, keep_frames=True)
            assert outcome == row['outcomes'][policy], (row['id'],policy,outcome,row['outcomes'][policy])
            replay_count += 1
            frame_count += len(frames)
            assert len(frames) == outcome['stopTick'] + 1
            assert len(set(frames[:-1])) == len(frames[:-1])
            assert not any(contact(frame) for frame in frames[:-1])
            if outcome['outcome'] == 'cycle':
                assert frames[-1] == frames[outcome['cycleStart']]
                assert outcome['period'] == outcome['stopTick'] - outcome['cycleStart']
            elif outcome['outcome'] == 'capture':
                assert contact(frames[-1])
            else:
                assert len(set(frames)) == len(frames) and not contact(frames[-1])
            if not contact(initial):
                assert decision_rows[row['id'],policy] == frames[1][0]
                initial_count += 1
            unique.update((frame,policy) for frame in frames[:-1])
            if partial_key_witness is None:
                partial = {}
                for tick, frame in enumerate(frames):
                    key = frame[:2]
                    if key in partial and frames[partial[key]] != frame:
                        partial_key_witness = {'id':row['id'],'policy':policy,'firstTick':partial[key],'secondTick':tick,
                                               'firstState':frames[partial[key]],'secondState':frame,
                                               'explanation':'Human and Z1 repeat here but Z2 differs; this is not the full-state cycle certificate.'}
                        break
                    partial.setdefault(key,tick)
    counts = {p:0 for p in POLICIES}
    leaf_count = 0
    replanning_witness = None
    for state, policy in sorted(unique):
        actual = plan(state,policy)
        if policy == 'greedy':
            x,y = state[0]%10,state[0]//10
            candidates = [px+10*py for px,py in ((x,y-1),(x+1,y),(x,y+1),(x-1,y),(x,y)) if 0<=px<10 and 0<=py<7]
            metric = lambda p: min(abs(p%10-z%10)+abs(p//10-z//10) for z in state[1:])
            expected_move = max(candidates,key=metric)
            expected = (expected_move,(metric(expected_move),),(expected_move,))
        else:
            leaves = reference_leaves(state,int(policy[-1]))
            leaf_count += len(leaves)
            score,path = max(leaves,key=lambda leaf:leaf[0])
            expected = (path[0],score,path)
            if policy == 'depth2' and len(path)==2 and replanning_witness is None:
                nxt,_,status = resolve(state,path[0],pursuers(state))
                if status != 'caught' and plan(nxt,policy)[0] != path[1]:
                    replanning_witness = {'state':state,'chosenPath':path,'nextState':nxt,'replannedMove':plan(nxt,policy)[0]}
        assert actual == expected, (state,policy,actual,expected)
        counts[policy] += 1
    controls = old_controls()
    baseline_counts = {p:{'capture':0,'cycle':0,'unresolved':0} for p in ('greedy','depth2')}
    legacy_frames = legacy_decisions = 0
    for row in controls:
        outcome,frames = classify((row['humanId'],42,42),row['policy'],cached=False,keep_frames=True)
        assert outcome == row['result']
        assert [list(frame) for frame in frames] == row['frames']
        choices = [plan.__wrapped__(frame,row['policy'])[0] for frame in frames[:-1]]
        assert choices == row['choices']
        baseline_counts[row['policy']][outcome['outcome']] += 1
        legacy_frames += len(frames)
        legacy_decisions += len(choices)
    root = Path('/Users/tr/Projects/zombie-lab-two-zombies')
    hashes, frozen_matches = {}, {}
    for name in ('simulation.js','planner.js','experiments/ZL-009-protocol.md'):
        source = (root/name).read_bytes()
        hashes[name] = hashlib.sha256(source).hexdigest()
        if name != 'experiments/ZL-009-protocol.md':
            original = subprocess.run(['git','-C',str(root),'show',BASE_COMMIT+':'+name],capture_output=True,check=True,timeout=10).stdout
            frozen_matches[name] = source == original
            assert frozen_matches[name], 'Legacy source changed from protocol base: '+name
    _VALIDATION = {'mismatches':0,'uncachedReplays':replay_count,'uncachedFramesCompared':frame_count,
                   'initialDecisionsCompared':initial_count,'referencePolicyStateChecks':len(unique),
                   'referenceChecksByPolicy':counts,'recursiveLeafScoresEnumerated':leaf_count,
                   'referenceComparison':'Full winning lexicographic score and first-tied full path, not only executed move.',
                   'legacy':{'conditionsPerPolicy':69,'outcomesCompared':len(controls),'completeFramesCompared':legacy_frames,
                             'decisionsCompared':legacy_decisions,'policies':baseline_counts,
                             'allSourceFilesMatchFrozenBase':all(frozen_matches.values()),'sourceMatches':frozen_matches},
                   'sourceSha256':hashes,'partialCycleKeyWitness':partial_key_witness,'replanningWitness':replanning_witness,
                   'validationSeconds':time.perf_counter()-start}
    return _VALIDATION


def make_report(data):
    from itertools import combinations
    labels = ('capture','cycle','unresolved')
    decisions = {(d['id'],d['policy']):(d['human']['x'],d['human']['y']) for d in data['decisions']}
    paired = {}
    for a,b in combinations(POLICIES,2):
        matrix = {x:{y:0 for y in labels} for x in labels}
        timing = {'secondEarlier':0,'secondLater':0,'equal':0}
        differing_choices = 0
        for row in data['results']:
            oa,ob = row['outcomes'][a],row['outcomes'][b]
            matrix[oa['outcome']][ob['outcome']] += 1
            if oa['outcome']==ob['outcome']=='capture':
                key = 'secondEarlier' if ob['stopTick']<oa['stopTick'] else ('secondLater' if ob['stopTick']>oa['stopTick'] else 'equal')
                timing[key] += 1
            if (row['id'],a) in decisions:
                differing_choices += decisions[row['id'],a] != decisions[row['id'],b]
        paired[a+'_vs_'+b] = {'firstPolicy':a,'secondPolicy':b,'outcomeMatrix':matrix,
                              'bothCapturedTime':timing,'nonterminalInitialChoiceDisagreements':differing_choices}
    def point(p):
        return {'x':p%10,'y':p//10}
    def frame_json(tick,frame):
        return {'tick':tick,'human':point(frame[0]),'zombies':[point(p) for p in frame[1:]]}
    cycles = {}
    for policy in POLICIES:
        row = next((r for r in data['results'] if r['outcomes'][policy]['outcome']=='cycle'),None)
        if row is None:
            cycles[policy] = None
            continue
        outcome,frames=classify((row['humanId'],42,row['zombie2Id']),policy,keep_frames=True,cached=False)
        assert outcome==row['outcomes'][policy] and frames[-1]==frames[outcome['cycleStart']]
        cycles[policy] = {'id':row['id'],'selection':'First cycle in frozen Z2/human row order, not representative.',
                          'result':outcome,'frames':[frame_json(i,f) for i,f in enumerate(frames)]}
    min_vs_sum = None
    horizon_witness = None
    for row in data['results']:
        state=(row['humanId'],42,row['zombie2Id'])
        if contact(state):continue
        if horizon_witness is None and plan(state,'depth1')[0] != plan(state,'depth2')[0]:
            horizon_witness={'id':row['id'],'state':state,'depth1':plan(state,'depth1'),'depth2':plan(state,'depth2')}
        alternate = max(MOVES[state[0]],key=lambda h:sum(DIST[h][z] for z in state[1:]))
        if min_vs_sum is None and alternate != plan(state,'greedy')[0]:
            min_vs_sum={'id':row['id'],'state':state,'minDistanceChoice':plan(state,'greedy')[0],'incorrectSumDistanceChoice':alternate}
    survival_state=(50,42,30)
    survival_leaves=reference_leaves(survival_state,2)
    tie_state=(0,69,69)
    tie_leaves=reference_leaves(tie_state,2)
    best_tie_score=max(leaf[0] for leaf in tie_leaves)
    cutoff_state=(2,42,0)
    cycle_cap=classify(cutoff_state,'depth1',cap=22)[0]
    before_cycle=classify(cutoff_state,'depth1',cap=21)[0]
    captured=classify(cutoff_state,'greedy')[0]
    capture_cap=classify(cutoff_state,'greedy',cap=captured['stopTick'])[0]
    before_capture=classify(cutoff_state,'greedy',cap=captured['stopTick']-1)[0]
    assert capture_cap==captured and before_capture['outcome']=='unresolved'
    stats={}
    for p in POLICIES:
        ticks=[r['outcomes'][p]['stopTick'] for r in data['results'] if r['outcomes'][p]['outcome']=='capture']
        noninitial=[tick for tick in ticks if tick>0]
        periods=sorted({r['outcomes'][p]['period'] for r in data['results'] if r['outcomes'][p]['outcome']=='cycle'})
        stats[p]={'captureTickMin':min(ticks),'captureTickMax':max(ticks),
                  'noninitialCaptureTickMin':min(noninitial),'noninitialCaptureTickMax':max(noninitial),'observedCyclePeriods':periods}
    return {'initiallyNonterminal':data['summary']['total']-data['summary']['initialCapture'],
            'pairedComparisons':paired,'policyStatistics':stats,'cycleWitnesses':cycles,
            'horizonWitness':horizon_witness,'greedyMinNotSumWitness':min_vs_sum,
            'survivalPriorityWitness':{'id':'z2-30-h50','state':survival_state,'winner':plan(survival_state,'depth2'),
                                       'incorrectDistanceOnlyWinner':max(survival_leaves,key=lambda leaf:leaf[0][1]),
                                       'allLeaves':survival_leaves},
            'tieOrderWitness':{'state':tie_state,'chosen':plan(tie_state,'depth2'),
                               'equallyScoringPathsInTraversalOrder':[path for score,path in tie_leaves if score==best_tie_score]},
            'clockWitness':{'state':tie_state,'depth1':plan(tie_state,'depth1'),'depth2':plan(tie_state,'depth2'),
                             'realTick9999Depth2Resolution':resolve(tie_state,plan(tie_state,'depth2')[0],pursuers(tie_state),tick=9999)},
            'simultaneousWitness':{'state':(34,32,36),'bothZombieOldHumanChoices':pursuers((34,32,36)),
                                   'humanNorthCandidate':24,'incorrectCandidateHumanChase':pursuers((24,32,36))},
            'cutoffWitness':{'id':'z2-0-h2','cycleExactlyAtCap':cycle_cap,'beforeCycleCap':before_cycle,
                              'captureExactlyAtCap':capture_cap,'beforeCaptureCap':before_capture},
            'syntheticCycleKeyWitness':{'label':'Synthetic runner transitions, not a production-policy trajectory.',
                                        'frames':[(0,42,69),(0,42,68),(0,42,69)],
                                        'orderedIdentityFrames':[(0,42,69),(0,69,42),(0,42,69)],
                                        'expected':{'outcome':'cycle','stopTick':2,'cycleStart':0,'period':2}},
            'limitations':[
                'This is only the fixed Z1=42 slice: 4761 permitted ordered Z2/human starts, not all three-agent starts.',
                'Greedy versus either model policy changes prediction and scoring together; depth1 versus depth2 changes only the planning depth.',
                'These are deterministic named-policy outcomes, not an optimal-policy or unavoidable-capture proof and not a result about human intelligence.',
                'Initial-contact rows stop before any policy acts and are separated from the nonterminal decision population.',
                'No production sweep run reached the safety cutoff. Cutoff priority was exercised with bounded reruns and labeled synthetic runner fixtures.',
                'Legacy exact reduction covers all 69 permitted humans with co-located zombies at 42; no claim is made for an exhaustive legacy sweep over other zombie starts.',
                'No new two-zombie engine or result artifact was read. Parent must compare the frozen rows and every exported initial choice to that independent implementation.',
                'Only selected cycle witness histories are retained; bulk results are scalar. Position tuples in validation are [humanId,zombie1Id,zombie2Id].'],
            'issuesEncountered':[
                'A hand-written depth2 corner test initially expected stay/stay. Legacy planner execution and the full leaf tie order established east/west is the first equal-scoring path; the fixture was corrected before validation.'],
            'reproduce':'python3 -B /tmp/zl009-oracle.py --run'}


class OracleTests(unittest.TestCase):
    def test_report_reconciles_and_certifies_witnesses(self):
        report = make_report(build())
        for pair in report['pairedComparisons'].values():
            self.assertEqual(sum(sum(row.values()) for row in pair['outcomeMatrix'].values()), 4761)
            self.assertEqual(sum(pair['bothCapturedTime'].values()), pair['outcomeMatrix']['capture']['capture'])
        self.assertIsNone(report['cycleWitnesses']['greedy'])
        for p in ('depth1','depth2'):
            witness=report['cycleWitnesses'][p]
            self.assertEqual(witness['id'],'z2-0-h2')
            self.assertEqual(witness['result'], {'outcome':'cycle','stopTick':22,'cycleStart':20,'period':2})
            self.assertEqual(witness['frames'][20]['human'],witness['frames'][22]['human'])
            self.assertEqual(witness['frames'][20]['zombies'],witness['frames'][22]['zombies'])
        self.assertEqual(report['cutoffWitness']['cycleExactlyAtCap']['outcome'],'cycle')
        self.assertEqual(report['cutoffWitness']['beforeCycleCap']['outcome'],'unresolved')

    def test_full_validation_receipt(self):
        receipt = validate(build())
        self.assertEqual(receipt['uncachedReplays'], 14283)
        self.assertEqual(receipt['initialDecisionsCompared'], 12777)
        self.assertGreaterEqual(receipt['referencePolicyStateChecks'], 12777)
        self.assertEqual(receipt['mismatches'], 0)
        self.assertEqual(receipt['legacy']['outcomesCompared'], 138)
        self.assertTrue(receipt['legacy']['allSourceFilesMatchFrozenBase'])

    def test_survival_priority_concrete_witness(self):
        state = (50,42,30)
        self.assertEqual(plan(state,'depth2'), (60,(1,1),(60,61)))
        leaves = reference_leaves(state,2)
        self.assertEqual(max(leaves,key=lambda leaf:leaf[0][1]), ((0,1),(51,)))

    def test_full_frozen_sweep_contract(self):
        data = build()
        expected = [(z, h) for z in range(70) for h in range(70) if h != 42 and h != z]
        self.assertEqual(len(expected), 4761)
        self.assertEqual([(r['zombie2Id'], r['humanId']) for r in data['results']], expected)
        self.assertEqual(data['schemaVersion'], 1)
        self.assertEqual(data['summary']['total'], 4761)
        self.assertEqual(data['summary']['initialCapture'], sum(contact((h,42,z)) for z,h in expected))
        want = [(f'z2-{z}-h{h}',p) for z,h in expected if not contact((h,42,z)) for p in POLICIES]
        self.assertEqual([(r['id'],r['policy']) for r in data['decisions']], want)
        self.assertEqual(len(set(want)), len(want))
        for p in POLICIES:
            self.assertEqual(sum(data['summary']['policies'][p].values()), 4761)
            for row in data['results']:
                self.assertEqual(set(row['outcomes'][p]), {'outcome','stopTick','cycleStart','period'})

    def test_simultaneous_old_positions_and_clock(self):
        self.assertEqual(pursuers((34,32,36)), (33,35))
        state = (0,69,69)
        full = plan(state,'depth2')[0]
        self.assertNotEqual(full, plan(state,'depth1')[0])
        self.assertEqual(resolve(state, full, pursuers(state), tick=9999), ((1,59,59),10000,'limit'))
        self.assertEqual(plan(state,'depth2')[1][0], 2)

    def test_independent_leaf_enumerator(self):
        leaves = reference_leaves((34, 32, 36), 2)
        self.assertEqual(max(leaves, key=lambda leaf: leaf[0]), ((2, 2), (24, 14)))
        leaves = reference_leaves((0, 69, 69), 2)
        self.assertEqual(max(leaves, key=lambda leaf: leaf[0]), ((2, 13), (1, 0)))

    def test_old_controls_colocated_exact(self):
        controls = old_controls()
        self.assertEqual(len(controls), 138)
        for row in controls:
            outcome, frames = classify((row['humanId'], 42, 42), row['policy'], keep_frames=True, cached=False)
            self.assertEqual(outcome, row['result'], row)
            self.assertEqual([list(frame) for frame in frames], row['frames'], row)
            self.assertEqual([plan.__wrapped__(frame, row['policy'])[0] for frame in frames[:-1]], row['choices'], row)

    def test_runner_ordered_key_and_cutoff_precedence(self):
        a, b = (0, 42, 69), (0, 42, 68)
        toggle = lambda state: b if state == a else a
        expected = {'outcome': 'cycle', 'stopTick': 2, 'cycleStart': 0, 'period': 2}
        self.assertEqual(classify(a, cap=2, transition=toggle)[0], expected)
        self.assertEqual(classify(a, cap=1, transition=toggle)[0], {'outcome': 'unresolved', 'stopTick': 1, 'cycleStart': None, 'period': None})
        c = (0, 69, 42)
        self.assertEqual(classify(a, cap=2, transition=lambda state: c if state == a else a)[0], expected)
        self.assertEqual(classify(a, cap=1, transition=lambda _: (0, 1, 69))[0], {'outcome': 'capture', 'stopTick': 1, 'cycleStart': None, 'period': None})
        self.assertEqual(classify((0, 1, 69), cap=0)[0]['outcome'], 'capture')
        self.assertEqual(classify(a, cap=0)[0]['outcome'], 'unresolved')
        self.assertEqual(classify(a, cap=2, transition=toggle, keep_frames=True)[1], [a, b, a])

    def test_policy_prediction_ties_and_horizon(self):
        self.assertEqual(plan((34, 32, 36), 'greedy'), (24, (3,), (24,)))
        self.assertEqual(plan((34, 32, 36), 'depth1'), (24, (1, 2), (24,)))
        self.assertEqual(plan((34, 32, 36), 'depth2'), (24, (2, 2), (24, 14)))
        self.assertEqual(plan((0, 69, 69), 'greedy'), (0, (15,), (0,)))
        self.assertEqual(plan((0, 69, 69), 'depth1'), (0, (1, 14), (0,)))
        self.assertEqual(plan((0, 69, 69), 'depth2'), (1, (2, 13), (1, 0)))

    def test_simultaneous_contact_diagonal_and_swap(self):
        # Integer positions are x + 10*y. Old contact preempts movement.
        self.assertEqual(resolve((22, 23, 68), 23, (22, 58)), ((22, 23, 68), 0, 'caught'))
        self.assertEqual(resolve((22, 22, 68), 12, (21, 58)), ((22, 22, 68), 0, 'caught'))
        # Diagonal contact is not initial contact, but can become shared.
        self.assertEqual(resolve((22, 33, 68), 23, (23, 58)), ((23, 23, 58), 1, 'caught'))
        self.assertEqual(resolve((22, 33, 68), 12, (23, 58)), ((12, 23, 58), 1, 'running'))
        # Contact with second zombie independently captures.
        self.assertEqual(resolve((22, 68, 24), 23, (58, 24)), ((23, 58, 24), 1, 'caught'))
        # Capture beats the cap; a noncapture at cap becomes limit.
        self.assertEqual(resolve((22, 33, 68), 23, (23, 58), cap=1)[2], 'caught')
        self.assertEqual(resolve((22, 33, 68), 12, (23, 58), cap=1)[2], 'limit')
        self.assertEqual(resolve((22, 23, 68), 23, (22, 58), tick=5, cap=5)[2], 'caught')
        self.assertEqual(resolve((22, 33, 68), 12, (23, 58), tick=5, cap=5), ((22, 33, 68), 5, 'limit'))


def run_oracle():
    import datetime, hashlib, json, resource, sys, time
    from pathlib import Path
    started=time.perf_counter()
    data=build()
    sweep_seconds=time.perf_counter()-started
    suite=unittest.defaultTestLoader.loadTestsFromTestCase(OracleTests)
    names=[case.id().split('.')[-1] for case in suite]
    checked=unittest.TextTestRunner(verbosity=1).run(suite)
    if not checked.wasSuccessful():
        raise SystemExit('Oracle validation failed; no output artifact written.')
    data['validation']=dict(validate(data))
    data['validation'].update({'unitTestsPassed':checked.testsRun,'unitTestNames':names,
                               'oracleSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                               'independence':'Read protocol plus legacy simulation.js/planner.js only; legacy files also compared to frozen-base git blobs.'})
    data['report']=make_report(data)
    usage=resource.getrusage(resource.RUSAGE_SELF)
    children=resource.getrusage(resource.RUSAGE_CHILDREN)
    scale=1 if sys.platform=='darwin' else 1024
    data['resources']={'sweepSeconds':sweep_seconds,'totalExecutionSecondsBeforeSerialization':time.perf_counter()-started,
                       'parentCpuSeconds':usage.ru_utime+usage.ru_stime,'childCpuSeconds':children.ru_utime+children.ru_stime,
                       'parentPeakRssBytes':int(usage.ru_maxrss*scale),'childPeakRssBytes':int(children.ru_maxrss*scale),
                       'pythonVersion':sys.version.split()[0],'nodeVersion':__import__('subprocess').check_output(['node','--version'],text=True).strip(),
                       'generatedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                       'oracleScriptBytes':Path(__file__).stat().st_size,'jsonBytes':0,
                       'decisionCache':plan.cache_info()._asdict(),'wallWatchdogSeconds':180}
    while True:
        encoded=(json.dumps(data,separators=(',',':'),ensure_ascii=True)+'\n').encode()
        if len(encoded)==data['resources']['jsonBytes']:
            break
        data['resources']['jsonBytes']=len(encoded)
    output=Path('/tmp/zl009-oracle.json')
    output.write_bytes(encoded)
    assert output.stat().st_size==data['resources']['jsonBytes']
    print(json.dumps({'output':str(output),'summary':data['summary'],'initialDecisionRows':len(data['decisions']),
                      'validation':{key:data['validation'][key] for key in ('unitTestsPassed','uncachedReplays','uncachedFramesCompared','initialDecisionsCompared','referencePolicyStateChecks','recursiveLeafScoresEnumerated','mismatches','legacy')},
                      'pairedComparisons':data['report']['pairedComparisons'],'resources':data['resources'],
                      'sha256':hashlib.sha256(encoded).hexdigest()},indent=2))


if __name__ == '__main__':
    import signal, sys
    signal.alarm(180)
    if sys.argv[1:]==['--run']:
        run_oracle()
    else:
        unittest.main()
