"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const file=path.join(__dirname,'build-jev-safe.cjs');
test('offline collector binds all real requests, forced steps, historical19 and exact control',()=>{
 assert(fs.existsSync(file),'safe comparison builder exists');const d=require(file).collect();
 assert.equal(d.experiment,'ZL-017');assert.equal(d.summary.original.admitted,19);assert.equal(d.summary.safe.admitted,21);assert.equal(d.summary.safe.forcedSteps,3);assert.equal(d.summary.safe.simulationTicks,24);
 assert.equal(d.summary.safe.actions.unsafe,0);assert.equal(d.summary.safe.zombiePredictions.total,42);assert.equal(d.summary.safe.zombiePredictions.missingNotRequested,6);
 assert.deepEqual(d.runs.map(r=>[r.original.outcome,r.original.frames.at(-1).tick,r.safe.outcome,r.safe.frames.at(-1).tick,r.controls.exact.outcome,r.controls.exact.stopTick]),[['unresolved',12,'unresolved',12,'unresolved',12],['capture',7,'unresolved',12,'unresolved',12]]);
 assert.deepEqual(d.runs.map(r=>r.comparison.firstTrajectoryDivergenceTick),[10,7]);assert.deepEqual(d.runs.map(r=>r.comparison.firstSafeLossTick),[null,null]);assert.equal(d.runs[1].comparison.firstOriginalLossTick,7);
 assert.equal(d.summary.safe.genuineChoiceStatesWithDelayedTrap,0,'No actual opportunity to distinguish a delayed trap');
 assert.deepEqual(d.summary.safe.safeSetSizes,{'1':3,'2':18,'3':3});
});
test('export includes all frames, forced labels, reports and network-disabled replay',()=>{
 assert(fs.existsSync(file));const api=require(file);assert.equal(typeof api.build,'function');
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'zl017-export-'));
 try{const d=api.build(out);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out,'jev-safe.json'))),d);
 const rows=fs.readFileSync(path.join(out,'jev-safe.csv'),'utf8').trim().split('\n');assert.equal(rows.length-1,d.runs.reduce((n,r)=>n+r.original.frames.length+r.safe.frames.length+Object.values(r.controls).reduce((n,t)=>n+t.frames.length,0),0));
 assert(rows.some(row=>row.includes('forced_guardrail')&&row.includes('not_requested_forced')));
 for(const f of ['jev-safe-view.js','experiments/ZL-017-safe.md','experiments/ZL-017-protocol.md','evidence/jev-controller/recording/run-02-tick-07.response.json','evidence/jev-safe/recording/run-02-tick-07.truth.json'])assert(fs.statSync(path.join(out,f)).size>0,f);
 assert(!fs.existsSync(path.join(out,'evidence/jev-safe/recording/run-02-tick-07.response.json')));
 const html=fs.readFileSync(path.join(out,'jev-safe.html'),'utf8');assert(html.includes("connect-src 'none'"));assert(html.includes('historical'));assert(html.includes('no Jev agency'));assert(html.includes('not learning'));
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
test('PR and Pages integrate only offline safe builds and tests',()=>{
 for(const name of ['pages.yml','private-preview.yml']){
  const text=fs.readFileSync(path.join(__dirname,'../.github/workflows',name),'utf8');
  assert(text.includes('node scripts/build-jev-safe.cjs preview'));assert(text.includes('scripts/test-jev-safe-runner.py'));assert(text.includes('scripts/check-jev-safe-reference.py'));
  assert(!text.includes('--live-authorized'));assert(!text.includes('TYPESAFE_API_KEY'));
 }
});
test('browser harness refuses absent actual artifact before optional browser loading',()=>{
 const script=path.join(__dirname,'check-jev-safe-browser.cjs');assert(fs.existsSync(script),'safe browser harness exists');
 const p=require('node:child_process').spawnSync(process.execPath,[script,'/absent-zl017-artifact','/absent-module','/absent-browser','/absent-output'],{encoding:'utf8'});
 assert.notEqual(p.status,0);assert(p.stderr.includes('jev-safe.json'));assert(!p.stderr.includes('Cannot find module'));
});
test('mutated raw response, forced agency, and old recording bytes cannot pass collection',()=>{
 assert(fs.existsSync(file),'safe comparison builder exists');
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'zl017-corruption-'));
 try{
 fs.cpSync(path.join(__dirname,'../evidence/jev-safe/recording'),out,{recursive:true});
 const f=path.join(out,'run-02.trajectory.json'),r=JSON.parse(fs.readFileSync(f));r.decisions[6].agency='jev_choice';fs.writeFileSync(f,JSON.stringify(r));
 assert.throws(()=>require(file).collect({recordingDir:out}));
 }finally{fs.rmSync(out,{recursive:true,force:true});}
 const manifest=require('../evidence/jev-safe/frozen/manifest.json'),pilot=require('./jev-pilot.cjs');
 for(const [f,hash]of Object.entries(manifest.baselineHashes))assert.equal(pilot.sha(fs.readFileSync(path.join(pilot.ROOT,f))),hash,f);
});
