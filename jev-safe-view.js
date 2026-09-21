(function(root){'use strict';
const names={original:'Original Jev · historical',safe:'Immediate-safe Jev + guardrail',exact:'Exact certificate planner'};
function traces(run){return [['original',run.original],['safe',run.safe],['exact',run.controls.exact]];}
function frameAt(trace,tick){return trace.frames[Math.min(tick,trace.frames.length-1)];}
function decisionAt(trace,tick){return tick>0?trace.decisions[tick-1]??null:null;}
function mount(data,doc){
 if(!data?.prerecorded||data.experiment!=='ZL-017'||data.runs?.length!==2)throw Error('Expected two prerecorded safe-candidate comparisons');
 const by=id=>doc.getElementById(id),el=(tag,text,cls)=>{const n=doc.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
 const s=data.summary.safe;
 by('summary').append(el('p',`${s.simulationTicks} simulation ticks: ${s.admitted} genuine Jev choices + ${s.forcedSteps} forced guardrail steps. ${s.actions.unsafe} immediately unsafe moves; ${s.actions.winningSuccessor}/${s.actions.valid} successors retain exact avoidability.`));
 by('summary').append(el('p',`Safe-set sizes: ${Object.entries(s.safeSetSizes).map(([n,count])=>`${n} options on ${count} steps`).join('; ')}. All-unsafe fallback steps: ${s.allUnsafeFallbacks}.`));
 by('summary').append(el('p',`Visited genuine-choice states offering a safe-looking delayed trap: ${s.genuineChoiceStatesWithDelayedTrap}. The run therefore does not test Jev's ability to distinguish those traps.`));
 by('summary').append(el('p',`Diagnostic zombie predictions: ${s.zombiePredictions.correct}/${s.zombiePredictions.total} correct; ${s.zombiePredictions.missingNotRequested} values not requested on forced steps. New usage ${s.usage.inputTokens} input + ${s.usage.outputTokens} output tokens; estimate $${s.usage.estimatedUSD.toFixed(9)} (not invoice). ${s.maxRequests-s.admitted} unused admissions stay unused.`));
 for(const r of data.runs){
  const opt=el('option',`${r.id} · starting state ${r.stateIndex}`);opt.value=r.id;by('run').append(opt);
  by('summary').append(el('p',`${r.id}: original ${r.original.outcome} at ${r.original.frames.at(-1).tick}; safe treatment ${r.safe.outcome} at ${r.safe.frames.at(-1).tick}; exact planner ${r.controls.exact.outcome} at ${r.controls.exact.stopTick}. First loss of exact avoidability: original ${r.metrics.original.firstLossTick??'none'}, treatment ${r.metrics.safe.firstLossTick??'none'}.`));
 }
 let row=data.runs[0],tick=0,timer=null;
 const positions=f=>`H (${f.human.x},${f.human.y}); Z1 (${f.zombies[0].x},${f.zombies[0].y}); Z2 (${f.zombies[1].x},${f.zombies[1].y})`;
 function stop(){if(timer!==null)clearInterval(timer);timer=null;by('play').disabled=false;by('pause').disabled=true;}
 function board(f){
  const ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 500 350');svg.setAttribute('role','img');svg.setAttribute('aria-label',positions(f));
  const shape=(tag,attrs)=>{const n=doc.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));svg.append(n);return n;};
  for(let x=0;x<=10;x++)shape('line',{x1:x*50,y1:0,x2:x*50,y2:350,stroke:'#bac8cd'});
  for(let y=0;y<=7;y++)shape('line',{x1:0,y1:y*50,x2:500,y2:y*50,stroke:'#bac8cd'});
  const agents=[{p:f.human,label:'H',color:'#155d8c'},{p:f.zombies[0],label:'1',color:'#a92e37'},{p:f.zombies[1],label:'2',color:'#734b9c'}];
  for(const a of agents){const shared=agents.filter(b=>b.p.x===a.p.x&&b.p.y===a.p.y),i=shared.indexOf(a);let x=25,y=25;
   if(shared.length===2)x=i===0?12.5:37.5;if(shared.length===3){x=i===0?25:i===1?12.5:37.5;y=i===0?12.5:37.5;}
   shape('text',{x:a.p.x*50+x,y:a.p.y*50+y,fill:a.color,'font-size':28,'font-weight':800,'text-anchor':'middle','dominant-baseline':'central','data-agent':a.label}).textContent=a.label;
  }return svg;
 }
 function decisionPanel(arm,trace){
  const panel=el('article','','decision-arm');panel.dataset.arm=arm;panel.append(el('h3',names[arm]));const e=decisionAt(trace,tick);
  if(!e){panel.append(el('p',tick===0?'Initial state: no move has happened.':'No new decision at this shared tick; the actual stopping endpoint is held.'));return panel;}
  panel.append(el('p',`Actual decision ${tick}: human ${e.action??'unavailable'} from local tick ${e.before.tick}.`));
  if(arm==='safe'){
   panel.append(el('p',`Safe-set size ${e.mask.safeSetSize}; retained options ${e.mask.retainedActions.join(', ')}; ${e.mask.mode}.`,'badge'));
   panel.append(el('p',e.agency==='forced_guardrail'?'Forced guardrail action · zero API requests · no Jev agency.':'Genuine Jev choice among code-retained options.'));
  }else if(arm==='original')panel.append(el('p',`Unfiltered original Choice: all ${e.truth.actions.length} legal options were offered; historical call.`));
  else panel.append(el('p','Exact certificate-winning / maximum-delay selection, first legal tie. No model call.'));
  for(let i=0;i<2;i++){
   const answer=e.answers?.['zombie'+(i+1)+'_move'],truth=e.truth.zombieMoves[i];
   if(e.agency==='forced_guardrail')panel.append(el('p',`Z${i+1}: prediction not requested (forced step); simulator moved ${truth}.`,'note'));
   else if(arm==='exact')panel.append(el('p',`Z${i+1}: no model prediction; simulator moved ${truth}.`,'note'));
   else panel.append(el('p',`Z${i+1}: Jev predicted ${answer?.choice??'missing/invalid'}; simulator moved ${truth}.`,answer?.choice===truth?'good':'bad'));
   if(answer)panel.append(el('p',Object.entries(answer.probabilities).map(([a,p])=>`${a}: ${p.toFixed(2)}`).join(' · '),'note'));
  }
  if(e.answers?.human_action)panel.append(el('p','Human Choice probabilities: '+Object.entries(e.answers.human_action.probabilities).map(([a,p])=>`${a}: ${p.toFixed(2)}`).join(' · '),'note'));
  const a=e.truth.actions.find(a=>a.action===e.action);
  if(a)panel.append(el('p',`Actual successor: ${a.capture?'captured':'not immediately captured'}; exact rank ${a.rank} (${a.avoidable?'some future strategy can avoid capture':'finite losing rank'}).`,a.avoidable?'good':'bad'));
  panel.append(el('p','Exact ranks above are evaluator-only, never passed to Jev. Immediate safety membership IS supplied by the code restriction in the treatment.','note'));
  const links=el('p',''),directory=arm==='original'?'jev-controller':'jev-safe';
  if(arm==='exact'){const a=el('a','Frozen exact-control evidence');a.href='evidence/jev-safe/frozen/exact-controls.json';links.append(a);}
  else for(const [label,suffix]of [['Request','request'],['Response','response'],['Receipt','receipt'],['Checked truth','truth']]){
   if(suffix!=='truth'&&!e.receipt)continue;if(suffix==='response'&&!e.receipt.responseSHA256)continue;
   const a=el('a',label+' ');a.href=`evidence/${directory}/recording/${e.id}.${suffix}.json`;links.append(a);
  }panel.append(links);return panel;
 }
 function render(){
  by('scrubber').value=String(tick);by('readout').textContent=`Shared tick ${tick} / 12`;by('back').disabled=tick===0;by('next').disabled=tick===12;by('boards').replaceChildren();
  for(const [name,trace]of traces(row)){
   const f=frameAt(trace,tick),card=el('article','','board');card.dataset.policy=name;card.append(el('h2',names[name]));
   const label=f.status==='limit'?'unresolved cutoff':f.status==='caught'?'captured':f.tick===trace.frames.at(-1).tick&&['invalid_response','service_failure','deadline'].includes(trace.outcome)?trace.outcome:f.status;
   card.append(el('p',`Local tick ${f.tick} · ${label}${tick>f.tick?' · endpoint held':''}`,'badge'));card.append(board(f));card.append(el('p',positions(f),'positions'));by('boards').append(card);
  }
  by('decision').replaceChildren(...traces(row).map(([name,trace])=>decisionPanel(name,trace)));
 }
 function select(){
  stop();row=data.runs.find(r=>r.id===by('run').value);tick=0;by('histories').replaceChildren();
  for(const [name,trace]of traces(row)){const details=el('details','');details.append(el('summary',`${names[name]}: ${trace.frames.length} complete frames`));for(const f of trace.frames)details.append(el('p',`Tick ${f.tick}: ${positions(f)} · ${f.status}`,'history-frame'));by('histories').append(details);}render();
 }
 by('run').addEventListener('change',select);by('scrubber').addEventListener('input',()=>{stop();tick=Number(by('scrubber').value);render();});
 by('back').addEventListener('click',()=>{stop();tick=Math.max(0,tick-1);render();});by('next').addEventListener('click',()=>{stop();tick=Math.min(12,tick+1);render();});by('pause').addEventListener('click',stop);
 by('play').addEventListener('click',()=>{stop();if(tick===12)tick=0;by('play').disabled=true;by('pause').disabled=false;render();timer=setInterval(()=>{tick++;render();if(tick===12)stop();},500);});select();
}
root.JevSafeView={frameAt,decisionAt,traces,mount};
if(typeof document!=='undefined')try{mount(root.ZL_SAFE_DATA,document);}catch(e){document.getElementById('error').hidden=false;document.getElementById('error').textContent=e.message;}
}(globalThis));
