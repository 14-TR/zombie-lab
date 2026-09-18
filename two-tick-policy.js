/* ZL-013: existential two-tick safety, frozen current-state logits. */
(function(root){
 "use strict";
 const neural=typeof module==="object"&&module.exports?require("./neural-policy.js"):root.NeuralPolicy;
 const directions=[[0,-1],[1,0],[0,1],[-1,0],[0,0]];
 function successors(state,production){
  const old={...state,tick:0,tickLimit:10000,status:"running"},zombies=production.step(old,"greedy").zombies,out=[];
  for(let action=0;action<5;action++){
   const human={x:old.human.x+directions[action][0],y:old.human.y+directions[action][1]};
   if(human.x<0||human.x>=10||human.y<0||human.y>=7)continue;
   const next=production.resolveTick(old,{human,zombies});out.push({action,human,next,capture:next.status==="caught"});
  }return out;
 }
 function inspect(state,model,production=root.ZombiePair){
  const preferred=neural.chooseHuman(state,model);
  if(state.status&&state.status!=="running"||state.zombies.some(z=>Math.abs(z.x-state.human.x)+Math.abs(z.y-state.human.y)<=1))
   return {scores:null,candidates:[],human:preferred,action:-1,horizon:0};
  const scores=neural.logits(state,model),candidates=successors(state,production);
  for(const c of candidates){c.safe1=!c.capture;c.safe2=c.safe1&&successors(c.next,production).some(n=>!n.capture);}
  const horizon=candidates.some(c=>c.safe2)?2:candidates.some(c=>c.safe1)?1:0;let selected=null;
  for(const c of candidates){c.keep=horizon===2?c.safe2:horizon===1?c.safe1:true;
   if(c.keep&&(!selected||scores[c.action]>scores[selected.action]))selected=c;
  }return {scores,candidates,human:{...selected.human},action:selected.action,horizon};
 }
 function chooseHuman(state,model,production){return inspect(state,model,production).human;}
 const api=Object.freeze({inspect,chooseHuman});
 if(typeof module==="object"&&module.exports)module.exports=api;else root.TwoTickPolicy=api;
}(globalThis));
