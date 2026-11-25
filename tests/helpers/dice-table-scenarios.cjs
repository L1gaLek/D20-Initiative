const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
module.exports=async({pages,broadcast,requests,base,screenshotDir})=>{
  const [gm,owner,other]=pages;
  const picture=async(page,name)=>{if(screenshotDir){fs.mkdirSync(screenshotDir,{recursive:true});await page.locator(await page.locator('.dice-table-dialog[open]').count()?'.dice-table-dialog[open]':'#dice-others').screenshot({path:path.join(screenshotDir,name+'.png')});}};
  const send=async(event)=>owner.evaluate(event=>sendMessage({type:'diceEvent',event}),{fromId:'user-1',fromName:'Альрик',bonus:0,crit:'',...event});
  const settled=async(page,total)=>page.waitForFunction(total=>DiceTable.inspect().state==='settled'&&DiceTable.inspect().results.some(r=>r.total===total),total);
  for(const page of pages){
    assert.equal(await page.locator('.dice-table__canvas').count(),0,'no eager WebGL context');
    await page.locator('#dice-others').scrollIntoViewIfNeeded();
    await page.evaluate(()=>{
      window.__diceLogReveal=[];const original=renderLog;const seen=new Set();
      renderLog=lines=>{for(const line of lines||[])if(!seen.has(line)){seen.add(line);window.__diceLogReveal.push({at:performance.timeOrigin+performance.now(),line,state:DiceTable.inspect().state,animating:DiceTable.inspect().animating});}original(lines);};
    });
  }
  // Cold shader/worker setup may legitimately finish after the reveal deadline
  // on a busy machine. Warm once before measuring the visible animation path.
  await send({localNonce:'dice-table-warmup',sides:6,count:1,rolls:[2],total:2,kindText:'Подготовка стола'});
  await Promise.all(pages.map(page=>settled(page,2)));
  // Pointer release sends exactly one shared impulse, including to reduced-motion viewers.
  const counters=await Promise.all(pages.map(p=>p.evaluate(()=>DiceTable.inspect().completed)));
  const requestCount=requests.filter(r=>r.path.endsWith('/dice')).length;
  const roll=owner.locator('#roll'),box=await roll.boundingBox();
  await owner.mouse.move(box.x+box.width/2,box.y+box.height/2);await owner.mouse.down();await owner.waitForTimeout(900);
  const charge=Number(await owner.locator('#dice-inline-controls .dice-power').getAttribute('aria-valuenow'));
  assert.ok(charge>=35&&charge<=80,'holding fills the impulse meter');assert.equal(requests.filter(r=>r.path.endsWith('/dice')).length,requestCount,'holding never rolls early');
  if(screenshotDir)await picture(owner,'dice-charging');
  await owner.mouse.up();
  await Promise.all(pages.map((page,i)=>page.waitForFunction(n=>DiceTable.inspect().completed>n,counters[i])));
  const powers=await Promise.all(pages.map(p=>p.evaluate(()=>DiceTable.inspect().throwPowers[0])));
  assert.ok(powers[0]>.35&&powers[0]<.85);assert.ok(powers.every(p=>p===powers[0]),'all clients receive the same charged impulse');
  assert.equal(requests.filter(r=>r.path.endsWith('/dice')).length,requestCount+1,'pointer release and click cannot send duplicate throws');
  // Esc cancels a held pointer, while a regular click still gives the original throw.
  await owner.mouse.move(box.x+box.width/2,box.y+box.height/2);await owner.mouse.down();await owner.waitForTimeout(180);await owner.keyboard.press('Escape');await owner.mouse.up();
  assert.equal(requests.filter(r=>r.path.endsWith('/dice')).length,requestCount+1);
  const beforeTap=await Promise.all(pages.map(p=>p.evaluate(()=>DiceTable.inspect().completed)));
  await roll.click();await Promise.all(pages.map((page,i)=>page.waitForFunction(n=>DiceTable.inspect().completed>n,beforeTap[i])));
  assert.equal(await owner.evaluate(()=>DiceTable.inspect().throwPowers[0]),0,'a tap retains the ordinary impulse');
  console.log('PASS charged throw: hold/release, exact shared power, no duplicate submission, Esc cancellation and normal tap');
  await gm.getByRole('button',{name:'Развернуть стол бросков'}).click();
  await other.evaluate(()=>PersonalPreferences.set({reduceDiceMotion:true}));
  await pages[3].emulateMedia({reducedMotion:'reduce'});
  await pages[4].evaluate(()=>{window.__diceRealNow=Date.now;Date.now=()=>window.__diceRealNow()+3600000;});
  await send({localNonce:'dice-table-d20',throwPower:1,sides:20,count:1,rolls:[17],total:17,kindText:'Проверка: d20 [17]'});
  await owner.waitForFunction(()=>DiceTable.inspect().animating);
  assert.equal(await owner.locator('.dice-table__stage').evaluate(el=>el.classList.contains('is-awaiting-result')),false,'normal motion never shows the reduced-motion curtain');
  await owner.evaluate(()=>{window.__motionFrames=[];window.__motionCurtains=0;const sample=()=>{const s=DiceTable.inspect();if(s.state==='rolling'){__motionFrames.push(s.frame);if(document.querySelector('.dice-table__stage.is-awaiting-result'))__motionCurtains++;requestAnimationFrame(sample);}};sample();});
  await owner.getByRole('button',{name:'Развернуть стол бросков'}).click();
  const beforeMove=await owner.evaluate(()=>DiceTable.inspect().frame);
  await owner.waitForFunction(frame=>DiceTable.inspect().animating&&DiceTable.inspect().frame>frame+1,beforeMove);
  await other.waitForFunction(()=>DiceTable.inspect().state==='rolling');
  assert.equal(await other.locator('.dice-table__stage').evaluate(el=>el.classList.contains('is-awaiting-result')),true,'reduced motion holds a neutral placeholder, not the result');
  assert.equal(await other.evaluate(()=>DiceTable.inspect().animating),false);
  assert.equal((await owner.locator('.dice-table__caption').textContent()).includes('17'),false,'caption never leaks embedded rolled values');
  const inFlight=await owner.evaluate(()=>DiceTable.inspect());assert.equal(inFlight.dice[0].sides,20);assert.ok(inFlight.frame<130);
  assert.equal(await owner.evaluate(()=>lastState.log.some(line=>line.includes('Проверка: d20'))),false,'journal must not reveal the result during its animation');
  broadcast({type:'logRow',roomId:'test-room',row:{text:'Обычное событие во время броска',localNonce:'ordinary-during-roll'}});
  await owner.waitForFunction(()=>lastState.log.includes('Обычное событие во время броска'));
  await picture(owner,'dice-rolling');
  await Promise.all(pages.map(page=>settled(page,17)));
  for(const page of pages){
    await page.waitForFunction(()=>lastState.log.some(line=>line.includes('Проверка: d20')));
    const reveal=await page.evaluate(()=>__diceLogReveal.find(row=>row.line.includes('Проверка: d20')));
    assert.equal(reveal.state,'settled');assert.equal(reveal.animating,false);
    assert.equal(await page.locator('.dice-others__item').count(),0,'no transient result feed');
  }
  const moments=await Promise.all(pages.map(page=>page.evaluate(()=>__diceLogReveal.find(row=>row.line.includes('Проверка: d20')).at)));
  assert.ok(Math.max(...moments)-Math.min(...moments)<160,'ordinary, reduced and OS reduced modes reveal together: '+moments);
  await other.evaluate(()=>PersonalPreferences.set({reduceDiceMotion:false}));await pages[3].emulateMedia({reducedMotion:'no-preference'});
  await pages[4].evaluate(()=>{Date.now=window.__diceRealNow;delete window.__diceRealNow;});
  const motion=await owner.evaluate(()=>({frames:__motionFrames,curtains:__motionCurtains}));assert.equal(motion.curtains,0);for(let i=1;i<motion.frames.length;i++)assert.ok(motion.frames[i]>=motion.frames[i-1],'frames never rewind during a server correction or moving to the expanded tray');
  assert.ok(motion.frames.length>12,'the throw is visibly animated');await owner.keyboard.press('Escape');
  console.log('PASS smooth motion: monotonic frames, no normal-mode waiting curtain, expanding mid-throw keeps the animation running');
  console.log('PASS shared reveal deadline: normal/personal reduced/OS reduced/one-hour clock skew, results and journal within 160 ms across five clients');
  if(process.env.D20_TIMING_ONLY)return;
  assert.equal(await gm.locator('.dice-table-dialog').isVisible(),true,'first roll keeps an already expanded tray open');
  await gm.keyboard.press('Escape');await gm.locator('#dice-others .dice-table__canvas').waitFor({state:'attached'});
  const views=await Promise.all(pages.map(page=>page.evaluate(()=>DiceTable.inspect().dice)));
  for(const dice of views){assert.equal(dice.length,1);assert.equal(dice[0].upLabel,'17');assert.equal(dice[0].value,17);assert.deepEqual(dice[0].position,views[0][0].position);}
  await picture(owner,'dice-d20-settled');
  const frames=await owner.evaluate(()=>DiceTable.inspect().framesRendered);await owner.waitForTimeout(200);assert.equal(await owner.evaluate(()=>DiceTable.inspect().framesRendered),frames,'settled tray does not run RAF');
  const accepted=await other.evaluate(()=>DiceTable.inspect().accepted);
  broadcast({type:'diceEvent',roomId:'test-room',event:{localNonce:'dice-table-d20',fromId:'user-1',fromName:'Альрик',sides:20,count:1,rolls:[17],total:17}});
  await other.waitForTimeout(100);assert.equal(await other.evaluate(()=>DiceTable.inspect().accepted),accepted);
  await owner.keyboard.press('Shift');
  const sounds=await owner.evaluate(()=>DiceCriticalFeedback.inspect().played);
  await send({localNonce:'critical-pair',sides:20,count:3,rolls:[20,1,13],total:34,kindText:'Инициатива'});
  await settled(owner,34);
  const critical=await owner.evaluate(()=>DiceTable.inspect());
  assert.deepEqual(critical.dice.map(d=>d.critical),['success','failure','']);assert.equal(critical.criticalEffects,2);
  assert.equal(await owner.evaluate(()=>DiceCriticalFeedback.inspect().played),sounds+2);
  await picture(owner,'dice-critical-pair');
  await owner.waitForFunction(()=>!DiceTable.inspect().celebrating);
  const criticalFrames=await owner.evaluate(()=>DiceTable.inspect().framesRendered);await owner.waitForTimeout(150);assert.equal(await owner.evaluate(()=>DiceTable.inspect().framesRendered),criticalFrames);
  const count=await owner.evaluate(()=>DiceCriticalFeedback.inspect().played);
  broadcast({type:'diceEvent',roomId:'test-room',event:{localNonce:'critical-pair',fromId:'user-1',fromName:'Альрик',sides:20,count:3,rolls:[20,1,13],total:34}});
  await owner.waitForTimeout(120);assert.equal(await owner.evaluate(()=>DiceCriticalFeedback.inspect().played),count);
  await picture(owner,'dice-critical-d20');
  console.log('PASS critical: natural 20/1 each have their own halo and sound, initiative included, duplicates stay silent, effect loop stops');
  console.log('PASS dice: real dice relay reaches all five clients including the roller, d20 lands on 17, motion stops, and duplicate echoes do not replay');

  const delayed={fromId:'user-2',fromName:'Сари',localNonce:'log-before-dice',sides:20,count:1,rolls:[18],total:18,kindText:'Запоздавший бросок'};
  const delayedText='Сари: Запоздавший бросок: 18 = 18';
  broadcast({type:'logRow',roomId:'test-room',row:{text:delayedText,localNonce:'dice-log:log-before-dice'}});
  await other.waitForTimeout(100);assert.equal(await other.evaluate(line=>lastState.log.includes(line),delayedText),false);
  broadcast({type:'diceEvent',roomId:'test-room',event:delayed});await settled(other,18);
  await other.waitForFunction(line=>lastState.log.includes(line),delayedText);
  const delayedReveal=await other.evaluate(line=>__diceLogReveal.find(row=>row.line===line),delayedText);
  assert.equal(delayedReveal.state,'settled');

  for(const [sides,value] of [[2,2],[4,4],[6,6],[8,8],[10,10],[12,12],[20,20],[100,100]]){
    await send({localNonce:'shape-'+sides,sides,count:1,rolls:[value],total:value,kindText:'Кубик d'+sides});
    await settled(owner,value);const dice=await owner.evaluate(()=>DiceTable.inspect().dice);
    assert.equal(dice.length,sides===100?2:1);
    assert.deepEqual(dice.map(d=>d.upLabel),sides===100?['00','0']:[String(value)]);
    if([4,6,12,100].includes(sides))await picture(owner,'dice-d'+sides);
  }
  console.log('PASS dice: d2/d4/d6/d8/d10/d12/d20 and paired percentile dice render their actual faces and confirmed values');

  const damage={localNonce:'mixed-dice',sides:6,count:3,rolls:[3,5,2],bonus:4,total:14,kindText:'Урон',damageTitle:'Урон мечом',damageParts:[{type:'dice',description:'Меч',sides:6,count:2,rolls:[3,5]},{type:'dice',description:'Огонь',sides:4,count:1,rolls:[2]},{type:'flat',description:'Масло',value:4}]};
  await send(damage);await Promise.all([owner,gm].map(p=>settled(p,14)));
  assert.deepEqual(await gm.evaluate(()=>DiceTable.inspect().dice.map(d=>d.sides)),[6,6,4]);await picture(gm,'dice-mixed');
  const before=await gm.evaluate(()=>DiceTable.inspect().accepted);
  const first={fromId:'user-2',fromName:'Сари',localNonce:'burst-a',sides:6,count:2,rolls:[2,6],total:8};
  const second={fromId:'user-3',fromName:'Нивен',localNonce:'burst-b',sides:8,count:1,rolls:[7],total:7};
  broadcast({type:'diceEvent',roomId:'test-room',event:first});broadcast({type:'diceEvent',roomId:'test-room',event:second});
  await gm.waitForFunction(n=>DiceTable.inspect().accepted===n+2,before);await settled(gm,7);
  assert.equal(await gm.evaluate(()=>DiceTable.inspect().results.length),2);assert.equal(await gm.evaluate(()=>DiceTable.inspect().dice.length),3);
  console.log('PASS dice: mixed weapon damage retains each die type and bonus; simultaneous players share a physical throw with separate totals');

  await owner.emulateMedia({reducedMotion:'reduce'});
  await owner.evaluate(()=>{dice.value='6';diceCountInput.value='20';rollBtn.click();});
  await owner.waitForFunction(()=>DiceTable.inspect().state==='settled'&&DiceTable.inspect().results.some(r=>r.rolls.length===20));
  assert.equal(await owner.evaluate(()=>DiceTable.inspect().dice.length),20);
  assert.equal(await owner.evaluate(()=>DiceTable.inspect().animating),false);
  await Promise.all(pages.map(page=>page.waitForFunction(()=>DiceTable.inspect().state==='settled'&&DiceTable.inspect().results.some(r=>r.rolls.length===20))));
  const percentile={localNonce:'twenty-percentile',sides:100,count:20,rolls:Array(20).fill(100),total:2000,kindText:'20d100'};
  await send(percentile);await settled(owner,2000);assert.equal(await owner.evaluate(()=>DiceTable.inspect().dice.length),40);
  await Promise.all(pages.map(page=>settled(page,2000)));
  // Wood grain and the single shared print add two textures to the old tray.
  const resources=await owner.evaluate(()=>DiceTable.inspect());
  assert.ok(resources.textures<10,'shared digit atlas plus two tray textures stay bounded: '+JSON.stringify(resources));
  assert.ok(await owner.evaluate(()=>DiceTable.inspect().geometries)<100,'old throw geometry is released');
  await owner.emulateMedia({reducedMotion:'no-preference'});
  const oldAccepted=await gm.evaluate(()=>DiceTable.inspect().accepted);
  for(const localNonce of ['identical-a','identical-b']){
    broadcast({type:'diceEvent',roomId:'test-room',event:{fromId:'user-2',fromName:'Сари',localNonce,sides:20,count:1,rolls:[15],total:15,kindText:'Одинаковый бросок'}});
    broadcast({type:'logRow',roomId:'test-room',row:{text:'Сари: Одинаковый бросок: 15 = 15',localNonce:'dice-log:'+localNonce}});
  }
  await gm.waitForFunction(n=>DiceTable.inspect().accepted===n+2,oldAccepted);await settled(gm,15);
  assert.equal(await gm.evaluate(()=>DiceTable.inspect().results.length),2);
  assert.equal(await gm.evaluate(()=>lastState.log.filter(line=>line==='Сари: Одинаковый бросок: 15 = 15').length),2,'distinct identical rolls remain separate journal entries');
  console.log('PASS dice: real 20-die button, forty percentile meshes, reduced motion and bounded GPU resources; identical rolls with distinct IDs both play');

  await gm.getByRole('button',{name:'Развернуть стол бросков'}).click();
  await gm.locator('.dice-table-dialog').waitFor({state:'visible'});
  const rect=await gm.locator('.dice-table-dialog .dice-table__canvas').boundingBox();assert.ok(rect.width>600);
  const rollsBefore=requests.filter(r=>r.path.endsWith('/dice')).length;
  await gm.locator('#dice-table-sides').selectOption('8');await gm.locator('#dice-table-count').fill('3');
  await gm.locator('.dice-table-dialog__controls [type="submit"]').click();
  await gm.waitForFunction(()=>DiceTable.inspect().state==='settled'&&DiceTable.inspect().results.some(r=>r.rolls.length===3));
  const actual=requests.filter(r=>r.path.endsWith('/dice')).slice(rollsBefore);
  assert.equal(actual.length,1);assert.equal(actual[0].data.event.sides,8);assert.equal(actual[0].data.event.rolls.length,3);
  await Promise.all(pages.map(page=>page.waitForFunction(total=>DiceTable.inspect().state==='settled'&&DiceTable.inspect().results.some(r=>r.total===total&&r.rolls.length===3),actual[0].data.event.total)));
  assert.equal(await gm.locator('.dice-table-dialog').isVisible(),true,'throwing from the dialog keeps it open');
  assert.deepEqual(await gm.evaluate(()=>[dice.value,diceCountInput.value]),['8','3']);
  const beforeSpectator=requests.filter(r=>r.path.endsWith('/dice')).length;
  await gm.evaluate(()=>{myRole='Spectator';applyRoleToUI();});
  assert.equal(await gm.locator('.dice-table-dialog__controls [type="submit"]').isDisabled(),true);
  await gm.evaluate(()=>document.querySelector('.dice-table-dialog__controls').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(requests.filter(r=>r.path.endsWith('/dice')).length,beforeSpectator);
  await gm.evaluate(()=>{myRole='GM';applyRoleToUI();});
  console.log('PASS dice controls: journal reveals each result after settling; unrelated events stay immediate; expanded dialog rolls the selected count/type through the real relay');
  if(screenshotDir)await gm.locator('.dice-table-dialog').screenshot({path:path.join(screenshotDir,'dice-expanded.png')});
  await gm.keyboard.press('Escape');await gm.locator('#dice-others .dice-table__canvas').waitFor({state:'attached'});assert.equal(await gm.locator('#dice-others .dice-table__canvas').count(),1);
  await owner.setViewportSize({width:420,height:900});await owner.locator('#dice-others').scrollIntoViewIfNeeded();assert.equal(await owner.locator('#dice-others').isVisible(),true);assert.equal(await owner.locator('#dice-others').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);await picture(owner,'dice-mobile');await owner.setViewportSize({width:1440,height:1000});

  await owner.setViewportSize({width:420,height:900});await owner.getByRole('button',{name:'Развернуть стол бросков'}).click();
  assert.equal(await owner.locator('.dice-table-dialog__controls').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  await owner.locator('#dice-table-count').fill('20');await owner.locator('.dice-table-dialog__controls [data-dice-step="1"]').click();assert.equal(await owner.locator('#dice-table-count').inputValue(),'20');
  if(screenshotDir)await owner.locator('.dice-table-dialog').screenshot({path:path.join(screenshotDir,'dice-controls-mobile.png')});
  await owner.keyboard.press('Escape');await owner.setViewportSize({width:1440,height:1000});
  const context=await gm.context().browser().newContext({viewport:{width:1200,height:1000},reducedMotion:'reduce'});
  await context.route('https://cdn.jsdelivr.net/npm/@supabase/**',route=>route.fulfill({contentType:'text/javascript',body:'window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}})}})};'}));
  await context.addInitScript(()=>{
    const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(String(type).startsWith('webgl'))return null;return original.call(this,type,...args);};
    window.D20_CONFIG={vpsApiBase:location.origin+'/api',wsUrl:location.origin.replace('http:','ws:')+'/ws/'};
  });
  const fallback=await context.newPage();await fallback.goto(base);await fallback.evaluate(()=>{currentRoomId='fallback-room';myId='other';document.getElementById('main-container').style.display='block';document.getElementById('game-container').style.display='block';});
  await fallback.evaluate(()=>DiceTable.show({fromId:'p',fromName:'Без WebGL',id:'fallback',sides:6,count:2,rolls:[3,6],total:9}));
  await settled(fallback,9);assert.deepEqual(await fallback.locator('.dice-table__fallback span').allTextContents(),['3','6']);await context.close();
  assert.ok(requests.filter(r=>r.path.endsWith('/dice')).length>=10);
  assert.equal(requests.filter(r=>r.path.endsWith('/dice')&&r.method==='POST').length,0,'acknowledged WS throws never issue an extra HTTP persistence request');
  await owner.evaluate(async()=>{const old=currentRoomId;currentRoomId='next-room';DiceTable.reset('next-room');await DiceTable.show({fromId:'other',fromName:'Новая комната',localNonce:'after-room-change',sides:6,count:1,rolls:[4],total:4});});
  await settled(owner,4);assert.equal(await owner.evaluate(()=>DiceTable.inspect().room),'next-room');
  console.log('PASS dice: enlarged tray and mobile layout fit, reduced-motion/static fallback preserves results when WebGL is unavailable');
};
