"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('shared playback holds captured endpoint and never invents later Jev calls',()=>{
 const f=path.join(__dirname,'../jev-controller-view.js'),ctx=vm.createContext({});assert(fs.existsSync(f),'controller viewer exists');vm.runInContext(fs.readFileSync(f,'utf8'),ctx);
 const data=require('./build-jev-controller.cjs').collect(),r=data.runs[1];
 assert.equal(ctx.JevControllerView.frameAt(r.jev,12).tick,7);assert.equal(ctx.JevControllerView.frameAt(r.controls.depth2,12).tick,12);
 assert.equal(ctx.JevControllerView.decisionAt(r,8),null);assert.equal(ctx.JevControllerView.decisionAt(r,7).action,'W');
 const html=fs.readFileSync(path.join(__dirname,'../jev-controller.html'),'utf8');assert(html.includes("connect-src 'none'"));assert(html.includes('prerecorded'));
});
