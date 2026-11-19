/* Health and death saves use the same data in the sheet and on both maps. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.TokenHealth=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  const number=(value,fallback=0)=>value==null||value===''?fallback:Number.isFinite(Number(value))?Number(value):fallback;
  const count=value=>Math.max(0,Math.min(3,Math.trunc(number(value))));
  function describe(sheet){
    const v=sheet?.vitality||{},max=number(v['hp-max']?.value),cur=number(v['hp-current']?.value,max),temp=Math.max(0,number(v['hp-temp']?.value));
    const ds=v.deathSaves||{},success=count(ds.success),fail=count(ds.fail),lastRoll=number(ds.lastRoll,null);
    const mode=max>0&&cur<=0?(fail>=3?'dead':ds.stabilized||success>=3?'stable':'dying'):'health';
    const comparison=lastRoll==null?'':lastRoll>=10?'≥ 10':'< 10';
    const result=lastRoll==null?'':lastRoll===20?'20 · восстановлен 1 ОЗ':lastRoll===1?'1 < 10 · два провала':`${lastRoll} ${comparison} · ${lastRoll>=10?'успех':'провал'}`;
    return {max,cur,temp,success,fail,lastRoll,mode,result,
      text:mode==='dead'?'Мёртв':mode==='stable'?'Стабилизирован':mode==='dying'?'Спасброски смерти':temp>0?`${temp} (${cur}/${max})`:`${cur}/${max}`,
      color:mode==='dead'?'#9b343b':mode==='stable'?'#34805d':temp>0?'#004a6b':'#428d65',
      ratio:temp>0||mode==='dead'||mode==='stable'?1:max>0?Math.max(0,Math.min(1,cur/max)):0};
  }
  function applyRoll(sheet,roll){
    const state=describe(sheet);
    if(state.mode!=='dying')return {roll:null,outcome:'inactive'};
    const n=Math.trunc(number(roll,0));
    if(n<1||n>20)throw new Error('Некорректный бросок d20');
    sheet.vitality ||= {};
    const ds=sheet.vitality.deathSaves ||= {};
    Object.assign(ds,{success:state.success,fail:state.fail,stabilized:false,lastRoll:n});
    if(n===20){
      Object.assign(ds,{success:0,fail:0,lastOutcome:'crit-success'});
      sheet.vitality['hp-current'] ||= {};sheet.vitality['hp-current'].value=1;
    }else if(n<10){
      ds.fail=Math.min(3,ds.fail+(n===1?2:1));
      ds.lastOutcome=ds.fail>=3?'dead':n===1?'crit-fail':'fail';
    }else{
      ds.success=Math.min(3,ds.success+1);ds.stabilized=ds.success>=3;
      ds.lastOutcome=ds.stabilized?'stabilized':'success';
    }
    return {roll:n,outcome:ds.lastOutcome};
  }
  return {describe,applyRoll};
});
