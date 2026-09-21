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

if __name__ == '__main__': unittest.main()
