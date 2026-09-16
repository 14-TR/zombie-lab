"use strict";
const {test}=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs");
const neural=require("../neural-policy.js");
const pair=new Function("globalThis",fs.readFileSync(require("node:path").join(__dirname,"../two-zombies.js"),"utf8")+";return globalThis.ZombiePair")({});
const point=id=>({x:id%10,y:Math.floor(id/10)});
const state=(h,a,b)=>({width:10,height:7,human:point(h),zombies:[point(a),point(b)],tick:0,tickLimit:10000,status:"running"});
const model=scores=>({schemaVersion:1,architecture:[6,32,5],seed:17,epoch:40,W1:Array.from({length:6},()=>Array(32).fill(0)),b1:Array(32).fill(0),W2:Array.from({length:32},()=>Array(5).fill(0)),b2:scores});
test("one tick rejects high-scoring immediate contact but preserves original logits",()=>{
  const filter=require("../one-tick-policy.js"), s=state(0,2,69), m=model([0,10,9,0,0]);
  assert.deepEqual(neural.chooseHuman(s,m),point(1));
  assert.deepEqual(filter.chooseHuman(s,m,pair),point(10));
  const inspected=filter.inspect(s,m,pair);
  assert.deepEqual(inspected.scores,[0,10,9,0,0]);
  assert.deepEqual(inspected.candidates.map(c=>[c.action,c.capture,c.keep]),[[1,true,false],[2,false,true],[4,true,false]]);
});
test("all-unsafe fallback, first ties, terminal and clock semantics",()=>{
  const filter=require("../one-tick-policy.js"), m=model([0,10,9,0,0]);
  const allUnsafe=filter.inspect(state(0,11,20),m,pair);
  assert(allUnsafe.candidates.every(c=>c.capture&&c.keep));
  assert.deepEqual(allUnsafe.human,point(1));
  assert.deepEqual(filter.chooseHuman(state(33,0,69),model([1,1,1,1,1]),pair),point(23));
  assert.deepEqual(filter.chooseHuman(state(0,1,69),m,pair),point(0));
  assert.deepEqual(filter.chooseHuman({...state(0,2,69),status:"caught"},m,pair),point(0));
  assert.deepEqual(filter.chooseHuman({...state(0,2,69),tick:9999,tickLimit:9999},m,pair),point(10));
  assert.throws(()=>filter.chooseHuman({...state(0,2,69),width:11},m,pair),/Invalid/);
});
test("failure analysis separates first capture, delayed loss and no safe final action",()=>{
  const {failureAnalysis}=require("./build-one-tick.cjs");
  const ranks=[-1,-1,1,0], run={outcome:"capture",stopTick:3,indices:[0,1,2,3]};
  const result=failureAnalysis(run,ranks,()=>false);
  assert.deepEqual(result,{initialContact:false,immediate:false,firstLossTick:2,lossBeforeCapture:true,finalAnySafe:false});
  assert.equal(failureAnalysis({outcome:"cycle",indices:[0,1,0]},ranks,()=>false),null);
});
test("bounded synthetic evaluation retains every scalar and both complete witness endpoints",()=>{
  const builder=require("./build-one-tick.cjs");
  assert.equal(typeof builder.build,"function");
  const result=builder.build({fixture:true,indices:[(42*70)*70+1,(42*70)*70+3],model:model([0,10,9,0,0])});
  assert.equal(result.results.length,2);
  assert.equal(result.metadata.fixture,true);
  assert(result.witnesses.length>0);
  for(const w of result.witnesses)for(const p of ["neural","filtered"]){
    assert.equal(w.runs[p].frames.length,w.runs[p].stopTick+1);
    assert.equal(w.runs[p].frames[0].tick,0);
  }
  assert.throws(()=>builder.build({indices:[1]}),/fixture/);
});
test("export verifies classic payload and measures the serialization peak",()=>{
  const {emit}=require("./build-one-tick.cjs"),os=require("node:os"),path=require("node:path");
  const out=fs.mkdtempSync(path.join(os.tmpdir(),"zl012-emit-"));
  try{const receipt=emit({schemaVersion:1,metadata:{fixture:true},summary:{heldout:{}},results:[],witnesses:[],heldoutResults:[],resources:{}},out);
    assert.equal(receipt.emittedParity,true);assert(receipt.finalResources.maxRSSKiB>0);
  }finally{fs.rmSync(out,{recursive:true});}
});
test("source dirtiness ignores generated artifacts but detects new evaluator source",()=>{
  const {sourceDirty}=require("./build-one-tick.cjs");
  assert.equal(typeof sourceDirty,"function");
  assert.equal(sourceDirty(["two-zombies.js"]),false);
  assert.equal(sourceDirty(["absent-zl012-source.js"]),true);
});
module.exports={pair,point,state,model};
