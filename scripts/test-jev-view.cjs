"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ctx=vm.createContext({});
if(fs.existsSync(path.join(root,'jev-view.js')))vm.runInContext(fs.readFileSync(path.join(root,'jev-view.js'),'utf8'),ctx);
test('static viewer selects exact initial and one-step endpoints for every legal action',()=>{
  assert(ctx.JevView,'viewer exists');
  const dataset=require('./jev-pilot.cjs').buildDataset(),data=require('./evaluate-jev.cjs').evaluate(dataset,{});
  assert.equal(ctx.JevView.indexData(data).size,24);
  for(const row of data.results)for(const a of row.actions){
    assert.equal(JSON.stringify(ctx.JevView.frame(row,a.action,0)),JSON.stringify(row.state));
    assert.equal(JSON.stringify(ctx.JevView.frame(row,a.action,1)),JSON.stringify(a.successor));
  }
  assert.throws(()=>ctx.JevView.frame(data.results[0],'invalid',1));
  assert.throws(()=>ctx.JevView.indexData({...data,results:data.results.slice(1)}));
  const html=fs.readFileSync(path.join(root,'jev.html'),'utf8');
  for(const text of ['jev.json','jev.csv','experiments/ZL-014-jev.md','experiments/ZL-014-protocol.md','connect-src \'none\'','prerecorded'])assert(html.includes(text),text);
});
