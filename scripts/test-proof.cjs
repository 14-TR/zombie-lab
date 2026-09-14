"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { buildSweep } = require("./build-sweep.cjs");
const os = require("node:os");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const builder = path.join(__dirname, "build-proof.cjs");

function api() {
  assert.ok(fs.existsSync(builder), "finite-state proof builder must exist");
  const value = require(builder);
  assert.equal(typeof value.buildProof, "function");
  return value;
}

test("independent checker accepts serialized proof and rejects corrupted certificates", () => {
  const { buildProof, checkProof } = api();
  assert.equal(typeof checkProof, "function", "export an independent checker, not just a generator");
  const proof = buildProof({ commit: "checker-test" });
  const serialized = JSON.stringify(proof);
  assert.deepEqual(checkProof(JSON.parse(serialized)), { valid: true, ...proof.summary });
  const cases = [
    ["wrong successor", p => { p.states.find(r => !r.terminal).successor = "z42-h2"; }, /successor/i],
    ["wrong rank", p => { p.states.find(r => !r.terminal).rank++; }, /rank/i],
    ["missing state", p => { p.states.splice(100, 1); }, /domain|missing/i],
    ["duplicate state", p => { p.states.push(p.states[0]); }, /duplicate/i],
    ["wrong position", p => { p.states[0].human.x = 9; }, /position/i],
    ["noncanonical key", p => { p.states[0].key = "z00-h1"; }, /key/i],
    ["fractional rank", p => { p.states[0].rank = 0.5; }, /rank/i],
    ["negative rank", p => { p.states[0].rank = -1; }, /rank/i],
    ["wrong terminal flag", p => { p.states[0].terminal = !p.states[0].terminal; }, /terminal/i],
    ["terminal moves", p => { p.states.find(r => r.terminal).successor = "z42-h1"; }, /terminal/i],
    ["terminal nonzero rank", p => { p.states.find(r => r.terminal).rank = 1; }, /rank/i],
    ["wrong source", p => { p.metadata.simulationSha256 = "0".repeat(64); }, /source/i],
    ["wrong config", p => { p.config.width = 11; }, /config/i],
    ["wrong summary", p => { p.summary.cycles = 1; }, /summary/i]
  ];
  for (const [name, corrupt, error] of cases) {
    const modified = JSON.parse(serialized);
    corrupt(modified);
    assert.throws(() => checkProof(modified), error, name);
  }
  assert.equal(JSON.stringify(proof), serialized, "checking must not repair or mutate evidence");
});

test("CLI writes proof.json only, preserves preview files and propagates PREVIEW_COMMIT", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zombie-proof-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = path.join(dir, "preview");
  fs.mkdirSync(out);
  const preserved = { "positions.json": "existing positions\n", "sweep.json": "existing sweep\n", "index.html": "existing viewer\n" };
  for (const [file, text] of Object.entries(preserved)) fs.writeFileSync(path.join(out, file), text);
  const env = { ...process.env, PREVIEW_COMMIT: "cli-source<&>\u2028", PREVIEW_OUTPUT_DIR: path.join(dir, "ignored") };
  const run = () => spawnSync(process.execPath, [builder, "preview"], { cwd: dir, env, encoding: "utf8", timeout: 30000 });
  const first = run();
  assert.equal(first.status, 0, first.stderr || first.stdout);
  assert.ok(fs.existsSync(path.join(out, "proof.json")), "CLI must generate proof.json");
  assert.deepEqual(fs.readdirSync(out).sort(), [...Object.keys(preserved), "proof.json"].sort());
  for (const [file, text] of Object.entries(preserved)) assert.equal(fs.readFileSync(path.join(out, file), "utf8"), text);
  assert.equal(fs.existsSync(env.PREVIEW_OUTPUT_DIR), false, "explicit destination takes precedence");
  const bytes = fs.readFileSync(path.join(out, "proof.json"));
  assert.ok(bytes.length < 2_000_000, "complete certificate fits the 2 MB bound");
  const proof = JSON.parse(bytes);
  assert.equal(proof.metadata.commit, env.PREVIEW_COMMIT);
  assert.equal(proof.states.length, 4830);
  assert.equal(api().checkProof(proof).valid, true);
  assert.match(first.stdout, /4830/);
  assert.equal(run().status, 0);
  assert.deepEqual(fs.readFileSync(path.join(out, "proof.json")), bytes, "fixed source and metadata repeat byte-for-byte");
});

function loadProduction() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "simulation.js"), "utf8"), context, { timeout: 1000 });
  return context.ZombieLab;
}

test("graph and rank helpers close over a reachable overlapping terminal", () => {
  const { buildTransitionGraph, assignRanks } = api();
  assert.equal(typeof buildTransitionGraph, "function", "expose graph construction for closure tests");
  assert.equal(typeof assignRanks, "function");
  const production = loadProduction();
  // Synthetic override tests a branch not reached by current production findings.
  // The chosen moves are legal and resolved by the unchanged production resolver.
  const synthetic = { ...production, step(state) {
    if (state.human.x === 0 && state.human.y === 0 && state.zombie.x === 2 && state.zombie.y === 0) {
      return production.resolveTick(state, { human: { x: 1, y: 0 }, zombie: { x: 1, y: 0 } });
    }
    return production.step(state);
  } };
  const rows = assignRanks(buildTransitionGraph(synthetic));
  assert.equal(rows.length, 4831);
  const terminal = rows.find(row => row.key === "z1-h1");
  assert.ok(terminal);
  assert.equal(terminal.terminal, true);
  assert.equal(terminal.rank, 0);
  assert.equal(terminal.successor, null);
  const predecessor = rows.find(row => row.key === "z2-h0");
  assert.equal(predecessor.successor, terminal.key);
  assert.equal(predecessor.rank, 1);
  assert.deepEqual(terminal.human, terminal.zombie);
});

test("rank helper rejects cycles and missing successor states", () => {
  const { assignRanks } = api();
  assert.equal(typeof assignRanks, "function", "expose rank construction for cycle tests");
  assert.throws(() => assignRanks([{ key: "a", terminal: false, successor: "a" }]), /cycle/i);
  assert.throws(() => assignRanks([{ key: "a", terminal: false, successor: "b" }, { key: "b", terminal: false, successor: "a" }]), /cycle/i);
  assert.throws(() => assignRanks([{ key: "a", terminal: false, successor: "absent" }]), /missing successor/i);
});

test("builder rejects nonstring commit metadata", () => {
  for (const commit of [123, {}, []]) {
    assert.throws(() => api().buildProof({ commit }), /commit.*string/i);
  }
});

test("position is sufficient before cutoff, but the manual cap still stops a long witness", () => {
  const production = loadProduction();
  const source = path.join(__dirname, "..", "simulation.js");
  const before = fs.readFileSync(source);
  for (let z = 0; z < 70; z++) for (let h = 0; h < 70; h++) {
    if (h === z) continue;
    const start = { ...production.initialState(), tickLimit: 10000,
      human: { x: h % 10, y: Math.floor(h / 10) }, zombie: { x: z % 10, y: Math.floor(z / 10) } };
    const normalized = production.step(start);
    const later = production.step({ ...start, tick: 9998, reason: "irrelevant history", decisions: { human: "old", zombie: "old" } });
    assert.deepEqual(later.human, normalized.human);
    assert.deepEqual(later.zombie, normalized.zombie);
    assert.equal(later.status, normalized.status);
  }
  let state = { ...production.initialState(), human: { x: 2, y: 0 }, zombie: { x: 2, y: 4 } };
  assert.equal(state.tickLimit, 40);
  while (state.status === "running") state = production.step(state);
  assert.equal(state.status, "limit", "cutoff is not a claim of survival forever");
  assert.equal(state.tick, 40);
  assert.deepEqual(fs.readFileSync(source), before);
  assert.equal(createHash("sha256").update(before).digest("hex"), "4ee5817ba528b163fca1347c49ad4c48de2dcae226dd800065e5048b5b9bb568");
});

// One end-to-end certificate behavior, checked against independently run starts.
test("complete finite certificate gives the exact production capture time for every distinct start", () => {
  const proof = api().buildProof({ commit: "test-source" });
  assert.equal(proof.schemaVersion, 1);
  assert.equal(proof.metadata.commit, "test-source");
  assert.equal(proof.metadata.simulationSha256, "4ee5817ba528b163fca1347c49ad4c48de2dcae226dd800065e5048b5b9bb568");
  assert.equal(proof.config.width, 10);
  assert.equal(proof.config.height, 7);
  assert.equal(proof.config.safetyTickLimit, 10000);
  const expected = [];
  for (let z = 0; z < 70; z++) for (let h = 0; h < 70; h++) {
    if (h !== z) expected.push(`z${z}-h${h}`);
  }
  const distinct = proof.states.filter(row => row.humanId !== row.zombieId);
  assert.deepEqual(distinct.map(row => row.key), expected);
  assert.equal(distinct.length, 4830);
  const byKey = new Map(proof.states.map(row => [row.key, row]));
  assert.equal(byKey.size, proof.states.length, "no duplicate states");
  for (const row of proof.states) {
    assert.equal(row.key, `z${row.zombieId}-h${row.humanId}`);
    assert.deepEqual(row.human, { x: row.humanId % 10, y: Math.floor(row.humanId / 10) });
    assert.deepEqual(row.zombie, { x: row.zombieId % 10, y: Math.floor(row.zombieId / 10) });
    const distance = Math.abs(row.human.x - row.zombie.x) + Math.abs(row.human.y - row.zombie.y);
    assert.equal(row.terminal, distance <= 1);
    assert.ok(Number.isSafeInteger(row.rank) && row.rank >= 0);
    if (row.terminal) {
      assert.equal(row.rank, 0);
      assert.equal(row.successor, null);
    } else {
      assert.ok(byKey.has(row.successor), `closed successor for ${row.key}`);
      assert.equal(row.rank, byKey.get(row.successor).rank + 1, row.key);
    }
  }
  const sweep = buildSweep({ commit: "test-source" });
  for (const row of sweep.results) {
    assert.equal(row.outcome, "capture");
    assert.equal(byKey.get(row.id).rank, row.stopTick, row.id);
  }
  assert.equal(proof.summary.startCount, 4830);
  assert.equal(proof.summary.initialCapture, 246);
  assert.equal(proof.summary.sweepMatches, 4830);
  assert.equal(proof.summary.cycles, 0);
  assert.equal(proof.summary.maxRank, 77);
  assert.equal(Math.max(...distinct.map(row => row.rank)), 77);
  assert.equal(byKey.get("z60-h0").rank, 77, "explicit maximum witness H(0,0), Z(0,6)");
  assert.equal(proof.summary.maxRankStarts, 67);
  assert.equal(proof.summary.overlapTerminals, 0, "production reaches no overlap successors in this domain");
  assert.equal(byKey.get("z42-h1").rank, 11);
  assert.equal(byKey.get("z42-h2").rank, 73);
  assert.equal(byKey.get("z42-h27").rank, 73);
  assert.equal(byKey.get("z42-h26").rank, 73, "not every one-cell perturbation changes capture time");
});
