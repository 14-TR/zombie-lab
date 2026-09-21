"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'jev-policy.cjs'),api=fs.existsSync(file)?require(file):{};
const original=require('./jev-controller.cjs');
const runs=['run-01','run-02'].map(id=>require('../evidence/jev-controller/recording/'+id+'.trajectory.json'));
test('policy changes only human instructions; full legal choices and unlabeled state remain original',()=>{
 assert.equal(typeof api.request,'function');
 for(const run of runs)for(const event of run.decisions){
  const before=original.request(event.before),after=api.request(event.before),text=after.questions.human_action.instructions;
  assert(text.endsWith(before.questions.human_action.instructions));
  for(const snippet of ['OLD human position','ALL its legal candidate destinations','FIRST legal move in N,E,S,W,stay','EVERY legal human candidate','Manhattan distance <=1','exchanges old positions','If ANY candidate avoids immediate capture','If ALL candidates capture','no other question\'s answer is available'])assert(text.includes(snippet),snippet);
  after.questions.human_action.instructions=before.questions.human_action.instructions;
  assert.deepEqual(after,before,'no candidate masking, computed labels, state or other question changes');
 }
});
test('unsafe raw Choice is executed unchanged; malformed ANY answer stops',()=>{
 assert.equal(typeof api.decision,'function');
 const event=runs[1].decisions[6],response=require('../evidence/jev-controller/recording/'+event.id+'.response.json');
 const d=api.decision(event.before,response);
 assert.equal(d.action,'W');assert.equal(d.successor.status,'caught');
 assert.deepEqual(d.successor.human,{x:6,y:0});assert.deepEqual(d.successor.zombies,[{x:5,y:0},{x:8,y:0}]);
 assert.equal(original.facts(event.before).actions.find(a=>a.action==='S').capture,false);
 for(const key of Object.keys(response.answers)){
  const bad=structuredClone(response);delete bad.answers[key];
  assert.throws(()=>api.decision(event.before,bad),/Invalid/);
 }
 const bad=structuredClone(response);bad.answers.human_action.choice='N';
 assert.throws(()=>api.decision(event.before,bad),/Invalid/);
 assert.throws(()=>api.decision(event.before,{...response,model:'jev-latest'}),/model/);
});
