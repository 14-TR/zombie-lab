import json
import unittest
from pathlib import Path
try:
    import semantic_gate_parser as parser
except ImportError:
    parser = None
ROOT = Path(__file__).resolve().parents[1]

class ParserTests(unittest.TestCase):
    def test_allowed_development_grammar(self):
        self.assertIsNotNone(parser, 'transparent grammar missing')
        rows = json.loads((ROOT/'evidence/jev-semantic-gate/development.json').read_text())
        for row in rows:
            with self.subTest(group=row['group']):
                out = parser.parse({'state': {'text': row['text']}})
                self.assertEqual(out['interpretation'], row['interpretation'])
                self.assertIn('matched_claims', out)
                self.assertIn('skipped_clauses', out)
        self.assertEqual(len(rows), 18)

if __name__ == '__main__': unittest.main()
