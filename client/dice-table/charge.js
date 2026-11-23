// Holding a submit button charges only the visual impulse. Dice values and the
// shared reveal deadline are independent of this controller.
(function(root){
  'use strict';
  const CHARGE_MS=1600,DEAD_ZONE=120,bindings=new WeakMap();
  const amount=elapsed=>Math.max(0,Math.min(1,(elapsed-DEAD_ZONE)/CHARGE_MS));
  function bind(form){
    if(!form||bindings.has(form))return bindings.get(form);
    const button=form.querySelector('[type="submit"]');if(!button)return null;
    const meter=document.createElement('span');meter.className='dice-power';meter.setAttribute('role','progressbar');meter.setAttribute('aria-label','Сила броска');meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');meter.title='Удерживайте кнопку броска, чтобы сильнее бросить кубики';
    meter.innerHTML='<span class="dice-power__head"><span>Сила броска</span><small>Обычно</small></span><span class="dice-power__track"><i></i></span>';
    const group=document.createElement('span');group.className='dice-throw-control';button.before(group);group.append(button,meter);const label=meter.querySelector('small');let pointer=null,start=0,frame=0,pending=0,suppressClick=false;
    function draw(value){const percent=Math.round(value*100);meter.style.setProperty('--throw-charge',percent+'%');meter.setAttribute('aria-valuenow',String(percent));meter.setAttribute('aria-valuetext',percent?percent+'% усиления':'Обычный бросок');label.textContent=percent?percent+'%':'Обычно';meter.classList.toggle('is-full',value>=1);}
    function cancel(){const captured=pointer;if(captured!==null)suppressClick=true;cancelAnimationFrame(frame);frame=0;pointer=null;pending=0;if(captured!==null&&button.hasPointerCapture(captured))button.releasePointerCapture(captured);meter.classList.remove('is-charging');button.classList.remove('is-charging');draw(0);}
    function tick(){if(pointer===null)return;if(button.disabled){cancel();return;}draw(amount(performance.now()-start));frame=requestAnimationFrame(tick);}
    button.addEventListener('pointerdown',event=>{
      if(event.button!==0||button.disabled||pointer!==null)return;
      event.preventDefault();button.focus({preventScroll:true});pointer=event.pointerId;start=performance.now();pending=0;suppressClick=false;
      button.setPointerCapture(pointer);meter.classList.add('is-charging');button.classList.add('is-charging');tick();
    });
    button.addEventListener('pointerup',event=>{
      if(pointer!==event.pointerId)return;event.preventDefault();cancelAnimationFrame(frame);frame=0;
      pending=Math.round(amount(performance.now()-start)*100)/100;draw(pending);pointer=null;suppressClick=true;meter.classList.remove('is-charging');button.classList.remove('is-charging');
      if(!button.disabled)form.requestSubmit(button);else cancel();
    });
    button.addEventListener('click',event=>{if(event.detail>0&&suppressClick){suppressClick=false;event.preventDefault();event.stopImmediatePropagation();}},true);
    button.addEventListener('keydown',event=>{if(event.key==='Escape'&&pointer!==null){event.preventDefault();cancel();}});
    button.addEventListener('pointercancel',cancel);button.addEventListener('lostpointercapture',()=>{if(pointer!==null)cancel();});
    window.addEventListener('blur',cancel);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
    const api={take:()=>{const value=pending;pending=0;return value;},cancel,inspect:()=>({charging:pointer!==null,power:pending})};bindings.set(form,api);draw(0);return api;
  }
  root.DiceCharge={CHARGE_MS,DEAD_ZONE,amount,bind,take:form=>bind(form)?.take()||0,cancel:form=>bindings.get(form)?.cancel()};
})(typeof globalThis!=='undefined'?globalThis:this);
