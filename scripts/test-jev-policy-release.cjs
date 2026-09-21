"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'build-jev-policy.cjs');
test('PR and Pages run only offline policy tests and exports, never paid calls',()=>{
 for(const name of ['pages.yml','private-preview.yml']){
  const text=fs.readFileSync(path.join(__dirname,'../.github/workflows',name),'utf8');
  assert(text.includes('node scripts/build-jev-policy.cjs preview'),name+' packages policy replay');
  assert(text.includes('python3 -B scripts/check-jev-policy-reference.py'));
  assert(text.includes('scripts/test-jev-policy-runner.py'));
  assert(!text.includes('--live-authorized'));assert(!text.includes('TYPESAFE_API_KEY'));
 }
});
test('offline comparison binds both real arms, all admissions and the earlier policy capture',()=>{
 assert(fs.existsSync(file),'policy comparison builder exists');
 const d=require(file).collect();
 assert.equal(d.runs.length,2);assert.equal(d.summary.original.admitted,19);assert.equal(d.summary.policy.admitted,16);
 assert.deepEqual(d.runs.map(r=>[r.original.outcome,r.original.frames.at(-1).tick,r.policy.outcome,r.policy.frames.at(-1).tick]),[['unresolved',12,'unresolved',12],['capture',7,'capture',4]]);
 assert.equal(d.summary.policy.usage.inputTokens,24808);assert.equal(d.summary.policy.usage.outputTokens,2257);
 assert.equal(d.runs[1].comparison.bothCapturedTickDifference,-3);
 assert.equal(d.runs[0].comparison.bothCapturedTickDifference,null);
 assert.equal(d.runs[1].comparison.firstPolicyLossTick,4);
 assert.equal(d.runs[1].controls.depth2.stopTick,12);
});
test('export includes both raw arms, report, complete CSV and a network-disabled phone page',()=>{
 const api=fs.existsSync(file)?require(file):{};assert.equal(typeof api.build,'function');
 const out=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'zl016-export-'));
 try{
  const d=api.build(out);
  const parsed=JSON.parse(fs.readFileSync(path.join(out,'jev-policy.json')));assert.deepEqual(parsed,d);
  const rows=fs.readFileSync(path.join(out,'jev-policy.csv'),'utf8').trim().split('\n');
  assert.equal(rows.length-1,d.runs.reduce((n,r)=>n+r.original.frames.length+r.policy.frames.length+r.controls.greedy.frames.length+r.controls.depth2.frames.length,0));
  for(const f of ['jev-policy-view.js','experiments/ZL-016-policy.md','experiments/ZL-016-protocol.md','evidence/jev-controller/recording/run-02-tick-07.response.json','evidence/jev-policy/recording/run-02-tick-04.response.json'])assert(fs.statSync(path.join(out,f)).size>0,f);
  const html=fs.readFileSync(path.join(out,'jev-policy.html'),'utf8');assert(html.includes("connect-src 'none'"));assert(html.includes('historical'));assert(html.includes('three ticks earlier'));assert(html.includes('not training'));
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
