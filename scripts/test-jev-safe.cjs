"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const file=__dirname+'/jev-safe.cjs',safe=fs.existsSync(file)?require(file):null;
const original=require('./jev-controller.cjs');
const state=(h,z1,z2)=>({width:10,height:7,tick:0,tickLimit:12,human:h,zombies:[z1,z2],status:'running',reason:''});
test('candidate-only restriction leaves original prompt, shared state, and predictors unchanged',()=>{
 assert(safe,'safe candidate controller exists');
 const s=state({x:2,y:0},{x:2,y:4},{x:0,y:0});
 const r=original.request(s),got=safe.prepare(s);
 assert.deepEqual(got.request.state,r.state);assert.deepEqual(got.request.questions.zombie1_move,r.questions.zombie1_move);assert.deepEqual(got.request.questions.zombie2_move,r.questions.zombie2_move);
 assert.equal(got.request.questions.human_action.instructions,r.questions.human_action.instructions);
 assert.deepEqual(Object.keys(got.request.questions.human_action.criteria),['E','S']);
 assert.deepEqual(got.mask,{safeActions:['E','S'],retainedActions:['E','S'],safeSetSize:2,mode:'safe_candidates',agency:'jev_choice'});
 delete r.questions.human_action.criteria;const compare=structuredClone(got.request);delete compare.questions.human_action.criteria;assert.deepEqual(compare,r);
});
const fixtures=require('../evidence/jev-safe/tests/independent-witnesses.json');
const fromCells=xs=>state(...xs.map(c=>({x:c%10,y:Math.floor(c/10)})));
test('singleton executes forced guardrail without request or invented predictions',()=>{
 const s=fromCells(fixtures.singleton.cells),p=safe.prepare(s);
 assert.equal(p.request,null);assert.equal(p.mask.agency,'forced_guardrail');assert.deepEqual(p.mask.retainedActions,['S']);
 const d=safe.forced(s);assert.equal(d.action,'S');assert.equal(d.answers,null);assert.equal(d.successor.tick,1);
 assert.equal(d.successor.status,'running');assert.throws(()=>safe.forced(fromCells(fixtures.delayedTrap.cells)));
});
test('all-unsafe explicitly retains every original legal option and prompt',()=>{
 const s=fromCells(fixtures.allUnsafe.cells),p=safe.prepare(s);
 assert.equal(p.mask.mode,'all_unsafe_fallback');assert.equal(p.mask.safeSetSize,0);assert.deepEqual(p.request,original.request(s));
});
test('a noncapturing delayed losing successor remains selectable, no exact labels leak',()=>{
 const s=fromCells(fixtures.delayedTrap.cells),p=safe.prepare(s);
 assert.deepEqual(p.mask.safeActions,['E','S','W']);assert.equal(original.facts(s).actions.find(a=>a.action==='W').rank,5);
 assert.equal(JSON.stringify(p.request).includes('successorRank'),false);
 assert.equal(typeof safe.decision,'function');
 const response={model:'jev-1.13.0',answers:Object.fromEntries(Object.entries(p.request.questions).map(([key,q])=>{const keys=Object.keys(q.criteria),choice=key==='human_action'?'W':keys[0];return [key,{type:'choice',choice,confidence:1,probabilities:Object.fromEntries(keys.map(k=>[k,k===choice?1:0]))}];}))};
 assert.equal(safe.decision(s,response).action,'W');assert.equal(safe.decision(s,response).successor.status,'running');
 response.answers.human_action.choice='N';assert.throws(()=>safe.decision(s,response),/Invalid/);
 delete response.answers.human_action;assert.throws(()=>safe.decision(s,response),/Invalid/);
});
module.exports={state};
