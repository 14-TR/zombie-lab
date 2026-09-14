"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");
const root = path.resolve(__dirname, "..");
const builder = path.join(__dirname, "build-preview.cjs");

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zombie-preview-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function generate(out, env = {}, args = [], script = builder, cwd = root) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd, env: { ...process.env, PREVIEW_OUTPUT_DIR: out, ...env },
    encoding: "utf8", timeout: 15000
  });
}
function succeeded(result) {
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
function productionFrames(humanX = 7) {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, "simulation.js"), "utf8"), context, { timeout: 1000 });
  vm.runInContext("state = { ...ZombieLab.initialState(), tickLimit: 10000 }", context, { timeout: 1000 });
  vm.runInContext("state = { ...state, human: { ...state.human, x: " + humanX + " } }", context, { timeout: 1000 });
  const frames = [];
  // Independent bounded production execution: do not assume a capture tick.
  const seen = new Set();
  for (let tick = 0; tick <= 10000; tick++) {
    const frame = JSON.parse(JSON.stringify(context.state));
    assert.equal(frame.tick, tick);
    frames.push(frame);
    const key = [frame.human.x, frame.human.y, frame.zombie.x, frame.zombie.y].join(",");
    if (frame.status === "caught" || seen.has(key) || tick === 10000) break;
    seen.add(key);
    vm.runInContext("state = ZombieLab.step(state)", context, { timeout: 1000 });
  }
  return frames;
}

test("combined comparison preserves schema and both complete production trajectories under adjacency capture", (t) => {
  const out = temporary(t);
  succeeded(generate(out));
  const replay = JSON.parse(fs.readFileSync(path.join(out, "positions.json"), "utf8"));
  assert.equal(replay.schemaVersion, 2);
  assert.deepEqual(replay.experiment, { name: "human-one-cell-west-adjacent-capture", safetyTickLimit: 10000, changedField: "human.x", playback: "treatment", captureRule: "shared-cell-or-orthogonally-adjacent-or-crossing" });
  assert.deepEqual(Object.keys(replay.metadata).sort(), ["commit", "ref", "repository"]);
  for (const [name, x, frames] of [["control", 7, replay.control.frames], ["treatment", 6, replay.frames]]) {
    const expected = productionFrames(x);
    assert.deepEqual(frames, expected, name + " exports every independently executed production state");
    assert.deepEqual(replay[name].initialState, expected[0]);
    assert.deepEqual(frames.map(frame => frame.tick), Array.from({ length: 74 }, (_, tick) => tick));
    assert.equal(new Set(frames.map(f => [f.human.x, f.human.y, f.zombie.x, f.zombie.y].join(","))).size, 74);
    for (const frame of frames.slice(0, -1)) {
      assert.equal(frame.status, "running");
      assert.ok(Math.abs(frame.human.x - frame.zombie.x) + Math.abs(frame.human.y - frame.zombie.y) > 1);
    }
    assert.deepEqual(replay[name].outcome, { type: "capture", tick: 73, reason: "orthogonally adjacent" });
    assert.deepEqual(frames.at(-1).human, { x: 0, y: 6 });
    assert.deepEqual(frames.at(-1).zombie, { x: 1, y: 6 });
    assert.equal(frames.at(-1).status, "caught");
    assert.equal(frames.at(-1).reason, "orthogonally adjacent");
  }
});

test("treatment changes only human.x from 7 to 6 under the identical production adjacency rule", (t) => {
  const out = temporary(t);
  succeeded(generate(out));
  const replay = JSON.parse(fs.readFileSync(path.join(out, "positions.json"), "utf8"));
  const control = replay.control.initialState, treatment = replay.treatment.initialState;
  assert.deepEqual(control.human, { x: 7, y: 2 });
  assert.deepEqual(treatment, { ...control, human: { ...control.human, x: 6 } });
  assert.deepEqual(treatment.zombie, { x: 2, y: 4 });
  assert.equal(treatment.tickLimit, 10000);
  assert.deepEqual(replay.outcome, replay.treatment.outcome);
  assert.notDeepEqual(replay.frames[10].human, replay.control.frames[10].human);
  for (let tick = 11; tick < replay.frames.length; tick++) {
    assert.deepEqual(replay.frames[tick].human, replay.control.frames[tick].human);
    assert.deepEqual(replay.frames[tick].zombie, replay.control.frames[tick].zombie);
  }
  const { createHash } = require("node:crypto");
  assert.equal(createHash("sha256").update(fs.readFileSync(path.join(root, "simulation.js"))).digest("hex"),
    "4ee5817ba528b163fca1347c49ad4c48de2dcae226dd800065e5048b5b9bb568", "integration preserves PR4 production source exactly");
});

test("fixed source and metadata generate byte-identical replay exports", (t) => {
  const first = temporary(t), second = temporary(t);
  const env = { PREVIEW_COMMIT: "determinism-check", PREVIEW_REF: "experiment/adjacent-capture" };
  succeeded(generate(first, env)); succeeded(generate(second, env));
  for (const file of ["index.html", "positions.json", "positions.csv"]) {
    assert.deepEqual(fs.readFileSync(path.join(first, file)), fs.readFileSync(path.join(second, file)));
  }
});

test("CSV contains the ordered positions and terminal reason for every production tick", (t) => {
  const out = temporary(t);
  succeeded(generate(out));
  const csv = fs.readFileSync(path.join(out, "positions.csv"), "utf8");
  const expected = ["tick,human_x,human_y,zombie_x,zombie_y,status,reason", ...productionFrames(6).map(frame =>
    [frame.tick, frame.human.x, frame.human.y, frame.zombie.x, frame.zombie.y, frame.status, frame.reason].join(",")
  )].join("\r\n") + "\r\n";
  assert.equal(csv, expected);
});

test("offline HTML embeds exact replay data and safely preserves hostile commit metadata", (t) => {
  const out = temporary(t);
  const commit = '</script><script>globalThis.injected=true</script><img src="https://invalid.example/x" onerror="alert(1)">&\u2028\u2029';
  const ref = 'feature/"<&branch';
  succeeded(generate(out, { PREVIEW_COMMIT: commit, PREVIEW_REF: ref, PREVIEW_REPOSITORY: "14-TR/zombie-lab" }));
  const replay = JSON.parse(fs.readFileSync(path.join(out, "positions.json"), "utf8"));
  assert.deepEqual(replay.metadata, { commit, ref, repository: "14-TR/zombie-lab" });
  const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
  const embedded = html.match(/<script id="replay-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(embedded, "one embedded replay payload");
  assert.deepEqual(JSON.parse(embedded[1]), replay);
  assert.doesNotMatch(embedded[1], /[<>&\u2028\u2029]/);
  assert.equal((html.match(/<script\b/g) || []).length, 2, "hostile metadata cannot introduce scripts");
  assert.doesNotMatch(html, /<(?:script|img|link|iframe)\b[^>]*(?:src|href)\s*=/i);
  assert.doesNotMatch(html, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/);
  assert.match(html, /default-src 'none'/);
  for (const id of ["world", "play", "pause", "back", "next", "scrubber", "positions", "metadata"]) {
    assert.ok(html.includes('id="' + id + '"'), "missing replay UI: " + id);
  }
  const executable = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(executable);
  assert.doesNotThrow(() => new vm.Script(executable[1]));
  assert.deepEqual(fs.readdirSync(out).sort(), ["index.html", "positions.csv", "positions.json"]);
});

function fixture(t, extension) {
  const dir = temporary(t);
  fs.mkdirSync(path.join(dir, "scripts"));
  fs.copyFileSync(builder, path.join(dir, "scripts", "build-preview.cjs"));
  fs.writeFileSync(path.join(dir, "simulation.js"), fs.readFileSync(path.join(root, "simulation.js"), "utf8") + "\n" + extension);
  return { script: path.join(dir, "scripts", "build-preview.cjs"), out: path.join(dir, "out") };
}

test("CSV correctly quotes commas, quotes, and newlines in state text", (t) => {
  const reason = 'said "caught",\nthen stopped';
  const { script, out } = fixture(t, `ZombieLab = { ...ZombieLab, step: state => ({ ...state, tick: state.tick + 1, status: "caught", reason: ${JSON.stringify(reason)} }) };`);
  succeeded(generate(out, {}, [], script));
  const replay = JSON.parse(fs.readFileSync(path.join(out, "positions.json"), "utf8"));
  assert.deepEqual(replay.outcome, { type: "capture", tick: 1, reason }, "capture takes precedence over a repeated pair");
  assert.equal(replay.frames.length, 2);
  const csv = fs.readFileSync(path.join(out, "positions.csv"), "utf8");
  assert.equal(csv, 'tick,human_x,human_y,zombie_x,zombie_y,status,reason\r\n0,6,2,2,4,running,\r\n1,6,2,2,4,caught,"said ""caught"",\nthen stopped"\r\n');
});

test("a missing or skipped tick fails instead of publishing an incomplete trajectory", (t) => {
  for (const advance of [0, 2, -1]) {
    const { script, out } = fixture(t, `ZombieLab = { ...ZombieLab, step: state => ({ ...state, tick: state.tick + ${advance}, status: "limit" }) };`);
    const result = generate(out, {}, [], script);
    assert.equal(result.status, 1, "must reject tick advance " + advance);
    assert.match(result.stderr, /progress|consecutive/i);
    assert.equal(fs.existsSync(out), false, "no partial output on capture failure");
  }
});

test("unknown terminal status is not silently accepted", (t) => {
  const { script, out } = fixture(t, 'ZombieLab = { ...ZombieLab, step: state => ({ ...state, tick: state.tick + 1, status: "broken" }) };');
  const result = generate(out, {}, [], script);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /status/i);
});

// Synthetic sequences only exist in copied temporary sources. Their enlarged
// board allows unique pairs through the safety boundary without changing policy.
function safetyFixture(t, endpointStatus = "limit", repeat = false) {
  return fixture(t, `
    const originalInitial = ZombieLab.initialState;
    ZombieLab = { ...ZombieLab,
      initialState: () => ({ ...originalInitial(), width: 20010 }),
      step: state => {
        const tick = state.tick + 1, last = tick === state.tickLimit;
        return { ...state, tick,
          human: { x: last && ${repeat} ? state.human.x - state.tick : state.human.x + 1, y: 2 },
          status: last ? ${JSON.stringify(endpointStatus)} : "running",
          reason: last && ${JSON.stringify(endpointStatus)} !== "running" ? "fixture endpoint" : ""
        };
      }
    };`);
}

test("a unique synthetic trajectory reports unresolved at the inclusive 10000-tick safety endpoint", (t) => {
  for (const status of ["limit", "running"]) {
    const { script, out } = safetyFixture(t, status);
    succeeded(generate(out, {}, [], script));
    const replay = JSON.parse(fs.readFileSync(path.join(out, "positions.json"), "utf8"));
    assert.deepEqual(replay.outcome, { type: "unresolved", tick: 10000, reason: "safety tick limit" });
    assert.equal(replay.frames.length, 10001);
    assert.deepEqual(replay.frames.map(frame => frame.tick), Array.from({ length: 10001 }, (_, tick) => tick));
    assert.equal(replay.frames.at(-1).status, status, "runner must preserve the source status");
  }
});

test("capture then cycle take precedence over safety on tick 10000", (t) => {
  for (const status of ["caught", "limit", "running"]) {
    const { script, out } = safetyFixture(t, status, true);
    succeeded(generate(out, {}, [], script));
    const replay = JSON.parse(fs.readFileSync(path.join(out, "positions.json"), "utf8"));
    assert.deepEqual(replay.outcome, status === "caught" ?
      { type: "capture", tick: 10000, reason: "fixture endpoint" } :
      { type: "cycle", startTick: 0, repeatTick: 10000, period: 10000, positionKey: "6,2,2,4" });
    assert.equal(replay.frames.length, 10001, "include the repeated/capture endpoint");
    assert.equal(replay.frames.at(-1).status, status);
  }
});

test("cycle key distinguishes all four coordinates and remembers tick zero", (t) => {
  const pairs = [[7, 2, 2, 4], [8, 2, 2, 4], [7, 3, 2, 4], [7, 2, 3, 4], [7, 2, 2, 5], [7, 2, 2, 4]];
  const { script, out } = fixture(t, `
    const pairs = ${JSON.stringify(pairs)};
    let startX;
    ZombieLab = { ...ZombieLab, step: state => {
      startX ??= state.human.x;
      const tick = state.tick + 1, [hx, hy, zx, zy] = pairs[tick];
      return { ...state, tick, human: { x: hx + startX - 7, y: hy }, zombie: { x: zx, y: zy } };
    } };`);
  succeeded(generate(out, {}, [], script));
  const replay = JSON.parse(fs.readFileSync(path.join(out, "positions.json"), "utf8"));
  assert.deepEqual(replay.outcome, { type: "cycle", startTick: 0, repeatTick: 5, period: 5, positionKey: "6,2,2,4" });
  assert.equal(replay.frames.length, pairs.length);
});

test("a premature source limit fails instead of claiming the safety bound was reached", (t) => {
  const { script, out } = fixture(t, 'ZombieLab = { ...ZombieLab, step: state => ({ ...state, tick: state.tick + 1, human: { x: 8, y: 2 }, status: "limit" }) };');
  const result = generate(out, {}, [], script);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /before.*safety/i);
  assert.equal(fs.existsSync(out), false);
});

test("an infinite individual step is interrupted by the VM timeout", (t) => {
  const { script, out } = fixture(t, 'ZombieLab = { ...ZombieLab, step() { while (true) {} } };');
  const result = generate(out, {}, [], script);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /timed out/i);
  assert.equal(fs.existsSync(out), false);
});

// Execute the generated page script with a minimal DOM for summary assertions.
// Real Canvas, interaction and network checks run separately in cached Chromium.
function summaryText(out, id = "outcome") {
  const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
  assert.match(html, /ZL-005 · Position and adjacency integration/);
  assert.match(html, /Both runs use.*orthogonally adjacent/);
  assert.match(html, /not diagonal/);
  assert.match(html, /before.*after.*simultaneous/);
  assert.match(html, /id="outcome"/);
  const payload = html.match(/<script id="replay-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  const elements = new Map();
  function element() {
    return { textContent: "", dataset: {}, width: 800, height: 560,
      appendChild() {}, setAttribute() {}, addEventListener() {},
      getContext: () => new Proxy({}, { get: () => () => {} }) };
  }
  const document = { createElement: element, getElementById(id) {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  } };
  document.getElementById("replay-data").textContent = payload;
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], { document }, { timeout: 1000 });
  return document.getElementById(id).textContent;
}

test("replay visibly compares labeled control and treatment starts and outcomes side by side", (t) => {
  const out = temporary(t);
  succeeded(generate(out));
  const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
  assert.match(html, /<table id="comparison">/);
  assert.match(html, /<th scope="col">Control<\/th><th scope="col">Treatment \(playback\)<\/th>/);
  assert.equal(summaryText(out, "control-start"), "Initial H (7, 2) · Z (2, 4)");
  assert.equal(summaryText(out, "treatment-start"), "Initial H (6, 2) · Z (2, 4)");
  assert.equal(summaryText(out, "control-outcome"), "Capture at tick 73 · orthogonally adjacent · safety limit 10000 ticks.");
  assert.equal(summaryText(out), "Capture at tick 73 · orthogonally adjacent · safety limit 10000 ticks.");
});

test("visible experiment summary reports exact cycle, capture, or unresolved outcome", (t) => {
  const out = temporary(t);
  succeeded(generate(out));
  assert.equal(summaryText(out), "Capture at tick 73 · orthogonally adjacent · safety limit 10000 ticks.");
  const cycle = fixture(t, 'ZombieLab = { ...ZombieLab, step: state => ({ ...state, tick: state.tick + 1 }) };');
  succeeded(generate(cycle.out, {}, [], cycle.script));
  assert.equal(summaryText(cycle.out), "Cycle detected · start tick 0 · repeat tick 1 · length 1 ticks · safety limit 10000 ticks.");
  const capture = fixture(t, 'ZombieLab = { ...ZombieLab, step: state => ({ ...state, tick: state.tick + 1, status: "caught", reason: "exchanged positions" }) };');
  succeeded(generate(capture.out, {}, [], capture.script));
  assert.equal(summaryText(capture.out), "Capture at tick 1 · exchanged positions · safety limit 10000 ticks.");
  const unresolved = safetyFixture(t);
  succeeded(generate(unresolved.out, {}, [], unresolved.script));
  assert.equal(summaryText(unresolved.out), "Unresolved at tick 10000 · safety tick limit · safety limit 10000 ticks.");
});

test("positional output overrides the environment and default is cwd/preview", (t) => {
  const dir = temporary(t);
  const explicit = path.join(dir, "nested", "explicit");
  const ignored = path.join(dir, "ignored");
  succeeded(generate(ignored, {}, [explicit]));
  assert.equal(fs.existsSync(path.join(explicit, "index.html")), true);
  assert.equal(fs.existsSync(ignored), false);
  succeeded(generate("", {}, [], builder, dir));
  assert.deepEqual(fs.readdirSync(path.join(dir, "preview")).sort(), ["index.html", "positions.csv", "positions.json"]);
});
