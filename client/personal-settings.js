// Personal sheets reuse the full editor, with a private save transport instead
// of a room transport. Opening the library fetches metadata; one selected sheet
// is loaded on demand. No room state or realtime subscription is needed.
(function () {
  'use strict';
  const button = document.getElementById('tavern-personal-settings'),roomButton=document.getElementById('room-personal-settings');
  let activeTab='characters',openedFrom=button,profile=null,dicePickerOpen=false;
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
    overlay.innerHTML='<section class="personal-settings__panel" role="dialog" aria-modal="true" aria-labelledby="personal-settings-title"><header><div><small>Личный кабинет</small><h2 id="personal-settings-title">Мои настройки</h2></div><button type="button" data-personal-close aria-label="Закрыть мои настройки">✕</button></header><nav class="personal-settings__tabs" aria-label="Разделы личного кабинета" role="tablist"><button type="button" role="tab" data-personal-tab="characters">Мои персонажи</button><button type="button" role="tab" data-personal-tab="statistics">Статистика</button><button type="button" role="tab" data-personal-tab="settings">Настройки</button></nav><div data-personal-panel="characters" role="tabpanel"><div class="personal-settings__intro"><p>Подготовьте персонажа заранее, загрузите JSON или выберите сохранение.</p><button type="button" class="personal-settings__create">＋ Создать персонажа</button></div><div class="personal-settings__list"></div></div><div data-personal-panel="statistics" role="tabpanel" hidden></div><div data-personal-panel="settings" role="tabpanel" hidden></div><div class="personal-settings__status" role="status"></div></section>';

    document.body.append(overlay); list=overlay.querySelector('.personal-settings__list'); status=overlay.querySelector('[role="status"]');
    overlay.querySelector('[data-personal-close]').onclick=close;
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    document.addEventListener('keydown',e=>{
      if(overlay.classList.contains('hidden')||!document.getElementById('sheet-modal').classList.contains('hidden'))return;
      if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}
      if(e.key==='Tab'){
        const nodes=[...overlay.querySelectorAll('button:not(:disabled),input,select')].filter(node=>node.getClientRects().length&&node.tabIndex!==-1),first=nodes[0],last=nodes.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
      }
    },true);
    overlay.querySelector('.personal-settings__create').onclick=()=>void createCharacter();
    const tabs=[...overlay.querySelectorAll('[data-personal-tab]')];
    tabs.forEach((tab,index)=>{tab.onclick=()=>switchTab(tab.dataset.personalTab);tab.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=tabs[e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];switchTab(next.dataset.personalTab);next.focus();};});
    window.addEventListener('d20-preferences-saved',()=>{if(activeTab==='settings')status.textContent='Настройки сохранены';});
    window.addEventListener('d20-preferences-save-error',()=>{if(activeTab==='settings')status.textContent='Сохранено на этом устройстве. Синхронизация недоступна — нажмите «Повторить сохранение».';});
  }
  function close() { epoch++; overlay.classList.add('hidden'); overlay.setAttribute('aria-hidden','true'); openedFrom?.focus(); }
  async function open(from=button) {
    dicePickerOpen=false;
    openedFrom=from;
    mount(); if(session?.owner!==userId())session=null; overlay.classList.remove('hidden'); overlay.setAttribute('aria-hidden','false');
    overlay.querySelector('[data-personal-close]').focus();switchTab('characters');await Promise.all([reload(),loadProfile()]);
  }
  async function reload() {
    const token=++epoch; status.textContent='Загружаю сохранения…'; list.replaceChildren();
    try { const response=await window.CharactersApi.listSavedBases(); if(token!==epoch)return; rows=Array.isArray(response.list)?response.list:[]; status.textContent='';render(); }
    catch(error){if(token===epoch)status.textContent='Не удалось загрузить: '+error.message;}
  }
  function render() {
    list.replaceChildren(); if(!rows.length)status.textContent='Пока нет персонажей. Нажмите «Создать персонажа», затем настройте лист или загрузите JSON.';
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
    const save=document.createElement('button');save.type='button';save.textContent='Сохранить персонажа';save.onclick=async()=>{save.disabled=true;try{await drain(current);setStatus(current,'Все изменения сохранены');}catch(error){setStatus(current,error.message);}finally{save.disabled=false;}};
    controls.append(label,save,create);
    const room=String(typeof currentRoomId!=='undefined'?currentRoomId||'':'');
    if(room&&!room.startsWith('__')){
      const add=document.createElement('button');add.type='button';add.className='personal-settings__add-game';add.textContent='Добавить в игру';
      const ownBase=(typeof players!=='undefined'?players:[]).some(p=>p.isBase&&String(p.ownerId)===current.owner);
      const role=String(typeof myRole!=='undefined'?myRole:'');add.disabled=ownBase||!['Player','GM'].includes(role)||current.addedRoom===room;
      add.title=ownBase?'В этой комнате у вас уже есть основа':!['Player','GM'].includes(role)?'Доступно игрокам и ГМ':'Добавить выбранное сохранение как свою основу';
      add.onclick=async()=>{add.disabled=true;try{await drain(current);current.addRequest ||= crypto.randomUUID();
        const result=await window.vpsApi('/rooms/'+encodeURIComponent(room)+'/characters/'+encodeURIComponent(current.id)+'/add',{method:'POST',body:{requestId:current.addRequest}});
        if(String(currentRoomId||'')===room)handleMessage(result);current.addedRoom=room;add.textContent='Добавлен в игру';setStatus(current,'В игру добавлена копия сохранения. Разместите основу на карте.');
      }catch(error){setStatus(current,error.message);add.disabled=false;}};controls.append(add);
    }
    controls.append(note);actions.append(controls);
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
  function switchTab(tab){
    activeTab=tab;status.textContent='';
    overlay.querySelectorAll('[data-personal-tab]').forEach(button=>{const on=button.dataset.personalTab===tab;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;});
    overlay.querySelectorAll('[data-personal-panel]').forEach(panel=>panel.hidden=panel.dataset.personalPanel!==tab);
    if(tab==='statistics'){renderStatistics();void loadProfile();}if(tab==='settings')renderSettings();
  }
  async function loadProfile(){profile=await window.PersonalPreferences.load();if(activeTab==='statistics')renderStatistics();if(activeTab==='settings')renderSettings();}
  function renderStatistics(){
    const panel=overlay.querySelector('[data-personal-panel="statistics"]');panel.replaceChildren();
    const intro=document.createElement('p');intro.textContent=profile?'Учитываются события с '+new Date(profile.since).toLocaleDateString('ru-RU')+'. Игра в комнате продолжается до перерыва в 30 минут.':'Статистика пока недоступна. Попробуйте открыть раздел позже.';panel.append(intro);if(!profile)return;
    const s=profile.statistics||{},hours=Math.floor((s.roomMs||0)/3600000),minutes=Math.floor((s.roomMs||0)%3600000/60000),grid=document.createElement('div');grid.className='personal-settings__stats';
    const entries=[['Время в комнатах',hours+' ч '+minutes+' мин'],['Посещения комнат',s.visits],['Любимая раса',s.favoriteRace||'Ещё не определена'],['Любимый класс',s.favoriteClass||'Ещё не определён'],['Всего бросков',s.rolls],['Кубиков D20',s.d20],['Критических 20',s.critical20],['Критических 1',s.critical1],['Рекорд 20 за игру',s.maxGame20],['Рекорд 1 за игру',s.maxGame1],['Урон за один ход',s.maxTurnDamage],['Один бросок урона',s.maxDamage],['Суммарный урон',s.damage],['Нокдауны',s.knockdowns],['Смерти',s.deaths],['Стабилизации',s.stabilizations]];
    for(const [label,value] of entries){const card=document.createElement('div'),caption=document.createElement('span'),text=document.createElement('strong');caption.textContent=label;text.textContent=String(value??0);card.append(caption,text);grid.append(card);}panel.append(grid);
    const note=document.createElement('p');note.className='personal-settings__explanation';note.textContent='Любимые раса и класс — по времени игры своей основой. Урон — сумма бросков основы в фазе боя, до сопротивлений; рекорд за ход считается во время собственного хода. Нокдаун — падение с положительного здоровья до 0 или ниже. События до начала сбора не восстанавливаются.';panel.append(note);
    const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Обновить статистику';refresh.onclick=()=>void loadProfile();panel.append(refresh);
  }
  function renderSettings(){
    const panel=overlay.querySelector('[data-personal-panel="settings"]');panel.replaceChildren();const prefs=window.PersonalPreferences.get();
    const heading=document.createElement('h3');heading.textContent='Моё игровое поле';panel.append(heading);
    const colors=document.createElement('div');colors.className='personal-appearance-colors';
    for(const [key,label] of [['boardBackground','Фон поля'],['boardGrid','Линии клеток']]){const row=document.createElement('label');row.textContent=label;const input=document.createElement('input');input.type='color';input.value=prefs[key];input.dataset.preference=key;input.setAttribute('aria-label',label);input.oninput=()=>{PersonalPreferences.set({[key]:input.value});status.textContent='Сохраняю настройки…';};row.append(input);colors.append(row);}panel.append(colors);
    const picker=document.createElement('details');picker.className='personal-dice-picker';picker.open=dicePickerOpen;
    const toggle=document.createElement('summary');toggle.dataset.dicePickerToggle='';const selectedPreview=document.createElement('canvas');selectedPreview.setAttribute('aria-hidden','true');
    const selectedText=document.createElement('span'),diceHeading=document.createElement('strong'),selectedName=document.createElement('span'),count=document.createElement('small');diceHeading.textContent='Мои кубики';selectedName.textContent=D20Appearance.style(prefs.diceStyle).name;count.textContent=D20Appearance.styles.length+' наборов · нажмите, чтобы выбрать';selectedText.append(diceHeading,selectedName,count);toggle.append(selectedPreview,selectedText);picker.append(toggle);DiceAppearance.preview(selectedPreview,prefs.diceStyle);
    const note=document.createElement('p');note.textContent='Набор виден всем при ваших бросках. На d20 корона отмечает 20, череп — 1; число всегда остаётся видимым.';
    const gallery=document.createElement('div');gallery.className='personal-dice-gallery';gallery.setAttribute('aria-label','Наборы кубиков');picker.append(note,gallery);panel.append(picker);
    function renderDiceGallery(){if(gallery.children.length)return;for(const skin of D20Appearance.styles){const card=document.createElement('button');card.type='button';card.dataset.diceStyle=skin.id;card.setAttribute('aria-pressed',String(skin.id===PersonalPreferences.get().diceStyle));card.title=skin.description;const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');const name=document.createElement('strong');name.textContent=skin.name;const hint=document.createElement('small');hint.textContent=skin.description;card.append(canvas,name,hint);DiceAppearance.preview(canvas,skin.id);card.onclick=()=>{PersonalPreferences.set({diceStyle:skin.id});selectedName.textContent=skin.name;DiceAppearance.preview(selectedPreview,skin.id);gallery.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===card)));status.textContent='Сохраняю настройки…';};gallery.append(card);}}
    picker.addEventListener('toggle',()=>{if(!picker.isConnected)return;dicePickerOpen=picker.open;if(picker.open)renderDiceGallery();});if(picker.open)renderDiceGallery();
    const reset=document.createElement('button');reset.type='button';reset.textContent='Сбросить оформление';reset.onclick=()=>{PersonalPreferences.set(D20Appearance.defaults);renderSettings();};panel.append(reset);
    const sounds=document.createElement('h3');sounds.textContent='Эффекты и оповещения';panel.append(sounds);
    for(const [key,label,hint] of [['criticalSound','Звуки критических бросков','Разные сигналы для натуральных 20 и 1 на D20.'],['chatSound','Звук новых сообщений','Короткое оповещение о непрочитанных сообщениях.'],['criticalEffects','Эффекты критических бросков','Золотое или красное свечение у кубика.'],['reduceDiceMotion','Сокращённая анимация кубиков','Сразу показывать результат на столе бросков.']]){
      const row=document.createElement('label');row.className='personal-settings__option';const input=document.createElement('input');input.type='checkbox';input.checked=!!prefs[key];input.dataset.preference=key;
      const text=document.createElement('span'),title=document.createElement('strong'),small=document.createElement('small');title.textContent=label;small.textContent=hint;text.append(title,small);row.append(input,text);panel.append(row);
      input.onchange=()=>{if(key==='criticalSound')window.DiceCriticalFeedback.setEnabled(input.checked);else window.PersonalPreferences.set({[key]:input.checked});status.textContent='Сохраняю настройки…';};
    }
    const row=document.createElement('label');row.className='personal-settings__option';row.textContent='Громкость оповещений';const volume=document.createElement('input');volume.type='range';volume.min='0';volume.max='100';volume.value=prefs.volume;volume.setAttribute('aria-label','Громкость оповещений');const output=document.createElement('output');output.textContent=prefs.volume+'%';row.append(volume,output);panel.append(row);
    volume.oninput=()=>{output.textContent=volume.value+'%';window.PersonalPreferences.set({volume:Number(volume.value)});status.textContent='Сохраняю настройки…';};
    const retry=document.createElement('button');retry.type='button';retry.textContent='Повторить сохранение';retry.onclick=()=>{window.PersonalPreferences.set({});status.textContent='Сохраняю настройки…';};panel.append(retry);
  }
  async function createCharacter(){
    if(loading)return;const create=overlay.querySelector('.personal-settings__create');create.disabled=true;
    try{
      await drain(session);const name='Новый персонаж';
      const result=await window.CharactersApi.saveSavedBase({name,state:{schemaVersion:1,savedAt:new Date().toISOString(),characterKey:crypto.randomUUID(),data:{source:'manual',parsed:{name:{value:name}}}}});
      await reload();const row=rows.find(row=>row.id===result.character.id);await select(result.character.id,key(row||result.character));
    }catch(error){status.textContent=error.message;}finally{create.disabled=false;}
  }
  document.getElementById('sheet-content')?.addEventListener('click',event=>{
    if(window.__sheetCtx?.personal && event.target.closest('.lss-dice-btn,[data-weapon-roll-atk],[data-weapon-roll-dmg],[data-cpw-sub-roll],[data-spell-roll-header],[data-death-save-roll],[data-inv-transfer],[data-coins-transfer]')) { event.preventDefault();event.stopImmediatePropagation(); }
  },true);
  button?.addEventListener('click',()=>void open(button));
  roomButton?.addEventListener('click',()=>void open(roomButton));
  window.PersonalSettings={open,inspect:()=>({groups:groups().size,saves:rows.length,selected:session?.id})};
})();
