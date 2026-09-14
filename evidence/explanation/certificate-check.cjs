'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = '/Users/tr/Projects/zombie-lab-explain';
const data = JSON.parse(fs.readFileSync(root + '/evidence/all-starts/sweep.json', 'utf8'));
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(root + '/simulation.js', 'utf8'), ctx);
const sim = ctx.ZombieLab;
const W = data.config.width, H = data.config.height, N = W*H;
const rank = new Map(data.results.map(r => [r.zombieId*N+r.humanId, r.stopTick]));
assert.equal(rank.size, N*(N-1));
for (let z=0;z<N;z++) rank.set(z*N+z,0); // Explicit extension to excluded terminal overlap states.
const pos = id => ({x:id%W,y:Math.floor(id/W)});
const id = p => p.y*W+p.x;
const contact = (a,b) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y) <= 1;
function start(z,h, tick=0, tickLimit=10000) {
  return {...sim.initialState(), width:W, height:H, human:pos(h), zombie:pos(z), tick, tickLimit};
}
let terminal=0, nonterminal=0, overlapSuccessors=0, terminalSuccessors=0, replaySteps=0;
let terminalPrecedence=0, successorPositionTickIndependent=0;
for (let z=0;z<N;z++) for(let h=0;h<N;h++) {
  const state = start(z,h), r = rank.get(z*N+h);
  assert.ok(Number.isInteger(r) && r >= 0);
  const next = sim.step(state);
  if (contact(state.human,state.zombie)) {
    terminal++;
    assert.equal(r,0);
    assert.equal(next.status,'caught');
    assert.equal(next.tick,0);
    const atCap = sim.step(start(z,h,10000,10000));
    assert.equal(atCap.status,'caught');
    terminalPrecedence++;
  } else {
    nonterminal++;
    assert.ok(r>0);
    assert.equal(next.tick,1);
    assert.ok(next.status === 'running' || next.status === 'caught');
    const successorKey = id(next.zombie)*N+id(next.human);
    assert.ok(rank.has(successorKey));
    assert.equal(rank.get(successorKey),r-1);
    assert.equal(next.status === 'caught',contact(next.human,next.zombie));
    if(id(next.human)===id(next.zombie)) overlapSuccessors++;
    if(next.status==='caught') terminalSuccessors++;
    const shifted = sim.step(start(z,h,333,10000));
    assert.equal(id(shifted.human),id(next.human));
    assert.equal(id(shifted.zombie),id(next.zombie));
    successorPositionTickIndependent++;
  }
}
// Independent full production replay against every frozen capture tick.
for (const row of data.results) {
  let state = start(row.zombieId,row.humanId);
  const seen = new Set();
  for (;;) {
    if(contact(state.human,state.zombie)) { state=sim.step(state); break; }
    assert.equal(state.status,'running');
    const key = id(state.zombie)*N+id(state.human);
    assert.ok(!seen.has(key)); seen.add(key);
    state=sim.step(state); replaySteps++;
    if(state.status !== 'running') break;
  }
  assert.equal(state.status,'caught');
  assert.equal(state.tick,row.stopTick);
}
const rowsOverDefaultCap = data.results.filter(r => r.stopTick>sim.initialState().tickLimit).length;
const defaultRuns = [1,2].map(h => {
  let s=start(42,h,0,sim.initialState().tickLimit);
  while(s.status==='running') s=sim.step(s);
  return {zombieId:42,humanId:h,tickLimit:sim.initialState().tickLimit,status:s.status,stopTick:s.tick};
});
const output={certificateVerified:true,fullPositionDomain:N*N,distinctRows:data.results.length,
 overlapTerminalExtension:N,terminal,nonterminal,terminalSuccessors,overlapSuccessors,
 terminalPrecedence,successorPositionTickIndependent,verifiedProductionReplays:data.results.length,
 replaySteps,maximumRank:Math.max(...rank.values()),sweepCap:data.config.safetyTickLimit,
 manualAppDefaultCap:sim.initialState().tickLimit,rowsOverDefaultCap,defaultRuns,
 proofScope:'Fixed 10x7 ordered positions, unchanged deterministic memoryless policy, initial running status, cap absent or sufficient remaining ticks. Complete table plus explicit shared-cell rank-zero extension.',
 proof:'Initial contact iff rank=0. Every nonterminal production successor remains in domain with rank exactly one lower. Induction gives first contact after exactly rank steps; ranks <=77 preclude nonterminal cycles. Production contact priority covers capture at the cap.',
 limitations:['The 4830-row table omits 70 same-cell terminal states; explicitly extend them or verify closure for the restricted start domain.',
 'Position key is ordered and collision-free (zombieId*70+humanId); fixed dimensions, policy, tie order and no hidden history are essential.',
 'Production state includes tick, tickLimit and status. A position-only certificate describes uncapped positional dynamics, not arbitrary halted/capped states.',
 '10000 is a safety cap, not the mathematical proof; default40 truncates some capture times. For fresh starts cap>=77 suffices, and at later starts remaining cap must cover the rank.',
 'Rank must be a finite nonnegative integer, zero iff terminal, complete with unique IDs; missing successors/outcomes cannot be silently treated as rank0.']};
fs.writeFileSync('/tmp/zl007-certificate-check.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
