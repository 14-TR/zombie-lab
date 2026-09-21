"""ZL-018 tests use development boards, never paid answers."""
import copy
import importlib
import json
from pathlib import Path
import tempfile
import unittest

class DynamicsTests(unittest.TestCase):
    def test_fixed_actions_changed_rules_and_absorbing_multistep(self):
        self.assertTrue((Path(__file__).parent/'dynamics.py').exists(), 'prediction engine missing')
        d = importlib.import_module('dynamics')
        start = {'H':[3,3], 'Z1':[1,1], 'Z2':[0,4], 'caught':False}
        # Independent hand-specified old-state Manhattan tie witnesses on5x5.
        self.assertEqual(d.rollout(start,['N','W','stay'],'old_NESW',5,5)[1],
                         {'H':[3,2], 'Z1':[2,1], 'Z2':[0,3], 'caught':False})
        self.assertEqual(d.rollout(start,['N','W','stay'],'old_WSEN',5,5)[1],
                         {'H':[3,2], 'Z1':[1,2], 'Z2':[1,4], 'caught':False})
        got=d.rollout(start,['N','W','stay'],'old_NESW',5,5)
        self.assertEqual(got[2], {'H':[2,2], 'Z1':[3,1], 'Z2':[0,2], 'caught':False})
        self.assertEqual(got[3], {'H':[2,2], 'Z1':[3,2], 'Z2':[1,2], 'caught':True})
        self.assertEqual(d.rollout(got[3],['E']*3,'old_WSEN',5,5), [got[3]]*4)

class PromptTests(unittest.TestCase):
    def test_no_oracle_leak_and_exhaustive_schema(self):
        d=importlib.import_module('dynamics')
        self.assertTrue(hasattr(d,'request'), 'request builder missing')
        query={'width':5,'height':5,'start':{'H':[3,3],'Z1':[1,1],'Z2':[0,4],'caught':False},'actions':['N','W','stay']}
        a=d.request(query,'neither')
        b=d.request(dict(query,truth='SECRET',variant='old_WSEN',split='eval',id='A'), 'neither')
        self.assertEqual(a,b)
        self.assertEqual(len(a['questions']),14)
        for k,q in a['questions'].items():
            self.assertIn('tick '+k.split('_')[0][1:],q['instructions'])
            self.assertIn(k.split('_')[1],q['instructions'])
            self.assertEqual(set(q['criteria']), {'yes','no','unknown'} if k.endswith('caught') else {'0','1','2','3','4','unknown'})
        self.assertNotIn('active_rule',a['state'])
        self.assertNotIn('observations',a['state'])
        query['truth']={'H':[0,0]}
        self.assertEqual(a,d.request(query,'neither'))

    def test_family_identification_and_ambiguity_same_input(self):
        d=importlib.import_module('dynamics')
        self.assertTrue(hasattr(d,'baseline'), 'same-input baseline missing')
        q={'width':5,'height':5,'start':{'H':[3,3],'Z1':[1,1],'Z2':[0,4],'caught':False},'actions':['N','W','stay']}
        no=d.baseline(d.request(q,'neither')['state'])
        self.assertEqual(no['hypotheses'],list(d.RULES))
        self.assertIn('unknown',no['predictions']['1'].values())
        known=d.baseline(d.request(q,'supplied',active_rule=d.RULES['old_WSEN'])['state'])
        self.assertEqual(known['hypotheses'],['old_WSEN'])
        self.assertNotIn('unknown',known['predictions']['3'].values())
        obs=[{'before':q['start'],'action':'N','after':{'H':[3,2],'Z1':[1,2],'Z2':[1,4],'caught':False}}]
        inferred=d.baseline(d.request(q,'observations',observations=obs)['state'])
        self.assertEqual(inferred['hypotheses'],['old_WSEN'])
        self.assertEqual(inferred['predictions'],known['predictions'])

    def test_group_swapping_invariance_and_split_rejection(self):
        d=importlib.import_module('dynamics')
        self.assertTrue(hasattr(d,'assert_disjoint'), 'split checker missing')
        q={'width':5,'height':5,'start':{'H':[3,3],'Z1':[1,1],'Z2':[0,4],'caught':False},'actions':['N','W','stay']}
        swapped=copy.deepcopy(q);swapped['start']['Z1'],swapped['start']['Z2']=swapped['start']['Z2'],swapped['start']['Z1']
        self.assertEqual(d.group(q),d.group(swapped))
        with self.assertRaises(ValueError): d.assert_disjoint([q],[swapped])
        q2=copy.deepcopy(q);q2['width']=6
        d.assert_disjoint([q],[q2])

class ReferenceTests(unittest.TestCase):
    def test_independent_reference_and_boundary(self):
        self.assertTrue((Path(__file__).parent/'dynamics_reference.py').exists(), 'independent reference missing')
        ref=importlib.import_module('dynamics_reference')
        d=importlib.import_module('dynamics')
        start={'H':[4,4],'Z1':[2,4],'Z2':[0,0],'caught':False}
        self.assertEqual(ref.step(start,'E','old_NESW',5,5), {'H':[4,4],'Z1':[3,4],'Z2':[1,0],'caught':True})
        import itertools
        cells=list(itertools.product(range(3),repeat=2))
        count=0
        for positions in itertools.product(cells,repeat=3):
            s=dict(zip(['H','Z1','Z2'],map(list,positions)));s['caught']=False
            for rule in d.RULES:
                for action in d.DELTAS:
                    self.assertEqual(d.transition(s,action,rule,3,3),ref.step(s,action,rule,3,3))
                    count+=1
        self.assertEqual(count,14580)

class ScoringTests(unittest.TestCase):
    def test_documented_rounded_probabilities_are_not_fake_failures(self):
        s=importlib.import_module('dynamics_score')
        options={str(i):str(i) for i in range(12)};options['unknown']='uncertain'
        req={'questions':{'t1_H_x':{'criteria':options}}}
        body={'model':'jev-1.13.0','answers':{'t1_H_x':{'type':'choice','choice':'0','confidence':0.0,
                'probabilities':{k:(0 if k=='unknown' else .08) for k in options}}}}
        self.assertEqual(s.parse_response(req,body)['1']['H_x'],'0')

    def test_strict_parse_missing_out_of_set_and_component_errors(self):
        self.assertTrue((Path(__file__).parent/'dynamics_score.py').exists(), 'prediction scorer missing')
        s=importlib.import_module('dynamics_score');d=importlib.import_module('dynamics')
        q={'width':5,'height':5,'start':{'H':[3,3],'Z1':[1,1],'Z2':[0,4],'caught':False},'actions':['N','W','stay']}
        req=d.request(q,'supplied',active_rule=d.RULES['old_NESW'])
        truth=d.baseline(req['state'])['predictions']
        body={'model':'jev-1.13.0','answers':{}}
        for k,question in req['questions'].items():
            t,component=k.split('_',1);value=truth[t[1:]][component]
            body['answers'][k]={'type':'choice','choice':value,'confidence':1.0,
                                'probabilities':{x:float(x==value) for x in question['criteria']}}
        self.assertEqual(s.parse_response(req,body),truth)
        metric=s.score_state(truth['1'],truth['1'])
        self.assertTrue(metric['exact']);self.assertEqual(metric['correctComponents'],7)
        self.assertEqual(s.score_state({},truth['1'])['missing'],7)
        self.assertFalse(s.score_state({'H_x':'unknown'},truth['1'])['exact'])
        for broken in [None,{},dict(body,model='wrong')]:
            with self.assertRaises(ValueError): s.parse_response(req,broken)
        for field,value in [('choice','999'),('confidence',float('nan')),('probabilities',{})]:
            bad=copy.deepcopy(body);bad['answers']['t1_H_x'][field]=value
            with self.assertRaises(ValueError): s.parse_response(req,bad)
        bad=copy.deepcopy(body);del bad['answers']['t3_Z1_x']
        with self.assertRaises(ValueError): s.parse_response(req,bad)

class FreezeTests(unittest.TestCase):
    def test_legacy_reference_accepts_literal_rejects_corruption(self):
        script=Path(__file__).parent/'check-dynamics-legacy.cjs'
        self.assertTrue(script.exists(), 'legacy parity CLI missing')
        import subprocess
        rows=[{'before':{'H':[3,3],'Z1':[1,1],'Z2':[0,4],'caught':False},'action':'N','width':5,'height':5,
               'after':{'H':[3,2],'Z1':[2,1],'Z2':[0,3],'caught':False}}]
        run=lambda:subprocess.run(['node',str(script)],input=json.dumps(rows),capture_output=True,text=True)
        self.assertEqual(run().returncode,0)
        rows[0]['after']['Z1']=[1,2]
        self.assertNotEqual(run().returncode,0)

    def test_bundle_freshness_identifiability_and_request_split_invariance(self):
        self.assertTrue((Path(__file__).parent/'freeze_dynamics.py').exists(), 'freeze builder missing')
        f=importlib.import_module('freeze_dynamics')
        config=json.loads((Path(__file__).parent.parent/'evidence/jev-dynamics/inputs.json').read_text())
        bundle=f.bundle(config)
        self.assertEqual(len(bundle['requests']),24)
        self.assertEqual(len(bundle['truth']),8)
        for row in bundle['requests']:
            request=row['request'];text=json.dumps(request)
            self.assertNotIn('old_NESW',text);self.assertNotIn('old_WSEN',text)
            self.assertNotIn('identifying',text);self.assertNotIn('ambiguous',text)
            self.assertNotIn('truth',text);self.assertNotIn('caseId',text)
            inferred=importlib.import_module('dynamics').baseline(request['state'])
            if row['condition']=='observations':
                self.assertEqual(len(inferred['hypotheses']),1 if row['panel']=='identifying' else 3)
        copy_config=copy.deepcopy(config)
        copy_config['cases'].reverse()
        alternate=f.bundle(copy_config)
        by=lambda rows:{(r['caseId'],r['law'],r['condition']):r['request'] for r in rows}
        self.assertEqual(by(bundle['requests']),by(alternate['requests']))
        self.assertEqual(bundle['independentCheck']['valid'],True)
        self.assertEqual(bundle['splitCheck']['overlaps'],0)
        bad=copy.deepcopy(config);bad['examplePanels']['identifying'][0]['before']=bad['cases'][0]['start']
        with self.assertRaises(ValueError):f.bundle(bad)
        bad=copy.deepcopy(config);bad['cases'][0]['start']['H']=[5,5];bad['cases'][0]['start']['Z2']=[0,6]
        with self.assertRaises(ValueError):f.bundle(bad)

if __name__ == '__main__': unittest.main()
