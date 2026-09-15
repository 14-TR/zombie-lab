"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ROOT = path.resolve(__dirname, "..");
function fixture(epoch = 40) {
  return { schemaVersion: 1, architecture: [6, 32, 5], seed: 17, epoch,
    W1: Array.from({ length: 6 }, () => Array(32).fill(0)), b1: Array(32).fill(0),
    W2: Array.from({ length: 32 }, () => Array(5).fill(0)), b2: Array(5).fill(0) };
}
function state(human = { x: 5, y: 3 }) {
  return { width: 10, height: 7, tick: 0, tickLimit: 10000, status: "running", reason: "",
    human, zombies: [{ x: 0, y: 0 }, { x: 9, y: 6 }] };
}
test("malformed model schemas and invalid board positions fail closed", () => {
  const api = neural();
  for (const mutate of [m => m.architecture[1] = 31, m => m.schemaVersion = 2,
    m => m.seed = 18, m => m.epoch = 39, m => m.W1.pop(), m => m.W2[0].pop(),
    m => m.b1.pop(), m => m.b2[0] = NaN, m => m.W1[0][0] = "1"]) {
    const model = fixture(); mutate(model);
    assert.throws(() => api.logits(state(), model), /model/i);
  }
  assert.throws(() => api.logits({ ...state(), width: 11 }, fixture()), /state/i);
  assert.throws(() => api.logits(state({ x: 1.5, y: 2 }), fixture()), /state/i);
  const frozen = fixture();
  for (const key of ["W1", "W2"]) frozen[key].forEach(Object.freeze);
  [frozen.W1, frozen.W2, frozen.b1, frozen.b2, frozen.architecture, frozen].forEach(Object.freeze);
  assert.deepEqual(api.logits(state(), frozen), [0, 0, 0, 0, 0]);
});
function evaluator() {
  const file = path.join(ROOT, "scripts/build-neural.cjs");
  assert.ok(fs.existsSync(file), "bounded neural evaluator exists");
  return require(file);
}
test("position-only trace detects capture before recurrence before cutoff and keeps endpoints", () => {
  const { trace } = evaluator();
  const next = [1, 2, 1, 3];
  const run = (start, cap, terminal = i => i === 3) => trace(start, i => next[i], terminal, { cutoff: cap });
  assert.deepEqual(run(0, 3), { outcome: "cycle", stopTick: 3, cycleStart: 1, period: 2, indices: [0, 1, 2, 1] });
  assert.equal(run(3, 0).outcome, "capture");
  assert.equal(run(0, 2).outcome, "unresolved");
  assert.equal(run(0, 3, i => i === 1).outcome, "capture");
  assert.throws(() => run(0, 10001), /cutoff/i);
});
test("paired statistics separate recovered failures, regressions, finite delay, and contacts", () => {
  const { summarize, comparePolicies } = evaluator();
  assert.equal(typeof summarize, "function");
  const outcome = (name, tick = 0) => ({ outcome: name, stopTick: tick, cycleStart: name === "cycle" ? 1 : null, period: name === "cycle" ? 2 : null });
  const row = (id, rank, a, b) => ({ id, avoidable: rank === -1, maxCaptureTicks: rank < 0 ? null : rank, split: "test", policies: { depth1: a, neural: b } });
  const rows = [row("a", -1, outcome("capture", 4), outcome("cycle", 3)),
    row("b", -1, outcome("cycle", 3), outcome("capture", 8)),
    row("c", -1, outcome("cycle", 3), outcome("cycle", 4)),
    row("d", 0, outcome("capture"), outcome("capture")),
    row("e", 4, outcome("capture", 4), outcome("capture", 2)),
    row("f", -1, outcome("cycle", 3), outcome("unresolved", 10000))];
  const summary = summarize(rows, ["depth1", "neural"]), n = summary.policies.neural;
  assert.equal(summary.total, 6); assert.equal(summary.initialContact, 1);
  assert.equal(n.avoidableCaptures, 1); assert.equal(n.captureDelayShortfall.totalTicks, 2);
  assert.equal(n.captureDelayShortfall.noninitialMeanTicks, 2);
  const paired = comparePolicies(rows, "depth1", "neural");
  assert.equal(paired.recoveredAvoidableCaptures, 1); assert.equal(paired.newCapturesOnCycles, 1);
  assert.equal(paired.unchangedCycles, 1); assert.equal(paired.unresolvedOnCycles, 1);
  assert.equal(paired.bothCapturedNoninitial.earlier, 1);
  assert.equal(paired.success, false);
  assert.throws(() => summarize([row("bad", 2, outcome("capture", 2), outcome("capture", 3))], ["neural"]), /rank|delay/i);
});
test("frozen group labels ignore zombie order and witnesses deduplicate in result order", () => {
  const { groupSplit, selectWitnesses, trajectoryOverlap } = evaluator();
  assert.equal(typeof groupSplit, "function");
  const crypto = require("node:crypto");
  for (let z = 0; z < 70; z++) {
    const bucket = parseInt(crypto.createHash("sha256").update(`ZL011:${Math.min(z, 42)}:${Math.max(z, 42)}`).digest("hex").slice(0, 8), 16) % 10;
    assert.equal(groupSplit(z, 42), bucket < 8 ? "train" : bucket === 8 ? "validation" : "test");
    assert.equal(groupSplit(z, 42), groupSplit(42, z));
  }
  const c = { outcome: "capture", stopTick: 2, cycleStart: null, period: null };
  const y = { outcome: "cycle", stopTick: 3, cycleStart: 1, period: 2 };
  const rows = [{ id: "a", stateIndex: 100, avoidable: true, maxCaptureTicks: null, policies: { depth1: c, depth2: c, neural: y } },
    { id: "b", stateIndex: 101, avoidable: true, maxCaptureTicks: null, policies: { depth1: y, depth2: y, neural: c } },
    { id: "c", stateIndex: 102, avoidable: false, maxCaptureTicks: 2, policies: { depth1: c, depth2: c, neural: c } }];
  const witnesses = selectWitnesses(rows, row => ({ ...row.policies.neural,
    frames: Array.from({ length: row.policies.neural.stopTick + 1 }, (_, tick) => ({ human: { x: 0, y: tick }, zombie1: { x: 9, y: 6 }, zombie2: { x: 9, y: 5 }, tick })) }));
  assert.deepEqual(witnesses.map(w => w.id), ["a", "b", "c"]);
  assert.match(witnesses[0].reason, /recovery-depth1/); assert.match(witnesses[0].reason, /recovery-depth2/);
  assert.match(witnesses[1].reason, /regression-depth1/); assert.equal(witnesses[0].cyclePeriod, 2);
  assert.equal(witnesses[0].frames.length, witnesses[0].stopTick + 1);
  const overlap = trajectoryOverlap([[0, 70, 0], [70]], () => "train");
  assert.equal(overlap.frameVisits.train, 4); assert.equal(overlap.uniqueStates.train, 2);
  assert.equal(overlap.uniqueGroups.train, 2); assert.equal(overlap.trajectoriesVisiting.train, 2);
});
test("cached production transitions and decisions preserve full fixed-state trajectories", () => {
  const api = evaluator(); assert.equal(typeof api.createWorld, "function");
  const world = api.createWorld(), model = fixture(), choose = s => neural().chooseHuman(s, model);
  for (const index of [2, 69, 10500, 159601, 207330, 210069, 342930]) {
    const s = world.stateAt(index);
    for (let a = 0; a < 5; a++) {
      const direct = world.transition(index, a, false);
      assert.equal(world.transition(index, a), direct);
      assert.equal(world.transition(index, a), direct);
    }
    const cached = world.policy(choose), fast = world.run(index, cached);
    const direct = world.runDirect(index, choose);
    assert.deepEqual(fast, direct, `complete production frame parity at ${index}`);
    assert.deepEqual(world.stateAt(index), s, "cached state not mutated");
  }
});
test("one-step exact labels distinguish all optimal choices from the first canonical action", () => {
  const { scoreActions } = evaluator(); assert.equal(typeof scoreActions, "function");
  const scores = [99, 1, 3, 3, 0], successors = [-1, 10, 11, 12, 13];
  const ranks = new Int32Array(14); ranks[10] = -1; ranks[11] = -1; ranks[12] = 3; ranks[13] = 2;
  const win = scoreActions(-1, successors, ranks, scores);
  assert.equal(win.action, 2); assert.equal(win.optimal, true); assert.equal(win.canonical, false);
  assert.equal(win.nearTie, true); assert.equal(win.margin, 0);
  ranks[10] = 1; ranks[11] = 3;
  const lose = scoreActions(4, successors, ranks, scores);
  assert.equal(lose.optimal, true); assert.equal(lose.canonical, true);
  const unsafe = scoreActions(-1, successors, Object.assign(ranks.slice(), { 10: -1 }), scores);
  assert.equal(unsafe.optimal, false);
});
test("bounded end-to-end fixture emits paired rows, exact heldout scope and measured benchmark", () => {
  const api = evaluator(); assert.equal(typeof api.buildNeural, "function");
  const legacy = JSON.parse(fs.readFileSync(path.join(ROOT, "evidence/avoidability/data/avoidability.json"), "utf8"));
  const rows = legacy.results.filter(r => ["z2-0-h1", "z2-0-h2", "z2-21-h60"].includes(r.id));
  const data = api.buildNeural({ fixture: true, model: fixture(), initial: fixture(0),
    originalRows: rows, oneStepIndices: rows.filter(r => r.maxCaptureTicks !== 0).map(r => r.stateIndex),
    heldoutIndices: rows.map(r => r.stateIndex), benchmarkConfig: { batchSize: 8, warmups: 1, repeats: 2 } });
  assert.equal(data.schemaVersion, 1); assert.equal(data.metadata.fixture, true);
  assert.equal(data.results.length, 3); assert.equal(data.summary.heldout.total, 3);
  assert.equal(data.summary.original.policies.neural.capture + data.summary.original.policies.neural.cycle, 3);
  assert.equal(data.summary.verification.originalReplayRows, 3);
  assert.equal(data.summary.verification.heldoutReplayRows, 3);
  assert.equal(data.summary.verification.legacyOutcomeComparisons, 9);
  assert.equal(data.summary.heldout.scope, "exact-avoidability-only; no expanded planner comparison");
  for (const p of ["neural", "depth1", "depth2"]) {
    assert.equal(data.summary.latency.policies[p].batchMilliseconds.length, 2);
    assert.ok(data.summary.latency.policies[p].medianMicrosecondsPerDecision > 0);
  }
  const context = vm.createContext({ window: {} });
  vm.runInContext(api.dataScript({ text: "</script>&\u2028\u2029" }), context, { timeout: 1000 });
  assert.equal(context.window.ZL_NEURAL_DATA.text, "</script>&\u2028\u2029");
  assert.equal(api.dataScript({ text: "</script>" }).includes("</script>"), false);
  assert.throws(() => api.withWatchdog(() => { for (;;) {} }, 10), /timed out/);
});
test("CLI missing frozen models fails without fabricating outputs", () => {
  const { spawnSync } = require("node:child_process");
  const temp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "zl011-missing-model-"));
  try {
    const run = spawnSync(process.execPath, ["--max-old-space-size=384", path.join(ROOT, "scripts/build-neural.cjs"),
      "--out-dir", temp, "--model-dir", path.join(temp, "absent")], { encoding: "utf8", timeout: 10000 });
    assert.equal(run.status, 1); assert.match(run.stderr, /Frozen model absent/);
    assert.equal(fs.existsSync(path.join(temp, "neural.json")), false);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
test("optional independent NumPy logits and legal actions match fixture JS inference", t => {
  const { verifyPython } = evaluator(); assert.equal(typeof verifyPython, "function");
  if (!process.env.ZL_NEURAL_TEST_PYTHON) return t.skip("Set ZL_NEURAL_TEST_PYTHON to existing NumPy interpreter; no install");
  const model = fixture(); model.W1[0][0] = 0.8; model.W1[4][1] = -0.2;
  model.W2[0][0] = 0.9; model.W2[1][1] = -0.3;
  const indices = [2, 69, 159601, 207330, 210069];
  const receipt = verifyPython(model, indices, evaluator().createWorld(), process.env.ZL_NEURAL_TEST_PYTHON);
  assert.equal(receipt.states, indices.length); assert.equal(receipt.actionDisagreements, 0);
  assert.ok(receipt.maxAbsoluteLogitError <= 1e-10); assert.equal(receipt.passed, true);
});
test("sparse architecture and overflowing hidden sums are invalid model inputs", () => {
  const model = fixture(); delete model.architecture[1];
  assert.throws(() => neural().logits(state(), model), /model/i);
  const overflow = fixture(); overflow.b1[0] = Number.MAX_VALUE; overflow.W1[4][0] = Number.MAX_VALUE;
  assert.throws(() => neural().logits(state(), overflow), /model|nonfinite/i);
});
test("evaluation rejects model file changes after identities freeze", () => {
  const temp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "zl011-freeze-"));
  try {
    fs.writeFileSync(path.join(temp, "feed-forward.json"), JSON.stringify(fixture()));
    fs.writeFileSync(path.join(temp, "feed-forward-initial.json"), JSON.stringify(fixture(0)));
    assert.throws(() => evaluator().buildNeural({ fixture: true, modelDir: temp,
      originalRows: [], oneStepIndices: [], heldoutIndices: [], benchmarkConfig: { batchSize: 4, warmups: 1, repeats: 1 },
      onFrozen: () => fs.writeFileSync(path.join(temp, "feed-forward.json"), JSON.stringify({ ...fixture(), b2: [1, 2, 3, 4, 5] })) }), /model.*changed|changed.*model/i);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
function neural() {
  const file = path.join(ROOT, "neural-policy.js");
  assert.ok(fs.existsSync(file), "classic/CommonJS inference module exists");
  return require(file);
}
test("6-32 tanh-5 inference uses specified coordinate normalization and matrix orientation", () => {
  const api = neural(), model = fixture(), input = state();
  const inputs = [5 / 9, 3 / 6, 0, 0, 1, 1];
  for (let i = 0; i < 6; i++) model.W1[i][i] = i + 1;
  for (let j = 0; j < 6; j++) for (let k = 0; k < 5; k++) model.W2[j][k] = (j + 2) * (k + 1) / 10;
  model.b1.fill(0.125); model.b2 = [1, 2, 3, 4, 5];
  const before = JSON.stringify({ input, model });
  const expected = model.b2.map((bias, k) => inputs.reduce((s, x, j) =>
    s + Math.tanh(x * (j + 1) + 0.125) * (j + 2) * (k + 1) / 10, bias));
  api.logits(input, model).forEach((value, k) => assert.ok(Math.abs(value - expected[k]) < 1e-13));
  assert.equal(JSON.stringify({ input, model }), before, "inference never mutates inputs or weights");
});
test("legal masking preserves N/E/S/W/stay first ties, including contacts before decision", () => {
  const api = neural(), model = fixture();
  assert.equal(typeof api.chooseHuman, "function", "destination selector exists");
  assert.deepEqual(api.chooseHuman(state(), model), { x: 5, y: 2 });
  model.b2 = [100, 3, 3, 100, 2];
  const corner = state({ x: 0, y: 0 }); corner.zombies = [{ x: 5, y: 3 }, { x: 9, y: 6 }];
  assert.deepEqual(api.chooseHuman(corner, model), { x: 1, y: 0 });
  model.b2 = [1, 1, 1, 1, 9];
  assert.deepEqual(api.chooseHuman(state(), model), state().human);
  const contact = state({ x: 0, y: 1 });
  assert.deepEqual(api.chooseHuman(contact, null), contact.human, "initial contact never evaluates weights");
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(ROOT, "neural-policy.js"), "utf8"), context, { timeout: 1000 });
  assert.deepEqual(JSON.parse(JSON.stringify(context.NeuralPolicy.chooseHuman(state(), model))), state().human);
  assert.equal(typeof context.require, "undefined", "classic runtime has no imports");
});
