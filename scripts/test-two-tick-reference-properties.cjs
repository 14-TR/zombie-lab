'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const ref = require('./two-tick-reference.cjs');
assert.equal(typeof ref.decide, 'function', 'decide API must exist');
// Independent oracle: Cartesian coordinates and closed-form priority chase,
// not reference helpers or legacy execution. All expected paths enumerated.
const cells = Array.from({length:70}, (_,i)=>[i%10,Math.floor(i/10)]);
const encode = s => (s[0][1]*10+s[0][0])*4900+(s[1][1]*10+s[1][0])*70+s[2][1]*10+s[2][0];
const unpack = i => [cells[Math.floor(i/4900)],cells[Math.floor(i/70)%70],cells[i%70]];
const dist = (a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
const contact = s => s.slice(0,2).some(z=>dist(z,s[2])<=1);
function options(p) {
  return [[p[0],p[1]-1],[p[0]+1,p[1]],[p[0],p[1]+1],[p[0]-1,p[1]],p]
    .map(q=>q[0]>=0&&q[0]<10&&q[1]>=0&&q[1]<7?q:null);
}
function chase(z,h) {
  if(h[1]<z[1]) return [z[0],z[1]-1];
  if(h[0]>z[0]) return [z[0]+1,z[1]];
  if(h[1]>z[1]) return [z[0],z[1]+1];
  if(h[0]<z[0]) return [z[0]-1,z[1]];
  return z;
}
function successors(s) {
  if(contact(s)) return Array(5).fill(null);
  return options(s[2]).map(h=>h?[chase(s[0],s[2]),chase(s[1],s[2]),h]:null);
}
function captured(old,next) {
  return contact(next)||old.slice(0,2).some((z,k)=>dist(z,next[2])===0&&dist(next[k],old[2])===0);
}
const totals={states:0,terminal:0,legalTransitions:0,capturedTransitions:0,horizon0:0,horizon1:0,horizon2:0,existentialNotUniversal:0};
const witnesses={};
const digest=crypto.createHash('sha256');
const start=process.hrtime.bigint();
for(let i=0;i<343000;i++) {
  const s=unpack(i), term=contact(s), next=successors(s);
  assert.equal(ref.terminal(i),term);
  const legal=next.map(Boolean), d1=next.map(n=>!!n&&!captured(s,n));
  const continuations=next.map((n,a)=>d1[a]?successors(n).filter(Boolean).map(t=>!captured(n,t)):[]);
  const d2=continuations.map(c=>c.some(Boolean));
  const horizon=term?0:d2.some(Boolean)?2:d1.some(Boolean)?1:0;
  const mask=term?Array(5).fill(false):horizon===2?d2:horizon===1?d1:legal;
  const scores=[(i%7)-3,(i%11)-5,0,2,-2];
  function expected(scores) {
    const eligible=mask.map((v,a)=>v?a:-1).filter(a=>a>=0);
    return eligible.length?eligible.reduce((a,b)=>scores[b]>scores[a]?b:a):-1;
  }
  const result=ref.decide(i,scores);
  assert.deepEqual(result,{action:expected(scores),mask,depth1:d1,depth2:d2,horizon});
  const tie=ref.decide(i,[0,0,0,0,0]);
  assert.equal(tie.action,mask.findIndex(Boolean),'first maximum ties');
  // Extra clock arguments must not affect this position-only interface.
  if(i%997===0) {
    assert.deepEqual(ref.decide(i,scores,{tick:9999,tickLimit:10000}),result);
    assert.deepEqual(ref.decide(i,scores,{tick:0,tickLimit:1}),result);
    assert.deepEqual(ref.decide(i,scores,{tick:10000,tickLimit:10000}),result);
    assert.equal(ref.decide(i,[...scores]).action,result.action);
  }
  // Canonical 47-byte record: uint32LE ID, uint8 terminal,
  // 5*(int32LE successor,uint8 captured,uint8 mask,uint8 d1,uint8 d2),
  // int8 tied-action, uint8 horizon. -1 successor/captured0 if unavailable.
  const row=Buffer.alloc(47); row.writeUInt32LE(i,0); row[4]=+term;
  for(let a=0;a<5;a++) {
    const want=next[a]?encode(next[a]):-1, got=ref.transition(i,a);
    assert.equal(got,want,`transition ${i}/${a}`);
    const caught=next[a]?captured(s,next[a]):false;
    if(next[a]) {
      totals.legalTransitions++; totals.capturedTransitions+=+caught;
      assert.equal(ref.terminal(got),caught,'endpoint capture equivalence including crossing');
      // Replanning: successor is freshly evaluated, not a remembered second action.
      if(i%997===0&&!caught) {
        const fresh=ref.decide(got,[4,3,2,1,0]);
        assert.equal(fresh.action,fresh.mask.findIndex(Boolean));
      }
    }
    const off=5+8*a;
    row.writeInt32LE(got,off); row[off+4]=+caught;
    row[off+5]=+result.mask[a]; row[off+6]=+result.depth1[a]; row[off+7]=+result.depth2[a];
    if(continuations[a].some(Boolean)&&continuations[a].some(x=>!x)) {
      totals.existentialNotUniversal++;
      if(!witnesses.existential) witnesses.existential={index:i,action:a,continuations:continuations[a],result};
    }
  }
  row.writeInt8(tie.action,45); row[46]=horizon; digest.update(row);
  totals.states++; totals.terminal+=+term;
  if(!term) {
    totals['horizon'+horizon]++;
    if(!witnesses['horizon'+horizon]) witnesses['horizon'+horizon]={index:i,scores,result};
  }
}
assert.ok(totals.horizon0>0,'all-legal fallback exists');
assert.ok(totals.horizon1>0,'depth1 fallback exists');
assert.ok(totals.horizon2>0);
assert.ok(totals.existentialNotUniversal>0,'must distinguish existential from universal');
// Explicit terminal, ties, OLD-state first/second tick, and borders are also
// tested in tests.cjs. Exchange attempts start terminal under cardinal contact.
assert.equal(ref.transition(1,3),-1,'adjacent exchange forbidden before movement');
const receipt={status:'PASS',totals,witnesses,stream_sha256:digest.digest('hex'),stream_record_bytes:47,stream_records:totals.states,stream_description:'Ascending state IDs 0..342999. uint32LE ID; uint8 terminal; N/E/S/W/stay each int32LE successor (-1 unavailable), uint8 captured (0 unavailable), uint8 selected-mask, uint8 depth1, uint8 depth2; int8 action with all-zero scores; uint8 horizon. No header.',elapsed_seconds:Number(process.hrtime.bigint()-start)/1e9,comparison_scope:'Independent closed-form oracle vs independently authored reference ONLY; no production comparison.'};
// The CLI emits the receipt; callers choose an external evidence path.
console.log(JSON.stringify(receipt,null,2));
