(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.D20Appearance=value;})(globalThis,function(){
  'use strict';
  const styles=[
    {id:'astral',name:'Звёздный свод',description:'Синяя эмаль, созвездия и серебряные цифры',base:'#142b55',accent:'#87ddff',ink:'#ecf8ff',edge:'#799dbf',pattern:'stars',font:'Georgia',metal:.35,rough:.25},
    {id:'prism',name:'Переливчатый кристалл',description:'Рубиновые и синие переливы, золотая гравировка',base:'#701c4b',accent:'#174e9a',ink:'#ffe9a2',edge:'#b794da',pattern:'prism',font:'Georgia',metal:.12,rough:.13,crystal:true},
    {id:'runes',name:'Кровавые руны',description:'Тёмный камень и красные рунические письмена',base:'#202b2d',accent:'#ed4760',ink:'#ff8b93',edge:'#4b5557',pattern:'runes',font:'Trebuchet MS',metal:.15,rough:.8},
    {id:'clockwork',name:'Механика гномов',description:'Чернёное серебро, шестерни и двойные ободы',base:'#39454a',accent:'#acbfc3',ink:'#f0ede0',edge:'#b0c0c8',pattern:'gears',font:'Courier New',metal:.85,rough:.3},
    {id:'frost',name:'Ледяной компас',description:'Светлый кристалл, трещины и роза ветров',base:'#aed8e5',accent:'#f2fcff',ink:'#133a55',edge:'#d5edf8',pattern:'frost',font:'Georgia',metal:.2,rough:.16,crystal:true},
    {id:'dragon',name:'Изумрудный дракон',description:'Зелёная чешуя, медные рёбра и готические цифры',base:'#103e2b',accent:'#55ad78',ink:'#ffd09a',edge:'#be8758',pattern:'scales',font:'Georgia',metal:.55,rough:.3},
    {id:'royal',name:'Золото короны',description:'Золотая филигрань, чёрные медальоны и засечки',base:'#c19b32',accent:'#f8db6b',ink:'#fff0ad',edge:'#232620',pattern:'royal',font:'Georgia',metal:.8,rough:.3},
    {id:'silver',name:'Серебро эльфов',description:'Полированный металл с фиолетовой вязью',base:'#8d999a',accent:'#dce6de',ink:'#612f6c',edge:'#dae1de',pattern:'vines',font:'Georgia',metal:.9,rough:.22},
    {id:'ember',name:'Сердце вулкана',description:'Обсидиан, раскалённые прожилки и рубленые цифры',base:'#241f25',accent:'#ff782f',ink:'#ffe2a1',edge:'#754b35',pattern:'cracks',font:'Impact',metal:.4,rough:.5},
    {id:'ivory',name:'Кость друида',description:'Слоновая кость, древесные кольца и кельтский узел',base:'#d4c29a',accent:'#8b693c',ink:'#334b38',edge:'#87714f',pattern:'knots',font:'Palatino Linotype',metal:.08,rough:.65}
  ].map(Object.freeze);
  const defaults=Object.freeze({boardBackground:'#2a2a2a',boardGrid:'#666666',diceStyle:'astral'});
  const style=id=>styles.find(item=>item.id===id)||styles[0];
  const color=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value).toLowerCase():fallback;
  return Object.freeze({styles:Object.freeze(styles),defaults,style,color});
});
