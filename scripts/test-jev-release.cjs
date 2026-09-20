"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('offline release verifies frozen recordings and emits matching downloadable static artifacts',()=>{
  const file=path.join(__dirname,'build-jev.cjs');assert(fs.existsSync(file),'offline builder exists');
  const build=require(file),dir=fs.mkdtempSync(path.join(os.tmpdir(),'zl014-site-'));
  try{
    const data=build.build(dir);
    assert.equal(data.results.length,24);assert.equal(data.summary.recording.admitted,24);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'jev.json'))),data);
    const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(dir,'jev-data.js'),'utf8'),ctx);
    assert.equal(JSON.stringify(ctx.ZL_JEV_DATA),JSON.stringify(data));
    for(const name of ['jev.html','jev-view.js','jev.csv','experiments/ZL-014-jev.md','experiments/ZL-014-protocol.md','evidence/jev/frozen/manifest.json','evidence/jev/recording/run.json'])assert(fs.existsSync(path.join(dir,name)),name);
    assert.equal(fs.readFileSync(path.join(dir,'jev.csv'),'utf8').trim().split('\n').length,289);
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
