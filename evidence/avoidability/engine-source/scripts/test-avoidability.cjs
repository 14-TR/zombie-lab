"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const root = path.resolve(__dirname, "..");
const plain = value => JSON.parse(JSON.stringify(value));
const cell = p => p.y * 10 + p.x;
const indexOf = (h, z1, z2) => (z1 * 70 + z2) * 70 + h;
const point = id => ({ x: id % 10, y: Math.floor(id / 10) });
const deltas = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]];
function builder() {
  const file = path.join(__dirname, "build-avoidability.cjs");
  assert.ok(fs.existsSync(file), "Exact avoidability builder exists");
  return require(file);
}
function engine() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, "two-zombies.js"), "utf8"), context, { timeout: 1000 });
  return context.ZombiePair;
}
let solved;
function graph() { return solved || (solved = builder().solveGraph()); }

test("solveGraph covers every ordered position and legal production action with typed storage", { timeout: 840000 }, () => {
  const g = graph(), pair = engine();
  assert.ok(g.successors instanceof Int32Array);
  assert.ok(g.terminals instanceof Uint8Array);
  assert.equal(g.successors.length, 343000 * 5);
  assert.equal(g.terminals.length, 343000);
  let terminalCount = 0, actionCount = 0;
  for (let z1 = 0; z1 < 70; z1++) for (let z2 = 0; z2 < 70; z2++) for (let h = 0; h < 70; h++) {
    const index = indexOf(h, z1, z2), human = point(h), zombies = [point(z1), point(z2)];
    const terminal = zombies.some(z => Math.abs(z.x - human.x) + Math.abs(z.y - human.y) <= 1);
    assert.equal(g.terminals[index], Number(terminal));
    terminalCount += Number(terminal);
    for (let action = 0; action < 5; action++) {
      const [dx, dy] = deltas[action], x = human.x + dx, y = human.y + dy;
      const legal = !terminal && x >= 0 && x < 10 && y >= 0 && y < 7;
      const next = g.successors[index * 5 + action];
      assert.equal(next >= 0, legal, `${index}/${action} legal coverage`);
      if (legal) { assert.ok(next < 343000); actionCount++; }
    }
  }
  // Deliberately include diagonal, corner, edge, colocated and ordered-swap cases.
  for (const [h, z1, z2] of [[0, 20, 20], [11, 22, 69], [69, 42, 42], [34, 32, 36], [34, 36, 32], [0, 2, 20]]) {
    const state = { ...pair.initialState(), human: point(h), zombies: [point(z1), point(z2)] };
    const old = plain(state), zombieMoves = pair.step(state, "greedy").zombies;
    for (let action = 0; action < 5; action++) {
      const successor = g.successors[indexOf(h, z1, z2) * 5 + action];
      if (successor < 0) continue;
      const [dx, dy] = deltas[action], human = { x: state.human.x + dx, y: state.human.y + dy };
      const next = pair.resolveTick(state, { human, zombies: zombieMoves });
      assert.equal(successor, indexOf(cell(next.human), cell(next.zombies[0]), cell(next.zombies[1])));
      assert.equal(g.terminals[successor], Number(next.status === "caught"));
    }
    assert.deepEqual(plain(state), old);
  }
  assert.equal(g.summary.stateCount, 343000);
  assert.equal(g.summary.terminalStates, terminalCount);
  assert.equal(g.summary.legalActionCount, actionCount);
  assert.ok(g.resources.typedArrayBytes < 512 * 1024 * 1024);
  assert.ok(g.resources.maxRSSKiB * 1024 < 512 * 1024 * 1024);
});

test("controlled ranks use ALL successors, maximum delay, cycle closure and first tied action", () => {
  assert.equal(typeof builder().assignControlledRanks, "function");
  // Synthetic graph only: duplicates test per-action predecessor accounting.
  const successors = new Int32Array(8 * 5).fill(-1), terminals = new Uint8Array(8);
  terminals[0] = 1;
  for (const [s, a, next] of [[1, 1, 0], [2, 0, 0], [2, 2, 1], [2, 3, 1],
    [3, 0, 0], [3, 4, 3], [4, 1, 3], [4, 2, 4], [5, 0, 2], [5, 4, 4],
    [6, 0, 1], [6, 1, 2], [7, 0, 6]]) successors[s * 5 + a] = next;
  const assigned = builder().assignControlledRanks({ successors, terminals });
  assert.deepEqual([...assigned.ranks], [0, 1, 2, -1, -1, -1, 3, 4]);
  assert.deepEqual([...assigned.chosenActions], [-1, 1, 2, 4, 1, 4, 1, 0]);
  assert.throws(() => builder().assignControlledRanks({ successors: new Int32Array(4), terminals }), /domain|length/i);
  const bad = successors.slice(); bad[5] = 8;
  assert.throws(() => builder().assignControlledRanks({ successors: bad, terminals }), /successor|domain/i);
  const noAction = successors.slice(); noAction.fill(-1, 5, 10);
  assert.throws(() => builder().assignControlledRanks({ successors: noAction, terminals }), /action/i);
});

test("complete graph ranks certify contact iff zero and the exact maximum-delay Bellman law", () => {
  const g = graph();
  assert.ok(g.ranks instanceof Int32Array);
  assert.ok(g.chosenActions instanceof Int8Array);
  assert.equal(g.ranks.length, 343000);
  assert.equal(g.chosenActions.length, 343000);
  let winning = 0, losing = 0, maxRank = 0, verifiedActions = 0;
  const histogram = {};
  for (let s = 0; s < 343000; s++) {
    const rank = g.ranks[s];
    assert.ok(rank >= -1 && rank < 343000);
    assert.equal(rank === 0, g.terminals[s] === 1);
    if (rank === -1) winning++;
    else { losing++; histogram[rank] = (histogram[rank] || 0) + 1; maxRank = Math.max(maxRank, rank); }
    if (rank === 0) { assert.equal(g.chosenActions[s], -1); continue; }
    let first = -1, maximum = -1;
    for (let a = 0; a < 5; a++) {
      const next = g.successors[s * 5 + a];
      if (next < 0) continue;
      verifiedActions++;
      const nr = g.ranks[next];
      if (rank === -1) { if (nr === -1 && first < 0) first = a; }
      else {
        assert.ok(nr >= 0 && nr < rank, `rank descends under every action: ${s}/${a}`);
        if (nr > maximum) { maximum = nr; first = a; }
      }
    }
    assert.ok(first >= 0);
    assert.equal(g.chosenActions[s], first, `first tied certified action ${s}`);
    if (rank > 0) assert.equal(rank, maximum + 1);
  }
  assert.equal(winning + losing, 343000);
  assert.equal(g.summary.winningStates, winning);
  assert.equal(g.summary.losingStates, losing);
  assert.equal(g.summary.maxRank, maxRank);
  assert.deepEqual(g.summary.rankHistogram, histogram);
  assert.equal(verifiedActions, g.summary.legalActionCount);
});

test("internal certificate checks reject incomplete, corrupted and noncanonical strategies", () => {
  assert.equal(typeof builder().verifyGraph, "function");
  const g = graph(), checked = builder().verifyGraph(g);
  assert.equal(checked.valid, true);
  assert.equal(checked.states, 343000);
  assert.equal(checked.actions, g.summary.legalActionCount);
  assert.throws(() => builder().verifyGraph({ ...g, ranks: g.ranks.subarray(1) }), /domain|length/i);
  const terminal = g.ranks.findIndex(rank => rank === 0), finite = g.ranks.findIndex(rank => rank > 0);
  const winning = g.ranks.findIndex(rank => rank === -1);
  for (const [index, value] of [[terminal, -1], [finite, 0], [finite, g.ranks[finite] + 1], [winning, 1]]) {
    const ranks = g.ranks.slice(); ranks[index] = value;
    assert.throws(() => builder().verifyGraph({ ...g, ranks }), /rank|terminal|winning/i);
  }
  const chosenActions = g.chosenActions.slice(); chosenActions[winning] = -1;
  assert.throws(() => builder().verifyGraph({ ...g, chosenActions }), /action|strategy/i);
  const successors = g.successors.slice(); successors[winning * 5 + g.chosenActions[winning]] = 343000;
  assert.throws(() => builder().verifyGraph({ ...g, successors }), /successor|domain/i);
  assert.equal(g.verification.valid, true);
});

test("certified traces replay actual production to first recurrence or rank-exact capture", () => {
  assert.equal(typeof builder().traceStrategy, "function");
  const g = graph(), pair = engine();
  const starts = [g.ranks.findIndex(r => r === 0), g.ranks.findIndex(r => r > 0),
    g.ranks.findIndex(r => r === g.summary.maxRank), g.ranks.findIndex(r => r === -1)];
  for (const index of starts) {
    const trace = builder().traceStrategy(g, index), seen = new Map();
    assert.equal(trace.frames.length, trace.stopTick + 1);
    let state = { ...pair.initialState(), human: point(index % 70),
      zombies: [point(Math.floor(index / 4900)), point(Math.floor(index / 70) % 70)], tickLimit: Infinity };
    for (let tick = 0; tick <= trace.stopTick; tick++) {
      const frame = trace.frames[tick], currentIndex = indexOf(cell(state.human), cell(state.zombies[0]), cell(state.zombies[1]));
      assert.deepEqual(frame, plain({ human: state.human, zombie1: state.zombies[0], zombie2: state.zombies[1], tick }));
      const contact = state.zombies.some(z => Math.abs(z.x - state.human.x) + Math.abs(z.y - state.human.y) <= 1);
      if (tick === trace.stopTick) {
        if (trace.outcome === "capture") {
          assert.ok(contact); assert.equal(tick, g.ranks[index]);
          assert.equal(trace.cycleStart, null); assert.equal(trace.cyclePeriod, null);
        } else {
          assert.equal(trace.outcome, "cycle"); assert.equal(g.ranks[index], -1);
          assert.equal(contact, false); assert.equal(trace.cycleStart, seen.get(currentIndex));
          assert.equal(trace.cyclePeriod, tick - trace.cycleStart);
        }
        break;
      }
      assert.equal(contact, false); assert.equal(seen.has(currentIndex), false); seen.set(currentIndex, tick);
      const action = g.chosenActions[currentIndex], [dx, dy] = deltas[action];
      state = pair.resolveTick(state, { human: { x: state.human.x + dx, y: state.human.y + dy }, zombies: pair.step(state, "greedy").zombies });
    }
  }
  for (const index of [-1, 343000, 1.5]) assert.throws(() => builder().traceStrategy(g, index), /index|domain/i);
  const index = starts[3], successors = g.successors.slice();
  successors[index * 5 + g.chosenActions[index]] = starts[0];
  assert.throws(() => builder().traceStrategy({ ...g, successors }, index), /transition|successor/i);
});

let built;
function dataset() { return built || (built = builder().buildAvoidability({ commit: "test-source" })); }
test("buildAvoidability preserves all 4761 legacy rows and separates impossibility from policy failures", { timeout: 840000 }, () => {
  assert.equal(typeof builder().buildAvoidability, "function");
  assert.throws(() => builder().buildAvoidability({ commit: 42 }), /commit/i);
  const data = dataset(), g = graph();
  const legacy = require("./build-two-zombies.cjs").buildTwoZombies({ commit: "legacy-reference" });
  assert.equal(data.schemaVersion, 1); assert.equal(data.metadata.commit, "test-source");
  assert.deepEqual(Object.keys(data).sort(), ["schemaVersion", "metadata", "summary", "results", "witnesses"].sort());
  const { createHash } = require("node:crypto");
  for (const file of ["two-zombies.js", "scripts/build-two-zombies.cjs", "scripts/build-avoidability.cjs", "experiments/ZL-010-protocol.md"]) {
    assert.equal(data.metadata.sourceHashes[file], createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex"));
  }
  const stats = { total: 0, initialContact: 0, noninitialUnavoidable: 0, avoidable: 0 };
  const policies = ["greedy", "depth1", "depth2"], computed = {};
  for (const p of policies) computed[p] = { capture: 0, cycle: 0, unresolved: 0, avoidableCaptures: 0, unavoidableCaptures: 0,
    initialContactCaptures: 0, noninitialUnavoidableCaptures: 0, captureDelayShortfall: { capturedStarts: 0, noninitialCapturedStarts: 0,
      positiveStarts: 0, totalTicks: 0, maxTicks: 0, meanTicks: null, noninitialMeanTicks: null, histogram: {}, maxShortfallIds: [] } };
  assert.equal(data.results.length, 4761); assert.equal(new Set(data.results.map(r => r.id)).size, 4761);
  for (let i = 0; i < legacy.results.length; i++) {
    const old = legacy.results[i], row = data.results[i], rank = g.ranks[indexOf(old.humanId, 42, old.zombie2Id)];
    assert.deepEqual(row, { id: old.id, human: point(old.humanId), zombie1: point(42), zombie2: point(old.zombie2Id),
      stateIndex: indexOf(old.humanId, 42, old.zombie2Id), avoidable: rank === -1, maxCaptureTicks: rank === -1 ? null : rank, policies: old.outcomes });
    stats.total++; stats.initialContact += Number(rank === 0); stats.noninitialUnavoidable += Number(rank > 0); stats.avoidable += Number(rank === -1);
    for (const p of policies) {
      const outcome = row.policies[p], stat = computed[p], short = stat.captureDelayShortfall;
      stat[outcome.outcome]++;
      if (outcome.outcome !== "capture") { assert.equal(rank, -1); continue; }
      if (rank === -1) { stat.avoidableCaptures++; continue; }
      stat.unavoidableCaptures++; stat.initialContactCaptures += Number(rank === 0); stat.noninitialUnavoidableCaptures += Number(rank > 0);
      const delta = rank - outcome.stopTick; assert.ok(delta >= 0);
      short.capturedStarts++; short.noninitialCapturedStarts += Number(rank > 0); short.positiveStarts += Number(delta > 0);
      short.totalTicks += delta; short.histogram[delta] = (short.histogram[delta] || 0) + 1;
      if (delta > short.maxTicks) { short.maxTicks = delta; short.maxShortfallIds = [row.id]; }
      else if (delta > 0 && delta === short.maxTicks) short.maxShortfallIds.push(row.id);
    }
  }
  for (const p of policies) {
    const short = computed[p].captureDelayShortfall;
    short.meanTicks = short.capturedStarts ? short.totalTicks / short.capturedStarts : null;
    short.noninitialMeanTicks = short.noninitialCapturedStarts ? short.totalTicks / short.noninitialCapturedStarts : null;
    assert.deepEqual(data.summary.policies[p], computed[p]);
  }
  for (const [key, value] of Object.entries(stats)) assert.equal(data.summary[key], value);
  assert.equal(stats.initialContact + stats.noninitialUnavoidable + stats.avoidable, 4761);
  assert.deepEqual(data.summary.graph, g.summary);
});

test("all 30 depth disagreements identify the first actual action divergence and successor ranks", () => {
  const data = dataset(), disagreements = data.results.filter(row => row.policies.depth1.outcome !== row.policies.depth2.outcome);
  assert.equal(disagreements.length, 30);
  assert.ok(data.summary.depthDisagreements, "Disagreement analysis is present");
  const analysis = data.summary.depthDisagreements, g = graph(), pair = engine();
  assert.equal(analysis.total, 30); assert.equal(analysis.cases.length, 30);
  assert.equal(analysis.avoidable, disagreements.filter(r => r.avoidable).length);
  assert.equal(analysis.unavoidable, disagreements.filter(r => !r.avoidable).length);
  assert.equal(analysis.depth1CaptureDepth2Cycle, 15); assert.equal(analysis.depth1CycleDepth2Capture, 15);
  for (let i = 0; i < 30; i++) {
    const row = disagreements[i], record = analysis.cases[i];
    assert.equal(record.id, row.id); assert.equal(record.avoidable, row.avoidable); assert.equal(record.maxCaptureTicks, row.maxCaptureTicks);
    assert.deepEqual(record.depth1, row.policies.depth1); assert.deepEqual(record.depth2, row.policies.depth2);
    let a = pair.initialState(cell(row.human), cell(row.zombie2)), b = pair.initialState(cell(row.human), cell(row.zombie2));
    let found = false;
    for (let tick = 0; tick < Math.min(row.policies.depth1.stopTick, row.policies.depth2.stopTick); tick++) {
      assert.deepEqual(plain(a), plain(b), "Both original trajectories agree before their first action divergence");
      const ha = pair.chooseHuman(a, "depth1"), hb = pair.chooseHuman(b, "depth2");
      if (ha.x !== hb.x || ha.y !== hb.y) {
        found = true; const d = record.firstDivergence;
        assert.deepEqual({ tick: d.tick, human: d.human, zombie1: d.zombie1, zombie2: d.zombie2 }, plain({ tick, human: a.human, zombie1: a.zombies[0], zombie2: a.zombies[1] }));
        const index = indexOf(cell(a.human), cell(a.zombies[0]), cell(a.zombies[1])); assert.equal(d.stateIndex, index);
        for (const [p, from, human] of [["depth1", a, ha], ["depth2", b, hb]]) {
          const action = deltas.findIndex(([dx, dy]) => from.human.x + dx === human.x && from.human.y + dy === human.y);
          const next = pair.step(from, p), successorIndex = indexOf(cell(next.human), cell(next.zombies[0]), cell(next.zombies[1])), rank = g.ranks[successorIndex];
          assert.deepEqual(d[p], { action: ["N", "E", "S", "W", "stay"][action], actionIndex: action,
            human: plain(human), successorIndex, avoidable: rank === -1, maxCaptureTicks: rank === -1 ? null : rank });
          assert.equal(g.successors[index * 5 + action], successorIndex);
        }
        break;
      }
      a = pair.step(a, "depth1"); b = pair.step(b, "depth2");
    }
    assert.equal(found, true, row.id);
  }
});

test("witnesses are exactly the frozen ordered selection and every frame is a production transition", () => {
  const data = dataset(), g = graph(), pair = engine();
  const expected = new Set(data.results.filter(r => r.policies.depth1.outcome !== r.policies.depth2.outcome).map(r => r.id));
  const firstAvoidable = data.results.find(r => r.avoidable && Object.values(r.policies).some(p => p.outcome === "capture"));
  const firstUnavoidable = data.results.find(r => r.maxCaptureTicks > 0 && Object.values(r.policies).some(p => p.outcome === "capture"));
  if (firstAvoidable) expected.add(firstAvoidable.id); if (firstUnavoidable) expected.add(firstUnavoidable.id);
  assert.deepEqual(data.witnesses.map(w => w.id), data.results.filter(r => expected.has(r.id)).map(r => r.id));
  assert.equal(data.summary.witnessCount, expected.size);
  let transitions = 0, frames = 0;
  for (const witness of data.witnesses) {
    const row = data.results.find(r => r.id === witness.id), seen = new Map();
    assert.equal(typeof witness.reason, "string"); assert.ok(witness.reason.length > 0);
    assert.deepEqual(Object.keys(witness).sort(), ["id", "reason", "frames", "outcome", "stopTick", "cycleStart", "cyclePeriod"].sort());
    assert.equal(witness.frames.length, witness.stopTick + 1);
    let state = { ...pair.initialState(cell(row.human), cell(row.zombie2)), tickLimit: Infinity };
    for (let tick = 0; tick <= witness.stopTick; tick++) {
      const frame = witness.frames[tick], index = indexOf(cell(state.human), cell(state.zombies[0]), cell(state.zombies[1]));
      assert.deepEqual(frame, plain({ human: state.human, zombie1: state.zombies[0], zombie2: state.zombies[1], tick })); frames++;
      const terminal = state.zombies.some(z => Math.abs(z.x - state.human.x) + Math.abs(z.y - state.human.y) <= 1);
      if (tick === witness.stopTick) {
        if (witness.outcome === "capture") {
          assert.ok(terminal); assert.equal(tick, row.maxCaptureTicks); assert.equal(witness.cycleStart, null); assert.equal(witness.cyclePeriod, null);
        } else {
          assert.equal(witness.outcome, "cycle"); assert.equal(terminal, false); assert.equal(row.avoidable, true);
          assert.equal(witness.cycleStart, seen.get(index)); assert.equal(witness.cyclePeriod, tick - seen.get(index));
        }
        break;
      }
      assert.equal(terminal, false); assert.equal(seen.has(index), false); seen.set(index, tick);
      const human = witness.frames[tick + 1].human, [dx, dy] = deltas[g.chosenActions[index]];
      assert.deepEqual(human, { x: state.human.x + dx, y: state.human.y + dy });
      state = pair.resolveTick(state, { human, zombies: pair.step(state, "greedy").zombies }); transitions++;
    }
  }
  assert.equal(data.summary.witnessFrames, frames); assert.equal(data.summary.witnessTransitions, transitions);
});

test("wall-clock watchdog interrupts synchronous work and cannot exceed the preregistered bound", () => {
  assert.equal(typeof builder().withWatchdog, "function");
  const start = performance.now();
  assert.throws(() => builder().withWatchdog(() => { for (;;) {} }, 20), /timed out/i);
  assert.ok(performance.now() - start < 2000);
  assert.equal(builder().withWatchdog(() => 42, 100), 42);
  for (const ms of [0, -1, 840001, Infinity, 1.5]) assert.throws(() => builder().withWatchdog(() => {}, ms), /watchdog|bound/i);
});

test("CLI exports a complete rank certificate, safe browser data and exact resource receipts without cleaning neighbors", { timeout: 840000 }, () => {
  const os = require("node:os"), { spawnSync } = require("node:child_process");
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "zl010-cli-test-")), commit = "</script><script>bad()</script>&\u2028\u2029";
  fs.writeFileSync(path.join(out, "sentinel.txt"), "leave untouched");
  try {
    const run = spawnSync(process.execPath, ["--max-old-space-size=256", path.join(__dirname, "build-avoidability.cjs"), "--out-dir", out],
      { cwd: root, env: { ...process.env, PREVIEW_COMMIT: commit }, encoding: "utf8", timeout: 840000 });
    assert.equal(run.status, 0, run.stderr || String(run.error || ""));
    const names = ["avoidability.json", "avoidability-data.js", "avoidability-certificate.json"];
    assert.deepEqual(fs.readdirSync(out).sort(), [...names, "sentinel.txt"].sort());
    assert.equal(fs.readFileSync(path.join(out, "sentinel.txt"), "utf8"), "leave untouched");
    const files = Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(out, name), "utf8")]));
    const data = JSON.parse(files["avoidability.json"]), certificate = JSON.parse(files["avoidability-certificate.json"]);
    assert.ok(!/[<>&\u2028\u2029]/.test(files["avoidability-data.js"]));
    const context = vm.createContext({ window: {} }); vm.runInContext(files["avoidability-data.js"], context, { timeout: 1000 });
    assert.deepEqual(plain(context.window.ZL_AVOIDABILITY_DATA), data);
    assert.equal(data.metadata.commit, commit); assert.deepEqual(data.results, dataset().results); assert.deepEqual(data.summary, dataset().summary);
    assert.deepEqual(certificate.metadata, data.metadata); assert.equal(certificate.schemaVersion, 1);
    assert.deepEqual(Object.keys(certificate).sort(), ["schemaVersion", "metadata", "summary", "ranks"].sort());
    assert.ok(Array.isArray(certificate.ranks)); assert.equal(certificate.ranks.length, 343000);
    assert.deepEqual(certificate.ranks, [...graph().ranks]); assert.deepEqual(certificate.summary, graph().summary);
    const metrics = JSON.parse(run.stdout), bytes = Object.fromEntries(names.map(name => [name, Buffer.byteLength(files[name])]));
    assert.deepEqual(metrics.artifactBytes, bytes); assert.equal(metrics.outputBytes, Object.values(bytes).reduce((a, b) => a + b, 0));
    assert.ok(metrics.outputBytes < 30000000); assert.ok(metrics.elapsedMs > 0 && metrics.elapsedMs < 840000);
    assert.ok(metrics.maxRSSKiB > 0 && metrics.maxRSSKiB * 1024 < 512 * 1024 * 1024);
    assert.ok(metrics.currentRSSBytes > 0 && metrics.typedArrayBytes > 0); assert.equal(metrics.watchdogMs, 840000);
    assert.equal(metrics.verification.states, 343000); assert.equal(metrics.verification.actions, graph().summary.legalActionCount);
    assert.deepEqual(metrics.summary, data.summary);
    assert.equal(typeof builder().buildArtifacts, "function");
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
  for (const args of [["--bad"], ["--out-dir"], ["--out-dir", "x", "extra"]]) {
    const run = spawnSync(process.execPath, [path.join(__dirname, "build-avoidability.cjs"), ...args], { cwd: root, encoding: "utf8", timeout: 1000 });
    assert.notEqual(run.status, 0); assert.match(run.stderr, /usage|out-dir|argument/i);
  }
});
