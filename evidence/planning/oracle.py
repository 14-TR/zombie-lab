#!/usr/bin/env python3
"""Independent ZL-008 oracle; reads only the three permitted input files.

No imports from planner or engine. Python standard library only.
"""
from dataclasses import dataclass, replace, asdict
from functools import lru_cache
from collections import Counter
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import sys
import time
import unittest

ROOT = Path('/Users/tr/Projects/zombie-lab-planning')
INPUTS = [ROOT / 'experiments/ZL-008-protocol.md', ROOT / 'simulation.js',
          ROOT / 'evidence/all-starts/sweep.json']
OUT = Path('/tmp/zl008-oracle.json')
DIRECTIONS = ((0, -1), (1, 0), (0, 1), (-1, 0), (0, 0))

@dataclass(frozen=True)
class State:
    zombie: tuple
    human: tuple
    width: int = 10
    height: int = 7
    tick: int = 0
    tickLimit: int = 10000
    status: str = 'running'
    reason: str = ''


def distance(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


@lru_cache(maxsize=None)
def legal_moves(position, width, height):
    return tuple((position[0] + dx, position[1] + dy)
                 for dx, dy in DIRECTIONS
                 if 0 <= position[0] + dx < width
                 and 0 <= position[1] + dy < height)


def normalize(state):
    if state.status != 'running':
        return state
    d = distance(state.zombie, state.human)
    if d <= 1:
        return replace(state, status='caught', reason=(
            'already in shared cell' if d == 0 else 'already orthogonally adjacent'))
    if state.tick >= state.tickLimit:
        return replace(state, status='limit', reason='tick limit')
    return None


def contact_reason(old_z, old_h, new_z, new_h):
    if new_z == new_h:
        return 'shared destination'
    if new_h == old_z and new_z == old_h:
        return 'exchanged positions'
    if distance(new_h, new_z) == 1:
        return 'orthogonally adjacent'
    return ''


def resolve(state, new_h, new_z):
    terminal = normalize(state)
    if terminal is not None:
        return terminal
    for old, new in ((state.human, new_h), (state.zombie, new_z)):
        if (not all(type(x) is int for x in new)
                or not (0 <= new[0] < state.width and 0 <= new[1] < state.height)
                or distance(old, new) > 1):
            raise ValueError('Illegal move')
    reason = contact_reason(state.zombie, state.human, new_z, new_h)
    tick = state.tick + 1
    status = 'caught' if reason else ('limit' if tick >= state.tickLimit else 'running')
    return replace(state, zombie=new_z, human=new_h, tick=tick, status=status,
                   reason=reason or ('tick limit' if status == 'limit' else ''))


@lru_cache(maxsize=None)
def greedy_move(position, target, width, height, flee):
    moves = legal_moves(position, width, height)
    # Python max/min keep the first matching key, preserving traversal ties.
    choose = max if flee else min
    return choose(moves, key=lambda p: distance(p, target))


def step_baseline(state):
    terminal = normalize(state)
    if terminal is not None:
        return terminal
    human = greedy_move(state.human, state.zombie, state.width, state.height, True)
    zombie = greedy_move(state.zombie, state.human, state.width, state.height, False)
    return resolve(state, human, zombie)


@lru_cache(maxsize=None)
def planned_decision(zombie, human, width, height):
    """Exactly two transitions; only positions determine search, never tick."""
    if distance(zombie, human) <= 1:
        return human, (0, distance(zombie, human)), ()
    best_score = (-1, -1)
    best_move = None
    best_path = None
    zombie1 = greedy_move(zombie, human, width, height, False)
    for human1 in legal_moves(human, width, height):
        if contact_reason(zombie, human, zombie1, human1):
            leaves = [((0, distance(zombie1, human1)), (human1,))]
        else:
            # This second zombie action sees the first hypothetical endpoint.
            zombie2 = greedy_move(zombie1, human1, width, height, False)
            leaves = []
            for human2 in legal_moves(human1, width, height):
                caught = bool(contact_reason(zombie1, human1, zombie2, human2))
                score = (1 if caught else 2, distance(zombie2, human2))
                leaves.append((score, (human1, human2)))
        for score, path in leaves:
            if score > best_score:  # strict: retain earliest sequence on ties
                best_score, best_move, best_path = score, human1, path
    return best_move, best_score, best_path


def choose_planned(state):
    return planned_decision(state.zombie, state.human, state.width, state.height)[0]


def reference_leaves(state, remaining=2, survived=0, actions=()):
    """Uncached recursive test oracle using real resolution at an ample clock."""
    state = replace(state, tick=0, tickLimit=10000, status='running', reason='')
    zombie = greedy_move(state.zombie, state.human, state.width, state.height, False)
    leaves = []
    for human in legal_moves(state.human, state.width, state.height):
        child = resolve(state, human, zombie)
        path = actions + (human,)
        alive = child.status != 'caught'
        count = survived + int(alive)
        if not alive or remaining == 1:
            leaves.append((path, (count, distance(child.zombie, child.human))))
        else:
            leaves.extend(reference_leaves(child, remaining - 1, count, path))
    return leaves


def step_treatment(state):
    terminal = normalize(state)
    if terminal is not None:
        return terminal
    # Replan at this actual state. Only execute the first proposed human move.
    human = choose_planned(state)
    zombie = greedy_move(state.zombie, state.human, state.width, state.height, False)
    return resolve(state, human, zombie)


def classify_run(state, stepper, keep_frames=False):
    seen = {}
    frames = []
    while True:
        state = normalize(state) or state
        if keep_frames:
            frames.append(state)
        result = {'outcome': None, 'stopTick': state.tick,
                  'cycleStart': None, 'period': None}
        if state.status == 'caught':
            result['outcome'] = 'capture'
            return result, frames
        key = state.zombie, state.human
        if key in seen:
            result.update(outcome='cycle', cycleStart=seen[key],
                          period=state.tick - seen[key])
            return result, frames
        if state.status == 'limit' or state.tick >= state.tickLimit:
            result['outcome'] = 'unresolved'
            return result, frames
        seen[key] = state.tick
        next_state = stepper(state)
        if next_state.tick != state.tick + 1:
            raise AssertionError('Nonterminal step must advance exactly one tick')
        state = next_state


TEST_EVIDENCE = {}


@lru_cache(maxsize=1)
def build_dataset():
    started = time.perf_counter()
    source_hashes = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in INPUTS}
    frozen = json.loads(INPUTS[2].read_text())
    assert len(frozen['results']) == 4830
    frozen_rows = {r['id']: r for r in frozen['results']}
    assert len(frozen_rows) == 4830
    results, decisions = [], []
    cycle_groups = {}
    baseline_counts, treatment_counts, comparisons = Counter(), Counter(), Counter()
    initial = 0
    for zid in range(70):
        for hid in range(70):
            if zid == hid:
                continue
            ident = f'z{zid}-h{hid}'
            state = State(zombie=(zid % 10, zid // 10), human=(hid % 10, hid // 10))
            baseline, _ = classify_run(state, step_baseline)
            treatment, frames = classify_run(state, step_treatment, True)
            saved = frozen_rows[ident]
            assert (saved['zombieId'], saved['humanId']) == (zid, hid)
            assert baseline == {k: saved[k] for k in ('outcome', 'stopTick', 'cycleStart', 'period')}, ident
            assert baseline['outcome'] == 'capture', ident
            if treatment['outcome'] == 'capture':
                delta = treatment['stopTick'] - baseline['stopTick']
                comparison = 'later' if delta > 0 else ('earlier' if delta < 0 else 'same')
            elif treatment['outcome'] == 'cycle':
                comparison = 'escape'
            else:
                comparison = 'unresolved'
            row = {'id': ident, 'zombieId': zid, 'humanId': hid,
                   'baseline': baseline, 'treatment': treatment, 'comparison': comparison}
            results.append(row)
            baseline_counts[baseline['outcome']] += 1
            treatment_counts[treatment['outcome']] += 1
            comparisons[comparison] += 1
            if distance(state.zombie, state.human) <= 1:
                initial += 1
                assert baseline['stopTick'] == treatment['stopTick'] == 0
                assert treatment['outcome'] == 'capture'
            else:
                human = choose_planned(state)
                decisions.append({'id': ident, 'human': {'x': human[0], 'y': human[1]}})
            if treatment['outcome'] == 'cycle':
                start = treatment['cycleStart']
                keys = [(s.zombie, s.human) for s in frames]
                assert len(set(keys[:-1])) == len(keys) - 1
                assert keys[start] == keys[-1]
                assert len(frames) - 1 == treatment['stopTick']
                ring = tuple(keys[start:-1])
                assert len(ring) == treatment['period']
                canonical = min(ring[i:] + ring[:i] for i in range(len(ring)))
                if canonical not in cycle_groups:
                    closed = canonical + canonical[:1]
                    for (z, h), (zn, hn) in zip(closed, closed[1:]):
                        assert distance(z, h) > 1
                        successor = step_treatment(State(zombie=z, human=h))
                        assert successor.status == 'running'
                        assert (successor.zombie, successor.human) == (zn, hn)
                    cycle_groups[canonical] = {
                        'period': len(ring), 'startsReachingCycle': 0,
                        'firstWitness': {'id': ident, **treatment,
                            'firstOccurrence': {'tick': start, 'zombie': keys[start][0], 'human': keys[start][1]},
                            'repeatedEndpoint': {'tick': treatment['stopTick'], 'zombie': keys[-1][0], 'human': keys[-1][1]}},
                        'closedCycle': [{'zombie': z, 'human': h} for z, h in closed],
                        'allEdgesReexecuted': True,
                    }
                cycle_groups[canonical]['startsReachingCycle'] += 1
    assert len(results) == 4830 and len(decisions) == 4584 and initial == 246
    assert [r['id'] for r in results] == [r['id'] for r in frozen['results']]
    assert source_hashes == {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in INPUTS}
    summary = {'total': len(results),
               'baseline': {k: baseline_counts[k] for k in ('capture', 'cycle', 'unresolved')},
               'treatment': {k: treatment_counts[k] for k in ('capture', 'cycle', 'unresolved')},
               **{k: comparisons[k] for k in ('later', 'earlier', 'same', 'escape', 'unresolved')}}
    assert sum(summary[k] for k in ('later', 'earlier', 'same', 'escape', 'unresolved')) == 4830
    deltas = [{'id': r['id'], 'delta': r['treatment']['stopTick'] - r['baseline']['stopTick'],
               'baselineTick': r['baseline']['stopTick'], 'treatmentTick': r['treatment']['stopTick']}
              for r in results if r['treatment']['outcome'] == 'capture']
    periods = Counter(r['treatment']['period'] for r in results if r['treatment']['outcome'] == 'cycle')
    elapsed = time.perf_counter() - started
    return {
        'schemaVersion': 1,
        'metadata': {'commit': 'a87211fcac93c53c5614ffb6107bb886d96dca13 (protocol-declared base; independent oracle)',
                     'implementation': 'Independent Python, not derived from planner or engine',
                     'sourceSha256': source_hashes},
        'config': {'width': 10, 'height': 7, 'safetyTickLimit': 10000, 'horizon': 2,
                   'policy': 'two-tick-model-based', 'excluded': 'same-cell starts'},
        'summary': summary, 'results': results, 'decisions': decisions,
        'validation': {'frozenBaselineRowsMatched': len(results), 'initialCapture': initial,
                       'decisionCount': len(decisions), 'inputsUnchanged': True},
        'effects': {'minimumCapturedDelta': min(deltas, key=lambda r: r['delta']) if deltas else None,
                    'maximumCapturedDelta': max(deltas, key=lambda r: r['delta']) if deltas else None},
        'cycleEvidence': {'distinctCycles': len(cycle_groups),
                          'periodHistogramByStart': dict(sorted(periods.items())),
                          'allFirstRepeatChecksPassed': True,
                          'cycles': list(cycle_groups.values())},
        'measurements': {'sweepSeconds': elapsed,
                         'policyCache': planned_decision.cache_info()._asdict(),
                         'storagePolicy': 'Scalar sweep rows, all decisions, distinct closed cycles; no bulk trajectories'},
    }


class OracleTests(unittest.TestCase):
    def test_physics_against_unchanged_simulation_source(self):
        inputs, expected = [], []
        for z in range(70):
            for h in range(70):
                for tick, limit in ((0, 10000), (9999, 10000)):
                    s = State(zombie=(z % 10, z // 10), human=(h % 10, h // 10),
                              tick=tick, tickLimit=limit)
                    human = choose_planned(s)
                    def wire(state):
                        return {'width': state.width, 'height': state.height,
                                'human': {'x': state.human[0], 'y': state.human[1]},
                                'zombie': {'x': state.zombie[0], 'y': state.zombie[1]},
                                'tick': state.tick, 'tickLimit': state.tickLimit,
                                'status': state.status, 'reason': state.reason}
                    inputs.append({'state': wire(s), 'human': {'x': human[0], 'y': human[1]}})
                    expected.append([wire(step_baseline(s)), wire(step_treatment(s))])
        program = """
const fs = require('node:fs');
require(process.argv[1]);
const rows = JSON.parse(fs.readFileSync(0, 'utf8'));
function pick(s) { return {width:s.width,height:s.height,human:s.human,zombie:s.zombie,
  tick:s.tick,tickLimit:s.tickLimit,status:s.status,reason:s.reason}; }
const got = rows.map(({state,human}) => {
  const baseline = ZombieLab.step(state);
  const treatment = ZombieLab.resolveTick(state, {human,zombie:baseline.zombie});
  return [pick(baseline),pick(treatment)];
});
process.stdout.write(JSON.stringify(got));
"""
        result = subprocess.run(['node', '-e', program, str(INPUTS[1])],
                                input=json.dumps(inputs), text=True, capture_output=True,
                                timeout=45, check=True)
        got = json.loads(result.stdout)
        self.assertEqual(len(got), len(expected))
        for index, (actual, want) in enumerate(zip(got, expected)):
            self.assertEqual(actual, want, index)
        TEST_EVIDENCE['unchangedSimulationSourceStateClockCases'] = len(got)
        TEST_EVIDENCE['unchangedSimulationSourceTransitionsCompared'] = len(got) * 2

    def test_complete_dataset_contract(self):
        data = build_dataset()
        self.assertEqual(len(data['results']), 4830)
        self.assertEqual(data['summary']['total'], 4830)
        self.assertEqual(len(data['decisions']), 4584)
        expected_ids = [f'z{z}-h{h}' for z in range(70) for h in range(70) if z != h]
        self.assertEqual([r['id'] for r in data['results']], expected_ids)
        frozen = json.loads(INPUTS[2].read_text())
        fields = ('outcome', 'stopTick', 'cycleStart', 'period')
        self.assertEqual(len(frozen['results']), 4830)
        for got, saved in zip(data['results'], frozen['results']):
            self.assertEqual(got['id'], saved['id'])
            self.assertEqual(got['zombieId'], saved['zombieId'])
            self.assertEqual(got['humanId'], saved['humanId'])
            self.assertEqual(got['baseline'], {k: saved[k] for k in fields})
        cats = Counter(r['comparison'] for r in data['results'])
        self.assertEqual(sum(cats.values()), 4830)
        for key in ('later', 'earlier', 'same', 'escape', 'unresolved'):
            self.assertEqual(data['summary'][key], cats[key])
        TEST_EVIDENCE['frozenBaselineRowsMatched'] = len(data['results'])

    def test_exhaustive_two_tick_ties_horizon_and_clock(self):
        checked, tied = 0, 0
        witnesses = {}
        for z in range(70):
            for h in range(70):
                state = State(zombie=(z % 10, z // 10), human=(h % 10, h // 10))
                if distance(state.zombie, state.human) <= 1:
                    continue
                leaves = reference_leaves(state, 2)
                path, score = max(leaves, key=lambda leaf: leaf[1])
                self.assertEqual(planned_decision(state.zombie, state.human, 10, 7),
                                 (path[0], score, path))
                best = [p for p, s in leaves if s == score]
                if len({p[0] for p in best}) > 1:
                    tied += 1
                    witnesses.setdefault('exactTie', {'id': f'z{z}-h{h}',
                        'score': score, 'winningPath': path, 'tiedPaths': best})
                one_path, one_score = max(reference_leaves(state, 1), key=lambda leaf: leaf[1])
                if one_path[0] != path[0]:
                    witnesses.setdefault('oneVsTwo', {'id': f'z{z}-h{h}',
                        'one': {'path': one_path, 'score': one_score},
                        'two': {'path': path, 'score': score}})
                if 'twoVsThree' not in witnesses:
                    three_path, three_score = max(reference_leaves(state, 3), key=lambda leaf: leaf[1])
                    if three_path[0] != path[0]:
                        witnesses['twoVsThree'] = {'id': f'z{z}-h{h}',
                            'two': {'path': path, 'score': score},
                            'three': {'path': three_path, 'score': three_score}}
                first_real = step_treatment(state)
                if first_real.status == 'running':
                    new_path, new_score = max(reference_leaves(first_real, 2), key=lambda leaf: leaf[1])
                    second_real = step_treatment(first_real)
                    self.assertEqual(second_real.human, new_path[0])
                    if len(path) == 2 and path[1] != new_path[0]:
                        witnesses.setdefault('replanVsOpenLoop', {'id': f'z{z}-h{h}',
                            'originalPlan': path, 'executedFirst': first_real.human,
                            'replannedNext': new_path, 'replannedScore': new_score})
                for tick, limit in ((0, 1), (39, 40), (9998, 10000), (9999, 10000)):
                    clocked = replace(state, tick=tick, tickLimit=limit)
                    self.assertEqual(choose_planned(clocked), path[0])
                    actual = step_treatment(clocked)
                    self.assertEqual(actual.human, path[0])
                    self.assertEqual(actual.tick, tick + 1)
                    self.assertEqual(actual.zombie, greedy_move(state.zombie, state.human, 10, 7, False))
                    caught = distance(actual.zombie, actual.human) <= 1
                    expected_status = 'caught' if caught else ('limit' if tick + 1 >= limit else 'running')
                    self.assertEqual(actual.status, expected_status)
                checked += 1
        self.assertEqual(checked, 4584)
        self.assertGreater(tied, 0)
        self.assertIn('oneVsTwo', witnesses)
        self.assertIn('twoVsThree', witnesses)
        TEST_EVIDENCE['decisionsComparedWithRecursiveReference'] = checked
        TEST_EVIDENCE['nonterminalStatesWithTiedBestFirstMoves'] = tied
        TEST_EVIDENCE['clockVariantsPerNonterminalState'] = 4
        TEST_EVIDENCE['policyWitnesses'] = witnesses

    def test_initial_capture_and_terminal_normalization(self):
        for stepper in (step_baseline, step_treatment):
            for human in ((0, 0), (1, 0)):
                s = State(zombie=(0, 0), human=human, tickLimit=0)
                end = stepper(s)
                self.assertEqual((end.tick, end.status), (0, 'caught'))
                self.assertEqual((end.zombie, end.human), (s.zombie, s.human))
            s = State(zombie=(0, 0), human=(2, 0), tick=5, tickLimit=5)
            self.assertEqual((stepper(s).tick, stepper(s).status), (5, 'limit'))
            already = replace(s, status='caught', reason='existing')
            self.assertEqual(stepper(already), already)

    def test_captured_leaf_stops_with_actual_endpoint_distance(self):
        s = State(zombie=(0, 0), human=(2, 0), width=3, height=1)
        self.assertEqual(reference_leaves(s), [(((1, 0),), (0, 0)), (((2, 0),), (0, 1))])
        self.assertEqual(planned_decision(s.zombie, s.human, 3, 1),
                         ((2, 0), (0, 1), ((2, 0),)))

    def test_zombie_uses_old_human_not_candidate(self):
        s = State(zombie=(1, 1), human=(0, 0), width=3, height=3)
        end = step_treatment(s)
        self.assertEqual(end.human, (0, 1))
        self.assertEqual(end.zombie, (1, 0))
        self.assertNotEqual(end.zombie, greedy_move(s.zombie, end.human, 3, 3, False))

    def test_runner_capture_cycle_cutoff_priority(self):
        # Synthetic stay policy exists only to test exact-repeat bookkeeping.
        stay = lambda s: resolve(s, s.human, s.zombie)
        s = State(zombie=(0, 0), human=(4, 0), width=5, height=1, tickLimit=1)
        result, frames = classify_run(s, stay, True)
        self.assertEqual(result, {'outcome': 'cycle', 'stopTick': 1, 'cycleStart': 0, 'period': 1})
        self.assertEqual(len(frames), 2)
        self.assertEqual((frames[0].zombie, frames[0].human), (frames[1].zombie, frames[1].human))
        result, _ = classify_run(s, step_baseline)
        self.assertEqual(result, {'outcome': 'unresolved', 'stopTick': 1, 'cycleStart': None, 'period': None})
        s = State(zombie=(0, 0), human=(2, 0), width=3, height=1, tickLimit=1)
        result, _ = classify_run(s, step_treatment)
        self.assertEqual(result['outcome'], 'capture')
        self.assertEqual(result['stopTick'], 1)
        initial = State(zombie=(0, 0), human=(1, 0), tickLimit=0)
        result, _ = classify_run(initial, step_treatment)
        self.assertEqual(result['outcome'], 'capture')
        self.assertEqual(result['stopTick'], 0)

    def test_runner_treatment_capture(self):
        state = State(zombie=(0, 0), human=(2, 0), width=3, height=1)
        result, frames = classify_run(state, step_treatment, True)
        self.assertEqual(result, {'outcome': 'capture', 'stopTick': 1,
                                  'cycleStart': None, 'period': None})
        self.assertEqual(len(frames), 2)
        self.assertEqual(frames[-1].human, (2, 0))
        self.assertEqual(frames[-1].zombie, (1, 0))

    def test_two_tick_choice_uses_first_maximal_leaf(self):
        state = State(zombie=(0, 0), human=(2, 0), width=3, height=3)
        leaves = reference_leaves(state)
        path, score = max(leaves, key=lambda leaf: leaf[1])
        self.assertEqual(path, ((2, 1), (2, 2)))
        self.assertEqual(score, (2, 2))
        self.assertEqual(choose_planned(state), path[0])

    def test_survival_score_counts_zero_one_and_two(self):
        # Corridor fixtures force capture on transition one, two, or after horizon.
        for width, expected_count, endpoint_distance, expected_move in (
                (3, 0, 1, (2, 0)), (4, 1, 1, (3, 0)), (5, 2, 2, (3, 0))):
            s = State(zombie=(0, 0), human=(width - 1, 0), width=width, height=1)
            move, score, path = planned_decision(s.zombie, s.human, width, 1)
            self.assertEqual(score, (expected_count, endpoint_distance))
            # On width five, west/east ties stay/stay and traverses first.
            self.assertEqual(move, expected_move)
            self.assertEqual(len(path), 1 if expected_count == 0 else 2)
            self.assertEqual((path, score), max(reference_leaves(s), key=lambda x: x[1]))

    def test_actual_cycle_wins_at_exact_cutoff(self):
        data = build_dataset()
        witness = next(r for r in data['results'] if r['treatment']['outcome'] == 'cycle')
        z, h = witness['zombieId'], witness['humanId']
        stop = witness['treatment']['stopTick']
        s = State(zombie=(z % 10, z // 10), human=(h % 10, h // 10), tickLimit=stop)
        actual, _ = classify_run(s, step_treatment)
        self.assertEqual(actual, witness['treatment'])
        before, _ = classify_run(replace(s, tickLimit=stop - 1), step_treatment)
        self.assertEqual(before['outcome'], 'unresolved')
        self.assertEqual(before['stopTick'], stop - 1)
        TEST_EVIDENCE['actualCycleAtCutoff'] = {'id': witness['id'], 'exactCutoff': actual,
                                               'oneTickEarlierCutoff': before}

    def test_baseline_old_state_step(self):
        state = State(zombie=(2, 4), human=(7, 2))
        result = step_baseline(state)
        self.assertEqual(result.human, (7, 1))
        self.assertEqual(result.zombie, (2, 3))
        self.assertEqual(result.tick, 1)
        self.assertEqual(result.status, 'running')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--test-only', action='store_true', help='Run tests without exporting JSON')
    args = parser.parse_args()
    started = time.perf_counter()
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(OracleTests)
    names = [test.id().split('.')[-1] for test in suite]
    receipt = unittest.TextTestRunner(verbosity=2).run(suite)
    if not receipt.wasSuccessful():
        return 1
    if args.test_only:
        return 0
    data = build_dataset()
    data['validation'].update(TEST_EVIDENCE)
    data['validation']['tests'] = {'run': receipt.testsRun, 'failed': len(receipt.failures),
                                   'errors': len(receipt.errors), 'names': names}
    data['metadata']['oracleSourceSha256'] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    data['measurements']['totalSecondsIncludingTests'] = time.perf_counter() - started
    data['measurements']['pythonVersion'] = sys.version
    encoded = json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n'
    # The sole generated data artifact; no repository files are written.
    OUT.write_text(encoded)
    print(json.dumps({'output': str(OUT), 'bytes': len(encoded.encode()),
                      'summary': data['summary'], 'decisions': len(data['decisions']),
                      'effects': data['effects'], 'cycleEvidence': {
                          'distinctCycles': data['cycleEvidence']['distinctCycles'],
                          'periodHistogramByStart': data['cycleEvidence']['periodHistogramByStart'],
                          'firstWitness': (data['cycleEvidence']['cycles'][0]['firstWitness']
                                           if data['cycleEvidence']['cycles'] else None)},
                      'validation': data['validation'],
                      'measurements': data['measurements']}, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
