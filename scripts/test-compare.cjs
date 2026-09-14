"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const root = path.resolve(__dirname, "..");
const frozen = () => JSON.parse(fs.readFileSync(path.join(root, "evidence/all-starts/sweep.json"), "utf8"));
function load() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, "simulation.js"), "utf8"), context);
  const file = path.join(root, "compare-view.js");
  assert.ok(fs.existsSync(file), "comparison logic must exist");
  vm.runInContext(fs.readFileSync(file, "utf8"), context);
  return { api: context.ZombieCompare, production: context.ZombieLab };
}
test("indexes every frozen scalar row without running trajectories or mutating data", () => {
  const { api } = load(), data = frozen(), before = JSON.stringify(data);
  const model = api.indexData(data);
  assert.equal(model.byZombie.length, 70);
  assert.equal(model.data.summary.capture, 4830);
  for (const row of data.results) assert.equal(model.byZombie[row.zombieId][row.humanId], row);
  for (let id = 0; id < 70; id++) assert.equal(model.byZombie[id][id], null);
  assert.equal(JSON.stringify(data), before);
});
test("rejects missing, malformed, duplicate, noncapture or inconsistent frozen rows safely", () => {
  const { api } = load();
  for (const mutate of [d => d.results.pop(), d => d.results[1] = d.results[0],
    d => d.results[0] = null, d => d.results[0].id = "z00-h1", d => d.results[0].humanId = -1,
    d => d.results[0].stopTick = NaN, d => d.results[0].stopTick = 10001,
    d => d.results[0].cycleStart = 0, d => d.results[0].outcome = "cycle",
    d => d.summary.capture--, d => d.config.width = 0, d => d.config.safetyTickLimit = Infinity,
    d => d.config.captureRule = "diagonal", d => d.metadata = null, d => d.schemaVersion = 9]) {
    const data = frozen(); mutate(data);
    assert.throws(() => api.indexData(data), /Invalid sweep data/i);
  }
  for (const data of [null, undefined, {}, { config: {} }]) assert.throws(() => api.indexData(data), /Invalid sweep data/i);
});
test("one-cell sensitivity and witnesses match an independent exhaustive cardinal-neighbor scan", () => {
  const { api } = load(), model = api.indexData(frozen());
  assert.equal(typeof api.slice, "function", "scalar sensitivity API must exist");
  let checked = 0;
  for (let z = 0; z < 70; z++) {
    const slice = api.slice(model, z);
    assert.equal(slice.cells[z], null);
    for (const row of model.byZombie[z].filter(Boolean)) {
      const neighbors = model.byZombie[z].filter(other => other &&
        Math.abs(other.humanId % 10 - row.humanId % 10) + Math.abs(Math.floor(other.humanId / 10) - Math.floor(row.humanId / 10)) === 1);
      const ranked = neighbors.map(other => ({ id: other.humanId, delta: Math.abs(row.stopTick - other.stopTick) })).sort((a, b) => b.delta - a.delta || a.id - b.id);
      const cell = slice.cells[row.humanId];
      assert.equal(cell.stopTick, row.stopTick);
      assert.equal(cell.sensitivity, ranked[0].delta);
      assert.equal(cell.witnessId, ranked[0].id, "ties use smallest neighbor ID");
      checked++;
    }
    assert.equal(slice.maxTick, Math.max(...model.byZombie[z].filter(Boolean).map(r => r.stopTick)));
    assert.equal(slice.maxSensitivity, Math.max(...slice.cells.filter(Boolean).map(c => c.sensitivity)));
  }
  assert.equal(checked, 4830);
  for (const z of [-1, 70, NaN, "42"]) assert.throws(() => api.slice(model, z), /Invalid zombie/i);
});
test("synchronized production A/B replay holds tick 11 while the shared timeline reaches 73", () => {
  const { api, production } = load(), model = api.indexData(frozen());
  assert.equal(typeof api.compare, "function", "comparison replay API must exist");
  const pair = api.compare(model, 42, 1, 2, production);
  assert.equal(pair.a.stopTick, 11); assert.equal(pair.b.stopTick, 73);
  assert.equal(pair.maxTick, 73);
  for (const [run, humanId] of [[pair.a, 1], [pair.b, 2]]) {
    let state = { ...production.initialState(), human: { x: humanId, y: 0 }, tickLimit: 10000 };
    for (const frame of run.frames) {
      assert.equal(JSON.stringify(frame), JSON.stringify(state));
      state = production.step(state);
    }
    assert.equal(run.frames.length, run.stopTick + 1);
  }
  for (let tick = 0; tick <= 73; tick++) {
    const view = api.atTick(pair, tick);
    assert.equal(view.sharedTick, tick);
    assert.equal(view.a.localTick, Math.min(11, tick));
    assert.equal(view.b.localTick, tick);
    assert.equal(view.a.frozen, tick > 11);
    assert.equal(view.a.frame, pair.a.frames[Math.min(11, tick)]);
    assert.equal(view.a.separation, Math.abs(view.a.frame.human.x - view.a.frame.zombie.x) + Math.abs(view.a.frame.human.y - view.a.frame.zombie.y));
  }
  assert.equal(api.atTick(pair, 100).sharedTick, 73);
  assert.equal(api.atTick(pair, -1).sharedTick, 0);
  for (const tick of [NaN, Infinity, 1.5, "2"]) assert.throws(() => api.atTick(pair, tick), /Invalid tick/i);
  const adjacent = api.compare(model, 0, 1, 10, production);
  assert.equal(adjacent.maxTick, 0); assert.equal(adjacent.a.frames[0].status, "caught");
  for (const ids of [[42,42,2], [42,1,70], [NaN,1,2], [42,1,null]]) assert.throws(() => api.compare(model, ...ids, production), /Invalid.*start/i);
  const bad = frozen(); bad.results.find(r => r.id === "z42-h1").stopTick++;
  assert.throws(() => api.compare(api.indexData(bad), 42, 1, 2, production), /Replay mismatch/i);
  assert.throws(() => api.compare(model, 42, 1, 2, null), /Missing production/i);
});
test("standalone classic page exposes accessible comparison controls and source links without auto-mounting sweep", () => {
  const file = path.join(root, "compare.html");
  assert.ok(fs.existsSync(file), "standalone comparison page must exist");
  const html = fs.readFileSync(file, "utf8");
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]), ["./simulation.js", "./sweep-data.js", "./compare-view.js"]);
  assert.doesNotMatch(html, /type="module"|https?:\/\/|<script[^>]*src="[^.]/);
  for (const id of ["compare-app", "zombie-start", "human-a", "human-b", "play", "pause", "next", "reset", "scrubber", "timeline", "world-a", "world-b", "readout-a", "readout-b", "history-a", "history-b", "capture-map", "sensitivity-map", "capture-legend", "sensitivity-legend", "witness", "use-witness", "map-target", "metadata", "error", "match"]) assert.ok(html.includes(`id="${id}"`), id);
  for (const link of ["./sweep.html", "./proof.json", "./experiments/ZL-007-start-position-effects.md"]) assert.ok(html.includes(`href="${link}"`), link);
  assert.match(html, /maximum absolute/i);
  assert.match(html, /future/i);
});
