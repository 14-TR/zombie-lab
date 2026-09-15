"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const plain = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === "object") { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
function stateAt(human, z1, z2, extras = {}) {
  return { width: 10, height: 7, tick: 0, tickLimit: 10000,
    human: { x: human[0], y: human[1] }, zombies: [z1, z2].map(([x, y]) => ({ x, y })),
    status: "running", reason: "", ...extras };
}
function moves(human, z1, z2) {
  return { human: { x: human[0], y: human[1] }, zombies: [z1, z2].map(([x, y]) => ({ x, y })) };
}
function referenceChoice(state, horizon) {
  // Independent iterative leaf list; no production transitions or search helpers.
  const deltas = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]];
  const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const actions = point => deltas.map(([dx, dy], action) => ({ point: [point[0] + dx, point[1] + dy], action }))
    .filter(({ point: [x, y] }) => x >= 0 && x < state.width && y >= 0 && y < state.height);
  let frontier = [{ h: [state.human.x, state.human.y], zs: state.zombies.map(z => [z.x, z.y]), path: [], survived: 0 }];
  const leaves = [];
  for (let depth = 0; depth < horizon; depth++) {
    const nextLevel = [];
    for (const branch of frontier) {
      const zs = branch.zs.map(z => actions(z).sort((a, b) => manhattan(a.point, branch.h) - manhattan(b.point, branch.h))[0].point);
      for (const { point: h, action } of actions(branch.h)) {
        const separation = Math.min(...zs.map(z => manhattan(h, z)));
        const caught = separation <= 1;
        const child = { h, zs, first: branch.first || h, path: [...branch.path, action],
          survived: branch.survived + Number(!caught), separation };
        if (caught || depth + 1 === horizon) leaves.push(child);
        else nextLevel.push(child);
      }
    }
    frontier = nextLevel;
  }
  leaves.sort((a, b) => b.survived - a.survived || b.separation - a.separation || a.path.join("").localeCompare(b.path.join("")));
  const winner = leaves[0];
  return { human: { x: winner.first[0], y: winner.first[1] }, score: [winner.survived, winner.separation], path: winner.path, leaves };
}
function replay(pair, initial, policy, observe = () => {}) {
  let current = initial;
  const seen = new Map();
  for (;;) {
    observe(current);
    const distance = z => Math.abs(z.x - current.human.x) + Math.abs(z.y - current.human.y);
    if (current.status === "caught" || current.zombies.some(z => distance(z) <= 1)) {
      return { outcome: "capture", stopTick: current.tick, cycleStart: null, period: null };
    }
    const key = JSON.stringify([current.human, ...current.zombies]);
    if (seen.has(key)) return { outcome: "cycle", stopTick: current.tick, cycleStart: seen.get(key), period: current.tick - seen.get(key) };
    seen.set(key, current.tick);
    if (current.tick === initial.tickLimit) return { outcome: "unresolved", stopTick: current.tick, cycleStart: null, period: null };
    const next = pair.step(freeze(current), policy);
    assert.equal(next.tick, current.tick + 1);
    for (const [from, to] of [[current.human, next.human], ...current.zombies.map((z, i) => [z, next.zombies[i]])]) {
      assert.ok(Math.abs(from.x - to.x) + Math.abs(from.y - to.y) <= 1);
      assert.ok(to.x >= 0 && to.x < initial.width && to.y >= 0 && to.y < initial.height);
    }
    current = next;
  }
}
let built;
function dataset() { return built || (built = builder().buildTwoZombies({ commit: "test-source" })); }
function builder() {
  const filename = path.join(root, "scripts/build-two-zombies.cjs");
  assert.ok(fs.existsSync(filename), "Two-zombie build module exists");
  return require(filename);
}
function engine() {
  const filename = path.join(root, "two-zombies.js");
  assert.ok(fs.existsSync(filename), "Classic-script two-zombies.js exists");
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(filename, "utf8"), context, { filename, timeout: 1000 });
  return context.ZombiePair;
}
test("initialState exposes the frozen classic global and independent coordinates", () => {
  const pair = engine();
  assert.equal(typeof pair.initialState, "function");
  assert.deepEqual(plain(pair.initialState()), { width: 10, height: 7, tick: 0, tickLimit: 10000,
    human: { x: 7, y: 2 }, zombies: [{ x: 2, y: 4 }, { x: 2, y: 4 }], status: "running", reason: "" });
  const state = pair.initialState(0, 69);
  assert.deepEqual(plain(state.human), { x: 0, y: 0 });
  assert.deepEqual(plain(state.zombies), [{ x: 2, y: 4 }, { x: 9, y: 6 }]);
  const duplicate = pair.initialState();
  duplicate.zombies[0].x = 0;
  assert.equal(duplicate.zombies[1].x, 2);
  assert.equal(pair.initialState().zombies[0].x, 2);
});

test("resolveTick preserves simultaneous contact, legal overlap and terminal precedence", () => {
  const pair = engine();
  assert.equal(typeof pair.resolveTick, "function");
  const initialCases = [
    stateAt([2, 4], [2, 4], [9, 6]),
    stateAt([2, 3], [2, 4], [9, 6]),
    stateAt([9, 5], [2, 4], [9, 6], { tickLimit: 0 })
  ];
  for (const state of initialCases) {
    const next = pair.resolveTick(freeze(state), {});
    assert.equal(next.status, "caught");
    assert.equal(next.tick, 0);
  }
  // A legal one-cell exchange already starts adjacent: initial capture wins.
  const crossing = pair.resolveTick(stateAt([2, 3], [2, 4], [9, 6]), moves([2, 4], [2, 3], [9, 6]));
  assert.equal(crossing.status, "caught");
  assert.equal(crossing.tick, 0);
  const diagonal = stateAt([1, 1], [2, 2], [9, 6]);
  assert.equal(pair.resolveTick(diagonal, moves([1, 1], [2, 2], [9, 6])).status, "running");
  for (const nextMoves of [moves([2, 1], [2, 1], [9, 6]), moves([1, 1], [2, 1], [9, 6])]) {
    assert.equal(pair.resolveTick(diagonal, nextMoves).status, "caught");
  }
  const z2Capture = pair.resolveTick(stateAt([7, 6], [2, 4], [9, 6]), moves([8, 6], [2, 4], [8, 6]));
  assert.equal(z2Capture.status, "caught");
  const old = freeze(stateAt([7, 0], [2, 2], [4, 2]));
  const target = moves([8, 0], [3, 2], [3, 2]);
  const overlap = pair.resolveTick(old, freeze(target));
  assert.equal(overlap.status, "running");
  assert.deepEqual(plain(overlap.zombies), [{ x: 3, y: 2 }, { x: 3, y: 2 }]);
  assert.notEqual(overlap.zombies[0], overlap.zombies[1]);
  assert.notEqual(overlap.human, target.human);
  assert.deepEqual(plain(old), stateAt([7, 0], [2, 2], [4, 2]));
  const cap = pair.resolveTick({ ...diagonal, tickLimit: 1 }, moves([1, 1], [2, 2], [9, 6]));
  assert.equal(cap.status, "limit");
  assert.equal(cap.tick, 1);
  assert.equal(pair.resolveTick({ ...diagonal, tickLimit: 1 }, moves([2, 1], [2, 1], [9, 6])).status, "caught");
  assert.equal(pair.resolveTick({ ...diagonal, tickLimit: 0 }, {}).status, "limit");
  assert.equal(pair.resolveTick(cap, {}), cap);
  for (const target of [moves([-1, 1], [2, 2], [9, 6]), moves([1, 1], [4, 2], [9, 6]),
    moves([1, 1], [2, 2], [8, 5]), moves([1.5, 1], [2, 2], [9, 6])]) {
    assert.throws(() => pair.resolveTick(diagonal, target), /Illegal/);
  }
});

test("greedy maximizes nearest OLD zombie distance with cardinal ties and old-state chasing", () => {
  const pair = engine();
  assert.equal(typeof pair.chooseHuman, "function");
  assert.equal(typeof pair.step, "function");
  const start = freeze(stateAt([4, 3], [2, 3], [6, 3]));
  assert.deepEqual(plain(pair.chooseHuman(start, "greedy")), { x: 4, y: 2 });
  const next = pair.step(start, "greedy");
  assert.deepEqual(plain(next.human), { x: 4, y: 2 });
  assert.deepEqual(plain(next.zombies), [{ x: 3, y: 3 }, { x: 5, y: 3 }]);
  assert.equal(next.tick, 1);
  assert.equal(next.status, "running");
  assert.deepEqual(plain(start), stateAt([4, 3], [2, 3], [6, 3]));
  // Staying is legal and beats stepping toward either pursuer in this corner.
  assert.deepEqual(plain(pair.chooseHuman(stateAt([0, 0], [2, 0], [0, 2]), "greedy")), { x: 0, y: 0 });
  assert.deepEqual(plain(pair.chooseHuman(stateAt([0, 0], [2, 2], [9, 6]), "greedy")), { x: 0, y: 0 });
  assert.deepEqual(plain(pair.chooseHuman(stateAt([9, 6], [2, 4], [2, 4]), "greedy")), { x: 9, y: 6 });
  assert.deepEqual(plain(pair.chooseHuman(stateAt([0, 0], [0, 2], [0, 2]), "greedy")), { x: 1, y: 0 });
  assert.equal(pair.step(stateAt([2, 3], [2, 4], [9, 6]), "greedy").tick, 0);
  assert.equal(pair.step({ ...start, tickLimit: 0 }, "greedy").status, "limit");
  assert.throws(() => pair.chooseHuman(start, "unknown"), /policy/i);
  assert.throws(() => pair.step(start, "unknown"), /policy/i);
});

test("depth1 uses survival then predicted nearest endpoint distance, ignoring real remaining cap", () => {
  const pair = engine();
  assert.doesNotThrow(() => pair.chooseHuman(pair.initialState(), "depth1"));
  let tested = 0, capturedLeaves = 0, tiedLeaves = 0;
  for (let zid = 0; zid < 70; zid++) for (let hid = 0; hid < 70; hid++) {
    if (hid === 42 || hid === zid) continue;
    const state = pair.initialState(hid, zid);
    if (state.zombies.some(z => Math.abs(z.x - state.human.x) + Math.abs(z.y - state.human.y) <= 1)) continue;
    const reference = referenceChoice(state, 1);
    assert.deepEqual(plain(pair.chooseHuman(freeze(state), "depth1")), reference.human, `z${zid}-h${hid}`);
    assert.deepEqual(plain(pair.chooseHuman({ ...state, tick: 9999 }, "depth1")), reference.human);
    assert.deepEqual(plain(pair.chooseHuman({ ...state, tick: 0, tickLimit: 1 }, "depth1")), reference.human);
    assert.deepEqual(plain(pair.step(state, "depth1").human), reference.human);
    capturedLeaves += reference.leaves.filter(leaf => leaf.survived === 0).length;
    tiedLeaves += reference.leaves.filter(leaf => leaf.survived === reference.score[0] && leaf.separation === reference.score[1]).length > 1;
    tested++;
  }
  assert.ok(tested > 4000 && capturedLeaves > 0 && tiedLeaves > 0);
  assert.equal(pair.step(pair.initialState(32, 0), "depth1").tick, 0);
});

test("depth2 changes only horizon, stops captured branches and replans after each real tick", () => {
  const pair = engine();
  assert.doesNotThrow(() => pair.chooseHuman(pair.initialState(), "depth2"));
  let tested = 0, differentDepth = 0, immediateCaptured = 0, secondCaptured = 0;
  for (let zid = 0; zid < 70; zid++) for (let hid = 0; hid < 70; hid++) {
    if (hid === 42 || hid === zid) continue;
    const state = pair.initialState(hid, zid);
    if (state.zombies.some(z => Math.abs(z.x - state.human.x) + Math.abs(z.y - state.human.y) <= 1)) continue;
    const reference = referenceChoice(state, 2);
    assert.deepEqual(plain(pair.chooseHuman(freeze(state), "depth2")), reference.human, `z${zid}-h${hid}`);
    assert.deepEqual(plain(pair.chooseHuman({ ...state, tick: 9999 }, "depth2")), reference.human);
    assert.deepEqual(plain(pair.chooseHuman({ ...state, tick: 0, tickLimit: 1 }, "depth2")), reference.human);
    const next = pair.step(state, "depth2");
    assert.deepEqual(plain(next.human), reference.human);
    if (next.status === "running") assert.deepEqual(plain(pair.step(next, "depth2").human), referenceChoice(next, 2).human);
    differentDepth += JSON.stringify(reference.human) !== JSON.stringify(referenceChoice(state, 1).human);
    immediateCaptured += reference.leaves.filter(leaf => leaf.path.length === 1 && leaf.survived === 0).length;
    secondCaptured += reference.leaves.filter(leaf => leaf.path.length === 2 && leaf.survived === 1).length;
    tested++;
  }
  assert.ok(tested > 4000 && differentDepth > 0 && immediateCaptured > 0 && secondCaptured > 0);
  assert.equal(pair.step(pair.initialState(32, 0), "depth2").tick, 0);
  const state = pair.initialState();
  const choice = pair.chooseHuman(state, "depth2");
  choice.x = -20;
  assert.deepEqual(plain(pair.chooseHuman(state, "depth2")), referenceChoice(state, 2).human);
});

test("classifyRun keys BOTH ordered zombies and prioritizes capture then first repeat then cap", () => {
  const { classifyRun } = builder();
  assert.equal(typeof classifyRun, "function");
  const pair = engine();
  assert.deepEqual(classifyRun(pair, pair.initialState(32, 0), "greedy"),
    { outcome: "capture", stopTick: 0, cycleStart: null, period: null });
  // Synthetic bookkeeping-only policies: no inference about production outcomes.
  const route = [[9, 6], [8, 6], [8, 5], [9, 5]];
  const synthetic = { step(state) {
    const tick = state.tick + 1, [x, y] = route[tick % route.length];
    return { ...state, tick, zombies: [state.zombies[0], { x, y }], status: tick === state.tickLimit ? "limit" : "running" };
  } };
  const initial = stateAt([0, 0], [2, 4], [9, 6], { tickLimit: 4 });
  assert.deepEqual(classifyRun(synthetic, freeze(initial), "synthetic"),
    { outcome: "cycle", stopTick: 4, cycleStart: 0, period: 4 });
  assert.deepEqual(classifyRun(synthetic, { ...initial, tickLimit: 3 }, "synthetic"),
    { outcome: "unresolved", stopTick: 3, cycleStart: null, period: null });
  const swapped = { step(state) { return { ...state, tick: state.tick + 1, zombies: [...state.zombies].reverse() }; } };
  assert.deepEqual(classifyRun(swapped, initial, "synthetic"),
    { outcome: "cycle", stopTick: 2, cycleStart: 0, period: 2 });
  const captureAtRepeat = { step(state) { const next = synthetic.step(state); return { ...next, status: next.tick === 4 ? "caught" : "running" }; } };
  assert.deepEqual(classifyRun(captureAtRepeat, initial, "synthetic"),
    { outcome: "capture", stopTick: 4, cycleStart: null, period: null });
  const prefix = { step(state) {
    const tick = state.tick + 1;
    return { ...state, tick, zombies: [state.zombies[0], { x: tick % 2 ? 8 : 7, y: 6 }] };
  } };
  assert.deepEqual(classifyRun(prefix, initial, "synthetic"),
    { outcome: "cycle", stopTick: 3, cycleStart: 1, period: 2 });
  assert.deepEqual(classifyRun(pair, { ...initial, tickLimit: 0 }, "greedy"),
    { outcome: "unresolved", stopTick: 0, cycleStart: null, period: null });
  for (const tickLimit of [-1, 1.5, 10001, Infinity]) assert.throws(() => classifyRun(pair, { ...initial, tickLimit }, "greedy"), /limit/i);
  assert.throws(() => classifyRun({ step: s => s }, initial, "synthetic"), /progress/i);
  assert.throws(() => classifyRun(pair, { ...initial, zombies: [{ x: 20, y: 0 }, { x: 9, y: 6 }] }, "greedy"), /position/i);
});

test("buildTwoZombies covers all frozen ordered starts and all uncached trajectories", { timeout: 150000 }, () => {
  assert.equal(typeof builder().buildTwoZombies, "function");
  assert.throws(() => builder().buildTwoZombies({ commit: 42 }), /commit/i);
  const data = dataset(), pair = engine();
  const policies = ["greedy", "depth1", "depth2"];
  assert.deepEqual(Object.keys(data).sort(), ["schemaVersion", "metadata", "config", "summary", "results"].sort());
  assert.equal(data.schemaVersion, 1);
  assert.deepEqual(data.metadata, { commit: "test-source" });
  assert.deepEqual(data.config, { width: 10, height: 7, zombie1Id: 42, safetyTickLimit: 10000, policies, scope: "fixed-zombie1-slice" });
  const summary = { total: 0, initialCapture: 0, policies: Object.fromEntries(policies.map(p => [p, { capture: 0, cycle: 0, unresolved: 0 }])) };
  const ids = new Set();
  let index = 0, trajectories = 0, frames = 0;
  for (let zid = 0; zid < 70; zid++) for (let hid = 0; hid < 70; hid++) {
    if (hid === 42 || hid === zid) continue;
    const row = data.results[index++];
    assert.deepEqual(Object.keys(row).sort(), ["id", "humanId", "zombie2Id", "outcomes"].sort());
    assert.equal(row.id, `z2-${zid}-h${hid}`);
    assert.equal(row.humanId, hid);
    assert.equal(row.zombie2Id, zid);
    assert.deepEqual(Object.keys(row.outcomes), policies);
    ids.add(row.id);
    const state = pair.initialState(hid, zid);
    const initialContact = state.zombies.some(z => Math.abs(z.x - state.human.x) + Math.abs(z.y - state.human.y) <= 1);
    summary.initialCapture += Number(initialContact);
    for (const policy of policies) {
      const outcome = row.outcomes[policy];
      assert.deepEqual(Object.keys(outcome).sort(), ["outcome", "stopTick", "cycleStart", "period"].sort());
      assert.deepEqual(outcome, replay(pair, state, policy, () => { frames++; }), `${row.id}/${policy}`);
      assert.equal(outcome.stopTick === 0 && outcome.outcome === "capture", initialContact);
      assert.ok(Number.isInteger(outcome.stopTick) && outcome.stopTick <= 10000);
      if (outcome.outcome === "cycle") {
        assert.ok(outcome.cycleStart >= 0 && outcome.period > 0);
        assert.equal(outcome.period, outcome.stopTick - outcome.cycleStart);
      } else { assert.equal(outcome.cycleStart, null); assert.equal(outcome.period, null); }
      summary.policies[policy][outcome.outcome]++;
      trajectories++;
    }
    summary.total++;
  }
  assert.equal(index, 4761);
  assert.equal(data.results.length, 4761);
  assert.equal(ids.size, 4761);
  assert.equal(trajectories, 14283);
  assert.ok(frames >= trajectories);
  assert.deepEqual(data.summary, summary);
});

test("all 69 colocated-zombie starts reduce frame-for-frame to unchanged single-zombie controls", () => {
  const data = dataset(), pair = engine();
  const context = vm.createContext({});
  for (const file of ["simulation.js", "planner.js"]) vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file, timeout: 1000 });
  const oldClassify = require("./build-sweep.cjs").classifyStart;
  let controls = 0;
  for (const row of data.results.filter(row => row.zombie2Id === 42)) {
    const initial = pair.initialState(row.humanId, 42);
    for (const [policy, old] of [["greedy", context.ZombieLab], ["depth2", context.ZombiePlanner]]) {
      let single = { ...context.ZombieLab.initialState(), tickLimit: 10000, human: { ...initial.human } };
      assert.deepEqual(plain(oldClassify(old, single)), row.outcomes[policy]);
      replay(pair, initial, policy, frame => {
        assert.equal(single.tick, frame.tick);
        assert.deepEqual(plain(single.human), plain(frame.human));
        assert.deepEqual(plain(single.zombie), plain(frame.zombies[0]));
        assert.deepEqual(plain(single.zombie), plain(frame.zombies[1]));
        assert.equal(single.status, frame.status);
        if (frame.tick < row.outcomes[policy].stopTick) single = old.step(single);
      });
      controls++;
    }
  }
  assert.equal(controls, 138);
});

test("CLI writes only the two artifacts, preserves neighbors and safely escapes metadata", { timeout: 130000 }, () => {
  const os = require("node:os"), { spawnSync } = require("node:child_process");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "zl009-cli-test-"));
  const commit = "</script><script>bad()</script>&\u2028\u2029";
  fs.writeFileSync(path.join(out, "sentinel.txt"), "leave untouched");
  try {
    const run = spawnSync(process.execPath, [path.join(root, "scripts/build-two-zombies.cjs"), out],
      { cwd: root, env: { ...process.env, PREVIEW_COMMIT: commit }, encoding: "utf8", timeout: 125000 });
    assert.equal(run.status, 0, run.stderr || String(run.error || ""));
    assert.deepEqual(fs.readdirSync(out).sort(), ["sentinel.txt", "two-zombies-data.js", "two-zombies.json"]);
    assert.equal(fs.readFileSync(path.join(out, "sentinel.txt"), "utf8"), "leave untouched");
    const json = fs.readFileSync(path.join(out, "two-zombies.json"), "utf8");
    const script = fs.readFileSync(path.join(out, "two-zombies-data.js"), "utf8");
    assert.ok(!/[<>&\u2028\u2029]/.test(script));
    const context = vm.createContext({});
    vm.runInContext(script, context, { timeout: 1000 });
    const decoded = JSON.parse(json);
    assert.equal(decoded.metadata.commit, commit);
    assert.deepEqual(plain(context.ZombiePairData), decoded);
    assert.deepEqual(decoded.results, dataset().results);
    const metrics = JSON.parse(run.stdout);
    assert.equal(metrics.outputBytes, Buffer.byteLength(json) + Buffer.byteLength(script));
    assert.ok(metrics.elapsedMs > 0 && metrics.maxRSSKiB > 0 && metrics.currentRSSBytes > 0);
    assert.deepEqual(metrics.summary, decoded.summary);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
});
