/* ZL-012: frozen logits with exactly one production-tick capture mask. */
(function(root){
  "use strict";
  const neural=typeof module==="object"&&module.exports?require("./neural-policy.js"):root.NeuralPolicy;
  const directions=[[0,-1],[1,0],[0,1],[-1,0],[0,0]];
  function inspect(state,model,production=root.ZombiePair){
    // Original inference validates positions even when contact is terminal.
    const preferred=neural.chooseHuman(state,model);
    if(state.status&&state.status!=="running"||state.zombies.some(z=>Math.abs(z.x-state.human.x)+Math.abs(z.y-state.human.y)<=1))
      return {scores:null,candidates:[],human:preferred,action:-1};
    const scores=neural.logits(state,model), hypothetical={...state,tick:0,tickLimit:10000,status:"running"};
    const zombies=production.step(hypothetical,"greedy").zombies;
    const candidates=[];
    for(let action=0;action<5;action++){
      const human={x:state.human.x+directions[action][0],y:state.human.y+directions[action][1]};
      if(human.x<0||human.x>=state.width||human.y<0||human.y>=state.height)continue;
      const next=production.resolveTick(hypothetical,{human,zombies});
      candidates.push({action,human,next,capture:next.status==="caught"});
    }
    const hasSafe=candidates.some(c=>!c.capture);
    let selected=null;
    for(const candidate of candidates){
      candidate.keep=!hasSafe||!candidate.capture;
      if(candidate.keep&&(!selected||scores[candidate.action]>scores[selected.action]))selected=candidate;
    }
    return {scores,candidates,human:{...selected.human},action:selected.action};
  }
  function chooseHuman(state,model,production){return inspect(state,model,production).human;}
  const api=Object.freeze({inspect,chooseHuman});
  if(typeof module==="object"&&module.exports)module.exports=api;else root.OneTickPolicy=api;
}(globalThis));
