import importlib
from pathlib import Path
import unittest

class ReportTests(unittest.TestCase):
    def test_aggregate_descriptive_pairs_and_missing_failures(self):
        self.assertTrue((Path(__file__).parent/'dynamics_report.py').exists(),'report aggregation missing')
        r=importlib.import_module('dynamics_report')
        rows=[]
        for law in ['old_NESW','old_WSEN']:
            for condition in ['neither','observations','supplied']:
                for t in [1,3]:
                    correct=condition=='supplied'
                    rows.append({'caseId':'fixture','law':law,'condition':condition,'horizon':t,'panel':'identifying',
                                 'model':{'exact':correct,'correctComponents':7*int(correct),'components':7,
                                 'numericCoordinates':6*int(correct),'coordinateAbsoluteError':0,'captureCorrect':correct,
                                 'unknown':0,'missing':7*int(not correct)},
                                 'baseline':{'exact':correct,'correctComponents':7*int(correct),'components':7,
                                 'numericCoordinates':6*int(correct),'coordinateAbsoluteError':0,'captureCorrect':correct,
                                 'unknown':7*int(not correct),'missing':0},'evidenceTargetExact':correct})
        result=r.summarize(rows)
        self.assertEqual(result['overall']['n'],12)
        self.assertEqual(result['overall']['model']['exact'],4)
        self.assertEqual(result['overall']['model']['missing'],56)
        self.assertEqual(result['overall']['baseline']['unknown'],56)
        self.assertEqual(len(result['byConditionHorizonLaw']),12)
        pair=result['pairedInformation']['supplied-minus-neither']
        self.assertEqual(pair,{'n':4,'better':4,'worse':0,'same':0,'net':4})
        self.assertEqual(result['pairedRule']['n'],6)
        self.assertEqual(result['pairedRule']['net'],0)
        with self.assertRaises(ValueError):r.summarize(rows+[rows[0]])

if __name__=='__main__':unittest.main()
