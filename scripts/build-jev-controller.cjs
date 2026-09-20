"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process');
const pilot=require('./jev-pilot.cjs'),controller=require('./jev-controller.cjs');
const ROOT=pilot.ROOT,DIR=path.join(ROOT,'evidence/jev-controller'),REC=path.join(DIR,'recording'),read=p=>JSON.parse(fs.readFileSync(p));
function collect(){
 const manifest=read(path.join(DIR,'frozen/manifest.json')),complete=read(path.join(REC,'complete.json'));
 for(const [f,h]of Object.entries(manifest.sourceHashes))assert.equal(pilot.sha(fs.readFileSync(path.join(ROOT,f))),h,'Frozen controller source changed');
 const ledger=fs.readFileSync(path.join(REC,'admission.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.equal(ledger.length,complete.admitted);assert(ledger.length<=24);assert.equal(new Set(ledger.map(x=>x.id)).size,ledger.length);
 const summary={admitted:ledger.length,maxRequests:24,zombiePredictions:{correct:0,valid:0,total:0},actions:{valid:0,safe:0,winningSuccessor:0},usage:{inputTokens:0,outputTokens:0,estimatedUSD:0},elapsedMs:complete.elapsedMs};
 const runs=manifest.starts.map(start=>{
  const file=path.join(REC,start.id+'.trajectory.json'),jev=fs.existsSync(file)?read(file):{id:start.id,frames:[start.state],decisions:[],outcome:'not_started'};
  assert.deepEqual(jev.frames[0],start.state);let state=start.state;
  for(const [i,e]of jev.decisions.entries()){
   assert.deepEqual(e.before,state);const req=controller.request(state),raw=fs.readFileSync(path.join(REC,e.id+'.request.json'));
   assert.deepEqual(JSON.parse(raw),req);assert.equal(pilot.sha(raw),e.receipt.requestSHA256);
   const admission=ledger.find(a=>a.id===e.id);assert(admission);assert.equal(admission.requestSHA256,e.receipt.requestSHA256);
   assert.deepEqual(read(path.join(REC,e.id+'.receipt.json')),e.receipt);
   const rawResponse=fs.readFileSync(path.join(REC,e.id+'.response.json'));assert.equal(pilot.sha(rawResponse),e.receipt.responseSHA256);
   assert.deepEqual(controller.facts(state),e.truth);assert.equal(e.reference.valid,true);assert.equal(e.reference.oracleSHA256,manifest.sourceHashes['evidence/jev/independent-reference/oracle.py']);
   const response=JSON.parse(rawResponse);summary.usage.inputTokens+=response.usage?.input_tokens??0;summary.usage.outputTokens+=response.usage?.output_tokens??0;
   summary.zombiePredictions.total+=2;
   if(e.answers){const decision=controller.decision(state,response);assert.deepEqual(decision.answers,e.answers);assert.equal(decision.action,e.action);state=decision.successor;assert.deepEqual(jev.frames[i+1],state);summary.actions.valid++;
    const selected=e.truth.actions.find(a=>a.action===e.action);summary.actions.safe+=Number(!selected.capture);summary.actions.winningSuccessor+=Number(selected.avoidable);
    for(let j=0;j<2;j++){const answer=e.answers['zombie'+(j+1)+'_move'];summary.zombiePredictions.valid+=Number(!!answer);summary.zombiePredictions.correct+=Number(answer?.choice===e.truth.zombieMoves[j]);}
   }
  }
  assert.equal(jev.frames.length,jev.decisions.filter(d=>d.answers).length+1);
  const controls=Object.fromEntries(['greedy','depth2'].map(p=>[p,controller.control(start.state,p)]));
  const firstLoss=jev.decisions.find(e=>e.answers&&e.truth.rank===-1&&!e.truth.actions.find(a=>a.action===e.action).avoidable);
  return {...start,jev,controls,firstLossTick:firstLoss?firstLoss.before.tick+1:null,identicalToGreedy:require('node:util').isDeepStrictEqual(jev.frames,controls.greedy.frames)};
 });
 summary.usage.estimatedUSD=summary.usage.inputTokens*.042/1e6;
 return {schemaVersion:1,prerecorded:true,model:manifest.model,manifest,recording:read(path.join(REC,'run.json')),summary,runs};
}
function build(out){
 const start=process.hrtime.bigint(),data=collect();data.buildCommit=process.env.PREVIEW_COMMIT||cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'jev-controller.json'),JSON.stringify(data,null,2)+'\n');
 fs.writeFileSync(path.join(out,'jev-controller-data.js'),'globalThis.ZL_CONTROLLER_DATA='+JSON.stringify(data).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+';\n');
 const rows=[['run','policy','tick','human_x','human_y','z1_x','z1_y','z2_x','z2_y','status','human_action','predicted_z1','actual_z1','predicted_z2','actual_z2']];
 for(const r of data.runs)for(const [name,trace]of Object.entries({jev:r.jev,...r.controls}))for(const f of trace.frames){const e=name==='jev'&&f.tick>0?r.jev.decisions[f.tick-1]:null;rows.push([r.id,name,f.tick,f.human.x,f.human.y,...f.zombies.flatMap(z=>[z.x,z.y]),f.status,e?.action??'',e?.answers?.zombie1_move?.choice??'',e?.truth?.zombieMoves[0]??'',e?.answers?.zombie2_move?.choice??'',e?.truth?.zombieMoves[1]??'']);}
 fs.writeFileSync(path.join(out,'jev-controller.csv'),rows.map(r=>r.join(',')).join('\n')+'\n');
 for(const file of ['jev-controller.html','jev-controller-view.js','experiments/ZL-015-protocol.md','experiments/ZL-015-controller.md']){fs.mkdirSync(path.dirname(path.join(out,file)),{recursive:true});fs.copyFileSync(path.join(ROOT,file),path.join(out,file));}
 fs.cpSync(DIR,path.join(out,'evidence/jev-controller'),{recursive:true,filter:p=>!p.endsWith('run.lock')});
 const index=path.join(out,'index.html');if(fs.existsSync(index)){let html=fs.readFileSync(index,'utf8');if(!html.includes('href="jev-controller.html"'))fs.writeFileSync(index,html.replace('<body>','<body><p><a href="jev-controller.html">ZL-015 · Jev controls the human</a></p>'));}
 fs.writeFileSync(path.join(out,'jev-controller-build.json'),JSON.stringify({elapsedMs:Number(process.hrtime.bigint()-start)/1e6,maxRSSKiB:process.resourceUsage().maxRSS})+'\n');return data;
}
module.exports={collect,build};if(require.main===module)console.log(JSON.stringify(build(path.resolve(process.argv[2]||'preview')).summary));
