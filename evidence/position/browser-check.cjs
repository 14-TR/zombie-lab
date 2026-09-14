"use strict";
// Verification only: reuse cached Playwright/Chromium, no installs or server.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require(process.argv[2]);
const dir = __dirname;
const replay = JSON.parse(fs.readFileSync(path.join(dir, "replay", "positions.json"), "utf8"));
(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3], headless: true });
  const receipt = { started: new Date().toISOString(), browser: browser.version(), checks: [], requests: [], errors: [] };
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
    page.on("request", request => receipt.requests.push(request.url()));
    page.on("pageerror", error => receipt.errors.push(error.message));
    page.on("requestfailed", request => receipt.errors.push(request.url() + ": " + request.failure().errorText));
    await page.addInitScript(() => {
      globalThis.draws = [];
      for (const name of ["clearRect", "arc", "fillRect"]) {
        const original = CanvasRenderingContext2D.prototype[name];
        CanvasRenderingContext2D.prototype[name] = function (...args) {
          if (name === "clearRect") globalThis.draws = [];
          else globalThis.draws.push({ name, args });
          return original.apply(this, args);
        };
      }
    });
    await page.goto(pathToFileURL(path.join(dir, "replay", "index.html")).href);
    assert.equal(await page.locator("#control-start").innerText(), "Initial H (7, 2) · Z (2, 4)");
    assert.equal(await page.locator("#treatment-start").innerText(), "Initial H (6, 2) · Z (2, 4)");
    for (const id of ["control-outcome", "outcome"]) assert.match(await page.locator("#" + id).innerText(), /start tick 88 · repeat tick 102 · length 14 ticks/);
    receipt.checks.push("side-by-side control/treatment labels, starts and exact outcomes");
    await page.screenshot({ path: path.join(dir, "replay-desktop.png") });
    const table = await page.locator("#positions tr").evaluateAll(rows => rows.map(row => Array.from(row.cells, cell => cell.textContent)));
    assert.deepEqual(table, replay.frames.map(f => [f.tick, f.human.x, f.human.y, f.zombie.x, f.zombie.y, f.status, f.reason].map(String)));
    receipt.checks.push("complete treatment table: " + table.length + " rows");
    const recorded = await page.evaluate(() => {
      const frames = JSON.parse(document.getElementById("replay-data").textContent).frames;
      return frames.map((frame, index) => {
        const slider = document.getElementById("scrubber");
        slider.value = index; slider.dispatchEvent(new Event("input", { bubbles: true }));
        return { tick: document.querySelector('#positions tr[aria-current="true"]').dataset.tick,
          label: document.getElementById("world").getAttribute("aria-label"), draws: globalThis.draws };
      });
    });
    for (const [i, f] of replay.frames.entries()) {
      const cw = 800 / f.width, ch = 560 / f.height, size = Math.min(cw, ch) * .32;
      assert.equal(recorded[i].tick, String(f.tick));
      assert.equal(recorded[i].label, `Tick ${f.tick}: H (${f.human.x}, ${f.human.y}), Z (${f.zombie.x}, ${f.zombie.y})`);
      assert.deepEqual(recorded[i].draws, [
        { name: "arc", args: [(f.human.x + .5) * cw, (f.human.y + .5) * ch, size, 0, Math.PI * 2] },
        { name: "fillRect", args: [(f.zombie.x + .5) * cw - size, (f.zombie.y + .5) * ch - size, size * 2, size * 2] }
      ]);
    }
    receipt.checks.push("all " + recorded.length + " scrubbed ticks: real Canvas calls, coordinates and selected row");
    await page.locator("#scrubber").focus();
    await page.keyboard.press("Home");
    assert.equal(await page.locator("#scrubber").inputValue(), "0");
    await page.keyboard.press("End");
    assert.equal(await page.locator("#scrubber").inputValue(), "102");
    await page.locator("#back").click();
    assert.equal(await page.locator("#scrubber").inputValue(), "101");
    await page.locator("#play").click();
    await page.waitForFunction(() => document.getElementById("pause").disabled && document.getElementById("scrubber").value === "102");
    await page.waitForTimeout(400);
    assert.equal(await page.locator("#scrubber").inputValue(), "102");
    await page.locator("#play").click();
    await page.locator("#pause").click();
    assert.ok(Number(await page.locator("#scrubber").inputValue()) < 3);
    receipt.checks.push("keyboard endpoints, Back, playback endpoint stop and restart/pause");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(dir, "replay-mobile.png") });
    receipt.checks.push("390px viewport without page overflow");
    // Reuse the recorded frames: hostile metadata check requires no new trial.
    const hostile = '</script><script>globalThis.injected=true</script><img src="https://invalid.example/x">&\u2028\u2029';
    const html = fs.readFileSync(path.join(dir, "replay", "index.html"), "utf8");
    const payload = JSON.stringify({ ...replay, metadata: { commit: hostile, ref: hostile, repository: hostile } })
      .replace(/[<>&\u2028\u2029]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
    // A fresh page isolates top-level const bindings from the first replay.
    const hostilePage = await browser.newPage();
    hostilePage.on("request", request => receipt.requests.push(request.url()));
    hostilePage.on("pageerror", error => receipt.errors.push(error.message));
    hostilePage.on("requestfailed", request => receipt.errors.push(request.url() + ": " + request.failure().errorText));
    await hostilePage.setContent(html.replace(/(<script id="replay-data" type="application\/json">)[\s\S]*?(<\/script>)/, (_, open, close) => open + payload + close));
    assert.equal(await hostilePage.evaluate(() => globalThis.injected), undefined);
    assert.ok((await hostilePage.locator("#metadata").innerText()).includes(hostile));
    receipt.checks.push("hostile metadata remains literal text, no injected script");
    assert.deepEqual(receipt.errors, []);
    assert.equal(receipt.requests.filter(url => !url.startsWith("file:")).length, 0);
    receipt.checks.push("zero page errors, failed loads or external requests");
    receipt.framesChecked = recorded.length;
    receipt.finished = new Date().toISOString();
    receipt.passed = true;
  } catch (error) {
    receipt.passed = false; receipt.failure = error.stack; process.exitCode = 1;
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(dir, "browser.json"), JSON.stringify(receipt, null, 2) + "\n");
    console.log(JSON.stringify(receipt, null, 2));
  }
})();
