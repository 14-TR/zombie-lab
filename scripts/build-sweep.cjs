"use strict";
// Build-time only. Production policy is loaded unchanged; no trajectory archive.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const CONFIG = Object.freeze({
  width: 10, height: 7, safetyTickLimit: 10000,
  captureRule: "orthogonal-adjacency", excluded: "same-cell starts"
});

// Shared with focused boundary tests; buildSweep always supplies the frozen cap.
// Only a position-key -> first tick map is retained, never previous states.
function classifyStart(simulation, initial) {
  let state = initial;
  const { width, height, tickLimit } = initial;
  if (!Number.isInteger(tickLimit) || tickLimit < 0 || tickLimit > 10000) {
    throw new RangeError("Safety tick limit must be an integer from 0 to 10000");
  }
  const cells = width * height;
  const firstSeen = new Map();
  for (let tick = 0; tick <= tickLimit; tick++) {
    if (state.tick !== tick) throw new Error("Simulation made no consecutive tick progress");
    if (!["running", "caught", "limit"].includes(state.status)) throw new Error("Unknown simulation status");
    if (state.status === "limit" && tick < tickLimit) throw new Error("Simulation stopped before safety limit");
    for (const position of [state.human, state.zombie]) {
      if (!position || !Number.isInteger(position.x) || !Number.isInteger(position.y) ||
          position.x < 0 || position.x >= width || position.y < 0 || position.y >= height) {
        throw new Error("Simulation position outside the sweep board");
      }
    }
    // initialState() says running even for adjacent starts. Adjudicate tick
    // zero explicitly, without calling step() and losing a moving frame.
    if (state.status === "caught" || Math.abs(state.human.x - state.zombie.x) + Math.abs(state.human.y - state.zombie.y) <= 1) {
      return { outcome: "capture", stopTick: tick, cycleStart: null, period: null };
    }
    const key = (state.zombie.y * width + state.zombie.x) * cells + state.human.y * width + state.human.x;
    if (firstSeen.has(key)) {
      const cycleStart = firstSeen.get(key);
      return { outcome: "cycle", stopTick: tick, cycleStart, period: tick - cycleStart };
    }
    firstSeen.set(key, tick);
    if (tick === tickLimit) return { outcome: "unresolved", stopTick: tick, cycleStart: null, period: null };
    state = simulation.step(state);
  }
}

// This entire bounded runner executes inside one VM call, not one VM per tick.
function enumerate(simulation, config) {
  const initial = simulation.initialState();
  if (initial.width !== config.width || initial.height !== config.height) {
    throw new Error("Production board does not match the frozen sweep config");
  }
  const cells = config.width * config.height;
  const results = [];
  const summary = { total: 0, capture: 0, cycle: 0, unresolved: 0, initialCapture: 0 };
  for (let zombieId = 0; zombieId < cells; zombieId++) {
    for (let humanId = 0; humanId < cells; humanId++) {
      if (humanId === zombieId) continue;
      const state = {
        ...initial, tickLimit: config.safetyTickLimit,
        human: { x: humanId % config.width, y: Math.floor(humanId / config.width) },
        zombie: { x: zombieId % config.width, y: Math.floor(zombieId / config.width) }
      };
      const row = { id: `z${zombieId}-h${humanId}`, humanId, zombieId,
        ...classifyStart(simulation, state) };
      results.push(row);
      summary.total++; summary[row.outcome]++;
      if (row.outcome === "capture" && row.stopTick === 0) summary.initialCapture++;
    }
  }
  return { summary, results };
}

function buildSweep(options = {}) {
  const commit = options.commit ?? process.env.PREVIEW_COMMIT ?? "unknown";
  if (typeof commit !== "string") throw new TypeError("Commit metadata must be a string");
  const context = vm.createContext({ config: { ...CONFIG } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "simulation.js"), "utf8"), context, {
    filename: "simulation.js", timeout: 1000
  });
  const result = vm.runInContext(`const classifyStart = ${classifyStart.toString()};\n(${enumerate.toString()})(ZombieLab, config)`, context, {
    filename: "sweep-runner.js", timeout: 30000
  });
  return {
    schemaVersion: 1,
    metadata: { commit },
    config: { ...CONFIG },
    ...JSON.parse(JSON.stringify(result))
  };
}

module.exports = { buildSweep, classifyStart };

function main() {
  const out = path.resolve(process.argv[2] || process.env.PREVIEW_OUTPUT_DIR || "preview");
  const sweep = buildSweep();
  const json = JSON.stringify(sweep);
  const safe = json.replace(/[<>&\u2028\u2029]/g, character =>
    "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"));
  // Never clean the destination: the existing two-start replay lives here too.
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "sweep.json"), json + "\n");
  fs.writeFileSync(path.join(out, "sweep-data.js"), "globalThis.ZombieSweepData = " + safe + ";\n");
  console.log(`Swept ${sweep.summary.total} distinct starts: ${JSON.stringify(sweep.summary)} in ${out}`);
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error("Sweep build failed: " + error.message);
    process.exitCode = 1;
  }
}
