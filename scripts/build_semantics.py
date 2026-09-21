"""ZL019 offline collector/export. Frozen scoring code is never edited here."""
import argparse
import csv
import io
import json
from pathlib import Path
import resource
import statistics
import time
from collections import Counter
from freeze_semantics import ROOT, REL, sha, git, verify, verify_files
from semantics_core import OPTIONS, FACTS, assertions, parse, controller
from semantics_io import decode, request, wire
from semantics_score import evaluate, aggregate

E=ROOT/REL
TEMPLATE=ROOT/'scripts/semantics.html'


def collect():
    manifest=verify(ROOT)
    record=E/'recording'; hashes=json.loads((record/'sha256.json').read_text())
    verify_files(record,hashes)
    if {p.name for p in record.iterdir() if p.is_file()}!=set(hashes)|{'sha256.json'}: raise ValueError('Unexpected recording files')
    receipt_rel=REL+'/recording/sha256.json'
    receipt_commit=git(ROOT,'log','--diff-filter=A','--format=%H','-1','--',receipt_rel).decode().strip()
    if git(ROOT,'show',receipt_commit+':'+receipt_rel)!=(record/'sha256.json').read_bytes(): raise ValueError('Recording manifest not committed')
    run=json.loads((record/'run.json').read_text()); complete=json.loads((record/'complete.json').read_text())
    if run['metadata']['freeze_commit']!=manifest['freeze_commit']: raise ValueError('Pre-inference source identity mismatch')
    ledger=[json.loads(line) for line in (record/'admission.jsonl').read_text().splitlines()]
    if len(ledger)!=complete['admissions'] or len(ledger)>24 or [x['sequence'] for x in ledger]!=list(range(1,len(ledger)+1)): raise ValueError('Admission totals mismatch')
    if [x['id'] for x in ledger]!=[x['id'] for x in manifest['requests'][:len(ledger)]]: raise ValueError('Admission set mismatch')
    labels=json.loads((E/'data/test-gold.json').read_text()); cases=json.loads((E/'data/test-inputs.json').read_text()); spec=json.loads((E/'data/spec.json').read_text()); dev=json.loads((E/'data/development.json').read_text())
    rows=[]; usage_in=usage_out=0; latencies=[]; parser_ns=[]; schema_errors=[]
    admitted={a['id']:a for a in ledger}
    for case in cases:
        ident=case['id']; target=labels[ident]
        req=json.loads((E/'frozen/requests'/(ident+'.request.json')).read_text())
        if wire(req)!=wire(request(case,spec,dev)): raise ValueError('Non-whitelisted input')
        before=time.perf_counter_ns(); parser_output=parse(req); parser_ns.append(time.perf_counter_ns()-before)
        if parser_output!=json.loads((E/'frozen/parser'/(ident+'.json')).read_text()): raise ValueError('Parser changed after development freeze')
        if controller(target['interpretation'])!=target['expected_decision']: raise ValueError('Authored control decision mismatch')
        raw_response=None;pred=None;receipt=None;schema_error=None
        if ident in admitted:
            raw_req=(record/(ident+'.request.json')).read_bytes()
            if raw_req!=wire(req) or sha(raw_req)!=admitted[ident]['request_sha256']: raise ValueError('Request admission mismatch')
            receipt=json.loads((record/(ident+'.receipt.json')).read_text()); latencies.append(receipt['latency_ms'])
            body=(record/(ident+'.response.raw')).read_bytes() if (record/(ident+'.response.raw')).exists() else b''
            if sha(body)!=receipt['response_sha256'] or len(body)!=receipt['response_bytes']: raise ValueError('Response receipt mismatch')
            try:
                pred=decode(body,req) if receipt['error'] is None else None
                raw_response=json.loads(body)
                usage=raw_response.get('usage',{})
                usage_in+=usage.get('input_tokens',0); usage_out+=usage.get('output_tokens',0)
            except (ValueError,TypeError) as error:
                schema_error=type(error).__name__;schema_errors.append({'id':ident,'error':schema_error})
        methods={}
        for name,value in [('gold',target['interpretation']),('parser',parser_output['interpretation']),('jev',pred)]:
            methods[name]={'interpretation':value,'assertions':assertions(value) if value else None,'metrics':evaluate(value,target['interpretation'],target['world'])}
        rows.append({**case,'annotation':target['annotation'],'hidden_world':target['world'],'request':req,'response':raw_response,'receipt':receipt,'schema_error':schema_error,'parser_raw':parser_output,'methods':methods})
    summary={name:aggregate([dict(id=r['id'],group=r['group'],stratum=r['stratum'],metrics=r['methods'][name]['metrics']) for r in rows]) for name in ('gold','parser','jev')}
    components={}
    for method in ('gold','parser','jev'):
        confusion={key:Counter() for key in OPTIONS};tp=fp=fn=verified=0
        for row in rows:
            gold=row['methods']['gold']['interpretation'];pred=row['methods'][method]['interpretation'] or {}
            for key in OPTIONS: confusion[key][(gold[key],pred.get(key,'missing'))]+=1
            for key in FACTS:
                truth=gold[key]=='conflicting';predicted=pred.get(key)=='conflicting'
                tp+=int(truth and predicted);fp+=int(not truth and predicted);fn+=int(truth and not predicted)
                verified+=int(pred.get(key) in ('known','negated'))
        components[method]={'confusions':{k:[{'gold':a,'prediction':b,'n':n} for (a,b),n in sorted(count.items())] for k,count in confusion.items()},'conflict_detection':dict(tp=tp,fp=fp,fn=fn),'verified_assertions_n':verified}
    provenance_files=['scripts/build_semantics.py','scripts/semantics.html']
    source_commit=git(ROOT,'log','-1','--format=%H','--',*provenance_files).decode().strip()
    source_hashes={p:sha((ROOT/p).read_bytes()) for p in provenance_files if (ROOT/p).exists()}
    dirty=any(not source_commit or git(ROOT,'show',source_commit+':'+p)!= (ROOT/p).read_bytes() for p in source_hashes) if source_commit else True
    return dict(experiment='ZL019',freeze_commit=manifest['freeze_commit'],recording_commit=receipt_commit,artifact_source_commit=source_commit or None,artifact_source_dirty=dirty,artifact_source_hashes=source_hashes,
                scope='Authored purposive pilot:20 texts in10 scenario groups; fresh relative to project/development only, not pretrained holdout or representative sample. Paired paraphrases are not independent.',
                summary=summary,components=components,cases=rows,comparator={'status':'pending','scope':'Parent-owned blind other-model agent-assisted comparison; different harness/latency scope, not matched API timing.'},
                review={'independent':'pending','publication':'not authorized; local only'},
                run={**run,**complete,'input_tokens':usage_in,'output_tokens':usage_out,'estimated_usage_cost_usd':usage_in*0.042/1e6,'cost_is_invoice':False,'schema_errors':schema_errors,
                     'latency_ms':{'n':len(latencies),'min':min(latencies) if latencies else None,'median':statistics.median(latencies) if latencies else None,'mean':statistics.mean(latencies) if latencies else None,'max':max(latencies) if latencies else None,'scope':'Sequential fresh HTTPS request client/network-inclusive wall, no retries or warmups; not server-only.'},
                     'request_body_bytes':sum(x['wire_bytes'] for x in ledger),'response_body_bytes':sum(r['receipt']['response_bytes'] for r in rows if r['receipt']),
                     'parser_timing_scope':'Offline local parse only; request/decode/network and simulator excluded. Not directly matched API latency.'})


def copy_preserving(source,target):
    for path in source.rglob('*'):
        if not path.is_file(): continue
        destination=target/path.relative_to(source); raw=path.read_bytes()
        if destination.exists():
            if destination.read_bytes()!=raw: raise ValueError('Refuse replacement of differing copied evidence: '+str(destination))
        else:
            destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(raw)


def export(out,result=None):
    result=collect() if result is None else result
    out.mkdir(parents=True,exist_ok=True)
    copy_preserving(E/'recording',out/'evidence/recording')
    copy_preserving(E/'frozen',out/'evidence/frozen')
    copy_preserving(E/'sources',out/'evidence/sources')
    for name in ('ZL-019-protocol.md','ZL-019-results.md'):
        (out/name).write_bytes((ROOT/'experiments'/name).read_bytes())
    encoded=json.dumps(result,sort_keys=True,indent=2,allow_nan=False)
    (out/'semantics.json').write_text(encoded+'\n')
    buffer=io.StringIO(newline='');fields=['id','group','stratum','method','exact','components_correct','unsupported_assertions','suspected_promotions','abstain','coverage','moved','false_action','trace_match','outcome','goal_completed']
    fields += list(OPTIONS) + ['gold_'+k for k in OPTIONS]
    writer=csv.DictWriter(buffer,fieldnames=fields);writer.writeheader()
    for case in result['cases']:
        for method,data in case['methods'].items():
            m=data['metrics'];row={k:m[k] for k in fields if k in m};row.update(id=case['id'],group=case['group'],stratum=case['stratum'],method=method,outcome=m['trace']['outcome'],goal_completed=m['trace']['goal_completed'])
            row.update(data['interpretation'] or {});row.update({'gold_'+k:v for k,v in case['methods']['gold']['interpretation'].items()});writer.writerow(row)
    (out/'semantics.csv').write_text(buffer.getvalue())
    (out/'semantics.html').write_text(TEMPLATE.read_text().replace('__FROZEN_DATA__',encoded.replace('</','<\\/')))
    return result


def main():
    parser=argparse.ArgumentParser();parser.add_argument('out',type=Path);args=parser.parse_args()
    start=time.perf_counter();before=resource.getrusage(resource.RUSAGE_SELF)
    result=export(args.out)
    after=resource.getrusage(resource.RUSAGE_SELF)
    print(json.dumps(dict(out=str(args.out),wall_ms=(time.perf_counter()-start)*1000,cpu_user_seconds=after.ru_utime-before.ru_utime,cpu_system_seconds=after.ru_stime-before.ru_stime,peak_rss_bytes=after.ru_maxrss,jev=result['summary']['jev']['all'],parser=result['summary']['parser']['all'],run=result['run']),indent=2))

if __name__=='__main__':main()
