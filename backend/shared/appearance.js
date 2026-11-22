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
    {id:'ivory',name:'Кость друида',description:'Слоновая кость, древесные кольца и кельтский узел',base:'#d4c29a',accent:'#8b693c',ink:'#334b38',edge:'#87714f',pattern:'knots',font:'Palatino Linotype',metal:.08,rough:.65},
    {id:'honey',name:'Янтарная пасека',description:'Прозрачный янтарь, соты и маленькие пчёлы',base:'#a9570b',accent:'#ffd15b',ink:'#fff1b8',edge:'#e3b352',pattern:'honey',font:'Georgia',metal:.1,rough:.18,crystal:true},
    {id:'mycelium',name:'Грибная роща',description:'Тёмный мох, красные шляпки и светлые споры',base:'#17382e',accent:'#91bd7e',ink:'#ffefc9',edge:'#5a815e',pattern:'mushrooms',font:'Palatino Linotype',metal:.05,rough:.5},
    {id:'porcelain',name:'Синий фарфор',description:'Молочная глазурь и кобальтовые цветочные розетки',base:'#e9ede5',accent:'#afcde3',ink:'#16427a',edge:'#648eb3',pattern:'porcelain',font:'Georgia',metal:.12,rough:.15},
    {id:'tide',name:'Морской прибой',description:'Бирюзовая смола, гребни волн и жемчужная пена',base:'#0c5267',accent:'#57d1cf',ink:'#f3f9e7',edge:'#85cfca',pattern:'waves',font:'Trebuchet MS',metal:.15,rough:.2,crystal:true},
    {id:'cathedral',name:'Витраж собора',description:'Рубиновые и сапфировые стёкла в золотой оправе',base:'#241843',accent:'#7a5b9c',ink:'#fff0ba',edge:'#c59e57',pattern:'glass',font:'Georgia',metal:.5,rough:.2},
    {id:'sakura',name:'Лепестки сакуры',description:'Розовый перламутр, тонкие ветви и цветы вишни',base:'#cc82a4',accent:'#ffe2e8',ink:'#522a54',edge:'#e6b3bb',pattern:'sakura',font:'Palatino Linotype',metal:.12,rough:.24},
    {id:'dunes',name:'Пески времени',description:'Слоистые золотистые барханы и медная гравировка',base:'#b77936',accent:'#f5d39b',ink:'#3e2d27',edge:'#9b6037',pattern:'dunes',font:'Georgia',metal:.18,rough:.7},
    {id:'malachite',name:'Малахитовая жила',description:'Полированный зелёный камень с волнистыми полосами',base:'#155c40',accent:'#70bb7e',ink:'#ffedbf',edge:'#bed296',pattern:'malachite',font:'Georgia',metal:.25,rough:.22},
    {id:'citrus',name:'Цитрусовая алхимия',description:'Лимонно-апельсиновые дольки под прозрачной эмалью',base:'#c45b21',accent:'#ffcc4c',ink:'#442d21',edge:'#f0d58b',pattern:'citrus',font:'Trebuchet MS',metal:.08,rough:.23},
    {id:'oracle',name:'Карты оракула',description:'Чёрный лак, золотые солнца, полумесяцы и рамки карт',base:'#242137',accent:'#77634b',ink:'#f1d093',edge:'#b49b62',pattern:'tarot',font:'Palatino Linotype',metal:.4,rough:.32}
  ].map(Object.freeze);
  const defaults=Object.freeze({boardBackground:'#2a2a2a',boardGrid:'#666666',diceStyle:'astral'});
  const style=id=>styles.find(item=>item.id===id)||styles[0];
  const color=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value).toLowerCase():fallback;
  return Object.freeze({styles:Object.freeze(styles),defaults,style,color});
});
