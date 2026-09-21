"use strict";
// Prompt-only intervention. No evaluator facts enter request construction.
const original=require('./jev-controller.cjs');
const PROCEDURE="First apply this decision procedure yourself using the rules and OLD positions in state; no other question's answer is available. (1) For EACH zombie, evaluate ALL its legal candidate destinations against the OLD human position using Manhattan distance |dx|+|dy|. Select the minimum-distance destination, breaking ties by the FIRST legal move in N,E,S,W,stay order. These two zombie destinations are fixed for this simultaneous tick; do not recompute them toward a hypothetical new human destination. (2) Evaluate EVERY legal human candidate against those two zombie destinations. Mark a candidate as immediate capture if its destination shares a cell or is cardinal-adjacent (Manhattan distance <=1) to either destination, or exchanges old positions with either zombie. Diagonal adjacency alone is not capture; initial contact would already end the run. (3) If ANY candidate avoids immediate capture, reject ALL immediately capturing candidates and choose only among the noncapturing candidates. If ALL candidates capture, retain all legal candidates. (4) Among the remaining candidates apply the original long-term preference and tie order below. This is an instruction for your own choice, not a supplied safe-action label or external filter.";
function request(state){
 const r=original.request(state);
 r.questions.human_action.instructions=PROCEDURE+' '+r.questions.human_action.instructions;
 return r;
}
function decision(state,response){
 if(response?.model!=='jev-1.13.0')throw Error('Wrong returned model');
 const {validAnswer}=require('./evaluate-jev.cjs');
 for(const [key,q]of Object.entries(request(state).questions))if(!validAnswer(q,response.answers?.[key]))throw Error('Invalid Choice; no fallback');
 // Validation never changes or safety-filters the selected action.
 return original.decision(state,response);
}
module.exports={request,decision,PROCEDURE};
if(require.main===module){
 const input=JSON.parse(require('node:fs').readFileSync(0,'utf8'));
 if(input.op==='prepare')console.log(JSON.stringify({request:request(input.state),facts:original.facts(input.state)}));
 else if(input.op==='decision')console.log(JSON.stringify(decision(input.state,input.response)));
 else throw Error('Unknown operation');
}
