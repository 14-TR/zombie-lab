"use strict";
// Read-only independent reviewer: load only unchanged production physics.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const ROOT = "/Users/tr/Projects/zombie-lab-solver";
const OUT = "/tmp/zl010-review";
const ORACLE = "/tmp/zl010-oracle/transitions.bin";
const sha = data => crypto.createHash("sha256").update(data).digest("hex");
const source = fs.readFileSync(path.join(ROOT, "two-zombies.js"));
const context = vm.createContext({});
vm.runInContext(source.toString("utf8"), context, { timeout: 1000, filename: "two-zombies.js" });
const pair = context.ZombiePair, started = process.hrtime.bigint();
function enumerate() {
  const magic = Buffer.from("ZL010-TRANSITIONS-v1\n", "ascii");
  const buf = Buffer.alloc(magic.length + 343000 * 36);
  magic.copy(buf); let offset = magic.length;
  const deltas = [[0,-1],[1,0],[0,1],[-1,0],[0,0]];
  const point = i => ({x:i%10,y:Math.floor(i/10)});
  const cell = p => { assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y) && p.x>=0 && p.x<10 && p.y>=0 && p.y<7); return p.y*10+p.x; };
  const indexOf = s => ((cell(s.zombies[0])*70+cell(s.zombies[1]))*70+cell(s.human));
  const contact = s => s.zombies.some(z => Math.abs(s.human.x-z.x)+Math.abs(s.human.y-z.y)<=1);
  let states=0, terminalStates=0, transitions=0, capturingTransitions=0;
  const chunks = [];
  for (let z1=0;z1<70;z1++) {
    assert.ok(process.memoryUsage().rss < 512*1024*1024);
    const start = offset;
    for (let z2=0;z2<70;z2++) for (let h=0;h<70;h++) {
      const s = {...pair.initialState(),human:point(h),zombies:[point(z1),point(z2)],tick:0,status:"running",reason:""};
      assert.equal(s.width,10); assert.equal(s.height,7); assert.equal(s.tickLimit,10000);
      const stateIndex = ((z1*70+z2)*70+h);
      const probe = pair.step(s,"greedy");
      const terminal = probe.tick===0 && probe.status==="caught";
      assert.equal(terminal,contact(s));
      const legal = terminal ? [] : deltas.map(([dx,dy],a)=>({a,human:{x:s.human.x+dx,y:s.human.y+dy}})).filter(({human:p})=>p.x>=0&&p.x<10&&p.y>=0&&p.y<7);
      buf.writeUInt32LE(stateIndex,offset); buf[offset+4]=Number(terminal); buf[offset+5]=legal.length; offset+=6; states++;
      if (terminal) {
        const initial = pair.resolveTick(s,{});
        assert.equal(initial.status,"caught"); assert.equal(initial.tick,0); assert.equal(indexOf(initial),stateIndex);
        terminalStates++; continue;
      }
      assert.equal(probe.tick,1);
      for (const {a,human} of legal) {
        // Private production choices obtained from step, not independently
        // reconstructed or taken from the solver's generated edge table.
        const next = pair.resolveTick(s,{human,zombies:probe.zombies});
        assert.equal(next.tick,1); assert.ok(next.status==="running" || next.status==="caught");
        const caught = next.status==="caught";
        assert.equal(caught,contact(next)); assert.equal(cell(next.human),cell(human));
        buf[offset]=a; buf.writeUInt32LE(indexOf(next),offset+1); buf[offset+5]=Number(caught); offset+=6;
        transitions++; capturingTransitions+=Number(caught);
      }
      assert.equal(s.tick,0); assert.equal(s.status,"running"); assert.equal(indexOf(s),stateIndex);
    }
    chunks.push({zombie1:z1,sha256:sha(buf.subarray(start,offset))});
  }
  const stream = buf.subarray(0,offset), oracle = fs.readFileSync(ORACLE);
  const fingerprints=JSON.parse(fs.readFileSync("/tmp/zl010-oracle/fingerprints.json","utf8"));
  assert.equal(states,343000); assert.equal(transitions,1351892); assert.equal(terminalStates,42788);
  assert.equal(offset,10169373); assert.equal(stream.length,oracle.length);
  assert.ok(stream.equals(oracle),"Every production transition byte must equal the independent oracle");
  assert.equal(sha(stream),sha(oracle)); assert.equal(sha(stream),fingerprints.transitionSha256);
  assert.deepEqual(chunks,fingerprints.transitionHashesByZombie1);
  assert.equal(sha(source),sha(fs.readFileSync(path.join(ROOT,"two-zombies.js"))));
  fs.mkdirSync(OUT,{recursive:true});
  const destination=path.join(OUT,"production-transitions.bin"); fs.writeFileSync(destination,stream);
  assert.equal(sha(fs.readFileSync(destination)),sha(stream));
  const receipt={status:"PASS",allBytesEqual:true,states,terminalStates,nonterminalStates:states-terminalStates,transitions,capturingTransitions,noncapturingTransitions:transitions-capturingTransitions,transitionBytes:offset,transitionSha256:sha(stream),oracleSha256:sha(oracle),perZombie1DigestsMatched:chunks.length,productionSourceSha256:sha(source),scriptSha256:sha(fs.readFileSync(__filename)),transitionHashesByZombie1:chunks,elapsedSeconds:Number(process.hrtime.bigint()-started)/1e9,resources:process.resourceUsage(),output:destination,oracle:ORACLE};
  fs.writeFileSync(path.join(OUT,"production-parity.json"),JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify({...receipt,transitionHashesByZombie1:undefined},null,2));
}
vm.runInNewContext("enumerate()",{enumerate},{timeout:120000,filename:"production-parity-watchdog.js"});
