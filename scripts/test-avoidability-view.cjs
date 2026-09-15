"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { test } = require("node:test");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const policies = ["greedy", "depth1", "depth2"];
const point = id => ({ x: id % 10, y: Math.floor(id / 10) });
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const clone = value => JSON.parse(JSON.stringify(value));
const scalar = (outcome = "capture", stopTick = 3, cycleStart = null, period = null) => ({ outcome, stopTick, cycleStart, period });
function load(extra = {}) {
  const file = path.join(root, "avoidability-view.js");
  assert.ok(fs.existsSync(file), "classic avoidability viewer must exist");
  const context = vm.createContext(extra);
  vm.runInContext(fs.readFileSync(path.join(root, "two-zombies.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(file, "utf8"), context);
  return { api: context.ZL_AvoidabilityView, production: context.ZombiePair, context };
}
// Complete interface fixture, NOT a graph solution or scientific evidence.
function fixture() {
  const results = [];
  for (let z = 0; z < 70; z++) for (let h = 0; h < 70; h++) if (h !== 42 && h !== z) {
    const contact = [point(42), point(z)].some(p => distance(point(h), p) <= 1);
    results.push({ id: `z2-${z}-h${h}`, human: point(h), zombie1: point(42), zombie2: point(z), stateIndex: (42 * 70 + z) * 70 + h, avoidable: !contact, maxCaptureTicks: contact ? 0 : null, policies: Object.fromEntries(policies.map(p => [p, scalar("capture", contact ? 0 : 3)])) });
  }
  return { schemaVersion: 1, metadata: { commit: "SYNTHETIC_FIXTURE_NOT_SCIENTIFIC_DATA", sourceHashes: { "two-zombies.js": createHash("sha256").update(fs.readFileSync(path.join(root, "two-zombies.js"))).digest("hex") } }, summary: {}, results, witnesses: [] };
}
function productionRun(production, h, z, policy) {
  let state = production.initialState(h, z), cycleStart = null, period = null, outcome;
  const frames = [], seen = new Map();
  for (;;) {
    frames.push(clone({ human: state.human, zombie1: state.zombies[0], zombie2: state.zombies[1], tick: state.tick }));
    const key = JSON.stringify([state.human, ...state.zombies]);
    if (state.status === "caught" || state.zombies.some(p => distance(state.human, p) <= 1)) { outcome = "capture"; break; }
    if (seen.has(key)) { outcome = "cycle"; cycleStart = seen.get(key); period = state.tick - cycleStart; break; }
    seen.set(key, state.tick); assert.ok(state.tick < 10000, "fixture must reach a real terminal"); state = production.step(state, policy);
  }
  return { frames, outcome, stopTick: state.tick, cycleStart, period };
}
function replayFixture(production) {
  const data = fixture();
  for (const [h, z, policy] of [[1, 0, "greedy"], [27, 42, "depth2"]]) {
    const row = data.results.find(r => r.id === `z2-${z}-h${h}`);
    for (const p of policies) { const { frames, ...run } = productionRun(production, h, z, p); row.policies[p] = run; }
    const { period, ...run } = productionRun(production, h, z, policy);
    data.witnesses.push({ id: row.id, reason: "SYNTHETIC interface example with production frames", ...run, cyclePeriod: period });
  }
  return data;
}
test("validates every provided frame with legal old-state actions and production capture/first recurrence", () => {
  const { api, production } = load(), data = replayFixture(production), model = api.indexData(data);
  assert.equal(typeof api.validateWitness, "function", "selected witness validator must exist");
  for (const w of data.witnesses) {
    const run = api.validateWitness(model.byId.get(w.id), w, production);
    for (const field of ["outcome", "stopTick", "cycleStart", "cyclePeriod"]) assert.equal(run[field], w[field]);
    assert.equal(run.frames.length, w.stopTick + 1); assert.deepEqual(clone(run.frames), w.frames);
  }
  const row = model.byId.get("z2-42-h27"), witness = data.witnesses[1];
  assert.equal(api.selectDefault(model).id, data.witnesses[0].id);
  for (const mutate of [w => w.outcome = "capture", w => w.stopTick++, w => w.cycleStart++, w => w.cyclePeriod++, w => w.frames.pop(), w => w.frames[1].tick++, w => w.frames[1].human.x = 99, w => w.frames[1].zombie1 = point(42), w => w.frames[0].zombie2 = point(41), w => w.frames.push(clone(w.frames.at(-1)))]) {
    const bad = clone(witness); mutate(bad); assert.throws(() => api.validateWitness(row, bad, production), /Replay mismatch/);
  }
  assert.throws(() => api.validateWitness(row, witness, null), /Missing production/);
  assert.throws(() => api.validateWitness({ ...row, avoidable: false, maxCaptureTicks: 24 }, witness, production), /Replay mismatch/);
  const captured = productionRun(production, 27, 42, "greedy");
  const finiteWitness = { id: row.id, reason: "synthetic rank; not a graph solution", ...captured, cyclePeriod: null };
  assert.equal(api.validateWitness({ ...row, avoidable: false, maxCaptureTicks: captured.stopTick }, finiteWitness, production).outcome, "capture");
  assert.throws(() => api.validateWitness({ ...row, avoidable: false, maxCaptureTicks: captured.stopTick + 1 }, finiteWitness, production), /Replay mismatch/);
  assert.throws(() => api.validateWitness(row, finiteWitness, production), /Replay mismatch/);
  const extra = clone(data.witnesses[0]); extra.frames.push({ ...clone(extra.frames[0]), tick: 1 }); extra.stopTick = 1;
  assert.throws(() => api.validateWitness(model.byId.get(extra.id), extra, production), /Replay mismatch/);
});
test("never labels an unresolved cutoff as a measured capture-delay shortfall", () => {
  const { api } = load();
  assert.equal(typeof api.interpretPolicy, "function");
  assert.match(api.interpretPolicy({ avoidable: false, maxCaptureTicks: 12000 }, scalar("unresolved", 10000)), /unresolved.*not.*capture.delay/i);
  assert.doesNotMatch(api.interpretPolicy({ avoidable: false, maxCaptureTicks: 12000 }, scalar("unresolved", 10000)), /2000/);
  assert.match(api.interpretPolicy({ avoidable: false, maxCaptureTicks: 12 }, scalar("capture", 7)), /shortfall 5 ticks/);
  assert.match(api.interpretPolicy({ avoidable: false, maxCaptureTicks: 0 }, scalar("capture", 0)), /before.*policy can act/i);
});
test("compares frozen legacy outcomes and identifies the first action divergence, not just outcomes", () => {
  const { api, production } = load(), data = fixture(), row = data.results.find(r => r.id === "z2-21-h60");
  for (const p of policies) { const { frames, ...run } = productionRun(production, 60, 21, p); row.policies[p] = run; }
  assert.equal(typeof api.comparePolicies, "function", "selected legacy comparison must exist");
  const compared = api.comparePolicies(row, production);
  assert.ok(compared.divergence && Number.isInteger(compared.divergence.tick));
  assert.notDeepEqual(compared.divergence.depth1, compared.divergence.depth2);
  assert.match(api.describeRow(row), /avoidable policy failure/i);
  assert.match(api.describeRow({ ...row, avoidable: false, maxCaptureTicks: 3 }), /maximum.*3 ticks/i);
  for (const field of ["outcome", "stopTick", "cycleStart", "period"]) {
    const bad = clone(row); bad.policies.depth2[field] = field === "outcome" ? "cycle" : 999;
    assert.throws(() => api.comparePolicies(bad, production), /Replay mismatch/);
  }
});
function fakeDocument(html) {
  const ids = {}, all = [];
  function node(tagName) {
    const n = { tagName, children: [], attributes: {}, dataset: {}, style: {}, events: {}, hidden: false, disabled: false, value: "", textContent: "",
      setAttribute(k, v) { this.attributes[k] = String(v); }, appendChild(child) { this.children.push(child); return child; }, replaceChildren(...children) { this.children = children; }, addEventListener(event, fn) { this.events[event] = fn; } };
    all.push(n); return n;
  }
  for (const m of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"[^>]*>/g)) ids[m[2]] = node(m[1]);
  return { getElementById: id => ids[id] || null, createElement: node, createElementNS: (_, tag) => node(tag), querySelectorAll: () => all.filter(n => ["button", "input", "select"].includes(n.tagName)) };
}
test("file-compatible page shows witness identities, complete history and working playback; mismatch clears stale UI", () => {
  const file = path.join(root, "avoidability.html"); assert.ok(fs.existsSync(file), "standalone avoidability page must exist");
  const html = fs.readFileSync(file, "utf8");
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]), ["./two-zombies.js", "./avoidability-data.js", "./avoidability-view.js"]);
  assert.doesNotMatch(html, /type="module"|https?:\/\//);
  for (const href of ["./experiments/ZL-010-avoidability.md", "./experiments/ZL-010-protocol.md", "./avoidability.json", "./avoidability-certificate.json", "./two-zombies.html"]) assert.ok(html.includes(`href="${href}"`), href);
  let callback, clears = 0;
  const { api, production } = load({ setInterval: fn => { callback = fn; return 1; }, clearInterval: () => clears++ });
  const data = replayFixture(production), doc = fakeDocument(html), get = id => doc.getElementById(id);
  api.mount(doc, data, production); assert.equal(get("error").hidden, true); assert.equal(get("witness").children.length, 2);
  assert.equal(get("history").children.length, 1); assert.equal(get("play").disabled, true);
  get("witness").value = "z2-42-h27"; get("witness").events.change();
  assert.equal(get("history").children.length, 25); assert.equal(get("history").children[0].children.length, 5);
  assert.match(get("classification").textContent, /avoidable policy failure/);
  const markers = get("world").children.filter(n => n.attributes["data-agent"]);
  assert.equal(markers.length, 3); assert.notEqual(markers[1].attributes.x, markers[2].attributes.x);
  assert.match(get("world").attributes["aria-label"], /H.*Z1.*Z2.*co-located/);
  get("play").events.click(); callback(); get("pause").events.click(); assert.ok(clears > 0); assert.match(get("timeline").textContent, /Tick 1 /);
  get("next").events.click(); assert.match(get("timeline").textContent, /Tick 2 /);
  get("scrubber").value = "24"; get("scrubber").events.input(); assert.match(get("readout").textContent, /first-repeat.*not capture/i);
  get("reset").events.click(); assert.match(get("timeline").textContent, /Tick 0 /);
  data.witnesses[1].cyclePeriod++; get("witness").events.change();
  assert.equal(get("error").hidden, false); assert.match(get("error").textContent, /Replay mismatch/); assert.equal(get("match").hidden, true);
  for (const id of ["world", "history", "policy-results", "totals", "witness"]) assert.equal(get(id).children.length, 0, id);
  for (const id of ["summary", "classification", "metadata", "divergence", "selection"]) assert.equal(get(id).textContent, "", id);
  assert.ok(doc.querySelectorAll().every(n => n.disabled)); assert.equal(get("scrubber").max, "0");
  const emptyDoc = fakeDocument(html); api.mount(emptyDoc, fixture(), production);
  assert.equal(emptyDoc.getElementById("error").hidden, true); assert.match(emptyDoc.getElementById("selection").textContent, /No witness/);
  const missingDoc = fakeDocument(html); api.mount(missingDoc, undefined, production); assert.equal(missingDoc.getElementById("error").hidden, false);
  assert.doesNotThrow(() => load({ document: { getElementById: () => null } }));
});
let actualLoaded = false, actual = null, actualSource = "not available";
function actualData() {
  if (actualLoaded) return actual; actualLoaded = true;
  const file = process.env.ZL010_DATA || ["avoidability.json", "evidence/avoidability/avoidability.json"].map(p => path.join(root, p)).find(p => fs.existsSync(p));
  if (file) { actual = JSON.parse(fs.readFileSync(file, "utf8")); actualSource = file; }
  else {
    const builder = path.join(root, "scripts/build-avoidability.cjs");
    if (fs.existsSync(builder)) {
      const build = require(builder).buildAvoidability;
      if (typeof build === "function") { const built = build({ commit: "VIEWER_TEST_WORKTREE" }); actual = built.data || built; actualSource = "actual buildAvoidability() / current worktree"; }
    }
  }
  return actual;
}
test("actual data: every supplied witness and all 30 outcome-disagreement action divergences", { timeout: 120000 }, t => {
  const data = actualData(); if (!data) { t.skip("No actual artifact or complete builder available; no waiting or polling"); return; }
  const { api, production } = load(), model = api.indexData(data); let frames = 0;
  assert.equal(model.witnesses.size, 32, "final builder must supply all 32 witnesses, not an empty intermediate");
  assert.equal(data.summary.witnessCount, model.witnesses.size);
  assert.equal(model.stats.initialContact, data.summary.initialContact);
  assert.equal(model.stats.unavoidableNoninitial, data.summary.noninitialUnavoidable);
  assert.equal(model.stats.avoidable, data.summary.avoidable);
  for (const w of data.witnesses) { const row = model.byId.get(w.id); frames += api.validateWitness(row, w, production).frames.length; api.comparePolicies(row, production); }
  assert.equal(frames, 734);
  assert.equal(frames, data.summary.witnessFrames);
  assert.equal(frames - model.witnesses.size, data.summary.witnessTransitions);
  const disagreements = data.results.filter(r => r.policies.depth1.outcome !== r.policies.depth2.outcome);
  assert.equal(disagreements.length, 30);
  for (const row of disagreements) { assert.ok(model.witnesses.has(row.id), row.id + " missing witness"); assert.ok(api.comparePolicies(row, production).divergence, row.id + " missing actual action divergence"); }
  console.log(JSON.stringify({ actualSource, rows: model.byId.size, witnesses: model.witnesses.size, frames, disagreements: disagreements.length, stats: model.stats }));
});
test("cached Chromium: real file:// classic scripts, playback, mobile labels, co-location and fail-closed mismatch", { skip: !process.env.ZL010_PLAYWRIGHT, timeout: 120000 }, async () => {
  const { chromium } = require(process.env.ZL010_PLAYWRIGHT), { pathToFileURL } = require("node:url"), os = require("node:os");
  const { production } = load(), receipts = process.env.ZL010_RECEIPTS || path.join(os.tmpdir(), "zl010-viewer-receipts");
  fs.mkdirSync(receipts, { recursive: true });
  const datasets = [{ name: "fixture", source: "synthetic scalar interface fixture with real production frames, NOT scientific data", data: replayFixture(production) }];
  const real = actualData(); if (real) datasets.push({ name: "actual", source: actualSource, data: real });
  const browser = await chromium.launch({ headless: true }), results = [];
  try {
    for (const dataset of datasets) {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), "zl010-file-view-")), errors = [], page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
      for (const name of ["avoidability.html", "avoidability-view.js", "two-zombies.js"]) fs.copyFileSync(path.join(root, name), path.join(temp, name));
      const emittedScript = dataset.name === "actual" && fs.existsSync(actualSource) ? path.join(path.dirname(actualSource), "avoidability-data.js") : null;
      const dataScriptSource = emittedScript && fs.existsSync(emittedScript) ? emittedScript : "test-generated classic-script wrapper";
      if (dataScriptSource === emittedScript) fs.copyFileSync(emittedScript, path.join(temp, "avoidability-data.js"));
      else fs.writeFileSync(path.join(temp, "avoidability-data.js"), "window.ZL_AVOIDABILITY_DATA=" + JSON.stringify(dataset.data).replace(/</g, "\\u003c") + ";\n");
      const dataScriptSha256 = createHash("sha256").update(fs.readFileSync(path.join(temp, "avoidability-data.js"))).digest("hex");
      page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
      await page.goto(pathToFileURL(path.join(temp, "avoidability.html")).href);
      assert.equal(await page.evaluate(() => JSON.stringify(window.ZL_AVOIDABILITY_DATA)), JSON.stringify(dataset.data), "emitted classic-script data must match the tested JSON artifact");
      assert.equal(await page.locator("#error").isVisible(), false, await page.locator("#error").textContent());
      assert.equal(await page.locator("#witness option").count(), dataset.data.witnesses.length);
      for (const w of dataset.data.witnesses) {
        await page.locator("#witness").selectOption(w.id);
        assert.equal(await page.locator("#match").isVisible(), true, w.id + ": " + await page.locator("#error").textContent());
        assert.equal(await page.locator("#history tr").count(), w.frames.length);
        await page.locator("#scrubber").evaluate(el => { el.value = el.max; el.dispatchEvent(new Event("input")); });
        assert.match(await page.locator("#readout").textContent(), w.outcome === "cycle" ? /first-repeat.*not capture/i : /capture endpoint/i);
      }
      const selected = dataset.data.witnesses.find(w => w.id === "z2-42-h27") || dataset.data.witnesses.find(w => w.stopTick > 1) || dataset.data.witnesses[0];
      const mobile = [];
      if (selected) {
        await page.locator("#witness").selectOption(selected.id);
        if (selected.stopTick > 1) {
          await page.locator("#play").click(); await page.waitForFunction(() => Number(document.getElementById("scrubber").value) >= 1); await page.locator("#pause").click();
          const paused = await page.locator("#timeline").textContent(); await page.waitForTimeout(450); assert.equal(await page.locator("#timeline").textContent(), paused);
          await page.locator("#reset").click(); assert.match(await page.locator("#timeline").textContent(), /Tick 0 /);
          await page.locator("#next").click(); assert.match(await page.locator("#timeline").textContent(), /Tick 1 /);
          await page.locator("#reset").click();
        }
        await page.screenshot({ path: path.join(receipts, dataset.name + "-desktop.png"), fullPage: true });
        for (const width of [320, 390]) {
          await page.setViewportSize({ width, height: 844 });
          const layout = await page.evaluate(() => {
            const labels = [...document.querySelectorAll("#world text")], markers = [...document.querySelectorAll("#world [data-agent]")];
            return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, glyphPx: labels.map(t => parseFloat(getComputedStyle(t).fontSize) * t.getScreenCTM().a), markers: markers.map(m => { const r = m.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y, bottom: r.bottom }; }) };
          });
          assert.ok(layout.scrollWidth <= width, JSON.stringify(layout)); assert.ok(layout.glyphPx.every(n => n >= 12), JSON.stringify(layout));
          if (dataset.name === "fixture") assert.ok(layout.markers[1].right <= layout.markers[2].x, "co-located zombies must not occlude each other");
          mobile.push(layout); await page.screenshot({ path: path.join(receipts, dataset.name + "-mobile-" + width + ".png"), fullPage: true });
        }
        await page.evaluate(() => { const id = document.getElementById("witness").value; ZL_AVOIDABILITY_DATA.witnesses.find(w => w.id === id).stopTick++; document.getElementById("witness").dispatchEvent(new Event("change")); });
        assert.equal(await page.locator("#error").isVisible(), true); assert.equal(await page.locator("#world > *").count(), 0); assert.equal(await page.locator("#history tr").count(), 0); assert.equal(await page.locator("#totals tr").count(), 0);
        assert.equal(await page.locator("button:enabled,select:enabled,input:enabled").count(), 0); assert.equal(await page.locator("#summary").textContent(), "");
      }
      assert.deepEqual(errors, []); results.push({ name: dataset.name, source: dataset.source, dataScriptSource, dataScriptSha256, fileURL: true, witnesses: dataset.data.witnesses.length, frames: dataset.data.witnesses.reduce((sum, w) => sum + w.frames.length, 0), mobile, errors });
      await page.close(); fs.rmSync(temp, { recursive: true, force: true });
    }
    const hashes = Object.fromEntries(["avoidability.html", "avoidability-view.js", "scripts/test-avoidability-view.cjs", "two-zombies.js"].map(p => [p, createHash("sha256").update(fs.readFileSync(path.join(root, p))).digest("hex")]));
    fs.writeFileSync(path.join(receipts, "browser.json"), JSON.stringify({ node: process.version, chromium: browser.version(), scope: "current-worktree file:// verification; not downloaded artifact or live deployment", results, hashes }, null, 2) + "\n");
    console.log("Browser receipts: " + receipts);
  } finally { await browser.close(); }
});
test("indexes the complete frozen fixed-Z1 slice without inventing absent witness categories", () => {
  const { api } = load(), data = fixture(), before = JSON.stringify(data), model = api.indexData(data);
  assert.equal(model.byId.size, 4761);
  assert.equal(model.stats.total, 4761);
  assert.equal(model.stats.initialContact + model.stats.unavoidableNoninitial + model.stats.avoidable, 4761);
  assert.equal(model.stats.unavoidableNoninitial, 0);
  assert.equal(api.selectDefault(model), null);
  assert.equal(JSON.stringify(data), before);
  for (const mutate of [d => d.schemaVersion = 2, d => d.results.pop(), d => d.results.reverse(), d => d.results[0].id = "z2-00-h1", d => d.results[0].stateIndex++, d => d.results[0].avoidable = true, d => d.results[0].maxCaptureTicks = 1, d => d.results[0].policies.greedy.period = 1, d => d.metadata.sourceHashes = null, d => d.witnesses.push({ id: "missing" })]) {
    const broken = fixture(); mutate(broken);
    assert.throws(() => api.indexData(broken), /Invalid avoidability data/);
  }
});
