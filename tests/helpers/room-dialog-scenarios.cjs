const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({pages,screenshotDir})=>{
  const [gm,owner]=pages;
  const picture=async(page,selector,name)=>{if(screenshotDir){fs.mkdirSync(screenshotDir,{recursive:true});await page.locator(selector).screenshot({path:path.join(screenshotDir,name+'.png')});}};
  const fits=async(page,selector)=>{const b=await page.locator(selector).boundingBox(),v=page.viewportSize();assert.ok(b.x>=-1&&b.y>=-1&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1,JSON.stringify({selector,b,v}));};
  for(const [width,height] of [[1366,768],[1920,1080],[390,844],[800,480]]){
    await gm.setViewportSize({width,height});
    for(const id of ['phase','music','save']){
      await gm.evaluate(()=>setActiveGmQuickPanel(''));await gm.locator('#gm-quick-'+id).click();
      await gm.locator('#gm-panel-'+id).waitFor({state:'visible'});await fits(gm,'#gm-panel-'+id);
      assert.equal(await gm.locator('#gm-panel-'+id+' .room-flyout-close').isVisible(),true);
      if(width===1366)await picture(gm,'#gm-panel-'+id,'flyout-'+id);
      await gm.locator('#gm-panel-'+id+' .room-flyout-close').click();assert.equal(await gm.locator('#gm-panel-'+id).isVisible(),false);
    }
  }
  await gm.setViewportSize({width:1366,height:768});await gm.locator('#gm-quick-save').click();
  await gm.evaluate(()=>{
    window.__campaignOriginal={createCampaignSave,listCampaignSavesByOwner,deleteCampaignSave,getCampaignSaveState,applyCampaignSaveToRoom};
    window.__campaignCalls=[];window.__fakeSaves=[{id:'archive-1',name:'Возвращение в Равенлофт',created_at:'2026-11-22T18:00:00Z'},{id:'archive-2',name:'Шахты Фанделвера',created_at:'2026-11-21T18:00:00Z'}];
    createCampaignSave=async(owner,name,state,room)=>{__campaignCalls.push({action:'save',name,state,room});};
    listCampaignSavesByOwner=async()=>JSON.parse(JSON.stringify(__fakeSaves));
    deleteCampaignSave=async id=>{__campaignCalls.push({action:'delete',id});__fakeSaves=__fakeSaves.filter(s=>s.id!==id);};
    getCampaignSaveState=async id=>({id,phase:'exploration',maps:[]});
    applyCampaignSaveToRoom=async(room,state)=>{__campaignCalls.push({action:'load',room,state});};
  });
  await gm.locator('#save-campaign').click();await gm.locator('.room-dialog[open]').waitFor();
  await gm.keyboard.press('Escape');assert.equal(await gm.evaluate(()=>__campaignCalls.length),0);
  await gm.locator('#save-campaign').click();await gm.locator('.room-dialog input').fill('   ');await gm.keyboard.press('Enter');
  assert.equal(await gm.evaluate(()=>__campaignCalls.length),0);assert.equal(await gm.locator('.room-dialog[open]').count(),1);
  await gm.locator('.room-dialog input').fill('Поход к Северным Вратам');await picture(gm,'.room-dialog','campaign-save');await gm.keyboard.press('Enter');
  await gm.getByRole('button',{name:'Понятно',exact:true}).click();
  const saved=await gm.evaluate(()=>__campaignCalls[0]);assert.equal(saved.name,'Поход к Северным Вратам');assert.equal(saved.room,'test-room');assert.ok(saved.state.maps.length>0);
  await gm.locator('#load-campaign').click();await gm.locator('.campaign-saves-dialog[open]').waitFor();
  await gm.locator('[data-cmp-search]').fill('фанд');assert.equal(await gm.locator('.campaign-save-card').count(),1);await gm.locator('[data-cmp-search]').fill('');
  await picture(gm,'.campaign-saves-dialog','campaign-archive');await gm.locator('[data-del="archive-1"]').click();
  await gm.getByRole('button',{name:'Отмена',exact:true}).click();assert.equal(await gm.evaluate(()=>__campaignCalls.length),1);
  await gm.locator('[data-del="archive-1"]').click();await gm.getByRole('button',{name:'Удалить сохранение',exact:true}).click();
  await gm.locator('[data-del="archive-1"]').waitFor({state:'detached'});assert.equal(await gm.locator('[data-pick="archive-2"]').isVisible(),true);
  await gm.setViewportSize({width:390,height:844});await fits(gm,'.campaign-saves-dialog');await picture(gm,'.campaign-saves-dialog','campaign-archive-mobile');
  await gm.locator('[data-pick="archive-2"]').click();assert.deepEqual(await gm.evaluate(()=>__campaignCalls.map(c=>c.action)),['save','delete','load']);
  assert.equal(await gm.evaluate(()=>__campaignCalls.at(-1).state.id),'archive-2');
  await gm.evaluate(()=>{Object.assign(window,__campaignOriginal);delete window.__campaignOriginal;});
  await gm.setViewportSize({width:1366,height:768});await gm.evaluate(()=>setActiveGmQuickPanel(''));
  await gm.locator('#gm-quick-save').click();await gm.locator('#campaign-params').click();await gm.locator('.cmp-overlay:not(.hidden)').waitFor();
  await fits(gm,'.cmp-modal');await picture(gm,'.cmp-modal','campaign-parameters');await gm.locator('.cmp-modal-close').click();
  console.log('PASS room dialogs: phase/music/save flyouts fit four viewports, campaign save validates/cancels, archive filters, delete confirms, load targets the current room, map parameters retain controls');
  await owner.evaluate(()=>{
    window.__persistChatOriginal=persistRoomChatMessage;window.__sentChat=[];persistRoomChatMessage=async message=>{__sentChat.push(message);return null;};
    pushRoomChatMessage({id:'dialog-message',chatType:'global',fromId:'gm',fromName:'Мастер',text:'У ворот таверны вас ждёт проводник. Что вы делаете?',ts:Date.now()},{revealTab:true});
  });
  await owner.locator('#room-chat-open').click();await owner.locator('#room-chat-input').waitFor({state:'visible'});
  assert.equal(await owner.locator('#room-chat-send').isDisabled(),true);
  await owner.locator('[data-room-chat-reply="dialog-message"]').click();await owner.locator('#room-chat-quote').waitFor({state:'visible'});
  await owner.locator('#room-chat-input').fill('Подходим к воротам');await owner.keyboard.press('Shift+Enter');await owner.keyboard.type('и приветствуем проводника.');
  assert.match(await owner.locator('#room-chat-input').inputValue(),/\n/);assert.match(await owner.locator('#room-chat-counter').textContent(),/\/ 500/);
  await picture(owner,'.room-chat-modal','room-messages');await owner.keyboard.press('Enter');
  assert.equal(await owner.evaluate(()=>__sentChat.length),1);assert.equal(await owner.evaluate(()=>__sentChat[0].quote.fromName),'Мастер');assert.match(await owner.evaluate(()=>__sentChat[0].quote.text),/проводник/);assert.match(await owner.evaluate(()=>__sentChat[0].text),/\n/);
  assert.equal(await owner.locator('#room-chat-input').inputValue(),'');assert.equal(await owner.locator('#room-chat-send').isDisabled(),true);
  await owner.locator('#room-chat-users-btn').click();assert.equal(await owner.locator('#room-chat-users-btn').getAttribute('aria-expanded'),'true');
  await owner.locator('[data-room-direct-user="gm"]').click();await owner.locator('[data-room-chat-key="dm:gm"]').waitFor();
  assert.equal(await owner.locator('[data-room-chat-key="dm:gm"]').getAttribute('aria-pressed'),'true');
  await owner.locator('#room-chat-input').fill('Личное сообщение');await owner.locator('#room-chat-send').click();
  assert.equal(await owner.evaluate(()=>__sentChat.at(-1).toId),'gm');
  await owner.setViewportSize({width:390,height:844});await fits(owner,'.room-chat-modal');await picture(owner,'.room-chat-modal','room-messages-mobile');
  await owner.locator('#roomChatClose').focus();await owner.keyboard.press('Shift+Tab');
  await owner.keyboard.press('Escape');assert.equal(await owner.locator('#roomChatModal').isVisible(),false);
  assert.equal(await owner.locator('#room-chat-open').evaluate(el=>document.activeElement===el),true);
  await owner.evaluate(()=>{persistRoomChatMessage=window.__persistChatOriginal;delete window.__persistChatOriginal;});
  console.log('PASS room messages: quote, multiline composer, counter, Enter/Shift+Enter, recipient list and direct thread, disabled empty send, mobile bounds, Escape and restored focus');
};
