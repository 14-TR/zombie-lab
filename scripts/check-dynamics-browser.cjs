"use strict";
// Mandatory cached-browser check. Missing artifacts/module/browser are failures, never skips.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const [site,modulePath,executablePath,out]=process.argv.slice(2);
if(!site||!modulePath||!executablePath||!out)throw Error('site, cached playwright, cached Chromium, output required');
const expected=JSON.parse(fs.readFileSync(path.join(site,'dynamics.json'),'utf8'));
fs.mkdirSync(out,{recursive:true});
const receipt={startedAt:new Date().toISOString(),site:path.resolve(site),sourceCommit:require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:path.join(__dirname,'..'),encoding:'utf8'}).trim(),dataSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(site,'dynamics.json'))).digest('hex'),widths:[],errors:[],externalRequests:[]};
receipt.sourceHashes={};receipt.sourceFilesMatchCommit=true;
for(const file of ['scripts/build_dynamics.py','scripts/check-dynamics-browser.cjs','dynamics-template.html']){const raw=fs.readFileSync(path.join(__dirname,'..',file));receipt.sourceHashes[file]=crypto.createHash('sha256').update(raw).digest('hex');try{const committed=require('node:child_process').execFileSync('git',['show',receipt.sourceCommit+':'+file],{cwd:path.join(__dirname,'..'),stdio:['ignore','pipe','ignore']});if(!raw.equals(committed))receipt.sourceFilesMatchCommit=false;}catch{receipt.sourceFilesMatchCommit=false;}}
receipt.artifactHashes=Object.fromEntries(['dynamics.html','dynamics.json','dynamics.csv','states.csv','experiments/ZL-018-results.md'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(site,file))).digest('hex')]));
const flat=s=>Object.fromEntries(['H','Z1','Z2'].flatMap(a=>[[a+'_x',String(s[a][0])],[a+'_y',String(s[a][1])]]).concat([['world_caught',s.caught?'yes':'no']]));
let browser,page;
(async()=>{try{
 browser=await require(modulePath).chromium.launch({headless:true,executablePath,env:{...process.env,TYPESAFE_API_KEY:''}});
 for(const width of [320,390,1200]){
  page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',e=>receipt.errors.push(String(e)));page.on('console',msg=>{if(msg.type()==='error')receipt.errors.push(msg.text());});page.on('request',req=>{if(!req.url().startsWith('file:'))receipt.externalRequests.push(req.url());});
  await page.goto('file://'+path.resolve(site,'dynamics.html'));assert.deepEqual(await page.evaluate(()=>window.ZL018),expected);
  const result={width,requests:0,boardFrames:0,markers:0,linkChecks:0,minGlyphPx:Infinity,overlapPairs:0};
  for(let index=0;index<expected.requests.length;index++){
   await page.selectOption('#case',String(index));const item=expected.requests[index];result.requests++;
   for(let tick=0;tick<=3;tick++){
    await page.locator('#tick').evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},String(tick));
    const actual=await page.evaluate(()=>({tick:document.getElementById('tick-label').textContent,overflow:document.documentElement.scrollWidth>innerWidth,history:[...document.querySelectorAll('#history tr')].map(r=>[...r.children].map(e=>e.textContent)),boards:Object.fromEntries(['truth','model','baseline'].map(id=>{const root=document.getElementById(id);const labels=[...root.querySelectorAll('svg text')];let overlaps=0;for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i].getBoundingClientRect(),b=labels[j].getBoundingClientRect();if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)overlaps++;}return [id,{note:root.querySelector('.notice').textContent,coords:root.querySelector('.coords').textContent,markers:[...root.querySelectorAll('[data-agent]')].map(e=>({agent:e.dataset.agent,x:e.dataset.x,y:e.dataset.y})),glyphs:labels.map(e=>parseFloat(getComputedStyle(e).fontSize)*e.getScreenCTM().a),overlaps}];}))}));
    assert.equal(actual.overflow,false,'page overflow');assert.equal(actual.tick,`Tick ${tick} / 3`);assert.deepEqual(actual.history,item.truth.frames.map((s,i)=>[String(i),s.H.join(','),s.Z1.join(','),s.Z2.join(','),s.caught?'yes':'no']));
    const row=item.rows.find(r=>r.horizon===tick),initial=flat(item.truth.frames[0]);const targets={truth:flat(item.truth.frames[tick]),model:tick===0?initial:row?.prediction,baseline:tick===0?initial:row?.baselinePrediction};
    for(const id of ['truth','model','baseline']){
     const target=targets[id],state=actual.boards[id];result.boardFrames++;
     const markers=['H','Z1','Z2'].filter(a=>target&&target[a+'_x']!==undefined&&target[a+'_y']!==undefined&&target[a+'_x']!=='unknown'&&target[a+'_y']!=='unknown').map(a=>({agent:a,x:target[a+'_x'],y:target[a+'_y']}));
     assert.deepEqual(state.markers,markers,`${item.id}/${tick}/${id} positions`);result.markers+=markers.length;
     if(id!=='truth'&&tick===2)assert.match(state.note,/Not requested at tick 2/);
     if(tick===0&&id==='model')assert.match(state.note,/not a prediction/);
     if(target)assert.ok(state.coords.includes('caught: '+target.world_caught));
     for(const px of state.glyphs)result.minGlyphPx=Math.min(result.minGlyphPx,px);
     result.overlapPairs+=state.overlaps;
    }
   }
   const hrefs=await page.locator('a').evaluateAll(es=>es.map(e=>e.getAttribute('href')));
   for(const href of hrefs){assert.ok(!/^[a-z]+:/i.test(href),'external link');const target=path.resolve(site,href);assert.ok(target.startsWith(path.resolve(site)+path.sep),'link escape');assert.ok(fs.statSync(target).isFile(),href);result.linkChecks++;}
  }
  assert.ok(result.minGlyphPx>=12,`glyph size ${result.minGlyphPx}`);assert.equal(result.overlapPairs,0,'marker glyph overlap');
  await page.selectOption('#case','2');await page.locator('#next').click();assert.match(await page.locator('#tick-label').textContent(),/Tick 1/);await page.locator('#back').click();assert.match(await page.locator('#tick-label').textContent(),/Tick 0/);await page.locator('h1').click();await page.keyboard.press('ArrowRight');assert.match(await page.locator('#tick-label').textContent(),/Tick 1/);await page.keyboard.press('ArrowLeft');assert.match(await page.locator('#tick-label').textContent(),/Tick 0/);
  await page.locator('#play').click();assert.equal(await page.locator('#play').textContent(),'Pause');await page.locator('#play').click();const stopped=await page.locator('#tick').inputValue();await page.waitForTimeout(500);assert.equal(await page.locator('#tick').inputValue(),stopped);await page.locator('#play').click();await page.waitForFunction(()=>document.getElementById('tick').value==='3'&&document.getElementById('play').textContent==='Play');
  for(const [name,index,tick]of [['supplied-one',2,1],['supplied-three',2,3],['ambiguous',13,3]]){
   await page.selectOption('#case',String(index));await page.locator('#tick').evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},String(tick));await page.screenshot({path:path.join(out,`${width}-${name}.png`),fullPage:true});
  }
  result.controls='select,range,back,next,keyboard,play,pause,auto-stop passed';receipt.widths.push(result);await page.close();page=null;
 }
 assert.equal(receipt.errors.length,0);assert.equal(receipt.externalRequests.length,0);receipt.valid=true;
}catch(error){receipt.valid=false;receipt.failure=String(error.stack||error);if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;
}finally{if(browser)await browser.close();receipt.completedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));}})();
