"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('three-arm timeline holds true endpoints and labels zero-call forced agency',()=>{
 const file=path.join(__dirname,'../jev-safe-view.js');assert(fs.existsSync(file),'safe viewer exists');const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
 const api=ctx.JevSafeView,d=require('./build-jev-safe.cjs').collect(),r=d.runs[1];
 assert.equal(api.frameAt(r.original,12).tick,7);assert.equal(api.frameAt(r.safe,12).tick,12);assert.equal(api.frameAt(r.controls.exact,12).tick,12);
 assert.equal(api.decisionAt(r.safe,7).agency,'forced_guardrail');assert.equal(api.decisionAt(r.safe,7).answers,null);assert.equal(api.decisionAt(r.original,8),null);assert.equal(api.decisionAt(r.safe,0),null);
 assert.deepEqual(Array.from(api.traces(r),x=>x[0]),['original','safe','exact']);
});
