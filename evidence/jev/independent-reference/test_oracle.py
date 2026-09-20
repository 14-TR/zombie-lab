#!/usr/bin/env python3
"""Independent fixtures: literals derive from the frozen rules, not new Jev code."""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parent


def oracle():
    path = ROOT / 'oracle.py'
    if not path.exists():
        raise AssertionError('Independent oracle has not been implemented')
    spec = importlib.util.spec_from_file_location('zl014_oracle', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PhysicsTests(unittest.TestCase):
    def test_corner_actions_are_in_bounds_in_original_tie_order(self):
        o = oracle()
        self.assertEqual(o.legal_moves(0), [(1, 1), (2, 10), (4, 0)])
        self.assertEqual(o.legal_moves(69), [(0, 59), (3, 68), (4, 69)])
        with self.assertRaises(ValueError):
            o.legal_moves(70)
        with self.assertRaises(ValueError):
            o.legal_moves(True)

    def test_simultaneous_transition_and_contact_edges(self):
        o = oracle()
        self.assertTrue(hasattr(o, 'transition'), 'transition feature is missing')
        self.assertEqual(o.transition((22, 11, 44), 2), ((32, 12, 34), False, 1))
        self.assertEqual(o.transition((22, 24, 66), 1), ((23, 23, 56), True, 1))
        self.assertEqual(o.transition((0, 2, 69), 4), ((0, 1, 59), True, 1))
        self.assertEqual(o.transition((0, 1, 69), 99), ((0, 1, 69), True, 0))
        self.assertEqual(o.transition((0, 0, 69), 99), ((0, 0, 69), True, 0))
        self.assertEqual(o.transition((22, 11, 11), 4), ((22, 12, 12), True, 1))
        self.assertFalse(o.contact((11, 0, 69)), 'diagonal adjacency is not contact')
        with self.assertRaises(ValueError):
            o.transition((0, 22, 69), 0)
        with self.assertRaises(ValueError):
            o.transition((0, 22, 69), True)
        self.assertEqual(o.encode((2, 42, 0)), 205802)
        self.assertEqual(o.decode(210697), (67, 42, 69))
        self.assertEqual(o.choose_zombie(11, 22), (1, 12))
        self.assertEqual(o.choose_zombie(44, 22), (0, 34))

    def test_pilot_sample_is_endpoint_inclusive_over_ascending_numeric_ids(self):
        o = oracle()
        self.assertTrue(hasattr(o, 'select_pilot'), 'selection feature is missing')
        sample = o.select_pilot()
        self.assertEqual(sample['selection']['originalSliceCount'], 4761)
        self.assertEqual(sample['selection']['nonterminalCount'], 4259)
        records = sample['records']
        self.assertEqual([r['stateIndex'] for r in records], [
            205802, 206011, 206223, 206435, 206648, 206863,
            207081, 207294, 207509, 207725, 207938, 208148,
            208365, 208580, 208786, 208997, 209214, 209425,
            209636, 209851, 210064, 210275, 210484, 210697])
        self.assertEqual(records[0]['id'], 'z2-0-h2')
        self.assertEqual(records[-1]['id'], 'z2-69-h67')
        self.assertEqual([r['eligibleIndex'] for r in records],
                         [i * 4258 // 23 for i in range(24)])
        self.assertEqual(records[14]['zombie1'], records[14]['zombie2'])
        for record in records:
            self.assertFalse(o.contact(o.decode(record['stateIndex'])))
            self.assertNotIn('rank', record)
            self.assertNotIn('avoidable', record)

    def test_certificate_identity_and_rank_laws_reject_adversarial_mutations(self):
        o = oracle()
        self.assertTrue(hasattr(o, 'load_certificate'), 'certificate feature is missing')
        data = o.load_certificate()
        self.assertEqual(len(data['ranks']), 343000)
        self.assertEqual(data['ranks'][0], 0)
        self.assertEqual(data['ranks'][205802], -1)
        # Entire independently specified synthetic graph: terminal, delay1,
        # delay2 with unequal choices, and safe self-loop with a losing choice.
        ranks = [0, 1, 2, -1]
        edges = [[], [0], [0, 1], [3, 1]]
        for state in range(4):
            o.check_rank(ranks[state], state == 0, [ranks[s] for s in edges[state]])
        for rank, terminal, successors in [
            (1, True, []), (0, False, [0]), (-1, False, [0, 1]),
            (2, False, [0]), (2, False, [-1]), (1, False, [1]),
            (True, True, []), (-2, False, [-1]), (0, True, [0]),
        ]:
            with self.assertRaises(ValueError):
                o.check_rank(rank, terminal, successors)
        changed = dict(data, ranks=data['ranks'][:-1])
        with self.assertRaises(ValueError):
            o.validate_certificate(changed)
        changed = dict(data, metadata=dict(data['metadata'], sourceHashes={}))
        with self.assertRaises(ValueError):
            o.validate_certificate(changed)
        changed = dict(data, ranks=[False] + data['ranks'][1:])
        with self.assertRaises(ValueError):
            o.validate_certificate(changed)
        import tempfile
        with tempfile.TemporaryDirectory(dir=ROOT) as temporary:
            bad = pathlib.Path(temporary) / 'corrupted.json'
            bad.write_text('{}')
            with self.assertRaises(ValueError):
                o.load_certificate(bad)

    def test_cli_truth_and_assertion_checker_use_real_records(self):
        import json
        import subprocess
        import sys
        def run(command, value=None):
            return subprocess.run([sys.executable, '-B', str(ROOT / 'oracle.py'), command],
                                  input=json.dumps(value) if value is not None else '',
                                  text=True, capture_output=True)
        selected = run('select')
        self.assertTrue(selected.stdout.strip(), 'JSON CLI has not been implemented')
        self.assertEqual(selected.returncode, 0, selected.stderr)
        self.assertEqual(len(json.loads(selected.stdout)['records']), 24)
        result = run('truth', [{'stateIndex': 205802, 'action': 'E'},
                               {'human': {'x': 0, 'y': 0}, 'zombie1': {'x': 1, 'y': 0},
                                'zombie2': {'x': 9, 'y': 6}, 'action': 'N'}])
        self.assertEqual(result.returncode, 0, result.stderr)
        rows = json.loads(result.stdout)['records']
        self.assertEqual(rows[0]['successorIndex'], (32 * 70 + 1) * 70 + 3)
        self.assertFalse(rows[0]['captured'])
        self.assertTrue(rows[0]['successorAvoidable'])
        self.assertEqual(rows[0]['successor']['zombie1'], {'x': 2, 'y': 3})
        self.assertEqual(rows[1]['elapsedTicks'], 0)
        self.assertTrue(rows[1]['captured'])
        valid = run('check', [{'stateIndex': 205802, 'action': 1,
                               'expected': {'captured': False, 'successorAvoidable': True}}])
        self.assertEqual(valid.returncode, 0, valid.stderr)
        self.assertTrue(json.loads(valid.stdout)['ok'])
        invalid = run('check', [{'stateIndex': 205802, 'action': 1,
                                 'expected': {'captured': True}}])
        self.assertEqual(invalid.returncode, 1)
        self.assertFalse(json.loads(invalid.stdout)['ok'])
        for record in [
            {'stateIndex': 205802, 'action': 0},
            {'stateIndex': 205802, 'action': True},
            {'stateIndex': 205802, 'action': 1, 'expected': {}},
            {'stateIndex': 205802, 'human': {'x': 9, 'y': 6}},
            {'stateIndex': 205802, 'id': 'z2-0-h02'},
        ]:
            bad = run('check' if 'expected' in record else 'truth', [record])
            self.assertEqual(bad.returncode, 2, bad.stdout)
        strict_type = run('check', [{'stateIndex': 205802, 'action': 1,
                                     'expected': {'captured': 0}}])
        self.assertEqual(strict_type.returncode, 1)

    def test_complete_certificate_rechecks_physics_without_resolving_graph(self):
        o = oracle()
        self.assertTrue(hasattr(o, 'verify_certificate'), 'full certificate scan is missing')
        data = o.load_certificate()
        proof = o.verify_certificate(data)
        self.assertTrue(proof['ok'])
        self.assertEqual(proof['states'], 343000)
        self.assertEqual(proof['terminalStates'], 42788)
        self.assertEqual(proof['legalActions'], 1351892)
        self.assertEqual(proof['rankHistogram']['-1'], 298396)
        mutated = dict(data, ranks=list(data['ranks']))
        mutated['ranks'][0] = 1
        with self.assertRaises(ValueError):
            o.verify_certificate(mutated)
        first_rank_one = data['ranks'].index(1)
        mutated['ranks'][0] = 0
        mutated['ranks'][first_rank_one] = -1
        with self.assertRaises(ValueError):
            o.verify_certificate(mutated)


if __name__ == '__main__':
    unittest.main(verbosity=2)
