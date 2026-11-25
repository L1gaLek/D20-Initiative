const assert=require('node:assert/strict');
module.exports=async({pages,h,mapHarness,syncControls,waitFor})=>{
  const [gm,p1,p2,p3,p4]=pages;
  await gm.evaluate(()=>{
    const wrapper=document.getElementById('board-wrapper');wrapper.style.cssText='width:900px;height:620px;display:block;flex:none';
    const select=document.getElementById('board-view-mode-select');select.value='3d';select.dispatchEvent(new Event('change'));
  });
  await gm.waitForFunction(()=>Board3D.inspect().ready);
  let release;
  syncControls.holdWrite=new Promise(resolve=>{release=resolve;});
  await p1.evaluate(()=>{
    InfoModal.open(players.find(p=>p.id==='player-1'));
    openedSheetPlayer.sheet.parsed.vitality||={};
    openedSheetPlayer.sheet.parsed.vitality['hp-max']={value:30};
    openedSheetPlayer.sheet.parsed.vitality['hp-current']={value:19};
    scheduleSheetSave(openedSheetPlayer);
  });
  await gm.waitForFunction(()=>getLivePlayerView(lastState.players[0]).sheet.parsed.vitality?.['hp-current']?.value===19);
  assert.notEqual(h.database().players[0].sheet.parsed.vitality?.['hp-current']?.value,19);
  assert.notEqual(await gm.evaluate(()=>lastState.players[0].sheet.parsed.vitality?.['hp-current']?.value),19);
  await gm.waitForFunction(()=>Board3D.inspect().tokens.find(t=>t.id==='player-1')?.hud?.health?.hpCur===19);
  const before=await p1.evaluate(()=>RealtimeDebug.events().filter(e=>e.type==='pong').length);
  await p1.evaluate(()=>sendWsEnvelope({type:'ping',roomId:currentRoomId}));
  await p1.waitForFunction(n=>RealtimeDebug.events().filter(e=>e.type==='pong').length>n,before);
  release();syncControls.holdWrite=null;
  await waitFor(()=>h.database().players[0].sheet.parsed.vitality?.['hp-current']?.value===19,'HP committed');
  for(const page of pages)await page.waitForFunction(()=>lastState.players[0].sheet.parsed.vitality?.['hp-current']?.value===19);
  assert.equal(await p1.evaluate(()=>sheetSaveDrafts.size),0);
  await p1.evaluate(()=>upsertSheetNumber(players.find(p=>p.id==='player-1'),'vitality.hp-current',18));
  await waitFor(()=>h.database().players[0].sheet.parsed.vitality['hp-current'].value===18,'mini HP committed');
  console.log('PASS sync: HP previews reach 2D/3D before commit, authority stays unchanged, ping bypasses a held write, and both sheet/mini saves are acknowledged');

  await Promise.all([
    p1.evaluate(()=>{openedSheetPlayer.sheet.parsed.notes.entries=[{text:'Concurrent player note'}];scheduleSheetSave(openedSheetPlayer);flushSheetSaves();}),
    gm.evaluate(()=>sendMessage({type:'patchPlayerSheet',id:'player-1',requestId:crypto.randomUUID(),ops:[{path:['parsed','vitality','hp-temp'],value:{value:7}}]}))
  ]);
  await waitFor(()=>h.database().players[0].sheet.parsed.notes.entries[0].text==='Concurrent player note'&&h.database().players[0].sheet.parsed.vitality['hp-temp']?.value===7,'parallel sheet edits');
  assert.equal(h.database().players[0].sheet.parsed.vitality['hp-current'].value,18,'typing in an older open model cannot revert mini-card HP');
  console.log('PASS sync: concurrent note and temporary HP changes merge instead of replacing the sheet');

  const rowsBefore=syncControls.rowReads;
  await p4.evaluate(()=>wsClient.close());
  await p4.waitForFunction(()=>!wsClient);
  await p1.evaluate(()=>sendMessage({type:'patchPlayerSheet',id:'player-1',requestId:crypto.randomUUID(),ops:[{path:['parsed','vitality','hp-current'],value:{value:11}}]}));
  await waitFor(()=>h.database().players[0].sheet.parsed.vitality['hp-current'].value===11,'offline edit');
  await p4.waitForFunction(()=>wsClient?.__joined&&lastState.players[0].sheet.parsed.vitality?.['hp-current']?.value===11);
  assert.equal(syncControls.rowReads,rowsBefore,'short reconnect replays deltas, no row bootstrap');
  console.log('PASS sync: reconnect catches up missed HP without rereading room tables');

  await p4.evaluate(()=>wsClient.close());await p4.waitForFunction(()=>!wsClient);
  h.context.roomJournal=new (require('../../backend/shared/room-event-journal'))();
  await p1.evaluate(()=>sendMessage({type:'patchPlayerSheet',id:'player-1',requestId:crypto.randomUUID(),ops:[{path:['parsed','vitality','hp-current'],value:{value:8}}]}));
  await waitFor(()=>h.database().players[0].sheet.parsed.vitality['hp-current'].value===8,'restart edit');
  await p4.waitForFunction(()=>wsClient?.__joined&&lastState.players[0].sheet.parsed.vitality?.['hp-current']?.value===8);
  assert.equal(syncControls.rowReads,rowsBefore+8);
  console.log('PASS sync: server restart changes the stream epoch and restores a full snapshot');

  await gm.evaluate(async()=>{
    await sendMessage({type:'setFogSettings',enabled:true,mode:'dynamic',visionRadius:2});
    await new Promise(resolve=>requestAnimationFrame(resolve));
    await sendMessage({type:'fogAddExplored',mapId:'map-1',cells:['55,40']});
  });
  await p2.waitForFunction(()=>__roomDetachedCache.fogByMap.get('map-1')?.explored?.includes('55,40'));
  const beforeFog=mapHarness.fog.get('map-1');
  assert.ok(!beforeFog?.explored_packed?.includes('2455'),'exploration is not awaited for live delivery');
  await waitFor(()=>!!mapHarness.fog.get('map-1')?.explored_packed,'exploration persisted');
  await gm.evaluate(()=>sendMessage({type:'fogAddExplored',mapId:'map-2',cells:['80,60']}));
  await p2.waitForFunction(()=>__roomDetachedCache.fogByMap.get('map-2')?.explored?.includes('80,60'));
  assert.equal(await p2.evaluate(()=>__roomDetachedCache.fogByMap.get('map-1').explored.includes('80,60')),false);
  console.log('PASS sync: fog exploration deltas arrive before the batched save and stay isolated between maps');

  let releaseMovement;
  syncControls.holdMovement=new Promise(resolve=>{releaseMovement=resolve;});
  const writes=syncControls.movementWrites;
  const started=Date.now();
  await p1.evaluate(async()=>{
    await sendMessage({type:'movePlayer',id:'player-1',x:35,y:25});
    await sendMessage({type:'movePlayer',id:'player-1',x:36,y:25});
  });
  for(const page of [gm,p2,p3,p4])await page.waitForFunction(()=>lastState.players[0].x===36);
  const previewMs=Date.now()-started;
  assert.notEqual(mapHarness.tokens.get('map-1::player-1').x,36,'live delivery precedes persistence');
  assert.equal(syncControls.movementWrites,writes+1,'the second save remains ordered behind the held first save');
  releaseMovement();syncControls.holdMovement=null;
  await waitFor(()=>mapHarness.tokens.get('map-1::player-1').x===36,'movement committed');
  for(const page of pages)await page.waitForFunction(()=>lastState.players[0].x===36);
  await gm.waitForFunction(()=>Board3D.inspect().tokens.some(t=>t.id==='player-1'&&t.x===36));
  console.log('PASS sync: two movements reach all four peers before the first save; ordered commits retain the final 2D/3D position ('+previewMs+' ms in local fixture)');
};
