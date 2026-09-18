"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const pair=new Function("globalThis",fs.readFileSync(path.join(__dirname,"../two-zombies.js"),"utf8")+";return globalThis.ZombiePair")({});
const point=id=>({x:id%10,y:Math.floor(id/10)}),state=(h,a,b)=>({width:10,height:7,human:point(h),zombies:[point(a),point(b)],tick:0,tickLimit:10000,status:"running"});
const model=scores=>({schemaVersion:1,architecture:[6,32,5],seed:17,epoch:40,W1:Array.from({length:6},()=>Array(32).fill(0)),b1:Array(32).fill(0),W2:Array.from({length:32},()=>Array(5).fill(0)),b2:scores});
test("existential two-tick mask rejects a safe first tick with no continuation",()=>{
 const file=path.join(__dirname,"../two-tick-policy.js");assert(fs.existsSync(file),"two-tick policy exists");
 const f=require(file),s=state(2,0,34),m=model([0,10,9,0,0]),before=JSON.stringify(s);
 assert.deepEqual(require("../one-tick-policy.js").chooseHuman(s,m,pair),point(3));
 const r=f.inspect(s,m,pair);assert.equal(r.action,2);assert.equal(r.horizon,2);
 assert.deepEqual(r.candidates.map(c=>[c.action,c.safe1,c.safe2,c.keep]),[[1,true,false,false],[2,true,true,true],[3,false,false,false],[4,false,false,false]]);
 assert.deepEqual(r.scores,m.b2);assert.equal(JSON.stringify(s),before);
});
test("depth1 then all-legal fallback, first ties, terminal and clock invariance",()=>{
 const f=require("../two-tick-policy.js"),m=model([0,10,9,8,7]);
 let r=f.inspect(state(10,1,30),m,pair);assert.equal(r.horizon,1);assert.equal(r.action,0);
 r=f.inspect(state(2,0,23),m,pair);assert.equal(r.horizon,0);assert.equal(r.action,1);assert(r.candidates.every(c=>c.keep&&!c.safe1&&!c.safe2));
 assert.equal(f.inspect(state(33,0,69),model([1,1,1,1,1]),pair).action,0);
 assert.equal(f.inspect(state(0,1,69),m,pair).action,-1);
 assert.equal(f.inspect({...state(2,0,34),status:"caught"},m,pair).action,-1);
 assert.deepEqual(f.chooseHuman({...state(2,0,34),tick:9999,tickLimit:9999},m,pair),point(12));
 assert.throws(()=>f.chooseHuman({...state(2,0,34),width:11},m,pair),/Invalid/);
});
test("bounded fixture covers six original policies and complete three-policy witness frames",()=>{
 const file=path.join(__dirname,"build-two-tick.cjs");assert(fs.existsSync(file),"two-tick builder exists");
 const b=require(file),r=b.build({fixture:true,indices:[205801,205803],model:model([0,10,9,0,0])});
 assert.equal(r.results.length,2);assert(r.metadata.fixture);assert(r.witnesses.length>0);
 for(const row of r.results)assert.deepEqual(Object.keys(row.policies),["greedy","depth1","depth2","neural","oneTick","filtered"]);
 for(const w of r.witnesses)for(const p of ["neural","oneTick","filtered"])assert.equal(w.runs[p].frames.length,w.runs[p].stopTick+1);
 assert.throws(()=>b.build({indices:[1]}),/fixture/);
 const a=b.failureAnalysis({outcome:"capture",stopTick:3,indices:[0,1,2,3]},[-1,-1,1,0],()=>false);
 assert.equal(a.firstLossTick,2);assert.equal(a.lossBeforeCapture,true);
 const out=fs.mkdtempSync(path.join(require("node:os").tmpdir(),"zl013-fixture-"));
 try{const receipt=b.emit(r,out);assert(receipt.emittedParity);assert(receipt.finalResources.maxRSSKiB>0);}finally{fs.rmSync(out,{recursive:true});}
});
