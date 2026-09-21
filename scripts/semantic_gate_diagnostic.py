"""Additive descriptive reporting only. Never modifies frozen scoring or predictions."""
import argparse
from collections import Counter
import csv
import io
import json
from pathlib import Path
import statistics

FACTS = ('mara_at_depot', 'ash_in_east', 'west_blocked')
FIELDS = FACTS + ('policy', 'clarification')


def report(data, recording):
    rows = data['cases']
    ids = [r['id'] for r in rows]
    if len(ids) != len(set(ids)) or not rows:
        raise ValueError('unique nonempty planned rows required')
    groups = {r['group'] for r in rows}
    gold_facts = [r['gold']['interpretation'][k] for r in rows for k in FACTS]
    gold_traces = [r['jev']['gold_trace'] for r in rows]
    if any(r['jev']['gold_trace'] != r['parser']['gold_trace'] for r in rows):
        raise ValueError('gold trace disagreement')
    run = json.loads((recording / 'run.json').read_bytes())
    complete = json.loads((recording / 'complete.json').read_bytes())
    ledger = [json.loads(line) for line in (recording / 'admission.jsonl').read_bytes().splitlines()]
    if [r['id'] for r in ledger] != ids[:len(ledger)] or run['planned'] != len(rows):
        raise ValueError('planned/admitted set mismatch')
    usage = [r['response']['usage'] for r in rows if r['response'] is not None]
    for value in usage:
        if any(type(value[k]) is not int or value[k] < 0 for k in ('input_tokens', 'output_tokens')):
            raise ValueError('invalid usage')
    input_tokens = sum(u['input_tokens'] for u in usage)
    output_tokens = sum(u['output_tokens'] for u in usage)
    latencies = [r['receipt']['latency_ms'] for r in rows if r['receipt'] is not None]
    denominator = dict(planned_texts=len(rows), scenario_groups=len(groups),
        all_fields=len(rows)*len(FIELDS), fact_fields=len(gold_facts),
        each_field=len(rows), gold_suspected_fact_fields=sum(x.startswith('suspected_') for x in gold_facts),
        gold_uncertain_fact_fields=sum(x.startswith('suspected_') or x == 'conflicting' for x in gold_facts),
        gold_non_direct_fact_fields=sum(x not in ('known', 'negated') for x in gold_facts),
        gold_non_ask_texts=sum(t['decision']['action'] != 'ask' for t in gold_traces),
        gold_move_texts=sum(t['decision']['action'] == 'move' for t in gold_traces))
    attributions = {}
    for name in ('jev', 'parser'):
        attributions[name] = dict(
            changed_ids=[r['id'] for r in rows if r[name]['gate_changed']],
            already_asked_ids=[r['id'] for r in rows if r[name]['required_clarification'] not in ('none', 'invalid')
                and r[name]['raw_clarification'] == 'none' and r[name]['raw_decision']['action'] == 'ask'],
            preserved_overabstention_ids=[r['id'] for r in rows if r[name]['required_clarification'] == 'none'
                and r[name]['raw_clarification'] != 'none' and r['jev']['gold_trace']['decision']['action'] != 'ask'],
            false_action_ids=[r['id'] for r in rows if r[name]['gated_metrics']['false_action']],
            unsupported_fact_fields=[dict(id=r['id'], field=k, gold=r['gold']['interpretation'][k],
                prediction=r[name]['raw_interpretation'][k]) for r in rows for k in r[name]['unsupported_fields']],
            clarification_mismatches=[dict(id=r['id'], raw=r[name]['raw_clarification'],
                required=r[name]['required_clarification'], gold=r['gold']['interpretation']['clarification'],
                raw_decision=r[name]['raw_decision'], gated_decision=r[name]['gated_decision'],
                reasons=r[name]['gate_reasons'],
                returned_clarification=r['response']['answers']['clarification'] if name == 'jev' and r['response'] else None)
                for r in rows if not r[name]['component_correct']['clarification']])
    paired = {}
    for measure in ('raw_exact', 'raw_trace_match', 'gated_trace_match'):
        def correct(row, name):
            return row[name]['raw_exact'] if measure == 'raw_exact' else row[name][measure.split('_')[0] + '_metrics']['trace_match']
        paired[measure] = dict(Counter('both_correct' if correct(r,'jev') and correct(r,'parser') else
            'jev_only' if correct(r,'jev') else 'parser_only' if correct(r,'parser') else 'neither_correct' for r in rows))
    strata = {}
    for stratum in sorted({r['stratum'] for r in rows}):
        subset = [r for r in rows if r['stratum'] == stratum]
        strata[stratum] = dict(n=len(subset), **{name: dict(
            raw_exact=sum(r[name]['raw_exact'] for r in subset),
            raw_trace_match=sum(r[name]['raw_metrics']['trace_match'] for r in subset),
            gated_trace_match=sum(r[name]['gated_metrics']['trace_match'] for r in subset)) for name in ('jev','parser')})
    return dict(experiment='ZL020', source_freeze_commit=run['metadata']['source_freeze_commit'],
        disposition='recorded diagnostic; incremental gate benefit not demonstrated; no adoption claim',
        comparator=dict(status='pending_parent_owned', scores=None),
        denominators=denominator, summary=data['summary'],
        metric_definitions=dict(raw_exact='All five unmodified interpreter fields match gold; per planned text.',
            trace_match='Full decision, complete frames, outcome and secondary completion equal the gold trace.',
            coverage='Non-ASK (MOVE or WAIT), per planned text; not the success-only subset.',
            useful_coverage='Non-ASK and gold trace match, per planned text.',
            false_action='Frozen metric: MOVE with decision different from gold; WAIT mismatches are not included.',
            unsupported_assertions='Predicted known/negated that differs from epistemic gold; per fact field, not necessarily physical harm.',
            suspected_promotions='Predicted known/negated when gold starts suspected_; per suspected fact opportunity.',
            secondary_completion='Satisfied hidden-world goal, even if the action was not authorized; not primary correctness.',
            gate_changed='Actual decision change caused by new deterministic abstention gate, not a label correction.'),
        gold=dict(n=len(rows), actions=dict(Counter(t['decision']['action'] for t in gold_traces)),
            trace_match=len(rows), coverage=denominator['gold_non_ask_texts'], useful_coverage=denominator['gold_non_ask_texts'],
            goal_completed=sum(t['goal_completed'] for t in gold_traces),
            outcomes=dict(Counter(t['outcome'] for t in gold_traces)),
            field_coverage={k:dict(Counter(r['gold']['interpretation'][k] for r in rows)) for k in FIELDS}),
        accounting=dict(**complete, planned=len(rows), hard_admission_cap=run['hard_admission_cap'],
            unused_admissions=run['hard_admission_cap']-len(ledger), retries=0, warmups=0, replacements=0,
            invocation_count=1, model=run['model'], input_tokens=input_tokens, output_tokens=output_tokens,
            usage_rows=len(usage), usage_missing_rows=len(ledger)-len(usage),
            usage_derived_cost_usd=input_tokens*run['metadata']['input_usd_per_million']/1e6,
            cost_scope='Sum of reported input usage at live verified rate; not an invoice or provider-enforced cap.',
            input_usd_per_million=run['metadata']['input_usd_per_million'], output_usd_per_million=0,
            preflight_estimate_usd=run['estimated_ceiling_usd'],
            request_latency_ms=dict(n=len(latencies),minimum=min(latencies),median=statistics.median(latencies),
                mean=statistics.mean(latencies),maximum=max(latencies))),
        attributions=attributions, paired_method_comparison=paired, strata=strata,
        limitations=['12 purposive correlated pairs, not 24 independent or representative samples.',
            'No prompt/parser/source/scoring tuning after heldout release.',
            'Author independent of new source and outcomes but incidentally exposed to limited historical outcomes; full caveat preserved.',
            'Code owns controllers, abstention, exact simulation and hidden truth. Model supplies labels, not learned physics.',
            'No fresh Jev extraction-bypass failure observed; parser bypass is observed and synthetic possibilities remain separately labeled.',
            'Zero gate action interventions in this run: cannot infer incremental benefit or safety guarantee.',
            'Independent final candidate review and parent blind comparator remain pending; no publication.'])


def csv_report(result):
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(['method','arm','metric','count','denominator'])
    n = result['denominators']['planned_texts']
    for method, value in result['summary'].items():
        for metric in ('raw_exact','clarification_inconsistent','malformed_or_missing','gate_changed'):
            writer.writerow([method,'interpretation',metric,value[metric],n])
        writer.writerow([method,'interpretation','groups_exact',value['groups_exact'],value['groups_total']])
        for field, count in value['components_correct'].items():
            writer.writerow([method,'interpretation',field,count,n])
        writer.writerow([method,'interpretation','unsupported_assertions',value['unsupported_assertions'],result['denominators']['fact_fields']])
        writer.writerow([method,'interpretation','suspected_promotions',value['suspected_promotions'],result['denominators']['gold_suspected_fact_fields']])
        for arm in ('raw','gated'):
            for metric in ('trace_match','coverage','useful_coverage','moved','false_action','goal_completed'):
                writer.writerow([method,arm,metric,value[arm][metric],n])
            writer.writerow([method,arm,'false_action_per_move',value[arm]['false_action'],value[arm]['moved']])
        for arm in ('raw','gated'):
            writer.writerow([method,arm,'useful_coverage_per_gold_non_ask',value[arm]['useful_coverage'],result['denominators']['gold_non_ask_texts']])
    for metric in ('trace_match','coverage','useful_coverage','goal_completed'):
        writer.writerow(['gold','reference',metric,result['gold'][metric],n])
    return stream.getvalue()


def decorate(html, result):
    """Presentation-only layer over the retained frozen exporter HTML."""
    n = result['denominators']['planned_texts']
    j, p = result['summary']['jev'], result['summary']['parser']
    banner = f'''<section id="diagnostic-status"><h2>Recorded diagnostic — not adoption approval</h2>
<p>This recorded diagnostic found no incremental gate benefit: {j['gate_changed']} Jev actions changed by the new gate.</p>
<p>Jev: {j['raw_exact']}/{n} exact interpretations; {j['gated']['trace_match']}/{n} authorized traces; {j['gated']['useful_coverage']}/{n} useful non-ASK coverage.</p>
<p>Frozen parser: {p['raw_exact']}/{n} exact; {p['gated']['trace_match']}/{n} traces; {p['gated']['false_action']}/{n} false moves. Gold permits {result['gold']['coverage']}/{n} non-ASK decisions.</p>
<p>24 texts in 12 correlated purposive pairs. Other-model comparator and independent final review pending. No arbitrary-text inference, no physical actuation, no safety guarantee.</p>
<p><a href="report.json" download>Report JSON</a> · <a href="report.csv" download>Report CSV</a> · <a href="ZL-020-results.md">Readable report</a> · <a href="package-provenance.json">Source hashes</a></p></section>'''
    # All substitutions target fixed markup, never user text or the JSON payload.
    html = html.replace('</style>', '''*{box-sizing:border-box}body{overflow-wrap:anywhere}.panels{grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}section{min-width:0}pre{max-width:100%;font-size:14px}svg text{font-size:18px}button,select{min-height:44px}#diagnostic-status{border-color:#ffd28d}#scope{font-size:14px}</style>''', 1)
    html = html.replace('<h1>ZL020: raw vs gated agency</h1>', '<h1>ZL020: raw vs gated agency</h1>' + banner, 1)
    html = html.replace('<option value="raw">Raw</option>', '<option value="raw">Raw</option><option value="gold">Gold authorized reference</option>', 1)
    html = html.replace('<p id="event">', '<p id="replay-authority" class="warning"></p><p id="event">', 1)
    html = html.replace("+' · authorized goal completed: '+trace.goal_completed", "+' · secondary goal completed: '+trace.goal_completed", 1)
    html = html.replace('<label>Interpreter<select', '<button id="previous-case">Previous case</button> <button id="next-case">Next case</button><label>Interpreter<select', 1)
    html = html.replace('<section><h2>Simulator replay</h2>', '''<section><h2>Gold / evaluator reference</h2><p id="case-result"></p><pre id="gold-reference"></pre><details><summary>Evaluator-only hidden world (never in model input)</summary><pre id="hidden-world"></pre></details></section><section><h2>Simulator replay</h2>''', 1)
    supplement = '''<script>
function diagnosticSelection(){const r=row(),v=value();$('gold-reference').textContent=pretty({interpretation:r.gold.interpretation,authorized_decision:v.gold_trace.decision});$('hidden-world').textContent=pretty(r.gold.world);$('case-result').textContent='Selected '+$('method').value+': raw exact '+v.raw_exact+'; raw trace matches '+v.raw_metrics.trace_match+'; gated trace matches '+v.gated_metrics.trace_match+'; gate action intervention '+v.gate_changed;const m=$('arm').value==='gold'?{trace_match:true,false_action:false}:v[$('arm').value+'_metrics'];$('replay-authority').textContent='Primary authorized trace: '+(m.trace_match?'MATCH':'MISMATCH')+' · False MOVE: '+m.false_action+'. Completion below is secondary, not permission.';$('previous-case').disabled=Number($('case').value)===0;$('next-case').disabled=Number($('case').value)===data.cases.length-1}
for(const id of ['case','method','arm'])$(id).addEventListener('change',diagnosticSelection);
for(const [id,step] of [['previous-case',-1],['next-case',1]])$(id).onclick=()=>{$('case').value=Number($('case').value)+step;select();diagnosticSelection()};
if(data.cases.length)diagnosticSelection();
</script>'''
    return html.replace('</html>', supplement + '</html>', 1)


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--recorded', type=Path, required=True)
    cli.add_argument('--recording', type=Path, required=True)
    cli.add_argument('--out', type=Path, required=True)
    args = cli.parse_args()
    result = report(json.loads(args.recorded.read_bytes()), args.recording)
    args.out.mkdir(parents=True, exist_ok=False)
    (args.out/'report.json').write_text(json.dumps(result,indent=2,sort_keys=True,allow_nan=False)+'\n')
    (args.out/'report.csv').write_text(csv_report(result))
    print(json.dumps(dict(disposition=result['disposition'],denominators=result['denominators'],accounting=result['accounting']),indent=2))


if __name__ == '__main__':
    main()
