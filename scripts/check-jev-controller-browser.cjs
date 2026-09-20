"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const [site,modulePath,executablePath,out]=process.argv.slice(2);assert(site&&modulePath&&executablePath&&out);
const data=JSON.parse(fs.readFileSync(path.join(site,'jev-controller.json')));
(async()=>{const browser=await require(modulePath).chromium.launch({headless:true,executablePath}),page=await browser.newPage(),receipt={valid:false,buildCommit:data.buildCommit,widths:[],errors:[],externalRequests:[],scope:'local prerecorded production artifact, not deployed Pages'};
fs.mkdirSync(out,{recursive:true});page.on('pageerror',e=>receipt.errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))receipt.externalRequests.push(r.url());});
try{for(const width of [320,390,1200]){await page.setViewportSize({width,height:950});await page.goto(pathToFileURL(path.join(site,'jev-controller.html')).href);assert.equal(await page.locator('#error').isVisible(),false);assert.equal(await page.evaluate(()=>JSON.stringify(ZL_CONTROLLER_DATA)),JSON.stringify(data));
 const checked=await page.evaluate(()=>{const by=id=>document.getElementById(id),check=(x,m)=>{if(!x)throw Error(m);};let count=0,minFont=Infinity;
  for(const run of ZL_CONTROLLER_DATA.runs){by('run').value=run.id;by('run').dispatchEvent(new Event('change'));
   check(document.querySelectorAll('.history-frame').length===run.jev.frames.length+run.controls.greedy.frames.length+run.controls.depth2.frames.length,'Complete history');
   for(let tick=0;tick<=12;tick++){by('scrubber').value=String(tick);by('scrubber').dispatchEvent(new Event('input'));
    for(const [name,trace]of Object.entries({Jev:run.jev,...run.controls})){const frame=trace.frames[Math.min(tick,trace.frames.length-1)],card=document.querySelector(`[data-policy="${name}"]`);check(card.querySelector('.badge').textContent.includes(`Local tick ${frame.tick}`),'Local endpoint');check(card.querySelector('.positions').textContent.includes(`H (${frame.human.x},${frame.human.y})`),'Exact human coordinate');
     const texts=[...card.querySelectorAll('text')],boxes=texts.map(t=>t.getBoundingClientRect());minFont=Math.min(minFont,...texts.map(t=>parseFloat(getComputedStyle(t).fontSize)*t.getScreenCTM().a));for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){const a=boxes[i],b=boxes[j];check(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y,'Label overlap');}
    }count++;
   }
  }check(document.documentElement.scrollWidth<=innerWidth,'Overflow');return {pairedTicks:count,minFont};});
 assert(checked.minFont>=12);receipt.widths.push({width,...checked});await page.selectOption('#run','run-02');await page.locator('#scrubber').fill('12');await page.locator('#scrubber').dispatchEvent('input');assert((await page.locator('[data-policy="Jev"] .badge').textContent()).includes('Local tick 7'));assert((await page.locator('#decision').textContent()).includes('No new Jev decision'));
 await page.locator('#play').click();await page.waitForFunction(()=>Number(document.getElementById('scrubber').value)>=1);await page.locator('#pause').click();const before=Number(await page.locator('#scrubber').inputValue());await page.locator('#next').click();assert.equal(Number(await page.locator('#scrubber').inputValue()),before+1);await page.locator('#back').click();assert.equal(Number(await page.locator('#scrubber').inputValue()),before);
 await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,`top-${width}.png`)});await page.locator('#scrubber').fill('7');await page.locator('#scrubber').dispatchEvent('input');await page.locator('[data-policy="Jev"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`boards-${width}.png`)});await page.locator('#decision').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`decision-${width}.png`)});
 }assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.externalRequests,[]);receipt.valid=true;
}finally{fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');await browser.close();}console.log(JSON.stringify(receipt));})().catch(e=>{console.error(e);process.exitCode=1;});
