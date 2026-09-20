"use strict";
// Offline experiment only; the production world is loaded without modification.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname,'..');
const CERTIFICATE = 'evidence/avoidability/data/avoidability-certificate.json';
const MODEL = 'jev-1.13.0', ACTIONS = ['N','E','S','W','stay'];
const DELTAS = [[0,-1],[1,0],[0,1],[-1,0],[0,0]];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const indexOf = s => ((s.zombies[0].y*10+s.zombies[0].x)*70+s.zombies[1].y*10+s.zombies[1].x)*70+s.human.y*10+s.human.x;
function legal(from) {
  return DELTAS.map(([dx,dy],i)=>({action:ACTIONS[i],x:from.x+dx,y:from.y+dy}))
    .filter(p=>p.x>=0&&p.x<10&&p.y>=0&&p.y<7);
}
function production() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(ROOT,'two-zombies.js'),'utf8'),context,{timeout:1000});
  return context.ZombiePair;
}
function buildDataset() {
  const pair=production(), ranks=JSON.parse(fs.readFileSync(path.join(ROOT,CERTIFICATE))).ranks;
  if(ranks.length!==343000) throw Error('Incomplete certificate');
  const population=[];
  for(let z2=0;z2<70;z2++) for(let h=0;h<70;h++) {
    const state=pair.initialState(h,z2);
    if(state.zombies.some(z=>Math.abs(z.x-state.human.x)+Math.abs(z.y-state.human.y)<=1)) continue;
    population.push(state);
  }
  const samples=Array.from({length:24},(_,i)=>{
    const selectionIndex=Math.floor(i*(population.length-1)/23), state=population[selectionIndex];
    const zombies=clone(pair.step(state,'greedy').zombies);
    const zombieMoves=state.zombies.map((z,i)=>legal(z).find(a=>a.x===zombies[i].x&&a.y===zombies[i].y).action);
    const actions=legal(state.human).map(a=>{
      const successor=clone(pair.resolveTick(state,{human:{x:a.x,y:a.y},zombies}));
      const successorIndex=indexOf(successor), rank=ranks[successorIndex];
      return {action:a.action,destination:{x:a.x,y:a.y},successorIndex,successor,rank,capture:successor.status==='caught',avoidable:rank===-1};
    });
    const winning=actions.filter(a=>a.avoidable), bestRank=Math.max(...actions.map(a=>a.rank));
    const optimal=(winning.length?winning:actions.filter(a=>a.rank===bestRank)).map(a=>a.action);
    return {id:`sample-${String(i+1).padStart(2,'0')}`,selectionIndex,stateIndex:indexOf(state),state:clone(state),rank:ranks[indexOf(state)],zombieMoves,actions,optimalActions:optimal,canonicalAction:optimal[0]};
  });
  return {schemaVersion:1,promptVersion:'ZL-014-v1',model:MODEL,population:population.length,selection:'floor(i*(N-1)/23), i=0..23; ascending ordered state ID',sourceHashes:Object.fromEntries(['two-zombies.js',CERTIFICATE,'experiments/ZL-014-protocol.md'].map(p=>[p,sha(fs.readFileSync(path.join(ROOT,p)))])),samples};
}
const RULES = {
  board:'10 columns x 7 rows, origin (0,0) top left; x increases east, y south. No obstacles or wraparound.',
  movement:'Each tick H, Z1 and Z2 simultaneously stay or move one cardinal cell, in bounds. Choices read the SAME OLD positions. Zombies may share cells; they do not block one another.',
  zombies:'Each zombie independently minimizes Manhattan distance |dx|+|dy| from its candidate destination to the OLD human position. Ties take the first legal move in order N,E,S,W,stay. This repeats each future tick.',
  capture:'Human is captured if sharing a cell or cardinal-adjacent (Manhattan distance <=1) to either zombie before or after the simultaneous move. Diagonal adjacency alone does not capture. Exchanged human/zombie positions also capture. Initial capture ends the run before any move.',
  human:'Future human actions may use full observation and choose any legal move. Indefinite avoidance means there exists a human strategy that is never captured against these fixed deterministic zombies, with no time cutoff.'
};
function requestFor(sample) {
  const s=sample.state, candidates={human:legal(s.human),zombie1:legal(s.zombies[0]),zombie2:legal(s.zombies[1])};
  const state={rules:RULES,positions:{human:s.human,zombie1:s.zombies[0],zombie2:s.zombies[1]},legalCandidates:candidates};
  const criteria=xs=>Object.fromEntries(xs.map(p=>[p.action,`Move to (${p.x},${p.y})`]));
  const questions={};
  for(const name of ['zombie1','zombie2']) questions[name+'_move']={type:'choice',instructions:`Which legal move will ${name} make on the next tick under the deterministic zombie rule? Use its OLD position and the OLD human position, not a hypothetical new human destination. Apply the stated tie order.`,criteria:criteria(candidates[name])};
  for(const a of candidates.human){
    const premise=`Suppose the human now chooses ${a.action} to (${a.x},${a.y}), while both zombies choose simultaneously from the OLD state using the fixed zombie rule.`;
    questions['capture_'+a.action]={type:'noul',instructions:premise+' Is the human captured on this immediate transition (including initial or post-move contact)?',criteria:{true:'Captured now',false:'Not captured on this transition'}};
    questions['avoid_'+a.action]={type:'noul',instructions:premise+' Does the resulting successor admit indefinite avoidance: is there any sequence/strategy of future legal human choices that avoids capture forever against these same deterministic zombies? An immediately captured successor is false. Not merely surviving the next tick.',criteria:{true:'A future human strategy avoids capture forever',false:'Capture is unavoidable eventually, or already occurred'}};
  }
  questions.human_action={type:'choice',instructions:'Choose the human move now. Prefer a move whose actual simultaneous successor admits indefinite avoidance against these deterministic zombies. If none admits indefinite avoidance, maximize ticks until capture using the best future human choices. Among equally good moves choose the first in N,E,S,W,stay order. Evaluate directly from rules and old positions; no other question answer is available.',criteria:criteria(candidates.human)};
  return {model:MODEL,state,questions};
}
module.exports={ROOT,CERTIFICATE,MODEL,ACTIONS,sha,clone,indexOf,legal,production,buildDataset,requestFor};
