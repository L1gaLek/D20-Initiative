const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
module.exports=async({pages,broadcast,requests,base,screenshotDir})=>{
  const [gm,owner,other]=pages;
  const picture=async(page,name)=>{if(screenshotDir){fs.mkdirSync(screenshotDir,{recursive:true});await page.locator('#dice-others').screenshot({path:path.join(screenshotDir,name+'.png')});}};
  const send=async(event)=>owner.evaluate(event=>sendMessage({type:'diceEvent',event}),{fromId:'user-1',fromName:'Альрик',bonus:0,crit:'',...event});
  const settled=async(page,total)=>page.waitForFunction(total=>DiceTable.inspect().state==='settled'&&DiceTable.inspect().results.some(r=>r.total===total),total);
  for(const page of pages){
    assert.equal(await page.locator('.dice-table__canvas').count(),0,'no eager WebGL context');
    await page.locator('#dice-others').scrollIntoViewIfNeeded();
  }
  await send({localNonce:'dice-table-d20',sides:20,count:1,rolls:[17],total:17,kindText:'Проверка: d20'});
  await owner.waitForFunction(()=>DiceTable.inspect().animating);
  const inFlight=await owner.evaluate(()=>DiceTable.inspect());assert.equal(inFlight.dice[0].sides,20);assert.ok(inFlight.frame<130);
  await picture(owner,'dice-rolling');
  await Promise.all(pages.map(page=>settled(page,17)));
  const views=await Promise.all(pages.map(page=>page.evaluate(()=>DiceTable.inspect().dice)));
  for(const dice of views){assert.equal(dice.length,1);assert.equal(dice[0].upLabel,'17');assert.equal(dice[0].value,17);assert.deepEqual(dice[0].position,views[0][0].position);}
  await picture(owner,'dice-d20-settled');
  const frames=await owner.evaluate(()=>DiceTable.inspect().framesRendered);await owner.waitForTimeout(200);assert.equal(await owner.evaluate(()=>DiceTable.inspect().framesRendered),frames,'settled tray does not run RAF');
  const accepted=await other.evaluate(()=>DiceTable.inspect().accepted);
  broadcast({type:'diceEvent',roomId:'test-room',event:{localNonce:'dice-table-d20',fromId:'user-1',fromName:'Альрик',sides:20,count:1,rolls:[17],total:17}});
  await other.waitForTimeout(100);assert.equal(await other.evaluate(()=>DiceTable.inspect().accepted),accepted);
  console.log('PASS dice: real dice relay reaches all five clients including the roller, d20 lands on 17, motion stops, and duplicate echoes do not replay');

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
  assert.ok(await owner.evaluate(()=>DiceTable.inspect().textures)<8,'shared digit atlas bounds textures');
  assert.ok(await owner.evaluate(()=>DiceTable.inspect().geometries)<100,'old throw geometry is released');
  await owner.emulateMedia({reducedMotion:'no-preference'});
  const oldAccepted=await gm.evaluate(()=>DiceTable.inspect().accepted);
  for(const localNonce of ['identical-a','identical-b'])broadcast({type:'diceEvent',roomId:'test-room',event:{fromId:'user-2',fromName:'Сари',localNonce,sides:20,count:1,rolls:[15],total:15}});
  await gm.waitForFunction(n=>DiceTable.inspect().accepted===n+2,oldAccepted);await settled(gm,15);
  assert.equal(await gm.evaluate(()=>DiceTable.inspect().results.length),2);
  console.log('PASS dice: real 20-die button, forty percentile meshes, reduced motion and bounded GPU resources; identical rolls with distinct IDs both play');

  await gm.getByRole('button',{name:'Развернуть стол бросков'}).click();
  await gm.locator('.dice-table-dialog').waitFor({state:'visible'});
  const rect=await gm.locator('.dice-table-dialog .dice-table__canvas').boundingBox();assert.ok(rect.width>600);
  if(screenshotDir)await gm.locator('.dice-table-dialog').screenshot({path:path.join(screenshotDir,'dice-expanded.png')});
  await gm.keyboard.press('Escape');await gm.locator('#dice-others .dice-table__canvas').waitFor({state:'attached'});assert.equal(await gm.locator('#dice-others .dice-table__canvas').count(),1);
  await owner.setViewportSize({width:420,height:900});await owner.locator('#dice-others').scrollIntoViewIfNeeded();assert.equal(await owner.locator('#dice-others').isVisible(),true);assert.equal(await owner.locator('#dice-others').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);await picture(owner,'dice-mobile');await owner.setViewportSize({width:1440,height:1000});

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
  await owner.evaluate(async()=>{const old=currentRoomId;currentRoomId='next-room';DiceTable.reset('next-room');await DiceTable.show({fromId:'other',fromName:'Новая комната',localNonce:'after-room-change',sides:6,count:1,rolls:[4],total:4});});
  await settled(owner,4);assert.equal(await owner.evaluate(()=>DiceTable.inspect().room),'next-room');
  console.log('PASS dice: enlarged tray and mobile layout fit, reduced-motion/static fallback preserves results when WebGL is unavailable');
};
