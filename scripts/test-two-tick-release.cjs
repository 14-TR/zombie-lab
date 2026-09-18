"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const ROOT=path.resolve(__dirname,".."),hash=x=>crypto.createHash("sha256").update(x).digest("hex");
test("all protected historical model/source/evidence files remain byte-identical",()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,"evidence/two-tick/preservation.json")));
  for(const [file,digest]of Object.entries(manifest.files))assert.equal(hash(fs.readFileSync(path.join(ROOT,file))),digest,file);
});
test("emitted real results match the frozen first-run deterministic rows and witnesses",t=>{
  const file=process.env.ZL013_DATA;
  if(!file){t.skip("Supply ZL013_DATA for the mandatory release-artifact gate");return;}
  const data=JSON.parse(fs.readFileSync(file)),heldout=JSON.parse(fs.readFileSync(path.join(path.dirname(file),"two-tick-heldout.json")));
  const freeze=JSON.parse(fs.readFileSync(path.join(ROOT,"evidence/two-tick/deterministic-freeze.json")));
  assert.equal(data.results.length,4761);assert.equal(heldout.results.length,37730);
  assert.equal(hash(JSON.stringify(data.results)),freeze.resultsSHA256);
  assert.equal(hash(JSON.stringify(heldout.results)),freeze.heldoutResultsSHA256);
  assert.equal(hash(JSON.stringify(data.witnesses)),freeze.witnessesSHA256);
  assert(data.witnesses.length>0);
  const ctx={window:{}};require("node:vm").runInNewContext(fs.readFileSync(path.join(path.dirname(file),"two-tick-data.js"),"utf8"),ctx,{timeout:5000});
  assert.equal(JSON.stringify(ctx.window.ZL_TWO_TICK_DATA),JSON.stringify(data));
});
test("both publication workflows execute and package the two-tick experiment",()=>{
 for(const file of ["pages.yml","private-preview.yml"]){const text=fs.readFileSync(path.join(ROOT,".github/workflows",file),"utf8");
 for(const target of ["scripts/build-two-tick.cjs","scripts/test-two-tick.cjs","scripts/test-two-tick-release.cjs","scripts/test-two-tick-view.cjs","two-tick.html two-tick-view.js two-tick-policy.js","evidence/two-tick","experiments/ZL-013-protocol.md experiments/ZL-013-two-tick.md"])assert(text.includes(target),file+": "+target);}
});
test("original neural loss candidates never claim a safety mask",t=>{
 if(!process.env.ZL013_DATA){t.skip("Supply real artifact");return;}
 const data=JSON.parse(fs.readFileSync(process.env.ZL013_DATA));let checked=0;
 for(const w of data.witnesses)if(w.runs.neural.loss){checked++;assert(w.runs.neural.loss.candidates.every(c=>c.keep),"unfiltered neural keeps every legal candidate");}
 assert(checked>0,"real neural loss witness required");
});
test("loss witnesses independently re-enumerate every production successor and rank",t=>{
 if(!process.env.ZL013_DATA){t.skip("Supply real artifact");return;}
 const d=JSON.parse(fs.readFileSync(process.env.ZL013_DATA)),ranks=JSON.parse(fs.readFileSync(path.join(ROOT,"evidence/avoidability/data/avoidability-certificate.json"))).ranks;
 const pair=new Function("globalThis",fs.readFileSync(path.join(ROOT,"two-zombies.js"),"utf8")+";return globalThis.ZombiePair")({}),dirs=[[0,-1],[1,0],[0,1],[-1,0],[0,0]],cell=p=>p.y*10+p.x,index=f=>(cell(f.zombie1)*70+cell(f.zombie2))*70+cell(f.human);let checked=0;
 for(const w of d.witnesses)for(const p of ["neural","oneTick","filtered"]){const run=w.runs[p],loss=run.loss;if(!loss)continue;checked++;assert.equal(ranks[loss.before],-1);assert.equal(ranks[loss.after],loss.afterRank);assert(loss.afterRank>=0);assert.equal(index(run.frames[loss.tick-1]),loss.before);assert.equal(index(run.frames[loss.tick]),loss.after);
 const f=run.frames[loss.tick-1],s={width:10,height:7,human:f.human,zombies:[f.zombie1,f.zombie2],tick:0,tickLimit:10000,status:"running"},got=[];
 for(let a=0;a<5;a++){const human={x:s.human.x+dirs[a][0],y:s.human.y+dirs[a][1]};if(human.x<0||human.x>9||human.y<0||human.y>6)continue;const next=pair.resolveTick(s,{human,zombies:pair.step(s,"greedy").zombies}),i=(cell(next.zombies[0])*70+cell(next.zombies[1]))*70+cell(next.human);got.push([a,i,ranks[i]]);}
 assert.deepEqual(loss.candidates.map(c=>[c.action,c.stateIndex,c.rank]),got);
 for(let t=1;t<loss.tick;t++)assert(!(ranks[index(run.frames[t-1])]===-1&&ranks[index(run.frames[t])]>=0));
 }assert(checked>0);
});
