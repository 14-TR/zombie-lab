"""ZL020 offline scoring/export. No model calls; no fresh evaluation in PHASE1."""
import argparse
import csv
import io
import json
from pathlib import Path
from semantics_core import FACTS, OPTIONS, controller, valid
from semantic_gate import adapt, simulate
from semantic_gate_io import loads, decode, wire, request
from semantic_gate_parser import parse
from freeze_semantic_gate import ROOT, E, verify_source, verify_prepared, sha


def evaluate(prediction, gold, world):
    result=adapt(prediction); correct=controller(gold)
    target=simulate(correct,world,gold['policy'])
    pred=prediction if valid(prediction) else {}
    result.update(raw_exact=prediction==gold,components_correct=sum(pred.get(k)==gold[k] for k in OPTIONS),
        component_correct={k:pred.get(k)==gold[k] for k in OPTIONS},
        unsupported_fields=[k for k in FACTS if pred.get(k) in ('known','negated') and pred[k]!=gold[k]],
        suspected_promotions=sum(pred.get(k) in ('known','negated') and gold[k].startswith('suspected_') for k in FACTS),
        clarification_inconsistent=valid(prediction) and pred['clarification']!=result['required_clarification'],
        malformed_or_missing=not valid(prediction),gold_trace=target)
    for arm in ('raw','gated'):
        decision=result[arm+'_decision']; trace=simulate(decision,world,gold['policy'])
        match=trace==target; coverage=decision['action']!='ask'
        result[arm+'_trace']=trace
        result[arm+'_metrics']=dict(trace_match=match,coverage=coverage,useful_coverage=coverage and match,
            moved=decision['action']=='move',false_action=decision['action']=='move' and decision!=correct,
            goal_completed=trace['goal_completed'],outcome=trace['outcome'])
    return result


def record(case, target, req, body, receipt):
    prediction=None; error=None; response=None
    try:
        if body and (receipt or {}).get('error') is None:
            prediction=decode(body,req); response=loads(body)
        else: error='missing_or_failed_response'
    except (ValueError,TypeError): error='malformed_response'
    parsed=parse(req)
    return dict(id=case['id'],group=case.get('group',case['id']),stratum=case.get('stratum','unspecified'),text=case['text'],
        request=req,response=response,raw_response_utf8=body.decode('utf-8',errors='replace') if body else None,
        receipt=receipt,decode_error=error,gold=target,parser_explanation=parsed,
        jev=evaluate(prediction,target['interpretation'],target['world']),
        parser=evaluate(parsed['interpretation'],target['interpretation'],target['world']))


def summary(rows):
    result={}
    for name in ('jev','parser'):
        values=[r[name] for r in rows]
        result[name]=dict(n=len(rows),raw_exact=sum(x['raw_exact'] for x in values),
            components_correct={k:sum(x['component_correct'][k] for x in values) for k in OPTIONS},
            groups_exact=sum(all(r[name]['raw_exact'] for r in rows if r['group']==g) for g in {r['group'] for r in rows}),
            groups_total=len({r['group'] for r in rows}),gate_changed=sum(x['gate_changed'] for x in values),
            unsupported_assertions=sum(len(x['unsupported_fields']) for x in values),
            suspected_promotions=sum(x['suspected_promotions'] for x in values),
            clarification_inconsistent=sum(x['clarification_inconsistent'] for x in values),
            malformed_or_missing=sum(x['malformed_or_missing'] for x in values))
        from collections import Counter
        result[name]['confusions']={k:[dict(gold=a,prediction=b,n=n) for (a,b),n in sorted(Counter((r['gold']['interpretation'][k],(r[name]['raw_interpretation'] or {}).get(k,'missing')) for r in rows).items())] for k in OPTIONS}
        for arm in ('raw','gated'):
            result[name][arm]={k:sum(x[arm+'_metrics'][k] for x in values) for k in ('trace_match','coverage','useful_coverage','moved','false_action','goal_completed')}
            result[name][arm]['outcomes']=dict(Counter(x[arm+'_metrics']['outcome'] for x in values))
            result[name][arm]['actions']={a:sum(x[arm+'_decision']['action']==a for x in values) for a in ('ask','wait','move')}
    return result


def export(out, rows, metadata):
    out.mkdir(parents=True,exist_ok=False)
    result=dict(experiment='ZL020',metadata=metadata,summary=summary(rows),cases=rows)
    encoded=json.dumps(result,sort_keys=True,indent=2,allow_nan=False)
    (out/'recorded-cases.json').write_text(encoded+'\n')
    template=(ROOT/'scripts/semantic_gate.html').read_text()
    (out/'index.html').write_text(template.replace('__DATA__',encoded.replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')))
    buffer=io.StringIO(newline=''); writer=csv.writer(buffer)
    writer.writerow(['id','group','method','raw_exact','raw_clarification','required_clarification','gate_changed','arm','action','outcome','trace_match','false_action','goal_completed'])
    for row in rows:
        for name in ('jev','parser'):
            data=row[name]
            for arm in ('raw','gated'):
                m=data[arm+'_metrics']; writer.writerow([row['id'],row['group'],name,data['raw_exact'],data['raw_clarification'],data['required_clarification'],data['gate_changed'],arm,data[arm+'_decision']['action'],m['outcome'],m['trace_match'],m['false_action'],m['goal_completed']])
    (out/'metrics.csv').write_text(buffer.getvalue())
    (out/'ZL-020-protocol.md').write_bytes((ROOT/'experiments/ZL-020-protocol.md').read_bytes())
    return result


def collect(inputs, gold):
    commit=verify_source(); prepared=verify_prepared()
    if [c['id'] for c in inputs]!=[r['id'] for r in prepared['requests']] or set(gold)!= {c['id'] for c in inputs}: raise ValueError('case/gold admission set mismatch')
    record_dir=E/'recording'; rows=[]
    ledger=[loads(line) for line in (record_dir/'admission.jsonl').read_bytes().splitlines()] if (record_dir/'admission.jsonl').exists() else []
    if [r['id'] for r in ledger]!=[r['id'] for r in prepared['requests'][:len(ledger)]] or len(ledger)>24: raise ValueError('ledger mismatch')
    for case in inputs:
        ident=case['id']; raw=(E/'prepared/requests'/(ident+'.json')).read_bytes(); req=loads(raw)
        if req['state']['text']!=case['text']: raise ValueError('text/request mismatch')
        body_path=record_dir/(ident+'.response.raw'); receipt_path=record_dir/(ident+'.receipt.json')
        body=body_path.read_bytes() if body_path.exists() else b''
        receipt=loads(receipt_path.read_bytes()) if receipt_path.exists() else None
        if receipt:
            if sha(body)!=receipt['response_sha256'] or sha(raw)!=receipt['request_sha256'] or len(body)!=receipt['response_bytes']: raise ValueError('receipt mismatch')
            admitted=next((x for x in ledger if x['id']==ident),None)
            if not admitted or admitted['request_sha256']!=sha(raw): raise ValueError('missing admission')
        rows.append(record(case,gold[ident],req,body,receipt))
    return rows,dict(source_freeze_commit=commit,scope='independently authored bounded scene; paired paraphrases correlated',review='pending; not release approval')


def main():
    cli=argparse.ArgumentParser(description=__doc__); cli.add_argument('--phase2-authorized',action='store_true')
    cli.add_argument('--inputs',type=Path,required=True); cli.add_argument('--gold',type=Path,required=True); cli.add_argument('--out',type=Path,required=True)
    args=cli.parse_args()
    if not args.phase2_authorized: raise ValueError('PHASE2 required before new heldout read')
    rows,metadata=collect(loads(args.inputs.read_bytes()),loads(args.gold.read_bytes()))
    result=export(args.out,rows,metadata); print(json.dumps(result['summary'],indent=2))

if __name__=='__main__': main()
