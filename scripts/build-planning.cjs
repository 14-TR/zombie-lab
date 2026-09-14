"use strict";
// Reuse the unchanged, boundary-tested ordered-position adjudicator.
const { classifyStart: classifyRun } = require("./build-sweep.cjs");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const CONFIG = Object.freeze({ width: 10, height: 7, safetyTickLimit: 10000,
  horizon: 2, policy: "two-tick-model-based", excluded: "same-cell starts" });
const BASELINE_SHA256 = "4ee5817ba528b163fca1347c49ad4c48de2dcae226dd800065e5048b5b9bb568";
const ORIGINAL_SHA256 = "da7d74eba9e97403a45a5cd76954d4d3537482b7592e9752b3d530bf3fce0327";
function enumerate(simulation, planner, config) {
  const initial = simulation.initialState(), cells = config.width * config.height;
  if (initial.width !== config.width || initial.height !== config.height) throw new Error("Frozen board mismatch");
  const choices = new Map();
  // Computational memoization only. Same position-only chooseHuman; real moves
  // always go through unchanged resolveTick with the original clock and cap.
  const treatmentPolicy = { step(state) {
    const baseline = simulation.step(state);
    if (baseline.tick === state.tick) return baseline;
    const key = (state.zombie.y * config.width + state.zombie.x) * cells + state.human.y * config.width + state.human.x;
    if (!choices.has(key)) choices.set(key, planner.chooseHuman(state));
    return simulation.resolveTick(state, { human: choices.get(key), zombie: baseline.zombie });
  } };
  const summary = { total: 0, baseline: { capture: 0, cycle: 0, unresolved: 0 },
    treatment: { capture: 0, cycle: 0, unresolved: 0 }, later: 0, earlier: 0, same: 0, escape: 0, unresolved: 0 };
  const results = [];
  for (let zombieId = 0; zombieId < cells; zombieId++) for (let humanId = 0; humanId < cells; humanId++) {
    if (zombieId === humanId) continue;
    const state = { ...initial, tickLimit: config.safetyTickLimit,
      human: { x: humanId % config.width, y: Math.floor(humanId / config.width) },
      zombie: { x: zombieId % config.width, y: Math.floor(zombieId / config.width) } };
    const baseline = classifyRun(simulation, state), treatment = classifyRun(treatmentPolicy, state);
    if (baseline.outcome !== "capture") throw new Error("Baseline must capture every frozen start");
    const comparison = treatment.outcome === "unresolved" ? "unresolved" : treatment.outcome === "cycle" ? "escape" :
      treatment.stopTick > baseline.stopTick ? "later" : treatment.stopTick < baseline.stopTick ? "earlier" : "same";
    results.push({ id: `z${zombieId}-h${humanId}`, zombieId, humanId, baseline, treatment, comparison });
    summary.total++; summary.baseline[baseline.outcome]++; summary.treatment[treatment.outcome]++; summary[comparison]++;
  }
  return { summary, results };
}
function buildPlanning(options = {}) {
  const commit = options.commit ?? process.env.PREVIEW_COMMIT ?? "unknown";
  if (typeof commit !== "string") throw new TypeError("Commit metadata must be a string");
  const root = path.resolve(__dirname, "..");
  const baselineSource = fs.readFileSync(path.join(root, "simulation.js"), "utf8");
  const originalSource = fs.readFileSync(path.join(root, "evidence/all-starts/sweep.json"), "utf8");
  const hash = text => createHash("sha256").update(text).digest("hex");
  if (hash(baselineSource) !== BASELINE_SHA256 || hash(originalSource) !== ORIGINAL_SHA256) throw new Error("Frozen baseline source/evidence changed");
  const original = JSON.parse(originalSource);
  const context = vm.createContext({ config: { ...CONFIG } });
  vm.runInContext(baselineSource, context, { filename: "simulation.js", timeout: 1000 });
  vm.runInContext(fs.readFileSync(path.join(root, "planner.js"), "utf8"), context, { filename: "planner.js", timeout: 1000 });
  // One bounded VM invocation: no costly per-tick VM timeout setup.
  const result = vm.runInContext(`const classifyRun = ${classifyRun.toString()};\n(${enumerate.toString()})(ZombieLab, ZombiePlanner, config)`, context,
    { filename: "planning-runner.js", timeout: 30000 });
  if (result.results.length !== 4830 || original.results.length !== 4830) throw new Error("Incomplete paired coverage");
  result.results.forEach((row, index) => {
    const old = original.results[index];
    if (row.id !== old.id || row.zombieId !== old.zombieId || row.humanId !== old.humanId ||
        ["outcome", "stopTick", "cycleStart", "period"].some(field => row.baseline[field] !== old[field])) {
      throw new Error("Frozen baseline row mismatch: " + row.id);
    }
  });
  return { schemaVersion: 1, metadata: { commit }, config: { ...CONFIG }, ...JSON.parse(JSON.stringify(result)) };
}
module.exports = { buildPlanning, classifyRun };
function main() {
  const started = process.hrtime.bigint();
  const out = path.resolve(process.argv[2] || process.env.PREVIEW_OUTPUT_DIR || "preview");
  const data = buildPlanning();
  const json = JSON.stringify(data) + "\n";
  const safe = JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, character =>
    "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"));
  const script = "globalThis.ZombiePlanningData = " + safe + ";\n";
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "planning.json"), json);
  fs.writeFileSync(path.join(out, "planning-data.js"), script);
  console.log(JSON.stringify({ output: out, summary: data.summary,
    elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
    maxRSSKiB: process.resourceUsage().maxRSS, currentRSSBytes: process.memoryUsage().rss,
    outputBytes: Buffer.byteLength(json) + Buffer.byteLength(script) }));
}
if (require.main === module) {
  try { main(); }
  catch (error) { console.error("Planning build failed: " + error.message); process.exitCode = 1; }
}
