"""ZL020 offline development/unit probes; never fresh heldout."""
import copy
import itertools
import unittest
import semantics_core as old
try:
    import semantic_gate as gate
except ImportError:
    gate = None

class GateTests(unittest.TestCase):
    def test_all_closed_labels_force_required_ask_without_mutation(self):
        self.assertIsNotNone(gate, 'new semantic gate is missing')
        n = 0
        for values in itertools.product(*old.OPTIONS.values()):
            raw = dict(zip(old.OPTIONS, values)); before = copy.deepcopy(raw)
            out = gate.adapt(raw)
            uncertain = any(raw[k] in ('suspected_positive','suspected_negative','conflicting') for k in old.FACTS)
            goal = raw['policy'] == 'unclear'
            expected = 'both' if goal and uncertain else 'goal' if goal else 'evidence' if uncertain else 'none'
            self.assertEqual(out['required_clarification'], expected)
            self.assertEqual(out['raw_interpretation'], raw)
            self.assertEqual(out['raw_clarification'], raw['clarification'])
            self.assertEqual(raw, before)
            self.assertEqual(out['raw_decision'], old.controller(raw))
            if expected != 'none' or raw['clarification'] != 'none':
                self.assertEqual(out['gated_decision']['action'], 'ask')
            else:
                self.assertEqual(out['gated_decision'], old.controller(raw))
            n += 1
        self.assertEqual(n, 3456)

    def test_invalid_labels_fail_closed_and_raw_ask_is_never_erased(self):
        for bad in (None, {}, [], dict(mara_at_depot='truth'), {'policy':'solo'}):
            self.assertEqual(gate.adapt(bad)['gated_decision']['action'], 'ask')
        valid = dict(mara_at_depot='known',ash_in_east='negated',west_blocked='negated',policy='solo',clarification='evidence')
        self.assertEqual(gate.adapt(valid)['required_clarification'],'none')
        self.assertEqual(gate.adapt(valid)['gated_decision']['action'],'ask')

    def test_solo_excludes_actual_companion_after_wrong_together(self):
        import semantic_gate as g
        self.assertTrue(hasattr(g, 'simulate'), 'strict simulator wrapper missing')
        raw = dict(mara_at_depot='known', ash_in_east='negated', west_blocked='negated', policy='together', clarification='none')
        decision = old.controller(raw)
        world = dict(mara_at_depot=True, ash_in_east=False, west_blocked=False)
        trace = g.simulate(decision, world, 'solo')
        self.assertEqual(trace['outcome'], 'shelter')
        self.assertTrue(trace['frames'][-1]['companion'])
        self.assertFalse(trace['goal_completed'])
        self.assertTrue(g.simulate(decision, world, 'together')['goal_completed'])
        world['mara_at_depot'] = False
        self.assertTrue(g.simulate(decision, world, 'solo')['goal_completed'])
        self.assertFalse(g.simulate(decision, world, 'together')['goal_completed'])

if __name__ == '__main__': unittest.main()
