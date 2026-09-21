import importlib
import json
from pathlib import Path
import tempfile
import unittest

class BuildTests(unittest.TestCase):
    def test_offline_actual_evidence_collection_complete_and_hash_bound(self):
        self.assertTrue((Path(__file__).parent/'build_dynamics.py').exists(),'offline collector missing')
        b=importlib.import_module('build_dynamics')
        data=b.collect()
        self.assertEqual(len(data['requests']),24)
        self.assertEqual(len(data['rows']),48)
        self.assertEqual(data['summary']['overall']['n'],48)
        self.assertEqual(data['usage']['admissions'],24)
        self.assertEqual(data['usage']['responses'],24)
        self.assertEqual(data['integrity']['historicalFiles'],765)
        self.assertEqual(data['integrity']['independentTruthMatches'],8)
        self.assertEqual(data['usage']['failures'],0)
        self.assertTrue(data['usage']['estimatedUSD']<=.05)
        self.assertEqual(data['summary']['overall']['model']['missing'],0)
        for row in data['rows']:
            self.assertEqual(row['truth'] in row['baselinePossible'],True)
        request=data['requests'][0]
        missing=b.evaluate(request,None)
        self.assertEqual(len(missing),2)
        self.assertTrue(all(r['model']['missing']==7 and not r['model']['exact'] for r in missing))
        with self.assertRaises(ValueError):b.verify_raw(b'corrupt','0'*64)

    def test_export_contains_actual_data_csv_and_offline_html(self):
        b=importlib.import_module('build_dynamics')
        self.assertTrue(hasattr(b,'export'),'offline export missing')
        with tempfile.TemporaryDirectory() as tmp:
            receipt=b.export(Path(tmp))
            before=(Path(tmp)/'evidence/jev-dynamics/recording/q01.response.json').read_bytes()
            # Re-export must preserve read-only raw receipts, not chmod/overwrite them.
            b.export(Path(tmp))
            self.assertEqual(before,(Path(tmp)/'evidence/jev-dynamics/recording/q01.response.json').read_bytes())
            out=Path(tmp)
            data=json.loads((out/'dynamics.json').read_text())
            self.assertEqual(len(data['rows']),48)
            import csv,io
            rows=list(csv.DictReader(io.StringIO((out/'dynamics.csv').read_text())))
            self.assertEqual(len(rows),336)
            html=(out/'dynamics.html').read_text()
            self.assertIn("connect-src 'none'",html)
            self.assertNotIn('__DATA__',html)
            self.assertIn('Not requested at tick 2',html)
            self.assertEqual(receipt['stateRows'],48)
            from html.parser import HTMLParser
            class Links(HTMLParser):
                def handle_starttag(self,tag,attrs):
                    for k,v in attrs:
                        if k=='href':self.links.append(v)
            links=Links();links.links=[];links.feed(html)
            self.assertTrue(links.links)
            for link in links.links:self.assertTrue((out/link).is_file(),link)

if __name__=='__main__':unittest.main()
