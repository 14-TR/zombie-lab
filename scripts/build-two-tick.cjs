"use strict";
function failureAnalysis(run,ranks,anySafe){
  if(run.outcome!=="capture")return null;
  const initialContact=run.stopTick===0;
  let firstLossTick=null;
  for(let t=1;t<run.indices.length;t++)if(ranks[run.indices[t-1]]===-1&&ranks[run.indices[t]]>=0){firstLossTick=t;break;}
  return {initialContact,immediate:run.stopTick===1,firstLossTick,
    lossBeforeCapture:firstLossTick!==null&&firstLossTick<run.stopTick,
    finalAnySafe:initialContact?null:anySafe(run.indices.at(-2))};
}
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),assert=require("node:assert/strict");
const legacy=require("./build-neural.cjs"),neural=require("../neural-policy.js"),filter=require("../two-tick-policy.js"),one=require("../one-tick-policy.js");
const ROOT=path.resolve(__dirname,".."),COUNT=343000;
const hash=x=>crypto.createHash("sha256").update(x).digest("hex");
const scalar=run=>({outcome:run.outcome,stopTick:run.stopTick,cycleStart:run.cycleStart,period:run.period});
const cell=p=>p.y*10+p.x;
const index=s=>(cell(s.zombies[0])*70+cell(s.zombies[1]))*70+cell(s.human);
function freeze(x){if(x&&typeof x==="object"){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
function timing(world,model){
  const indices=Array.from({length:256},(_,k)=>{let i=Math.floor(k*COUNT/256);while(world.terminals[i])i=(i+1)%COUNT;return i;});
  const states=indices.map(world.stateAt),names=["neural","oneTick","filtered","depth1","depth2"];
  const choose={neural:s=>neural.chooseHuman(s,model),oneTick:s=>one.chooseHuman(s,model,world.pair),filtered:s=>filter.chooseHuman(s,model,world.pair),
    depth1:s=>world.pair.chooseHuman(s,"depth1"),depth2:s=>world.pair.chooseHuman(s,"depth2"),overhead:s=>s.human};
  let checksum=0;
  const batch=name=>{const start=process.hrtime.bigint();for(const s of states)checksum+=cell(choose[name](s));return Number(process.hrtime.bigint()-start)/1e6;};
  const samples=Object.fromEntries([...names,"overhead"].map(p=>[p,[]]));
  for(let r=0;r<3;r++)for(const p of Object.keys(samples))batch(p);
  for(let r=0;r<11;r++)for(const p of [...names.slice(r%5),...names.slice(0,r%5),"overhead"])samples[p].push(batch(p));
  return {batchSize:256,warmups:3,repeats:11,stateIndices:indices,checksum,
    method:"Uncached same-realm choices; five-policy rotating order; loop/call/checksum overhead measured, not subtracted. No model loading, solver, sweep cache or training timed.",
    host:{platform:process.platform,arch:process.arch,node:process.version,cpu:require("node:os").cpus()[0].model},
    policies:Object.fromEntries(Object.entries(samples).map(([p,v])=>{const sorted=v.slice().sort((a,b)=>a-b);return [p,{batchMilliseconds:v,medianMicrosecondsPerDecision:sorted[5]*1000/256,minMicrosecondsPerDecision:sorted[0]*1000/256,maxMicrosecondsPerDecision:sorted.at(-1)*1000/256}];}))};
}
function sourceDirty(files){
  return files.some(file=>{try{
    const committed=require("node:child_process").execFileSync("git",["show","HEAD:"+file],{cwd:ROOT,stdio:["ignore","pipe","ignore"]});
    return !committed.equals(fs.readFileSync(path.join(ROOT,file)));
  }catch{return true;}});
}
function build(options={}){return legacy.withWatchdog(()=>buildCore(options));}
function buildCore(options){
  const started=process.hrtime.bigint(),fixture=options.fixture===true;
  if(!fixture&&("indices" in options||"model" in options))throw new Error("Custom model/domain requires fixture mode");
  const resources=()=>{const elapsedMs=Number(process.hrtime.bigint()-started)/1e6,usage=process.resourceUsage();
    if(usage.maxRSS*1024>=512*1024*1024)throw new Error("512 MiB RSS bound exceeded");
    if(elapsedMs>=840000)throw new Error("840s wall bound exceeded");
    return {elapsedMs,maxRSSKiB:usage.maxRSS,currentRSSBytes:process.memoryUsage().rss,userCPUTimeUs:usage.userCPUTime,systemCPUTimeUs:usage.systemCPUTime};};
  const modelBytes=fs.readFileSync(path.join(ROOT,"models/feed-forward.json"));
  assert.equal(hash(modelBytes),"c2c007bcb27c68e7f52d61d8e21c3d2003c7331ccb16b84aa46adef87de48275");
  const model=freeze(fixture?options.model:JSON.parse(modelBytes)),world=legacy.createWorld();
  neural.validateModel(model);
  const certificateBytes=fs.readFileSync(path.join(ROOT,"evidence/avoidability/data/avoidability-certificate.json")),certificate=JSON.parse(certificateBytes);
  for(const [file,digest] of Object.entries(certificate.metadata.sourceHashes))assert.equal(hash(fs.readFileSync(path.join(ROOT,file))),digest);
  const ranks=Int32Array.from(certificate.ranks);assert.equal(ranks.length,COUNT);
  const choose={neural:s=>neural.chooseHuman(s,model),oneTick:s=>one.chooseHuman(s,model,world.pair),filtered:s=>filter.chooseHuman(s,model,world.pair),
    greedy:s=>world.pair.chooseHuman(s,"greedy"),depth1:s=>world.pair.chooseHuman(s,"depth1"),depth2:s=>world.pair.chooseHuman(s,"depth2")};
  const policies=Object.fromEntries(Object.entries(choose).map(([p,f])=>[p,world.policy(f)]));
  const verification={fixture,states:0,nonterminalDecisions:0,legalTransitions:0,directReplayRows:0,independentReplayRows:0,legacyRows:0,frameComparisons:0};
  const refNext=new Int32Array(COUNT).fill(-1),refNeural=new Int32Array(COUNT).fill(-1),refOne=new Int32Array(COUNT).fill(-1),anySafe=new Uint8Array(COUNT),anySafe2=new Uint8Array(COUNT);
  if(!fixture){
    const reference=require("./two-tick-reference.cjs"),frozen=JSON.parse(fs.readFileSync(path.join(ROOT,"evidence/two-tick/independent-freeze.json")));
    assert.equal(hash(fs.readFileSync(path.join(ROOT,"scripts/two-tick-reference.cjs"))),frozen.reference_sha256);
    const productionHash=crypto.createHash("sha256"),referenceHash=crypto.createHash("sha256"),frozenStream=crypto.createHash("sha256");
    verification.horizons={0:0,1:0,2:0};
    for(let i=0;i<COUNT;i++){
      if(i%4096===0)resources();verification.states++;
      assert.equal(Boolean(world.terminals[i]),reference.terminal(i),`terminal ${i}`);
      assert.equal(world.terminals[i]===1,ranks[i]===0,`rank contact ${i}`);
      if(world.terminals[i]){productionHash.update(`${i}:T\n`);referenceHash.update(`${i}:T\n`);const record=Buffer.alloc(47);record.writeUInt32LE(i,0);record[4]=1;for(let a=0;a<5;a++)record.writeInt32LE(-1,5+8*a);record.writeInt8(-1,45);frozenStream.update(record);continue;}
      const state=world.stateAt(i),inspected=filter.inspect(state,model,world.pair),ref=reference.decide(i,inspected.scores);
      assert.equal(inspected.action,ref.action,`decision ${i}`);assert.equal(inspected.horizon,ref.horizon,`fallback ${i}`);verification.nonterminalDecisions++;
      const candidates=new Map(inspected.candidates.map(c=>[c.action,c]));
      const record=Buffer.alloc(47);record.writeUInt32LE(i,0);for(let a=0;a<5;a++){const c=candidates.get(a),o=5+8*a;record.writeInt32LE(c?index(c.next):-1,o);record[o+4]=Number(c?.capture??false);record[o+5]=Number(c?.keep??false);record[o+6]=Number(c?.safe1??false);record[o+7]=Number(c?.safe2??false);}record.writeInt8(inspected.candidates.find(c=>c.keep).action,45);record[46]=inspected.horizon;frozenStream.update(record);verification.horizons[inspected.horizon]++;
      const successors=[];
      for(let a=0;a<5;a++){
        const candidate=candidates.get(a),n=candidate?index(candidate.next):-1,other=reference.transition(i,a);
        assert.equal(n,other,`transition ${i}/${a}`);
        assert.equal(candidate?.keep??false,ref.mask[a],`mask ${i}/${a}`);
        assert.equal(candidate?.safe1??false,ref.depth1[a],`depth1 ${i}/${a}`);assert.equal(candidate?.safe2??false,ref.depth2[a],`depth2 ${i}/${a}`);if(ref.depth2[a])anySafe2[i]=1;
        const captured=candidate?candidate.capture:false,refCaptured=other>=0&&reference.terminal(other);
        assert.equal(captured,refCaptured,`capture ${i}/${a}`);
        if(n>=0){verification.legalTransitions++;successors.push(n);if(!captured)anySafe[i]=1;}
        productionHash.update(`${i}:${a}:${n}:${Number(captured)}:${Number(candidate?.keep??false)}\n`);
        referenceHash.update(`${i}:${a}:${other}:${Number(refCaptured)}:${Number(ref.mask[a])}\n`);
      }
      const nextRanks=successors.map(n=>ranks[n]);
      assert(ranks[i]===-1?nextRanks.includes(-1):!nextRanks.includes(-1)&&ranks[i]===Math.max(...nextRanks)+1,`rank equation ${i}`);
      productionHash.update(`${i}:A:${inspected.action}\n`);referenceHash.update(`${i}:A:${ref.action}\n`);
      refNext[i]=reference.transition(i,ref.action);
      const oneDecision=one.inspect(state,model,world.pair),safe=ref.depth1.some(Boolean);let oneAction=-1;
      for(let a=0;a<5;a++)if(reference.transition(i,a)>=0&&(!safe||ref.depth1[a])&&(oneAction<0||inspected.scores[a]>inspected.scores[oneAction]))oneAction=a;
      assert.equal(oneDecision.action,oneAction,`one tick ${i}`);refOne[i]=reference.transition(i,oneAction);
      const neuralAction=world.legal[i%70].indexOf(cell(neural.chooseHuman(state,model)));
      refNeural[i]=reference.transition(i,neuralAction);
    }
    verification.frozenReferenceStreamSHA256=frozenStream.digest("hex");assert.equal(verification.frozenReferenceStreamSHA256,frozen.tests.evidence.stream_sha256,"frozen pre-production stream");
    verification.productionStreamSHA256=productionHash.digest("hex");verification.referenceStreamSHA256=referenceHash.digest("hex");
    assert.equal(verification.productionStreamSHA256,verification.referenceStreamSHA256);
    verification.streamEncoding="UTF8 ascending state: terminal i:T\\n; nonterminal 5 lines i:action:successor(-1 illegal):capture(0/1):retained(0/1)\\n, then i:A:chosenAction\\n";
  }
  const run=(i,p)=>{
    const cached=world.run(i,policies[p]),direct=world.runDirect(i,choose[p]);assert.deepEqual(cached,direct,`uncached ${i}/${p}`);
    verification.directReplayRows++;verification.frameComparisons+=direct.indices.length;
    if(!fixture&&(["neural","oneTick","filtered"].includes(p))){
      const table=p==="neural"?refNeural:p==="oneTick"?refOne:refNext;
      const referenceRun=legacy.trace(i,n=>table[n],n=>Boolean(world.terminals[n]));
      assert.deepEqual(cached,referenceRun,`independent ${i}/${p}`);verification.independentReplayRows++;
    }
    return cached;
  };
  const old=JSON.parse(fs.readFileSync(path.join(ROOT,"evidence/avoidability/data/avoidability.json"))).results;
  const original=fixture?options.indices.map(i=>({id:`fixture-${i}`,stateIndex:i})):old;
  const makeRow=(source,names)=>{
    const i=source.stateIndex,state=world.stateAt(i),row={id:source.id,stateIndex:i,human:{...state.human},zombie1:{...state.zombies[0]},zombie2:{...state.zombies[1]},
      split:legacy.groupSplit(Math.floor(i/4900),Math.floor(i/70)%70),avoidable:ranks[i]===-1,maxCaptureTicks:ranks[i]<0?null:ranks[i],policies:{}};
    for(const p of names){const result=run(i,p);row.policies[p]=scalar(result);
      if(p==="filtered"){
        row.failure=failureAnalysis(result,ranks,n=>fixture?filter.inspect(world.stateAt(n),model,world.pair).candidates.some(c=>c.safe1):Boolean(anySafe[n]));
        if(row.failure)row.failure.finalAnySafe2=result.stopTick===0?null:(fixture?filter.inspect(world.stateAt(result.indices.at(-2)),model,world.pair).candidates.some(c=>c.safe2):Boolean(anySafe2[result.indices.at(-2)]));
      }
      if(!fixture&&source.policies&&p in source.policies){assert.deepEqual(row.policies[p],source.policies[p]);verification.legacyRows++;}
    }
    return row;
  };
  const names=["greedy","depth1","depth2","neural","oneTick","filtered"];
  const results=original.map(r=>makeRow(r,names));
  const heldoutResults=[];
  if(!fixture)for(let i=0;i<COUNT;i++)if(legacy.groupSplit(Math.floor(i/4900),Math.floor(i/70)%70)==="test")heldoutResults.push(makeRow({id:`state-${i}`,stateIndex:i},["neural","oneTick","filtered"]));
  if(!fixture){assert.equal(results.length,4761);assert.equal(new Set(results.map(r=>r.id)).size,4761);assert.equal(heldoutResults.length,37730);}
  const reasons=new Map(),first=(fn,why)=>{const r=results.find(fn);if(r)reasons.set(r.id,[...(reasons.get(r.id)||[]),why]);};
  for(const p of ["neural","oneTick","depth1","depth2","greedy"]){
    first(r=>r.avoidable&&r.policies[p].outcome==="capture"&&r.policies.filtered.outcome==="cycle",`recovery-${p}`);
    first(r=>r.policies[p].outcome==="cycle"&&r.policies.filtered.outcome==="capture",`regression-${p}`);
  }
  first(r=>r.policies.filtered.outcome==="cycle","first-filtered-cycle");
  first(r=>r.avoidable&&r.policies.filtered.outcome==="capture","first-remaining-avoidable-capture");
  first(r=>!r.avoidable&&r.maxCaptureTicks>0,"first-noninitial-unavoidable");
  first(r=>r.maxCaptureTicks===0,"first-initial-contact");
  const witnesses=results.filter(r=>reasons.has(r.id)).map(row=>({id:row.id,reasons:reasons.get(row.id),runs:Object.fromEntries(["neural","oneTick","filtered"].map(p=>{
    const r=world.run(row.stateIndex,policies[p]);
    let loss=null;for(let t=1;t<r.indices.length;t++)if(ranks[r.indices[t-1]]===-1&&ranks[r.indices[t]]>=0){const before=r.indices[t-1],s=world.stateAt(before),decision=(p==="filtered"?filter:one).inspect(s,model,world.pair);loss={tick:t,before,after:r.indices[t],afterRank:ranks[r.indices[t]],candidates:decision.candidates.map(c=>({action:c.action,stateIndex:index(c.next),rank:ranks[index(c.next)],safe1:c.safe1??!c.capture,safe2:c.safe2??null,keep:p==="neural"?true:c.keep}))};break;}
    return [p,{...scalar(r),frames:world.frames(r.indices),loss}];}))}));
  const failures=rows=>({captured:rows.filter(r=>r.failure).length,initialContact:rows.filter(r=>r.failure?.initialContact).length,
    immediate:rows.filter(r=>r.failure?.immediate).length,delayed:rows.filter(r=>r.failure&&!r.failure.initialContact&&!r.failure.immediate).length,
    lostAvoidability:rows.filter(r=>r.failure?.firstLossTick!==null&&r.failure?.firstLossTick!==undefined).length,
    lossBeforeCapture:rows.filter(r=>r.failure?.lossBeforeCapture).length,finalAnySafe:rows.filter(r=>r.failure?.finalAnySafe).length,finalAnySafe2:rows.filter(r=>r.failure?.finalAnySafe2).length});
  const overlap={};
  for(const p of ["neural","oneTick","filtered"])overlap[p]=legacy.trajectoryOverlap((function*(){for(const r of heldoutResults)yield world.run(r.stateIndex,policies[p]).indices;})());
  const sourceFiles=["two-zombies.js","neural-policy.js","one-tick-policy.js","two-tick-policy.js","scripts/build-neural.cjs","scripts/build-two-tick.cjs","experiments/ZL-013-protocol.md"];
  if(!fixture)sourceFiles.push("scripts/two-tick-reference.cjs","evidence/two-tick/independent-freeze.json");
  const git=require("node:child_process");
  const metadata={fixture,commit:process.env.PREVIEW_COMMIT||git.execFileSync("git",["rev-parse","HEAD"],{cwd:ROOT,encoding:"utf8"}).trim(),
    worktreeDirty:sourceDirty([...sourceFiles,"models/feed-forward.json"]),sourceIdentityScope:"Hashed evaluator sources and frozen model versus HEAD; generated output files excluded",
    protocolCommit:"48f762a5c9e954f7378a19eb30b9fe879454d670",modelSHA256:hash(modelBytes),certificateSHA256:hash(certificateBytes),
    sourceHashes:Object.fromEntries(sourceFiles.map(f=>[f,hash(fs.readFileSync(path.join(ROOT,f)))])),safetyCutoff:10000,
    heldoutScope:"Frozen ZL-011 training split; previously evaluated configurations, not untouched test data or held-out trajectories. Neural vs one-tick vs two-tick only; no held-out planner comparison."};
  const data={schemaVersion:1,metadata,summary:{original:legacy.summarize(results,names),heldout:legacy.summarize(heldoutResults,["neural","oneTick","filtered"]),
    comparisons:Object.fromEntries(["neural","oneTick","depth1","depth2","greedy"].map(p=>[p,legacy.comparePolicies(results,p,"filtered")])),
    heldoutComparison:legacy.comparePolicies(heldoutResults,"oneTick","filtered"),heldoutComparisons:Object.fromEntries(["neural","oneTick"].map(p=>[p,legacy.comparePolicies(heldoutResults,p,"filtered")])),failures:{original:failures(results),heldout:failures(heldoutResults)},overlap,
    verification,latency:fixture?null:timing(world,model)},results,witnesses};
  for(const [domain,rows,comparators]of [["original",results,["neural","oneTick","depth1","depth2","greedy"]],["heldout",heldoutResults,["neural","oneTick"]]]){
    const target=domain==="original"?data.summary.comparisons:data.summary.heldoutComparisons;
    for(const p of comparators){target[p].recoveryIDs=rows.filter(r=>r.avoidable&&r.policies[p].outcome==="capture"&&r.policies.filtered.outcome==="cycle").map(r=>r.id);target[p].regressionIDs=rows.filter(r=>r.policies[p].outcome==="cycle"&&r.policies.filtered.outcome==="capture").map(r=>r.id);}
  }
  assert.equal(hash(fs.readFileSync(path.join(ROOT,"models/feed-forward.json"))),metadata.modelSHA256);
  Object.defineProperty(data,"heldoutResults",{value:heldoutResults});Object.defineProperty(data,"resources",{value:resources()});return data;
}
function emit(data,out){
  const emitStarted=process.hrtime.bigint();fs.mkdirSync(out,{recursive:true});
  const text=JSON.stringify(data),heldout=JSON.stringify({schemaVersion:1,metadata:data.metadata,summary:data.summary.heldout,comparison:data.summary.heldoutComparison,results:data.heldoutResults});
  const artifacts={"two-tick.json":text+"\n","two-tick-data.js":"window.ZL_TWO_TICK_DATA="+text.replace(/[<>&\u2028\u2029]/g,c=>"\\u"+c.charCodeAt(0).toString(16).padStart(4,"0"))+";\n","two-tick-heldout.json":heldout+"\n"};
  const artifactBytes=Object.fromEntries(Object.entries(artifacts).map(([n,t])=>[n,Buffer.byteLength(t)]));
  const outputBytes=Object.values(artifactBytes).reduce((a,b)=>a+b,0);assert(outputBytes<30000000,"30 MB artifact bound");
  for(const [n,t]of Object.entries(artifacts))fs.writeFileSync(path.join(out,n),t);
  const context={window:{}};require("node:vm").runInNewContext(artifacts["two-tick-data.js"],context,{timeout:5000});assert.equal(JSON.stringify(context.window.ZL_TWO_TICK_DATA),text);
  const finalResources={elapsedMs:(data.resources.elapsedMs||0)+Number(process.hrtime.bigint()-emitStarted)/1e6,maxRSSKiB:process.resourceUsage().maxRSS,currentRSSBytes:process.memoryUsage().rss};
  assert(finalResources.maxRSSKiB*1024<512*1024*1024,"512 MiB serialization RSS bound");
  const receipt={metadata:data.metadata,summary:data.summary,resources:data.resources,finalResources,artifactBytes,outputBytes,artifactHashes:Object.fromEntries(Object.entries(artifacts).map(([n,t])=>[n,hash(t)])),emittedParity:true};
  fs.writeFileSync(path.join(out,"two-tick-evaluation.json"),JSON.stringify(receipt,null,2)+"\n");return receipt;
}
module.exports={failureAnalysis,build,emit,sourceDirty};
if(require.main===module){
  const args=process.argv.slice(2);if(args.length!==2||args[0]!=="--out-dir")throw new Error("Usage: node scripts/build-two-tick.cjs --out-dir DIR");
  console.log(JSON.stringify(emit(build(),path.resolve(args[1]))));
}
