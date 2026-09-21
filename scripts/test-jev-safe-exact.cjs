"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const safe=require('./jev-safe.cjs'),pilot=require('./jev-pilot.cjs'),original=require('./jev-controller.cjs');
const witnesses=require('../evidence/jev-safe/tests/independent-witnesses.json');
const state=cells=>({width:10,height:7,tick:0,tickLimit:12,human:{x:cells[0]%10,y:Math.floor(cells[0]/10)},zombies:cells.slice(1).map(c=>({x:c%10,y:Math.floor(c/10)})),status:'running',reason:''});
test('exact control first-ties a winning successor, otherwise maximizes finite rank',()=>{
 assert.equal(typeof safe.exactAction,'function');
 assert.equal(safe.exactAction(state(witnesses.delayedTrap.cells)),'E');
 assert.equal(safe.exactAction(state(witnesses.singleton.cells)),'S');
 assert.equal(safe.exactAction(state(witnesses.allUnsafe.cells)),'E');
});
test('exact control reproduces every selected transition and true simulation cap',()=>{
 assert.equal(typeof safe.exactControl,'function');
 const starts=require('../evidence/jev-controller/frozen/manifest.json').starts;
 for(const start of starts){const trace=safe.exactControl(start.state);assert.equal(trace.frames.length,13);assert.equal(trace.outcome,'unresolved');assert.equal(trace.stopTick,12);assert.equal(trace.decisions.length,12);
 for(const e of trace.decisions){assert.equal(e.truth.rank,-1);assert.equal(e.truth.actions.find(a=>a.action===e.action).rank,-1);assert.deepEqual(e.before,trace.frames[e.before.tick]);assert.deepEqual(original.advance(e.before,e.action),trace.frames[e.before.tick+1]);}}
});
