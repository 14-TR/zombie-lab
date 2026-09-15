#!/usr/bin/env python3
"""Dependency-free adversarial tests for the independent ZL-010 checker."""
import importlib.util
from pathlib import Path
import unittest

CHECKER_PATH = Path(__file__).with_name("check-avoidability.py")


def load_checker():
    if not CHECKER_PATH.exists():
        raise AssertionError("independent checker has not been implemented")
    spec = importlib.util.spec_from_file_location("avoidability_checker", CHECKER_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PhysicsTests(unittest.TestCase):
    def test_corner_actions_use_simultaneous_old_human_north_ties(self):
        checker = load_checker()
        physics = checker.Physics()
        state = ((24 * 70 + 69) * 70)
        self.assertEqual(physics.decode(state), (0, 24, 69))
        self.assertFalse(physics.terminal(state))
        # Both zombies go north towards OLD (0,0), independent of action.
        base = ((14 * 70 + 59) * 70)
        self.assertEqual(list(physics.transitions(state)),
                         [(1, base + 1, False), (2, base + 10, False),
                          (4, base, False)])


class RankRuleTests(unittest.TestCase):
    def test_exact_rank_and_winning_closure_with_adversarial_labels(self):
        checker = load_checker()
        self.assertTrue(hasattr(checker, "check_rank_rule"), "rank checker missing")
        rule = checker.check_rank_rule
        for terminal, rank, successors in [(True, 0, []), (False, 1, [0, 0]),
                                           (False, 3, [0, 2, 1]),
                                           (False, -1, [0, -1, 7])]:
            rule(17, terminal, rank, successors)
        cases = [
            (True, -1, [], "terminal"), (True, 1, [], "terminal"),
            (False, 0, [0], "nonterminal"),
            (False, -1, [0, 2], "winning"),  # Spurious win.
            (False, 3, [-1, 2], "losing"),  # Spurious loss.
            (False, 3, [3], "lower"), (False, 3, [4], "lower"),
            (False, 4, [0, 2], "exact"),
            (False, -1, [], "successor"),
        ]
        for terminal, rank, successors, message in cases:
            with self.subTest(terminal=terminal, rank=rank, successors=successors):
                with self.assertRaisesRegex(checker.VerificationError, message):
                    rule(17, terminal, rank, successors)


class CertificateInputTests(unittest.TestCase):
    def test_complete_domain_and_source_identity_reject_corruption(self):
        import json
        import tempfile
        checker = load_checker()
        self.assertTrue(hasattr(checker, "load_certificate"), "certificate reader missing")
        root = CHECKER_PATH.parent.parent
        metadata = {"commit": "a7cd186ddb3414de0e20e96e2a3c538bc8dc8103",
                    "sourceHashes": {"two-zombies.js": checker.FROZEN_HASHES["two-zombies.js"]}}
        valid = {"schemaVersion": 1, "metadata": metadata, "ranks": [-1] * 343000}
        # This tests input validation, not a mathematically valid game solution.
        with tempfile.TemporaryDirectory(prefix="zl010-input-") as directory:
            path = Path(directory) / "certificate.json"
            path.write_text(json.dumps(valid))
            ranks, identity = checker.load_certificate(path, root)
            self.assertEqual(len(ranks), 343000)
            self.assertEqual(identity["commit"], metadata["commit"])
            for bad in [None, True, 1.5, "2", -2, 343000]:
                altered = dict(valid, ranks=valid["ranks"].copy())
                altered["ranks"][100] = bad
                path.write_text(json.dumps(altered))
                with self.subTest(rank=bad), self.assertRaisesRegex(checker.VerificationError, "rank"):
                    checker.load_certificate(path, root)
            for altered in [dict(valid, ranks=valid["ranks"][:-1]),
                            dict(valid, ranks=valid["ranks"] + [-1]),
                            dict(valid, ranks={}), dict(valid, schemaVersion=True),
                            dict(valid, metadata={}),
                            {"schemaVersion": 1, "metadata": metadata},
                            dict(valid, metadata=dict(metadata, commit="not-a-commit")),
                            dict(valid, metadata=dict(metadata, sourceHashes={"two-zombies.js": "0" * 64})),
                            dict(valid, metadata=dict(metadata, sourceHashes={"../two-zombies.js": "0" * 64}))]:
                path.write_text(json.dumps(altered))
                with self.subTest(fields=list(altered)), self.assertRaises(checker.VerificationError):
                    checker.load_certificate(path, root)
            for raw in ['{', '{"ranks":[],"ranks":[]}', '{"schemaVersion":NaN}']:
                path.write_text(raw)
                with self.subTest(raw=raw), self.assertRaises(checker.VerificationError):
                    checker.load_certificate(path, root)
            path.write_text(json.dumps(valid))
            with self.assertRaisesRegex(checker.VerificationError, "commit"):
                checker.load_certificate(path, root, expected_commit="0" * 40)


class GraphIntegrationTests(unittest.TestCase):
    def test_export_complete_graph_then_accept_and_corrupt_full_certificate(self):
        from array import array
        from collections import deque
        import hashlib
        import struct
        import tempfile
        checker = load_checker()
        self.assertTrue(hasattr(checker, "scan_graph"), "complete graph auditor missing")
        physics = checker.Physics()
        # A separately structured enumeration checks all cell moves and all
        # ordered chase pairs, including every deterministic Manhattan tie.
        deltas = [(0, -1), (1, 0), (0, 1), (-1, 0), (0, 0)]
        expected_terminals = expected_edges = 0
        for h in range(70):
            hx, hy = h % 10, h // 10
            human_moves = [(a, (hy + dy) * 10 + hx + dx)
                           for a, (dx, dy) in enumerate(deltas)
                           if 0 <= hx + dx < 10 and 0 <= hy + dy < 7]
            self.assertEqual(list(physics.moves[h]), human_moves)
            safe_zombies = 0
            for z in range(70):
                zx, zy = z % 10, z // 10
                options = [((abs(zx + dx - hx) + abs(zy + dy - hy)), a,
                            (zy + dy) * 10 + zx + dx)
                           for a, (dx, dy) in enumerate(deltas)
                           if 0 <= zx + dx < 10 and 0 <= zy + dy < 7]
                self.assertEqual(physics.chase[h][z], min(options)[2])
                touching = abs(hx - zx) + abs(hy - zy) <= 1
                self.assertEqual(physics.contact[h][z], touching)
                safe_zombies += not touching
            expected_terminals += 70 * 70 - safe_zombies * safe_zombies
            expected_edges += len(human_moves) * safe_zombies * safe_zombies
        with tempfile.TemporaryDirectory(prefix="zl010-graph-") as directory:
            stream = Path(directory) / "transitions.bin"
            audit = checker.scan_graph(transitions_path=stream)
            self.assertEqual(audit["states"], 343000)
            self.assertEqual(audit["terminalStates"], expected_terminals)
            self.assertEqual(audit["transitions"], expected_edges)
            raw = stream.read_bytes()
            self.assertTrue(raw.startswith(b"ZL010-TRANSITIONS-v1\n"))
            self.assertEqual(audit["transitionSha256"], hashlib.sha256(raw).hexdigest())
            self.assertEqual(raw[len(b"ZL010-TRANSITIONS-v1\n"):][:6],
                             struct.pack("<IBB", 0, 1, 0))
            # TEST-ONLY retrograde fixture: derive ranks from decoded binary
            # edges. The production checker itself never computes a solution.
            predecessors = [[] for _ in range(343000)]
            remaining = bytearray(343000)
            ranks = array("i", [-1]) * 343000
            maximum = array("i", [0]) * 343000
            queue = deque()
            offset = len(b"ZL010-TRANSITIONS-v1\n")
            for expected_index in range(343000):
                index, terminal, degree = struct.unpack_from("<IBB", raw, offset)
                offset += 6
                self.assertEqual(index, expected_index)
                human = index % 70
                zombie1, zombie2 = index // 4900, (index // 70) % 70
                def distance(a, b):
                    return abs(a % 10 - b % 10) + abs(a // 10 - b // 10)
                self.assertEqual(bool(terminal), distance(human, zombie1) <= 1 or
                                 distance(human, zombie2) <= 1)
                remaining[index] = degree
                if terminal:
                    self.assertEqual(degree, 0)
                    ranks[index] = 0
                    queue.append(index)
                actions = []
                for _ in range(degree):
                    action, target, caught = struct.unpack_from("<BIB", raw, offset)
                    offset += 6
                    self.assertLess(target, 343000)
                    next_human = target % 70
                    next1, next2 = target // 4900, (target // 70) % 70
                    dx, dy = deltas[action]
                    self.assertEqual(next_human, human + dy * 10 + dx)
                    self.assertEqual((next1, next2),
                                     (physics.chase[human][zombie1], physics.chase[human][zombie2]))
                    exchanged = (next_human == zombie1 and next1 == human or
                                 next_human == zombie2 and next2 == human)
                    # Initial-contact priority makes a legal nonterminal
                    # exchange impossible, but the compatibility rule is kept.
                    self.assertFalse(exchanged)
                    self.assertEqual(bool(caught), distance(next_human, next1) <= 1 or
                                     distance(next_human, next2) <= 1 or exchanged)
                    actions.append(action)
                    predecessors[target].append(index)
                self.assertEqual(actions, sorted(set(actions)))
            self.assertEqual(offset, len(raw))
            while queue:
                child = queue.popleft()
                for parent in predecessors[child]:
                    remaining[parent] -= 1
                    maximum[parent] = max(maximum[parent], ranks[child])
                    if not remaining[parent]:
                        ranks[parent] = 1 + maximum[parent]
                        queue.append(parent)
            del predecessors, remaining, maximum, raw
            verified = checker.scan_graph(ranks=ranks)
            self.assertEqual(verified["transitionSha256"], audit["transitionSha256"])
            self.assertEqual(verified["winningStates"] + verified["losingStates"], 343000)
            import json
            import subprocess
            valid_certificate = Path(directory) / "valid-certificate.json"
            valid_certificate.write_text(json.dumps({
                "schemaVersion": 1, "ranks": list(ranks),
                "metadata": {"commit": "a7cd186ddb3414de0e20e96e2a3c538bc8dc8103",
                             "sourceHashes": {"two-zombies.js": checker.FROZEN_HASHES["two-zombies.js"]}}}))
            run = subprocess.run(["python3", "-B", str(CHECKER_PATH), str(valid_certificate),
                                  "--out-dir", str(Path(directory) / "verified"),
                                  "--expect-transition-sha256", audit["transitionSha256"]],
                                 capture_output=True, text=True, timeout=30)
            self.assertEqual(run.returncode, 0, run.stderr + run.stdout)
            cli_receipt = json.loads(run.stdout)
            self.assertTrue(cli_receipt["certificateVerified"])
            self.assertTrue(cli_receipt["productionTransitionParityVerified"])
            self.assertEqual(cli_receipt["rankSha256"], verified["rankSha256"])
            first_terminal = next(i for i, r in enumerate(ranks) if r == 0)
            first_loss = next(i for i, r in enumerate(ranks) if r == 1)
            first_win = next(i for i, r in enumerate(ranks) if r == -1)
            mutants = [(first_terminal, -1), (first_terminal, 1), (first_loss, -1),
                       (first_loss, 0), (first_loss, 2), (first_win, 1)]
            for index, bad_rank in mutants:
                old = ranks[index]
                ranks[index] = bad_rank
                with self.subTest(index=index, bad_rank=bad_rank), self.assertRaises(checker.VerificationError):
                    checker.scan_graph(ranks=ranks)
                ranks[index] = old
            with self.assertRaisesRegex(checker.VerificationError, "domain"):
                checker.scan_graph(ranks=ranks[:-1])


class CommandLineTests(unittest.TestCase):
    def test_cli_saves_audit_and_negative_receipts(self):
        import json
        import subprocess
        import tempfile
        with tempfile.TemporaryDirectory(prefix="zl010-cli-") as directory:
            out = Path(directory)
            run = subprocess.run(["python3", "-B", str(CHECKER_PATH), "--fingerprints-only",
                                  "--export-transitions", "--out-dir", str(out)],
                                 capture_output=True, text=True, timeout=30)
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertTrue((out / "fingerprints.json").is_file(), "CLI did not save audit receipt")
            audit = json.loads((out / "fingerprints.json").read_text())
            self.assertFalse(audit["certificateVerified"])
            self.assertEqual(audit["states"], 343000)
            self.assertEqual(audit["status"], "passed")
            self.assertLess(audit["peakRssBytes"], 512 * 1024 * 1024)
            self.assertTrue((out / "transitions.bin").is_file())
            invalid = out / "invalid.json"
            invalid.write_text('{"schemaVersion":1,"ranks":[]}')
            run = subprocess.run(["python3", "-B", str(CHECKER_PATH), str(invalid),
                                  "--out-dir", str(out)], capture_output=True, text=True, timeout=30)
            self.assertEqual(run.returncode, 1, run.stderr)
            rejected = json.loads((out / "verification.json").read_text())
            self.assertEqual(rejected["status"], "rejected")
            self.assertFalse(rejected["certificateVerified"])
            self.assertIn("domain", rejected["error"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
