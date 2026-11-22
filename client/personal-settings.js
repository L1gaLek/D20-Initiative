// Personal sheets reuse the full editor, with a private save transport instead
// of a room transport. Opening the library fetches metadata; one selected sheet
// is loaded on demand. No room state or realtime subscription is needed.
(function () {
  'use strict';
  const button = document.getElementById('tavern-personal-settings');
  let overlay, list, status, selectedKey = '', rows = [], session = null, loading = false, epoch = 0;
  const copy = value => JSON.parse(JSON.stringify(value));
  const userId = () => String(typeof myId !== 'undefined' ? myId || '' : '');
  const key = row => row.characterKey || 'legacy:' + String(row.name || 'Персонаж').trim().toLocaleLowerCase('ru');
  const date = row => { const value=new Date(row.savedAt || row.updatedAt); return Number.isNaN(+value)?'Сохранение':value.toLocaleString('ru-RU',{dateStyle:'short',timeStyle:'short'}); };
  function groups() {
    const map=new Map();
    for(const row of rows) { const k=key(row); if(!map.has(k))map.set(k,[]); map.get(k).push(row); }
    return map;
  }
  function mount() {
    if(overlay)return;
    overlay=document.createElement('div'); overlay.className='modal-overlay personal-settings hidden'; overlay.setAttribute('aria-hidden','true');
    overlay.innerHTML='<section class="personal-settings__panel" role="dialog" aria-modal="true" aria-labelledby="personal-settings-title"><header><div><small>Личный кабинет</small><h2 id="personal-settings-title">Мои настройки</h2></div><button type="button" data-personal-close aria-label="Закрыть мои настройки">✕</button></header><p>Ваши персонажи и сохранения. Лист можно редактировать прямо здесь.</p><div class="personal-settings__sound"><label><input type="checkbox" id="critical-sound-enabled"> Звуки критических бросков D20</label><span>20 — удача · 1 — провал</span></div><div class="personal-settings__list"></div><div class="personal-settings__status" role="status"></div></section>';
    document.body.append(overlay); list=overlay.querySelector('.personal-settings__list'); status=overlay.querySelector('[role="status"]');
    overlay.querySelector('[data-personal-close]').onclick=close;
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    document.addEventListener('keydown',e=>{
      if(overlay.classList.contains('hidden')||!document.getElementById('sheet-modal').classList.contains('hidden'))return;
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}
      if(e.key==='Tab'){
        const nodes=[...overlay.querySelectorAll('button:not(:disabled),input,select')],first=nodes[0],last=nodes.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    },true);
    overlay.querySelector('input').addEventListener('change',e=>window.DiceCriticalFeedback?.setEnabled(e.target.checked));
  }
  function close() { epoch++; overlay.classList.add('hidden'); overlay.setAttribute('aria-hidden','true'); button.focus(); }
  async function open() {
    mount(); if(session?.owner!==userId())session=null; overlay.classList.remove('hidden'); overlay.setAttribute('aria-hidden','false'); overlay.querySelector('input').checked=window.DiceCriticalFeedback?.isEnabled()!==false;
    overlay.querySelector('[data-personal-close]').focus(); await reload();
  }
  async function reload() {
    const token=++epoch; status.textContent='Загружаю сохранения…'; list.replaceChildren();
    try { const response=await window.CharactersApi.listSavedBases(); if(token!==epoch)return; rows=Array.isArray(response.list)?response.list:[]; status.textContent='';render(); }
    catch(error){if(token===epoch)status.textContent='Не удалось загрузить: '+error.message;}
  }
  function render() {
    list.replaceChildren(); if(!rows.length)status.textContent='Пока нет сохранённых основ. В комнате откройте лист своей основы и нажмите «Сохранить основу».';
    for(const [k,saves] of groups()) {
      const card=document.createElement('button'); card.type='button'; card.className='personal-settings__character';
      const crest=document.createElement('span'); crest.className='personal-settings__crest'; crest.textContent=String(saves[0].name||'?').slice(0,1).toLocaleUpperCase('ru');
      const title=document.createElement('strong'); title.textContent=saves[0].name || 'Персонаж';
      const details=document.createElement('small'); details.textContent=`Сохранений: ${saves.length} · ${date(saves[0])}`;
      const text=document.createElement('span'); text.append(title,details); card.append(crest,text); card.disabled=loading;
      card.onclick=()=>void select(saves[0].id,k); list.append(card);
    }
  }
  async function drain(current) {
    if(!current)return;
    window.InfoModal.flushSheetSaves(current.player.id);
    const until=Date.now()+12000;
    while(window.InfoModal.hasPendingSheetSaves(current.player.id,current.context)) {
      if(Date.now()>until)throw new Error('Правки ещё не сохранены. Проверьте соединение и повторите попытку.');
      await new Promise(resolve=>setTimeout(resolve,80));
    }
  }
  async function select(id,k) {
    if(loading)return; loading=true; render(); status.textContent='Открываю лист…';
    try {
      await drain(session);
      const owner=userId(), response=await window.CharactersApi.getSavedBase(id);
      if(owner!==userId() || overlay.classList.contains('hidden'))return;
      const saved=response.character;
      if(!saved?.state?.data?.parsed)throw new Error('В сохранении отсутствует лист персонажа');
      selectedKey=saved.characterKey || k;
      const current={id:saved.id,key:selectedKey,owner,player:{id:saved.id,isBase:true,ownerId:owner,ownerName:'Вы',name:saved.name,
        sheet:copy(saved.state.data),sheetUpdatedAt:+new Date(saved.updatedAt)||Date.now()},state:copy(saved.state),context:null};
      const context=current.context={
        getMyId:()=>owner,getMyRole:()=> 'Player',getRoomId:()=> 'personal',getPlayers:()=>[current.player],getUsers:()=>[],
        sendMessage:async msg=>{
          if(owner!==userId())throw new Error('Войдите в аккаунт владельца сохранения');
          if(msg.type==='patchPlayerSheet') {
            setStatus(current,'Сохраняю…');
            try {
              const result=await window.CharactersApi.patchSavedBase(current.id,{ops:msg.ops,requestId:msg.requestId});
              current.player.sheet=SheetSync.apply(current.player.sheet,msg.ops);
              current.player.name=result.character.name; current.state.data=copy(current.player.sheet);
              Object.assign(rows.find(row=>String(row.id)===String(current.id))||{},result.character);
              window.InfoModal.acknowledgeSheetPatch(msg.id,msg.requestId,+new Date(result.character.updatedAt),context);
              setStatus(current,window.InfoModal.hasPendingSheetSaves(current.player.id,context)?'Сохраняю…':'Все изменения сохранены');
            } catch(error) { setStatus(current,'Не сохранено · повторим автоматически'); throw error; }
          } else if(msg.type==='saveSavedBase') { await createSave(current); }
          else if(msg.type==='listSavedBases') { /* Personal version picker is already visible. */ }
        },
        decorateSheet:(actions,player)=>decorate(actions,player,current),
        onClose:()=>{render();status.textContent='';}
      };
      session=current; window.InfoModal.openPersonal(current.player,context); status.textContent='';
    } catch(error) { status.textContent=error.message; setStatus(session,error.message); }
    finally {loading=false;render();}
  }
  function setStatus(current,text) {
    if(session!==current)return;
    const node=document.querySelector('[data-personal-save-status]'); if(node)node.textContent=text;
    status.textContent=text;
  }
  function decorate(actions,player,current) {
    actions.querySelector('.saved-bases-actions')?.remove();
    actions.querySelector('.sheet-personal-saves')?.remove();
    const controls=document.createElement('div'); controls.className='sheet-personal-saves';
    const label=document.createElement('label');label.textContent='Сохранение';
    const picker=document.createElement('select'); picker.setAttribute('aria-label','Сохранение персонажа');
    for(const [index,row] of rows.filter(row=>key(row)===current.key).entries())picker.append(new Option('№ '+(index+1)+' · '+(row.saveLabel?row.saveLabel+' · ':'')+date(row),row.id));
    picker.value=current.id;
    picker.onchange=async()=>{picker.disabled=true;await select(picker.value,current.key);picker.value=current.id;picker.disabled=false;};
    label.append(picker);
    const create=document.createElement('button');create.type='button';create.textContent='+ Новое сохранение';
    create.onclick=async()=>{create.disabled=true;try{await createSave(current);}catch(error){setStatus(current,error.message);}finally{create.disabled=false;}};
    const note=document.createElement('span');note.dataset.personalSaveStatus='';note.setAttribute('role','status');note.textContent='Изменения сохраняются автоматически';
    controls.append(label,create,note);actions.append(controls);
    // Rolls and transfers are room actions; editing inventory, equipment,
    // appearance, spells and notes remains available in the personal library.
    const content=document.getElementById('sheet-content');
    content.querySelectorAll('.lss-dice-btn,[data-weapon-roll-atk],[data-weapon-roll-dmg],[data-cpw-sub-roll],[data-spell-roll-header],[data-death-save-roll],[data-inv-transfer],[data-coins-transfer]').forEach(node=>{node.disabled=true;node.title='Броски и передача доступны в комнате';});
  }
  async function createSave(current) {
    await drain(current);
    const model=window.InfoModal.getEditorPlayer();
    const sheet=String(model?.id)===String(current.id)?model.sheet:current.player.sheet;
    const name=String(sheet.parsed?.name?.value || sheet.parsed?.name || current.player.name);
    const state={schemaVersion:1,savedAt:new Date().toISOString(),characterKey:current.key,data:copy(sheet)};
    const result=await window.CharactersApi.saveSavedBase({name,state});
    rows.unshift({...result.character,characterKey:current.key,savedAt:state.savedAt});
    await select(result.character.id,current.key);
  }
  document.getElementById('sheet-content')?.addEventListener('click',event=>{
    if(window.__sheetCtx?.personal && event.target.closest('.lss-dice-btn,[data-weapon-roll-atk],[data-weapon-roll-dmg],[data-cpw-sub-roll],[data-spell-roll-header],[data-death-save-roll],[data-inv-transfer],[data-coins-transfer]')) { event.preventDefault();event.stopImmediatePropagation(); }
  },true);
  button?.addEventListener('click',()=>void open());
  window.PersonalSettings={open,inspect:()=>({groups:groups().size,saves:rows.length,selected:session?.id})};
})();
