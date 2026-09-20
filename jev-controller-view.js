(function(root){'use strict';
function frameAt(trace,tick){return trace.frames[Math.min(tick,trace.frames.length-1)];}
function decisionAt(run,tick){return tick>0?run.jev.decisions[tick-1]??null:null;}
function mount(data,doc){
 if(!data?.prerecorded||data.runs?.length!==2)throw Error('Expected two prerecorded paired runs');
 const by=id=>doc.getElementById(id),el=(tag,text,cls)=>{const n=doc.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
 const s=data.summary;
 for(const text of [`${s.admitted} real requests to ${data.model}; ${s.zombiePredictions.correct}/${s.zombiePredictions.total} zombie-move predictions correct.`,`${s.actions.winningSuccessor}/${s.actions.valid} chosen human moves preserved a winning successor. That is not proof of a winning policy.`,`Estimated API cost $${s.usage.estimatedUSD.toFixed(6)} from ${s.usage.inputTokens} input tokens; not an invoice.`])by('summary').append(el('p',text));
 for(const r of data.runs){const opt=el('option',`${r.id} · starting state ${r.stateIndex}`);opt.value=r.id;by('run').append(opt);by('summary').append(el('p',`${r.id}: Jev ${r.jev.outcome} at tick ${r.jev.frames.at(-1).tick}; greedy ${r.controls.greedy.outcome} at ${r.controls.greedy.stopTick}; depth2 ${r.controls.depth2.outcome} at ${r.controls.depth2.stopTick}.`));}
 let row=data.runs[0],tick=0,timer=null;
 const positions=f=>`H (${f.human.x},${f.human.y}); Z1 (${f.zombies[0].x},${f.zombies[0].y}); Z2 (${f.zombies[1].x},${f.zombies[1].y})`;
 function stop(){if(timer!==null)clearInterval(timer);timer=null;by('play').disabled=false;by('pause').disabled=true;}
 function board(f){const ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 500 350');svg.setAttribute('role','img');svg.setAttribute('aria-label',positions(f));
  const shape=(tag,attrs)=>{const n=doc.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));svg.append(n);return n;};
  for(let x=0;x<=10;x++)shape('line',{x1:x*50,y1:0,x2:x*50,y2:350,stroke:'#bac8cd'});
  for(let y=0;y<=7;y++)shape('line',{x1:0,y1:y*50,x2:500,y2:y*50,stroke:'#bac8cd'});
  const agents=[{p:f.human,label:'H',color:'#155d8c'},{p:f.zombies[0],label:'1',color:'#a92e37'},{p:f.zombies[1],label:'2',color:'#734b9c'}];
  for(const a of agents){const shared=agents.filter(b=>b.p.x===a.p.x&&b.p.y===a.p.y),i=shared.indexOf(a);let x=25,y=25;
   if(shared.length===2)x=i===0?12.5:37.5;if(shared.length===3){x=i===0?25:i===1?12.5:37.5;y=i===0?12.5:37.5;}
   shape('text',{x:a.p.x*50+x,y:a.p.y*50+y,fill:a.color,'font-size':28,'font-weight':800,'text-anchor':'middle','dominant-baseline':'central','data-agent':a.label}).textContent=a.label;
  }return svg;
 }
 function render(){
  by('scrubber').value=String(tick);by('readout').textContent=`Shared tick ${tick} / 12`;by('back').disabled=tick===0;by('next').disabled=tick===12;by('boards').replaceChildren();
  for(const [name,trace]of Object.entries({Jev:row.jev,greedy:row.controls.greedy,depth2:row.controls.depth2})){
   const f=frameAt(trace,tick),card=el('article','','board');card.dataset.policy=name;card.append(el('h2',name));card.append(el('p',`Local tick ${f.tick} · ${f.status==='limit'?'unresolved cutoff':f.status}${tick>f.tick?' · endpoint held':''}`,'badge'));card.append(board(f));card.append(el('p',positions(f),'positions'));by('boards').append(card);
  }
  const e=decisionAt(row,tick);by('decision').replaceChildren();
  if(!e){by('decision').append(el('p',tick===0?'Initial state: no move has happened.':'No new Jev decision at this shared tick; its actual stopping endpoint is held.'));return;}
  by('decision').append(el('p',`Actual decision ${tick}: human ${e.action??'unavailable'} from tick ${e.before.tick}.`));
  for(let i=0;i<2;i++){const answer=e.answers?.['zombie'+(i+1)+'_move'],truth=e.truth.zombieMoves[i];by('decision').append(el('p',`Z${i+1}: Jev predicted ${answer?.choice??'missing/invalid'}; simulator moved ${truth}.`,answer?.choice===truth?'good':'bad'));if(answer)by('decision').append(el('p',Object.entries(answer.probabilities).map(([a,p])=>`${a}: ${p.toFixed(2)}`).join(' · '),'note'));}
  if(e.answers?.human_action)by('decision').append(el('p','Human Choice probabilities: '+Object.entries(e.answers.human_action.probabilities).map(([a,p])=>`${a}: ${p.toFixed(2)}`).join(' · '),'note'));
  const selected=e.truth.actions.find(a=>a.action===e.action);if(selected)by('decision').append(el('p',`Actual successor: ${selected.capture?'captured':'not immediately captured'}; ${selected.avoidable?'indefinite avoidance remains possible under some future strategy':'indefinite avoidance is no longer possible'}.`,selected.avoidable?'good':'bad'));
  const links=el('p','');for(const [label,suffix]of [['Request','request'],['Response','response'],['Receipt','receipt']]){const a=el('a',label+' ');a.href=`evidence/jev-controller/recording/${e.id}.${suffix}.json`;links.append(a);}by('decision').append(links);
 }
 function select(){stop();row=data.runs.find(r=>r.id===by('run').value);tick=0;by('histories').replaceChildren();
  for(const [name,trace]of Object.entries({Jev:row.jev,greedy:row.controls.greedy,depth2:row.controls.depth2})){const details=el('details','');details.append(el('summary',`${name}: ${trace.frames.length} complete frames`));for(const f of trace.frames)details.append(el('p',`Tick ${f.tick}: ${positions(f)} · ${f.status}`,'history-frame'));by('histories').append(details);}render();
 }
 by('run').addEventListener('change',select);by('scrubber').addEventListener('input',()=>{stop();tick=Number(by('scrubber').value);render();});by('back').addEventListener('click',()=>{stop();tick=Math.max(0,tick-1);render();});by('next').addEventListener('click',()=>{stop();tick=Math.min(12,tick+1);render();});by('pause').addEventListener('click',stop);
 by('play').addEventListener('click',()=>{stop();if(tick===12)tick=0;by('play').disabled=true;by('pause').disabled=false;render();timer=setInterval(()=>{tick++;render();if(tick===12)stop();},500);});select();
}
root.JevControllerView={frameAt,decisionAt,mount};if(typeof document!=='undefined')try{mount(root.ZL_CONTROLLER_DATA,document);}catch(e){document.getElementById('error').hidden=false;document.getElementById('error').textContent=e.message;}
}(globalThis));
