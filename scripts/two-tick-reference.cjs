'use strict';
// Independent ZL-013 reference. No production imports, clock, model or ranks.
const vector = [[0,-1],[1,0],[0,1],[-1,0],[0,0]];
function unpack(index) {
  if (!Number.isInteger(index) || index < 0 || index >= 343000) throw new RangeError('state index');
  return [Math.floor(index / 4900), Math.floor(index / 70) % 70, index % 70];
}
function distance(a,b) { return Math.abs(a%10-b%10)+Math.abs(Math.floor(a/10)-Math.floor(b/10)); }
function terminal(index) {
  const [a,b,h] = unpack(index);
  return distance(a,h)<=1 || distance(b,h)<=1;
}
function destination(cell, action) {
  if (!Number.isInteger(action) || action < 0 || action > 4) return -1;
  const x = cell%10+vector[action][0], y = Math.floor(cell/10)+vector[action][1];
  return x<0 || x>=10 || y<0 || y>=7 ? -1 : y*10+x;
}
function pursue(cell, human) {
  let best = cell, score = Infinity;
  for (let action=0; action<5; action++) {
    const next = destination(cell,action);
    if (next < 0) continue;
    const d = distance(next,human);
    if (d < score) { score=d; best=next; }
  }
  return best;
}
function transition(index, action) {
  const [a,b,h] = unpack(index);
  if (terminal(index)) return -1;
  const nextH = destination(h,action);
  if (nextH < 0) return -1;
  const nextA = pursue(a,h), nextB = pursue(b,h);
  // Crossing requires initial adjacency, already terminal above. Every
  // reachable post-tick capture is therefore encoded by endpoint contact.
  return (nextA*70+nextB)*70+nextH;
}
function decide(index, scores) {
  const depth1 = Array(5).fill(false), depth2 = Array(5).fill(false);
  const legal = Array(5).fill(false);
  if (terminal(index)) return {action:-1, mask:legal, depth1, depth2, horizon:0};
  if (!scores || scores.length !== 5 || Array.from(scores).some(x => !Number.isFinite(x))) throw new TypeError('five finite scores required');
  for (let a=0; a<5; a++) {
    const next = transition(index,a);
    legal[a] = next >= 0;
    if (!legal[a] || terminal(next)) continue;
    depth1[a] = true;
    for (let b=0; b<5; b++) {
      const end = transition(next,b);
      if (end >= 0 && !terminal(end)) { depth2[a]=true; break; }
    }
  }
  const horizon = depth2.some(Boolean) ? 2 : depth1.some(Boolean) ? 1 : 0;
  const mask = (horizon === 2 ? depth2 : horizon === 1 ? depth1 : legal).slice();
  let action = -1;
  for (let a=0; a<5; a++) if (mask[a] && (action < 0 || scores[a] > scores[action])) action=a;
  return {action, mask, depth1, depth2, horizon};
}
module.exports = Object.freeze({terminal, transition, decide});
