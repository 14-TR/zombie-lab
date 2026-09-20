"use strict";
const fs=require('node:fs'),path=require('node:path');
const pilot=require('./jev-pilot.cjs');
const probability=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
function validAnswer(q,a){
  if(!a||a.type!==q.type)return false;
  if(q.type==='noul')return probability(a.noul);
  if(q.type!=='choice'||!probability(a.confidence)||!a.probabilities||Array.isArray(a.probabilities))return false;
  const keys=Object.keys(q.criteria), p=a.probabilities;
  return Object.keys(p).length===keys.length&&keys.every(k=>probability(p[k]))&&keys.includes(a.choice)&&
    Math.abs(keys.reduce((v,k)=>v+p[k],0)-1)<=1e-5&&p[a.choice]>=Math.max(...keys.map(k=>p[k]));
}
function binary(rows){
  const valid=rows.filter(r=>r.probability!==null), correct=valid.filter(r=>(r.probability>=.5)===r.truth).length;
  const sum=valid.reduce((s,r)=>s+(r.probability-Number(r.truth))**2,0);
  return {total:rows.length,positiveTruth:rows.filter(r=>r.truth).length,valid:valid.length,missingInvalid:rows.length-valid.length,correct,modelMistakes:valid.length-correct,accuracy:correct/rows.length,brierValid:valid.length?sum/valid.length:null,brierPenalized:(sum+rows.length-valid.length)/rows.length};
}
function evaluate(dataset,responses){
  const capture=[],avoidability=[],zombies={total:dataset.samples.length*2,valid:0,correct:0,jointCorrect:0,byZombie:[{total:dataset.samples.length,valid:0,correct:0},{total:dataset.samples.length,valid:0,correct:0}]};
  const actions={total:dataset.samples.length,valid:0,safe:0,avoidable:0,optimal:0,canonical:0,oracleWinningStates:0,avoidableOnWinningStates:0,oracleLosingStates:0};
  const usage={responsesWithUsage:0,inputTokens:0,outputTokens:0,estimatedUSD:0,inputUSDPerMillion:.042,invoice:false};
  const results=dataset.samples.map(s=>{
    const response=responses[s.id], questions=pilot.requestFor(s).questions;
    const usable=response?.model===pilot.MODEL&&response.answers&&typeof response.answers==='object';
    const answers=Object.fromEntries(Object.entries(questions).map(([k,q])=>[k,usable&&validAnswer(q,response.answers[k])?response.answers[k]:null]));
    if(response?.usage&&['input_tokens','output_tokens'].every(k=>Number.isSafeInteger(response.usage[k])&&response.usage[k]>=0)){
      usage.responsesWithUsage++;usage.inputTokens+=response.usage.input_tokens;usage.outputTokens+=response.usage.output_tokens;
    }
    const z=s.zombieMoves.map((truth,i)=>{const answer=answers[`zombie${i+1}_move`],correct=!!answer&&answer.choice===truth;
      zombies.valid+=Number(!!answer);zombies.correct+=Number(correct);zombies.byZombie[i].valid+=Number(!!answer);zombies.byZombie[i].correct+=Number(correct);
      return {truth,answer,correct};});
    zombies.jointCorrect+=Number(z.every(v=>v.correct));
    const predictedActions=s.actions.map(a=>{
      const cp=answers['capture_'+a.action]?.noul??null,ap=answers['avoid_'+a.action]?.noul??null;
      capture.push({probability:cp,truth:a.capture});avoidability.push({probability:ap,truth:a.avoidable});
      return {...a,captureProbability:cp,avoidabilityProbability:ap};
    });
    const choice=answers.human_action,selected=choice?predictedActions.find(a=>a.action===choice.choice):null;
    actions.valid+=Number(!!choice);actions.safe+=Number(!!selected&&!selected.capture);actions.avoidable+=Number(!!selected&&selected.avoidable);
    actions.optimal+=Number(!!choice&&s.optimalActions.includes(choice.choice));actions.canonical+=Number(!!choice&&choice.choice===s.canonicalAction);
    actions.oracleWinningStates+=Number(s.rank===-1);actions.oracleLosingStates+=Number(s.rank!==-1);
    actions.avoidableOnWinningStates+=Number(s.rank===-1&&!!selected&&selected.avoidable);
    return {...s,actions:predictedActions,zombiePredictions:z,humanChoice:choice,selectedAction:choice?.choice??null,selectedSuccessor:selected?.successor??null,missingInvalid:Object.entries(answers).filter(([,v])=>v===null).map(([k])=>k)};
  });
  usage.estimatedUSD=usage.inputTokens*.042/1e6;
  zombies.accuracy=zombies.correct/zombies.total;
  return {schemaVersion:1,metadata:{prerecorded:true,model:pilot.MODEL,promptVersion:dataset.promptVersion,sourceHashes:dataset.sourceHashes},summary:{samples:results.length,population:dataset.population,capture:binary(capture),avoidability:binary(avoidability),zombies,actions,usage},results};
}
module.exports={validAnswer,evaluate,binary};
