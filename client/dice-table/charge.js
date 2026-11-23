// A shared pointer controller for tray submits and dynamically rendered sheet dice.
(function(root){
  'use strict';
  const CHARGE_MS=1600,DEAD_ZONE=120,bindings=new WeakMap(),actions=new WeakMap(),active=new Set();
  let contextPower=0;
  const amount=elapsed=>Math.max(0,Math.min(1,(elapsed-DEAD_ZONE)/CHARGE_MS));
  const selector=['.lss-dice-btn[data-roll-kind]','[data-weapon-roll-atk]','[data-weapon-roll-dmg]','[data-cpw-sub-roll]','[data-spell-roll-header]','[data-death-save-roll]','[data-hp-hitdice-roll]','[data-rest-apply]','[data-monster-roll-kind]','[data-monster-hp-roll]','[data-mini-weapon-roll-atk]','[data-mini-weapon-roll-dmg]','[data-mini-power-roll]'].join(',');
  function makeMeter(){
    const meter=document.createElement('span');meter.className='dice-power';meter.setAttribute('role','progressbar');meter.setAttribute('aria-label','Сила броска');meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');meter.title='Удерживайте кнопку броска, чтобы сильнее бросить кубики';
    meter.innerHTML='<span class="dice-power__head"><span>Сила броска</span><small>Обычно</small></span><span class="dice-power__track"><i></i></span>';return meter;
  }
  function controller(button,meter,release,floating=false){
    const label=meter.querySelector('small');let pointer=null,start=0,frame=0,pending=0,suppressClick=false;
    function draw(value){const percent=Math.round(value*100);meter.style.setProperty('--throw-charge',percent+'%');meter.setAttribute('aria-valuenow',String(percent));meter.setAttribute('aria-valuetext',percent?percent+'% усиления':'Обычный бросок');label.textContent=percent?percent+'%':'Обычно';meter.classList.toggle('is-full',value>=1);}
    function stop(){cancelAnimationFrame(frame);frame=0;pointer=null;active.delete(api);meter.classList.remove('is-charging');button.classList.remove('is-charging');}
    function cancel(){const captured=pointer;if(captured!==null)suppressClick=true;stop();pending=0;if(captured!==null&&button.hasPointerCapture(captured))button.releasePointerCapture(captured);draw(0);if(floating)meter.remove();}
    function tick(){if(pointer===null)return;if(button.disabled||!button.isConnected){cancel();return;}draw(amount(performance.now()-start));frame=requestAnimationFrame(tick);}
    function begin(event){
      if(event.button!==0||button.disabled||pointer!==null)return;
      event.preventDefault();button.focus({preventScroll:true});pointer=event.pointerId;start=performance.now();pending=0;suppressClick=false;
      if(floating){const box=button.getBoundingClientRect();meter.classList.add('dice-power--floating');(button.closest('dialog[open]')||document.body).append(meter);meter.style.left=Math.max(8,Math.min(innerWidth-170,box.left+box.width/2-80))+'px';meter.style.top=(box.bottom+56<innerHeight?box.bottom+8:Math.max(8,box.top-56))+'px';}
      button.setPointerCapture(pointer);active.add(api);meter.classList.add('is-charging');button.classList.add('is-charging');tick();
    }
    button.addEventListener('pointerdown',begin);
    button.addEventListener('pointerup',event=>{
      if(pointer!==event.pointerId)return;event.preventDefault();pending=Math.round(amount(performance.now()-start)*100)/100;draw(pending);stop();suppressClick=true;
      if(!button.disabled&&button.isConnected)release(api);else cancel();if(floating)meter.remove();
    });
    button.addEventListener('click',event=>{if(event.detail>0&&suppressClick){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();}},true);
    button.addEventListener('pointercancel',cancel);button.addEventListener('lostpointercapture',()=>{if(pointer!==null)cancel();});
    const api={begin,take:()=>{const value=pending;pending=0;return value;},cancel,inspect:()=>({charging:pointer!==null,power:pending})};draw(0);return api;
  }
  function bind(form){
    if(!form||bindings.has(form))return bindings.get(form);const button=form.querySelector('[type="submit"]');if(!button)return null;
    const meter=makeMeter(),group=document.createElement('span');group.className='dice-throw-control';button.before(group);group.append(button,meter);
    const api=controller(button,meter,()=>form.requestSubmit(button));bindings.set(form,api);return api;
  }
  if(typeof document!=='undefined'){
    document.addEventListener('pointerdown',event=>{
      const button=event.target?.closest?.('button');if(!button||!button.matches(selector))return;
      let api=actions.get(button);if(!api){api=controller(button,makeMeter(),action=>{
        const previous=contextPower;contextPower=action.take();try{button.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,detail:0}));}finally{contextPower=previous;}
      },true);actions.set(button,api);}api.begin(event);
    },true);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&active.size){event.preventDefault();event.stopPropagation();for(const api of [...active])api.cancel();}},true);
    window.addEventListener('blur',()=>{for(const api of [...active])api.cancel();});document.addEventListener('visibilitychange',()=>{if(document.hidden)for(const api of [...active])api.cancel();});
  }
  root.DiceCharge={CHARGE_MS,DEAD_ZONE,amount,bind,power:()=>contextPower,take:form=>bind(form)?.take()||0,cancel:form=>bindings.get(form)?.cancel()};
})(typeof globalThis!=='undefined'?globalThis:this);
