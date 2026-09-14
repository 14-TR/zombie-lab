"use strict";
// Build-time only: execute the unchanged production simulation in an isolated VM.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const SAFETY_TICK_LIMIT = 10000;

function captureFrames(humanX) {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "simulation.js"), "utf8"), context, {
    filename: "simulation.js", timeout: 1000
  });
  // Experiment-only override. Do not change the manual application's defaults.
  vm.runInContext("state = { ...ZombieLab.initialState(), tickLimit: " + SAFETY_TICK_LIMIT + " }", context, { timeout: 1000 });
  // Treatment changes just one coordinate on a copy; the control uses defaults.
  if (humanX !== undefined) vm.runInContext("state = { ...state, human: { ...state.human, x: " + humanX + " } }", context, { timeout: 1000 });
  const frames = [];
  const firstSeen = new Map();
  for (let count = 0; count <= SAFETY_TICK_LIMIT; count++) {
    const frame = JSON.parse(JSON.stringify(context.state));
    if (!frame || frame.tick !== count) throw new Error("Simulation made no consecutive tick progress at frame " + count);
    if (!["running", "caught", "limit"].includes(frame.status)) throw new Error("Unknown simulation status at tick " + count);
    if (frame.status === "limit" && count < SAFETY_TICK_LIMIT) throw new Error("Simulation stopped before the safety tick limit");
    frames.push(frame);
    // Runner outcomes never rewrite production status/reason. Include the
    // endpoint, then adjudicate capture before cycle before safety unresolved.
    if (frame.status === "caught") return { frames, outcome: { type: "capture", tick: frame.tick, reason: frame.reason } };
    const positionKey = [frame.human.x, frame.human.y, frame.zombie.x, frame.zombie.y].join(",");
    if (firstSeen.has(positionKey)) {
      const startTick = firstSeen.get(positionKey);
      return { frames, outcome: { type: "cycle", startTick, repeatTick: frame.tick, period: frame.tick - startTick, positionKey } };
    }
    firstSeen.set(positionKey, frame.tick);
    if (count === SAFETY_TICK_LIMIT) return { frames, outcome: { type: "unresolved", tick: frame.tick, reason: "safety tick limit" } };
    vm.runInContext("state = ZombieLab.step(state)", context, { timeout: 1000 });
  }
}

function renderHTML(replay) {
  // JSON in a script data block still needs HTML-parser escaping, not just JSON escaping.
  const payload = JSON.stringify(replay).replace(/[<>&\u2028\u2029]/g, character =>
    "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Zombie Lab · Offline replay</title>
<style>
:root { color-scheme: light; font: 16px/1.5 system-ui, sans-serif; color: #192733; background: #f4f5f2; }
* { box-sizing: border-box; }
body { max-width: 1000px; margin: auto; padding: 24px 16px; }
h1 { margin: 0; font-size: 1.8rem; } h2 { font-size: 1.2rem; }
p { margin: 8px 0 16px; } #metadata { overflow-wrap: anywhere; font: .85rem/1.5 monospace; }
canvas { width: 100%; height: auto; display: block; background: white; border: 1px solid #60717c; }
.controls { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; align-items: center; }
button { font: inherit; padding: 7px 16px; border: 1px solid #60717c; background: white; color: inherit; border-radius: 4px; cursor: pointer; }
button:disabled { opacity: .45; cursor: default; } :focus-visible { outline: 3px solid #126ea6; outline-offset: 2px; }
label { display: block; } input { width: 100%; } output { display: block; font-weight: 600; margin: 12px 0; }
.table-wrap { overflow-x: auto; } table { border-collapse: collapse; width: 100%; font-size: .9rem; }
th, td { border-bottom: 1px solid #c0c9cc; padding: 6px 8px; text-align: left; white-space: nowrap; }
#comparison { margin-bottom: 16px; } #comparison td { white-space: normal; width: 50%; vertical-align: top; }
tr[aria-current="true"] { background: #dcedf7; font-weight: 700; }
.note { color: #465964; font-size: .9rem; }
</style>
</head>
<body>
<h1>Zombie Lab · Offline replay</h1>
<h2>ZL-005 · Position and adjacency integration</h2>
<p>Combined comparison: control H (7, 2), treatment H (6, 2); Z stays (2, 4). Between these runs only human.x changes: 7 → 6. Both runs use the production shared-cell or orthogonally adjacent capture rule (Manhattan distance 1, not diagonal), checked before movement (including tick 0) and after simultaneous moves; exchanged positions still count. Board, movement and tie-breaking are unchanged. The common experiment-only safety limit is 10000 ticks (manual app: 40). Stop at capture, first repeated position pair, or safety limit, in that order. This integration is not the original ZL-003 position-only or ZL-004 capture-only result; those reports and evidence remain historical snapshots.</p>
<table id="comparison"><thead><tr><th scope="col">Control</th><th scope="col">Treatment (playback)</th></tr></thead><tbody>
<tr><td id="control-start"></td><td id="treatment-start"></td></tr>
<tr><td id="control-outcome"></td><td id="outcome" role="status"></td></tr>
</tbody></table>
<p class="note">One deterministic run per condition, not a statistical sample. Playback and the table below show the complete treatment trajectory; JSON also contains every control frame. Playback selects recorded frames, not simulation steps.</p>
<p id="metadata"></p>
<canvas id="world" width="800" height="560" role="img" aria-label="Recorded human and zombie positions; exact coordinates in the table below."></canvas>
<p class="note">Blue circle: H (human). Red square: Z (zombie). Origin (0, 0) is top-left; x goes right, y goes down.</p>
<div class="controls">
<button id="back" type="button">Back</button><button id="play" type="button">Play</button><button id="pause" type="button" disabled>Pause</button><button id="next" type="button">Next</button>
</div>
<label for="scrubber">Recorded tick</label><input id="scrubber" type="range" min="0" max="0" step="1" value="0">
<output id="readout" aria-live="polite"></output>
<h2>Complete treatment position history</h2>
<p class="note">Every recorded tick, including tick 0 and the stopping endpoint. Status and reason below are unchanged production fields; a cycle is a runner outcome, so its endpoint can still say running. The selected row is highlighted. Full states and outcome are in positions.json; coordinates are in positions.csv.</p>
<div class="table-wrap"><table><thead><tr><th scope="col">Tick</th><th scope="col">H x</th><th scope="col">H y</th><th scope="col">Z x</th><th scope="col">Z y</th><th scope="col">Status</th><th scope="col">Reason</th></tr></thead><tbody id="positions"></tbody></table></div>
<noscript>Enable JavaScript for offline playback, or read positions.csv / positions.json.</noscript>
<script id="replay-data" type="application/json">${payload}</script>
<script>
"use strict";
const replay = JSON.parse(document.getElementById("replay-data").textContent);
const frames = replay.frames;
const byId = id => document.getElementById(id);
const canvas = byId("world"), ctx = canvas.getContext("2d");
const slider = byId("scrubber"), play = byId("play"), pause = byId("pause");
let selected = 0, timer = null;
byId("metadata").textContent = "Source commit: " + replay.metadata.commit +
  (replay.metadata.repository ? " · Repository: " + replay.metadata.repository : "") +
  (replay.metadata.ref ? " · Ref: " + replay.metadata.ref : "");
for (const [name, run] of [["control", replay.control], ["treatment", replay.treatment]]) {
  const initial = run.initialState, outcome = run.outcome;
  byId(name + "-start").textContent = "Initial H (" + initial.human.x + ", " + initial.human.y + ") · Z (" + initial.zombie.x + ", " + initial.zombie.y + ")";
  byId(name === "control" ? "control-outcome" : "outcome").textContent = (outcome.type === "cycle" ?
    "Cycle detected · start tick " + outcome.startTick + " · repeat tick " + outcome.repeatTick + " · length " + outcome.period + " ticks" :
    outcome.type === "capture" ? "Capture at tick " + outcome.tick + " · " + outcome.reason :
    "Unresolved at tick " + outcome.tick + " · " + outcome.reason) +
    " · safety limit " + replay.experiment.safetyTickLimit + " ticks.";
}
const rows = frames.map(frame => {
  const row = document.createElement("tr");
  row.dataset.tick = frame.tick;
  for (const value of [frame.tick, frame.human.x, frame.human.y, frame.zombie.x, frame.zombie.y, frame.status, frame.reason]) {
    const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell);
  }
  byId("positions").appendChild(row); return row;
});
slider.max = frames.length - 1;
function stop() { if (timer !== null) clearInterval(timer); timer = null; play.disabled = false; pause.disabled = true; }
function render() {
  const frame = frames[selected];
  const cw = canvas.width / frame.width, ch = canvas.height / frame.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#c0c9cc"; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= frame.width; x++) { ctx.moveTo(x * cw, 0); ctx.lineTo(x * cw, canvas.height); }
  for (let y = 0; y <= frame.height; y++) { ctx.moveTo(0, y * ch); ctx.lineTo(canvas.width, y * ch); }
  ctx.stroke();
  const shared = frame.human.x === frame.zombie.x && frame.human.y === frame.zombie.y;
  const size = Math.min(cw, ch) * (shared ? .2 : .32);
  for (const [name, letter, color, shift] of [["human", "H", "#126ea6", -1], ["zombie", "Z", "#b63f3f", 1]]) {
    const position = frame[name], x = (position.x + .5) * cw + (shared ? shift * cw * .24 : 0), y = (position.y + .5) * ch;
    ctx.fillStyle = color;
    if (name === "human") { ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); }
    else ctx.fillRect(x - size, y - size, size * 2, size * 2);
    ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "bold " + Math.max(12, size) + "px system-ui"; ctx.fillText(letter, x, y);
  }
  canvas.setAttribute("aria-label", "Tick " + frame.tick + ": H (" + frame.human.x + ", " + frame.human.y + "), Z (" + frame.zombie.x + ", " + frame.zombie.y + ")");
  slider.value = selected;
  byId("readout").textContent = "Tick " + frame.tick + " / " + frames[frames.length - 1].tick + " · " + frame.status + (frame.reason ? " · " + frame.reason : "");
  byId("back").disabled = selected === 0; byId("next").disabled = selected === frames.length - 1;
  rows.forEach((row, index) => row.setAttribute("aria-current", String(index === selected)));
}
function select(index) { stop(); selected = Math.max(0, Math.min(frames.length - 1, index)); render(); }
byId("back").addEventListener("click", () => select(selected - 1));
byId("next").addEventListener("click", () => select(selected + 1));
slider.addEventListener("input", () => select(Number(slider.value)));
pause.addEventListener("click", stop);
play.addEventListener("click", () => {
  if (timer !== null) return;
  if (selected === frames.length - 1) { selected = 0; render(); }
  if (frames.length < 2) return;
  play.disabled = true; pause.disabled = false;
  timer = setInterval(() => { selected++; render(); if (selected === frames.length - 1) stop(); }, 250);
});
render();
</script>
</body>
</html>\n`;
}

function main() {
  const out = path.resolve(process.argv[2] || process.env.PREVIEW_OUTPUT_DIR || "preview");
  const control = captureFrames();
  const treatment = captureFrames(6);
  const replay = {
    schemaVersion: 2,
    metadata: { commit: process.env.PREVIEW_COMMIT ?? "unknown", ref: process.env.PREVIEW_REF ?? "", repository: process.env.PREVIEW_REPOSITORY ?? "" },
    experiment: { name: "human-one-cell-west-adjacent-capture", safetyTickLimit: SAFETY_TICK_LIMIT, changedField: "human.x", playback: "treatment", captureRule: "shared-cell-or-orthogonally-adjacent-or-crossing" },
    control: { initialState: control.frames[0], ...control },
    treatment: { initialState: treatment.frames[0], outcome: treatment.outcome },
    ...treatment
  };
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "positions.json"), JSON.stringify(replay, null, 2) + "\n");
  const csv = ["tick,human_x,human_y,zombie_x,zombie_y,status,reason", ...replay.frames.map(frame =>
    [frame.tick, frame.human.x, frame.human.y, frame.zombie.x, frame.zombie.y, frame.status, frame.reason].map(value => {
      const text = String(value);
      return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    }).join(",")
  )].join("\r\n") + "\r\n";
  fs.writeFileSync(path.join(out, "positions.csv"), csv);
  fs.writeFileSync(path.join(out, "index.html"), renderHTML(replay));
  console.log("Captured " + replay.frames.length + " frames in " + out);
}

try { main(); }
catch (error) {
  console.error("Preview build failed: " + error.message);
  process.exitCode = 1;
}
