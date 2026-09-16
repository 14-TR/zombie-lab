'use strict';
// Independent ZL-012 oracle. No production imports or generated tables.
// Cell IDs are row-major on a 10 by 7 board. Actions: N,E,S,W,stay.
function unpack(index) {
  if (!Number.isInteger(index) || index < 0 || index >= 343000)
    throw new RangeError('Invalid ordered state index');
  const human = index % 70;
  const pair = Math.floor(index / 70);
  return [Math.floor(pair / 70), pair % 70, human];
}
function contact(a, b) {
  return Math.abs(a % 10 - b % 10) +
    Math.abs(Math.floor(a / 10) - Math.floor(b / 10)) <= 1;
}
function terminal(index) {
  const [first, second, human] = unpack(index);
  return contact(first, human) || contact(second, human);
}
// On an obstacle-free rectangle, nearest-neighbor pursuit decreases one
// nonzero coordinate difference. The first reducing direction in N/E/S/W
// order is exactly the first nearest move; it is necessarily in bounds.
// This sign decision tree deliberately does not reuse legacy move enumeration.
function pursue(from, oldHuman) {
  const x = from % 10, y = Math.floor(from / 10);
  const hx = oldHuman % 10, hy = Math.floor(oldHuman / 10);
  if (hy < y) return from - 10;
  if (hx > x) return from + 1;
  if (hy > y) return from + 10;
  if (hx < x) return from - 1;
  return from;
}
function destination(human, action) {
  switch (action) {
    case 0: return human >= 10 ? human - 10 : -1;
    case 1: return human % 10 < 9 ? human + 1 : -1;
    case 2: return human < 60 ? human + 10 : -1;
    case 3: return human % 10 > 0 ? human - 1 : -1;
    case 4: return human;
    default: return -1;
  }
}
function transition(index, action) {
  const [first, second, human] = unpack(index);
  if (contact(first, human) || contact(second, human)) return -1;
  const nextHuman = destination(human, action);
  if (nextHuman === -1) return -1;
  return (pursue(first, human) * 70 + pursue(second, human)) * 70 + nextHuman;
}
// Include edge exchange explicitly even though any one-cell exchange starts
// cardinal-adjacent and is rejected by initial-contact precedence.
function captured(before, after) {
  const [a, b, h] = unpack(before);
  const [na, nb, nh] = unpack(after);
  return contact(na, nh) || contact(nb, nh) ||
    (nh === a && na === h) || (nh === b && nb === h);
}
function decide(index, scores) {
  if (terminal(index)) return { action: -1, mask: [false, false, false, false, false] };
  const next = [0, 1, 2, 3, 4].map(action => transition(index, action));
  const legal = next.map(state => state !== -1);
  const safe = next.map(state => state !== -1 && !captured(index, state));
  const mask = safe.some(Boolean) ? safe : legal;
  let action = -1;
  for (let candidate = 0; candidate < 5; candidate++) {
    if (mask[candidate] && (action === -1 || scores[candidate] > scores[action]))
      action = candidate;
  }
  return { action, mask };
}
// Scores are supplied original finite neural logits. No network is loaded.
// This position-only interface models tick 0, limit 10000: no clock can enter
// the prediction. Captured successors remain state IDs; only illegal actions
// and already-terminal sources return -1. terminal(next) is their contact flag.
module.exports = Object.freeze({ terminal, transition, decide });
