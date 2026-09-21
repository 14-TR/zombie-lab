"""Portable package must retain original bytes and reject corruption."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class PackageTests(unittest.TestCase):
    def test_package_keeps_original_export_and_rejects_mutation(self):
        self.assertIsNotNone(importlib.util.find_spec('package_semantic_gate'), 'portable diagnostic packager required')
        from package_semantic_gate import package, verify
        from build_semantic_gate import collect, export
        e = ROOT/'evidence/jev-semantic-gate'
        rows, metadata = collect(json.loads((e/'authoring/inputs.json').read_bytes()), json.loads((e/'authoring/gold.json').read_bytes()))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            frozen, out = root/'frozen', root/'package'
            export(frozen, rows, metadata)
            package(frozen, out)
            self.assertEqual((frozen/'index.html').read_bytes(), (out/'frozen/index.html').read_bytes())
            self.assertEqual((frozen/'recorded-cases.json').read_bytes(), (out/'recorded-cases.json').read_bytes())
            self.assertEqual((ROOT/'scripts/semantic_gate.py').read_bytes(), (out/'source/scripts/semantic_gate.py').read_bytes())
            receipt = verify(out)
            self.assertTrue(receipt['passed'])
            self.assertEqual(receipt['replayed_cases'], 24)
            self.assertGreater(receipt['git_inclusions_verified'], 100)
            (out/'recorded-cases.json').write_bytes(b'{}\n')
            with self.assertRaises(ValueError):
                verify(out)
            with self.assertRaises(FileExistsError):
                package(frozen, out)


if __name__ == '__main__':
    unittest.main()
