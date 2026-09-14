"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const root = path.resolve(__dirname, "..");
function load() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, "simulation.js"), "utf8"), context);
  const file = path.join(root, "sweep-view.js");
  assert.ok(fs.existsSync(file), "selected-row replay must be implemented");
  vm.runInContext(fs.readFileSync(file, "utf8"), context);
  return context;
}
const config = { width: 10, height: 7, safetyTickLimit: 10000, captureRule: "orthogonal-adjacency", excluded: "same-cell starts" };
function row(zombieId, humanId, outcome, stopTick, cycleStart = null, period = null) {
  return { id: `z${zombieId}-h${humanId}`, zombieId, humanId, outcome, stopTick, cycleStart, period };
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }
test("selected orthogonally adjacent starts preserve one production-normalized tick-zero frame", () => {
  const context = load();
  const result = context.ZombieSweepView.replayRow(row(0, 1, "capture", 0), config, context.ZombieLab);
  assert.equal(result.frames.length, 1);
  assert.equal(result.frames[0].tick, 0);
  assert.equal(result.frames[0].status, "caught");
  assert.equal(result.outcome, "capture");
  assert.deepEqual(plain(result.frames[0].human), { x: 1, y: 0 });
});
test("selected baseline follows every actual production step through its stopping endpoint", () => {
  const context = load(), production = context.ZombieLab;
  const result = context.ZombieSweepView.replayRow(row(42, 27, "capture", 73), config, production);
  assert.equal(result.frames.length, 74);
  let state = { ...production.initialState(), tickLimit: 10000 };
  for (const frame of result.frames) {
    assert.deepEqual(plain(frame), plain(state));
    state = production.step(state);
  }
  assert.deepEqual(plain(result.frames.at(-1).human), { x: 0, y: 6 });
  assert.deepEqual(plain(result.frames.at(-1).zombie), { x: 1, y: 6 });
  assert.equal(result.stopTick, 73);
});
test("replay rejects a row whose outcome, endpoint tick or cycle fields disagree", () => {
  const context = load();
  for (const bad of [row(0, 1, "cycle", 0), row(0, 1, "capture", 1), row(0, 1, "capture", 0, 0, 2)]) {
    assert.throws(() => context.ZombieSweepView.replayRow(bad, config, context.ZombieLab), /mismatch/i);
  }
});
test("diagonal starts are not tick-zero capture and cutoff keeps the moving endpoint", () => {
  const context = load();
  const result = context.ZombieSweepView.replayRow(row(0, 4, "unresolved", 1), { ...config, width: 3, height: 3, safetyTickLimit: 1 }, context.ZombieLab);
  assert.equal(result.frames.length, 2);
  assert.equal(result.frames[0].status, "running");
  assert.equal(result.frames[1].tick, 1);
  assert.equal(result.frames[1].status, "limit");
  assert.deepEqual(plain(result.frames[1].human), { x: 2, y: 1 });
});
// Small synthetic, fully enumerated 2×2 fixture; no engine or bulk sweep needed.
function fixture() {
  const results = [];
  for (let z = 0; z < 4; z++) for (let h = 0; h < 4; h++) if (h !== z) {
    const adjacent = Math.abs(h % 2 - z % 2) + Math.abs(Math.floor(h / 2) - Math.floor(z / 2)) === 1;
    results.push(row(z, h, "capture", adjacent ? 0 : 1));
  }
  return { schemaVersion: 1, metadata: { commit: "synthetic-ui-fixture" }, config: { ...config, width: 2, height: 2 }, summary: { total: 12, capture: 12, cycle: 0, unresolved: 0, initialCapture: 8 }, results };
}
test("index exposes every human start for each zombie without executing trajectories", () => {
  const context = load(), data = fixture();
  context.ZombieLab = { step() { throw new Error("no bulk replay"); } };
  const model = context.ZombieSweepView.indexData(data);
  assert.equal(model.byZombie.length, 4);
  for (let z = 0; z < 4; z++) for (let h = 0; h < 4; h++) {
    assert.equal(model.byZombie[z][h]?.id, h === z ? undefined : `z${z}-h${h}`);
  }
  assert.deepEqual(data, fixture(), "index leaves generated data unchanged");
  for (const mutate of [d => d.results.pop(), d => d.results[1] = d.results[0], d => d.summary.capture++, d => d.results[0].id = "z00-h1"]) {
    const bad = fixture(); mutate(bad);
    assert.throws(() => context.ZombieSweepView.indexData(bad), /invalid|mismatch|duplicate/i);
  }
});
test("runner preserves first-repeat endpoint and capture/cycle priority at the safety boundary", () => {
  const context = load(), production = context.ZombieLab;
  // Synthetic stepper isolates adjudication; movement correctness uses production above.
  const repeated = { initialState: production.initialState, step: state => ({ ...state, tick: state.tick + 1, status: "limit" }) };
  const run = context.ZombieSweepView.replayRow(row(0, 22, "cycle", 1, 0, 1), { ...config, safetyTickLimit: 1 }, repeated);
  assert.equal(run.frames.length, 2);
  assert.equal(run.frames.at(-1).status, "limit");
  assert.equal(run.cycleStart, 0);
  const captured = { ...repeated, step: state => ({ ...state, tick: state.tick + 1, status: "caught" }) };
  assert.equal(context.ZombieSweepView.replayRow(row(0, 22, "capture", 1), { ...config, safetyTickLimit: 1 }, captured).outcome, "capture");
});
test("selected replay rejects unknown production statuses and premature terminal limits", () => {
  const context = load();
  for (const [status, safety] of [["unknown", 1], ["limit", 2]]) {
    const production = { initialState: context.ZombieLab.initialState, step: state => ({ ...state, tick: 1, human: { x: 8, y: 2 }, status }) };
    assert.throws(() => context.ZombieSweepView.replayRow(row(42, 27, "unresolved", 1), { ...config, safetyTickLimit: safety }, production), /status|premature/i);
  }
});
test("offline explorer keeps classic script order and provides selection, playback and complete history", () => {
  const file = path.join(root, "sweep.html");
  assert.ok(fs.existsSync(file), "explorer HTML must exist");
  const html = fs.readFileSync(file, "utf8");
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]), ["./simulation.js", "./sweep-data.js", "./sweep-view.js"]);
  assert.doesNotMatch(html, /type="module"|https?:\/\//);
  for (const id of ["heatmap", "zombie-start", "human-start", "summary", "legend", "metadata", "error", "world", "play", "pause", "back", "next", "scrubber", "positions", "readout", "match"]) assert.ok(html.includes(`id="${id}"`), id);
});
