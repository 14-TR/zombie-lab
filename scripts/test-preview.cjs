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
function productionFrames() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, "simulation.js"), "utf8"), context, { timeout: 1000 });
  vm.runInContext("state = ZombieLab.initialState()", context, { timeout: 1000 });
  const frames = [];
  for (let count = 0; count <= 10000; count++) {
    const frame = JSON.parse(JSON.stringify(context.state));
    frames.push(frame);
    if (frame.status !== "running") return frames;
    vm.runInContext("state = ZombieLab.step(state)", context, { timeout: 1000 });
  }
  assert.fail("Production simulation did not terminate within 10000 ticks");
}

test("JSON captures every production frame from initial through terminal", (t) => {
  const out = temporary(t);
  succeeded(generate(out));
  const replay = JSON.parse(fs.readFileSync(path.join(out, "positions.json"), "utf8"));
  const expected = productionFrames();
  assert.equal(replay.schemaVersion, 1);
  assert.deepEqual(replay.frames, expected);
  assert.deepEqual(replay.frames.map(frame => frame.tick), Array.from({ length: expected.length }, (_, tick) => tick));
  assert.equal(replay.frames[0].tick, 0);
  assert.notEqual(replay.frames.at(-1).status, "running");
  assert.equal(new Set(replay.frames.map(frame => frame.tick)).size, expected.length);
});

test("CSV contains the ordered positions and terminal reason for every production tick", (t) => {
  const out = temporary(t);
  succeeded(generate(out));
  const csv = fs.readFileSync(path.join(out, "positions.csv"), "utf8");
  const expected = ["tick,human_x,human_y,zombie_x,zombie_y,status,reason", ...productionFrames().map(frame =>
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
  const csv = fs.readFileSync(path.join(out, "positions.csv"), "utf8");
  assert.equal(csv, 'tick,human_x,human_y,zombie_x,zombie_y,status,reason\r\n0,7,2,2,4,running,\r\n1,7,2,2,4,caught,"said ""caught"",\nthen stopped"\r\n');
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

test("a nonterminating simulation is bounded to 10000 steps", (t) => {
  const { script, out } = fixture(t, 'ZombieLab = { ...ZombieLab, step: state => ({ ...state, tick: state.tick + 1 }) };');
  const result = generate(out, {}, [], script);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /10000.*bound/i);
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
