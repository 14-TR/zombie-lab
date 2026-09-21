"""Preregistered descriptive ZL-018 aggregation, independent of live client."""
from collections import defaultdict

METRICS=['exact','correctComponents','components','numericCoordinates','coordinateAbsoluteError','captureCorrect','unknown','missing']

def aggregate(rows):
    return {'n':len(rows),**{arm:{k:sum(int(r[arm][k]) for r in rows) for k in METRICS} for arm in ['model','baseline']},
            'evidenceTargetExact':sum(r['evidenceTargetExact'] for r in rows)}

def paired(pairs):
    differences=[int(a)-int(b) for a,b in pairs]
    return {'n':len(differences),'better':sum(d>0 for d in differences),'worse':sum(d<0 for d in differences),
            'same':sum(d==0 for d in differences),'net':sum(differences)}

def summarize(rows):
    lookup={(r['caseId'],r['law'],r['condition'],r['horizon']):r for r in rows}
    if len(lookup)!=len(rows):raise ValueError('Duplicate result cells')
    def groups(fields):
        sets=defaultdict(list)
        for row in rows:sets[tuple(row[f] for f in fields)].append(row)
        return [{**dict(zip(fields,key)),**aggregate(rs)} for key,rs in sorted(sets.items())]
    contrasts={}
    for a,b in [('supplied','observations'),('observations','neither'),('supplied','neither')]:
        pairs=[]
        for (case,law,condition,t),row in lookup.items():
            if condition==a:
                other=lookup[(case,law,b,t)]
                pairs.append((row['model']['exact'],other['model']['exact']))
        contrasts[a+'-minus-'+b]=paired(pairs)
    rule_pairs=[]
    for (case,law,condition,t),row in lookup.items():
        if law=='old_WSEN':rule_pairs.append((row['model']['exact'],lookup[(case,'old_NESW',condition,t)]['model']['exact']))
    return {'overall':aggregate(rows),'byConditionHorizonLaw':groups(['condition','horizon','law']),
            'byConditionHorizon':groups(['condition','horizon']),'byPanelConditionHorizon':groups(['panel','condition','horizon']),
            'pairedInformation':contrasts,'pairedRule':paired(rule_pairs),
            'interpretation':'Descriptive paired counts only; repeated arms/horizons share four configurations, not independent samples.'}
