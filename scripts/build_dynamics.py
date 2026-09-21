#!/usr/bin/env python3
"""ZL-018 offline-only collector. No API/key imports; raw missingness retained."""
import csv
import hashlib
import io
import json
from pathlib import Path
import resource
import shutil
import statistics
import subprocess
import sys
import time
from datetime import datetime,timezone
import dynamics as d
import dynamics_reference as ref
from dynamics_score import parse_response,score_state
from dynamics_report import summarize

ROOT=Path(__file__).resolve().parent.parent
E=ROOT/'evidence/jev-dynamics'
sha=lambda raw:hashlib.sha256(raw).hexdigest()

def verify_raw(raw,digest):
    if sha(raw)!=digest:raise ValueError('Immutable evidence hash mismatch')

def evaluate(item,body):
    prediction={}
    if body is not None:
        try:prediction=parse_response(item['request'],body)
        except ValueError:pass  # malformed responses remain failures; never repair
    rows=[]
    for horizon in [1,3]:
        t=str(horizon);truth=item['truth']['horizons'][t];pred=prediction.get(t,{})
        baseline=item['baseline']['predictions'][t];possible=item['baseline']['possible'][t]
        rows.append({'requestId':item['id'],'caseId':item['caseId'],'condition':item['condition'],
                     'law':item['law'],'panel':item['panel'],'horizon':horizon,
                     'truth':truth,'prediction':pred,'baselinePrediction':baseline,'baselinePossible':possible,
                     'hypotheses':item['baseline']['hypotheses'],'identifiedLaw':len(item['baseline']['hypotheses'])==1,
                     'model':score_state(pred,truth),'baseline':score_state(baseline,truth),
                     'ceiling':score_state(truth,truth),'evidenceTargetExact':pred==baseline,
                     'evidenceCompatible':bool(pred) and any(all(v=='unknown' or p[k]==v for k,v in pred.items()) for p in possible),
                     'evidenceDeterminesState':len({json.dumps(p,sort_keys=True) for p in possible})==1})
    return rows

def collect():
    frozen=E/'frozen';recording=E/'recording'
    manifest=json.loads((frozen/'manifest.json').read_text())
    for path,digest in manifest['hashes'].items():verify_raw((ROOT/path).read_bytes(),digest)
    history=json.loads((frozen/'historical-preservation.json').read_text())
    for path,digest in history.items():verify_raw((ROOT/path).read_bytes(),digest)
    run=json.loads((recording/'run.json').read_text())
    verify_raw((frozen/'manifest.json').read_bytes(),run['manifestSHA256'])
    committed=subprocess.check_output(['git','show',run['sourceCommit']+':evidence/jev-dynamics/frozen/manifest.json'],cwd=ROOT)
    if committed!=(frozen/'manifest.json').read_bytes():raise ValueError('Pre-inference committed freeze mismatch')
    index=json.loads((frozen/'request-index.json').read_text())
    truth=json.loads((frozen/'truth.json').read_text());truth_map={(r['caseId'],r['law']):r for r in truth}
    ledger=[json.loads(s) for s in (recording/'admission.jsonl').read_text().splitlines()]
    if len(ledger)>24 or [r['id'] for r in ledger]!=[r['id'] for r in index[:len(ledger)]]:raise ValueError('Ledger order/count')
    admissions={r['id']:r for r in ledger};requests=[];rows=[];receipts=[];independent=0
    for original in index:
        item=dict(original);item['request']=json.loads((ROOT/item['file']).read_text())
        item['truth']=truth_map[item['caseId'],item['law']]
        public=item['request']['state']
        if d.baseline(public)!=item['baseline']:raise ValueError('Same-input baseline mismatch')
        if ref.frames(public['initial'],public['fixed_actions'],item['law'],12,9)!=item['truth']['frames']:
            raise ValueError('Independent truth mismatch')
        independent+=1
        body=None;receipt=None
        admitted=admissions.get(item['id'])
        if admitted:
            verify_raw((ROOT/item['file']).read_bytes(),admitted['requestSHA256'])
            receipt_path=recording/(item['id']+'.receipt.json')
            if receipt_path.exists():
                receipt=json.loads(receipt_path.read_text());receipts.append(receipt)
                if receipt['requestSHA256']!=item['sha256'] or receipt['id']!=item['id']:raise ValueError('Receipt request mismatch')
                if receipt.get('responseSHA256'):
                    raw=(recording/(item['id']+'.response.json')).read_bytes();verify_raw(raw,receipt['responseSHA256'])
                    if receipt['outcome']=='received':
                        body=json.loads(raw);parse_response(item['request'],body)
        item['receipt']=receipt;item['response']=body;item['status']=receipt['outcome'] if receipt else ('incomplete' if admitted else 'not_attempted')
        item['rows']=evaluate(item,body);rows.extend(item['rows']);requests.append(item)
    tokens={k:sum(r.get('usage',{}).get(k,0) or 0 for r in receipts) for k in ['input_tokens','output_tokens']}
    latencies=[r['latencyMs'] for r in receipts]
    usage={'admissions':len(ledger),'responses':sum(r['outcome']=='received' for r in receipts),
           'failures':len(index)-sum(r['outcome']=='received' for r in receipts),**tokens,
           'estimatedUSD':tokens['input_tokens']*.042/1e6,'estimateNotInvoice':True,
           'conservativeEstimatedCeilingUSD':manifest['conservativeEstimatedUSD'],
           'requestBytes':sum(a['requestBytes'] for a in ledger),'responseBytes':sum(r['responseBytes'] for r in receipts),
           'latencyMs':{'n':len(latencies),'min':min(latencies) if latencies else None,
                        'median':statistics.median(latencies) if latencies else None,
                        'mean':statistics.mean(latencies) if latencies else None,'max':max(latencies) if latencies else None},
           'complete':json.loads((recording/'complete.json').read_text()) if (recording/'complete.json').exists() else None}
    return {'experiment':'ZL-018','model':'jev-1.13.0','board':{'width':12,'height':9},'requests':requests,'rows':rows,
            'summary':summarize(rows),'usage':usage,'run':run,'freeze':manifest,
            'integrity':{'historicalFiles':len(history),'frozenHashes':len(manifest['hashes']),
                         'independentTruthMatches':len(truth),'independentRequestChecks':independent,'valid':True}}

def report_markdown(data):
    summary=data['summary'];u=data['usage'];lines=[
      '# ZL-018 — fixed-action dynamics prediction pilot',
      '',
      '**Jev did not reliably execute the stated dynamics in this pilot: 0/16 complete future states were correct with the active law supplied, versus16/16 for the same-input symbolic baseline.** The overall0/48 includes deliberately ambiguous hidden-law cases, so it is not a pure rule-identification failure rate. Keep the exact simulator as truth; this is not evidence for a replacement world model or physical-system transfer.',
      '',
      '[Offline phone viewer](../dynamics.html) · [Full JSON](../dynamics.json) · [Component CSV](../dynamics.csv) · [State CSV](../states.csv) · [Preregistration](ZL-018-protocol.md)',
      '',
      '## Design and information boundary',
      'Four fresh purposive12×9 starts × two laws × three information conditions =24 separate stateless requests, each with14 parallel Choices predicting six coordinates plus absorbing capture at horizons1 and3. Fixed human actions only; no action selection, filtering, safety masks, online correction or model-generated simulator transitions. All coordinates in the full board support plus unknown are always available. No active-law label, future truth, panel label or case ID enters hidden-rule requests.',
      '',
      'The paired rule change is zombie tie order NESW→WSEN, otherwise the same old-state Manhattan pursuit. Unchanged refers to transition law, not historical board dimensions. Every starting tuple lies outside prior10×7 coordinate support, including swapped-zombie equivalents. Four evaluation groups /24 trajectory groups are disjoint from8 example groups; development boards are3×3 and5×5. These synthetic cases are not representative and not claimed excluded from provider pretraining.',
      '',
      'Observations-only retains known human actions, boundaries, capture/absorption and an explicit four-law family: old NESW, old WSEN, new-human-target NESW, stationary. It does not infer all physics from scratch. Same-input baseline reads only public request state, eliminates laws inconsistent with examples and returns unknown where surviving predictions disagree. Supplied natural-language active rules identify one family member. The exact ceiling has privileged law access in hidden conditions.',
      '',
      '## Exact and component results',
      '| Information | Horizon | Law | Jev exact | Components correct | Absolute coordinate error / numeric answers | Unknown | Baseline exact |',
      '|---|---:|---|---:|---:|---:|---:|---:|'
    ]
    for row in summary['byConditionHorizonLaw']:
        m=row['model'];b=row['baseline'];n=row['n']
        lines.append('| %s | %s | %s | %s/%s | %s/%s | %s/%s | %s | %s/%s |'%(row['condition'],row['horizon'],row['law'],m['exact'],n,m['correctComponents'],m['components'],m['coordinateAbsoluteError'],m['numericCoordinates'],m['unknown'],b['exact'],n))
    lines.extend(['','Overall: Jev130/336 components,0/48 exact;79 explicit unknowns and0 missing responses. Same-information baseline222/336 components,24/48 exact,114 unknowns and zero error on its182 numeric predictions. Exact privileged ceiling48/48 complete states and336/336 components. Jev numeric absolute error203 across216 numeric coordinate answers; unknowns are excluded from numeric error, not replaced with fabricated coordinates. Raw distributions and confidence are separate retained fields.',
      '',
      '### Identifiability and ambiguity',
      'Cases A/B: the two observations leave exactly the true active law among the four candidate hypotheses. Cases C/D: the shared horizontal observation eliminates stationary but leaves old_NESW,old_WSEN,new_NESW under either true law. Neither leaves all four. This is finite-family identifiability, not unique recovery among all imaginable rules. The true state lies in baseline support on48/48 horizon rows. There are24 uniquely evidence-determined full states (16 supplied plus8 identifying-observation states), all predicted exactly by baseline and0 by Jev. On the24 ambiguous rows, strict truth mismatch can be an appropriate abstention, not a model error. Jev matches the full value-or-unknown evidence target on4/48 rows, all neither/horizon1. Unknown is a valid answer, not a service failure.',
      '',
      '### Paired contrasts (descriptive only)',
      'Every strict full-state contrast ties at zero: supplied-minus-observations0/16 net, observations-minus-neither0/16, supplied-minus-neither0/16; changed-minus-unchanged0/24. Component counts differ despite those exact ties: supplied54/112, observations44/112, neither32/112. These paired deltas are descriptive, not significance or population estimates. Fixed service order (neither→observations→supplied within case/law), repeated horizons and four shared starts are limitations; repeated identical neither prompts across laws are not distinct information conditions.',
      '',
      '### Retained concrete error, not an inferred rationale',
      'First rules-supplied requestq03 (caseA, unchanged law), tick1: true Z1=(8,5),Z2=(0,7), but Jev returns Z1=(7,5),Z2=(0,8). Its Z1-x Choice7 has probability0.39 and confidence0.32; the correct8 has probability0.08. Its Z2-y Choice8 has probability0.51 and confidence0.46; correct7 has probability0.28. Human(9,7) is correct. At tick3, real capture at tick2 freezes H=(9,6); Jev returns H=(7,6) and caught=no. These are observed structured-output errors, not evidence about internal reasoning. [Exact request](../evidence/jev-dynamics/frozen/requests/q03.json) · [Raw response](../evidence/jev-dynamics/recording/q03.response.json).',
      '',
      '## Boundaries and limitations',
      '- All frozen cases are uncaught at horizon1 and caught by horizon3. Capture labels are imbalanced within each horizon; the multistep test includes absorbing endpoints rather than three active moves for every case. Starts were frozen before model inference and were not replaced after that limitation was visible.',
      '- Coordinate questions are answered independently and cannot enforce joint physical consistency. This protocol tests this exact English/JSON decomposition, not every possible prompting representation. No prompt retuning or replacement calls followed the negative result.',
      '- No survival/control advantage, learned weights, intelligence, calibration, confidence interval, representative generalization, or traffic/hydraulic competence is established.',
      '',
      '## Actual admission, provenance and cost',
      'Pre-inference committed source/request/input/truth freeze: `'+data['run']['sourceCommit']+'`. Clean historical base `1c68578d18908ad146a6e8f1b22c96d380aa1566`. Authorization message1551433908577501254, thread1551351642509803581. Raw recording commit `567fe2e`.',
      '',
      'All24 admissions returned HTTP200, pinned jev-1.13.0 and336 valid Choices.0 service/schema failures,0 retries,0 warmups. Exactly one single-use campaign; all capacity exhausted. Live command `python3 -B scripts/run_dynamics.py --live-authorized` MUST NOT be rerun. Durable fsynced ledger precedes transport, whole campaign refuses restart; raw receipts are read-only locally and committed. CI refuses before price/API network, and offline builders contain no inference path.',
      '',
      'Official Models docs checked live before admission: input$0.042/M, output free. Actual usage **%s input /%s output tokens; estimated$%.9f** (not invoice). Conservative frozen estimated ceiling$%.9f, authorized ceiling$0.05.24 requests at concurrency1,16KiB body/64KiB response,30s absolute request deadline,900s campaign deadline. Recorded wall time%.3fms; client/network-inclusive latency min%.3f, median%.3f, mean%.3f, max%.3fms. Request bytes%s; response bytes%s, excluding HTTP/TLS overhead. Client peak RSS%s bytes; server resources unmeasured.'%(u['input_tokens'],u['output_tokens'],u['estimatedUSD'],u['conservativeEstimatedCeilingUSD'],u['complete']['elapsedMs'],u['latencyMs']['min'],u['latencyMs']['median'],u['latencyMs']['mean'],u['latencyMs']['max'],u['requestBytes'],u['responseBytes'],u['complete']['peakRSSBytes']),
      '',
      'Independent coordinate-sign reference (no primary transition import) matches312,500 exhaustive5×5 transitions over four laws/five actions, plus204 frozen truth/example/baseline comparisons. Unchanged historical production matches all12 prescribed evaluation transitions. The two implementations share an author; this is algorithmic independence, not blind independent review.765 historical tracked files are hash-preserved. Frozen manifests and raw request/response hashes are checked on every build.',
      '',
      '## Offline reproduction and gates',
      '```sh',
      "python3 -B -m unittest discover -s scripts -p 'test_dynamics*.py'",
      'python3 -B scripts/build_dynamics.py /absolute/path/to/export',
      'node scripts/check-dynamics-browser.cjs /absolute/path/to/export /existing/playwright-core /existing/chromium /absolute/path/to/browser-receipts',
      '```',
      '',
      'Browser testing is mandatory on the actual exported files at320/390/1200 with cached Playwright/Chromium, not an install/skip substitute. External detailed goal/implementation handoff records exact candidate, browser/tests/resources hashes and commands. Parent-owned unresolved gates: independent candidate review; any separately authorized remote CI/PR/download/merge/deploy/live-publication; canonical notes. No push, merge or publication in this task.'
    ])
    return '\n'.join(lines)+'\n'

def export(output):
    started=time.monotonic();data=collect();output=Path(output);output.mkdir(parents=True,exist_ok=True)
    encoded=json.dumps(data,sort_keys=True,separators=(',',':'),allow_nan=False)
    (output/'dynamics.json').write_text(encoded+'\n')
    # Preserve original source/freeze paths, all raw receipts, and exact protocol.
    for path in data['freeze']['hashes']:
        destination=output/path;destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(ROOT/path,destination)
    shutil.copyfile(E/'frozen/manifest.json',output/'evidence/jev-dynamics/frozen/manifest.json')
    recording_out=output/'evidence/jev-dynamics/recording';recording_out.mkdir(parents=True,exist_ok=True)
    for source in (E/'recording').iterdir():
        if not source.is_file():continue
        destination=recording_out/source.name
        if destination.exists():
            if destination.read_bytes()!=source.read_bytes():raise ValueError('Existing exported receipt differs; refuse replacement')
        else:shutil.copy2(source,destination)
    (output/'experiments').mkdir(exist_ok=True)
    report=report_markdown(data);(output/'experiments/ZL-018-results.md').write_text(report)
    html=(ROOT/'dynamics-template.html').read_text().replace('__DATA__',encoded.replace('<','\\u003c'))
    (output/'dynamics.html').write_text(html)
    with (output/'dynamics.csv').open('w',newline='') as file:
        fields=['request','case','law','condition','panel','horizon','component','truth','model','baseline','modelCorrect','baselineCorrect','absoluteError','confidence','choiceProbability']
        writer=csv.DictWriter(file,fieldnames=fields);writer.writeheader()
        request_map={r['id']:r for r in data['requests']}
        for row in data['rows']:
            item=request_map[row['requestId']]
            for component,true in row['truth'].items():
                answer=(item['response'] or {}).get('answers',{}).get('t%d_%s'%(row['horizon'],component),{})
                writer.writerow(dict(zip(fields,[row['requestId'],row['caseId'],row['law'],row['condition'],row['panel'],row['horizon'],component,true,row['prediction'].get(component),row['baselinePrediction'].get(component),row['model']['componentCorrect'][component],row['baseline']['componentCorrect'][component],row['model']['componentAbsoluteError'].get(component),answer.get('confidence'),answer.get('probabilities',{}).get(answer.get('choice'))])))
    with (output/'states.csv').open('w',newline='') as file:
        fields=['requestId','caseId','law','condition','panel','horizon','exact','correctComponents','components','numericCoordinates','coordinateAbsoluteError','captureCorrect','unknown','missing','baselineExact','evidenceTargetExact','evidenceCompatible','evidenceDeterminesState']
        writer=csv.DictWriter(file,fieldnames=fields);writer.writeheader()
        for row in data['rows']:
            scalar={k:row[k] for k in fields if k in row};scalar.update({k:v for k,v in row['model'].items() if k in fields});scalar['baselineExact']=row['baseline']['exact'];writer.writerow(scalar)
    receipt={'generatedAt':datetime.now(timezone.utc).isoformat(),'stateRows':len(data['rows']),'componentRows':sum(len(r['truth']) for r in data['rows']),
             'dataSHA256':sha((output/'dynamics.json').read_bytes()),'elapsedMs':(time.monotonic()-started)*1000,
             'peakRSSBytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'outputLogicalBytes':sum(p.stat().st_size for p in output.rglob('*') if p.is_file())}
    (output/'build-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    return receipt

if __name__=='__main__':
    if len(sys.argv)==2:print(json.dumps(export(Path(sys.argv[1])),indent=2))
    else:
        data=collect()
        print(json.dumps({'summary':data['summary'],'usage':data['usage'],'integrity':data['integrity']},indent=2))
