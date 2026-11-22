let tokenAccessView = null;

function getTokenAccessRoomUsers() {
  const users=new Map();
  for(const user of ctx?.getUsers?.()||[]){
    const id=String(user?.id||user?.userId||user?.user_id||'');
    const role=window.normalizeRoleForApp?.(user?.role)||user?.role;
    if(!id||!['GM','Player'].includes(role))continue;
    users.set(id,{id,role,name:String(user.name||'Игрок')});
  }
  return [...users.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru')||a.id.localeCompare(b.id));
}

function refreshTokenAccessUsers() {
  const view=tokenAccessView;
  if(!view||!view.bar.isConnected||view.roomId!==String(ctx?.getRoomId?.()||''))return;
  const users=getTokenAccessRoomUsers().filter(user=>user.id!==view.owner);
  for(const control of view.controls){
    const {select,button,action,current,emptyLabel,status}=control;
    const choice=control.initialized?select.value:current;
    select.replaceChildren(new Option(emptyLabel,''));
    for(const user of users)select.appendChild(new Option(user.name,user.id));
    if(action==='controller'&&current&&!users.some(user=>user.id===current)){
      const missing=new Option((view.player.controllerName||'Управляющий')+' · вне комнаты',current);
      missing.disabled=true;select.appendChild(missing);
    }
    select.value=[...select.options].some(option=>option.value===choice)?choice:'';
    control.initialized=true;
    button.disabled=(action==='owner'&&!select.value)||!!select.selectedOptions[0]?.disabled;
    if(choice&&choice!==select.value)status.textContent='Участник вышел из комнаты. Выберите другого.';
  }
}

function renderSheetSubtitle(player, typeLabel) {
  sheetSubtitle.replaceChildren();
  for (const [label, value] of [['Владелец', player.ownerName || '—'], ['Тип', typeLabel]]) {
    const chip = document.createElement('span');
    chip.className = 'sheet-meta-chip';
    const caption = document.createElement('span');
    caption.textContent = `${label}:`;
    const text = document.createElement('strong');
    text.textContent = String(value || '—');
    chip.append(caption, text);
    sheetSubtitle.appendChild(chip);
  }
}

function renderTokenAccessControls(player) {
  let bar = document.getElementById('sheet-token-access');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'sheet-token-access';
    bar.className = 'sheet-token-access';
    sheetSubtitle.after(bar);
  }
  bar.replaceChildren();
  bar.hidden = !!ctx?.personal;
  if (ctx?.personal) { tokenAccessView = null; document.getElementById('sheet-affiliation')?.remove(); return; }
  const role = window.normalizeRoleForApp?.(ctx?.getMyRole?.()) || ctx?.getMyRole?.();
  const uid = String(ctx?.getMyId?.() || '');
  const owner = String(player.ownerId || '');
  const mayManage = role === 'GM' || (role === 'Player' && uid === owner);
  tokenAccessView={bar,player,owner,roomId:String(ctx?.getRoomId?.()||''),controls:[]};
  const persist = async (action, value) => {
    flushSheetSaves(player.id);
    const result = await window.vpsApi(`/rooms/${encodeURIComponent(ctx.getRoomId())}/players/${encodeURIComponent(player.id)}/access`, {
      method: 'POST', body: { action, targetUserId: action === 'affiliation' ? undefined : value,
        affiliation: action === 'affiliation' ? value : undefined,
        sheet: deepClone(player.sheet), sheetUpdatedAt: Number(player.sheetUpdatedAt) || 0 }
    });
    const saved = result.state?.players?.find(p => String(p.id) === String(player.id));
    if (saved && JSON.stringify(saved.sheet) === JSON.stringify(player.sheet)) acknowledgeSheetSave(player.id, saved.sheetUpdatedAt);
    ctx?.applyState?.(result.state);
  };
  document.getElementById('sheet-affiliation')?.remove();
  const affiliation = document.createElement('span');
  affiliation.id = 'sheet-affiliation';
  affiliation.dataset.affiliation = player.isEnemy ? 'enemy' : 'ally';
  const affiliationSelect = document.createElement('select');
  affiliationSelect.setAttribute('aria-label', 'Принадлежность');
  affiliationSelect.append(new Option('Союзник', 'ally'), new Option('Враг', 'enemy'));
  affiliationSelect.value = player.isEnemy ? 'enemy' : 'ally';
  affiliationSelect.disabled = !mayManage;
  const affiliationStatus = document.createElement('span');
  affiliationStatus.setAttribute('role', 'status');
  affiliationSelect.addEventListener('change', async () => {
    affiliationSelect.disabled = true;
    affiliationStatus.textContent = 'Сохраняю…';
    try {
      await persist('affiliation', affiliationSelect.value);
      affiliationStatus.textContent = '';
    }
    catch (error) {
      affiliationSelect.value = player.isEnemy ? 'enemy' : 'ally';
      affiliationStatus.textContent = error?.message || 'Не удалось сохранить';
    } finally { affiliationSelect.disabled = !mayManage; }
  });
  affiliation.append(affiliationSelect, affiliationStatus);
  document.getElementById('sheet-title-row')?.appendChild(affiliation);
  if (player.controllerId) {
    const info = document.createElement('span');
    info.className = 'sheet-token-access__current';
    info.textContent = `Управление: ${player.controllerName || player.controllerId}`;
    bar.appendChild(info);
  }
  if (!mayManage) return;
  const addAction = (action, title, emptyLabel, current) => {
    const group = document.createElement('div');
    group.className = 'sheet-token-access__group';
    group.dataset.tokenAction = action;
    const caption = document.createElement('span');
    caption.textContent = title;
    const select = document.createElement('select');
    select.setAttribute('aria-label', title);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action === 'owner' ? 'Передать токен' : 'Применить';
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    tokenAccessView.controls.push({action,select,button,status,emptyLabel,current,initialized:false});
    select.addEventListener('change',()=>{
      status.textContent='';button.disabled=(action==='owner'&&!select.value)||!!select.selectedOptions[0]?.disabled;
    });
    button.addEventListener('click', async () => {
      if (action === 'owner' && !select.value) return;
      if(select.value&&!getTokenAccessRoomUsers().some(user=>user.id===select.value)){
        status.textContent='Участник уже вышел из комнаты.';refreshTokenAccessUsers();return;
      }
      button.disabled = true;
      status.textContent = 'Сохраняю…';
      try {
        await persist(action, select.value);
        status.textContent = 'Сохранено';
      } catch (error) {
        status.textContent = error?.message || 'Не удалось сохранить';
      } finally { button.disabled = false; }
    });
    group.append(caption, select, button, status);
    bar.appendChild(group);
  };
  if (role === 'GM') addAction('owner', 'Передача токена', 'Выберите нового владельца', '');
  addAction('controller', 'Передача управления', 'Только владелец и ГМ', String(player.controllerId || ''));
  refreshTokenAccessUsers();
}
