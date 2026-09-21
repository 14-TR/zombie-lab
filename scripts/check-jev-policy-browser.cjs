"use strict";
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url');
const [site,modulePath,executablePath,out]=process.argv.slice(2);assert(site&&modulePath&&executablePath&&out);
// Mandatory real artifact read happens before any browser/tool availability check.
const raw=fs.readFileSync(path.join(site,'jev-policy.json')),data=JSON.parse(raw),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
 const browser=await require(modulePath).chromium.launch({headless:true,executablePath,env:{...process.env,TYPESAFE_API_KEY:''}}),page=await browser.newPage();
 const receipt={valid:false,buildCommit:data.buildCommit,dataSHA256:sha(raw),widths:[],errors:[],externalRequests:[],scope:'actual local exported static artifact, not deployed Pages or downloaded PR artifact'};
 fs.mkdirSync(out,{recursive:true});
 page.on('pageerror',e=>receipt.errors.push(e.message));page.on('console',e=>{if(e.type()==='error')receipt.errors.push(e.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))receipt.externalRequests.push(r.url());});
 try{
  for(const width of [320,390,1200]){
   await page.setViewportSize({width,height:950});await page.goto(pathToFileURL(path.join(site,'jev-policy.html')).href);
   assert.equal(await page.locator('#error').isVisible(),false);assert.equal(await page.evaluate(()=>JSON.stringify(ZL_POLICY_DATA)),JSON.stringify(data));
   const checked=await page.evaluate(()=>{
    const by=id=>document.getElementById(id),check=(x,m)=>{if(!x)throw Error(m);};let count=0,boards=0,minFont=Infinity;const links=new Set();
    for(const run of ZL_POLICY_DATA.runs){
     by('run').value=run.id;by('run').dispatchEvent(new Event('change'));
     const entries=JevPolicyView.traces(run);
     check(document.querySelectorAll('.history-frame').length===entries.reduce((n,[,t])=>n+t.frames.length,0),'Complete histories');
     for(let tick=0;tick<=12;tick++){
      by('scrubber').value=String(tick);by('scrubber').dispatchEvent(new Event('input'));check(by('readout').textContent===`Shared tick ${tick} / 12`,'Shared tick');
      for(const [name,trace]of entries){
       const frame=trace.frames[Math.min(tick,trace.frames.length-1)],card=document.querySelector(`[data-policy="${name}"]`);
       check(card.querySelector('.badge').textContent.includes(`Local tick ${frame.tick}`),'Exact local tick');
       if(tick>frame.tick)check(card.querySelector('.badge').textContent.includes('endpoint held'),'Held endpoint label');
       const label=`H (${frame.human.x},${frame.human.y}); Z1 (${frame.zombies[0].x},${frame.zombies[0].y}); Z2 (${frame.zombies[1].x},${frame.zombies[1].y})`;
       check(card.querySelector('.positions').textContent===label,'All exact coordinates');check(card.querySelector('svg').getAttribute('aria-label')===label,'Accessible coordinates');
       const texts=[...card.querySelectorAll('text')],boxes=texts.map(t=>t.getBoundingClientRect()),positions=[frame.human,...frame.zombies];
       texts.forEach((t,i)=>{check(Math.floor(Number(t.getAttribute('x'))/50)===positions[i].x&&Math.floor(Number(t.getAttribute('y'))/50)===positions[i].y,'Actual marker cell');});
       minFont=Math.min(minFont,...texts.map(t=>parseFloat(getComputedStyle(t).fontSize)*t.getScreenCTM().a));
       for(let i=0;i<3;i++)for(let j=i+1;j<3;j++){const a=boxes[i],b=boxes[j];check(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y,'Agent label overlap');}
       boards++;
      }
      for(const arm of ['original','policy']){
       const event=tick>0?run[arm].decisions[tick-1]:null,text=document.querySelector(`[data-arm="${arm}"]`).textContent;
       if(event){check(text.includes(`human ${event.action}`),'Raw human choice');for(let z=0;z<2;z++)check(text.includes(`Z${z+1}: Jev predicted ${event.answers['zombie'+(z+1)+'_move'].choice}; simulator moved ${event.truth.zombieMoves[z]}.`),'Prediction vs actual');}
       else check(text.includes(tick===0?'Initial state':'No new decision'),'No fabricated decision');
      }
      for(const a of document.querySelectorAll('a[href]'))links.add(a.getAttribute('href'));
      check(document.documentElement.scrollWidth<=innerWidth,'Viewport overflow');count++;
     }
    }return {pairedTicks:count,boardFrames:boards,minFont,links:[...links]};
   });
   assert(checked.minFont>=12);
   for(const link of checked.links){assert(!/^[a-z]+:/i.test(link));assert(fs.statSync(path.resolve(site,link)).isFile(),'Packaged link '+link);}
   receipt.widths.push({width,...checked});
   await page.selectOption('#run','run-02');await page.locator('#scrubber').fill('12');await page.locator('#scrubber').dispatchEvent('input');
   assert((await page.locator('[data-policy="original"] .badge').textContent()).includes('Local tick 7'));
   assert((await page.locator('[data-policy="policy"] .badge').textContent()).includes('Local tick 4'));
   await page.locator('#play').click();await page.waitForFunction(()=>Number(document.getElementById('scrubber').value)>=1);await page.locator('#pause').click();
   const before=Number(await page.locator('#scrubber').inputValue());await page.waitForTimeout(600);assert.equal(Number(await page.locator('#scrubber').inputValue()),before);
   await page.locator('#next').click();assert.equal(Number(await page.locator('#scrubber').inputValue()),before+1);await page.locator('#back').click();assert.equal(Number(await page.locator('#scrubber').inputValue()),before);
   await page.locator('#scrubber').fill('11');await page.locator('#scrubber').dispatchEvent('input');await page.locator('#play').click();await page.waitForFunction(()=>document.getElementById('scrubber').value==='12');assert.equal(await page.locator('#pause').isDisabled(),true);
   await page.selectOption('#run','run-02');await page.locator('#scrubber').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#scrubber').inputValue(),'1');
   await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,`top-${width}.png`)});
   await page.locator('#scrubber').fill('4');await page.locator('#scrubber').dispatchEvent('input');await page.locator('[data-policy="policy"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`boards-${width}.png`)});
   await page.locator('[data-arm="policy"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`decision-${width}.png`)});
  }
  assert.deepEqual(receipt.errors,[]);assert.deepEqual(receipt.externalRequests,[]);receipt.valid=true;
 }finally{fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');await browser.close();}
 console.log(JSON.stringify({...receipt,widths:receipt.widths.map(({links,...rest})=>({...rest,packagedLinks:links.length}))}));
})().catch(e=>{console.error(e);process.exitCode=1;});
