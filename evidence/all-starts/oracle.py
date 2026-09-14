#!/usr/bin/env python3
"""Independent ZL006 oracle: stdlib only, no production runtime import."""
import json
import sys
import unittest
from collections import Counter

WIDTH, HEIGHT, CAP = 10, 7, 10000
BASE = 'b01cbbfcf8aa3776ffe3893af135862363e34ac1'


def distance(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


def choose(origin, opponent, flee):
    x, y = origin
    candidates = [(x, y - 1), (x + 1, y), (x, y + 1), (x - 1, y), (x, y)]
    valid = [p for p in candidates if 0 <= p[0] < WIDTH and 0 <= p[1] < HEIGHT]
    # Python min preserves the first matching key, thus the specified tie order.
    return min(valid, key=lambda p: (-1 if flee else 1) * distance(p, opponent))


def resolve(human, zombie, human_to, zombie_to):
    if distance(human, zombie) <= 1:
        return human, zombie, 0, True
    for old, new in ((human, human_to), (zombie, zombie_to)):
        if not (0 <= new[0] < WIDTH and 0 <= new[1] < HEIGHT and distance(old, new) <= 1):
            raise ValueError('illegal move')
    crossed = human_to == zombie and zombie_to == human
    return human_to, zombie_to, 1, distance(human_to, zombie_to) <= 1 or crossed


def run(human, zombie, cap=CAP, move_policy=None):
    seen = {}
    crossed_or_contact = False
    for tick in range(cap + 1):
        if crossed_or_contact or distance(human, zombie) <= 1:
            return 'capture', tick, None, None
        pair = (human, zombie)  # Ordered full state, not a distance/parity proxy.
        if pair in seen:
            return 'cycle', tick, seen[pair], tick - seen[pair]
        if tick == cap:
            return 'unresolved', tick, None, None
        seen[pair] = tick
        if move_policy is None:
            moves = (choose(human, zombie, True), choose(zombie, human, False))
        else:
            moves = move_policy(human, zombie)
        human, zombie, elapsed, crossed_or_contact = resolve(human, zombie, *moves)
        assert elapsed == 1
    raise AssertionError('unreachable')


def build():
    rows = []
    for zid in range(WIDTH * HEIGHT):
        zombie = (zid % WIDTH, zid // WIDTH)
        for hid in range(WIDTH * HEIGHT):
            if hid == zid:
                continue
            human = (hid % WIDTH, hid // WIDTH)
            outcome, stop_tick, cycle_start, period = run(human, zombie)
            rows.append(dict(id=f'z{zid}-h{hid}', humanId=hid, zombieId=zid,
                             outcome=outcome, stopTick=stop_tick,
                             cycleStart=cycle_start, period=period))
    counts = Counter(row['outcome'] for row in rows)
    return dict(schemaVersion=1, metadata=dict(commit=BASE),
                config=dict(width=WIDTH, height=HEIGHT, safetyTickLimit=CAP,
                            captureRule='orthogonal-adjacency', excluded='same-cell starts'),
                summary=dict(total=len(rows), capture=counts['capture'], cycle=counts['cycle'],
                             unresolved=counts['unresolved'],
                             initialCapture=sum(row['outcome'] == 'capture' and row['stopTick'] == 0 for row in rows)),
                results=rows)


class OracleTests(unittest.TestCase):
    dataset = None

    def test_build_contract(self):
        data = build()
        self.assertIsInstance(data, dict)
        self.assertEqual(data['schemaVersion'], 1)
        rows = data['results']
        expected_ids = [f'z{z}-h{h}' for z in range(WIDTH * HEIGHT) for h in range(WIDTH * HEIGHT) if z != h]
        self.assertEqual([r['id'] for r in rows], expected_ids)
        self.assertEqual(len(rows), 4830)
        self.assertEqual(len(set(expected_ids)), 4830)
        self.assertEqual(sum(data['summary'][key] for key in ('capture', 'cycle', 'unresolved')), 4830)
        for row in rows:
            self.assertEqual(row['id'], f"z{row['zombieId']}-h{row['humanId']}")
            self.assertTrue(0 <= row['stopTick'] <= CAP)
            self.assertEqual(row['cycleStart'] is not None, row['outcome'] == 'cycle')
            self.assertEqual(row['period'] is not None, row['outcome'] == 'cycle')
        type(self).dataset = data

    def test_terminal_priority_and_cap(self):
        self.assertEqual(run((0, 0), (1, 0), cap=0), ('capture', 0, None, None))
        self.assertEqual(run((0, 0), (9, 6), cap=0), ('unresolved', 0, None, None))
        self.assertEqual(run((7, 2), (2, 4), cap=73), ('capture', 73, None, None))
        self.assertEqual(run((7, 2), (2, 4), cap=72), ('unresolved', 72, None, None))

    def test_exact_cycle_bookkeeping_with_synthetic_policy(self):
        a = ((0, 0), (9, 6))
        b = ((0, 1), (9, 6))
        c = ((0, 1), (8, 6))
        transitions = {a: b, b: c, c: b}
        policy = lambda h, z: transitions[(h, z)]
        self.assertEqual(run(*a, cap=3, move_policy=policy), ('cycle', 3, 1, 2))
        self.assertEqual(run(*a, cap=2, move_policy=policy), ('unresolved', 2, None, None))
        stationary = lambda h, z: (h, z)
        self.assertEqual(run(*a, cap=1, move_policy=stationary), ('cycle', 1, 0, 1))

    def test_simultaneous_old_targets(self):
        h, z = (3, 0), (5, 0)
        hm, zm = choose(h, z, True), choose(z, h, False)
        self.assertEqual((hm, zm), ((3, 1), (4, 0)))
        self.assertNotEqual(choose(z, hm, False), zm)
        self.assertEqual(resolve(h, z, hm, zm), ((3, 1), (4, 0), 1, False))

    def test_original_fixtures(self):
        for human in ((7, 2), (6, 2)):
            self.assertEqual(run(human, (2, 4)), ('capture', 73, None, None))

    def test_contact_resolution(self):
        # Tuple: new H, new Z, consumed ticks, capture.
        self.assertEqual(resolve((1, 1), (1, 1), (2, 1), (1, 2)), ((1, 1), (1, 1), 0, True))
        self.assertEqual(resolve((1, 1), (2, 1), (2, 1), (1, 1)), ((1, 1), (2, 1), 0, True))
        self.assertEqual(resolve((1, 1), (3, 1), (2, 1), (2, 1)), ((2, 1), (2, 1), 1, True))
        self.assertEqual(resolve((1, 1), (4, 1), (2, 1), (3, 1)), ((2, 1), (3, 1), 1, True))
        self.assertEqual(resolve((1, 1), (2, 2), (1, 1), (2, 2)), ((1, 1), (2, 2), 1, False))

    def test_cardinal_tie_priority(self):
        # Interior flee tie north/east: north wins.
        self.assertEqual(choose((3, 3), (1, 5), True), (3, 2))
        # Chase tie east/south: east wins.
        self.assertEqual(choose((3, 3), (5, 5), False), (4, 3))
        # North invalid, flee south/west tie: south wins.
        self.assertEqual(choose((3, 0), (5, 0), True), (3, 1))
        # At this top-edge state, west is the only distance-increasing move.
        self.assertEqual(choose((3, 0), (5, 3), True), (2, 0))
        # Opponent in same cell: stay is optimal chase choice.
        self.assertEqual(choose((3, 3), (3, 3), False), (3, 3))


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(OracleTests)
    receipt = unittest.TextTestRunner(verbosity=2).run(suite)
    if not receipt.wasSuccessful():
        sys.exit(1)
    data = OracleTests.dataset
    output = '/tmp/zl006-oracle.json'
    with open(output, 'w', encoding='utf-8') as handle:
        json.dump(data, handle, indent=2)
        handle.write('\n')
    with open(output, encoding='utf-8') as handle:
        assert json.load(handle) == data
    print(json.dumps({'path': output, 'summary': data['summary']}))
    for outcome in ('capture', 'cycle', 'unresolved'):
        rows = [r for r in data['results'] if r['outcome'] == outcome]
        if not rows:
            continue
        ticks = sorted(set(r['stopTick'] for r in rows))
        extremes = {}
        for label, value in [('min', ticks[0]), ('max', ticks[-1])]:
            matched = [r['id'] for r in rows if r['stopTick'] == value]
            extremes[label] = dict(tick=value, count=len(matched), firstIds=matched[:20])
        positive = [tick for tick in ticks if tick > 0]
        if positive:
            fastest = positive[0]
            matched = [r['id'] for r in rows if r['stopTick'] == fastest]
            extremes['minPositive'] = dict(tick=fastest, count=len(matched), firstIds=matched[:20])
        print(json.dumps({'outcome': outcome, 'extremes': extremes}))
    fixtures = [r for r in data['results'] if r['id'] in ('z42-h27', 'z42-h26')]
    assert len(fixtures) == 2
    assert all(r['outcome'] == 'capture' and r['stopTick'] == 73 for r in fixtures)
    print(json.dumps({'originalFixtures': fixtures, 'testsPassed': receipt.testsRun}))
