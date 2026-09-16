'use strict';
const assert = require('node:assert/strict');
const oracle = require('./one-tick-reference.cjs');
const id = (z1, z2, h) => (z1 * 70 + z2) * 70 + h;
function check(name, run) { run(); console.log('PASS ' + name); }
check('initial shared/cardinal contact; diagonal is not contact', () => {
  assert.equal(oracle.terminal(id(0, 69, 0)), true);
  assert.equal(oracle.terminal(id(0, 69, 1)), true);
  assert.equal(oracle.terminal(id(0, 69, 10)), true);
  assert.equal(oracle.terminal(id(0, 69, 11)), false);
  assert.equal(oracle.terminal(id(0, 69, 59)), true);
  assert.equal(oracle.terminal(id(9, 69, 10)), false);
});
check('both pursuers target OLD human; literal simultaneous successors', () => {
  const start = id(22, 26, 24);
  const destinations = [14, 25, 34, 23, 24];
  for (let a = 0; a < 5; a++)
    assert.equal(oracle.transition(start, a), id(23, 25, destinations[a]));
  assert.equal(oracle.terminal(id(23, 25, 14)), false);
  assert.equal(oracle.terminal(id(23, 25, 25)), true);
  assert.equal(oracle.terminal(id(23, 25, 24)), true);
});
check('pursuer ties E before S, S before W, N before W; overlap permitted', () => {
  assert.equal(oracle.transition(id(22, 26, 44), 4), id(23, 36, 44));
  assert.equal(oracle.transition(id(44, 46, 22), 4), id(34, 36, 22));
  assert.equal(oracle.transition(id(22, 22, 44), 4), id(23, 23, 44));
});
check('all four borders reject rather than wrap; invalid actions', () => {
  assert.equal(oracle.transition(id(68, 69, 0), 0), -1);
  assert.equal(oracle.transition(id(68, 69, 0), 3), -1);
  assert.equal(oracle.transition(id(0, 1, 69), 1), -1);
  assert.equal(oracle.transition(id(0, 1, 69), 2), -1);
  assert.equal(oracle.transition(id(68, 69, 0), 1), id(58, 59, 1));
  assert.equal(oracle.transition(id(0, 1, 69), 3), id(1, 2, 68));
  for (const a of [-1, 5, 0.5, NaN])
    assert.equal(oracle.transition(id(0, 69, 34), a), -1);
});
check('first maximum on retained safe actions, not original unsafe maximum', () => {
  assert.deepEqual(oracle.decide(id(22, 26, 24), [7, 100, 7, 99, 98]),
    { action: 0, mask: [true, false, true, false, false] });
  assert.deepEqual(oracle.decide(id(22, 26, 24), [-8, 100, -7, 99, 98]),
    { action: 2, mask: [true, false, true, false, false] });
});
check('all unsafe fallback retains ALL legal actions with original score ties', () => {
  const state = id(2, 20, 0);
  assert.equal(oracle.transition(state, 1), id(1, 10, 1));
  assert.equal(oracle.transition(state, 2), id(1, 10, 10));
  assert.equal(oracle.transition(state, 4), id(1, 10, 0));
  assert.deepEqual(oracle.decide(state, [900, 7, 7, 900, 6]),
    { action: 1, mask: [false, true, true, false, true] });
  assert.deepEqual(oracle.decide(state, [900, 6, 7, 900, 8]),
    { action: 4, mask: [false, true, true, false, true] });
});
check('safe border masks and first-maximum all-five tie', () => {
  assert.deepEqual(oracle.decide(id(68, 69, 0), [50, 1, 1, 50, 1]),
    { action: 1, mask: [false, true, true, false, true] });
  assert.deepEqual(oracle.decide(id(0, 1, 69), [1, 50, 50, 1, 1]),
    { action: 0, mask: [true, false, false, true, true] });
  assert.deepEqual(oracle.decide(id(0, 69, 34), [0, 0, 0, 0, 0]),
    { action: 0, mask: [true, true, true, true, true] });
});
check('terminal decision does not read scores; clock is absent from positional API', () => {
  assert.deepEqual(oracle.decide(id(0, 69, 1), null),
    { action: -1, mask: [false, false, false, false, false] });
  assert.deepEqual(oracle.decide(id(22, 26, 24), [7, 100, 7, 99, 98], {tick: 9999, tickLimit: 10000}),
    { action: 0, mask: [true, false, true, false, false] });
});
check('initial contact forbids every tick including a proposed exchange', () => {
  for (let a = 0; a < 5; a++) {
    assert.equal(oracle.transition(id(0, 69, 1), a), -1);
    assert.equal(oracle.transition(id(0, 69, 0), a), -1);
  }
});
