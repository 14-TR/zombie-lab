"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'jev-controller.cjs'),api=fs.existsSync(file)?require(file):{};
const samples=require('../evidence/jev/frozen/dataset.json').samples;
test('Jev controls only human; production zombies ignore its predictions',()=>{
 assert.equal(typeof api.advance,'function');
 const s={...samples[2].state,tickLimit:12};
 const next=api.advance(s,'E');
 assert.deepEqual(next.human,{x:4,y:0});assert.deepEqual(next.zombies,[{x:2,y:3},{x:5,y:0}]);assert.equal(next.status,'caught');
 assert.throws(()=>api.advance(s,'INVALID'));
 const req=api.request(s);assert.deepEqual(Object.keys(req.questions),['zombie1_move','zombie2_move','human_action']);
 assert.equal(req.model,'jev-1.13.0');assert(!JSON.stringify(req.state).match(/rank|score|answer|successor/));
 const facts=api.facts(s);assert.equal(facts.rank,-1);assert.equal(facts.actions.find(a=>a.action==='E').capture,true);
});
test('paired controls retain initial/end frames and label cutoff unresolved',()=>{
 assert.equal(typeof api.control,'function');
 for(const s of [samples[0].state,samples.at(-1).state])for(const policy of ['greedy','depth2']){
  const r=api.control({...s,tickLimit:12},policy);assert(r.frames.length>=2&&r.frames.length<=13);
  assert.equal(r.frames[0].tick,0);assert.equal(r.frames.at(-1).tick,r.frames.length-1);
  assert(['capture','unresolved'].includes(r.outcome));
  if(r.outcome==='unresolved')assert.equal(r.frames.at(-1).tick,12);
 }
});
