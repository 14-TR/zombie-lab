"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {ROOT,sha}=require('./jev-pilot.cjs');
// Adapter compares every label against an independently authored reference,
// never imports the reference transition algorithm into the production builder.
function compare(dataset,reference){
  dataset=JSON.parse(JSON.stringify(dataset)); // Normalize VM-origin array prototypes at the JSON boundary.
  assert.equal(dataset.samples.length,24);assert.equal(reference.records.length,24);
  let actions=0;
  for(let i=0;i<24;i++){
    const s=dataset.samples[i],r=reference.records[i];
    assert.equal(s.stateIndex,r.stateIndex);assert.equal(r.terminal,false);assert.equal(s.rank,r.rank);
    assert.deepEqual(s.state.human,r.human);assert.deepEqual(s.state.zombies,[r.zombie1,r.zombie2]);
    assert.deepEqual(s.zombieMoves,r.zombieMoves.map(z=>z.actionName));
    assert.deepEqual(s.actions.map(a=>a.action),r.actions.map(a=>a.actionName));
    for(let j=0;j<s.actions.length;j++){
      const a=s.actions[j],b=r.actions[j];
      assert.deepEqual(a.destination,b.humanDestination);assert.equal(a.capture,b.captured);assert.equal(a.avoidable,b.successorAvoidable);
      assert.equal(a.rank,b.successorRank);assert.equal(a.successorIndex,b.successorIndex);assert.equal(a.successor.tick,b.elapsedTicks);
      assert.deepEqual(a.successor.human,b.successor.human);assert.deepEqual(a.successor.zombies,[b.successor.zombie1,b.successor.zombie2]);
      assert.equal(a.successor.status,b.captured?'caught':'running');actions++;
    }
    const wins=r.actions.filter(a=>a.successorAvoidable),max=Math.max(...r.actions.map(a=>a.successorRank));
    const optimal=(wins.length?wins:r.actions.filter(a=>a.successorRank===max)).map(a=>a.actionName);
    assert.deepEqual(s.optimalActions,optimal);assert.equal(s.canonicalAction,optimal[0]);
  }
  return {valid:true,states:24,actions,zombieMoves:48};
}
function verify(){
  const dir=path.join(ROOT,'evidence/jev'),bytes=fs.readFileSync(path.join(dir,'frozen/dataset.json'));
  const dataset=JSON.parse(bytes),truth=JSON.parse(fs.readFileSync(path.join(dir,'reference-truth.json')));
  const certificate=JSON.parse(fs.readFileSync(path.join(dir,'reference-certificate.json'))),parity=JSON.parse(fs.readFileSync(path.join(dir,'reference-legacy-parity.json')));
  assert.equal(certificate.ok,true);assert.equal(parity.ok,true);
  assert.equal(certificate.certificateSha256,dataset.sourceHashes['evidence/avoidability/data/avoidability-certificate.json']);
  assert.equal(truth.certificateSha256,certificate.certificateSha256);assert.equal(parity.sourceSha256,dataset.sourceHashes['two-zombies.js']);
  assert.equal(parity.referenceHashes['reference.json'],sha(fs.readFileSync(path.join(dir,'reference-truth.json'))));
  return {...compare(dataset,truth),datasetSHA256:sha(bytes),referenceSHA256:sha(fs.readFileSync(path.join(dir,'reference-truth.json'))),certificateProofSHA256:sha(fs.readFileSync(path.join(dir,'reference-certificate.json'))),legacyParitySHA256:sha(fs.readFileSync(path.join(dir,'reference-legacy-parity.json'))),scope:'Full pilot label parity plus independently checked legacy certificate; not implementation review'};
}
module.exports={compare,verify};
if(require.main===module){const result=verify();fs.writeFileSync(path.join(ROOT,'evidence/jev/reference.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}
