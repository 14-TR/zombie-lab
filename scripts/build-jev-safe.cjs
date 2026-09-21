"use strict";
// Read-only collector. API admission is a separate explicit local command.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const pilot=require('./jev-pilot.cjs'),original=require('./jev-controller.cjs'),safe=require('./jev-safe.cjs');
const ROOT=pilot.ROOT,DIR=path.join(ROOT,'evidence/jev-safe'),REC=path.join(DIR,'recording'),read=p=>JSON.parse(fs.readFileSync(p));
function metrics(trace){
 const events=trace.decisions??[],executed=events.filter(e=>e.action),selected=executed.map(e=>e.truth.actions.find(a=>a.action===e.action));
 const loss=executed.find(e=>e.truth.rank===-1&&!e.truth.actions.find(a=>a.action===e.action).avoidable);
 const lossAction=loss?.truth.actions.find(a=>a.action===loss.action),captureTick=trace.outcome==='capture'?trace.frames.at(-1).tick:null;
 return {outcome:trace.outcome,stopTick:trace.frames.at(-1).tick,immediateUnsafeChoices:selected.filter(a=>a.capture).length,firstLossTick:loss?loss.before.tick+1:null,firstLossWasDelayed:loss? !lossAction.capture:null,delayedCapture:loss&&!lossAction.capture&&captureTick!==null?{lossTick:loss.before.tick+1,captureTick,delayTicks:captureTick-loss.before.tick-1}:null,unresolved:trace.outcome==='unresolved',requests:events.filter(e=>e.receipt).length,forcedSteps:events.filter(e=>e.agency==='forced_guardrail').length,safeSetSizes:events.reduce((h,e)=>{const n=e.truth.actions.filter(a=>!a.capture).length;h[n]=(h[n]??0)+1;return h;},{})};
}
function collect({recordingDir=REC}={}){
 const manifest=read(path.join(DIR,'frozen/manifest.json')),complete=read(path.join(recordingDir,'complete.json')),recording=read(path.join(recordingDir,'run.json'));
 assert.match(recording.sourceCommit,/^[0-9a-f]{40}$/,'Literal committed source identity');
 assert.deepEqual(cp.execFileSync('git',['show',recording.sourceCommit+':evidence/jev-safe/frozen/manifest.json'],{cwd:ROOT,stdio:['ignore','pipe','pipe']}),fs.readFileSync(path.join(DIR,'frozen/manifest.json')),'Exact source/input freeze existed in inference commit');
 assert.equal(recording.runnerSHA256,manifest.sourceHashes['scripts/run-jev-safe.py']);
 for(const [f,h]of Object.entries({...manifest.sourceHashes,...manifest.baselineHashes,...manifest.inputHashes}))assert.equal(pilot.sha(fs.readFileSync(path.join(ROOT,f))),h,'Frozen source/input/history changed: '+f);
 const historical=require('./build-jev-controller.cjs').collect();assert.deepEqual(manifest.starts,historical.manifest.starts);
 const ledgerFile=path.join(recordingDir,'admission.jsonl'),ledger=fs.existsSync(ledgerFile)?fs.readFileSync(ledgerFile,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
 assert.equal(ledger.length,complete.admitted);assert(ledger.length<=24);assert.equal(new Set(ledger.map(e=>e.id)).size,ledger.length);
 const exact=read(path.join(DIR,'frozen/exact-controls.json'));
 const summary={admitted:ledger.length,requestDecisions:ledger.length,maxRequests:24,forcedSteps:0,simulationTicks:0,allUnsafeFallbacks:0,safeSetSizes:{},genuineChoiceStatesWithDelayedTrap:0,zombiePredictions:{correct:0,valid:0,total:0,missingNotRequested:0},actions:{valid:0,safe:0,unsafe:0,winningSuccessor:0,jevChoices:0,forcedGuardrail:0},invalidResponses:0,serviceFailures:0,usage:{inputTokens:0,outputTokens:0,estimatedUSD:0},elapsedMs:complete.elapsedMs};
 const visited=[],latencies=[];
 const runs=manifest.starts.map((start,index)=>{
  const file=path.join(recordingDir,start.id+'.trajectory.json'),trace=fs.existsSync(file)?read(file):{id:start.id,frames:[start.state],decisions:[],outcome:'not_started'};
  assert.deepEqual(trace.frames[0],start.state);let state=start.state,frameIndex=0;
  for(const [i,event]of trace.decisions.entries()){
   assert.equal(state.status,'running');assert(state.tick<12);assert.deepEqual(event.before,state);
   assert.equal(event.id,start.id+'-tick-'+String(state.tick+1).padStart(2,'0'));
   const p=safe.prepare(state);assert.deepEqual(event.mask,p.mask);assert.equal(event.agency,p.mask.agency);assert.deepEqual(event.truth,original.facts(state));
   const proof=read(path.join(recordingDir,event.id+'.truth.json'));
   assert.deepEqual(proof,{before:event.before,truth:event.truth,mask:event.mask,reference:event.reference});
   assert.equal(event.reference.valid,true);assert.equal(event.reference.maskVerified,true);assert.equal(event.reference.decisions,1);assert.equal(event.reference.oracleSHA256,manifest.sourceHashes['evidence/jev/independent-reference/oracle.py']);
   const size=p.mask.safeSetSize;summary.safeSetSizes[size]=(summary.safeSetSizes[size]??0)+1;summary.allUnsafeFallbacks+=Number(size===0);
   let decision=null;
   if(event.agency==='forced_guardrail'){
    assert.equal(event.receipt,null);assert.equal(event.answers,null);assert.equal(p.request,null);
    for(const suffix of ['request','response','receipt'])assert(!fs.existsSync(path.join(recordingDir,event.id+'.'+suffix+'.json')),'No fabricated forced-step recording');
    decision=safe.forced(state);summary.forcedSteps++;summary.zombiePredictions.missingNotRequested+=2;
   }else{
    const raw=fs.readFileSync(path.join(recordingDir,event.id+'.request.json'));assert(raw.length<=16384);assert.deepEqual(JSON.parse(raw),p.request);
    assert.equal(pilot.sha(raw),event.receipt.requestSHA256);if(state.tick===0)assert.deepEqual(raw,fs.readFileSync(path.join(DIR,'frozen',start.id+'.initial.request.json')));
    const admission=ledger[visited.length];assert(admission);assert.equal(admission.number,visited.length+1);assert.equal(admission.id,event.id);assert.equal(admission.requestSHA256,event.receipt.requestSHA256);assert.equal(admission.admittedAt,event.receipt.admittedAt);
    assert(Date.parse(event.reference.checkedAt)<=Date.parse(admission.admittedAt),'Oracle check precedes admission');assert.deepEqual(read(path.join(recordingDir,event.id+'.receipt.json')),event.receipt);
    visited.push(event.id);latencies.push(event.receipt.latencyMs);summary.zombiePredictions.total+=2;
    summary.genuineChoiceStatesWithDelayedTrap+=Number(event.truth.actions.some(a=>!a.capture&&!a.avoidable));
    let response=null;
    if(event.receipt.responseSHA256){const body=fs.readFileSync(path.join(recordingDir,event.id+'.response.json'));assert.equal(body.length,event.receipt.responseBytes);assert.equal(pilot.sha(body),event.receipt.responseSHA256);try{response=JSON.parse(body);}catch{assert.equal(event.receipt.outcome,'invalid_json');}}
    if(response?.usage)for(const [from,to]of [['input_tokens','inputTokens'],['output_tokens','outputTokens']]){assert(Number.isSafeInteger(response.usage[from])&&response.usage[from]>=0);summary.usage[to]+=response.usage[from];}
    if(event.answers){
     assert.equal(event.receipt.outcome,'received');decision=safe.decision(state,response);assert.deepEqual(decision.answers,event.answers);
     for(let z=0;z<2;z++){summary.zombiePredictions.valid++;summary.zombiePredictions.correct+=Number(event.answers['zombie'+(z+1)+'_move'].choice===event.truth.zombieMoves[z]);}
    }else{
     assert.equal(i,trace.decisions.length-1);assert(complete.halted);assert.equal(event.action,null);
     if(event.receipt.outcome==='received'){assert.throws(()=>safe.decision(state,response));assert.equal(trace.outcome,'invalid_response');summary.invalidResponses++;}
     else {assert.equal(trace.outcome,'service_failure');summary.serviceFailures++;}
    }
   }
   if(decision){
    assert.equal(event.action,decision.action);state=decision.successor;assert.deepEqual(trace.frames[++frameIndex],state);summary.simulationTicks++;summary.actions.valid++;
    summary.actions[event.agency==='forced_guardrail'?'forcedGuardrail':'jevChoices']++;
    const a=event.truth.actions.find(a=>a.action===event.action);summary.actions.safe+=Number(!a.capture);summary.actions.unsafe+=Number(a.capture);summary.actions.winningSuccessor+=Number(a.avoidable);
   }
  }
  assert.equal(trace.frames.length,frameIndex+1);
  if(trace.outcome==='capture')assert.equal(state.status,'caught');else if(trace.outcome==='unresolved'){assert.equal(state.tick,12);assert.equal(state.status,'limit');}else assert(['not_started','invalid_response','service_failure','deadline'].includes(trace.outcome));
  const baseline=historical.runs[index],control=exact[index];assert.equal(control.id,start.id);assert.deepEqual(control.frames[0],start.state);
  for(const e of control.decisions){assert.equal(safe.exactAction(e.before),e.action);assert.deepEqual(original.advance(e.before,e.action),control.frames[e.before.tick+1]);assert(e.reference.maskVerified);}
  const originalMetrics=metrics(baseline.jev),safeMetrics=metrics(trace),exactMetrics=metrics(control);
  let divergence=null;for(let t=0;t<Math.min(trace.frames.length,baseline.jev.frames.length);t++)if(!require('node:util').isDeepStrictEqual(trace.frames[t],baseline.jev.frames[t])){divergence=t;break;}
  return {...start,original:baseline.jev,safe:trace,controls:{exact:control,...baseline.controls},metrics:{original:originalMetrics,safe:safeMetrics,exact:exactMetrics},comparison:{firstTrajectoryDivergenceTick:divergence,firstOriginalLossTick:originalMetrics.firstLossTick,firstSafeLossTick:safeMetrics.firstLossTick,bothCapturedTickDifference:trace.outcome==='capture'&&baseline.jev.outcome==='capture'?state.tick-baseline.jev.frames.at(-1).tick:null}};
 });
 assert.deepEqual(visited,ledger.map(e=>e.id));assert.equal(summary.forcedSteps,complete.forcedSteps);assert.equal(summary.simulationTicks,complete.executedSimulationTicks);
 assert.equal(recording.price.inputUSDPerMillion,.042);assert.equal(recording.price.outputFree,true);summary.usage.estimatedUSD=summary.usage.inputTokens*.042/1e6;
 const sorted=latencies.slice().sort((a,b)=>a-b),n=sorted.length;summary.latencyMs={n,min:n?sorted[0]:null,median:n?(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2:null,mean:n?sorted.reduce((a,b)=>a+b,0)/n:null,max:n?sorted.at(-1):null};
 const reference=JSON.parse(cp.execFileSync('python3',['-B',path.join(ROOT,'scripts/check-jev-safe-reference.py'),recordingDir],{encoding:'utf8',timeout:15000}));assert(reference.valid&&reference.exactControls.valid);
 return {schemaVersion:1,experiment:'ZL-017',prerecorded:true,model:manifest.model,manifest,recording,baselineRecording:historical.recording,reference,comparisonLimit:'Previously inspected starts; original19 historical calls, not contemporaneous/randomized or fresh heldout. Guardrail intervention, not training/model learning. Reaching12 is unresolved, not infinite survival.',summary:{original:historical.summary,safe:summary},runs};
}
function build(out){
 const started=process.hrtime.bigint(),data=collect();data.buildCommit=process.env.PREVIEW_COMMIT||cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'jev-safe.json'),JSON.stringify(data,null,2)+'\n');
 fs.writeFileSync(path.join(out,'jev-safe-data.js'),'globalThis.ZL_SAFE_DATA='+JSON.stringify(data).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+';\n');
 const rows=[['run','policy','tick','human_x','human_y','z1_x','z1_y','z2_x','z2_y','status','human_action','agency','safe_set_size','retained_actions','prediction_status','predicted_z1','actual_z1','predicted_z2','actual_z2','before_rank','successor_rank']];
 for(const r of data.runs)for(const [name,trace]of Object.entries({original:r.original,safe:r.safe,...r.controls}))for(const f of trace.frames){
  const e=trace.decisions&&f.tick>0?trace.decisions[f.tick-1]:null,a=e?.truth.actions.find(a=>a.action===e.action);
  const agency=e?.agency??(e?'historical_jev':f.tick?'deterministic_control':'initial');
  const prediction=e?.agency==='forced_guardrail'?'not_requested_forced':e?.answers?'requested':f.tick?'not_applicable_control':'initial';
  rows.push([r.id,name,f.tick,f.human.x,f.human.y,...f.zombies.flatMap(z=>[z.x,z.y]),f.status,e?.action??'',agency,e?e.truth.actions.filter(a=>!a.capture).length:'',e?.mask?.retainedActions.join('|')??'',prediction,e?.answers?.zombie1_move?.choice??'',e?.truth?.zombieMoves[0]??'',e?.answers?.zombie2_move?.choice??'',e?.truth?.zombieMoves[1]??'',e?.truth?.rank??'',a?.rank??'']);
 }
 fs.writeFileSync(path.join(out,'jev-safe.csv'),rows.map(r=>r.join(',')).join('\n')+'\n');
 for(const file of ['jev-safe.html','jev-safe-view.js','experiments/ZL-017-protocol.md','experiments/ZL-017-safe.md']){fs.mkdirSync(path.dirname(path.join(out,file)),{recursive:true});fs.copyFileSync(path.join(ROOT,file),path.join(out,file));}
 for(const name of ['jev-safe','jev-controller'])fs.cpSync(path.join(ROOT,'evidence',name),path.join(out,'evidence',name),{recursive:true,filter:p=>!p.endsWith('run.lock')});
 for(const name of ['index.html','jev-controller.html','jev-policy.html']){const file=path.join(out,name);if(fs.existsSync(file)){const html=fs.readFileSync(file,'utf8');if(!html.includes('href="jev-safe.html"'))fs.writeFileSync(file,html.replace('<body>','<body><p><a href="jev-safe.html">ZL-017 · Original vs immediate-safe guardrail vs exact planner</a></p>'));}}
 fs.writeFileSync(path.join(out,'jev-safe-build.json'),JSON.stringify({elapsedMs:Number(process.hrtime.bigint()-started)/1e6,maxRSSKiB:process.resourceUsage().maxRSS,sourceCommit:data.buildCommit})+'\n');return data;
}
module.exports={collect,metrics,build};
if(require.main===module)console.log(JSON.stringify(build(path.resolve(process.argv[2]||'preview')).summary));
