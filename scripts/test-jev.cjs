"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const evalFile=path.join(__dirname,'evaluate-jev.cjs');
const evaluator=fs.existsSync(evalFile)?require(evalFile):{};
const file = path.join(__dirname,'jev-pilot.cjs');
const api = fs.existsSync(file) ? require(file) : {};
test('frozen endpoint-inclusive sample is legal, ordered and production-labeled', () => {
  assert.equal(typeof api.buildDataset, 'function', 'dataset builder exists');
  const data = api.buildDataset();
  assert.equal(data.samples.length,24);
  assert.equal(new Set(data.samples.map(s=>s.stateIndex)).size,24);
  assert.deepEqual(data.samples.map(s=>s.selectionIndex),Array.from({length:24},(_,i)=>Math.floor(i*(data.population-1)/23)));
  assert(data.samples.every(s=>s.actions.length>=3&&s.actions.length<=5));
  assert(data.samples.every((s,i)=>i===0||s.stateIndex>data.samples[i-1].stateIndex));
  assert.equal(data.samples[0].stateIndex,205802);
  for (const s of data.samples) for (const a of s.actions) {
    assert.equal(a.capture,a.rank===0); assert.equal(a.avoidable,a.rank===-1);
    assert.equal(a.successor.tick,1);
  }
});
test('evaluation keeps missing answers in denominator and separates oracle action quality',()=>{
  assert.equal(typeof evaluator.evaluate,'function','evaluator exists');
  const d=api.buildDataset(), empty=evaluator.evaluate(d,{});
  assert.equal(empty.summary.samples,24); assert.equal(empty.summary.capture.valid,0);
  assert.equal(empty.summary.capture.accuracy,0); assert.equal(empty.summary.capture.brierPenalized,1);
  assert.equal(empty.summary.capture.brierValid,null);
  const responses={};
  for(const s of d.samples){const q=api.requestFor(s).questions,answers={};
    for(const [k,v] of Object.entries(q)) {
      const truth=k==='human_action'?s.canonicalAction:k.startsWith('zombie')?s.zombieMoves[Number(k[6])-1]:null;
      answers[k]=v.type==='choice'?{type:'choice',choice:truth,confidence:1,probabilities:Object.fromEntries(Object.keys(v.criteria).map(a=>[a,Number(a===truth)]))}:{type:'noul',noul:Number(k.startsWith('capture_')?s.actions.find(a=>a.action===k.slice(8)).capture:s.actions.find(a=>a.action===k.slice(6)).avoidable)};
    }
    responses[s.id]={model:api.MODEL,answers,usage:{input_tokens:100,output_tokens:10}};
  }
  const perfect=evaluator.evaluate(d,responses);
  assert.equal(perfect.summary.capture.brierPenalized,0);assert.equal(perfect.summary.avoidability.accuracy,1);
  assert.equal(perfect.summary.actions.optimal,24);assert.equal(perfect.summary.zombies.jointCorrect,24);
  assert.equal(perfect.summary.usage.inputTokens,2400);
  responses[d.samples[0].id].model='wrong';
  assert.equal(evaluator.evaluate(d,responses).summary.actions.valid,23);
});
test('independent reference comparison rejects changed state, action and rank labels',()=>{
  const f=path.join(__dirname,'verify-jev-reference.cjs');assert(fs.existsSync(f),'independent comparison exists');
  const check=require(f).compare,d=api.buildDataset();
  const reference=JSON.parse(fs.readFileSync(path.join(__dirname,'../evidence/jev/reference-truth.json')));
  assert.equal(check(d,reference).states,24);
  for(const change of [s=>s.rank=999,s=>s.zombieMoves[0]='stay',s=>s.actions[0].capture=!s.actions[0].capture,s=>s.actions[0].rank=999,s=>s.actions.pop(),s=>s.actions[0].successor.human.x=99,s=>s.state.human.x=99]){
    const bad=JSON.parse(JSON.stringify(d));change(bad.samples[0]);assert.throws(()=>check(bad,reference));
  }
});
test('strict answer validation rejects malformed probability and choice schemas',()=>{
  assert.equal(typeof evaluator.validAnswer,'function','answer validator exists');
  const q={type:'choice',criteria:{N:null,E:null}}, good={type:'choice',choice:'N',confidence:.6,probabilities:{N:.8,E:.2}};
  assert(evaluator.validAnswer(q,good));
  for(const bad of [{...good,choice:'W'},{...good,choice:'E'},{...good,confidence:2},{...good,probabilities:{N:1}},{...good,probabilities:{N:.8,E:.3}},{...good,probabilities:{N:NaN,E:0}},{...good,probabilities:{N:1.1,E:-.1}}]) assert(!evaluator.validAnswer(q,bad));
  for(const x of [0,.5,1]) assert(evaluator.validAnswer({type:'noul'},{type:'noul',noul:x}));
  for(const x of [null,'0.2',true,NaN,Infinity,-.01,1.01]) assert(!evaluator.validAnswer({type:'noul'},{type:'noul',noul:x}));
});
test('requests are bounded, independent, and cannot leak oracle labels',()=>{
  assert.equal(typeof api.requestFor,'function','request constructor exists');
  for(const s of api.buildDataset().samples){
    const r=api.requestFor(s), changed=api.requestFor({...s,rank:999,zombieMoves:[],actions:s.actions.map(a=>({...a,rank:999,capture:!a.capture,avoidable:!a.avoidable})),canonicalAction:'WRONG'});
    assert.deepEqual(r,changed);
    assert.equal(r.model,'jev-1.13.0');
    assert.equal(Object.keys(r.questions).length,3+s.actions.length*2);
    assert(Buffer.byteLength(JSON.stringify(r))<=16384);
    assert(!JSON.stringify(r.state).match(/rank|score|recommend|answer|successorIndex/));
    for(const q of Object.values(r.questions)) assert(q.instructions.length>30);
  }
});
