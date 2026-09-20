"use strict";
// CI/public build: frozen local files only. Never import or execute run-jev.py.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const pilot=require('./jev-pilot.cjs'),{evaluate}=require('./evaluate-jev.cjs');
const ROOT=pilot.ROOT,DIR=path.join(ROOT,'evidence/jev'),FROZEN=path.join(DIR,'frozen');
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function frozen(){
  const manifest=read(path.join(FROZEN,'manifest.json')),bytes=fs.readFileSync(path.join(FROZEN,'dataset.json')),dataset=JSON.parse(bytes);
  assert.equal(pilot.sha(bytes),manifest.datasetSHA256,'Dataset hash mismatch');
  assert.deepEqual(JSON.parse(JSON.stringify(pilot.buildDataset())),dataset,'Frozen production dataset changed');
  for(const [p,hash]of Object.entries(dataset.sourceHashes))assert.equal(pilot.sha(fs.readFileSync(path.join(ROOT,p))),hash,'Oracle source hash mismatch');
  for(const row of manifest.requests){
    const bytes=fs.readFileSync(path.join(FROZEN,row.file));assert.equal(pilot.sha(bytes),row.sha256,'Request hash mismatch');
    assert.equal(bytes.toString(),JSON.stringify(pilot.requestFor(dataset.samples.find(s=>s.id===row.id))),'Frozen prompt changed');
  }
  assert.equal(require('./verify-jev-reference.cjs').verify().datasetSHA256,manifest.datasetSHA256);
  return {manifest,dataset};
}
function readRecording(directory=path.join(DIR,'recording')){
  const {manifest,dataset}=frozen(),run=read(path.join(directory,'run.json'));
  assert.equal(run.manifestSHA256,pilot.sha(fs.readFileSync(path.join(FROZEN,'manifest.json'))),'Run manifest hash mismatch');
  const admissions=fs.readFileSync(path.join(directory,'admission.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  assert(admissions.length<=24);assert.equal(new Set(admissions.map(a=>a.id)).size,admissions.length);
  const responses={},receipts=[];
  for(const [i,a]of admissions.entries()){
    const request=manifest.requests.find(r=>r.id===a.id);assert(request,'Unexpected admission ID');
    assert.equal(a.number,i+1);assert.equal(a.requestSHA256,request.sha256,'Admission hash mismatch');
    const file=path.join(directory,a.id+'.receipt.json');
    if(!fs.existsSync(file)){receipts.push({...a,outcome:'admitted_without_receipt',latencyMs:null});continue;}
    const r=read(file);assert.equal(r.id,a.id);assert.equal(r.number,a.number);assert.equal(r.requestSHA256,a.requestSHA256);
    if(r.responseSHA256){
      const raw=fs.readFileSync(path.join(directory,a.id+'.response.json'));assert.equal(pilot.sha(raw),r.responseSHA256,'Response hash mismatch');assert.equal(raw.length,r.responseBytes);
      if(r.httpStatus===200)try{responses[a.id]=JSON.parse(raw);}catch{/* Invalid JSON remains missing in the denominator. */}
    }
    receipts.push(r);
  }
  const completePath=path.join(directory,'complete.json'),complete=fs.existsSync(completePath)?read(completePath):null;
  if(complete)assert.equal(complete.admitted,admissions.length);
  return {dataset,responses,receipts,run,complete};
}
function recordingData(){
  const r=readRecording(),data=evaluate(r.dataset,r.responses),latencies=r.receipts.map(r=>r.latencyMs).filter(Number.isFinite).sort((a,b)=>a-b);
  data.metadata.recording=r.run;data.metadata.datasetSHA256=pilot.sha(fs.readFileSync(path.join(FROZEN,'dataset.json')));
  data.metadata.manifestSHA256=pilot.sha(fs.readFileSync(path.join(FROZEN,'manifest.json')));
  data.summary.recording={admitted:r.receipts.length,received:r.receipts.filter(r=>r.outcome==='received').length,serviceOrFormatFailures:r.receipts.filter(r=>r.outcome!=='received').length,unattempted:24-r.receipts.length,complete:r.complete!==null,elapsedMs:r.complete?.elapsedMs??null,latencyMs:{count:latencies.length,min:latencies[0]??null,median:latencies.length?(latencies[Math.floor((latencies.length-1)/2)]+latencies[Math.floor(latencies.length/2)])/2:null,max:latencies.at(-1)??null,mean:latencies.length?latencies.reduce((a,b)=>a+b,0)/latencies.length:null}};
  for(const row of data.results)row.receipt=r.receipts.find(r=>r.id===row.id)??null;
  return data;
}
function csv(data){
  const rows=[['sample','stateIndex','question','type','probabilityYes','choice','truth','valid','correct','distribution']];
  for(const r of data.results){
    for(let i=0;i<2;i++){const z=r.zombiePredictions[i];rows.push([r.id,r.stateIndex,`zombie${i+1}_move`,'choice','',z.answer?.choice??'',z.truth,!!z.answer,z.correct,JSON.stringify(z.answer?.probabilities??{})]);}
    for(const a of r.actions)for(const [k,p,t]of [['capture',a.captureProbability,a.capture],['avoid',a.avoidabilityProbability,a.avoidable]])rows.push([r.id,r.stateIndex,k+'_'+a.action,'noul',p??'','',t,p!==null,p!==null&&(p>=.5)===t,'']);
    rows.push([r.id,r.stateIndex,'human_action','choice','',r.selectedAction??'',r.canonicalAction,!!r.humanChoice,!!r.humanChoice&&r.optimalActions.includes(r.selectedAction),JSON.stringify(r.humanChoice?.probabilities??{})]);
  }
  return rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
}
function build(out){
  const started=process.hrtime.bigint(),data=recordingData();
  data.metadata.buildCommit=process.env.PREVIEW_COMMIT||cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
  data.metadata.buildSourceHashes=Object.fromEntries(['scripts/build-jev.cjs','scripts/evaluate-jev.cjs','scripts/jev-pilot.cjs','scripts/verify-jev-reference.cjs','jev.html','jev-view.js'].map(p=>[p,pilot.sha(fs.readFileSync(path.join(ROOT,p)))]));
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'jev.json'),JSON.stringify(data,null,2)+'\n');
  fs.writeFileSync(path.join(out,'jev-data.js'),'globalThis.ZL_JEV_DATA='+JSON.stringify(data).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'))+';\n');
  fs.writeFileSync(path.join(out,'jev.csv'),csv(data));
  for(const file of ['jev.html','jev-view.js','experiments/ZL-014-protocol.md','experiments/ZL-014-jev.md']){
    const dest=path.join(out,file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(ROOT,file),dest);
  }
  fs.cpSync(DIR,path.join(out,'evidence/jev'),{recursive:true,filter:src=>!src.endsWith('run.lock')});
  const resources={elapsedMs:Number(process.hrtime.bigint()-started)/1e6,maxRSSKiB:process.resourceUsage().maxRSS,currentRSSBytes:process.memoryUsage().rss};
  fs.writeFileSync(path.join(out,'jev-build-receipt.json'),JSON.stringify(resources,null,2)+'\n');
  return data;
}
module.exports={build,readRecording,recordingData,csv};
if(require.main===module){const out=path.resolve(process.argv[2]||'preview');const data=build(out);console.log(JSON.stringify({out,summary:data.summary}));}
