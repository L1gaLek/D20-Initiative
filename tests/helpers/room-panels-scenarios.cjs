const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({pages,requests,screenshotDir})=>{
  const [gm,owner]=pages;
  const picture=async(page,selector,name)=>{if(screenshotDir){fs.mkdirSync(screenshotDir,{recursive:true});await page.locator(selector).screenshot({path:path.join(screenshotDir,name+'.png')});}};
  for(const page of [gm,owner]){
    const sizes=await page.evaluate(async()=>{
      const css=document.querySelector('[href*="room-panels.css"]').sheet,rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {w:r.width,h:r.height};};
      css.disabled=true;const before={journal:rect('action-log'),people:rect('player-list-container'),tray:rect('dice-others')};css.disabled=false;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      return {before,after:{journal:rect('action-log'),people:rect('player-list-container'),tray:rect('dice-others')}};
    });
    assert.equal(sizes.after.journal.w,sizes.before.journal.w);assert.equal(sizes.after.people.w,sizes.before.people.w);
    assert.equal(sizes.after.tray.w,sizes.after.journal.w);if(await page.locator('[href*="room-workspace.css"]').count())assert.ok(Math.abs(sizes.after.journal.h/sizes.after.tray.h-2/3)<.02);else assert.ok(sizes.after.tray.h>sizes.before.tray.h,JSON.stringify(sizes));
    assert.equal(await page.locator('#dice-viz').count(),0);assert.equal(await page.locator('#dice-canvas').count(),0);
    assert.equal(await page.locator('#dice-table-title').textContent(),'Стол для бросков');
    assert.equal(await page.locator('#dice-inline-controls').isVisible(),true);
    assert.equal(await page.locator('#dice-inline-controls').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  }
  await gm.evaluate(()=>{lastState.log=['Группа вошла в древнюю библиотеку.','Альрик: Проверка Внимательности: 17 + 3 = 20','Сари обнаружила потайную дверь.','Нивен: Атака мечом: 14 + 5 = 19','Альрик: Урон: 2d8 [6 + 4] + 3 = 13'];renderLog(lastState.log);});
  await picture(gm,'#action-log','journal');
  await owner.evaluate(()=>{const p=players.find(p=>p.ownerId===myId);p.name='Александриэль Хранительница Последнего Рассвета';updatePlayerList();});
  assert.equal(await owner.locator('#player-list-container').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  assert.equal(await owner.locator('.player-list-item[data-player-id="player-1"]').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  await picture(owner,'#player-list-container','characters');
  const before=requests.filter(r=>r.path.endsWith('/dice')).length;
  await owner.locator('#dice').selectOption('8');await owner.locator('#dice-count').fill('2');
  await owner.locator('#roll').click();
  await owner.waitForFunction(()=>DiceTable.inspect().state==='settled'&&DiceTable.inspect().results.some(r=>r.rolls.length===2));
  const sent=requests.filter(r=>r.path.endsWith('/dice')).slice(before);assert.equal(sent.length,1);assert.equal(sent[0].data.event.sides,8);assert.equal(sent[0].data.event.rolls.length,2);
  await Promise.all(pages.map(page=>page.waitForFunction(total=>DiceTable.inspect().state==='settled'&&DiceTable.inspect().results.some(r=>r.total===total&&r.rolls.length===2),sent[0].data.event.total)));
  assert.equal(await owner.locator('.dice-table-dialog').count(),0,'inline throw never opens the dialog');
  await picture(owner,'#dice-others','inline-table');
  await owner.locator('#dice-count').fill('20');await owner.locator('#dice-inline-controls [data-step-dir="1"]').click();assert.equal(await owner.locator('#dice-count').inputValue(),'20');
  await owner.locator('#dice-count').fill('1');await owner.locator('#dice-inline-controls [data-step-dir="-1"]').click();assert.equal(await owner.locator('#dice-count').inputValue(),'1');
  await owner.getByRole('button',{name:'Развернуть стол бросков'}).click();
  assert.deepEqual(await owner.locator('#dice-table-sides').inputValue(),'8');assert.equal(await owner.locator('#dice-table-count').inputValue(),'1');
  await owner.keyboard.press('Escape');
  const count=requests.filter(r=>r.path.endsWith('/dice')).length;
  await owner.evaluate(()=>{myRole='Spectator';applyRoleToUI();document.getElementById('dice-inline-controls').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  assert.equal(await owner.locator('#roll').isDisabled(),true);assert.equal(requests.filter(r=>r.path.endsWith('/dice')).length,count);
  await owner.evaluate(()=>{myRole='Player';applyRoleToUI();});
  await owner.setViewportSize({width:420,height:900});
  assert.equal(await owner.locator('#dice-inline-controls').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  assert.equal(await owner.locator('#dice-others').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  await picture(owner,'#dice-others','inline-mobile');
  console.log('PASS room panels: unchanged journal/character widths, full-width taller tray, visible controls, one actual 2d8 event for all clients, bounded steppers, dialog sync, spectator guard and mobile fit');
};
