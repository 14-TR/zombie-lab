/* Read-only ZL-014: no network, simulation, prompt generation or action policy. */
(function(root){
'use strict';
function indexData(data){
  if(data?.metadata?.prerecorded!==true||data.results?.length!==24)throw Error('Expected 24 prerecorded states');
  const map=new Map(data.results.map(r=>[r.id,r]));
  if(map.size!==24)throw Error('Duplicate recording IDs');
  return map;
}
function frame(row,action,tick){
  const a=row.actions.find(a=>a.action===action);
  if(!a||![0,1].includes(tick))throw Error('Unknown action or tick');
  return tick===0?row.state:a.successor;
}
function mount(data,doc){
  const by=id=>doc.getElementById(id), rows=indexData(data);
  const el=(tag,text,className)=>{const n=doc.createElement(tag);n.textContent=text;if(className)n.className=className;return n;};
  const yes=b=>b?'yes':'no',p=x=>x===null?'missing / invalid':x.toFixed(4);
  const s=data.summary;
  for(const text of [
    `Model ${data.metadata.model}. ${s.samples} states; ${s.capture.total} legal human actions.`,
    `Zombie moves: ${s.zombies.correct}/${s.zombies.total} correct; both correct in ${s.zombies.jointCorrect}/${s.samples} states.`,
    `Immediate capture: ${s.capture.correct}/${s.capture.total} correct; Brier ${s.capture.brierValid?.toFixed(4)??'unavailable'} on ${s.capture.valid} valid answers.`,
    `Successor avoidability: ${s.avoidability.correct}/${s.avoidability.total} correct; Brier ${s.avoidability.brierValid?.toFixed(4)??'unavailable'} on ${s.avoidability.valid} valid answers.`,
    `Independent action choice: ${s.actions.avoidableOnWinningStates}/${s.actions.oracleWinningStates} preserves possible indefinite avoidance; ${s.actions.oracleLosingStates} starts have no winning move.`,
    `Missing/invalid binary answers: capture ${s.capture.missingInvalid}, avoidability ${s.avoidability.missingInvalid}. Full-denominator missingness-penalized Brier: ${s.capture.brierPenalized.toFixed(4)} / ${s.avoidability.brierPenalized.toFixed(4)}.`,
    `Usage-derived estimate: $${s.usage.estimatedUSD.toFixed(6)} (not an invoice). ${s.usage.inputTokens} input tokens; output free.`
  ])by('summary').append(el('p',text));
  for(const row of rows.values()){const opt=el('option',`${row.id} · state ${row.stateIndex}`);opt.value=row.id;by('sample').append(opt);}
  let row,tick=0,timer=null;
  function stop(){if(timer!==null)clearTimeout(timer);timer=null;by('pause').disabled=true;by('play').disabled=false;}
  function draw(){
    const a=by('action').value,current=frame(row,a,tick),wrap=by('world');wrap.replaceChildren();
    const ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 500 350');svg.setAttribute('role','img');svg.setAttribute('aria-label',`Actual tick ${tick} positions`);
    function shape(tag,attrs){const n=doc.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));svg.append(n);return n;}
    for(let x=0;x<=10;x++)shape('line',{x1:x*50,y1:0,x2:x*50,y2:350,stroke:'#bdcbd2'});
    for(let y=0;y<=7;y++)shape('line',{x1:0,y1:y*50,x2:500,y2:y*50,stroke:'#bdcbd2'});
    const agents=[{p:current.human,label:'H',color:'#12648f'},{p:current.zombies[0],label:'1',color:'#aa2837'},{p:current.zombies[1],label:'2',color:'#70499d'}];
    for(const a of agents){const shared=agents.filter(b=>b.p.x===a.p.x&&b.p.y===a.p.y),i=shared.indexOf(a);let dx=25,dy=25;
      if(shared.length===2)dx=i===0?12.5:37.5;
      if(shared.length===3){dx=i===0?25:i===1?12.5:37.5;dy=i===0?12.5:37.5;}
      const x=a.p.x*50+dx,y=a.p.y*50+dy;
      const text=shape('text',{x,y,fill:a.color,'text-anchor':'middle','dominant-baseline':'central','font-size':22,'font-weight':800,'data-agent':a.label});text.textContent=a.label;
    }
    wrap.append(svg);by('scrubber').value=String(tick);by('back').disabled=tick===0;by('next').disabled=tick===1;
    by('readout').textContent=`Tick ${tick} / 1 · inspected ${a} · ${current.status}${current.reason?' · '+current.reason:''}`;
    by('history').replaceChildren();
    for(const t of [0,1]){const f=frame(row,a,t);by('history').append(el('p',`Tick ${t}: H (${f.human.x},${f.human.y}); Z1 (${f.zombies[0].x},${f.zombies[0].y}); Z2 (${f.zombies[1].x},${f.zombies[1].y}) · ${f.status}`));}
  }
  function distribution(target,answer,truths){
    target.replaceChildren();
    if(!answer){target.append(el('p','Missing / invalid answer','bad'));return;}
    for(const [a,v]of Object.entries(answer.probabilities))target.append(el('p',`${a}: p ${p(v)}${truths.includes(a)?' · oracle correct / optimal':''}${a===answer.choice?' · Jev selected':''}`));
  }
  function select(){
    stop();tick=0;row=rows.get(by('sample').value);by('identity').textContent=`Ordered state ${row.stateIndex} · original filtered index ${row.selectionIndex} · ${row.rank===-1?'indefinite avoidance possible':'capture unavoidable under every human strategy'}`;
    by('choice').textContent=`Jev chose ${row.selectedAction??'no valid action'}. Oracle optimal: ${row.optimalActions.join(', ')}; first-tied canonical: ${row.canonicalAction}.`;
    distribution(by('human-probabilities'),row.humanChoice,row.optimalActions);
    by('action').replaceChildren();
    for(const a of row.actions){const opt=el('option',`${a.action} → (${a.destination.x},${a.destination.y})${a.action===row.selectedAction?' · Jev choice':''}`);opt.value=a.action;by('action').append(opt);}
    by('action').value=row.selectedAction??row.actions[0].action;
    by('zombies').replaceChildren();
    row.zombiePredictions.forEach((z,i)=>{const card=el('article','','card');card.append(el('h3',`Z${i+1} · truth ${z.truth}`));const dist=el('div','');distribution(dist,z.answer,[z.truth]);card.append(dist);by('zombies').append(card);});
    by('predictions').replaceChildren();
    for(const a of row.actions){const card=el('article','','card');card.dataset.action=a.action;card.append(el('h3',`${a.action} → (${a.destination.x},${a.destination.y})`));
      for(const [label,prob,truth]of [['Immediate capture',a.captureProbability,a.capture],['Indefinite avoidance',a.avoidabilityProbability,a.avoidable]]){
        const correct=prob!==null&&(prob>=.5)===truth;card.append(el('p',`${label}: p ${p(prob)} · truth ${yes(truth)} · ${prob===null?'unavailable':correct?'correct':'model mistake'}`,correct?'good':'bad'));
      }
      card.append(el('p',a.rank===-1?'Successor is in the exact winning set.':`Successor maximum remaining capture delay: ${a.rank} ticks.`,'note'));by('predictions').append(card);
    }
    by('recording-links').replaceChildren();
    for(const [label,url]of [['Request',`evidence/jev/frozen/requests/${row.id}.json`],['Raw response',`evidence/jev/recording/${row.id}.response.json`],['Receipt',`evidence/jev/recording/${row.id}.receipt.json`]]){const link=el('a',label+' ');link.href=url;by('recording-links').append(link);}
    draw();
  }
  by('sample').addEventListener('change',select);by('action').addEventListener('change',()=>{stop();tick=0;draw();});
  by('back').addEventListener('click',()=>{stop();tick=0;draw();});by('next').addEventListener('click',()=>{stop();tick=1;draw();});
  by('scrubber').addEventListener('input',()=>{stop();tick=Number(by('scrubber').value);draw();});by('pause').addEventListener('click',stop);
  by('play').addEventListener('click',()=>{stop();tick=0;draw();by('play').disabled=true;by('pause').disabled=false;timer=setTimeout(()=>{tick=1;draw();stop();},700);});
  select();
}
root.JevView=Object.freeze({indexData,frame,mount});
if(typeof document!=='undefined')try{mount(root.ZL_JEV_DATA,document);}catch(e){const n=document.getElementById('error');n.hidden=false;n.textContent='Recording unavailable: '+e.message;}
}(globalThis));
