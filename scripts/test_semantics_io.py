import unittest, json, copy
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'evidence/jev-semantics/data'

class IOTests(unittest.TestCase):
    def test_request_whitelist_and_strict_decode(self):
        self.assertTrue(Path(__file__).with_name('semantics_io.py').exists(), 'request/response boundary not implemented')
        import semantics_io as io
        spec = json.loads((DATA/'spec.json').read_text())
        dev = json.loads((DATA/'development.json').read_text())
        case = dict(text='I see Ash in the east passage. Stay here.',id='secret-id',gold='LEAK',world='LEAK',group='LEAK',stratum='LEAK')
        req = io.request(case, spec, dev)
        self.assertEqual(set(req), {'model','state','questions'})
        self.assertEqual(set(req['state']), {'text','scene_rules','development_examples'})
        self.assertNotIn('LEAK', json.dumps(req))
        self.assertNotIn('secret-id',json.dumps(req))
        pred = {k: next(iter(v['criteria'])) for k,v in req['questions'].items()}
        good = {'model':'jev-1.13.0','answers':{k:{'type':'choice','choice':x,'confidence':1.0,'probabilities':{a:float(a==x) for a in req['questions'][k]['criteria']}} for k,x in pred.items()},'usage':{'input_tokens':25,'output_tokens':2}}
        self.assertEqual(io.decode(json.dumps(good).encode(), req),pred)
        mutations = []
        bad=copy.deepcopy(good); del bad['answers']['policy']; mutations.append(bad)
        bad=copy.deepcopy(good); bad['answers']['policy']['choice']='escape'; mutations.append(bad)
        bad=copy.deepcopy(good); bad['answers']['policy']['probabilities']['solo']=float('nan'); mutations.append(bad)
        bad=copy.deepcopy(good); bad['model']='jev-latest'; mutations.append(bad)
        bad=copy.deepcopy(good); bad['answers']['policy']['confidence']=True; mutations.append(bad)
        bad=copy.deepcopy(good); bad['answers']['policy']['probabilities']={}; mutations.append(bad)
        for bad in mutations:
            with self.assertRaises(ValueError): io.decode(json.dumps(bad).encode(),req)
        for raw in (b'not json',b'{}',b'null',b'[]'):
            with self.assertRaises(ValueError): io.decode(raw,req)

if __name__=='__main__': unittest.main()
