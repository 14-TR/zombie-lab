"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { test } = require("node:test");
const root = path.resolve(__dirname, "..");
const policies = ["greedy", "depth1", "depth2"];
const point = id => ({ x: id % 10, y: Math.floor(id / 10) });
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const outcome = (name = "capture", tick = 3, start = null, period = null) => ({ outcome: name, stopTick: tick, cycleStart: start, period });
function load(extra = {}) {
  const file = path.join(root, "two-zombies-view.js");
  assert.ok(fs.existsSync(file), "classic two-zombie viewer must exist");
  const context = vm.createContext(extra);
  vm.runInContext(fs.readFileSync(file, "utf8"), context);
  return { api: context.ZombiePairView, context };
}
// Complete scalar fixture; not scientific outcomes or a replacement engine.
function fixture() {
  const results = [], summary = { total: 4761, initialCapture: 0, policies: Object.fromEntries(policies.map(p => [p, { capture: 0, cycle: 0, unresolved: 0 }])) };
  for (let z = 0; z < 70; z++) for (let h = 0; h < 70; h++) if (h !== 42 && h !== z) {
    const contact = [point(42), point(z)].some(p => distance(point(h), p) <= 1);
    if (contact) summary.initialCapture++;
    const outcomes = Object.fromEntries(policies.map(p => [p, outcome("capture", contact ? 0 : 3)]));
    for (const p of policies) summary.policies[p].capture++;
    results.push({ id: `z2-${z}-h${h}`, zombie2Id: z, humanId: h, outcomes });
  }
  return { schemaVersion: 1, metadata: { commit: "SYNTHETIC_FIXTURE_NOT_SCIENTIFIC_DATA" }, config: { width: 10, height: 7, zombie1Id: 42, safetyTickLimit: 10000, policies: policies.slice(), scope: "fixed-zombie1-slice" }, summary, results };
}
test("default priority is outcome difference, finite capture-time difference, then original start", () => {
  const { api } = load();
  assert.equal(typeof api.selectDefault, "function", "frozen example selection must exist");
  const row = (z, h, runs) => ({ id: `z2-${z}-h${h}`, zombie2Id: z, humanId: h, outcomes: Object.fromEntries(policies.map((p, i) => [p, runs[i]])) });
  const original = row(42, 27, [outcome(), outcome(), outcome()]);
  const times = row(0, 3, [outcome(), outcome("capture", 4), outcome("capture", 5)]);
  const timesTie = row(0, 4, [outcome(), outcome("capture", 8), outcome("capture", 5)]);
  const categories = row(1, 2, [outcome(), outcome("cycle", 4, 0, 4), outcome("unresolved", 10000)]);
  for (const [rows, expected, reason] of [[[original], original, /original/i], [[timesTie, original, times], times, /first.*finite capture/i], [[times, original, categories], categories, /first.*outcome/i]]) {
    const selected = api.selectDefault(rows);
    assert.equal(selected.row, expected); assert.match(selected.reason, reason); assert.match(selected.reason, /not representative/);
  }
  assert.match(api.describeRun(categories.outcomes.depth1), /first repeat tick 4.*period 4.*indefinite avoidance/);
  assert.match(api.describeRun(categories.outcomes.depth2), /unresolved.*10000.*not proof/);
  assert.match(api.describeComparison(categories), /No finite capture-time difference/);
  assert.match(api.describeComparison(times), /depth1 − greedy: \+1 ticks/);
  assert.doesNotMatch(api.describeComparison(categories), /NaN|Infinity|9997/);
});
function fakeDocument(html) {
  const all = [], ids = {};
  function node(tag) {
    const n = { tagName: tag, children: [], attributes: {}, dataset: {}, style: {}, disabled: false, hidden: false, value: "", textContent: "", events: {}, classList: { toggle() {} }, setAttribute(k, v) { this.attributes[k] = String(v); }, appendChild(child) { this.children.push(child); return child; }, replaceChildren(...children) { this.children = children; }, addEventListener(k, fn) { this.events[k] = fn; } };
    all.push(n); return n;
  }
  for (const m of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"[^>]*>/g)) ids[m[2]] = node(m[1]);
  return { getElementById: id => ids[id] || null, createElement: node, createElementNS: (_, tag) => node(tag), querySelectorAll: () => all.filter(n => ["button", "select", "input"].includes(n.tagName)) };
}
function uiFixture() {
  const data = fixture();
  for (const r of data.results) if (r.outcomes.greedy.stopTick !== 0) policies.forEach((p, i) => { r.outcomes[p].stopTick = i + 1; });
  return data;
}
test("standalone three-panel UI synchronizes controls, identities, histories, selectors and policy map", () => {
  const file = path.join(root, "two-zombies.html");
  assert.ok(fs.existsSync(file), "standalone three-panel page must exist");
  const html = fs.readFileSync(file, "utf8");
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]), ["./two-zombies.js", "./two-zombies-data.js", "./two-zombies-view.js"]);
  for (const link of ["./planning.html", "./two-zombies.json", "./experiments/ZL-009-two-zombies.md", "./experiments/ZL-009-protocol.md"]) assert.ok(html.includes(`href="${link}"`), link);
  assert.match(html, /NOT all possible three-agent starts/); assert.match(html, /old.state/); assert.match(html, /not.*unavoidable capture/i);
  let callback, cleared = 0;
  const { api } = load({ setInterval: fn => { callback = fn; return 1; }, clearInterval: () => { cleared++; } }), data = uiFixture(), doc = fakeDocument(html), get = id => doc.getElementById(id);
  api.mount(doc, data, syntheticEngine());
  assert.equal(get("error").hidden, true);
  assert.equal(get("zombie2-start").children.length, 70); assert.equal(get("human-start").children.filter(n => !n.disabled).length, 68);
  assert.equal(get("map-policy").children.length, 3); assert.equal(get("outcome-map").children.length, 70);
  assert.match(get("summary").textContent, /4761.*fixed-Z1/); assert.match(get("summary").textContent, /tick 0/);
  for (const p of policies) { assert.equal(get("count-" + p + "-capture").textContent, "4761"); assert.equal(get("count-" + p + "-cycle").textContent, "0"); assert.equal(get("count-" + p + "-unresolved").textContent, "0"); }
  get("map-policy").value = "depth2"; get("map-policy").events.change();
  assert.equal(get("outcome-map").children[2].textContent, "3");
  get("map-policy").value = "greedy"; get("map-policy").events.change();
  assert.equal(get("outcome-map").children[2].textContent, "1");
  get("zombie2-start").value = "42"; get("zombie2-start").events.change(); get("human-start").value = "27"; get("human-start").events.change();
  assert.equal(get("human-start").children.filter(n => !n.disabled).length, 69);
  for (const p of policies) {
    const svg = get("world-" + p), markers = svg.children.filter(n => n.attributes["data-agent"]);
    assert.equal(markers.length, 3); assert.match(svg.attributes["aria-label"], /Z1.*Z2.*co-located/);
    const z = markers.filter(n => n.attributes["data-agent"].startsWith("zombie"));
    assert.notEqual(z[0].attributes.x, z[1].attributes.x, "co-located zombies must not occlude each other");
    assert.equal(get("history-" + p).children.length, policies.indexOf(p) + 2);
    assert.equal(get("history-" + p).children[0].children.length, 6);
  }
  get("next").events.click(); assert.match(get("timeline").textContent, /Shared tick 1/);
  get("play").events.click(); callback(); get("pause").events.click(); assert.ok(cleared > 0); assert.match(get("timeline").textContent, /Shared tick 2/);
  get("scrubber").value = "3"; get("scrubber").events.input(); assert.match(get("readout-greedy").textContent, /Local tick 1.*shared tick 3.*frozen at capture endpoint/);
  get("reset").events.click(); assert.match(get("timeline").textContent, /Shared tick 0/);
  get("outcome-map").children[32].events.click(); assert.equal(get("human-start").value, "32"); assert.equal(get("play").disabled, true); assert.equal(get("history-depth2").children.length, 1);
  for (const p of policies) assert.match(get("readout-" + p).textContent, /capture endpoint/);
});
test("every selected outcome mismatch clears all stale playback and disables all controls", () => {
  const html = fs.readFileSync(path.join(root, "two-zombies.html"), "utf8"), { api } = load();
  for (const [field, value] of [["outcome", "cycle"], ["stopTick", 999], ["cycleStart", 0], ["period", 3]]) {
    const data = uiFixture(), doc = fakeDocument(html), get = id => doc.getElementById(id);
    api.mount(doc, data, syntheticEngine()); assert.equal(get("error").hidden, true);
    const row = data.results.find(r => r.humanId === Number(get("human-start").value) && r.zombie2Id === Number(get("zombie2-start").value));
    row.outcomes.depth2[field] = value; get("human-start").events.change();
    assert.equal(get("error").hidden, false); assert.match(get("error").textContent, /Replay mismatch/); assert.equal(get("match").hidden, true);
    for (const p of policies) { assert.equal(get("world-" + p).children.length, 0); assert.equal(get("history-" + p).children.length, 0); }
    assert.ok(doc.querySelectorAll().every(n => n.disabled)); assert.equal(get("scrubber").max, "0");
  }
  assert.doesNotThrow(() => load({ document: { getElementById: () => null } }), "no automatic mount on unrelated pages");
});
function syntheticEngine() {
  return {
    initialState(h = 69, z = 0) { return { width: 10, height: 7, tick: 0, tickLimit: 10000, human: point(h), zombies: [point(42), point(z)], status: "running", reason: "" }; },
    step(s, policy) {
      if (s.zombies.some(z => distance(s.human, z) <= 1)) return { ...s, status: "caught" };
      const tick = s.tick + 1, target = policies.indexOf(policy) + 1;
      return { ...s, tick, human: tick === target ? point(32) : point(69 - tick), status: tick === target ? "caught" : tick >= s.tickLimit ? "limit" : "running" };
    }
  };
}
test("selected three-run replay preserves initial/contact endpoints and shared local clocks", () => {
  const { api } = load(), engine = syntheticEngine(), data = fixture();
  const row = data.results.find(r => r.zombie2Id === 0 && r.humanId === 69);
  policies.forEach((p, i) => { row.outcomes[p] = outcome("capture", i + 1); });
  const model = api.indexData(data);
  assert.equal(typeof api.compare, "function", "selected same-start comparison must exist");
  const pair = api.compare(model, 0, 69, engine);
  assert.equal(pair.maxTick, 3);
  for (const p of policies) {
    assert.equal(pair[p].frames.length, row.outcomes[p].stopTick + 1);
    assert.deepEqual(pair[p].frames[0].human, point(69));
    assert.deepEqual(pair[p].frames[0].zombies, [point(42), point(0)]);
    assert.equal(pair[p].frames.at(-1).status, "caught");
  }
  for (let tick = 0; tick <= 3; tick++) {
    const view = api.atTick(pair, tick);
    for (const p of policies) { assert.equal(view[p].localTick, Math.min(tick, pair[p].stopTick)); assert.equal(view[p].frame, pair[p].frames[view[p].localTick]); assert.equal(view[p].frozen, tick > pair[p].stopTick); }
  }
  assert.equal(api.atTick(pair, -1).sharedTick, 0); assert.equal(api.atTick(pair, 999).sharedTick, 3);
  assert.throws(() => api.atTick(pair, NaN), /Invalid tick/);
  const adjacent = api.compare(model, 0, 1, engine);
  for (const p of policies) { assert.equal(adjacent[p].frames.length, 1); assert.equal(adjacent[p].frames[0].status, "caught"); }
  assert.throws(() => api.compare(model, 42, 42, engine), /Invalid starting/);
  assert.throws(() => api.compare(model, 0, 69, null), /Missing production/);
  // Explicit synthetic recurrence: H and Z1 repeat every tick; Z2 first repeats at tick 3.
  const cyc = { ...engine, step: s => ({ ...s, tick: s.tick + 1, zombies: [s.zombies[0], point((s.tick + 1) % 3)], status: s.tick + 1 >= s.tickLimit ? "limit" : "running" }) };
  const expected = outcome("cycle", 3, 0, 3), config = { ...data.config, safetyTickLimit: 3 };
  const run = api.replayRun(row, config, cyc, "depth2", expected);
  assert.equal(run.frames.length, 4); assert.equal(run.frames.at(-1).status, "limit");
  assert.equal(run.outcome, "cycle", "recurrence precedes cutoff, includes both ordered zombies");
  for (const change of [{ outcome: "capture" }, { stopTick: 4 }, { cycleStart: 1 }, { period: 2 }]) assert.throws(() => api.replayRun(row, config, cyc, "depth2", { ...expected, ...change }), /Replay mismatch/);
  assert.equal(api.replayRun(row, { ...config, safetyTickLimit: 2 }, cyc, "depth2", outcome("unresolved", 2)).frames.length, 3);
  assert.equal(api.replayRun(row, { ...config, safetyTickLimit: 1 }, engine, "greedy", outcome("capture", 1)).outcome, "capture");
  for (const [step, message] of [[s => s, /progress/], [s => ({ ...s, tick: 1, status: "limit" }), /Premature production limit/], [s => ({ ...s, tick: 1, status: "bogus" }), /Unknown production status/]]) assert.throws(() => api.replayRun(row, config, { ...engine, step }, "greedy", outcome()), message);
});
let productionData;
function realData() {
  if (!productionData) productionData = require("./build-two-zombies.cjs").buildTwoZombies({ commit: "VIEWER_TEST_WORKTREE" });
  return productionData;
}
function sourceHashes() {
  const { createHash } = require("node:crypto");
  return Object.fromEntries(["two-zombies.html", "two-zombies-view.js", "scripts/test-two-zombies-view.cjs", "two-zombies.js", "scripts/build-two-zombies.cjs"].map(name => [name, createHash("sha256").update(fs.readFileSync(path.join(root, name))).digest("hex")]));
}
test("actual engine replays all 14283 policy runs against every scalar outcome field", { skip: !fs.existsSync(path.join(root, "scripts/build-two-zombies.cjs")), timeout: 120000 }, () => {
  const { api, context } = load(), started = performance.now();
  vm.runInContext(fs.readFileSync(path.join(root, "two-zombies.js"), "utf8"), context);
  const data = realData(), model = api.indexData(data); let runs = 0, frames = 0;
  for (const row of data.results) {
    const pair = api.compare(model, row.zombie2Id, row.humanId, context.ZombiePair);
    for (const p of policies) {
      assert.equal(pair[p].frames.length, row.outcomes[p].stopTick + 1);
      assert.equal(JSON.stringify(pair[p].frames[0].human), JSON.stringify(point(row.humanId)));
      assert.equal(JSON.stringify(pair[p].frames[0].zombies), JSON.stringify([point(42), point(row.zombie2Id)]));
      runs++; frames += pair[p].frames.length;
    }
  }
  assert.equal(data.results.length, 4761); assert.equal(runs, 14283);
  const receipts = process.env.ZL009_RECEIPTS || "/tmp/zl009-viewer-receipts"; fs.mkdirSync(receipts, { recursive: true });
  fs.writeFileSync(path.join(receipts, "actual-replays.json"), JSON.stringify({ node: process.version, dataSource: "actual buildTwoZombies() and uncached production step / current worktree", rows: data.results.length, runs, frames, elapsedMs: performance.now() - started, summary: data.summary, selected: api.selectDefault(data.results), hashes: sourceHashes() }, null, 2) + "\n");
});
test("cached Chromium verifies actual worktree playback, mobile readability and fail-closed mismatch", { skip: !process.env.ZL009_PLAYWRIGHT, timeout: 120000 }, async () => {
  const { chromium } = require(process.env.ZL009_PLAYWRIGHT), http = require("node:http"), { createHash } = require("node:crypto");
  const data = realData(), errors = [], receipts = process.env.ZL009_RECEIPTS || "/tmp/zl009-viewer-receipts";
  fs.mkdirSync(receipts, { recursive: true });
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, "http://localhost").pathname).slice(1);
    if (name === "favicon.ico") { res.writeHead(204); res.end(); return; }
    if (name === "two-zombies-data.js") { res.setHeader("Content-Type", "application/javascript"); res.end("globalThis.ZombiePairData=" + JSON.stringify(data).replace(/</g, "\\u003c") + ";"); return; }
    if (name === "two-zombies.json") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data)); return; }
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", name.endsWith(".js") ? "application/javascript" : name.endsWith(".html") ? "text/html" : "text/plain"); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); let browser;
  try {
    browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/two-zombies.html`); await page.waitForFunction(() => !document.getElementById("match").hidden);
    const selected = await page.locator("#comparison").textContent(); assert.match(await page.locator("#selection").textContent(), /not representative/);
    assert.equal(await page.locator("#zombie2-start option").count(), 70); assert.equal(await page.locator("#outcome-map button").count(), 70);
    for (const p of policies) for (const k of ["capture", "cycle", "unresolved"]) assert.equal(await page.locator("#count-" + p + "-" + k).textContent(), String(data.summary.policies[p][k]));
    await page.locator("#scrubber").evaluate(el => { el.value = el.max; el.dispatchEvent(new Event("input")); });
    const endpoints = await page.evaluate(() => Object.fromEntries(["greedy", "depth1", "depth2"].map(p => [p, { readout: document.getElementById("readout-" + p).textContent, frames: document.getElementById("history-" + p).children.length }])));
    const { api } = load(), defaultRow = api.selectDefault(data.results).row;
    for (const p of policies) { assert.equal(endpoints[p].frames, defaultRow.outcomes[p].stopTick + 1); assert.match(endpoints[p].readout, /endpoint/); }
    await page.screenshot({ path: path.join(receipts, "desktop-endpoints.png"), fullPage: true });
    await page.locator("#zombie2-start").selectOption("42"); await page.locator("#human-start").selectOption("27");
    assert.equal(await page.locator("#human-start option:not([disabled])").count(), 69);
    for (const p of policies) {
      assert.match(await page.locator("#world-" + p).getAttribute("aria-label"), /co-located/);
      const boxes = await page.locator("#world-" + p + " [data-agent^=zombie]").evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { x: r.x, right: r.right, y: r.y }; }));
      assert.ok(boxes[0].right <= boxes[1].x, "both overlapping zombies remain visibly separate");
    }
    await page.locator("#next").click(); assert.match(await page.locator("#timeline").textContent(), /Shared tick 1/);
    await page.locator("#play").click(); await page.waitForFunction(() => Number(document.getElementById("scrubber").value) >= 2); await page.locator("#pause").click();
    const paused = await page.locator("#timeline").textContent(); await page.waitForTimeout(400); assert.equal(await page.locator("#timeline").textContent(), paused);
    await page.locator("#reset").click(); assert.match(await page.locator("#timeline").textContent(), /Shared tick 0/);
    const mapChecks = [];
    for (const p of policies) {
      await page.locator("#map-policy").selectOption(p);
      const cells = await page.locator("#outcome-map button").allTextContents(), rows = data.results.filter(r => r.zombie2Id === 42);
      for (const r of rows) assert.equal(cells[r.humanId], r.outcomes[p].outcome === "capture" ? String(r.outcomes[p].stopTick) : r.outcomes[p].outcome === "cycle" ? "C" : "?");
      mapChecks.push({ policy: p, cells: rows.length });
    }
    const mobile = [];
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const layout = await page.evaluate(() => { const t = document.querySelector("svg text"); return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, mapFont: parseFloat(getComputedStyle(document.querySelector(".map button")).fontSize), glyphPx: parseFloat(getComputedStyle(t).fontSize) * t.getScreenCTM().a }; });
      assert.ok(layout.scrollWidth <= width, JSON.stringify(layout)); assert.ok(layout.mapFont >= 12); assert.ok(layout.glyphPx >= 12, JSON.stringify(layout)); mobile.push(layout);
      await page.screenshot({ path: path.join(receipts, `mobile-${width}.png`), fullPage: true });
    }
    await page.locator("#outcome-map button").nth(32).click(); assert.equal(await page.locator("#human-start").inputValue(), "32"); assert.equal(await page.locator("#play").isDisabled(), true);
    for (const p of policies) assert.equal(await page.locator("#history-" + p + " tr").count(), 1);
    await page.evaluate(() => { const z = Number(document.getElementById("zombie2-start").value), h = Number(document.getElementById("human-start").value); ZombiePairData.results.find(r => r.zombie2Id === z && r.humanId === h).outcomes.depth2.stopTick++; document.getElementById("human-start").dispatchEvent(new Event("change")); });
    assert.equal(await page.locator("#error").isVisible(), true); assert.match(await page.locator("#error").textContent(), /Replay mismatch/);
    assert.equal(await page.locator("svg > *").count(), 0); assert.equal(await page.locator(".table-wrap tbody tr").count(), 0); assert.equal(await page.locator("#scrubber").isDisabled(), true);
    await page.screenshot({ path: path.join(receipts, "mismatch-disabled.png"), fullPage: true }); assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(receipts, "browser.json"), JSON.stringify({ node: process.version, chromium: browser.version(), dataSource: "actual buildTwoZombies() / current worktree; not packaged artifact or live publication", dataSHA256: createHash("sha256").update(JSON.stringify(data)).digest("hex"), summary: data.summary, selected, endpoints, mapChecks, mobile, consoleErrors: errors, hashes: sourceHashes() }, null, 2) + "\n");
    console.log("Browser receipts: " + receipts);
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
test("exact fixed-Z1 scalar index rejects incomplete, malformed or inconsistent datasets", () => {
  const { api } = load(), data = fixture(), before = JSON.stringify(data);
  const model = api.indexData(data);
  assert.equal(model.byZombie.length, 70);
  assert.equal(model.initialCapture, data.summary.initialCapture);
  for (const r of data.results) assert.equal(model.byZombie[r.zombie2Id][r.humanId], r);
  for (let z = 0; z < 70; z++) { assert.equal(model.byZombie[z][42], null); assert.equal(model.byZombie[z][z], null); }
  assert.equal(JSON.stringify(data), before);
  for (const mutate of [d => d.results.pop(), d => d.results.reverse(), d => d.results[1] = d.results[0], d => d.results[0].id = "z2-00-h1", d => d.config.scope = "all-world", d => d.config.zombie1Id = 0, d => d.config.width = 9, d => d.config.policies.reverse(), d => d.metadata = null, d => d.summary.initialCapture++, d => d.summary.policies.depth1.capture--, d => d.results[0].outcomes.greedy.stopTick = Infinity, d => d.results[0].outcomes.greedy.period = 1, d => d.results[0].outcomes.greedy = outcome("unresolved", 3), d => d.results[0].outcomes.greedy = outcome("cycle", 4, 2, 1), d => d.results[0].outcomes.greedy = outcome("capture", 1)]) {
    const broken = fixture(); mutate(broken); assert.throws(() => api.indexData(broken), /Invalid two-zombie data/);
  }
});
