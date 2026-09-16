"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const ROOT=path.resolve(__dirname,".."),hash=x=>crypto.createHash("sha256").update(x).digest("hex");
test("all protected historical model/source/evidence files remain byte-identical",()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,"evidence/one-tick/preservation.json")));
  for(const [file,digest]of Object.entries(manifest.files))assert.equal(hash(fs.readFileSync(path.join(ROOT,file))),digest,file);
});
test("emitted real results match the frozen first-run deterministic rows and witnesses",t=>{
  const file=process.env.ZL012_DATA;
  if(!file){t.skip("Supply ZL012_DATA for the mandatory release-artifact gate");return;}
  const data=JSON.parse(fs.readFileSync(file)),heldout=JSON.parse(fs.readFileSync(path.join(path.dirname(file),"one-tick-heldout.json")));
  const freeze=JSON.parse(fs.readFileSync(path.join(ROOT,"evidence/one-tick/deterministic-freeze.json")));
  assert.equal(data.results.length,4761);assert.equal(heldout.results.length,37730);
  assert.equal(hash(JSON.stringify(data.results)),freeze.resultsSHA256);
  assert.equal(hash(JSON.stringify(heldout.results)),freeze.heldoutResultsSHA256);
  assert.equal(hash(JSON.stringify(data.witnesses)),freeze.witnessesSHA256);
  assert(data.witnesses.length>0);
  const ctx={window:{}};require("node:vm").runInNewContext(fs.readFileSync(path.join(path.dirname(file),"one-tick-data.js"),"utf8"),ctx,{timeout:5000});
  assert.equal(JSON.stringify(ctx.window.ZL_ONE_TICK_DATA),JSON.stringify(data));
});
