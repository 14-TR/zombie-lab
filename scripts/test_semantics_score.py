import unittest
from pathlib import Path

class ScoreTests(unittest.TestCase):
    def test_counts_include_failures_and_unsafe_promotions(self):
        self.assertTrue(Path(__file__).with_name('semantics_score.py').exists(), 'evaluation not implemented')
        import semantics_score as s
        gold=dict(mara_at_depot='unreported',ash_in_east='suspected_negative',west_blocked='known',policy='solo',clarification='evidence')
        world=dict(mara_at_depot=False,ash_in_east=True,west_blocked=True)
        pred=dict(gold,ash_in_east='negated',clarification='none')
        row=s.evaluate(pred,gold,world)
        self.assertEqual(row['components_correct'],3)
        self.assertFalse(row['exact'])
        self.assertEqual(row['unsupported_assertions'],1)
        self.assertEqual(row['suspected_promotions'],1)
        self.assertTrue(row['false_action'])
        self.assertEqual(row['trace']['outcome'],'captured')
        missing=s.evaluate(None,gold,world)
        self.assertEqual(missing['components_correct'],0)
        self.assertTrue(missing['abstain'])
        exact=s.evaluate(gold,gold,world)
        self.assertTrue(exact['exact'])
        summary=s.aggregate([dict(id='a',group='x',stratum='ambiguous_conflict',metrics=row),dict(id='b',group='x',stratum='ambiguous_conflict',metrics=missing)])
        self.assertEqual(summary['all']['n'],2)
        self.assertEqual(summary['all']['components_total'],10)
        self.assertEqual(summary['all']['groups_exact'],0)
        self.assertEqual(summary['all']['groups_total'],1)
        self.assertEqual(summary['all']['false_actions'],1)
        self.assertEqual(summary['all']['movement_n'],1)

if __name__=='__main__': unittest.main()
