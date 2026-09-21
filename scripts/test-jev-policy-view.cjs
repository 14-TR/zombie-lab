"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('comparison timeline holds both true endpoints and never invents later decisions',()=>{
 const file=path.join(__dirname,'../jev-policy-view.js');assert(fs.existsSync(file),'policy viewer exists');
 const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
 const api=ctx.JevPolicyView,data=require('./build-jev-policy.cjs').collect(),r=data.runs[1];
 assert.equal(api.frameAt(r.original,12).tick,7);assert.equal(api.frameAt(r.policy,12).tick,4);
 assert.equal(api.frameAt(r.controls.depth2,12).tick,12);
 assert.equal(api.decisionAt(r.policy,4).action,'stay');assert.equal(api.decisionAt(r.policy,5),null);
 assert.equal(api.decisionAt(r.original,7).action,'W');assert.equal(api.decisionAt(r.original,8),null);
 assert.equal(api.decisionAt(r.original,0),null);
 assert.deepEqual(Array.from(api.traces(r),x=>x[0]),['original','policy','greedy','depth2']);
});
