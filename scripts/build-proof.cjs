"use strict";
// Finite certificate for this exact production policy; no policy reimplementation.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const { buildSweep } = require("./build-sweep.cjs");
const CONFIG = Object.freeze({ width: 10, height: 7, safetyTickLimit: 10000,
  captureRule: "orthogonal-adjacency", excluded: "same-cell starts" });
const keyOf = (humanId, zombieId) => `z${zombieId}-h${humanId}`;
const position = id => ({ x: id % CONFIG.width, y: Math.floor(id / CONFIG.width) });
const contact = (h, z) => Math.abs(h.x - z.x) + Math.abs(h.y - z.y) <= 1;

function production() {
  const source = fs.readFileSync(path.join(__dirname, "..", "simulation.js"), "utf8");
  const context = vm.createContext({});
  vm.runInContext(source, context, { filename: "simulation.js", timeout: 1000 });
  const simulation = context.ZombieLab;
  const initial = simulation.initialState();
  if (initial.width !== CONFIG.width || initial.height !== CONFIG.height) throw new Error("Production board mismatch");
  return { simulation, sourceHash: createHash("sha256").update(source).digest("hex") };
}

function rowFor(humanId, zombieId) {
  const human = position(humanId), zombie = position(zombieId);
  return { key: keyOf(humanId, zombieId), humanId, zombieId, human, zombie,
    terminal: contact(human, zombie), successor: null, rank: null };
}

// Normalize only clock/reporting fields, never movement or capture physics.
// Clock 0 and cap 10000 expose one step before the external safety cutoff.
function advance(simulation, row) {
  const state = { ...simulation.initialState(), tick: 0, tickLimit: CONFIG.safetyTickLimit,
    status: "running", reason: "", decisions: null,
    human: { ...row.human }, zombie: { ...row.zombie } };
  const next = simulation.step(state);
  for (const p of [next.human, next.zombie]) {
    if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0 ||
        p.x >= CONFIG.width || p.y >= CONFIG.height) throw new Error("Production successor outside domain");
  }
  if (row.terminal) {
    if (next.status !== "caught" || next.tick !== 0 ||
        next.human.x !== row.human.x || next.human.y !== row.human.y ||
        next.zombie.x !== row.zombie.x || next.zombie.y !== row.zombie.y) {
      throw new Error("Production initial capture mismatch");
    }
    return null;
  }
  if (next.tick !== 1 || !["running", "caught"].includes(next.status)) throw new Error("Production one-step progress mismatch");
  // A one-cell exchange would require initial adjacency, already terminal.
  if ((next.status === "caught") !== contact(next.human, next.zombie)) throw new Error("Capture requires more than positional state");
  return { humanId: next.human.y * CONFIG.width + next.human.x,
    zombieId: next.zombie.y * CONFIG.width + next.zombie.x };
}

function buildTransitionGraph(simulation) {
  const rows = new Map();
  const cells = CONFIG.width * CONFIG.height;
  for (let z = 0; z < cells; z++) for (let h = 0; h < cells; h++) {
    if (h !== z) rows.set(keyOf(h, z), rowFor(h, z));
  }
  // Map iteration also visits appended overlapping terminal successors.
  for (const row of rows.values()) {
    const next = advance(simulation, row);
    if (next === null) continue;
    row.successor = keyOf(next.humanId, next.zombieId);
    if (!rows.has(row.successor)) rows.set(row.successor, rowFor(next.humanId, next.zombieId));
  }
  return [...rows.values()];
}

function assignRanks(states) {
  const rows = new Map(states.map(row => [row.key, row]));
  if (rows.size !== states.length) throw new Error("Duplicate state");
  for (const row of states) row.rank = row.terminal ? 0 : null;
  for (const start of states) {
    const trail = [], visiting = new Set();
    let row = start;
    while (row.rank === null) {
      if (visiting.has(row.key)) throw new Error(`Cycle at ${row.key}; no descending-rank certificate`);
      visiting.add(row.key); trail.push(row);
      row = rows.get(row.successor);
      if (!row) throw new Error("Missing successor state");
    }
    let rank = row.rank;
    while (trail.length) trail.pop().rank = ++rank;
  }
  return states;
}

function summarize(states, sweepMatches) {
  const starts = states.filter(row => row.humanId !== row.zombieId);
  const maxRank = Math.max(...starts.map(row => row.rank));
  return { startCount: starts.length, stateCount: states.length,
    initialCapture: starts.filter(row => row.terminal).length,
    terminalStates: states.filter(row => row.terminal).length,
    overlapTerminals: states.filter(row => row.humanId === row.zombieId).length,
    nonterminalStates: states.filter(row => !row.terminal).length,
    maxRank, maxRankStarts: starts.filter(row => row.rank === maxRank).length,
    cycles: 0, sweepMatches };
}

function compareSweep(states) {
  const rows = new Map(states.map(row => [row.key, row]));
  const sweep = buildSweep({ commit: "certificate-check" });
  if (sweep.results.length !== 4830) throw new Error("Sweep domain mismatch");
  for (const result of sweep.results) {
    const row = rows.get(result.id);
    if (!row || result.outcome !== "capture" || result.stopTick !== row.rank ||
        result.cycleStart !== null || result.period !== null) throw new Error(`Sweep mismatch at ${result.id}`);
  }
  return sweep.results.length;
}

function buildProof(options = {}) {
  const commit = options.commit ?? process.env.PREVIEW_COMMIT ?? "unknown";
  if (typeof commit !== "string") throw new TypeError("Commit metadata must be a string");
  const { simulation, sourceHash } = production();
  const states = assignRanks(buildTransitionGraph(simulation));
  return { schemaVersion: 1, metadata: { commit, simulationSha256: sourceHash },
    config: { ...CONFIG }, summary: summarize(states, compareSweep(states)), states };
}

// This checker never calls buildProof, buildTransitionGraph or assignRanks.
// It validates the supplied table against production and the local rank law;
// rebuilding a plausible replacement table would conceal certificate corruption.
function checkProof(proof) {
  const fail = message => { throw new Error(message); };
  const { simulation, sourceHash } = production();
  if (!proof || proof.schemaVersion !== 1 || !Array.isArray(proof.states)) fail("Certificate schema mismatch");
  if (!proof.metadata || typeof proof.metadata.commit !== "string" ||
      proof.metadata.simulationSha256 !== sourceHash) fail("Certificate source metadata mismatch");
  if (!proof.config || Object.keys(proof.config).length !== Object.keys(CONFIG).length ||
      Object.entries(CONFIG).some(([key, value]) => proof.config[key] !== value)) fail("Certificate config mismatch");
  const cells = CONFIG.width * CONFIG.height;
  const rows = new Map();
  for (const row of proof.states) {
    if (!row || !Number.isInteger(row.humanId) || !Number.isInteger(row.zombieId) ||
        row.humanId < 0 || row.humanId >= cells || row.zombieId < 0 || row.zombieId >= cells) fail("State position ID outside domain");
    if (row.key !== keyOf(row.humanId, row.zombieId)) fail("Noncanonical state key");
    if (rows.has(row.key)) fail("Duplicate state key");
    for (const [name, id] of [["human", row.humanId], ["zombie", row.zombieId]]) {
      const p = position(id);
      if (!row[name] || row[name].x !== p.x || row[name].y !== p.y) fail("State position mismatch");
    }
    if (row.terminal !== contact(row.human, row.zombie)) fail("State terminal flag mismatch");
    if (!Number.isSafeInteger(row.rank) || row.rank < 0) fail("Rank must be a nonnegative safe integer");
    if (row.terminal && (row.rank !== 0 || row.successor !== null)) fail("Terminal rank/successor mismatch");
    rows.set(row.key, row);
  }
  for (let z = 0; z < cells; z++) for (let h = 0; h < cells; h++) {
    if (h !== z && !rows.has(keyOf(h, z))) fail("Missing state in distinct-start domain");
  }
  const targets = new Set();
  for (const row of rows.values()) {
    const next = advance(simulation, row);
    if (next === null) continue;
    const expected = keyOf(next.humanId, next.zombieId);
    if (row.successor !== expected) fail(`Wrong production successor at ${row.key}`);
    const successor = rows.get(expected);
    if (!successor) fail(`Missing successor state at ${row.key}`);
    targets.add(expected);
    if (row.rank !== successor.rank + 1) fail(`Descending rank mismatch at ${row.key}`);
  }
  for (const row of rows.values()) {
    if (row.humanId === row.zombieId && !targets.has(row.key)) fail("Extraneous overlap state outside reachable domain");
  }
  const summary = summarize(proof.states, compareSweep(proof.states));
  if (!proof.summary || Object.keys(proof.summary).length !== Object.keys(summary).length ||
      Object.entries(summary).some(([key, value]) => proof.summary[key] !== value)) fail("Certificate summary mismatch");
  return { valid: true, ...summary };
}

module.exports = { buildProof, checkProof, buildTransitionGraph, assignRanks };

function main() {
  const started = process.hrtime.bigint();
  const out = path.resolve(process.argv[2] || process.env.PREVIEW_OUTPUT_DIR || "preview");
  const proof = buildProof();
  checkProof(proof);
  const json = JSON.stringify(proof) + "\n";
  const bytes = Buffer.byteLength(json);
  if (bytes >= 2_000_000) throw new Error("Complete certificate exceeds the 2 MB artifact bound");
  // Never clean or copy into this directory; other replay artifacts belong there.
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "proof.json"), json);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`Certified ${proof.summary.startCount} starts: ${JSON.stringify(proof.summary)}; ${bytes} bytes; ${elapsedMs.toFixed(3)} ms; ${path.join(out, "proof.json")}`);
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error("Proof build failed: " + error.message);
    process.exitCode = 1;
  }
}
