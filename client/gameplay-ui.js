// ================== DICE (from the bottom-left panel) ==================
function escapeGameplayHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function rollStandardDice({sides:chosenSides,count:chosenCount} = {}) {
  if (typeof isSpectator === 'function' && isSpectator()) return;
  if (!currentRoomId) return;
  if (diceAnimBusy) return;
  diceAnimBusy = true;
  rollBtn.disabled = true;
  window.DiceTable?.refreshControls?.();
  try {

  // Used to prevent double animation when the server echoes back our own diceEvent.
  // (We already animate locally in this handler.)
  const localNonce = `n_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  try { window._lastSentDiceNonce = localNonce; } catch {}

  const sides = clampInt(chosenSides ?? dice?.value, 2, 100, 20);
  const count = clampInt(chosenCount ?? diceCountInput?.value, 1, 20, 1);
  if (dice) dice.value = String(sides);
  if (diceCountInput) diceCountInput.value = String(count);

  clearCritUI();

  // Итоговые значения заранее
  const finals = Array.from({ length: count }, () => rollDie(sides));
  const shown = Array.from({ length: count }, () => null);

  renderRollChips(shown, 0, sides);

  if (diceVizKind) diceVizKind.textContent = `d${sides} × ${count}`;
  if (diceVizValue) diceVizValue.textContent = "…";

  // The shared 3D tray animates the whole throw together. Keep one short local
  // preview instead of delaying a twenty-die event by twenty sequential waits.
  for (let i = 0; i < count; i++) {
    renderRollChips(shown, i, sides);
    if (!window.DiceTable || i === 0) await animateSingleRoll(sides, finals[i]);
    shown[i] = finals[i];
    renderRollChips(shown, Math.min(i + 1, count - 1), sides);
  }

const sum = finals.reduce((a, b) => a + b, 0);

// без "Результат:" — только число
if (diceVizValue) diceVizValue.textContent = String(sum);

renderRollChips(shown, -1, sides);

// ✅ крит-подсветка только для одиночного d20 (без инициативы)
const critType = getSingleD20CritType({
  sides,
  count,
  rolls: finals,
  kindText: `d${sides} × ${count}`
});
if (critType) {
  applySingleD20CritUI(finals[0], critType);
} else {
  clearCritUI();
}

const event = {
  localNonce,
  fromId: (typeof myId !== 'undefined') ? String(myId) : '',
  fromName: (typeof myNameSpan !== 'undefined' && myNameSpan?.textContent) ? String(myNameSpan.textContent) : '',
  kindText: `d${sides} × ${count}`,
  sides,
  count,
  bonus: 0,
  rolls: finals,
  total: sum,
  crit: (sides === 20 && count === 1)
    ? (finals[0] === 1 ? "crit-fail" : finals[0] === 20 ? "crit-success" : "")
    : ""
};
try { window.rememberLocalDiceAnimation?.(event); } catch {}

  sendMessage({
  type: "diceEvent",
  event
});

  return event;
  } finally {
    diceAnimBusy = false;
    rollBtn.disabled = false;
    window.DiceTable?.refreshControls?.();
  }
}
window.rollStandardDice = rollStandardDice;
const inlineDiceForm=document.getElementById('dice-inline-controls');
if(inlineDiceForm)inlineDiceForm.addEventListener('submit',event=>{event.preventDefault();void rollStandardDice();});
else rollBtn?.addEventListener('click', () => { void rollStandardDice(); });

// ================== END TURN ==================
endTurnBtn?.addEventListener('click', () => sendMessage({ type: 'endTurn' }));

// ================== INITIATIVE ==================
rollInitiativeBtn?.addEventListener('click', async () => {
  if (typeof isSpectator === 'function' && isSpectator()) return;
  // Инициатива считается на сервере (d20 + модификатор Ловкости).
  // Сервер рассылает diceEvent — мы покажем его у себя в панели и у других в "Броски других".
  // UX: сразу показываем визуальную "заглушку" в панели броска, чтобы действие было видно мгновенно.
  clearCritUI();
  renderRollChips([null], -1, 20);
  if (diceVizKind) diceVizKind.textContent = 'Инициатива: d20';
  if (diceVizValue) diceVizValue.textContent = '…';
  sendMessage({ type: 'rollInitiative' });
});

rollInitiativeAllBtn?.addEventListener('click', () => {
  if (typeof isSpectator === 'function' && isSpectator()) return;
  sendMessage({ type: 'rollInitiativeAllOwned' });
});

/*
// ================== WALLS ==================
editEnvBtn.addEventListener('click', () => {
  editEnvironment = !editEnvironment;
  addWallBtn.disabled = !editEnvironment;
  removeWallBtn.disabled = !editEnvironment;
  wallMode = null;
  editEnvBtn.textContent = editEnvironment ? "Редактирование: ВКЛ" : "Редактирование: ВЫКЛ";
});

addWallBtn.addEventListener('click', () => wallMode = 'add');
removeWallBtn.addEventListener('click', () => wallMode = 'remove');

board.addEventListener('mousedown', e => {
  if (!editEnvironment || !wallMode) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;
  mouseDown = true;
  toggleWall(cell);
});

board.addEventListener('mouseover', e => {
  if (!mouseDown || !editEnvironment || !wallMode) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;
  toggleWall(cell);
});

board.addEventListener('mouseup', () => { mouseDown = false; });

function toggleWall(cell) {
  if (!cell) return;
  const x = +cell.dataset.x, y = +cell.dataset.y;
  if (wallMode === 'add') {
    sendMessage({ type: 'addWall', wall: { x, y } });
    cell.classList.add('wall');
  } else if (wallMode === 'remove') {
    sendMessage({ type: 'removeWall', wall: { x, y } });
    cell.classList.remove('wall');
  }
}

/*
// ================== CREATE BOARD ==================
*/

createBoardBtn.addEventListener('click', () => {
  // ВАЖНО: "Ширина поля/Высота поля" — это персональный вид (рамка/скролл),
  // а не реальный размер карты. Реальный размер меняет только GM через "Применить карту".
  const width = parseInt(boardWidthInput.value, 10);
  const height = parseInt(boardHeightInput.value, 10);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return;

  // Если подключен ControlBox — используем его (он меняет только viewport)
  if (window.ControlBox && typeof window.ControlBox.setViewport === 'function') {
    window.ControlBox.setViewport(width, height);
    return;
  }

  // Fallback (на случай если controlbox.js не загрузился)
  if (width < 5 || height < 5 || width > 80 || height > 80)
    return alert("Введите корректные размеры поля (5–80)");

  // Рамка = размер в пикселях (не меняет state)
  try {
    boardWrapper.style.overflow = 'auto';
    boardWrapper.style.width = `${width * 50}px`;
    boardWrapper.style.height = `${height * 50}px`;
  } catch {}
});

/*
// ================== RESET GAME ==================
*/

resetGameBtn.addEventListener('click', () => {
  playerElements.forEach(el => el.remove());
  playerElements.clear();
  sendMessage({ type: 'resetGame' });
});

/*
// ================== CLEAR BOARD ==================
*/

clearBoardBtn.addEventListener('click', () => {
  sendMessage({ type: 'clearBoard' });
});


// ===== Campaign save/load UI (GM) =====
function snapshotCampaignStateForSave() {
  let st = ensureStateHasMaps(deepClone(lastState || null));
  try {
    st = window.applyDetachedPayloadToState?.(st) || st;
  } catch {}
  // Зафиксируем всё текущее (подложка/стены/позиции) в активную карту перед сохранением
  syncActiveToMap(st);
  return st;
}

let campaignSavesOverlay = null;

function openCampaignSavesOverlay(list,onPick){
  campaignSavesOverlay?.close();
  const dialog=document.createElement('dialog');dialog.className='room-dialog campaign-saves-dialog';
  dialog.setAttribute('aria-labelledby','campaign-saves-title');
  dialog.innerHTML='<header><div><small>Архив приключений</small><h2 id="campaign-saves-title">Загрузить кампанию</h2></div><button type="button" data-cmp-close aria-label="Закрыть сохранения">×</button></header><p>Сохранения этого браузера доступны в любой комнате. Выбранная кампания заменит текущую игру.</p><input type="search" data-cmp-search aria-label="Поиск сохранений" placeholder="Найти кампанию…"><div data-cmp-list></div><p data-cmp-status role="status"></p>';
  const box=dialog.querySelector('[data-cmp-list]'),status=dialog.querySelector('[data-cmp-status]'),search=dialog.querySelector('[data-cmp-search]');
  let saves=Array.isArray(list)?list:[],busy=false;
  function render(){
    box.replaceChildren();const filtered=saves.filter(save=>String(save.name||'Без названия').toLocaleLowerCase('ru').includes(search.value.toLocaleLowerCase('ru')));
    for(const save of filtered){
      const row=document.createElement('article');row.className='campaign-save-card';
      const info=document.createElement('div'),name=document.createElement('strong'),date=document.createElement('small');name.textContent=save.name||'Без названия';date.textContent=save.created_at?new Date(save.created_at).toLocaleString('ru-RU'):'Сохранение кампании';info.append(name,date);
      const actions=document.createElement('div'),load=document.createElement('button'),remove=document.createElement('button');
      load.type=remove.type='button';load.textContent='Загрузить';load.className='room-action-primary';remove.textContent='Удалить';remove.className='room-action-danger';load.dataset.pick=remove.dataset.del=save.id;load.disabled=remove.disabled=busy;
      load.onclick=()=>{dialog.close();void onPick?.(save.id);};
      remove.onclick=async()=>{
        if(!await RoomDialogs.confirm({title:'Удалить сохранение?',message:'«'+(save.name||'Без названия')+'» будет удалено из архива. Текущая игра останется в комнате.',confirmLabel:'Удалить сохранение'}))return;
        busy=true;render();status.textContent='Удаляю сохранение…';
        try{await deleteCampaignSave(save.id);saves=saves.filter(row=>row.id!==save.id);status.textContent='Сохранение удалено';}
        catch(error){status.textContent='Не удалось удалить: '+error.message;}
        finally{busy=false;render();}
      };
      actions.append(load,remove);row.append(info,actions);box.append(row);
    }
    if(!filtered.length){const empty=document.createElement('div');empty.className='room-dialog-empty';empty.textContent=saves.length?'По этому названию ничего не найдено':'Сохранений пока нет. Сохраните кампанию, чтобы продолжить её позже.';box.append(empty);}
  }
  search.oninput=render;dialog.querySelector('[data-cmp-close]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{dialog.remove();if(campaignSavesOverlay===dialog)campaignSavesOverlay=null;},{once:true});
  document.body.append(dialog);campaignSavesOverlay=dialog;render();dialog.showModal();search.focus();
}

saveCampaignBtn?.addEventListener('click',async()=>{
  if(!isGM()||!currentRoomId)return;
  const roomId=currentRoomId;
  const name=await RoomDialogs.prompt({title:'Сохранить кампанию',message:'Сохранятся карты, позиции персонажей и состояние игры.',label:'Название сохранения',value:'Кампания '+new Date().toLocaleString('ru-RU'),confirmLabel:'Сохранить'});
  if(!name||currentRoomId!==roomId)return;
  saveCampaignBtn.disabled=true;
  try{await createCampaignSave(getCampaignOwnerKey(),name,snapshotCampaignStateForSave(),roomId);await RoomDialogs.notice('Кампания сохранена. Её можно загрузить в этой или другой комнате.','Сохранение готово');}
  catch(error){await RoomDialogs.notice('Не удалось сохранить кампанию: '+error.message,'Ошибка сохранения');}
  finally{saveCampaignBtn.disabled=false;}
});

loadCampaignBtn?.addEventListener('click',async()=>{
  if(!isGM()||!currentRoomId)return;
  const roomId=currentRoomId;loadCampaignBtn.disabled=true;
  try{
    const list=await listCampaignSavesByOwner(getCampaignOwnerKey());if(currentRoomId!==roomId)return;
    openCampaignSavesOverlay(list,async saveId=>{
      try{const state=await getCampaignSaveState(saveId);if(!state)throw new Error('Сохранение не найдено');if(currentRoomId===roomId)await applyCampaignSaveToRoom(roomId,state);}
      catch(error){await RoomDialogs.notice('Не удалось загрузить кампанию: '+error.message,'Ошибка загрузки');}
    });
  }catch(error){await RoomDialogs.notice('Не удалось получить список: '+error.message,'Сохранения недоступны');}
  finally{loadCampaignBtn.disabled=false;}
});

// ===== SRD Monsters (GM) =====
openMonstersBtn?.addEventListener('click', async () => {
  try {
    if (!isGM()) return;
    await ensureMonstersLibrary();
    window.MonstersLib?.open?.();
  } catch (e) {
    console.error(e);
    alert('Не удалось открыть библиотеку монстров');
  }
});
