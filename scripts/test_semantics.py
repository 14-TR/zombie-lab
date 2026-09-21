import unittest
import importlib.util
from pathlib import Path

class CoreTests(unittest.TestCase):
    def test_epistemic_controller_never_promotes_suspected(self):
        path = Path(__file__).with_name('semantics_core.py')
        self.assertTrue(path.exists(), 'semantic adapter/controller not implemented')
        import semantics_core as s
        state = dict(mara_at_depot='known', ash_in_east='suspected_negative', west_blocked='unreported', policy='solo', clarification='none')
        self.assertEqual(s.controller(state), {'action':'ask','route':['Yard'],'collect':False})
        state['ash_in_east'] = 'negated'
        self.assertEqual(s.controller(state), {'action':'move','route':['Yard','East','Shelter'],'collect':False})
        state['policy'] = 'together'
        state['west_blocked'] = 'negated'
        self.assertEqual(s.controller(state), {'action':'move','route':['Yard','Depot','West','Shelter'],'collect':True})
        state['clarification'] = 'evidence'
        self.assertEqual(s.controller(state)['action'], 'ask')
        self.assertEqual(s.assertions(state)['ash_in_east'], {'entity':'Ash','event':'in East passage','status':'negated','polarity':'negative'})
        state['mara_at_depot'] = 'suspected_positive'
        self.assertEqual(s.assertions(state)['mara_at_depot']['status'], 'suspected')

    def test_schema_guards_fail_closed_and_all_suspected_combinations(self):
        import itertools
        import semantics_core as s
        base=dict(mara_at_depot='known',ash_in_east='negated',west_blocked='negated',policy='together',clarification='none')
        for bad in (None,{},dict(base,extra='injected'),dict(base,policy='fly'),dict(base,ash_in_east=None)):
            self.assertEqual(s.controller(bad)['action'],'ask')
        for key in base:
            bad=dict(base); del bad[key]
            self.assertEqual(s.controller(bad)['action'],'ask')
        for m,a,w in itertools.product(s.FACT_OPTIONS,repeat=3):
            state=dict(base,mara_at_depot=m,ash_in_east=a,west_blocked=w)
            together=s.controller(state)
            self.assertEqual(together['action']=='move',m=='known' and w=='negated')
            state['policy']='solo'
            solo=s.controller(state)
            self.assertEqual(solo['action']=='move',a=='negated' or w=='negated')

class ParserTests(unittest.TestCase):
    def test_firsthand_reported_negated_conflict_and_clarification(self):
        import semantics_core as s
        self.assertTrue(hasattr(s, 'parse'), 'same-input parser not implemented')
        cases = [
            ('I see Mara at the depot. I checked the west passage is clear. Evacuate with Mara.', 'known', 'negated', 'together', 'none'),
            ('Niko reports Mara at the depot. Leave without Mara.', 'suspected_positive', 'unreported', 'solo', 'evidence'),
            ('Niko says "I see Mara at the depot". Stay here.', 'suspected_positive', 'unreported', 'hold', 'evidence'),
            ('I see Mara at the depot. I see Mara is not at the depot. Stay here.', 'conflicting', 'unreported', 'hold', 'evidence'),
            ('Niko reports Mara is not at the depot. What should we do?', 'suspected_negative', 'unreported', 'unclear', 'both'),
            ('If Mara is at the depot, wave. I do not know whether the west passage is blocked. Stay here.', 'unreported', 'unreported', 'hold', 'none'),
            ('I see Mara at the depot. Leave without Mara. Do not leave Mara behind.', 'known', 'unreported', 'unclear', 'goal'),
        ]
        for text, mara, west, policy, clarification in cases:
            with self.subTest(text=text):
                out = s.parse({'state': {'text': text}})
                self.assertEqual([out['interpretation'][k] for k in ['mara_at_depot','west_blocked','policy','clarification']], [mara,west,policy,clarification])
                self.assertIn('matched_claims', out)

class SimulationTests(unittest.TestCase):
    def test_world_truth_not_interpretation_drives_observable_consequences(self):
        import semantics_core as s
        self.assertTrue(hasattr(s, 'simulate'), 'simulator not implemented')
        world = dict(mara_at_depot=True, ash_in_east=True, west_blocked=False)
        solo = dict(mara_at_depot='unreported',ash_in_east='negated',west_blocked='known',policy='solo',clarification='none')
        run = s.simulate(s.controller(solo), world, 'solo')
        self.assertEqual([f['location'] for f in run['frames']], ['Yard','East'])
        self.assertEqual(run['outcome'], 'captured')
        self.assertFalse(run['goal_completed'])
        together = dict(solo, mara_at_depot='known',west_blocked='negated',policy='together')
        run = s.simulate(s.controller(together), world, 'together')
        self.assertEqual([f['location'] for f in run['frames']], ['Yard','Depot','West','Shelter'])
        self.assertTrue(run['frames'][-1]['companion'])
        self.assertTrue(run['goal_completed'])
        world['west_blocked'] = True
        self.assertEqual(s.simulate(s.controller(together),world,'together')['outcome'], 'blocked')
        world['west_blocked'] = False
        world['mara_at_depot'] = False
        self.assertFalse(s.simulate(s.controller(together),world,'together')['goal_completed'])

if __name__ == '__main__': unittest.main()
