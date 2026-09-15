/* ZL-011: immutable learned imitation; selected production replay only. */
(function (root) {
  "use strict";
  function check(ok, detail) { if (!ok) throw new Error("Neural viewer mismatch: " + detail); }
  function freeze(value, seen = new WeakSet()) {
    if (value && typeof value === "object" && !seen.has(value)) {
      seen.add(value); Object.values(value).forEach(v => freeze(v, seen)); Object.freeze(value);
    }
    return value;
  }
  function validateModel(model) {
    check(model && model.schemaVersion === 1 && JSON.stringify(model.architecture) === "[6,32,5]" && model.seed === 17 && [0, 40].includes(model.epoch), "model schema / architecture / seed / epoch");
    const vector = (a, n) => Array.isArray(a) && a.length === n && Array.from(a).every(Number.isFinite);
    check(Array.isArray(model.W1) && model.W1.length === 6 && Array.from(model.W1).every(r => vector(r, 32)) && vector(model.b1, 32) && Array.isArray(model.W2) && model.W2.length === 32 && Array.from(model.W2).every(r => vector(r, 5)) && vector(model.b2, 5), "model finite weight shapes");
    return freeze(model);
  }
  const policies = ["greedy", "depth1", "depth2", "untrained", "neural"];
  const validPoint = p => p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < 10 && p.y >= 0 && p.y < 7;
  const cell = p => p.y * 10 + p.x;
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const contact = f => distance(f.human, f.zombie1) <= 1 || distance(f.human, f.zombie2) <= 1;
  const key = f => (cell(f.zombie1) * 70 + cell(f.zombie2)) * 70 + cell(f.human);
  const legal = p => [[0,-1],[1,0],[0,1],[-1,0],[0,0]].map(([x,y]) => ({x:p.x+x,y:p.y+y})).filter(validPoint);
  function indexData(data) {
    check(data && data.schemaVersion === 1 && data.metadata && typeof data.metadata === "object" && data.summary && typeof data.summary === "object", "data schema / metadata / summary");
    check(Array.isArray(data.results) && data.results.length === 4761 && Array.isArray(data.witnesses), "complete 4761-row slice / witnesses");
    const byId = new Map(), witnesses = new Map(), groups = new Map();
    const stats = { total: 4761, splits: { train: 0, validation: 0, test: 0 }, initialContact: 0, avoidable: 0,
      policies: Object.fromEntries(policies.map(p => [p, { capture: 0, cycle: 0, unresolved: 0, avoidableCaptures: 0, shortfallStarts: 0, shortfallTicks: 0, largestShortfall: 0 }])),
      comparisons: Object.fromEntries(["depth1", "depth2"].map(p => [p, { recovered: 0, newCaptures: 0, newUnresolved: 0, retainedCycles: 0 }])) };
    let previous = -1;
    for (const row of data.results) {
      check(row && [row.human,row.zombie1,row.zombie2].every(validPoint), "row positions");
      const h=cell(row.human), z=cell(row.zombie2), order=z*70+h, initial=contact(row);
      check(cell(row.zombie1) === 42 && h !== 42 && h !== z && order > previous && row.id === "z2-"+z+"-h"+h, "frozen ID / ordered slice"); previous=order;
      check(Object.hasOwn(stats.splits,row.split) && (!groups.has(z) || groups.get(z) === row.split), "split / group consistency"); groups.set(z,row.split); stats.splits[row.split]++;
      check(typeof row.avoidable === "boolean" && (row.avoidable ? row.maxCaptureTicks === null && !initial : Number.isInteger(row.maxCaptureTicks) && row.maxCaptureTicks >= 0 && row.maxCaptureTicks < 343000 && (row.maxCaptureTicks === 0) === initial), "avoidability / finite rank");
      stats.initialContact += Number(initial); stats.avoidable += Number(row.avoidable);
      for (const p of policies) {
        const r=row.policies && row.policies[p], c=stats.policies[p];
        check(r && ["capture","cycle","unresolved"].includes(r.outcome) && Number.isInteger(r.stopTick) && r.stopTick >= 0 && r.stopTick <= 10000, "policy outcome / stop tick");
        check(r.outcome === "cycle" ? Number.isInteger(r.cycleStart) && r.cycleStart >= 0 && Number.isInteger(r.period) && r.period > 0 && r.cycleStart+r.period === r.stopTick : r.cycleStart === null && r.period === null, "cycle start / period");
        check(initial ? r.outcome === "capture" && r.stopTick === 0 : r.stopTick > 0, "initial-contact precedence");
        check(r.outcome !== "unresolved" || r.stopTick === 10000, "unresolved cutoff");
        check(row.avoidable || (r.outcome !== "cycle" && (r.outcome === "capture" ? r.stopTick <= row.maxCaptureTicks : r.stopTick < row.maxCaptureTicks)), "finite maximum delay");
        c[r.outcome]++; c.avoidableCaptures += Number(row.avoidable && r.outcome === "capture");
        if (!row.avoidable && r.outcome === "capture") { const d=row.maxCaptureTicks-r.stopTick; c.shortfallStarts+=Number(d>0); c.shortfallTicks+=d; c.largestShortfall=Math.max(c.largestShortfall,d); }
      }
      for (const p of ["depth1","depth2"]) {
        const a=row.policies[p], b=row.policies.neural, c=stats.comparisons[p];
        c.recovered+=Number(row.avoidable && a.outcome === "capture" && b.outcome === "cycle");
        if (a.outcome === "cycle") { c.newCaptures+=Number(b.outcome === "capture"); c.newUnresolved+=Number(b.outcome === "unresolved"); c.retainedCycles+=Number(b.outcome === "cycle"); }
      }
      byId.set(row.id,row);
    }
    let last=-1;
    for (const w of data.witnesses) {
      const row=w && byId.get(w.id);
      check(row && !witnesses.has(w.id) && key(row)>last, "witness ID / order"); last=key(row);
      check(typeof w.reason === "string" || Array.isArray(w.reason) && w.reason.every(r=>typeof r === "string"), "witness reason");
      const r=row.policies.neural;
      check(Array.isArray(w.frames) && w.frames.length === r.stopTick+1 && w.outcome===r.outcome && w.stopTick===r.stopTick && w.cycleStart===r.cycleStart && w.cyclePeriod===r.period, "witness frames / scalar outcome");
      witnesses.set(w.id,w);
    }
    return {data,byId,witnesses,stats};
  }
  function replay(row, model, policy, production, witness) {
    validateModel(model);
    check(policy && typeof policy.chooseHuman === "function" && typeof policy.logits === "function" && production && typeof production.resolveTick === "function", "NeuralPolicy / production API unavailable");
    check(row && row.policies && row.policies.neural && [row.human,row.zombie1,row.zombie2].every(validPoint), "selected row");
    let state={width:10,height:7,tick:0,tickLimit:10000,human:{...row.human},zombies:[{...row.zombie1},{...row.zombie2}],status:"running",reason:""};
    if (contact(row)) state=production.resolveTick(state,{human:state.human,zombies:state.zombies});
    const frames=[], seen=new Map(); let outcome, cycleStart=null, period=null;
    for (let tick=0;tick<=10000;tick++) {
      const f={tick:state.tick,human:{...state.human},zombie1:{...state.zombies[0]},zombie2:{...state.zombies[1]}};
      check(f.tick===tick && [f.human,f.zombie1,f.zombie2].every(validPoint) && ["running","caught","limit"].includes(state.status) && (state.status!=="limit" || tick===10000), "production tick / coordinates / status");
      frames.push(f);
      if (state.status === "caught" || contact(f)) { outcome="capture"; break; }
      if (seen.has(key(f))) { outcome="cycle"; cycleStart=seen.get(key(f)); period=tick-cycleStart; break; }
      seen.set(key(f),tick);
      if (tick===10000) { outcome="unresolved"; break; }
      const human=policy.chooseHuman(state,model);
      check(validPoint(human) && legal(state.human).some(p=>same(p,human)), "model action is illegal");
      const zombies=state.zombies.map(z=>legal(z).reduce((a,b)=>distance(a,state.human)<=distance(b,state.human)?a:b));
      state=production.resolveTick(state,{human,zombies});
    }
    const run={frames,outcome,stopTick:frames.length-1,cycleStart,period};
    for (const field of ["outcome","stopTick","cycleStart","period"]) check(run[field]===row.policies.neural[field], row.id+" / "+field);
    if (witness) {
      check(witness.id===row.id && Array.isArray(witness.frames) && witness.frames.length===frames.length, "stored witness length / ID");
      for (const field of ["outcome","stopTick","cycleStart"]) check(witness[field]===run[field], "stored witness "+field);
      check(witness.cyclePeriod===period, "stored witness cyclePeriod");
      frames.forEach((f,i)=>{ const w=witness.frames[i]; check(w && w.tick===f.tick && ["human","zombie1","zombie2"].every(k=>validPoint(w[k]) && same(f[k],w[k])), "stored witness model action / production frame "+i); });
    }
    return run;
  }
  function conclusion(stats) {
    return ["depth1","depth2"].map(p=>{
      const c=stats.comparisons[p], base=stats.policies[p];
      const passes=stats.policies.neural.avoidableCaptures<24 && base.avoidableCaptures===24 && base.cycle===4193 && c.newCaptures===0 && c.newUnresolved===0;
      return p+": preregistered benchmark criterion "+(passes?"met":"not met")+". Recovered avoidable captures: "+c.recovered+"; new captures on formerly cyclic starts: "+c.newCaptures+"; new unresolved: "+c.newUnresolved+"; retained cycles: "+c.retainedCycles+" / "+base.cycle+".";
    }).join("\n");
  }
  const coords = p => "("+p.x+", "+p.y+")";
  function describeRun(r) {
    return r.outcome === "capture" ? "capture at tick "+r.stopTick : r.outcome === "cycle" ? "cycle from "+r.cycleStart+", first repeat "+r.stopTick+", period "+r.period : "unresolved at cutoff "+r.stopTick+" (not proof of survival)";
  }
  function mount(document, data, weights, policy, production) {
    const get=id=>document.getElementById(id), slider=get("scrubber"), select=get("start");
    let indexed, run=null, timer=null, tick=0, failed=false;
    const element=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;};
    function stop(){if(timer!==null)root.clearInterval(timer);timer=null;}
    function fail(error){
      stop();failed=true;run=null;get("error").hidden=false;get("error").textContent=error.message+". Results and replay cleared; resolve the mismatch and reload.";
      for(const id of ["world","history","totals","selected-policies","start","heldout","metrics"])get(id).replaceChildren();
      for(const id of ["match","benchmark","splits","conclusion","selection","classification","metadata"])get(id).textContent="";
      get("match").hidden=true;get("timeline").textContent="Replay unavailable";get("readout").textContent="Replay unavailable";get("world").setAttribute("aria-label","Replay unavailable");slider.value="0";slider.max="0";
      document.querySelectorAll("button,select,input").forEach(n=>{n.disabled=true;});
    }
    function svgNode(tag,attrs){const n=document.createElementNS("http://www.w3.org/2000/svg",tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));return n;}
    function draw(f){
      const svg=get("world");svg.replaceChildren();svg.setAttribute("viewBox","0 0 10 7");
      for(let y=0;y<7;y++)for(let x=0;x<10;x++)svg.appendChild(svgNode("rect",{x,y,width:1,height:1,fill:"none",stroke:"#c4cecf","stroke-width":.025}));
      const agents=[{id:"human",label:"H",color:"#006ba1"},{id:"zombie1",label:"1",color:"#a42e32"},{id:"zombie2",label:"2",color:"#815000"}];
      for(const a of agents){
        const p=f[a.id],group=agents.filter(b=>same(f[b.id],p)),i=group.indexOf(a);
        const offsets=group.length===3?[[0,-.24],[-.24,.24],[.24,.24]]:group.length===2?[[-.24,0],[.24,0]]:[[0,0]];
        const x=p.x+.5+offsets[i][0],y=p.y+.5+offsets[i][1],r=group.length>1?.23:.35;
        const shape=a.id==="human"?{cx:x,cy:y,r}:{x:x-r,y:y-r,width:2*r,height:2*r,rx:a.id==="zombie2"?.09:0};
        svg.appendChild(svgNode(a.id==="human"?"circle":"rect",{...shape,fill:a.color,"data-agent":a.id}));
        const label=svgNode("text",{x,y:y+.16,"text-anchor":"middle","font-size":.48,"font-weight":700,fill:"white"});label.textContent=a.label;svg.appendChild(label);
      }
      svg.setAttribute("aria-label","Tick "+tick+": H "+coords(f.human)+"; Z1 "+coords(f.zombie1)+"; Z2 "+coords(f.zombie2));
    }
    function render(){
      if(!run||failed)return;
      if(!Number.isInteger(tick)){fail(new Error("Invalid scrub tick"));return;}
      tick=Math.max(0,Math.min(run.stopTick,tick));const f=run.frames[tick];draw(f);slider.value=String(tick);
      get("timeline").textContent="Tick "+tick+" / "+run.stopTick;
      get("readout").textContent="H "+coords(f.human)+" · Z1 "+coords(f.zombie1)+" · Z2 "+coords(f.zombie2)+". "+(tick===run.stopTick?(run.outcome==="capture"?"Capture endpoint.":run.outcome==="cycle"?"First-repeat endpoint, not capture or physical stop. "+describeRun(run):"Unresolved cutoff; not proof of survival."):"Running.");
      for(const row of get("history").children)row.setAttribute("aria-current",String(Number(row.dataset.tick)===tick));
      get("play").disabled=timer!==null||run.stopTick===0;get("pause").disabled=timer===null;get("next").disabled=tick===run.stopTick;get("reset").disabled=false;slider.disabled=run.stopTick===0;
    }
    function choose(){
      if(failed)return;stop();run=null;tick=0;
      try{
        const row=indexed.byId.get(select.value),w=indexed.witnesses.get(select.value);
        run=replay(row,weights,policy,production,w);slider.max=String(run.stopTick);
        get("selection").textContent=row.id+" · "+row.split+" split · H "+coords(row.human)+" · Z1 "+coords(row.zombie1)+" · Z2 "+coords(row.zombie2)+(w?" · "+(Array.isArray(w.reason)?w.reason.join("; "):w.reason):"")+". Selected example, not representative.";
        get("classification").textContent=row.avoidable?(run.outcome==="capture"?"Avoidable policy failure: another legal strategy can avoid capture indefinitely.":run.outcome==="cycle"?"Proven repeating avoidance for this start, not a general success claim.":"Avoidable start; this model run is unresolved, not proven safe."):row.maxCaptureTicks===0?"Initial-contact capture at tick 0, before any policy can act.":"Unavoidable start; maximum delay "+row.maxCaptureTicks+" ticks. "+(run.outcome==="capture"?"Model delay shortfall "+(row.maxCaptureTicks-run.stopTick)+" ticks.":"Delay shortfall not measured for an unresolved run.");
        get("selected-policies").replaceChildren();for(const p of policies){const tr=element("tr");tr.append(element("td",p),element("td",describeRun(row.policies[p])));get("selected-policies").appendChild(tr);}
        get("history").replaceChildren();for(const f of run.frames){const tr=element("tr");tr.dataset.tick=f.tick;for(const v of [f.tick,coords(f.human),coords(f.zombie1),coords(f.zombie2),f.tick===run.stopTick?describeRun(run):f.tick===0?"initial":"running"])tr.appendChild(element("td",v));get("history").appendChild(tr);}
        get("match").hidden=false;get("match").textContent="Recomputed model actions and production dynamics match the stored outcome, stop tick, cycle start and period."+(w?" Every supplied witness frame also matches.":" No stored frames supplied for this row; endpoint coordinates are recomputed, not independently authenticated.");render();
      }catch(error){fail(error);}
    }
    try{
      validateModel(weights);check(weights.epoch===40,"final replay requires epoch-40 model");indexed=indexData(data);get("error").hidden=true;
      const s=indexed.stats;get("benchmark").textContent=s.total+" starts · "+s.initialContact+" initial contacts · "+s.avoidable+" exactly avoidable starts · "+(s.total-s.initialContact-s.avoidable)+" noninitial unavoidable starts.";
      get("splits").textContent="Benchmark split membership (not whole-dataset counts): train "+s.splits.train+", validation "+s.splits.validation+", test "+s.splits.test+".";get("conclusion").textContent=conclusion(s);
      get("totals").replaceChildren();for(const p of policies){const c=s.policies[p],tr=element("tr");for(const v of [p,c.capture,c.cycle,c.unresolved,c.avoidableCaptures,c.shortfallStarts,c.shortfallTicks,c.largestShortfall])tr.appendChild(element("td",v));get("totals").appendChild(tr);}
      get("heldout").replaceChildren();get("metrics").replaceChildren();let heldoutFound=false;
      for(const [name,value] of Object.entries(data.summary)){
        const isHeldout=/held.?out|test/i.test(name),container=get(isHeldout?"heldout":"metrics");heldoutFound=heldoutFound||isHeldout;
        const detail=element("details"),heading=element("summary",(isHeldout?"Held-out evaluation · ":"Exported metric group · ")+name);detail.open=isHeldout;detail.append(heading,element("pre",JSON.stringify(value,null,2)));container.appendChild(detail);
      }
      if(!heldoutFound)get("heldout").appendChild(element("p","No separately named held-out aggregate supplied. Do not infer held-out performance from the full benchmark. Inspect the named export groups and report for evaluation scope."));
      const provenance=Object.fromEntries(Object.entries(weights).filter(([k])=>!["W1","W2","b1","b2"].includes(k)));
      get("metadata").textContent=JSON.stringify({evaluation:data.metadata,model:provenance},null,2);
      select.replaceChildren();for(const row of indexed.byId.values()){const w=indexed.witnesses.get(row.id),o=element("option",row.id+" · "+row.split+" · "+describeRun(row.policies.neural)+(w?" · witness":""));o.value=row.id;select.appendChild(o);}
      select.disabled=false;select.value=indexed.witnesses.keys().next().value||indexed.byId.keys().next().value;select.addEventListener("change",choose);
      get("play").addEventListener("click",()=>{if(!run||failed||timer!==null||run.stopTick===0)return;if(tick===run.stopTick)tick=0;timer=root.setInterval(()=>{tick++;if(tick>=run.stopTick)stop();render();},350);render();});
      get("pause").addEventListener("click",()=>{stop();render();});get("next").addEventListener("click",()=>{stop();tick++;render();});get("reset").addEventListener("click",()=>{stop();tick=0;render();});slider.addEventListener("input",()=>{stop();tick=Number(slider.value);render();});choose();
    }catch(error){fail(error);}
    return {destroy:stop};
  }
  root.ZL_NeuralView = Object.freeze({ validateModel, indexData, replay, conclusion, describeRun, mount });
  if(root.document && root.document.getElementById("neural-app"))mount(root.document,root.ZL_NEURAL_DATA,root.ZL_NEURAL_MODEL,root.NeuralPolicy,root.ZombiePair);
}(globalThis));
