"use strict";
// The runner certifies position recurrence; production status never invents cycles.
function classifyRun(simulation, initial, policy) {
  const { width, height, tickLimit } = initial;
  if (!Number.isInteger(tickLimit) || tickLimit < 0 || tickLimit > 10000) {
    throw new RangeError("Safety tick limit must be an integer from 0 to 10000");
  }
  const cells = width * height, firstSeen = new Map();
  let state = initial;
  for (let tick = 0; tick <= tickLimit; tick++) {
    if (state.tick !== tick) throw new Error("Simulation made no consecutive tick progress");
    if (!["running", "caught", "limit"].includes(state.status)) throw new Error("Unknown simulation status");
    if (state.status === "limit" && tick < tickLimit) throw new Error("Simulation stopped before safety limit");
    if (!Array.isArray(state.zombies) || state.zombies.length !== 2) throw new Error("Expected two ordered zombie positions");
    for (const position of [state.human, ...state.zombies]) {
      if (!position || !Number.isInteger(position.x) || !Number.isInteger(position.y) ||
          position.x < 0 || position.x >= width || position.y < 0 || position.y >= height) {
        throw new Error("Simulation position outside the sweep board");
      }
    }
    if (state.status === "caught" || state.zombies.some(z => Math.abs(z.x - state.human.x) + Math.abs(z.y - state.human.y) <= 1)) {
      return { outcome: "capture", stopTick: tick, cycleStart: null, period: null };
    }
    const id = position => position.y * width + position.x;
    const key = (id(state.zombies[0]) * cells + id(state.zombies[1])) * cells + id(state.human);
    if (firstSeen.has(key)) {
      const cycleStart = firstSeen.get(key);
      return { outcome: "cycle", stopTick: tick, cycleStart, period: tick - cycleStart };
    }
    firstSeen.set(key, tick);
    if (tick === tickLimit) return { outcome: "unresolved", stopTick: tick, cycleStart: null, period: null };
    state = simulation.step(state, policy);
  }
}
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const CONFIG = Object.freeze({ width: 10, height: 7, zombie1Id: 42, safetyTickLimit: 10000,
  policies: Object.freeze(["greedy", "depth1", "depth2"]), scope: "fixed-zombie1-slice" });
function enumerate(pair, config) {
  const results = [];
  const summary = { total: 0, initialCapture: 0,
    policies: Object.fromEntries(config.policies.map(policy => [policy, { capture: 0, cycle: 0, unresolved: 0 }])) };
  for (let zombie2Id = 0; zombie2Id < 70; zombie2Id++) for (let humanId = 0; humanId < 70; humanId++) {
    if (humanId === config.zombie1Id || humanId === zombie2Id) continue;
    const initial = pair.initialState(humanId, zombie2Id), outcomes = {};
    if (initial.width !== config.width || initial.height !== config.height || initial.tickLimit !== config.safetyTickLimit) {
      throw new Error("Frozen engine configuration mismatch");
    }
    for (const policy of config.policies) {
      outcomes[policy] = classifyRun(pair, initial, policy);
      summary.policies[policy][outcomes[policy].outcome]++;
    }
    summary.initialCapture += Number(outcomes.greedy.outcome === "capture" && outcomes.greedy.stopTick === 0);
    results.push({ id: `z2-${zombie2Id}-h${humanId}`, humanId, zombie2Id, outcomes });
    summary.total++;
  }
  if (results.length !== 4761) throw new Error("Incomplete fixed-Z1 coverage");
  return { summary, results };
}
function buildTwoZombies(options = {}) {
  const commit = options.commit ?? process.env.PREVIEW_COMMIT ?? "unknown";
  if (typeof commit !== "string") throw new TypeError("Commit metadata must be a string");
  const context = vm.createContext({ config: CONFIG });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "two-zombies.js"), "utf8"), context,
    { filename: "two-zombies.js", timeout: 1000 });
  // No memoization: each choice is replanned from the actual current positions.
  // One VM call bounds the entire sweep without per-tick watchdog overhead.
  const result = vm.runInContext(`const classifyRun = ${classifyRun.toString()};\n(${enumerate.toString()})(ZombiePair, config)`, context,
    { filename: "two-zombies-sweep.js", timeout: 120000 });
  return { schemaVersion: 1, metadata: { commit }, config: { ...CONFIG, policies: [...CONFIG.policies] }, ...JSON.parse(JSON.stringify(result)) };
}
module.exports = { buildTwoZombies, classifyRun };
function main() {
  const started = process.hrtime.bigint();
  const out = path.resolve(process.argv[2] || process.env.PREVIEW_OUTPUT_DIR || "preview");
  const data = buildTwoZombies();
  const json = JSON.stringify(data) + "\n";
  const safe = JSON.stringify(data).replace(/[<>&\u2028\u2029]/g,
    character => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"));
  const script = "globalThis.ZombiePairData = " + safe + ";\n";
  // Do not clean or copy into the destination: the parent owns preview packaging.
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "two-zombies.json"), json);
  fs.writeFileSync(path.join(out, "two-zombies-data.js"), script);
  const usage = process.resourceUsage();
  console.log(JSON.stringify({ output: out, summary: data.summary,
    elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
    maxRSSKiB: usage.maxRSS, currentRSSBytes: process.memoryUsage().rss,
    userCPUTimeUs: usage.userCPUTime, systemCPUTimeUs: usage.systemCPUTime,
    outputBytes: Buffer.byteLength(json) + Buffer.byteLength(script) }));
}
if (require.main === module) {
  try { main(); }
  catch (error) { console.error("Two-zombie build failed: " + error.message); process.exitCode = 1; }
}
