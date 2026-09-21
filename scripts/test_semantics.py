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

if __name__ == '__main__': unittest.main()
