"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('offline release verifies frozen recordings and emits matching downloadable static artifacts',()=>{
  const file=path.join(__dirname,'build-jev.cjs');assert(fs.existsSync(file),'offline builder exists');
  const build=require(file),dir=fs.mkdtempSync(path.join(os.tmpdir(),'zl014-site-'));
  try{
    fs.writeFileSync(path.join(dir,'index.html'),'<body><h1>Earlier replay</h1></body>');
    const data=build.build(dir);
    assert(fs.readFileSync(path.join(dir,'index.html'),'utf8').includes('href="jev.html"'),'generated legacy replay links to pilot');
    assert.equal(data.results.length,24);assert.equal(data.summary.recording.admitted,24);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'jev.json'))),data);
    const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(dir,'jev-data.js'),'utf8'),ctx);
    assert.equal(JSON.stringify(ctx.ZL_JEV_DATA),JSON.stringify(data));
    for(const name of ['jev.html','jev-view.js','jev.csv','experiments/ZL-014-jev.md','experiments/ZL-014-protocol.md','evidence/jev/frozen/manifest.json','evidence/jev/recording/run.json'])assert(fs.existsSync(path.join(dir,name)),name);
    const csv=fs.readFileSync(path.join(dir,'jev.csv'),'utf8');
    assert.equal(csv.trim().split('\n').length,289);
    for(const r of data.results)assert(csv.includes('"human_action","choice","","'+r.selectedAction+'","'+r.optimalActions.join('|')+'"'),'CSV human truth is the full optimal set, matching correctness');
    const recording=path.join(dir,'evidence/jev/recording');
    fs.appendFileSync(path.join(recording,'sample-01.response.json'),' ');
    assert.throws(()=>build.readRecording(recording),/hash/i);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('normal PR and Pages builds only run offline pilot code',()=>{
  for(const name of ['pages.yml','private-preview.yml']){
    const text=fs.readFileSync(path.join(root,'.github/workflows',name),'utf8');
    assert(text.includes('node scripts/build-jev.cjs preview'));
    assert(text.includes('scripts/test-jev-release.cjs'));
    assert(!text.includes('--live-authorized'));
    assert(!text.includes('TYPESAFE_API_KEY'));
  }
});
