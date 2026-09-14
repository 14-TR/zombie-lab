"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { test } = require("node:test");
const builder = path.join(__dirname, "build-sweep.cjs");

function loadBuilder() {
  assert.ok(fs.existsSync(builder), "sweep engine must exist");
  const api = require(builder);
  assert.equal(typeof api.buildSweep, "function");
  return api;
}

test("exhaustive sweep covers every distinct ordered start exactly once in row-major order", () => {
  const sweep = loadBuilder().buildSweep({ commit: "test-source" });
  assert.equal(sweep.schemaVersion, 1);
  assert.deepEqual(sweep.metadata, { commit: "test-source" });
  assert.deepEqual(sweep.config, {
    width: 10, height: 7, safetyTickLimit: 10000,
    captureRule: "orthogonal-adjacency", excluded: "same-cell starts"
  });
  const expected = [];
  for (let zombieId = 0; zombieId < 70; zombieId++) {
    for (let humanId = 0; humanId < 70; humanId++) {
      if (humanId !== zombieId) expected.push(`z${zombieId}-h${humanId}`);
    }
  }
  assert.equal(sweep.results.length, 4830);
  assert.equal(new Set(sweep.results.map(row => row.id)).size, 4830);
  assert.deepEqual(sweep.results.map(row => row.id), expected);
  const counts = { total: 0, capture: 0, cycle: 0, unresolved: 0, initialCapture: 0 };
  for (const row of sweep.results) {
    assert.deepEqual(Object.keys(row).sort(), ["cycleStart", "humanId", "id", "outcome", "period", "stopTick", "zombieId"]);
    assert.equal(row.id, `z${row.zombieId}-h${row.humanId}`);
    assert.notEqual(row.humanId, row.zombieId, "self-pairs are excluded");
    assert.ok(["capture", "cycle", "unresolved"].includes(row.outcome));
    assert.ok(Number.isInteger(row.stopTick) && row.stopTick >= 0 && row.stopTick <= 10000);
    if (row.outcome === "cycle") {
      assert.ok(Number.isInteger(row.cycleStart) && row.cycleStart >= 0 && row.cycleStart < row.stopTick);
      assert.equal(row.period, row.stopTick - row.cycleStart);
    } else {
      assert.equal(row.cycleStart, null);
      assert.equal(row.period, null);
      if (row.outcome === "unresolved") assert.equal(row.stopTick, 10000);
    }
    counts.total++;
    counts[row.outcome]++;
    if (row.outcome === "capture" && row.stopTick === 0) counts.initialCapture++;
  }
  assert.deepEqual(sweep.summary, counts);
});

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zombie-sweep-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function generate(out, env = {}, script = builder, cwd = path.resolve(__dirname, "..")) {
  const result = spawnSync(process.execPath, [script, ...(out === undefined ? [] : [out])], {
    cwd, env: { ...process.env, ...env }, encoding: "utf8", timeout: 40000
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

test("CLI writes only the two safe data artifacts and preserves existing replay files", t => {
  const out = temporary(t);
  const commit = '</script><script>globalThis.injected=true</script><img src="https://invalid.example/x">&\u2028\u2029';
  fs.writeFileSync(path.join(out, "positions.json"), "existing replay must remain\n");
  generate(out, { PREVIEW_COMMIT: commit });
  assert.deepEqual(fs.readdirSync(out).sort(), ["positions.json", "sweep-data.js", "sweep.json"]);
  assert.equal(fs.readFileSync(path.join(out, "positions.json"), "utf8"), "existing replay must remain\n");
  const json = JSON.parse(fs.readFileSync(path.join(out, "sweep.json"), "utf8"));
  assert.deepEqual(json.metadata, { commit });
  assert.equal(json.results.length, 4830);
  const script = fs.readFileSync(path.join(out, "sweep-data.js"), "utf8");
  assert.doesNotMatch(script, /[<>&\u2028\u2029]/, "escape HTML delimiters and JS line separators");
  const context = vm.createContext({});
  vm.runInContext(script, context, { timeout: 1000 });
  assert.deepEqual(JSON.parse(JSON.stringify(context.ZombieSweepData)), json);
  assert.equal(context.injected, undefined);
  assert.deepEqual(Object.keys(context), ["ZombieSweepData"]);
});

function production() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "simulation.js"), "utf8"), context, { timeout: 1000 });
  return context.ZombieLab;
}
function start(simulation, humanId, zombieId, tickLimit = 10000) {
  return { ...simulation.initialState(), tickLimit,
    human: { x: humanId % 10, y: Math.floor(humanId / 10) },
    zombie: { x: zombieId % 10, y: Math.floor(zombieId / 10) } };
}

test("single-start adjudicator preserves the baseline, initial capture, cutoff and frozen input", () => {
  const { classifyStart } = loadBuilder();
  assert.equal(typeof classifyStart, "function", "expose the bounded single-start adjudicator for edge-case tests");
  const simulation = production();
  for (const humanId of [27, 26]) {
    const state = start(simulation, humanId, 42);
    const before = JSON.stringify(state);
    Object.freeze(state.human); Object.freeze(state.zombie); Object.freeze(state);
    assert.deepEqual(classifyStart(simulation, state), { outcome: "capture", stopTick: 73, cycleStart: null, period: null });
    assert.equal(JSON.stringify(state), before);
  }
  assert.deepEqual(classifyStart(simulation, start(simulation, 1, 0)), { outcome: "capture", stopTick: 0, cycleStart: null, period: null });
  assert.deepEqual(classifyStart(simulation, start(simulation, 27, 42, 2)), { outcome: "unresolved", stopTick: 2, cycleStart: null, period: null });
  assert.equal(simulation.initialState().tickLimit, 40, "manual application defaults remain unchanged");
});

test("all and only adjacent starts capture at tick zero; both baseline rows capture at 73", () => {
  const sweep = loadBuilder().buildSweep();
  let adjacent = 0;
  for (const row of sweep.results) {
    const distance = Math.abs(row.humanId % 10 - row.zombieId % 10) + Math.abs(Math.floor(row.humanId / 10) - Math.floor(row.zombieId / 10));
    if (distance === 1) adjacent++;
    assert.equal(row.stopTick === 0, distance === 1, row.id);
    assert.equal(row.outcome, "capture", row.id);
  }
  assert.equal(adjacent, 2 * ((10 - 1) * 7 + (7 - 1) * 10));
  assert.equal(sweep.summary.initialCapture, adjacent);
  for (const id of ["z42-h27", "z42-h26"]) {
    assert.deepEqual(sweep.results.find(row => row.id === id), {
      id, humanId: Number(id.split("-h")[1]), zombieId: 42,
      outcome: "capture", stopTick: 73, cycleStart: null, period: null
    });
  }
});

test("fixed source and metadata repeat byte-for-byte without mutation or bulk trajectories", t => {
  const { buildSweep } = loadBuilder();
  const source = path.join(__dirname, "..", "simulation.js");
  const before = fs.readFileSync(source);
  assert.equal(createHash("sha256").update(before).digest("hex"), "4ee5817ba528b163fca1347c49ad4c48de2dcae226dd800065e5048b5b9bb568");
  const options = Object.freeze({ commit: "repeatability-check" });
  const first = buildSweep(options), second = buildSweep(options);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(options, { commit: "repeatability-check" });
  assert.deepEqual(fs.readFileSync(source), before);
  assert.doesNotMatch(JSON.stringify(first), /"(?:frames|trajectory|trajectories|decisions)"\s*:/);
  const one = temporary(t), two = temporary(t);
  generate(one, { PREVIEW_COMMIT: options.commit });
  generate(two, { PREVIEW_COMMIT: options.commit });
  for (const file of ["sweep.json", "sweep-data.js"]) assert.deepEqual(fs.readFileSync(path.join(one, file)), fs.readFileSync(path.join(two, file)));
});

test("first occurrence uses both ordered positions and records a nonzero cycle start", () => {
  const { classifyStart } = loadBuilder();
  // Synthetic sequences test runner branches, not production findings.
  const pairs = [[7, 2, 2, 4], [8, 2, 2, 4], [7, 3, 2, 4], [7, 2, 3, 4], [7, 2, 2, 5], [8, 2, 2, 4]];
  const initial = start(production(), 27, 42);
  let calls = 0;
  const simulation = { step(state) {
    calls++;
    const tick = state.tick + 1;
    const [hx, hy, zx, zy] = pairs[tick];
    return { ...state, tick, human: { x: hx, y: hy }, zombie: { x: zx, y: zy } };
  } };
  assert.deepEqual(classifyStart(simulation, initial), { outcome: "cycle", stopTick: 5, cycleStart: 1, period: 4 });
  assert.equal(calls, 5, "stop immediately at the first repeated endpoint");
  assert.deepEqual(classifyStart({ step: state => ({ ...state, tick: state.tick + 1 }) }, initial), {
    outcome: "cycle", stopTick: 1, cycleStart: 0, period: 1
  });
});

test("capture precedes cycle, which precedes unresolved at the inclusive tick 10000 bound", () => {
  const { classifyStart } = loadBuilder();
  // Enlarged synthetic board permits a unique sequence through tick 10000.
  // Actual buildSweep remains fixed at 10x7 and never uses this fixture.
  const initial = { ...start(production(), 2, 60), width: 10005 };
  for (const [status, repeat, expected] of [
    ["limit", false, { outcome: "unresolved", stopTick: 10000, cycleStart: null, period: null }],
    ["running", false, { outcome: "unresolved", stopTick: 10000, cycleStart: null, period: null }],
    ["limit", true, { outcome: "cycle", stopTick: 10000, cycleStart: 0, period: 10000 }],
    ["caught", true, { outcome: "capture", stopTick: 10000, cycleStart: null, period: null }]
  ]) {
    let calls = 0;
    const simulation = { step(state) {
      calls++;
      const tick = state.tick + 1, last = tick === 10000;
      return { ...state, tick, human: { x: last && repeat ? 2 : tick + 2, y: 0 }, status: last ? status : "running" };
    } };
    assert.deepEqual(classifyStart(simulation, initial), expected);
    assert.equal(calls, 10000);
  }
});

test("malformed progress, positions and terminal states are rejected rather than published", () => {
  const { classifyStart } = loadBuilder();
  const initial = start(production(), 27, 42);
  for (const advance of [0, 2, -1]) {
    assert.throws(() => classifyStart({ step: state => ({ ...state, tick: state.tick + advance }) }, initial), /consecutive tick progress/);
  }
  for (const [changes, error] of [[{ status: "broken" }, /status/], [{ status: "limit" }, /before safety/], [{ human: { x: 10, y: 2 } }, /outside/]]) {
    assert.throws(() => classifyStart({ step: state => ({ ...state, tick: state.tick + 1, ...changes }) }, initial), error);
  }
});

test("unsafe or noninteger safety caps and nonstring metadata are rejected", () => {
  const { classifyStart, buildSweep } = loadBuilder();
  for (const tickLimit of [-1, 0.5, NaN, Infinity, 10001]) {
    assert.throws(() => classifyStart(production(), start(production(), 27, 42, tickLimit)), /safety tick limit/i);
  }
  assert.throws(() => buildSweep({ commit: 123 }), /commit.*string/i);
});

test("CLI output argument wins over environment and default is cwd/preview", t => {
  const dir = temporary(t), explicit = path.join(dir, "nested", "explicit"), ignored = path.join(dir, "ignored");
  generate(explicit, { PREVIEW_OUTPUT_DIR: ignored, PREVIEW_COMMIT: "paths" });
  assert.equal(fs.existsSync(ignored), false);
  assert.equal(fs.existsSync(path.join(explicit, "sweep.json")), true);
  generate(undefined, { PREVIEW_OUTPUT_DIR: "", PREVIEW_COMMIT: "paths" }, builder, dir);
  assert.deepEqual(fs.readdirSync(path.join(dir, "preview")).sort(), ["sweep-data.js", "sweep.json"]);
  generate(undefined, { PREVIEW_OUTPUT_DIR: ignored, PREVIEW_COMMIT: "paths" }, builder, dir);
  assert.equal(fs.existsSync(path.join(ignored, "sweep.json")), true);
});
