#!/usr/bin/env node
'use strict';
// Verification harness only: frozen legacy physics versus independent Python.
// Does not load, import, or inspect any ZL-014 Jev implementation/results.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ROOT = __dirname;
const LEGACY = '/Users/tr/Projects/zombie-lab-neural-two-tick';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const source = fs.readFileSync(path.join(LEGACY, 'two-zombies.js'));
assert.equal(hash(source), 'ae62cc4ed7d4fb465a97827c0da34eb191005afc3de6c1c0185b163b00fc3243');
const context = vm.createContext({});
vm.runInContext(source.toString(), context, {timeout: 1000});
const pair = context.ZombiePair;
const ranks = JSON.parse(fs.readFileSync(path.join(LEGACY,
  'evidence/avoidability/data/avoidability-certificate.json'))).ranks;
const cell = p => p.y * 10 + p.x;
const index = s => (cell(s.zombies[0]) * 70 + cell(s.zombies[1])) * 70 + cell(s.human);
const plain = value => JSON.parse(JSON.stringify(value));
const deltas = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]];
let states = 0, actions = 0, terminalChecks = 0, zombieMoves = 0;
// Reconstruct original fixed-Z1 eligibility using actual legacy stopping.
const eligible = [];
let originalStarts = 0;
for (let z2 = 0; z2 < 70; z2++) for (let h = 0; h < 70; h++) {
  if (h === 42 || h === z2) continue;
  originalStarts++;
  const state = pair.initialState(h, z2);
  const next = pair.step(state, 'greedy');
  if (next.tick === 1) eligible.push(index(state));
  else { assert.equal(next.tick, 0); assert.equal(next.status, 'caught'); }
}
assert.equal(originalStarts, 4761);
assert.equal(eligible.length, 4259);
assert.deepEqual(eligible, [...eligible].sort((a, b) => a - b));
const sampled = Array.from({length: 24}, (_, i) => eligible[Math.floor(i * (eligible.length - 1) / 23)]);
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ROOT, 'selected-inputs.json'))).records.map(r => r.stateIndex), sampled);
const inputHashes = {};
for (const name of ['reference.json', 'edge-reference.json']) {
  const bytes = fs.readFileSync(path.join(ROOT, name));
  inputHashes[name] = hash(bytes);
  const rows = JSON.parse(bytes).records;
  if (name === 'reference.json') assert.equal(rows.length, 24);
  if (name === 'edge-reference.json') assert.equal(rows.length, 9);
  for (const row of rows) {
    states++;
    const state = {...pair.initialState(), human: row.human,
      zombies: [row.zombie1, row.zombie2], tick: 0, tickLimit: 10000, status: 'running', reason: ''};
    assert.equal(index(state), row.stateIndex);
    assert.equal(ranks[index(state)], row.rank);
    assert.equal(row.avoidable, row.rank === -1);
    const probe = pair.step(state, 'greedy');
    if (row.terminal) {
      assert.equal(probe.status, 'caught');
      assert.equal(probe.tick, 0);
      assert.equal(index(probe), index(state));
      const stopped = pair.resolveTick(state, {});
      assert.equal(stopped.tick, 0);
      assert.equal(stopped.status, 'caught');
      assert.equal(row.actions.length, 0);
      assert.equal(row.zombieMoves, null);
      terminalChecks++;
      continue;
    }
    assert.equal(probe.tick, 1);
    for (let z = 0; z < 2; z++) {
      assert.deepEqual(plain(probe.zombies[z]), row.zombieMoves[z].to);
      const dx = probe.zombies[z].x - state.zombies[z].x;
      const dy = probe.zombies[z].y - state.zombies[z].y;
      assert.equal(row.zombieMoves[z].action, deltas.findIndex(d => d[0] === dx && d[1] === dy));
      zombieMoves++;
    }
    assert.deepEqual(row.actions.map(a => a.action), row.legalActions);
    for (const action of row.actions) {
      const [dx, dy] = deltas[action.action];
      const destination = {x: state.human.x + dx, y: state.human.y + dy};
      const next = pair.resolveTick(state, {human: destination, zombies: probe.zombies});
      assert.deepEqual(plain(next.human), action.humanDestination);
      assert.deepEqual(plain(next.human), action.successor.human);
      assert.deepEqual(plain(next.zombies), [action.successor.zombie1, action.successor.zombie2]);
      assert.equal(index(next), action.successorIndex);
      assert.equal(next.status === 'caught', action.captured);
      assert.equal(next.tick, action.elapsedTicks);
      assert.equal(ranks[index(next)], action.successorRank);
      assert.equal(ranks[index(next)] === -1, action.successorAvoidable);
      actions++;
    }
  }
}
const corner = {...pair.initialState(), human: {x: 0, y: 0},
  zombies: [{x: 2, y: 2}, {x: 9, y: 6}]};
assert.throws(() => pair.resolveTick(corner, {human: {x: 0, y: -1},
  zombies: [{x: 2, y: 1}, {x: 9, y: 5}]}), /Illegal human move/);
console.log(JSON.stringify({ok: true, scope: 'legacy production parity; NOT Jev implementation review',
  states, actions, terminalChecks, zombieMoveComparisons: zombieMoves,
  originalStarts, nonterminalStarts: eligible.length, selectedIdsVerified: sampled,
  outOfBoundsRejection: true, sourceSha256: hash(source), referenceHashes: inputHashes}, null, 2));
