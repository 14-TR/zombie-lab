"use strict";
// Legacy physics is unmodified; fixed prescribed human input replaces the policy.
const fs=require('node:fs'), vm=require('node:vm'), path=require('node:path'),assert=require('node:assert/strict');
const realm=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../two-zombies.js'),'utf8'),realm);
const pair=realm.ZombiePair, delta={N:[0,-1],E:[1,0],S:[0,1],W:[-1,0],stay:[0,0]};
const point=p=>({x:p[0],y:p[1]});
const rows=JSON.parse(fs.readFileSync(0,'utf8'));
if(!rows.length)throw Error('No legacy comparisons');
for(const row of rows){
 const s={width:row.width,height:row.height,tick:0,tickLimit:10000,human:point(row.before.H),zombies:[point(row.before.Z1),point(row.before.Z2)],status:row.before.caught?'caught':'running',reason:''};
 const [dx,dy]=delta[row.action], human={x:Math.min(s.width-1,Math.max(0,s.human.x+dx)),y:Math.min(s.height-1,Math.max(0,s.human.y+dy))};
 const chosen=pair.step(s,'greedy');
 const next=pair.resolveTick(s,{human,zombies:chosen.zombies});
 const actual={H:[next.human.x,next.human.y],Z1:[next.zombies[0].x,next.zombies[0].y],Z2:[next.zombies[1].x,next.zombies[1].y],caught:next.status==='caught'};
 assert.deepEqual(actual,row.after);
}
console.log(JSON.stringify({valid:true,transitions:rows.length,source:'two-zombies.js',purpose:'unchanged-law production parity on prescribed inputs'}));
