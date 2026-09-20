"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('offline controller export replays recorded actions and separates prediction from actual zombie motion',()=>{
 const f=path.join(__dirname,'build-jev-controller.cjs');assert(fs.existsSync(f),'controller export exists');
 const d=require(f).collect();assert.equal(d.runs.length,2);assert.equal(d.summary.admitted,19);assert.equal(d.summary.zombiePredictions.total,38);
 assert.deepEqual(d.runs.map(r=>[r.jev.outcome,r.jev.frames.at(-1).tick]),[['unresolved',12],['capture',7]]);
 for(const r of d.runs){assert.equal(r.controls.depth2.outcome,'unresolved');assert.equal(r.controls.depth2.stopTick,12);for(const e of r.jev.decisions)assert(e.reference.valid);}
 assert.equal(d.summary.usage.inputTokens,25226);
 assert.equal(d.runs[1].identicalToGreedy,true,"object property order cannot invent a trajectory difference");
 assert.equal(d.runs[0].identicalToGreedy,false);
});
