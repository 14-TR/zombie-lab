"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const root = path.resolve(__dirname, "..");
function load() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, "simulation.js"), "utf8"), context);
  const file = path.join(root, "planning-view.js");
  assert.ok(fs.existsSync(file), "planning viewer must exist");
  vm.runInContext(fs.readFileSync(file, "utf8"), context);
  return { api: context.ZombiePlanningView, production: context.ZombieLab, context };
}
function result(z, h, b, t, comparison) {
  const outcome = n => typeof n === "number" ? { outcome: "capture", stopTick: n, cycleStart: null, period: null } : n;
  return { id: `z${z}-h${h}`, zombieId: z, humanId: h, baseline: outcome(b), treatment: outcome(t), comparison };
}
function fixture() {
  const categories = ["later", "earlier", "same", "escape", "unresolved"], results = [];
  for (let z = 0; z < 6; z++) for (let h = 0; h < 6; h++) if (z !== h) {
    const category = categories[results.length % categories.length];
    const treatment = category === "escape" ? { outcome: "cycle", stopTick: 6, cycleStart: 2, period: 4 } : category === "unresolved" ? { outcome: "unresolved", stopTick: 20, cycleStart: null, period: null } : category === "later" ? 8 : category === "earlier" ? 2 : 4;
    results.push(result(z, h, 4, treatment, category));
  }
  return { schemaVersion: 1, metadata: { commit: "SYNTHETIC_FIXTURE" }, config: { width: 3, height: 2, safetyTickLimit: 20, horizon: 2, policy: "two-tick-model-based", excluded: "same-cell starts" }, summary: { total: 30, baseline: { capture: 30, cycle: 0, unresolved: 0 }, treatment: { capture: 18, cycle: 6, unresolved: 6 }, later: 6, earlier: 6, same: 6, escape: 6, unresolved: 6 }, results };
}
test("complete scalar index validates every category, ID, outcome and summary without replay", () => {
  const { api } = load(), data = fixture(), before = JSON.stringify(data);
  assert.equal(typeof api.indexData, "function", "scalar index API must exist");
  const model = api.indexData(data);
  assert.equal(model.byZombie.length, 6);
  for (const row of data.results) assert.equal(model.byZombie[row.zombieId][row.humanId], row);
  for (let id = 0; id < 6; id++) assert.equal(model.byZombie[id][id], null);
  assert.equal(JSON.stringify(data), before);
  for (const mutate of [d => d.results.pop(), d => d.results[1] = d.results[0], d => d.results.reverse(), d => d.results[0].id = "z00-h1", d => d.results[0].comparison = "same", d => d.summary.escape++, d => d.summary.treatment.cycle--, d => d.results[3].treatment.period = 3, d => d.results[4].treatment.stopTick = 10, d => d.results[0].baseline.stopTick = Infinity, d => d.config.width = -1, d => d.config.horizon = 3, d => d.metadata = null]) {
    const broken = fixture(); mutate(broken); assert.throws(() => api.indexData(broken), /Invalid planning data/);
  }
});
test("same-start replay retains all frames and freezes capture and first-repeat endpoints", () => {
  const { api, production } = load();
  assert.equal(typeof api.replayRun, "function", "bounded production replay API must exist");
  const config = { width: 5, height: 3, safetyTickLimit: 50 };
  const row = result(0, 4, 0, 0, "same");
  let state = { ...production.initialState(), width: 5, height: 3, tickLimit: 50, zombie: { x: 0, y: 0 }, human: { x: 4, y: 0 } };
  const expectedFrames = [state];
  while (state.status === "running") { state = production.step(state); expectedFrames.push(state); }
  const baseline = { outcome: "capture", stopTick: state.tick, cycleStart: null, period: null };
  const a = api.replayRun(row, config, production, production.step, baseline);
  assert.equal(JSON.stringify(a.frames), JSON.stringify(expectedFrames));
  // Explicitly synthetic, time-independent policy for runner cycle coverage.
  const cycleStep = s => production.resolveTick(s, { zombie: s.zombie, human: { x: 4, y: s.human.y === 0 ? 1 : 0 } });
  const b = api.replayRun(row, config, production, cycleStep, { outcome: "cycle", stopTick: 2, cycleStart: 0, period: 2 });
  assert.equal(b.frames.length, 3);
  assert.equal(b.frames[2].status, "running", "cycle is a runner outcome, never fabricated capture");
  assert.deepEqual(b.frames[0].human, b.frames[2].human);
  const pair = { baseline: a, treatment: b, maxTick: Math.max(a.stopTick, b.stopTick) };
  for (let tick = 0; tick <= pair.maxTick; tick++) {
    const view = api.atTick(pair, tick);
    for (const name of ["baseline", "treatment"]) {
      assert.equal(view[name].localTick, Math.min(tick, pair[name].stopTick));
      assert.equal(view[name].frame, pair[name].frames[view[name].localTick]);
      assert.equal(view[name].frozen, tick > pair[name].stopTick);
    }
  }
  assert.equal(api.atTick(pair, -1).sharedTick, 0);
  assert.equal(api.atTick(pair, 999).sharedTick, pair.maxTick);
  assert.throws(() => api.atTick(pair, NaN), /Invalid tick/);
  for (const change of [{ stopTick: 3 }, { outcome: "capture" }, { cycleStart: 1 }, { period: 1 }]) assert.throws(() => api.replayRun(row, config, production, cycleStep, { outcome: "cycle", stopTick: 2, cycleStart: 0, period: 2, ...change }), /Replay mismatch/);
  const cutoff = api.replayRun(row, { ...config, safetyTickLimit: 1 }, production, cycleStep, { outcome: "unresolved", stopTick: 1, cycleStart: null, period: null });
  assert.equal(cutoff.frames.length, 2);
  const atCap = api.replayRun(row, { ...config, safetyTickLimit: 2 }, production, cycleStep, { outcome: "cycle", stopTick: 2, cycleStart: 0, period: 2 });
  assert.equal(atCap.outcome, "cycle", "first repetition has priority over cap");
  const adjacent = api.replayRun(result(0, 1, 0, 0, "same"), config, production, production.step, { outcome: "capture", stopTick: 0, cycleStart: null, period: null });
  assert.equal(adjacent.frames.length, 1); assert.equal(adjacent.frames[0].status, "caught");
  assert.throws(() => api.replayRun(row, config, production, s => s, baseline), /progress/);
  assert.throws(() => api.replayRun(row, config, production, s => ({ ...s, tick: s.tick + 1, status: "limit" }), baseline), /Premature production limit/);
  assert.throws(() => api.replayRun(row, config, production, s => ({ ...s, tick: s.tick + 1, status: "invented" }), baseline), /Unknown production status/);
});
function fakeDocument(html) {
  const all = [];
  function node(tag) {
    const n = { tagName: tag, children: [], attributes: {}, dataset: {}, style: {}, disabled: false, hidden: false, value: "", textContent: "", events: {}, classList: { toggle() {} }, setAttribute(k, v) { this.attributes[k] = String(v); }, appendChild(child) { this.children.push(child); return child; }, replaceChildren(...children) { this.children = children; }, addEventListener(k, fn) { this.events[k] = fn; } };
    all.push(n); return n;
  }
  const ids = {};
  for (const m of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"[^>]*>/g)) ids[m[2]] = node(m[1]);
  return { getElementById: id => ids[id] || null, createElement: node, createElementNS: (_, tag) => node(tag), createDocumentFragment: () => node("fragment"), querySelectorAll: () => all.filter(n => ["button", "select", "input"].includes(n.tagName)) };
}
function replayFixture(production) {
  const data = fixture();
  data.summary = { total: 30, baseline: { capture: 30, cycle: 0, unresolved: 0 }, treatment: { capture: 30, cycle: 0, unresolved: 0 }, later: 0, earlier: 0, same: 30, escape: 0, unresolved: 0 };
  data.results = data.results.map(r => {
    let state = { ...production.initialState(), ...{ width: 3, height: 2, tickLimit: 20 }, human: { x: r.humanId % 3, y: Math.floor(r.humanId / 3) }, zombie: { x: r.zombieId % 3, y: Math.floor(r.zombieId / 3) } };
    while (state.status === "running") state = production.step(state);
    assert.equal(state.status, "caught");
    return result(r.zombieId, r.humanId, state.tick, state.tick, "same");
  });
  return data;
}
test("standalone paired UI mounts selectors, map, full histories, controls and fail-closed mismatch", () => {
  const file = path.join(root, "planning.html");
  assert.ok(fs.existsSync(file), "standalone planning page must exist");
  const html = fs.readFileSync(file, "utf8");
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]), ["./simulation.js", "./planner.js", "./planning-data.js", "./planning-view.js"]);
  for (const id of ["planning-app", "summary", "selection", "zombie-start", "human-start", "play", "pause", "next", "reset", "scrubber", "timeline", "world-baseline", "world-treatment", "readout-baseline", "readout-treatment", "history-baseline", "history-treatment", "outcome-map", "comparison", "metadata", "error", "match", ...["later", "earlier", "same", "escape", "unresolved"].map(c => "count-" + c)]) assert.ok(html.includes(`id="${id}"`), id);
  for (const link of ["./compare.html", "./sweep.html", "./planning.json", "./experiments/ZL-008-lookahead.md"]) assert.ok(html.includes(`href="${link}"`));
  assert.match(html, /indefinite avoidance under fixed/i); assert.match(html, /unresolved/i); assert.match(html, /old.state/i); assert.doesNotMatch(html, /sweep-view.js|compare-view.js|type="module"/);
  const { api, production } = load(), data = replayFixture(production), doc = fakeDocument(html);
  assert.equal(typeof api.mount, "function", "paired viewer mount must exist");
  api.mount(doc, data, production, { step: production.step }); // Explicit fixture planner: baseline policy.
  const get = id => doc.getElementById(id);
  assert.equal(get("error").hidden, true);
  assert.equal(get("zombie-start").children.length, 6);
  assert.equal(get("human-start").children.filter(n => !n.disabled).length, 5);
  assert.equal(get("outcome-map").children.length, 6);
  assert.equal(get("count-same").textContent, "30");
  assert.match(get("selection").textContent, /not representative/);
  get("human-start").value = "5"; get("human-start").events.change();
  assert.equal(get("history-baseline").children.length, Number(get("scrubber").max) + 1);
  get("scrubber").value = get("scrubber").max; get("scrubber").events.input();
  assert.match(get("readout-baseline").textContent, /capture/);
  get("reset").events.click(); assert.match(get("timeline").textContent, /Shared tick 0/);
  get("next").events.click(); assert.match(get("timeline").textContent, /Shared tick 1/);
  data.results.find(r => r.zombieId === 0 && r.humanId === 5).treatment.stopTick++;
  get("human-start").events.change();
  assert.equal(get("error").hidden, false); assert.match(get("error").textContent, /Replay mismatch/);
  assert.equal(get("history-baseline").children.length, 0); assert.equal(get("world-treatment").children.length, 0);
  assert.equal(get("play").disabled, true); assert.equal(get("human-start").disabled, true);
});
let productionData;
function realData() {
  if (!productionData) productionData = require("./build-planning.cjs").buildPlanning({ commit: "VIEWER_TEST_WORKTREE" });
  return productionData;
}
test("actual planner replays all frozen pairs with complete histories and numerical outcome descriptions", { skip: !fs.existsSync(path.join(root, "scripts/build-planning.cjs")) }, () => {
  const { api, production, context } = load();
  vm.runInContext(fs.readFileSync(path.join(root, "planner.js"), "utf8"), context);
  const data = realData(), model = api.indexData(data);
  assert.equal(data.results.length, 4830); assert.equal(model.initialCapture, 246);
  let checked = 0;
  for (const row of data.results) {
    const pair = api.compare(model, row.zombieId, row.humanId, production, context.ZombiePlanner);
    for (const name of ["baseline", "treatment"]) assert.equal(pair[name].frames.length, row[name].stopTick + 1);
    assert.equal(JSON.stringify(pair.baseline.frames[0].human), JSON.stringify(pair.treatment.frames[0].human));
    const description = api.describeComparison(row);
    if (row.comparison === "escape") { assert.match(description, /indefinite avoidance/); assert.match(description, /No finite capture-time difference/); assert.match(description, /first repeat tick \d+, period \d+/); }
    assert.doesNotMatch(description, /Infinity|NaN/); checked++;
  }
  assert.equal(checked, 4830);
  for (const row of fixture().results) {
    const description = api.describeComparison(row);
    assert.doesNotMatch(description, /Infinity|NaN/);
    if (row.comparison === "unresolved") assert.match(description, /unresolved at safety cutoff tick 20/);
  }
  assert.throws(() => api.compare(model, 0, 0, production, context.ZombiePlanner), /Invalid starting/);
  assert.throws(() => api.compare(model, 0, 1, production, null), /Missing production/);
});
test("cached Chromium exercises actual desktop/mobile playback, map, all selectors and mismatch", { skip: !process.env.ZL008_PLAYWRIGHT, timeout: 120000 }, async () => {
  const { chromium } = require(process.env.ZL008_PLAYWRIGHT);
  const http = require("node:http"), { createHash } = require("node:crypto");
  const data = realData(), errors = [], receipts = process.env.ZL008_RECEIPTS || "/tmp/zl008-viewer-receipts";
  fs.mkdirSync(receipts, { recursive: true });
  const server = http.createServer((request, response) => {
    const name = decodeURIComponent(new URL(request.url, "http://localhost").pathname).slice(1);
    if (name === "favicon.ico") { response.writeHead(204); response.end(); return; }
    if (name === "planning-data.js") { response.setHeader("Content-Type", "application/javascript"); response.end("globalThis.ZombiePlanningData=" + JSON.stringify(data).replace(/</g, "\\u003c") + ";"); return; }
    if (name === "planning.json") { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(data)); return; }
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
    response.setHeader("Content-Type", name.endsWith(".js") ? "application/javascript" : name.endsWith(".html") ? "text/html" : "text/plain"); response.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    page.on("pageerror", e => errors.push(e.message));
    page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
    const url = `http://127.0.0.1:${server.address().port}/planning.html`;
    await page.goto(url); await page.waitForFunction(() => !document.getElementById("match").hidden);
    const selected = await page.locator("#comparison").textContent();
    assert.match(await page.locator("#selection").textContent(), /not representative/);
    assert.equal(await page.locator("#zombie-start option").count(), 70);
    assert.equal(await page.locator("#human-start option:not([disabled])").count(), 69);
    assert.equal(await page.locator("#outcome-map button").count(), 70);
    const coverage = await page.evaluate(() => {
      const model = ZombiePlanningView.indexData(ZombiePlanningData);
      return model.byZombie.reduce((n, row) => n + row.filter(Boolean).length, 0);
    });
    assert.equal(coverage, 4830);
    for (const category of ["later", "earlier", "same", "escape", "unresolved"]) assert.equal(await page.locator("#count-" + category).textContent(), String(data.summary[category]));
    await page.locator("#next").click(); assert.match(await page.locator("#timeline").textContent(), /Shared tick 1/);
    await page.locator("#play").click(); await page.waitForFunction(() => Number(document.getElementById("scrubber").value) >= 2); await page.locator("#pause").click();
    const paused = await page.locator("#timeline").textContent(); await page.waitForTimeout(450); assert.equal(await page.locator("#timeline").textContent(), paused);
    await page.locator("#scrubber").evaluate(el => { el.value = el.max; el.dispatchEvent(new Event("input")); });
    const endpoints = await page.evaluate(() => ({ baseline: document.getElementById("readout-baseline").textContent, treatment: document.getElementById("readout-treatment").textContent, histories: [document.getElementById("history-baseline").children.length, document.getElementById("history-treatment").children.length] }));
    assert.match(endpoints.baseline + endpoints.treatment, /frozen at/);
    await page.screenshot({ path: path.join(receipts, "desktop-endpoints.png"), fullPage: true });
    await page.locator("#reset").click(); assert.match(await page.locator("#timeline").textContent(), /Shared tick 0/);
    await page.locator("#zombie-start").selectOption("0"); await page.locator("#human-start").selectOption("1");
    assert.equal(await page.locator("#history-baseline tr").count(), 1); assert.equal(await page.locator("#play").isDisabled(), true);
    await page.locator("#outcome-map button").nth(3).click(); assert.equal(await page.locator("#human-start").inputValue(), "3");
    const mobile = [];
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, font: parseFloat(getComputedStyle(document.querySelector("#outcome-map button")).fontSize) }));
      assert.ok(layout.scrollWidth <= width, JSON.stringify(layout)); assert.ok(layout.font >= 12); mobile.push(layout);
      await page.screenshot({ path: path.join(receipts, `mobile-${width}.png`), fullPage: true });
    }
    await page.evaluate(() => { const z = Number(document.getElementById("zombie-start").value), h = Number(document.getElementById("human-start").value); ZombiePlanningData.results.find(r => r.zombieId === z && r.humanId === h).treatment.stopTick++; document.getElementById("human-start").dispatchEvent(new Event("change")); });
    assert.equal(await page.locator("#error").isVisible(), true); assert.match(await page.locator("#error").textContent(), /Replay mismatch/);
    assert.equal(await page.locator("#world-baseline > *").count(), 0); assert.equal(await page.locator("#history-treatment tr").count(), 0); assert.equal(await page.locator("#scrubber").isDisabled(), true);
    await page.screenshot({ path: path.join(receipts, "mismatch-disabled.png"), fullPage: true });
    assert.deepEqual(errors, []);
    const hashes = Object.fromEntries(["planning.html", "planning-view.js", "scripts/test-planning-view.cjs", "simulation.js", "planner.js"].map(name => [name, createHash("sha256").update(fs.readFileSync(path.join(root, name))).digest("hex")]));
    fs.writeFileSync(path.join(receipts, "browser.json"), JSON.stringify({ node: process.version, chromium: browser.version(), dataSource: "actual buildPlanning() / current worktree", metadata: data.metadata, dataSHA256: createHash("sha256").update(JSON.stringify(data)).digest("hex"), summary: data.summary, selected, endpoints, coverage, mobile, consoleErrors: errors, hashes }, null, 2) + "\n");
    console.log("Browser receipts: " + receipts);
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
test("default example follows frozen priority and enumeration ties, never claims representative", () => {
  const { api } = load();
  const original = result(42, 27, 15, 15, "same");
  const earlier = result(0, 3, 8, 4, "earlier");
  const later = result(0, 4, 2, 10, "later");
  const tied = result(0, 5, 3, 11, "later");
  const escape = result(1, 2, 8, { outcome: "cycle", stopTick: 6, cycleStart: 2, period: 4 }, "escape");
  for (const [rows, expected, criterion] of [
    [[original], original, /original/i],
    [[original, earlier], earlier, /first difference/i],
    [[tied, original, later, earlier], later, /largest positive/i],
    [[original, later, escape], escape, /first escape/i]
  ]) {
    const selection = api.selectDefault(rows);
    assert.equal(selection.row.id, expected.id);
    assert.match(selection.reason, criterion);
    assert.match(selection.reason, /selected example/i);
    assert.match(selection.reason, /not representative/i);
  }
});
