// One lazy renderer and one physics worker for the shared dice tray. Animation
// consumes the confirmed dice event; it never generates or saves game results.
(function(){
  'use strict';
  const base=new URL('dice-table/',document.currentScript.src),version='20261124-charge-1';
  let root,stage,caption,summary,pendingLabel,dialog,home,engine,loading,worker,job=0,generation=0;
  let room='',queue=[],busy=false,timer=null,state='idle',accepted=0,completed=0,last=[],failed=false,visible=true;
  const seen=new Map(),fingerprints=new Map(),jobs=new Map();
  const timelines=new Map(),revealWaiters=new Set();
  const logTiming=new DiceLogTiming.Coordinator();
  let rollForm,rollSides,rollCount,rollSubmit;
  const api=window.DiceTable={show,remember,reset,deferLog,refreshControls,inspect:()=>({state,room,accepted,completed,queued:queue.length,
    results:last.map(item=>({name:item.name,total:item.total,rolls:item.rolls})),throwPowers:last.map(item=>item.dice[0]?.throwPower||0),revealAt:last[0]?.timeline?.revealAt,settledAt:last[0]?.settledAt,...(engine?.inspect()||{})})};
  function mount(){
    if(root)return;
    root=document.getElementById('dice-others');if(!root)return;
    root.classList.add('dice-others--table');
    const title=root.querySelector('.dice-others__title');
    const expand=document.createElement('button');expand.type='button';expand.className='dice-table__expand';expand.textContent='⛶';expand.title='Развернуть стол бросков';expand.setAttribute('aria-label','Развернуть стол бросков');expand.addEventListener('click',expandTable);title?.append(expand);
    home=document.createElement('div');home.className='dice-table';
    home.innerHTML='<div class="dice-table__stage"><div class="dice-table__empty" aria-hidden="true"><span>20</span><small>Общий стол</small></div><div class="dice-table__waiting" role="status"><span aria-hidden="true">⬡</span>Ожидаем результат…</div></div><div class="dice-table__caption">Кубики появятся при следующем броске</div><div class="dice-table__summary" aria-live="polite" aria-atomic="true"></div><div class="dice-table__pending"></div>';
    root.insertBefore(home,root.querySelector('.dice-others__list'));stage=home.querySelector('.dice-table__stage');caption=home.querySelector('.dice-table__caption');summary=home.querySelector('.dice-table__summary');pendingLabel=home.querySelector('.dice-table__pending');
    new IntersectionObserver(entries=>{visible=!!entries[0]?.isIntersecting;}).observe(stage);
    stage.addEventListener('dice-context-lost',()=>{engine?.dispose();engine=null;loading=null;if(state!=='settled')stage.classList.add('is-awaiting-result');stage.classList.add('dice-table__stage--fallback');fallback(last);});
  }
  function expandTable(){
    const scope=currentRoom();if(scope!==room)reset(scope);
    if(!dialog){dialog=document.createElement('dialog');dialog.className='dice-table-dialog';dialog.setAttribute('aria-label','Общий стол бросков');
      const header=document.createElement('div');header.className='dice-table-dialog__header';const title=document.createElement('strong');title.textContent='Общий стол бросков';
      const close=document.createElement('button');close.type='button';close.textContent='Закрыть';close.addEventListener('click',()=>dialog.close());header.append(title,close);dialog.append(header);document.body.append(dialog);
      createRollControls();
      dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});dialog.addEventListener('close',()=>{window.DiceCharge?.cancel(rollForm);root.insertBefore(home,root.querySelector('.dice-others__list'));engine?.resize();});
    }
    refreshControls(true);dialog.append(home);dialog.showModal();engine?.resize();
  }
  function createRollControls(){
    rollForm=document.createElement('form');rollForm.className='dice-table-dialog__controls';
    rollForm.innerHTML='<label class="dice-table-dialog__field">Кубик<select id="dice-table-sides" aria-label="Кубик"></select></label>'+
      '<label class="dice-table-dialog__field">Количество<span class="dice-table-dialog__count"><button type="button" data-dice-step="-1" aria-label="Уменьшить количество кубиков">−</button><input id="dice-table-count" aria-label="Количество кубиков" type="number" min="1" max="20" step="1" value="1" required><button type="button" data-dice-step="1" aria-label="Увеличить количество кубиков">+</button></span></label>'+
      '<button class="dice-table-dialog__roll" type="submit">Бросить</button><span class="dice-table-dialog__hint">До 20 кубиков за бросок</span>';
    rollSides=rollForm.querySelector('select');rollCount=rollForm.querySelector('input');rollSubmit=rollForm.querySelector('[type="submit"]');
    const source=document.getElementById('dice');
    for(const option of source.options)rollSides.append(new Option(option.textContent,option.value));
    rollForm.addEventListener('click',event=>{const button=event.target.closest('[data-dice-step]');if(!button)return;rollCount.value=String(Math.min(20,Math.max(1,(Number(rollCount.value)||1)+Number(button.dataset.diceStep))));});
    window.DiceCharge?.bind(rollForm);
    rollForm.addEventListener('submit',async event=>{
      event.preventDefault();refreshControls();if(rollSubmit.disabled)return;
      await window.rollStandardDice?.({sides:Number(rollSides.value),count:Number(rollCount.value),throwPower:window.DiceCharge?.take(rollForm)||0});refreshControls();
    });
    dialog.append(rollForm);
  }
  function refreshControls(syncValues=false){
    const spectator=typeof isSpectator==='function'&&isSpectator();
    const rolling=typeof diceAnimBusy!=='undefined'&&diceAnimBusy;
    const disabled=!currentRoom()||spectator;
    const inline=document.getElementById('dice-inline-controls');
    if(inline){inline.querySelectorAll('input,select,[data-step-target]').forEach(node=>node.disabled=disabled);const submit=inline.querySelector('[type="submit"]');if(submit){submit.disabled=disabled||rolling;submit.textContent=rolling?'Бросок…':'Бросить';}}
    if(!rollForm)return;
    rollSides.disabled=rollCount.disabled=disabled;
    rollForm.querySelectorAll('[data-dice-step]').forEach(button=>button.disabled=disabled);
    rollSubmit.disabled=disabled||rolling;rollSubmit.textContent=rolling?'Бросок…':'Бросить';
    if(syncValues){rollSides.value=document.getElementById('dice')?.value||'20';rollCount.value=document.getElementById('dice-count')?.value||'1';}
  }
  function deferLog(msg,{knownOnly=false}={}){
    const scope=currentRoom();if(scope!==room)reset(scope);
    if(!scope||msg.__diceLogReady)return false;
    return logTiming.hold(msg.row,()=>{
      if(scope===currentRoom())handleMessage({...msg,__diceLogReady:true});
    },{knownOnly});
  }
  function currentRoom(){return String(typeof currentRoomId!=='undefined'?currentRoomId:'');}
  function prune(map,max){while(map.size>max)map.delete(map.keys().next().value);}
  function keys(ev){return [ev?.id?`id:${String(ev.id).slice(0,200)}`:'',ev?.localNonce?`nonce:${String(ev.localNonce).slice(0,200)}`:''].filter(Boolean);}
  function timelineFor(ev,serverNow){
    const ids=keys(ev),incoming=DicePresentation.read(ev?.presentation,Date.now(),serverNow);
    let timeline=ids.map(id=>timelines.get(id)).find(Boolean);
    if(!timeline)timeline=incoming;
    else if(incoming.authoritative&&!timeline.authoritative)Object.assign(timeline,incoming);
    for(const id of ids)timelines.set(id,timeline);prune(timelines,512);return timeline;
  }
  function waitForReveal(timeline){
    return new Promise(resolve=>{
      let timeout;const done=()=>{clearTimeout(timeout);revealWaiters.delete(done);resolve();};
      const check=()=>{const remaining=timeline.revealAt-Date.now();if(remaining>0)timeout=setTimeout(check,remaining);else done();};
      revealWaiters.add(done);check();
    });
  }
  function remember(ev){const scope=currentRoom();if(scope!==room)reset(scope);for(const key of keys(ev))seen.set(room+'|'+key,Date.now());prune(seen,512);}
  function duplicate(ev){
    const ids=keys(ev);if(ids.some(key=>seen.has(room+'|'+key)))return true;
    const fingerprint=[room,ev?.fromId,ev?.kindText,ev?.sides,ev?.rolls?.join(','),ev?.bonus,ev?.total].join('|'),now=Date.now();
    const old=fingerprints.get(fingerprint),kind=ev?.localNonce?'nonce':ev?.id?'id':'none';
    // Bridge legacy WS and DB-row deliveries without merging distinct rolls
    // that happen to have exactly the same values and different stable IDs.
    const same=old&&now-old.at<1500&&(kind==='none'||old.kind==='none'||kind!==old.kind);
    fingerprints.set(fingerprint,{at:now,kind});prune(fingerprints,128);remember(ev);return !!same;
  }
  function reset(nextRoom=''){
    if(dialog?.open)dialog.close();
    window.DiceCharge?.cancel(document.getElementById('dice-inline-controls'));window.DiceCharge?.cancel(rollForm);
    generation++;room=String(nextRoom);queue=[];clearTimeout(timer);timer=null;busy=false;state='idle';last=[];failed=false;
    seen.clear();fingerprints.clear();engine?.dispose();engine=null;loading=null;worker?.terminate();worker=null;
    timelines.clear();for(const cancel of [...revealWaiters])cancel();
    logTiming.reset();
    for(const pending of jobs.values()){clearTimeout(pending.timer);pending.reject(new Error('Dice room changed'));}jobs.clear();
    stage?.classList.remove('has-dice','dice-table__stage--fallback','is-awaiting-result');stage?.querySelector('.dice-table__fallback')?.remove();
    if(summary)summary.replaceChildren();if(caption)caption.textContent='Кубики появятся при следующем броске';if(pendingLabel)pendingLabel.textContent='';
  }
  async function show(ev,{historical=false,serverNow=0}={}){
    mount();if(!stage)return false;
    const scope=currentRoom();if(scope!==room)reset(scope);
    if(!scope||scope.startsWith('__'))return false;
    const line=window.buildDiceLogText?.(ev)||'';
    if(historical){logTiming.settle(logTiming.begin(ev,line));remember(ev);return false;}
    const timeline=timelineFor(ev,serverNow);
    if(duplicate(ev))return false;
    const logTicket=logTiming.begin(ev,line);
    const epoch=generation;
    let model;
    try{model=await import(new URL('model.mjs?v='+version,base));}
    catch{
      if(epoch!==generation)return false;
      stage.classList.add('has-dice','is-awaiting-result');await waitForReveal(timeline);if(epoch!==generation)return false;
      const rolls=Array.isArray(ev.rolls)?ev.rolls.map(Number):[];
      last=[{name:String(ev.fromName||'Игрок'),total:Number(ev.total),rolls,dice:rolls.slice(0,40).map(value=>({sides:Number(ev.sides),value,mode:'normal'}))}];
      fallback(last);stage.classList.remove('is-awaiting-result');window.DiceCriticalFeedback?.play(last.flatMap(item=>item.dice));state='settled';caption.textContent=String(ev.kindText||'Бросок');showSummary(last,true);logTiming.settle(logTicket);return false;
    }
    const {normalizeEvent,seedNumber,PALETTE}=model;
    if(epoch!==generation||scope!==currentRoom())return false;
    const item=normalizeEvent(ev);if(!item){logTiming.settle(logTicket);return false;}item.logTicket=logTicket;item.timeline=timeline;accepted++;
    item.color=PALETTE[seedNumber(item.fromId||item.name)%PALETTE.length];
    item.diceStyle=D20Appearance.style(ev.diceStyle).id;item.color=D20Appearance.style(item.diceStyle).base;
    item.dice.forEach(die=>{die.ownerKey=item.fromId||item.name;die.eventKey=item.seed;die.diceStyle=item.diceStyle;});
    if(queue.length>=12){const skipped=queue.shift();void waitForReveal(skipped.timeline).then(()=>{if(epoch===generation)logTiming.settle(skipped.logTicket);});}queue.push({...item,part:0});updatePending();
    if(!busy&&!timer)timer=setTimeout(()=>{timer=null;void run();},120);
    return true;
  }
  function updatePending(){if(pendingLabel)pendingLabel.textContent=queue.length?'В очереди: '+queue.length:'';}
  async function getEngine(){
    if(failed)throw new Error('Dice rendering unavailable');
    if(engine)return engine;if(loading)return loading;
    const epoch=generation;
    loading=import(new URL('scene.mjs?v='+version,base)).then(module=>{
      if(epoch!==generation)throw new Error('Dice room changed');
      return engine=module.createDiceScene(stage);
    });
    try{return await loading;}catch(error){if(epoch===generation){loading=null;failed=true;stage.classList.add('dice-table__stage--fallback');}throw error;}
  }
  function simulate(dice,seed){
    if(!worker){worker=new Worker(new URL('worker.mjs?v='+version,base),{type:'module'});
      worker.onmessage=({data})=>{const pending=jobs.get(data.id);if(!pending)return;jobs.delete(data.id);clearTimeout(pending.timer);data.error?pending.reject(new Error(data.error)):pending.resolve(data);};
      const instance=worker;
      worker.onerror=()=>{if(worker!==instance)return;for(const pending of jobs.values()){clearTimeout(pending.timer);pending.reject(new Error('Dice worker unavailable'));}jobs.clear();instance.terminate();worker=null;};
    }
    return new Promise((resolve,reject)=>{const id=++job,timer=setTimeout(()=>{jobs.delete(id);worker?.terminate();worker=null;reject(new Error('Dice simulation timeout'));},8000);jobs.set(id,{resolve,reject,timer});worker.postMessage({id,dice,seed});});
  }
  function fallback(items){
    stage.classList.add('has-dice','dice-table__stage--fallback');
    stage.querySelector('.dice-table__fallback')?.remove();const wrap=document.createElement('div');wrap.className='dice-table__fallback';
    for(const item of items)for(const die of item.dice.slice(0,40)){const el=document.createElement('span');el.textContent=die.mode==='tens'?String((die.value%10)*10).padStart(2,'0'):die.mode==='ones'?String(die.value%10):String(die.value);el.title='d'+die.sides;const critical=Number(die.sides)===20?(Number(die.value)===20?'success':Number(die.value)===1?'failure':''):'';if(critical&&window.PersonalPreferences?.get().criticalEffects!==false){el.dataset.critical=critical;el.title+=' · '+(critical==='success'?'Критическая удача':'Критический провал');}wrap.append(el);}
    stage.append(wrap);
  }
  function showSummary(items,settled){
    summary.replaceChildren();
    for(const item of items){const chip=document.createElement('span');chip.className='dice-table__result';chip.dataset.crit=item.crit;
      const own=String(typeof myId!=='undefined'?myId:'')===item.fromId;
      chip.style.setProperty('--dice-ink',item.color);
      chip.textContent=(own?'Вы':item.name)+': '+(settled?item.total:'…');
      chip.title=item.kind+' · '+item.rolls.join(' + ')+(item.bonus?' '+(item.bonus>0?'+':'')+item.bonus:'');summary.append(chip);}
  }
  async function run(){
    if(busy||!queue.length)return;busy=true;const epoch=generation,items=[queue.shift()];
    const batch=items[0].dice.splice(0,40);items[0].part++;
    if(!items[0].dice.length)while(queue.length&&items.length<4&&queue[0].timeline.revealAt===items[0].timeline.revealAt&&batch.length+queue[0].dice.length<=40){const next=queue.shift();items.push(next);batch.push(...next.dice);}
    const continuation=items[0].dice.length?items[0]:null;
    if(continuation)queue.unshift(continuation);last=items.map(item=>({...item,dice:batch.filter(d=>d.eventKey===item.seed)}));state='preparing';updatePending();
    // Damage formulas can already contain rolled values; do not put them in
    // the visible caption while the shared throw is still in progress.
    caption.textContent='Бросают: '+items.map(item=>item.name).join(', ');
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches||window.PersonalPreferences?.get().reduceDiceMotion;
    showSummary(items,false);stage.classList.add('has-dice');stage.classList.toggle('is-awaiting-result',!!reduced);
    let animationFinished=false;
    try{
      const seed=items.map(item=>item.seed+':'+item.part).join('|');
      const [scene,plan]=await Promise.all([getEngine(),simulate(batch,seed)]);
      if(epoch!==generation)return;state='rolling';
      stage.classList.remove('dice-table__stage--fallback');stage.querySelector('.dice-table__fallback')?.remove();
      if(!reduced)stage.classList.remove('is-awaiting-result');
      await scene.play(plan,batch,seed,reduced,items[0].timeline);animationFinished=true;
    }catch(error){if(epoch!==generation)return;stage.classList.add('is-awaiting-result');console.warn('Dice renderer unavailable; waiting for the shared result',error);}
    if(epoch!==generation)return;
    await waitForReveal(items[0].timeline);
    if(epoch!==generation)return;
    if(animationFinished)engine?.finish();else fallback(last);
    stage.classList.remove('is-awaiting-result');
    if(animationFinished&&window.PersonalPreferences?.get().criticalEffects!==false)engine?.celebrate(!visible||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches);
    window.DiceCriticalFeedback?.play(batch);
    state='settled';for(const item of last)item.settledAt=Date.now();completed+=items.length;showSummary(items,!continuation);
    caption.textContent=items.map(item=>item.name).join(', ')+' · бросок завершён';
    for(const item of items)if(item!==continuation)logTiming.settle(item.logTicket);
    if(items.some(item=>item.omitted))caption.textContent+=' · остальные кубики — в журнале';
    busy=false;updatePending();
    if(queue.length)timer=setTimeout(()=>{timer=null;void run();},0);
  }
  mount();
})();
