'use strict';
// Required real-package verification with explicitly supplied cached dependencies.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const {pathToFileURL} = require('node:url');
const [site, modulePath, executablePath, out] = process.argv.slice(2);
if (!site || !modulePath || !executablePath || !out) throw Error('site cached-playwright-core cached-chromium output required');
// Missing real artifact fails even before browser/module discovery.
const expected = JSON.parse(fs.readFileSync(path.join(site, 'recorded-cases.json'), 'utf8'));
assert.equal(expected.cases.length, 24);
assert.equal(new Set(expected.cases.map(c => c.id)).size, 24);
const {chromium} = require(modulePath);
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.mkdirSync(out, {recursive:true});

(async () => {
  const started = performance.now();
  // Chromium navigates file:// download links; verify saves over read-only loopback.
  // Serve only these exact public artifact leaves, never arbitrary filesystem paths.
  const served = new Set(['index.html','recorded-cases.json','metrics.csv','report.json','report.csv']);
  const server = http.createServer((request,response) => {
    const name = request.url.slice(1);
    if (request.url === '/favicon.ico') {response.writeHead(204);response.end();return;}
    if (request.method !== 'GET' || !served.has(name)) {response.writeHead(404);response.end();return;}
    response.setHeader('Content-Type',name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.json')?'application/json':'text/csv');
    response.end(fs.readFileSync(path.join(site,name)));
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:'+server.address().port;
  const browser = await chromium.launch({executablePath, headless:true});
  const results = [];
  try {
    for (const width of [320,390,1200]) {
      const page = await browser.newPage({viewport:{width,height:900},deviceScaleFactor:1,acceptDownloads:true});
      const errors = [], external = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => {if (m.type()==='error') errors.push(m.text());});
      page.on('request', r => {if (/^https?:/.test(r.url()) && !r.url().startsWith(origin+'/')) external.push(r.url());});
      await page.goto(pathToFileURL(path.resolve(site,'index.html')).href);
      assert.deepEqual(await page.locator('#data').evaluate(e => JSON.parse(e.textContent)), expected);
      assert.equal(await page.locator('#case option').count(),24);
      assert.equal(await page.locator('textarea,input:not([type="range"]),[contenteditable="true"]').count(),0);
      assert.match(await page.locator('#diagnostic-status').textContent(), /no incremental gate benefit/);
      assert.match(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), /connect-src 'none'/);
      await page.screenshot({path:path.join(out,`overview-${width}.png`)});
      let frames = 0, arms = 0, minMapFont = Infinity;
      for (const [index, c] of expected.cases.entries()) {
        await page.selectOption('#case',String(index));
        assert.equal(await page.locator('#text').textContent(),c.text);
        for (const method of ['jev','parser']) {
          await page.selectOption('#method',method);
          const v = c[method];
          const raw = JSON.parse(await page.locator('#raw').textContent());
          assert.deepEqual(raw.interpretation,v.raw_interpretation);
          assert.deepEqual(raw.decision,v.raw_decision);
          const gated = JSON.parse(await page.locator('#gate').textContent());
          assert.deepEqual(gated.decision,v.gated_decision);
          assert.equal(gated.required_clarification,v.required_clarification);
          assert.equal(gated.raw_clarification,v.raw_clarification);
          assert.deepEqual(JSON.parse(await page.locator('#gold-reference').textContent()), {interpretation:c.gold.interpretation,authorized_decision:v.gold_trace.decision});
          assert.deepEqual(JSON.parse(await page.locator('#request').textContent()),c.request);
          assert.equal(await page.locator('#response').textContent(),c.raw_response_utf8 || 'No response / no model agency');
          for (const arm of ['raw','gated','gold']) {
            await page.selectOption('#arm',arm);
            const trace = v[arm+'_trace'];
            assert.equal(await page.locator('#scrub').getAttribute('max'),String(trace.frames.length-1));
            assert.deepEqual(JSON.parse(await page.locator('#frames').textContent()),trace.frames);
            for (const [tick, frame] of trace.frames.entries()) {
              await page.locator('#scrub').evaluate((e,t) => {e.value=String(t);e.dispatchEvent(new Event('input',{bubbles:true}));},tick);
              assert.equal(await page.locator('#tick').textContent(),`${tick} / ${trace.frames.length-1}`);
              const text = await page.locator('#event').textContent();
              assert.ok(text.startsWith(frame.location+' · '+frame.event+' · '));
              assert.ok(text.includes('Mara accompanying: '+frame.companion));
              assert.ok(text.includes('outcome '+trace.outcome));
              assert.ok(text.includes('secondary goal completed: '+trace.goal_completed));
              const matched = arm === 'gold' || v[arm+'_metrics'].trace_match;
              assert.ok((await page.locator('#replay-authority').textContent()).includes('Primary authorized trace: '+(matched?'MATCH':'MISMATCH')));
              const points = {Yard:[45,40],Depot:[45,115],West:[140,175],East:[235,75],Shelter:[235,175]};
              const marker = page.locator('#map circle[fill="#79d5a4"]');
              assert.equal(await marker.getAttribute('cx'),String(points[frame.location][0]));
              assert.equal(await marker.getAttribute('cy'),String(points[frame.location][1]));
              assert.equal(await page.locator('#map text').filter({hasText:/^M$/}).count(),frame.companion?1:0);
              frames++;
            }
            arms++;
            const fonts = await page.locator('#map text').evaluateAll(nodes => nodes.map(e => parseFloat(getComputedStyle(e).fontSize)*Math.hypot(e.getScreenCTM().a,e.getScreenCTM().b)));
            minMapFont=Math.min(minMapFont,...fonts);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),`overflow ${width}/${c.id}/${method}/${arm}`);
          }
        }
      }
      // Real control behavior, including pause stability and exact stopping endpoint.
      const movingIndex=expected.cases.findIndex(c=>c.jev.raw_trace.frames.length>2);
      await page.selectOption('#case',String(movingIndex));
      await page.selectOption('#method','jev');
      await page.selectOption('#arm','raw');
      await page.locator('#reset').click();
      assert.equal(await page.locator('#scrub').inputValue(),'0');
      await page.locator('#play').click();
      assert.equal(await page.locator('#play').textContent(),'Pause');
      await page.locator('#play').click();
      assert.equal(await page.locator('#play').textContent(),'Play');
      const paused=await page.locator('#scrub').inputValue();
      await page.waitForTimeout(750);
      assert.equal(await page.locator('#scrub').inputValue(),paused);
      await page.locator('#play').click();
      await page.waitForFunction(()=>document.getElementById('scrub').value===document.getElementById('scrub').max && document.getElementById('play').textContent==='Play',{}, {timeout:5000});
      await page.locator('#scrub').focus();
      await page.keyboard.press('ArrowLeft');
      assert.equal(Number(await page.locator('#scrub').inputValue()),expected.cases[movingIndex].jev.raw_trace.frames.length-2);
      await page.keyboard.press('ArrowRight');
      await page.locator('#next-case').click();
      assert.equal(await page.locator('#case').inputValue(),String(movingIndex+1));
      await page.locator('#previous-case').click();
      assert.equal(await page.locator('#case').inputValue(),String(movingIndex));
      await page.locator('#reset').click();
      assert.equal(await page.locator('#scrub').inputValue(),'0');
      const mismatchIndex=expected.cases.findIndex(c=>!c.jev.gated_metrics.trace_match);
      await page.selectOption('#case',String(mismatchIndex));
      await page.selectOption('#arm','gold');
      await page.locator('#gold-reference').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(out,`gold-mismatch-${width}.png`)});
      const bypass=expected.cases.findIndex(c=>c.parser.gated_metrics.false_action);
      assert.ok(bypass>=0);
      await page.selectOption('#case',String(bypass));
      await page.selectOption('#method','parser');
      await page.selectOption('#arm','gated');
      await page.locator('#scrub').evaluate(e=>{e.value=e.max;e.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.locator('#event').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(out,`parser-bypass-${width}.png`)});
      for (const detail of await page.locator('details').all()) await detail.evaluate(e=>e.open=true);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      const links=await page.locator('a').evaluateAll(nodes=>nodes.map(e=>e.getAttribute('href')));
      for (const href of links) {
        assert.ok(!/^(https?:|\/)|\.\./.test(href));
        assert.ok(fs.statSync(path.resolve(site,href)).isFile(),href);
      }
      let downloads=0;
      await page.goto(origin+'/index.html');
      assert.deepEqual(await page.locator('#data').evaluate(e=>JSON.parse(e.textContent)),expected);
      for (const href of ['recorded-cases.json','metrics.csv','report.json','report.csv']) {
        const pending=page.waitForEvent('download');
        await page.locator(`a[href="${href}"]`).click();
        const download=await pending;
        const target=path.join(out,`download-${width}-${href}`);
        await download.saveAs(target);
        assert.equal(hash(target),hash(path.join(site,href)));
        downloads++;
      }
      assert.ok(minMapFont>=16,`map labels too small: ${minMapFont}`);
      assert.deepEqual(errors,[]);
      assert.deepEqual(external,[]);
      results.push({width,cases:24,interpreterArms:arms,frameComparisons:frames,minimumTransformedMapFontPx:minMapFont,packagedLinks:links.length,verifiedDownloads:downloads,errors,externalRequests:external,controls:'select/raw/gated/gold/scrub/keyboard/previous/next/play/pause/reset/endpoint passed'});
      await page.close();
    }
    const receipt={passed:true,scope:'Local standalone cached Chromium file replay plus read-only loopback-served downloads; not physical phone/Safari, independent review or publication',browserVersion:browser.version(),htmlSha256:hash(path.join(site,'index.html')),recordedSha256:hash(path.join(site,'recorded-cases.json')),manifestSha256:hash(path.join(site,'SHA256SUMS.json')),harnessSha256:hash(__filename),wallMs:performance.now()-started,results};
    fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
    console.log(JSON.stringify(receipt,null,2));
  } finally { await browser.close();await new Promise(resolve=>server.close(resolve)); }
})().catch(e=>{console.error(e);process.exitCode=1;});
