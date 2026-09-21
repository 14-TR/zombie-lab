"use strict";
// Candidate-only intervention on ORIGINAL ZL-015, not the procedural ZL-016 prompt.
const original=require('./jev-controller.cjs'),pilot=require('./jev-pilot.cjs');
function prepare(state){
 const request=original.request(state);
 // The mask uses immediate physics only, not exact ranks or model predictions.
 const safeActions=pilot.legal(state.human).filter(a=>original.advance(state,a.action).status!=='caught').map(a=>a.action);
 const retainedActions=safeActions.length?safeActions:pilot.legal(state.human).map(a=>a.action);
 request.questions.human_action.criteria=Object.fromEntries(retainedActions.map(a=>[a,request.questions.human_action.criteria[a]]));
 return {request:safeActions.length===1?null:request,mask:{safeActions,retainedActions,safeSetSize:safeActions.length,mode:safeActions.length?'safe_candidates':'all_unsafe_fallback',agency:safeActions.length===1?'forced_guardrail':'jev_choice'}};
}
function forced(state){
 const p=prepare(state);if(p.mask.agency!=='forced_guardrail')throw Error('Not a forced singleton');
 const action=p.mask.retainedActions[0];return {action,answers:null,successor:original.advance(state,action)};
}
function decision(state,response){
 const p=prepare(state);if(!p.request)throw Error('No Jev agency on forced step');
 if(response?.model!==pilot.MODEL)throw Error('Wrong returned model');
 const {validAnswer}=require('./evaluate-jev.cjs');
 for(const [key,q]of Object.entries(p.request.questions))if(!validAnswer(q,response.answers?.[key]))throw Error('Invalid Choice; no repair');
 const action=response.answers.human_action.choice;
 return {action,answers:response.answers,successor:original.advance(state,action)};
}
function exactAction(state){
 const facts=original.facts(state),winning=facts.actions.filter(a=>a.rank===-1);
 const candidates=winning.length?winning:facts.actions.filter(a=>a.rank===Math.max(...facts.actions.map(a=>a.rank)));
 return candidates[0].action;
}
function exactControl(initial){
 const frames=[pilot.clone(initial)],decisions=[];let state=frames[0];
 while(state.status==='running'&&state.tick<12){
  const prepared={...prepare(state),facts:original.facts(state)};
  const reference=JSON.parse(require('node:child_process').execFileSync('python3',['-B',require('node:path').join(pilot.ROOT,'scripts/check-jev-safe-reference.py'),'--decision'],{input:JSON.stringify({state,prepared}),encoding:'utf8',timeout:15000}));
  const action=exactAction(state),successor=original.advance(state,action);
  require('node:assert/strict').deepEqual(successor,prepared.facts.actions.find(a=>a.action===action).successor);
  decisions.push({before:state,truth:prepared.facts,mask:prepared.mask,reference,agency:'exact_planner',action,answers:null,receipt:null});
  frames.push(successor);state=successor;
 }
 return {policy:'exact',frames,decisions,outcome:state.status==='caught'?'capture':'unresolved',stopTick:state.tick};
}
module.exports={prepare,forced,decision,exactAction,exactControl};
if(require.main===module){
 const input=JSON.parse(require('node:fs').readFileSync(0,'utf8'));let result;
 if(input.op==='prepare')result={...prepare(input.state),facts:original.facts(input.state)};
 else if(input.op==='decision')result=decision(input.state,input.response);
 else if(input.op==='forced')result=forced(input.state);
 else throw Error('Unknown operation');
 console.log(JSON.stringify(result));
}
