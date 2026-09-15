"use strict";
// ZL-010: every legal human action against unchanged production pursuers.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = path.resolve(__dirname, "..");
const STATE_COUNT = 343000, ACTION_COUNT = 5;
const WATCHDOG_MS = 840000, MEMORY_BYTES = 512 * 1024 * 1024;

function withWatchdog(operation, milliseconds = WATCHDOG_MS) {
  if (!Number.isInteger(milliseconds) || milliseconds < 1 || milliseconds > WATCHDOG_MS) throw new RangeError("Watchdog bound must be 1..840000 ms");
  // A VM timeout also interrupts a synchronous host callback (covered by test).
  // Bound the whole API/CLI call, including nested production and legacy VMs.
  return vm.runInNewContext("operation()", { operation }, { timeout: milliseconds, filename: "avoidability-watchdog.js" });
}
function budget(started) {
  const usage = process.resourceUsage(), rss = process.memoryUsage().rss;
  if (rss >= MEMORY_BYTES || usage.maxRSS * 1024 >= MEMORY_BYTES) throw new Error("512 MiB memory budget exceeded");
  if (Number(process.hrtime.bigint() - started) / 1e6 >= WATCHDOG_MS) throw new Error("14-minute wall-clock budget exceeded");
  return { maxRSSKiB: usage.maxRSS, currentRSSBytes: rss };
}
function productionContext(started) {
  const context = vm.createContext({ Int32Array, Uint8Array, checkBudget: () => budget(started) });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "two-zombies.js"), "utf8"), context,
    { filename: "two-zombies.js", timeout: 1000 });
  return context;
}

// This runs as one bounded VM call, rather than paying a watchdog per edge.
function productionGraph(pair, checkBudget) {
  const count = 343000, slots = 5, successors = new Int32Array(count * slots).fill(-1);
  const terminals = new Uint8Array(count), points = Array.from({ length: 70 }, (_, id) => ({ x: id % 10, y: Math.floor(id / 10) }));
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]];
  const cell = p => {
    if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.x >= 10 || p.y < 0 || p.y >= 7) {
      throw new Error("Production successor outside complete domain");
    }
    return p.y * 10 + p.x;
  };
  const touching = (h, zs) => zs.some(z => Math.abs(h.x - z.x) + Math.abs(h.y - z.y) <= 1);
  const base = pair.initialState();
  if (base.width !== 10 || base.height !== 7 || base.tickLimit !== 10000) throw new Error("Frozen production configuration mismatch");
  let terminalStates = 0, legalActionCount = 0;
  for (let z1 = 0; z1 < 70; z1++) {
    checkBudget();
    for (let z2 = 0; z2 < 70; z2++) for (let h = 0; h < 70; h++) {
      const index = (z1 * 70 + z2) * 70 + h;
      const state = { ...base, tick: 0, status: "running", reason: "", human: points[h], zombies: [points[z1], points[z2]] };
      if (touching(state.human, state.zombies)) {
        const next = pair.resolveTick(state, {});
        if (next.status !== "caught" || next.tick !== 0 || cell(next.human) !== h ||
            cell(next.zombies[0]) !== z1 || cell(next.zombies[1]) !== z2) throw new Error("Initial production contact mismatch");
        terminals[index] = 1; terminalStates++;
        continue;
      }
      // step obtains the private deterministic zombie choices from production.
      // Those choices read this SAME OLD state, independent of its human choice.
      const probe = pair.step(state, "greedy"), zombies = probe.zombies;
      if (probe.tick !== 1) throw new Error("Production one-step progress mismatch");
      for (let action = 0; action < slots; action++) {
        const [dx, dy] = directions[action], human = { x: state.human.x + dx, y: state.human.y + dy };
        if (human.x < 0 || human.x >= 10 || human.y < 0 || human.y >= 7) continue;
        const next = pair.resolveTick(state, { human, zombies });
        if (next.tick !== 1 || !["running", "caught"].includes(next.status)) throw new Error("Production transition/cutoff mismatch");
        // Exchanges require initial adjacency, already caught above. Thus every
        // reachable capture endpoint is positional contact, suitable for rank 0.
        if ((next.status === "caught") !== touching(next.human, next.zombies)) throw new Error("Capture needs hidden state");
        successors[index * slots + action] = (cell(next.zombies[0]) * 70 + cell(next.zombies[1])) * 70 + cell(next.human);
        legalActionCount++;
      }
    }
  }
  return { successors, terminals, summary: { stateCount: count, terminalStates,
    nonterminalStates: count - terminalStates, legalActionCount } };
}

function assignControlledRanks({ successors, terminals }) {
  const count = terminals?.length;
  if (!(successors instanceof Int32Array) || !(terminals instanceof Uint8Array) ||
      count < 1 || count > STATE_COUNT || successors.length !== count * ACTION_COUNT) throw new Error("Graph domain/length mismatch");
  const ranks = new Int32Array(count).fill(-1), chosenActions = new Int8Array(count).fill(-1);
  const remaining = new Uint8Array(count), offsets = new Uint32Array(count + 1);
  const maximum = new Int32Array(count), queue = new Uint32Array(count);
  let edges = 0, tail = 0;
  for (let s = 0; s < count; s++) {
    if (terminals[s] > 1) throw new Error("Invalid terminal flag");
    for (let a = 0; a < ACTION_COUNT; a++) {
      const next = successors[s * ACTION_COUNT + a];
      if (next === -1) continue;
      if (next < 0 || next >= count) throw new Error("Successor outside graph domain");
      if (terminals[s]) throw new Error("Terminal state has an action");
      remaining[s]++; offsets[next + 1]++; edges++;
    }
    if (terminals[s]) { ranks[s] = 0; queue[tail++] = s; }
    else if (!remaining[s]) throw new Error("Nonterminal state has no legal action");
  }
  for (let s = 0; s < count; s++) offsets[s + 1] += offsets[s];
  const cursor = offsets.slice(0, count), predecessors = new Uint32Array(edges);
  for (let s = 0; s < count; s++) for (let a = 0; a < ACTION_COUNT; a++) {
    const next = successors[s * ACTION_COUNT + a];
    if (next >= 0) predecessors[cursor[next]++] = s;
  }
  // Every action is counted (including duplicate endpoints). A state is losing
  // only once every action has a finite rank; the last removal closes its proof.
  for (let head = 0; head < tail; head++) {
    const next = queue[head];
    for (let edge = offsets[next]; edge < offsets[next + 1]; edge++) {
      const s = predecessors[edge];
      maximum[s] = Math.max(maximum[s], ranks[next]);
      if (--remaining[s] === 0) { ranks[s] = maximum[s] + 1; queue[tail++] = s; }
    }
  }
  let winningStates = 0, maxRank = 0;
  const rankHistogram = {};
  for (let s = 0; s < count; s++) {
    const rank = ranks[s];
    if (rank === -1) winningStates++;
    else { rankHistogram[rank] = (rankHistogram[rank] || 0) + 1; maxRank = Math.max(maxRank, rank); }
    if (terminals[s]) continue;
    let bestRank = -1;
    for (let a = 0; a < ACTION_COUNT; a++) {
      const next = successors[s * ACTION_COUNT + a];
      if (next < 0) continue;
      if (rank === -1) {
        if (ranks[next] === -1) { chosenActions[s] = a; break; }
      } else if (ranks[next] > bestRank) { bestRank = ranks[next]; chosenActions[s] = a; }
    }
    if (chosenActions[s] < 0) throw new Error("Missing certified strategy action");
  }
  const typedArrayBytes = [successors, terminals, ranks, chosenActions, remaining, offsets, maximum, queue, cursor, predecessors]
    .reduce((sum, array) => sum + array.byteLength, 0);
  return { ranks, chosenActions, typedArrayBytes, summary: { winningStates, losingStates: count - winningStates,
    nonterminalLosingStates: count - winningStates - (rankHistogram[0] || 0), maxRank, rankHistogram } };
}

const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]];
const position = id => ({ x: id % 10, y: Math.floor(id / 10) });
const cellId = p => p.y * 10 + p.x;
const stateIndex = state => (cellId(state.zombies[0]) * 70 + cellId(state.zombies[1])) * 70 + cellId(state.human);
const contact = state => state.zombies.some(z => Math.abs(z.x - state.human.x) + Math.abs(z.y - state.human.y) <= 1);
const frameOf = state => ({ human: { ...state.human }, zombie1: { ...state.zombies[0] }, zombie2: { ...state.zombies[1] }, tick: state.tick });
function stateAt(pair, index) {
  return { ...pair.initialState(), human: position(index % 70),
    zombies: [position(Math.floor(index / 4900)), position(Math.floor(index / 70) % 70)], tickLimit: Infinity };
}

// Internal consistency check, NOT the independently encoded transition checker.
function verifyGraph({ successors, terminals, ranks, chosenActions }) {
  if (successors?.length !== STATE_COUNT * ACTION_COUNT ||
      [terminals, ranks, chosenActions].some(a => a?.length !== STATE_COUNT)) throw new Error("Complete graph domain/length mismatch");
  let actions = 0;
  for (let s = 0; s < STATE_COUNT; s++) {
    const h = position(s % 70), z1 = position(Math.floor(s / 4900)), z2 = position(Math.floor(s / 70) % 70);
    const terminal = contact({ human: h, zombies: [z1, z2] }), rank = ranks[s];
    if (terminals[s] !== Number(terminal) || (rank === 0) !== terminal) throw new Error(`Terminal rank mismatch at ${s}`);
    if (!Number.isInteger(rank) || rank < -1 || rank >= STATE_COUNT) throw new Error(`Invalid rank at ${s}`);
    let best = -1, maxRank = -1;
    for (let a = 0; a < ACTION_COUNT; a++) {
      const [dx, dy] = DIRECTIONS[a], x = h.x + dx, y = h.y + dy;
      const legal = !terminal && x >= 0 && x < 10 && y >= 0 && y < 7, next = successors[s * ACTION_COUNT + a];
      if (!legal) {
        if (next !== -1) throw new Error(`Illegal action present at ${s}/${a}`);
        continue;
      }
      if (!Number.isInteger(next) || next < 0 || next >= STATE_COUNT) throw new Error(`Missing/outside-domain successor at ${s}/${a}`);
      actions++;
      const nr = ranks[next];
      if (rank === -1) { if (nr === -1 && best < 0) best = a; }
      else {
        if (nr < 0 || nr >= rank) throw new Error(`Losing rank does not descend at ${s}/${a}`);
        if (nr > maxRank) { maxRank = nr; best = a; }
      }
    }
    if (rank === -1 && best < 0) throw new Error(`Winning set is not controlled-invariant at ${s}`);
    if (rank > 0 && rank !== maxRank + 1) throw new Error(`Maximum-delay rank mismatch at ${s}`);
    if (chosenActions[s] !== best) throw new Error(`Noncanonical strategy action at ${s}`);
  }
  return { valid: true, states: STATE_COUNT, actions };
}

function traceStrategy(graph, initialIndex) {
  if (!Number.isInteger(initialIndex) || initialIndex < 0 || initialIndex >= STATE_COUNT) throw new RangeError("Initial index outside graph domain");
  const started = process.hrtime.bigint(), pair = productionContext(started).ZombiePair;
  const firstSeen = new Int32Array(STATE_COUNT).fill(-1), frames = [];
  let state = stateAt(pair, initialIndex);
  for (;;) {
    const index = stateIndex(state), tick = state.tick;
    if (tick % 1024 === 0) budget(started);
    if (tick > STATE_COUNT) throw new Error("Finite-state recurrence invariant failed (not a simulation cutoff)");
    frames.push(frameOf(state));
    if (state.status === "caught" || contact(state)) {
      if (graph.ranks[initialIndex] !== tick) throw new Error("Strategy capture does not attain maximum-delay rank");
      return { frames, outcome: "capture", stopTick: tick, cycleStart: null, cyclePeriod: null };
    }
    if (firstSeen[index] >= 0) {
      if (graph.ranks[initialIndex] !== -1) throw new Error("Losing strategy has a cycle");
      return { frames, outcome: "cycle", stopTick: tick, cycleStart: firstSeen[index], cyclePeriod: tick - firstSeen[index] };
    }
    firstSeen[index] = tick;
    const action = graph.chosenActions[index];
    if (!Number.isInteger(action) || action < 0 || action >= ACTION_COUNT) throw new Error("Invalid strategy action");
    const [dx, dy] = DIRECTIONS[action];
    const next = pair.resolveTick(state, { human: { x: state.human.x + dx, y: state.human.y + dy }, zombies: pair.step(state, "greedy").zombies });
    if (next.tick !== tick + 1 || stateIndex(next) !== graph.successors[index * ACTION_COUNT + action]) {
      throw new Error("Certified successor does not match actual production transition");
    }
    if (graph.ranks[index] === -1 && (next.status === "caught" || graph.ranks[stateIndex(next)] !== -1)) throw new Error("Strategy leaves winning set");
    if (graph.ranks[index] > 0 && graph.ranks[stateIndex(next)] !== graph.ranks[index] - 1) throw new Error("Strategy fails maximum-delay rank law");
    state = next;
  }
}

function solveGraphCore() {
  const started = process.hrtime.bigint(), context = productionContext(started);
  const graph = vm.runInContext(`(${productionGraph.toString()})(ZombiePair, checkBudget)`, context,
    { filename: "avoidability-transitions.js", timeout: WATCHDOG_MS });
  const assigned = assignControlledRanks(graph);
  graph.ranks = assigned.ranks; graph.chosenActions = assigned.chosenActions;
  graph.summary = { ...graph.summary, ...assigned.summary };
  graph.verification = verifyGraph(graph);
  graph.resources = { ...budget(started), typedArrayBytes: assigned.typedArrayBytes,
    elapsedMs: Number(process.hrtime.bigint() - started) / 1e6, watchdogMs: WATCHDOG_MS };
  return graph;
}
function solveGraph() { return withWatchdog(solveGraphCore); }
const POLICIES = ["greedy", "depth1", "depth2"];
function sourceHashes() {
  const { createHash } = require("node:crypto");
  return Object.fromEntries(["two-zombies.js", "scripts/build-two-zombies.cjs", "scripts/build-avoidability.cjs", "experiments/ZL-010-protocol.md"]
    .map(file => [file, createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex")]));
}
function summarizeResults(graph, results) {
  const summary = { total: 0, initialContact: 0, noninitialUnavoidable: 0, avoidable: 0, graph: graph.summary, policies: {} };
  for (const policy of POLICIES) summary.policies[policy] = { capture: 0, cycle: 0, unresolved: 0,
    avoidableCaptures: 0, unavoidableCaptures: 0, initialContactCaptures: 0, noninitialUnavoidableCaptures: 0,
    captureDelayShortfall: { capturedStarts: 0, noninitialCapturedStarts: 0, positiveStarts: 0, totalTicks: 0, maxTicks: 0,
      meanTicks: null, noninitialMeanTicks: null, histogram: {}, maxShortfallIds: [] } };
  for (const row of results) {
    summary.total++;
    if (row.avoidable) summary.avoidable++;
    else if (row.maxCaptureTicks === 0) summary.initialContact++;
    else summary.noninitialUnavoidable++;
    for (const policy of POLICIES) {
      const outcome = row.policies[policy], stat = summary.policies[policy], delay = stat.captureDelayShortfall;
      if (!["capture", "cycle", "unresolved"].includes(outcome.outcome)) throw new Error("Unknown legacy outcome");
      stat[outcome.outcome]++;
      if (outcome.outcome !== "capture") {
        if (!row.avoidable) throw new Error(`Legacy noncapture contradicts finite rank at ${row.id}/${policy}`);
        continue;
      }
      if (row.avoidable) { stat.avoidableCaptures++; continue; }
      stat.unavoidableCaptures++;
      if (row.maxCaptureTicks === 0) stat.initialContactCaptures++;
      else stat.noninitialUnavoidableCaptures++;
      const shortfall = row.maxCaptureTicks - outcome.stopTick;
      if (!Number.isInteger(shortfall) || shortfall < 0) throw new Error(`Legacy capture exceeds maximum delay at ${row.id}/${policy}`);
      delay.capturedStarts++; delay.noninitialCapturedStarts += Number(row.maxCaptureTicks > 0);
      delay.positiveStarts += Number(shortfall > 0); delay.totalTicks += shortfall;
      delay.histogram[shortfall] = (delay.histogram[shortfall] || 0) + 1;
      if (shortfall > delay.maxTicks) { delay.maxTicks = shortfall; delay.maxShortfallIds = [row.id]; }
      else if (shortfall > 0 && shortfall === delay.maxTicks) delay.maxShortfallIds.push(row.id);
    }
  }
  for (const policy of POLICIES) {
    const delay = summary.policies[policy].captureDelayShortfall;
    delay.meanTicks = delay.capturedStarts ? delay.totalTicks / delay.capturedStarts : null;
    delay.noninitialMeanTicks = delay.noninitialCapturedStarts ? delay.totalTicks / delay.noninitialCapturedStarts : null;
  }
  return summary;
}
function inspectDisagreements(legacy, started) {
  const pair = productionContext(started).ZombiePair;
  const cases = legacy.results.filter(row => row.outcomes.depth1.outcome !== row.outcomes.depth2.outcome).map(row => {
    budget(started);
    let a = pair.initialState(row.humanId, row.zombie2Id), b = pair.initialState(row.humanId, row.zombie2Id);
    for (let tick = 0; tick < Math.min(row.outcomes.depth1.stopTick, row.outcomes.depth2.stopTick); tick++) {
      if (stateIndex(a) !== stateIndex(b)) throw new Error("Missed earlier trajectory action divergence");
      const ha = pair.chooseHuman(a, "depth1"), hb = pair.chooseHuman(b, "depth2");
      if (cellId(ha) !== cellId(hb)) {
        const firstDivergence = { ...frameOf(a), stateIndex: stateIndex(a) };
        for (const [policy, state, human] of [["depth1", a, ha], ["depth2", b, hb]]) {
          const actionIndex = DIRECTIONS.findIndex(([dx, dy]) => human.x === state.human.x + dx && human.y === state.human.y + dy);
          if (actionIndex < 0) throw new Error("Illegal production policy action");
          firstDivergence[policy] = { action: ["N", "E", "S", "W", "stay"][actionIndex], actionIndex,
            human: { ...human }, successorIndex: stateIndex(pair.step(state, policy)) };
        }
        return { id: row.id, depth1: row.outcomes.depth1, depth2: row.outcomes.depth2, firstDivergence };
      }
      a = pair.step(a, "depth1"); b = pair.step(b, "depth2");
    }
    throw new Error(`Missing first action divergence at ${row.id}`);
  });
  if (cases.length !== 30) throw new Error("Frozen depth-disagreement count mismatch");
  return cases;
}
function addWitnesses(graph, results, summary, inspected, started) {
  const byId = new Map(results.map(row => [row.id, row]));
  const cases = inspected.map(record => {
    const row = byId.get(record.id), d = record.firstDivergence;
    for (const policy of ["depth1", "depth2"]) {
      const action = d[policy], rank = graph.ranks[action.successorIndex];
      if (graph.successors[d.stateIndex * ACTION_COUNT + action.actionIndex] !== action.successorIndex) throw new Error("Divergence transition does not match graph");
      action.avoidable = rank === -1; action.maxCaptureTicks = rank === -1 ? null : rank;
    }
    return { ...record, avoidable: row.avoidable, maxCaptureTicks: row.maxCaptureTicks };
  });
  summary.depthDisagreements = { total: cases.length, avoidable: cases.filter(row => row.avoidable).length,
    unavoidable: cases.filter(row => !row.avoidable).length,
    depth1CaptureDepth2Cycle: cases.filter(row => row.depth1.outcome === "capture" && row.depth2.outcome === "cycle").length,
    depth1CycleDepth2Capture: cases.filter(row => row.depth1.outcome === "cycle" && row.depth2.outcome === "capture").length, cases };
  const reasons = new Map(cases.map(row => [row.id, ["depth-disagreement"]]));
  const selections = [
    [results.find(row => row.avoidable && POLICIES.some(p => row.policies[p].outcome === "capture")), "first-avoidable-policy-failure"],
    [results.find(row => row.maxCaptureTicks > 0 && POLICIES.some(p => row.policies[p].outcome === "capture")), "first-noninitial-unavoidable-policy-failure"]
  ];
  for (const [row, reason] of selections) if (row) reasons.set(row.id, [...(reasons.get(row.id) || []), reason]);
  const witnesses = results.filter(row => reasons.has(row.id)).map(row => {
    budget(started);
    return { id: row.id, reason: reasons.get(row.id).join("; "), ...traceStrategy(graph, row.stateIndex) };
  });
  summary.witnessCount = witnesses.length;
  summary.witnessFrames = witnesses.reduce((sum, witness) => sum + witness.frames.length, 0);
  summary.witnessTransitions = witnesses.reduce((sum, witness) => sum + witness.stopTick, 0);
  return witnesses;
}
function buildArtifactsCore(options = {}) {
  const commit = options.commit ?? process.env.PREVIEW_COMMIT ?? "unknown";
  if (typeof commit !== "string") throw new TypeError("Commit metadata must be a string");
  const started = process.hrtime.bigint(), legacy = require("./build-two-zombies.cjs").buildTwoZombies({ commit });
  // Preregistered evaluation order: inspect the paired exceptions before solving.
  const inspected = inspectDisagreements(legacy, started);
  const graph = solveGraph(), results = legacy.results.map(old => {
    const index = (42 * 70 + old.zombie2Id) * 70 + old.humanId, rank = graph.ranks[index];
    return { id: old.id, human: position(old.humanId), zombie1: position(42), zombie2: position(old.zombie2Id),
      stateIndex: index, avoidable: rank === -1, maxCaptureTicks: rank === -1 ? null : rank, policies: old.outcomes };
  });
  if (results.length !== 4761 || new Set(results.map(row => row.id)).size !== 4761) throw new Error("Incomplete ZL009 domain");
  const summary = summarizeResults(graph, results), witnesses = addWitnesses(graph, results, summary, inspected, started);
  const metadata = { commit, sourceHashes: sourceHashes() };
  const data = { schemaVersion: 1, metadata, summary, results, witnesses };
  const certificate = { schemaVersion: 1, metadata, summary: graph.summary, ranks: Array.from(graph.ranks) };
  return { data, certificate, verification: graph.verification, resources: { ...budget(started),
    typedArrayBytes: graph.resources.typedArrayBytes, graphElapsedMs: graph.resources.elapsedMs,
    elapsedMs: Number(process.hrtime.bigint() - started) / 1e6, watchdogMs: WATCHDOG_MS } };
}
function buildArtifacts(options = {}) { return withWatchdog(() => buildArtifactsCore(options)); }
function buildAvoidability(options = {}) { return buildArtifacts(options).data; }
module.exports = { buildAvoidability, solveGraph, buildArtifacts, assignControlledRanks, verifyGraph, traceStrategy, withWatchdog };

function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--out-dir" || !args[1] || args[1].startsWith("--"))) {
    throw new Error("Usage: node scripts/build-avoidability.cjs [--out-dir DIR]");
  }
  const out = path.resolve(args[1] || process.env.PREVIEW_OUTPUT_DIR || "preview"), started = process.hrtime.bigint();
  const { data, certificate, verification, resources } = buildArtifacts();
  const json = JSON.stringify(data), safe = json.replace(/[<>&\u2028\u2029]/g,
    character => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"));
  const artifacts = { "avoidability.json": json + "\n", "avoidability-data.js": "window.ZL_AVOIDABILITY_DATA = " + safe + ";\n",
    "avoidability-certificate.json": JSON.stringify(certificate) + "\n" };
  const artifactBytes = Object.fromEntries(Object.entries(artifacts).map(([name, content]) => [name, Buffer.byteLength(content)]));
  const outputBytes = Object.values(artifactBytes).reduce((sum, bytes) => sum + bytes, 0);
  if (outputBytes >= 30000000) throw new Error("30 MB artifact budget exceeded");
  budget(started);
  // Never clean/copy the output directory; neighboring artifacts belong to the parent.
  fs.mkdirSync(out, { recursive: true });
  for (const [name, content] of Object.entries(artifacts)) fs.writeFileSync(path.join(out, name), content);
  const usage = process.resourceUsage();
  console.log(JSON.stringify({ output: out, summary: data.summary, verification, metadata: data.metadata,
    ...resources, ...budget(started), elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
    userCPUTimeUs: usage.userCPUTime, systemCPUTimeUs: usage.systemCPUTime, artifactBytes, outputBytes }));
}
if (require.main === module) {
  try { withWatchdog(main); }
  catch (error) { console.error("Avoidability build failed: " + error.message); process.exitCode = 1; }
}
