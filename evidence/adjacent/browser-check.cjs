"use strict";
// Verification only: reuse explicitly supplied cached tools; never install.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium } = require(process.argv[2]);
const root = path.resolve(__dirname, "../..");
(async () => {
  const browser = await chromium.launch({ executablePath: process.argv[3], headless: true });
  const receipt = { startedAt: new Date().toISOString(), browser: browser.version(), checks: [], errors: [], failedRequests: [], externalRequests: [] };
  const page = await browser.newPage({ viewport: { width: 1000, height: 1100 } });
  page.on("pageerror", error => receipt.errors.push(error.message));
  page.on("requestfailed", request => receipt.failedRequests.push(request.url()));
  page.on("request", request => { if (/^https?:/.test(request.url())) receipt.externalRequests.push(request.url()); });
  const open = file => page.goto(pathToFileURL(path.join(root, file)).href);
  const check = name => receipt.checks.push({ name, passed: true });
  try {
    await open("tests.html");
    receipt.suite = await page.evaluate(() => ZombieLabTestResults);
    receipt.coverage = await page.evaluate(() => ZombieLabTestCoverage);
    assert.equal(receipt.suite.failed, 0);
    await page.screenshot({ path: path.join(__dirname, "tests.png"), fullPage: true });
    check("browser core, Canvas and DOM suite");

    await open("index.html");
    assert.match(await page.locator(".intro").innerText(), /Adjacent-capture experiment/);
    assert.match(await page.locator(".rules").innerText(), /orthogonally adjacent.*not diagonal/s);
    assert.match(await page.locator("[data-positions]").innerText(), /\(7, 2\).*\(2, 4\)/);
    await page.screenshot({ path: path.join(__dirname, "manual-initial.png"), fullPage: true });
    await page.locator("[data-step]").click();
    assert.match(await page.locator("[data-status]").innerText(), /tick 1 \/ 40/);
    await page.evaluate(() => { for (let i = 0; i < 45; i++) document.querySelector("[data-step]").click(); });
    assert.equal(await page.locator("[data-step]").isDisabled(), true);
    assert.match(await page.locator("[data-status]").innerText(), /Tick limit reached · tick 40 \/ 40/);
    await page.locator("[data-reset]").click();
    assert.match(await page.locator("[data-status]").innerText(), /tick 0 \/ 40/);
    assert.match(await page.locator("[data-positions]").innerText(), /\(7, 2\).*\(2, 4\)/);
    check("manual rule labels, exact start, Step, terminal cap and Reset");

    await open("evidence/adjacent/replay/index.html");
    const replay = JSON.parse(fs.readFileSync(path.join(__dirname, "replay/positions.json"), "utf8"));
    assert.deepEqual(await page.evaluate(() => JSON.parse(document.getElementById("replay-data").textContent)), replay);
    assert.equal(await page.locator("#positions tr").count(), 74);
    assert.equal(await page.locator("#outcome").innerText(), "Capture at tick 73 · orthogonally adjacent · safety limit 10000 ticks.");
    assert.match(await page.locator("h2").first().innerText(), /Adjacent-capture experiment/);
    await page.locator("#next").click();
    assert.match(await page.locator("#readout").innerText(), /Tick 1 \/ 73/);
    await page.locator("#back").click();
    assert.match(await page.locator("#readout").innerText(), /Tick 0 \/ 73/);
    await page.locator("#scrubber").fill("73");
    assert.match(await page.locator("#readout").innerText(), /Tick 73 \/ 73 · caught · orthogonally adjacent/);
    assert.equal(await page.locator("#next").isDisabled(), true);
    assert.equal(await page.locator('tr[aria-current="true"]').getAttribute("data-tick"), "73");
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(__dirname, "replay-capture.png"), fullPage: false });
    check("replay full trajectory, capture outcome, next/back/scrub and final selection");
    await page.locator("#play").click();
    await page.waitForFunction(() => document.getElementById("readout").textContent.startsWith("Tick 1 /"));
    await page.locator("#pause").click();
    const paused = await page.locator("#readout").innerText();
    await page.waitForTimeout(350);
    assert.equal(await page.locator("#readout").innerText(), paused);
    check("play restarts from endpoint and pause freezes recorded frame");
    await page.setViewportSize({ width: 390, height: 1100 });
    await page.locator("#scrubber").fill("73");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(__dirname, "replay-narrow.png"), fullPage: false });
    check("390px replay has no horizontal overflow");
    assert.deepEqual(receipt.errors, []); assert.deepEqual(receipt.failedRequests, []); assert.deepEqual(receipt.externalRequests, []);
    check("no page errors, failed loads or external page requests");
    receipt.passed = true;
  } catch (error) {
    receipt.passed = false; receipt.failure = error.stack; process.exitCode = 1;
  } finally {
    receipt.finishedAt = new Date().toISOString();
    await browser.close();
    fs.writeFileSync(path.join(__dirname, "browser.json"), JSON.stringify(receipt, null, 2) + "\n");
    console.log(JSON.stringify(receipt, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
