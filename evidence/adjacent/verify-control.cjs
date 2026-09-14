"use strict";
// Read only the pinned baseline blob, never another experiment's worktree.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "../..");
const commit = "6a690bd8801db120957dd77fc5d84da680f7bd06";
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
const source = git("show", commit + ":simulation.js");
const current = fs.readFileSync(path.join(root, "simulation.js"), "utf8");
assert.equal(current.split("  function same(")[0], source.split("  function same(")[0], "initial state, directions and policy must be byte-identical");
assert.equal(current.slice(current.indexOf("  function step(")), source.slice(source.indexOf("  function step(")), "step policy wiring must be unchanged");
assert.equal(fs.readFileSync(path.join(root, "app.js"), "utf8"), git("show", commit + ":app.js"), "manual rendering and controls must be unchanged");
const builder = fs.readFileSync(path.join(root, "scripts/build-preview.cjs"), "utf8");
const baselineBuilder = git("show", commit + ":scripts/build-preview.cjs");
assert.equal(builder.split("function renderHTML(")[0], baselineBuilder.split("function renderHTML(")[0], "runner remains fixed-start with only its original cap override");
assert.equal(builder.match(/timer = setInterval\([^\n]+/)[0], baselineBuilder.match(/timer = setInterval\([^\n]+/)[0], "playback speed must be unchanged");
const context = vm.createContext({});
vm.runInContext(source, context, { timeout: 1000 });
vm.runInContext("state = { ...ZombieLab.initialState(), tickLimit: 10000 }", context, { timeout: 1000 });
const frames = [], seen = new Map();
let outcome;
for (let tick = 0; tick <= 10000; tick++) {
  const frame = JSON.parse(JSON.stringify(context.state));
  assert.equal(frame.tick, tick); frames.push(frame);
  const key = [frame.human.x, frame.human.y, frame.zombie.x, frame.zombie.y].join(",");
  if (frame.status === "caught") { outcome = { type: "capture", tick, reason: frame.reason }; break; }
  if (seen.has(key)) { outcome = { type: "cycle", startTick: seen.get(key), repeatTick: tick, period: tick - seen.get(key), positionKey: key }; break; }
  if (tick === 10000) { outcome = { type: "unresolved", tick }; break; }
  seen.set(key, tick);
  vm.runInContext("state = ZombieLab.step(state)", context, { timeout: 1000 });
}
assert.deepEqual({ ...outcome, positionKey: undefined }, { type: "cycle", startTick: 88, repeatTick: 102, period: 14, positionKey: undefined });
const adjacent = JSON.parse(fs.readFileSync(path.join(__dirname, "replay/positions.json"), "utf8"));
for (const frame of adjacent.frames) {
  for (const field of ["width", "height", "tick", "tickLimit", "human", "zombie", "decisions"]) assert.deepEqual(frame[field], frames[frame.tick][field]);
  if (frame.tick < 73) assert.deepEqual(frame, frames[frame.tick]);
}
const receipt = {
  executedAt: new Date().toISOString(), sourceCommit: commit,
  sourceBlob: git("rev-parse", commit + ":simulation.js").trim(),
  sourceSha256: createHash("sha256").update(source).digest("hex"),
  tickLimitOverride: 10000, outcome, frameCount: frames.length,
  unchangedChecks: ["initial state, grid, directions, policy, tie order", "step wiring", "manual app rendering/controls", "fixed-start replay runner", "playback speed"],
  comparison: { identicalFullFramesThroughTick: 72, identicalMovementAndDecisionsThroughTick: 73, adjacentOutcome: adjacent.outcome },
  frames
};
fs.writeFileSync(path.join(__dirname, "control-baseline.json"), JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({ ...receipt, frames: undefined }, null, 2));
