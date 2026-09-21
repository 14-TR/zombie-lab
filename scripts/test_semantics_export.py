"""Offline post-inference release gates; never calls the paid endpoint."""
import unittest,json,tempfile,shutil
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]

class ExportTests(unittest.TestCase):
    def test_real_collection_offline_export_and_corruption(self):
        self.assertTrue(Path(__file__).with_name('build_semantics.py').exists(),'offline collector/export not implemented')
        import build_semantics as b
        with patch('socket.socket',side_effect=AssertionError('offline build attempted network')):
            result=b.collect()
            self.assertEqual(len(result['cases']),20)
            self.assertEqual(result['summary']['jev']['all']['exact'],19)
            self.assertEqual(result['summary']['parser']['all']['exact'],10)
            self.assertEqual(result['summary']['jev']['all']['false_actions'],1)
            self.assertEqual(result['comparator']['status'],'pending')
            with tempfile.TemporaryDirectory() as d:
                b.export(Path(d),result)
                html=(Path(d)/'semantics.html').read_text()
                self.assertIn('id="case-select"',html)
                self.assertIn('id="tick"',html)
                self.assertIn('id="play"',html)
                self.assertNotIn('<script src="http',html)
                self.assertEqual(json.loads((Path(d)/'semantics.json').read_text()),result)
                self.assertEqual(len((Path(d)/'semantics.csv').read_text().splitlines()),61)
                self.assertIn('ash_in_east',(Path(d)/'semantics.csv').read_text().splitlines()[0])
                self.assertEqual((Path(d)/'ZL-019-results.md').read_bytes(),(ROOT/'experiments/ZL-019-results.md').read_bytes())
                b.export(Path(d),result) # read-only copied evidence must not be overwritten
                p=Path(d)/'evidence/recording/s01a.response.raw';p.chmod(0o600);p.write_bytes(b'corruption')
                with self.assertRaises(ValueError): b.export(Path(d),result)
        with tempfile.TemporaryDirectory() as d:
            copied=Path(d)/'evidence';shutil.copytree(b.E,copied)
            p=copied/'recording/s01a.response.raw';p.chmod(0o600);p.write_bytes(b'{}')
            with patch.object(b,'E',copied):
                with self.assertRaises(ValueError):b.collect()

if __name__=='__main__':unittest.main()
