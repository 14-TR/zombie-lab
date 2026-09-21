"""ZL-018 pure dynamics; no network, evaluator files, or hidden labels."""
import copy

DELTAS = {'N':(0,-1), 'E':(1,0), 'S':(0,1), 'W':(-1,0), 'stay':(0,0)}
RULES = {
 'old_NESW':'Each zombie independently moves one legal cardinal cell or stays to minimize Manhattan distance to the OLD human position. First ties N,E,S,W,stay.',
 'old_WSEN':'Each zombie independently moves one legal cardinal cell or stays to minimize Manhattan distance to the OLD human position. First ties W,S,E,N,stay.',
 'new_NESW':'Each zombie independently moves one legal cardinal cell or stays to minimize Manhattan distance to the human position AFTER this tick\'s prescribed human action. First ties N,E,S,W,stay.',
 'stationary':'Both zombies stay in their current positions on every tick.'
}

def contact(s):
    return any(sum(abs(a-b) for a,b in zip(s['H'],s[z])) <= 1 for z in ['Z1','Z2'])

def transition(s, action, rule, width, height):
    if rule not in RULES or action not in DELTAS:
        raise ValueError('Unknown rule/action')
    s=copy.deepcopy(s)
    if s['caught'] or contact(s):
        s['caught']=True
        return s
    dx,dy=DELTAS[action]
    human=[max(0,min(width-1,s['H'][0]+dx)),max(0,min(height-1,s['H'][1]+dy))]
    target=human if rule=='new_NESW' else s['H']
    order=['W','S','E','N','stay'] if rule=='old_WSEN' else list(DELTAS)
    result={'H':human,'caught':False}
    for agent in ['Z1','Z2']:
        if rule=='stationary':
            result[agent]=s[agent][:]
        else:
            candidates=[[s[agent][0]+DELTAS[a][0],s[agent][1]+DELTAS[a][1]] for a in order]
            candidates=[p for p in candidates if 0<=p[0]<width and 0<=p[1]<height]
            result[agent]=min(candidates,key=lambda p:abs(p[0]-target[0])+abs(p[1]-target[1]))
    result['caught']=contact(result)
    return result

def rollout(start,actions,rule,width,height):
    first=copy.deepcopy(start)
    first['caught']=bool(first['caught'] or contact(first))
    frames=[first]
    for a in actions:
        frames.append(transition(frames[-1],a,rule,width,height))
    return frames

SCAFFOLD = ('Coordinates [x,y], top-left origin; x east, y south. H follows fixed_actions, one per tick, '
            'N=[0,-1],E=[1,0],S=[0,1],W=[-1,0],stay=[0,0], clamped to board bounds. '
            'Z1/Z2 do not block each other. Human capture (caught) is Manhattan distance<=1 to either '
            'zombie initially or after a tick; diagonal adjacency alone does not capture. '
            'After capture ALL positions freeze for remaining ticks. The zombie law is one of '
            'candidate_laws and stays fixed during the episode. When active_rule is supplied use it; '
            'otherwise infer from observations if present. Without sufficient evidence, retain uncertainty. '
            'Predict future states; do not choose actions.')

def request(query, condition, active_rule=None, observations=None):
    if condition not in ['supplied','observations','neither']:
        raise ValueError('Unknown condition')
    state={'board':{'width':query['width'],'height':query['height']},'scaffold':SCAFFOLD,
           'candidate_laws':list(RULES.values()),'initial':copy.deepcopy(query['start']),
           'fixed_actions':query['actions'][:]}
    if condition=='supplied':
        if active_rule not in RULES.values(): raise ValueError('Active rule required')
        state['active_rule']=active_rule
    if condition=='observations':
        if not observations: raise ValueError('Observations required')
        state['observations']=copy.deepcopy(observations)
    questions={}
    for h in [1,3]:
        for agent in ['H','Z1','Z2']:
            for axis,limit in [('x',query['width']),('y',query['height'])]:
                questions['t%d_%s_%s'%(h,agent,axis)]={
                    'type':'choice','instructions':
                    'What is the %s coordinate of %s at tick %d, after executing the first %d fixed_actions from initial? '
                    'Independently apply the shared scaffold and the same zombie law on every intervening tick. '
                    'Use active_rule if supplied, else the observed transitions to identify a candidate law. '
                    'If evidence-consistent candidate laws give different values, choose unknown. No other question answer is available.'%(axis,agent,h,h),
                    'criteria':dict([(str(i),'Coordinate %d'%i) for i in range(limit)]+[('unknown','Not uniquely determined by the supplied evidence')])}
        questions['t%d_world_caught'%h]={'type':'choice','instructions':
            'Is the world caught flag true at tick %d after the first %d fixed_actions from initial? '
            'Apply all intervening ticks and absorbing capture. Use active_rule if supplied, otherwise '
            'infer the zombie law from observations. If evidence-consistent laws disagree choose unknown. '
            'No other question answer is available.'%(h,h),
            'criteria':{'yes':'Caught by this tick','no':'Not caught by this tick','unknown':'Not uniquely determined by the supplied evidence'}}
    return {'model':'jev-1.13.0','state':state,'questions':questions}

def components(state):
    out={a+'_'+axis:str(state[a][i]) for a in ['H','Z1','Z2'] for i,axis in enumerate(['x','y'])}
    out['world_caught']='yes' if state['caught'] else 'no'
    return out

def baseline(public):
    w,h=public['board']['width'],public['board']['height']
    hypotheses=[r for r,text in RULES.items() if 'active_rule' not in public or public['active_rule']==text]
    hypotheses=[r for r in hypotheses if all(transition(o['before'],o['action'],r,w,h)==o['after'] for o in public.get('observations',[]))]
    if not hypotheses: raise ValueError('No evidence-consistent hypothesis')
    frames={r:rollout(public['initial'],public['fixed_actions'],r,w,h) for r in hypotheses}
    predictions={}
    possible={}
    for t in [1,3]:
        alternatives=[components(frames[r][t]) for r in hypotheses]
        possible[str(t)]=alternatives
        predictions[str(t)]={k:next(iter(values)) if len(values)==1 else 'unknown' for k in alternatives[0]
                            for values in [{a[k] for a in alternatives}]}
    return {'hypotheses':hypotheses,'predictions':predictions,'possible':possible}

def group(query):
    s=query['start']
    return (query['width'],query['height'],tuple(s['H']),tuple(sorted([tuple(s['Z1']),tuple(s['Z2'])])))

def assert_disjoint(evaluation, examples):
    if {group(q) for q in evaluation} & {group(q) for q in examples}:
        raise ValueError('Configuration-group leakage, including swapped zombies')
