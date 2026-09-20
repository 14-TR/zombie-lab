"use strict";
// Existing local browser only; file:// artifact, no server and no downloads.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const [site,modulePath,executablePath,out]=process.argv.slice(2);
assert(site&&modulePath&&executablePath&&out,'site playwright-module chromium-executable evidence-dir required');
const {chromium}=require(modulePath),data=JSON.parse(fs.readFileSync(path.join(site,'jev.json')));
(async()=>{
  fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath});
  const receipt={artifact:path.resolve(site),model:data.metadata.model,buildCommit:data.metadata.buildCommit,widths:[],errors:[],externalRequests:[],scope:'local production artifact; not downloaded PR or live Pages',route:'cached Playwright/Chromium fallback; browser_exec rejected unsupported default browser'};
  try{
    const page=await browser.newPage();page.on('pageerror',e=>receipt.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))receipt.externalRequests.push(r.url());});
    for(const width of [320,390,1200]){
      await page.setViewportSize({width,height:1000});await page.goto(pathToFileURL(path.join(site,'jev.html')).href);
      assert.equal(await page.locator('#error').isVisible(),false);assert.equal(await page.locator('#sample option').count(),24);
      assert.equal(await page.evaluate(()=>JSON.stringify(ZL_JEV_DATA)),JSON.stringify(data));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow');
      let checkedActions=0;
      for(const row of data.results){
        await page.selectOption('#sample',row.id);assert.equal(await page.locator('#predictions .card').count(),row.actions.length);
        assert.equal(await page.locator('#action').inputValue(),row.selectedAction??row.actions[0].action);
        for(const a of row.actions){
          await page.selectOption('#action',a.action);await page.locator('#next').click();
          assert((await page.locator('#readout').textContent()).includes(`Tick 1 / 1 · inspected ${a.action} · ${a.successor.status}`));
          const text=await page.locator('#history').textContent();assert(text.includes(`H (${a.successor.human.x},${a.successor.human.y})`));
          const boxes=await page.locator('#world [data-agent]').evaluateAll(ns=>ns.map(n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom};}));
          for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y,'agent labels overlap');}
          await page.locator('#back').click();checkedActions++;
        }
      }
      await page.selectOption('#sample','sample-03');await page.locator('#next').click();
      await page.locator('#world').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`world-${width}.png`)});
      const minGlyph=await page.locator('#world text').evaluateAll(nodes=>Math.min(...nodes.map(n=>parseFloat(getComputedStyle(n).fontSize)*n.getScreenCTM().a)));
      receipt.widths.push({width,checkedStates:data.results.length,checkedActions,minGlyph});
      assert(minGlyph>=12,'phone SVG labels below 12px: '+minGlyph);
      await page.locator('#scrubber').fill('0');await page.locator('#scrubber').dispatchEvent('input');
      assert((await page.locator('#readout').textContent()).startsWith('Tick 0'));
      await page.locator('#play').click();assert.equal(await page.locator('#pause').isEnabled(),true);await page.locator('#pause').click();
      await page.locator('#play').click();await page.waitForFunction(()=>document.querySelector('#scrubber').value==='1');
      assert.equal(await page.locator('#pause').isEnabled(),false);
      await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,`top-${width}.png`)});
      await page.locator('#predictions').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`predictions-${width}.png`)});
    }
    for(const href of ['jev.json','jev.csv','experiments/ZL-014-jev.md','experiments/ZL-014-protocol.md','evidence/jev/frozen/manifest.json'])assert(fs.existsSync(path.join(site,href)),href);
    assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.externalRequests,[]);receipt.valid=true;
  }finally{fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');await browser.close();}
  console.log(JSON.stringify(receipt));
})().catch(e=>{console.error(e);process.exitCode=1;});
