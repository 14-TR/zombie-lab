"use strict";
// Read-only release builder: no API client or live runner is imported.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const pilot=require('./jev-pilot.cjs'),controller=require('./jev-controller.cjs'),policy=require('./jev-policy.cjs');
const ROOT=pilot.ROOT,DIR=path.join(ROOT,'evidence/jev-policy'),REC=path.join(DIR,'recording');
const read=p=>JSON.parse(fs.readFileSync(p));
function collect({recordingDir=REC}={}){
 const manifest=read(path.join(DIR,'frozen/manifest.json')),complete=read(path.join(recordingDir,'complete.json')),recording=read(path.join(recordingDir,'run.json'));
 for(const [file,hash]of Object.entries({...manifest.sourceHashes,...manifest.baselineHashes}))assert.equal(pilot.sha(fs.readFileSync(path.join(ROOT,file))),hash,'Frozen source or historical baseline changed: '+file);
 const original=require('./build-jev-controller.cjs').collect();
 assert.deepEqual(manifest.starts,original.manifest.starts);
 const ledger=fs.readFileSync(path.join(recordingDir,'admission.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
 assert.equal(ledger.length,complete.admitted);assert(ledger.length<=24);assert.equal(new Set(ledger.map(e=>e.id)).size,ledger.length);
 const summary={admitted:ledger.length,maxRequests:24,zombiePredictions:{correct:0,valid:0,total:0},actions:{valid:0,safe:0,winningSuccessor:0},invalidResponses:0,serviceFailures:0,usage:{inputTokens:0,outputTokens:0,estimatedUSD:0},elapsedMs:complete.elapsedMs};
 const visited=[],latencies=[];
 const runs=manifest.starts.map((start,index)=>{
  const file=path.join(recordingDir,start.id+'.trajectory.json');
  const trace=fs.existsSync(file)?read(file):{id:start.id,frames:[start.state],decisions:[],outcome:'not_started'};
  assert.deepEqual(trace.frames[0],start.state);let state=start.state;
  for(const [i,event]of trace.decisions.entries()){
   assert.equal(state.status,'running');assert(state.tick<12);assert.deepEqual(event.before,state);
   assert.equal(event.id,start.id+'-tick-'+String(state.tick+1).padStart(2,'0'));
   const raw=fs.readFileSync(path.join(recordingDir,event.id+'.request.json'));
   assert(raw.length<=16384);assert.deepEqual(JSON.parse(raw),policy.request(state));
   assert.equal(pilot.sha(raw),event.receipt.requestSHA256);
   const admission=ledger[visited.length];assert(admission);assert.equal(admission.number,visited.length+1);assert.equal(admission.id,event.id);
   assert.equal(admission.requestSHA256,event.receipt.requestSHA256);assert.equal(admission.admittedAt,event.receipt.admittedAt);
   assert.deepEqual(read(path.join(recordingDir,event.id+'.receipt.json')),event.receipt);
   const proof=read(path.join(recordingDir,event.id+'.truth.json'));
   assert.deepEqual(proof,{before:event.before,truth:event.truth,reference:event.reference});
   assert.equal(event.reference.valid,true);assert.equal(event.reference.decisions,1);
   assert.equal(event.reference.oracleSHA256,manifest.sourceHashes['evidence/jev/independent-reference/oracle.py']);
   assert(Date.parse(event.reference.checkedAt)<=Date.parse(admission.admittedAt),'Oracle check must precede admission');
   assert.deepEqual(controller.facts(state),event.truth);
   visited.push(event.id);latencies.push(event.receipt.latencyMs);summary.zombiePredictions.total+=2;
   let response=null;
   if(event.receipt.responseSHA256){
    const body=fs.readFileSync(path.join(recordingDir,event.id+'.response.json'));assert.equal(pilot.sha(body),event.receipt.responseSHA256);
    try{response=JSON.parse(body);}catch{assert.equal(event.receipt.outcome,'invalid_json');}
   }
   if(response?.usage){for(const [source,target]of [['input_tokens','inputTokens'],['output_tokens','outputTokens']]){assert(Number.isSafeInteger(response.usage[source])&&response.usage[source]>=0);summary.usage[target]+=response.usage[source];}}
   if(event.answers){
    assert.equal(event.receipt.outcome,'received');const decision=policy.decision(state,response);
    assert.deepEqual(event.answers,decision.answers);assert.equal(event.action,decision.action);state=decision.successor;
    assert.deepEqual(trace.frames[i+1],state);summary.actions.valid++;
    const selected=event.truth.actions.find(a=>a.action===event.action);summary.actions.safe+=Number(!selected.capture);summary.actions.winningSuccessor+=Number(selected.avoidable);
    for(let z=0;z<2;z++){summary.zombiePredictions.valid++;summary.zombiePredictions.correct+=Number(event.answers['zombie'+(z+1)+'_move'].choice===event.truth.zombieMoves[z]);}
   }else{
    assert.equal(i,trace.decisions.length-1);assert(complete.halted);
    if(event.receipt.outcome==='received'){assert.throws(()=>policy.decision(state,response));assert.equal(trace.outcome,'invalid_response');summary.invalidResponses++;}
    else {assert.equal(trace.outcome,'service_failure');summary.serviceFailures++;}
   }
  }
  assert.equal(trace.frames.length,trace.decisions.filter(e=>e.answers).length+1);
  if(trace.outcome==='capture')assert.equal(state.status,'caught');
  else if(trace.outcome==='unresolved'){assert.equal(state.tick,12);assert.equal(state.status,'limit');}
  else assert(['not_started','invalid_response','service_failure','deadline'].includes(trace.outcome));
  const baseline=original.runs[index],common=Math.min(trace.frames.length,baseline.jev.frames.length);
  let firstTrajectoryDivergenceTick=null;for(let t=0;t<common;t++)if(!require('node:util').isDeepStrictEqual(trace.frames[t],baseline.jev.frames[t])){firstTrajectoryDivergenceTick=t;break;}
  const loss=trace.decisions.find(e=>e.answers&&e.truth.rank===-1&&!e.truth.actions.find(a=>a.action===e.action).avoidable);
  return {...start,original:baseline.jev,policy:trace,controls:baseline.controls,comparison:{firstTrajectoryDivergenceTick,firstOriginalLossTick:baseline.firstLossTick,firstPolicyLossTick:loss?loss.before.tick+1:null,bothCapturedTickDifference:trace.outcome==='capture'&&baseline.jev.outcome==='capture'?state.tick-baseline.jev.frames.at(-1).tick:null}};
 });
 assert.deepEqual(visited,ledger.map(e=>e.id),'Every admitted request must be retained exactly once');
 assert.equal(recording.price.inputUSDPerMillion,.042);assert.equal(recording.price.outputFree,true);
 summary.usage.estimatedUSD=summary.usage.inputTokens*recording.price.inputUSDPerMillion/1e6;
 const sorted=latencies.slice().sort((a,b)=>a-b),n=sorted.length;
 summary.latencyMs={n,min:n?sorted[0]:null,median:n?(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2:null,mean:n?sorted.reduce((a,b)=>a+b,0)/n:null,max:n?sorted.at(-1):null};
 return {schemaVersion:1,experiment:'ZL-016',prerecorded:true,model:manifest.model,manifest,recording,baselineRecording:original.recording,comparisonLimit:'Same starts, historical original recordings; not randomized or paired in service time. Two previously inspected starts; no training or general intelligence claim.',summary:{original:original.summary,policy:summary},runs};
}
function build(out){
 const started=process.hrtime.bigint(),data=collect();
 data.buildCommit=process.env.PREVIEW_COMMIT||cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
 fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'jev-policy.json'),JSON.stringify(data,null,2)+'\n');
 fs.writeFileSync(path.join(out,'jev-policy-data.js'),'globalThis.ZL_POLICY_DATA='+JSON.stringify(data).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+';\n');
 const rows=[['run','policy','tick','human_x','human_y','z1_x','z1_y','z2_x','z2_y','status','human_action','predicted_z1','actual_z1','predicted_z2','actual_z2']];
 for(const r of data.runs)for(const [name,trace]of Object.entries({original:r.original,policy:r.policy,...r.controls}))for(const f of trace.frames){
  const e=trace.decisions&&f.tick>0?trace.decisions[f.tick-1]:null;
  rows.push([r.id,name,f.tick,f.human.x,f.human.y,...f.zombies.flatMap(z=>[z.x,z.y]),f.status,e?.action??'',e?.answers?.zombie1_move?.choice??'',e?.truth?.zombieMoves[0]??'',e?.answers?.zombie2_move?.choice??'',e?.truth?.zombieMoves[1]??'']);
 }
 fs.writeFileSync(path.join(out,'jev-policy.csv'),rows.map(r=>r.join(',')).join('\n')+'\n');
 for(const file of ['jev-policy.html','jev-policy-view.js','experiments/ZL-016-protocol.md','experiments/ZL-016-policy.md']){fs.mkdirSync(path.dirname(path.join(out,file)),{recursive:true});fs.copyFileSync(path.join(ROOT,file),path.join(out,file));}
 for(const name of ['jev-policy','jev-controller'])fs.cpSync(path.join(ROOT,'evidence',name),path.join(out,'evidence',name),{recursive:true,filter:p=>!p.endsWith('run.lock')});
 for(const name of ['index.html','jev-controller.html']){
  const file=path.join(out,name);if(fs.existsSync(file)){const html=fs.readFileSync(file,'utf8');if(!html.includes('href="jev-policy.html"'))fs.writeFileSync(file,html.replace('<body>','<body><p><a href="jev-policy.html">ZL-016 · Original vs policy-guided prompt</a></p>'));}
 }
 fs.writeFileSync(path.join(out,'jev-policy-build.json'),JSON.stringify({elapsedMs:Number(process.hrtime.bigint()-started)/1e6,maxRSSKiB:process.resourceUsage().maxRSS})+'\n');
 return data;
}
module.exports={collect,build};
if(require.main===module)console.log(JSON.stringify(build(path.resolve(process.argv[2]||'preview')).summary));
