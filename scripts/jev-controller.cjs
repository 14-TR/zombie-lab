"use strict";
const fs=require('node:fs'),path=require('node:path'),pilot=require('./jev-pilot.cjs'),{validAnswer}=require('./evaluate-jev.cjs');
const pair=pilot.production(),ranks=JSON.parse(fs.readFileSync(path.join(pilot.ROOT,pilot.CERTIFICATE))).ranks;
function request(state){const r=pilot.requestFor({state});return {...r,questions:Object.fromEntries(['zombie1_move','zombie2_move','human_action'].map(k=>[k,r.questions[k]]))};}
function advance(state,action){
 const move=pilot.legal(state.human).find(a=>a.action===action);if(!move)throw Error('Invalid human action');
 // Only the human action comes from Jev. Actual zombies always use old-state production.
 return pilot.clone(pair.resolveTick(state,{human:{x:move.x,y:move.y},zombies:pair.step(state,'greedy').zombies}));
}
function facts(state){
 const zombies=pilot.clone(pair.step(state,'greedy').zombies);
 const zombieMoves=Array.from(state.zombies,(p,i)=>pilot.legal(p).find(a=>a.x===zombies[i].x&&a.y===zombies[i].y).action);
 const actions=pilot.legal(state.human).map(a=>{const successor=advance(state,a.action),successorIndex=pilot.indexOf(successor),rank=ranks[successorIndex];return {action:a.action,successor,successorIndex,rank,capture:successor.status==='caught',avoidable:rank===-1};});
 return {stateIndex:pilot.indexOf(state),rank:ranks[pilot.indexOf(state)],zombieMoves,actions};
}
function control(state,policy){const frames=[pilot.clone(state)];while(frames.at(-1).status==='running'&&frames.at(-1).tick<12)frames.push(pilot.clone(pair.step(frames.at(-1),policy)));return {policy,frames,outcome:frames.at(-1).status==='caught'?'capture':'unresolved',stopTick:frames.at(-1).tick};}
function decision(state,response){
 if(response?.model!==pilot.MODEL)throw Error('Wrong returned model');
 const req=request(state),answers=Object.fromEntries(Object.entries(req.questions).map(([k,q])=>[k,validAnswer(q,response.answers?.[k])?response.answers[k]:null]));
 if(!answers.human_action)throw Error('Invalid human choice; no fallback');
 return {action:answers.human_action.choice,answers,successor:advance(state,answers.human_action.choice)};
}
module.exports={request,advance,facts,control,decision};
if(require.main===module){const input=JSON.parse(fs.readFileSync(0,'utf8'));if(input.op==='prepare')console.log(JSON.stringify({request:request(input.state),facts:facts(input.state)}));else if(input.op==='decision')console.log(JSON.stringify(decision(input.state,input.response)));else throw Error('Unknown operation');}
