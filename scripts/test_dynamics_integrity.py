"""Post-inference offline integrity checks; temporary copies only."""
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
import build_dynamics as build

class IntegrityTests(unittest.TestCase):
    def test_corrupted_copied_response_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            copied=Path(tmp)/'evidence'
            shutil.copytree(build.E,copied)
            file=copied/'recording/q01.response.json';file.chmod(0o600);file.write_bytes(b'{"tampered":true}')
            with patch.object(build,'E',copied):
                with self.assertRaisesRegex(ValueError,'Immutable evidence hash mismatch'):build.collect()

    def test_existing_different_export_receipt_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            out=Path(tmp);build.export(out)
            file=out/'evidence/jev-dynamics/recording/q01.response.json';file.chmod(0o600);file.write_bytes(b'corrupt-copy')
            with self.assertRaisesRegex(ValueError,'refuse replacement'):build.export(out)
            self.assertEqual(file.read_bytes(),b'corrupt-copy')

    def test_canonical_hidden_inputs_and_candidate_coverage(self):
        data=build.collect()
        for item in data['requests']:
            req=item['request'];s=req['state'];self.assertEqual(set(s['initial']),{'H','Z1','Z2','caught'})
            self.assertNotIn('law',s);self.assertNotIn('caseId',s);self.assertNotIn('panel',s)
            if item['condition']!='supplied':self.assertNotIn('active_rule',s)
            if item['condition']!='observations':self.assertNotIn('observations',s)
            for key,q in req['questions'].items():
                expected={'yes','no','unknown'} if key.endswith('caught') else {str(i) for i in range(12 if key.endswith('_x') else 9)}|{'unknown'}
                self.assertEqual(set(q['criteria']),expected)
            for frame in item['truth']['frames']:
                self.assertTrue(any(frame[a][0]>=10 or frame[a][1]>=7 for a in ['H','Z1','Z2']))
        first={r['caseId']:r['request'] for r in data['requests'] if r['condition']=='neither' and r['law']=='old_NESW'}
        second={r['caseId']:r['request'] for r in data['requests'] if r['condition']=='neither' and r['law']=='old_WSEN'}
        self.assertEqual(first,second)

if __name__=='__main__':unittest.main()
