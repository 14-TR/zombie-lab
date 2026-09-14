"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const root = path.resolve(__dirname, "..");
const builder = path.join(__dirname, "build-planning.cjs");
function loadBuilder() {
  assert.ok(fs.existsSync(builder), "planning engine must exist");
  return require(builder);
}
test("classifyRun records first ordered recurrence and capture-cycle-cutoff precedence", () => {
  const { classifyRun } = loadBuilder();
  assert.equal(typeof classifyRun, "function");
  const { lab } = load();
  const initial = freeze(state(lab));
  assert.deepEqual(classifyRun(lab, initial), { outcome: "capture", stopTick: 73, cycleStart: null, period: null });
  assert.deepEqual(classifyRun(lab, state(lab, { human: { x: 3, y: 4 }, tickLimit: 0 })), { outcome: "capture", stopTick: 0, cycleStart: null, period: null });
  assert.deepEqual(classifyRun(lab, state(lab, { tickLimit: 0 })), { outcome: "unresolved", stopTick: 0, cycleStart: null, period: null });
  const pairs = [[7, 2, 2, 4], [8, 2, 2, 4], [7, 3, 2, 4], [7, 2, 3, 4], [7, 2, 2, 5], [8, 2, 2, 4]];
  let calls = 0;
  const synthetic = { step(s) {
    calls++;
    const tick = s.tick + 1, [hx, hy, zx, zy] = pairs[tick];
    return { ...s, tick, human: { x: hx, y: hy }, zombie: { x: zx, y: zy } };
  } };
  assert.deepEqual(classifyRun(synthetic, initial), { outcome: "cycle", stopTick: 5, cycleStart: 1, period: 4 });
  assert.equal(calls, 5);
  // Synthetic enlarged board supplies unique states through the inclusive bound.
  for (const [status, repeat, outcome] of [["limit", false, "unresolved"], ["running", false, "unresolved"], ["limit", true, "cycle"], ["caught", true, "capture"]]) {
    calls = 0;
    const long = state(lab, { width: 10005, human: { x: 2, y: 0 }, zombie: { x: 0, y: 6 } });
    const run = { step(s) {
      calls++;
      const tick = s.tick + 1, last = tick === 10000;
      return { ...s, tick, human: { x: last && repeat ? 2 : tick + 2, y: 0 }, status: last ? status : "running" };
    } };
    assert.deepEqual(classifyRun(run, long), { outcome, stopTick: 10000, cycleStart: outcome === "cycle" ? 0 : null, period: outcome === "cycle" ? 10000 : null });
    assert.equal(calls, 10000);
  }
  for (const tickLimit of [-1, 0.5, NaN, Infinity, 10001]) assert.throws(() => classifyRun(lab, state(lab, { tickLimit })), /safety tick limit/i);
  assert.throws(() => classifyRun({ step: s => s }, initial), /consecutive tick progress/);
});
test("paired sweep covers all 4830 starts and reproduces every frozen baseline row", () => {
  const { buildPlanning } = loadBuilder();
  assert.equal(typeof buildPlanning, "function", "export complete paired build");
  const frozen = JSON.parse(fs.readFileSync(path.join(root, "evidence/all-starts/sweep.json"), "utf8"));
  const options = freeze({ commit: "test-frozen-contract" });
  const data = buildPlanning(options);
  assert.deepEqual(Object.keys(data).sort(), ["config", "metadata", "results", "schemaVersion", "summary"]);
  assert.equal(data.schemaVersion, 1);
  assert.deepEqual(data.metadata, options);
  assert.deepEqual(data.config, { width: 10, height: 7, safetyTickLimit: 10000, horizon: 2, policy: "two-tick-model-based", excluded: "same-cell starts" });
  assert.equal(data.results.length, 4830);
  assert.equal(new Set(data.results.map(row => row.id)).size, 4830);
  const expectedIds = [];
  for (let z = 0; z < 70; z++) for (let h = 0; h < 70; h++) if (z !== h) expectedIds.push(`z${z}-h${h}`);
  assert.deepEqual(data.results.map(row => row.id), expectedIds);
  const counts = { total: 4830, baseline: { capture: 0, cycle: 0, unresolved: 0 }, treatment: { capture: 0, cycle: 0, unresolved: 0 }, later: 0, earlier: 0, same: 0, escape: 0, unresolved: 0 };
  let initial = 0;
  data.results.forEach((row, index) => {
    assert.deepEqual(Object.keys(row).sort(), ["baseline", "comparison", "humanId", "id", "treatment", "zombieId"]);
    const old = frozen.results[index];
    assert.equal(row.id, old.id);
    assert.equal(row.zombieId, old.zombieId); assert.equal(row.humanId, old.humanId);
    const { outcome, stopTick, cycleStart, period } = old;
    assert.deepEqual(row.baseline, { outcome, stopTick, cycleStart, period }, row.id);
    const adjacent = Math.abs(row.humanId % 10 - row.zombieId % 10) + Math.abs(Math.floor(row.humanId / 10) - Math.floor(row.zombieId / 10)) === 1;
    for (const policy of ["baseline", "treatment"]) {
      const r = row[policy];
      assert.deepEqual(Object.keys(r).sort(), ["cycleStart", "outcome", "period", "stopTick"]);
      assert.ok(Object.hasOwn(counts[policy], r.outcome));
      assert.ok(Number.isInteger(r.stopTick) && r.stopTick >= 0 && r.stopTick <= 10000);
      if (r.outcome === "cycle") { assert.ok(r.cycleStart >= 0 && r.cycleStart < r.stopTick); assert.equal(r.period, r.stopTick - r.cycleStart); }
      else { assert.equal(r.cycleStart, null); assert.equal(r.period, null); }
      assert.equal(r.outcome === "capture" && r.stopTick === 0, adjacent, row.id);
      counts[policy][r.outcome]++;
    }
    if (adjacent) initial++;
    const t = row.treatment, b = row.baseline;
    const comparison = t.outcome === "unresolved" || b.outcome === "unresolved" ? "unresolved" :
      t.outcome === "cycle" && b.outcome === "capture" ? "escape" :
      t.stopTick > b.stopTick ? "later" : t.stopTick < b.stopTick ? "earlier" : "same";
    assert.equal(row.comparison, comparison, row.id); counts[comparison]++;
  });
  assert.equal(initial, 246);
  assert.deepEqual(data.summary, counts);
  assert.deepEqual(counts.baseline, { capture: 4830, cycle: 0, unresolved: 0 });
  assert.doesNotMatch(JSON.stringify(data), /"(?:frames|trajectory|trajectories|decisions)"\s*:/);
  assert.throws(() => buildPlanning({ commit: 123 }), /commit.*string/i);
});
const { spawnSync } = require("node:child_process");
const os = require("node:os");
const { createHash } = require("node:crypto");
test("CLI preserves neighbors, escapes metadata, repeats bytes and reports measured costs", t => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "zl008-cli-"));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const metadata = '</script><script>globalThis.injected=true</script>&\u2028\u2029';
  fs.writeFileSync(path.join(out, "keep.txt"), "existing evidence");
  function run() {
    const result = spawnSync(process.execPath, [builder, out], { cwd: root, encoding: "utf8", timeout: 40000,
      env: { ...process.env, PREVIEW_COMMIT: metadata, PREVIEW_OUTPUT_DIR: path.join(out, "ignored") } });
    assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fs.readdirSync(out).sort(), ["keep.txt", "planning-data.js", "planning.json"]);
    const receipt = JSON.parse(result.stdout);
    assert.ok(receipt.elapsedMs > 0); assert.ok(receipt.maxRSSKiB > 0); assert.ok(receipt.currentRSSBytes > 0);
    return receipt;
  }
  const receipt = run();
  const jsonBytes = fs.readFileSync(path.join(out, "planning.json"));
  const script = fs.readFileSync(path.join(out, "planning-data.js"), "utf8");
  const data = JSON.parse(jsonBytes);
  assert.equal(data.metadata.commit, metadata);
  assert.doesNotMatch(script, /[<>&\u2028\u2029]/);
  const context = vm.createContext({}); vm.runInContext(script, context, { timeout: 1000 });
  assert.deepEqual(plain(context.ZombiePlanningData), data);
  assert.deepEqual(Object.keys(context), ["ZombiePlanningData"]);
  assert.equal(receipt.outputBytes, jsonBytes.length + Buffer.byteLength(script));
  run();
  assert.deepEqual(fs.readFileSync(path.join(out, "planning.json")), jsonBytes);
  assert.equal(fs.readFileSync(path.join(out, "planning-data.js"), "utf8"), script);
  assert.equal(fs.readFileSync(path.join(out, "keep.txt"), "utf8"), "existing evidence");
  assert.equal(createHash("sha256").update(fs.readFileSync(path.join(root, "simulation.js"))).digest("hex"), "4ee5817ba528b163fca1347c49ad4c48de2dcae226dd800065e5048b5b9bb568");
});
const plain = value => JSON.parse(JSON.stringify(value));
function load() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, "simulation.js"), "utf8"), context);
  assert.ok(fs.existsSync(path.join(root, "planner.js")), "experimental planner must exist");
  vm.runInContext(fs.readFileSync(path.join(root, "planner.js"), "utf8"), context);
  return { lab: context.ZombieLab, planner: context.ZombiePlanner, context };
}
function state(lab, changes = {}) {
  return { ...plain(lab.initialState()), tickLimit: 10000, ...changes };
}
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
// Test oracle enumerates paths explicitly; production planner may use recursion.
const moves = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]];
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
function legal(s) {
  return moves.map(([x, y]) => ({ x: s.human.x + x, y: s.human.y + y }))
    .filter(p => p.x >= 0 && p.x < s.width && p.y >= 0 && p.y < s.height);
}
function leaves(lab, input) {
  const s = { ...input, tick: 0, tickLimit: 10000 };
  const choices = [];
  for (const human of legal(s)) {
    const a = lab.resolveTick(s, { human, zombie: lab.step(s).zombie });
    if (a.status === "caught") choices.push({ human, score: [0, distance(a.human, a.zombie)] });
    else for (const second of legal(a)) {
      const b = lab.resolveTick(a, { human: second, zombie: lab.step(a).zombie });
      choices.push({ human, score: [b.status === "caught" ? 1 : 2, distance(b.human, b.zombie)] });
    }
  }
  return choices;
}
function bestLeaf(rows) {
  return rows.reduce((best, row) => !best || row.score[0] > best.score[0] ||
    (row.score[0] === best.score[0] && row.score[1] > best.score[1]) ? row : best, null);
}
test("two-transition choice scores survival before distance and keeps first sequence on ties", () => {
  const { lab, planner } = load();
  assert.equal(typeof planner.chooseHuman, "function", "export the frozen two-tick chooser");
  // North captures immediately at distance 1; staying survives one transition
  // before capture at distance 1. Survival priority must defeat traversal order.
  const survival = state(lab, { width: 1, height: 4, human: { x: 0, y: 3 }, zombie: { x: 0, y: 0 } });
  assert.deepEqual(bestLeaf(leaves(lab, survival)), { human: { x: 0, y: 3 }, score: [1, 1] });
  assert.deepEqual(leaves(lab, survival)[0].score, [0, 1]);
  assert.deepEqual(plain(planner.chooseHuman(survival)), { x: 0, y: 3 });
  const horizon = state(lab, { width: 1, height: 5, human: { x: 0, y: 4 }, zombie: { x: 0, y: 0 } });
  assert.deepEqual(plain(planner.chooseHuman(horizon)), { x: 0, y: 3 }, "two ticks, not one-tick greedy staying");
  assert.deepEqual(plain(lab.step(horizon).human), { x: 0, y: 4 });
  const tie = state(lab, { width: 3, height: 3, human: { x: 1, y: 1 }, zombie: { x: 0, y: 0 } });
  const rows = leaves(lab, tie), best = bestLeaf(rows);
  assert.deepEqual(best, { human: { x: 2, y: 1 }, score: [2, 2] });
  assert.ok(rows.some(row => row.human.x === 1 && row.human.y === 2 && row.score.join() === best.score.join()));
  assert.deepEqual(plain(planner.chooseHuman(tie)), best.human);
  for (let z = 0; z < 16; z++) for (let h = 0; h < 16; h++) {
    const s = state(lab, { width: 4, height: 4, human: { x: h % 4, y: Math.floor(h / 4) }, zombie: { x: z % 4, y: Math.floor(z / 4) } });
    if (distance(s.human, s.zombie) > 1) assert.deepEqual(plain(planner.chooseHuman(s)), bestLeaf(leaves(lab, s)).human, `z${z}-h${h}`);
  }
});
test("step executes only the selected first action with an old-state zombie and real clock", () => {
  const { lab, planner } = load();
  let differences = 0, anticipationWitnesses = 0;
  for (let z = 0; z < 16; z++) for (let h = 0; h < 16; h++) {
    const s = freeze(state(lab, { width: 4, height: 4, tick: 9999,
      human: { x: h % 4, y: Math.floor(h / 4) }, zombie: { x: z % 4, y: Math.floor(z / 4) } }));
    if (distance(s.human, s.zombie) <= 1) continue;
    const before = JSON.stringify(s), human = bestLeaf(leaves(lab, s)).human;
    const oldZombie = lab.step({ ...s, tick: 0 }).zombie;
    const expected = lab.resolveTick(s, { human, zombie: oldZombie });
    if (JSON.stringify(plain(expected)) !== JSON.stringify(plain(lab.step(s)))) differences++;
    const reacted = lab.step({ ...s, tick: 0, human }).zombie;
    if (distance(oldZombie, reacted) > 0) anticipationWitnesses++;
    assert.deepEqual(plain(planner.step(s)), plain(expected), `z${z}-h${h}`);
    assert.deepEqual(plain(planner.chooseHuman(s)), plain(planner.chooseHuman({ ...s, tick: 0, tickLimit: 1 })));
    assert.deepEqual(plain(planner.chooseHuman(s)), plain(planner.chooseHuman({ ...s, tick: 123, tickLimit: 124, reason: "irrelevant", decisions: { old: true } })));
    assert.equal(JSON.stringify(s), before);
    assert.equal(planner.step(s).tick, 10000);
  }
  assert.ok(differences > 0, "fixture distinguishes planner from greedy");
  assert.ok(anticipationWitnesses > 0, "fixture distinguishes simultaneous from reactive zombie moves");
});
test("terminal normalization exactly matches baseline without consuming a tick", () => {
  const { lab, planner } = load();
  assert.equal(typeof planner.step, "function");
  for (const changes of [
    { human: { x: 3, y: 4 } },
    { human: { x: 2, y: 4 } },
    { tick: 40, tickLimit: 40 },
    { human: { x: 3, y: 4 }, tickLimit: 0 },
    { status: "caught", reason: "already stopped" },
    { status: "limit", reason: "already stopped" }
  ]) {
    const initial = freeze(state(lab, changes));
    const before = JSON.stringify(initial);
    assert.deepEqual(plain(planner.step(initial)), plain(lab.step(initial)));
    assert.equal(planner.step(initial).tick, initial.tick);
    assert.equal(JSON.stringify(initial), before);
  }
});
