"use strict";
// Dependency-free fixtures first. Optional cached Playwright and explicit real artifacts.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const context = vm.createContext({ console, setInterval, clearInterval });
vm.runInContext(fs.readFileSync(path.join(root, "two-zombies.js"), "utf8"), context);
const model = { schemaVersion: 1, architecture: [6, 32, 5], seed: 17, epoch: 40,
  W1: Array.from({ length: 6 }, () => Array(32).fill(0)), b1: Array(32).fill(0),
  W2: Array.from({ length: 32 }, () => Array(5).fill(0)), b2: Array(5).fill(0),
  provenance: { fixture: true, description: "Synthetic zero weights; not trained evidence" } };
const productionPath = path.join(root, "neural-view.js");
if (fs.existsSync(productionPath)) vm.runInContext(fs.readFileSync(productionPath, "utf8"), context);
assert.equal(typeof context.ZL_NeuralView, "object", "classic-script neural viewer API exists");
const api = context.ZL_NeuralView;
assert.equal(api.validateModel(model), model);
assert(Object.isFrozen(model) && Object.isFrozen(model.W1[0]), "browser model is deeply immutable");
assert.throws(() => api.validateModel({ ...model, epoch: 39 }), /model/i);
assert.throws(() => api.validateModel({ ...model, b2: [NaN, 0, 0, 0, 0] }), /model/i);
assert.throws(() => api.validateModel({ ...model, b1: Array(32) }), /model/i,"sparse weights are not numbers");
const shallow=Object.freeze(JSON.parse(JSON.stringify(model)));api.validateModel(shallow);
assert(Object.isFrozen(shallow.W1[0]),"shallow-frozen input still freezes nested weights");
console.log("PASS immutable frozen model schema, epoch and finite weights");
const pos = n => ({ x: n % 10, y: Math.floor(n / 10) });
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const legal = p => [[0,-1],[1,0],[0,1],[-1,0],[0,0]].map(([x,y]) => ({x:p.x+x,y:p.y+y})).filter(p => p.x >= 0 && p.x < 10 && p.y >= 0 && p.y < 7);
const fixturePolicySource = `globalThis.NeuralPolicy = {logits: () => [0,0,0,0,0], chooseHuman: state => (${legal.toString()})(state.human)[0]};`;
vm.runInContext(fixturePolicySource, context);
function reference(row, policy = context.NeuralPolicy, weights = model) {
  let state = { width:10,height:7,tick:0,tickLimit:10000,human:row.human,zombies:[row.zombie1,row.zombie2],status:"running",reason:"" };
  const seen = new Map(), frames = [];
  for (;;) {
    frames.push({ tick:state.tick,human:state.human,zombie1:state.zombies[0],zombie2:state.zombies[1] });
    const end = { frames,stopTick:state.tick,cycleStart:null,period:null };
    if (state.status === "caught" || state.zombies.some(z => distance(z,state.human)<=1)) return {...end,outcome:"capture"};
    const key = JSON.stringify([state.human,...state.zombies]);
    if (seen.has(key)) return {...end,outcome:"cycle",cycleStart:seen.get(key),period:state.tick-seen.get(key)};
    seen.set(key,state.tick);
    if (state.tick === 10000) return {...end,outcome:"unresolved"};
    const zombies = state.zombies.map(z => legal(z).reduce((a,b) => distance(a,state.human)<=distance(b,state.human) ? a:b));
    state = context.ZombiePair.resolveTick(state,{human:policy.chooseHuman(state,weights),zombies});
  }
}
const fixture = {schemaVersion:1,metadata:{commit:"SYNTHETIC-FIXTURE",sourceHashes:{fixture:"not-release-evidence"},splits:{description:"synthetic groups, not training"}},summary:{heldout:{scope:"fixture only",testStates:0},oneStep:{train:{accuracy:0},validation:{accuracy:0},test:{accuracy:0}}},results:[],witnesses:[]};
let firstRun;
for (let z=0;z<70;z++) for (let h=0;h<70;h++) {
  if(h===42 || h===z) continue;
  const row={id:`z2-${z}-h${h}`,human:pos(h),zombie1:pos(42),zombie2:pos(z),split:["train","validation","test"][z%3],avoidable:true,maxCaptureTicks:null};
  const run=reference(row); row.avoidable=run.stopTick!==0; if(!row.avoidable)row.maxCaptureTicks=0;
  const {frames,...scalar}=run; row.policies=Object.fromEntries(["greedy","depth1","depth2","untrained","neural"].map(p=>[p,{...scalar}]));
  fixture.results.push(row);
  if(!firstRun && run.stopTick>0){firstRun=run;fixture.witnesses.push({id:row.id,reason:"Synthetic first actionable example",...scalar,cyclePeriod:run.period,frames});}
}
assert.equal(typeof api.indexData,"function","frozen 4761-row index exists");
const indexed=api.indexData(fixture);
assert.equal(indexed.byId.size,4761);
assert.equal(Object.values(indexed.stats.splits).reduce((a,b)=>a+b,0),4761);
const chosen=indexed.byId.get(fixture.witnesses[0].id);
assert.deepEqual(JSON.parse(JSON.stringify(api.replay(chosen,model,context.NeuralPolicy,context.ZombiePair,fixture.witnesses[0]))),JSON.parse(JSON.stringify(firstRun)));
const clone=x=>JSON.parse(JSON.stringify(x));
let bad=clone(chosen); bad.policies.neural.stopTick++;
assert.throws(()=>api.replay(bad,model,context.NeuralPolicy,context.ZombiePair),/mismatch/i);
bad=clone(fixture.witnesses[0]);bad.frames[1].human={...bad.frames[0].human};
assert.throws(()=>api.replay(chosen,model,context.NeuralPolicy,context.ZombiePair,bad),/mismatch/i,"legal-but-not-model action rejected");
bad=clone(fixture);bad.results.pop();assert.throws(()=>api.indexData(bad),/4761/);
bad=clone(fixture);bad.results[0].split="held-out-ish";assert.throws(()=>api.indexData(bad),/split/);
bad=clone(fixture);bad.results[0].policies.neural.outcome="survived";assert.throws(()=>api.indexData(bad),/outcome/);
assert.match(api.conclusion(indexed.stats),/not met/i,"synthetic negative outcome cannot become success");
const apparentImprovement=clone(indexed.stats);apparentImprovement.policies.neural.avoidableCaptures=23;
for(const p of ["depth1","depth2"]){apparentImprovement.policies[p].avoidableCaptures=24;apparentImprovement.policies[p].cycle=4193;apparentImprovement.comparisons[p].newCaptures=1;}
assert(!/criterion met/.test(api.conclusion(apparentImprovement)),"net improvement with regressions never passes");
for(const p of ["depth1","depth2"]){apparentImprovement.comparisons[p].newCaptures=0;apparentImprovement.comparisons[p].newUnresolved=1;}
assert(!/criterion met/.test(api.conclusion(apparentImprovement)),"unresolved regressions never pass");
// Synthetic transition stream tests runner precedence only, not physical dynamics.
const stream=[];for(let a=0;a<70 && stream.length<10001;a++)for(let b=0;b<70 && stream.length<10001;b++)for(let h=0;h<70 && stream.length<10001;h++)if(distance(pos(h),pos(a))>1&&distance(pos(h),pos(b))>1)stream.push({human:pos(h),zombie1:pos(a),zombie2:pos(b)});
const syntheticRow={id:"synthetic-cutoff",...stream[0],policies:{neural:{outcome:"unresolved",stopTick:10000,cycleStart:null,period:null}}};
const fakeProduction={resolveTick:s=>({...s,tick:s.tick+1,human:stream[s.tick+1].human,zombies:[stream[s.tick+1].zombie1,stream[s.tick+1].zombie2],status:s.tick+1===10000?"limit":"running"})};
assert.equal(api.replay(syntheticRow,model,context.NeuralPolicy,fakeProduction).frames.length,10001);
stream[10000]=stream[0];syntheticRow.policies.neural={outcome:"cycle",stopTick:10000,cycleStart:0,period:10000};
assert.equal(api.replay(syntheticRow,model,context.NeuralPolicy,fakeProduction).outcome,"cycle","first recurrence outranks cutoff");
const terminal=fixture.results.find(r=>r.maxCaptureTicks===0);
assert.equal(api.replay(terminal,model,{logits(){throw Error("must not act");},chooseHuman(){throw Error("must not act");}},context.ZombiePair).stopTick,0);
console.log("PASS initial-before-decision, synthetic cutoff/recurrence precedence, regression-safe criterion");
console.log("PASS complete fixture indexing, split totals, selected production/model replay, mismatch rejection, negative criterion");
if(fs.existsSync(path.join(root,"neural-policy.js"))){
  const actualPolicy=require(path.join(root,"neural-policy.js"));let checked=0;
  for(const row of fixture.results){api.replay(row,model,actualPolicy,context.ZombiePair,indexed.witnesses.get(row.id));checked++;}
  console.log(`PASS production NeuralPolicy + zero-weight fixture model: ${checked} complete production replays`);
}
assert(fs.existsSync(path.join(root,"neural.html")),"phone replay document exists");
assert.equal(typeof api.mount,"function","classic-script DOM mount exists");
const html=fs.readFileSync(path.join(root,"neural.html"),"utf8");
assert(!/type=["']module/.test(html));
assert.match(html,/learned imitation/i);assert.match(html,/not wholly held out/i);
assert.match(html,/models\/feed-forward\.json/);assert.match(html,/models\/feed-forward-initial\.json/);
// Explicit real artifacts are verified in Node even when no browser is installed.
let real = null;
if (process.env.ZL011_DATA) {
  const payload = JSON.parse(fs.readFileSync(process.env.ZL011_DATA, "utf8"));
  const modelFile = process.env.ZL011_MODEL || path.join(root, "models/feed-forward.json");
  const initialFile = process.env.ZL011_INITIAL_MODEL || path.join(root, "models/feed-forward-initial.json");
  const weights = JSON.parse(fs.readFileSync(modelFile, "utf8"));
  const initial = JSON.parse(fs.readFileSync(initialFile, "utf8"));
  const emittedData = fs.readFileSync(path.join(path.dirname(process.env.ZL011_DATA), "neural-data.js"), "utf8");
  const emittedModel = fs.readFileSync(path.join(path.dirname(modelFile), "feed-forward.js"), "utf8");
  const policySource = fs.readFileSync(path.join(root, "neural-policy.js"), "utf8");
  assert.equal(payload.metadata.fixture, false);
  assert.equal(weights.epoch, 40); assert.equal(initial.epoch, 0);
  const packaged = vm.createContext({ window: {} });
  vm.runInContext(emittedData, packaged, { timeout: 5000 });
  vm.runInContext(emittedModel, packaged, { timeout: 5000 });
  assert.deepEqual(clone(packaged.window.ZL_NEURAL_DATA), payload);
  assert.deepEqual(clone(packaged.window.ZL_NEURAL_MODEL), weights);
  vm.runInContext(policySource, context);
  const actual = api.indexData(payload); let runs = 0;
  assert(actual.witnesses.size > 0, "real output must not be an empty intermediate");
  for (const row of actual.byId.values()) {
    api.replay(row, weights, context.NeuralPolicy, context.ZombiePair, actual.witnesses.get(row.id));
    api.replay({ ...row, policies: { ...row.policies, neural: row.policies.untrained } }, initial, context.NeuralPolicy, context.ZombiePair);
    runs += 2;
  }
  real = { payload, weights, emittedData, emittedModel, policySource, actual, runs };
  console.log(`PASS real artifact without browser dependency: ${runs} final/untrained production replays, ${actual.witnesses.size} complete witnesses, emitted wrappers match JSON`);
}
async function browserTest() {
  if(!process.env.ZL011_PLAYWRIGHT){console.log("SKIP browser: set ZL011_PLAYWRIGHT to cached module path (no install)");return;}
  const {chromium}=require(process.env.ZL011_PLAYWRIGHT),http=require("node:http");
  const safe=x=>JSON.stringify(x).replace(/[<>&\u2028\u2029]/g,c=>"\\u"+c.charCodeAt(0).toString(16).padStart(4,"0"));
  let payload=fixture,weights=model,policySource=fixturePolicySource,emittedData=null,emittedModel=null;
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,"http://localhost").pathname;
    const virtual={"/neural-data.js":emittedData??("window.ZL_NEURAL_DATA="+safe(payload)+";"),"/models/feed-forward.js":emittedModel??("window.ZL_NEURAL_MODEL="+safe(weights)+";"),"/models/feed-forward.json":JSON.stringify(weights),"/neural-policy.js":policySource};
    if(Object.hasOwn(virtual,pathname)){res.setHeader("Content-Type",pathname.endsWith(".json")?"application/json":"text/javascript");res.end(virtual[pathname]);return;}
    const file=path.resolve(root,"."+pathname);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
    res.setHeader("Content-Type",file.endsWith(".html")?"text/html":file.endsWith(".js")?"text/javascript":"text/plain");res.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  let browser;
  try {
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
    const url=`http://127.0.0.1:${server.address().port}/neural.html`;
    for(const width of [320,390,1200]){
      await page.setViewportSize({width,height:900});await page.goto(url);
      assert.equal(await page.locator("#error").isVisible(),false);
      assert.match(await page.locator("#match").innerText(),/model actions/i);
      assert.equal(await page.locator("#start option").count(),4761);
      assert.equal(await page.locator("#history tr").count(),firstRun.frames.length);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`no overflow at ${width}`);
      const minGlyph=await page.locator("#world text").evaluateAll(ns=>Math.min(...ns.map(n=>parseFloat(getComputedStyle(n).fontSize)*n.getScreenCTM().a)));
      assert(minGlyph>=12,`phone glyph size ${minGlyph}`);
      await page.locator("#scrubber").evaluate(n=>{n.value=n.max;n.dispatchEvent(new Event("input"));});
      assert.match(await page.locator("#readout").innerText(),/capture endpoint/i);
      await page.locator("#reset").click();assert.match(await page.locator("#timeline").innerText(),/Tick 0 /);
      await page.locator("#play").click();await page.waitForFunction(()=>Number(document.getElementById("scrubber").value)>0);await page.locator("#pause").click();
      assert.equal(await page.evaluate(()=>Object.isFrozen(ZL_NEURAL_MODEL.W1[0])),true);
    }
    await page.selectOption("#start","z2-42-h0");
    const boxes=await page.locator("#world [data-agent]").evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
    const a=boxes[1],b=boxes[2];assert(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y,"co-located zombies remain distinct");
    await page.selectOption("#start",terminal.id);assert.equal(await page.locator("#history tr").count(),1);assert.equal(await page.locator("#play").isDisabled(),true);
    await page.evaluate(()=>{ZL_NEURAL_DATA.results[2].policies.neural.stopTick++;document.getElementById("start").value=ZL_NEURAL_DATA.results[2].id;document.getElementById("start").dispatchEvent(new Event("change"));});
    assert.equal(await page.locator("#error").isVisible(),true);
    assert.equal(await page.locator("#world > *").count(),0);assert.equal(await page.locator("#history tr").count(),0);
    assert.equal(await page.locator("#conclusion").innerText(),"");assert.equal(await page.locator("#play").isDisabled(),true);
    assert.deepEqual(errors,[]);console.log("PASS cached Chromium: 320/390/1200px, readable glyphs, controls, full history, fail-closed stale clearing");
    if(real){
      ({payload,weights,emittedData,emittedModel,policySource}=real);
      const {actual,runs}=real;
      await page.goto(url);assert.equal(await page.locator("#error").isVisible(),false);
      assert.deepEqual(await page.evaluate(()=>ZL_NEURAL_DATA),payload);
      assert.deepEqual(await page.evaluate(()=>ZL_NEURAL_MODEL),weights);
      assert(actual.witnesses.size>0,"real output has witnesses, not empty intermediate");
      for(const id of actual.witnesses.keys()){await page.selectOption("#start",id);assert.equal(await page.locator("#error").isVisible(),false);}
      console.log(`PASS real artifact: ${runs} final/untrained production replays, ${actual.witnesses.size} browser witnesses`);
    }else console.log("SKIP real artifacts: ZL011_DATA not supplied; fixtures are not learning evidence");
  }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
browserTest().catch(e=>{console.error(e);process.exitCode=1;});
