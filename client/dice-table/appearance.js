(function(){
  'use strict';
  function rng(seed){let s=seed;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};}
  function surface(ctx,skin,size=256){
    ctx.save();ctx.scale(size/256,size/256);const rand=rng(731+skin.id.length),g=ctx.createLinearGradient(0,0,256,256);
    g.addColorStop(0,skin.accent);g.addColorStop(.32,skin.base);g.addColorStop(1,skin.base);ctx.fillStyle=g;ctx.fillRect(0,0,256,256);ctx.strokeStyle=skin.accent;ctx.fillStyle=skin.accent;ctx.lineWidth=1.8;
    const line=(x,y,a,b)=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(a,b);ctx.stroke();};
    const ring=(x,y,r)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();};
    ctx.globalAlpha=.6;
    if(skin.pattern==='stars'){
      for(let i=0;i<65;i++){const x=rand()*256,y=rand()*256,r=rand()*1.7+.5;ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();if(i%7===0){line(x-5,y,x+5,y);line(x,y-5,x,y+5);}}
      for(let i=0;i<8;i++){const x=rand()*200,y=rand()*200;line(x,y,x+30,y+18);line(x+30,y+18,x+42,y-14);}
    }else if(skin.pattern==='prism'){
      for(let i=0;i<22;i++){ctx.fillStyle=['#e92d54','#1688c2','#7d36c1','#25aeaa'][i%4];ctx.globalAlpha=.24;ctx.beginPath();ctx.moveTo(rand()*256,rand()*256);for(let j=0;j<3;j++)ctx.lineTo(rand()*256,rand()*256);ctx.closePath();ctx.fill();}ctx.globalAlpha=.7;for(let i=0;i<80;i++){ctx.fillStyle=i%2?skin.ink:skin.accent;ctx.fillRect(rand()*256,rand()*256,1+rand()*2,1+rand()*2);}
    }else if(skin.pattern==='runes'){
      for(let y=18;y<256;y+=37)for(let x=15;x<256;x+=34){const flip=rand()>.5?1:-1;line(x,y-10,x,y+10);line(x,y-8,x+8*flip,y-1);line(x,y+2,x-7*flip,y+9);if(rand()>.5)line(x-7,y-11,x+7,y-11);}
    }else if(skin.pattern==='gears'){
      for(let y=30;y<280;y+=70)for(let x=30;x<280;x+=70){ring(x,y,20);ring(x,y,13);for(let j=0;j<14;j++){const a=j*Math.PI/7;line(x+19*Math.cos(a),y+19*Math.sin(a),x+26*Math.cos(a),y+26*Math.sin(a));}ring(x,y,4);}
    }else if(skin.pattern==='frost'){
      for(let i=0;i<13;i++){const x=rand()*256,y=rand()*256;for(let j=0;j<6;j++){const a=j*Math.PI/3,r=18+rand()*15;line(x,y,x+Math.cos(a)*r,y+Math.sin(a)*r);for(const side of [-1,1])line(x+Math.cos(a)*r*.6,y+Math.sin(a)*r*.6,x+Math.cos(a)*r*.6+Math.cos(a+side*.7)*9,y+Math.sin(a)*r*.6+Math.sin(a+side*.7)*9);}}
    }else if(skin.pattern==='scales'){
      for(let y=-20;y<290;y+=27)for(let x=-25;x<290;x+=38){ctx.beginPath();ctx.arc(x+(y%2?0:19),y,23,.1,Math.PI-.1);ctx.stroke();ctx.globalAlpha=.13;ctx.fill();ctx.globalAlpha=.65;}
    }else if(skin.pattern==='royal'){
      ctx.fillStyle='#343523';for(let y=20;y<280;y+=75)for(let x=20;x<280;x+=75){ctx.beginPath();ctx.arc(x,y,25,0,7);ctx.fill();ring(x,y,30);for(let j=0;j<8;j++){const a=j*Math.PI/4;ctx.beginPath();ctx.ellipse(x+Math.cos(a)*35,y+Math.sin(a)*35,7,3,a,0,7);ctx.stroke();}}
    }else if(skin.pattern==='vines'){
      for(let i=0;i<10;i++){const x=rand()*256,y=rand()*256;ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x-60,y+20,x+60,y+50,x,y+110);ctx.stroke();for(let j=0;j<5;j++){ctx.beginPath();ctx.ellipse(x+(j%2?12:-12),y+j*18,12,4,j%2?-.7:.7,0,7);ctx.stroke();}}
    }else if(skin.pattern==='cracks'){
      ctx.shadowColor=skin.accent;ctx.shadowBlur=4;for(let i=0;i<9;i++){let x=rand()*256,y=0;for(let j=0;j<9;j++){const nx=x+(rand()-.5)*60,ny=y+32;line(x,y,nx,ny);if(j%3===0)line(x,y,x+25,y+14);x=nx;y=ny;}}
    }else{
      for(let y=0;y<290;y+=48)for(let x=0;x<290;x+=48){ctx.beginPath();ctx.ellipse(x,y,24,11,Math.PI/4,0,7);ctx.stroke();ctx.beginPath();ctx.ellipse(x,y,24,11,-Math.PI/4,0,7);ctx.stroke();ring(x,y,5);}
    }
    ctx.globalAlpha=.1;for(let i=0;i<1000;i++){ctx.fillStyle=rand()>.5?'#ffffff':'#000000';ctx.fillRect(rand()*256,rand()*256,1,1);}ctx.restore();
  }
  function face(ctx,skin,value,critical=false){
    ctx.save();ctx.strokeStyle=skin.ink;ctx.fillStyle=skin.ink;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=1.1;
    ctx.globalAlpha=.55;ctx.beginPath();ctx.arc(48,48,42,0,Math.PI*2);ctx.stroke();
    if(['gears','royal','knots'].includes(skin.pattern)){ctx.beginPath();ctx.arc(48,48,38,0,7);ctx.stroke();for(let j=0;j<12;j++){const a=j*Math.PI/6;ctx.beginPath();ctx.moveTo(48+39*Math.cos(a),48+39*Math.sin(a));ctx.lineTo(48+43*Math.cos(a),48+43*Math.sin(a));ctx.stroke();}}
    if(skin.pattern==='royal'){ctx.globalAlpha=.9;ctx.fillStyle='#1a2119';ctx.beginPath();ctx.arc(48,48,32,0,7);ctx.fill();}
    ctx.globalAlpha=1;ctx.fillStyle=skin.ink;const special=critical&&(String(value)==='20'||String(value)==='1');ctx.font=`${skin.pattern==='vines'?'italic ':''}bold ${special?45:49}px "${skin.font}",serif`;ctx.lineJoin='round';ctx.strokeStyle=skin.base;ctx.lineWidth=2.2;ctx.strokeText(value,48,special?47:49,70);ctx.fillText(value,48,special?47:49,70);
    if(value==='6'||value==='9'){ctx.fillRect(42,73,12,2);}
    if(special){ctx.strokeStyle=skin.ink;ctx.fillStyle=skin.ink;ctx.lineWidth=1.6;
      if(String(value)==='20'){ctx.beginPath();ctx.moveTo(33,20);ctx.lineTo(30,9);ctx.lineTo(41,15);ctx.lineTo(48,5);ctx.lineTo(55,15);ctx.lineTo(66,9);ctx.lineTo(63,20);ctx.closePath();ctx.stroke();for(const x of [36,48,60]){ctx.beginPath();ctx.moveTo(x,77);ctx.lineTo(x+2,82);ctx.lineTo(x,87);ctx.lineTo(x-2,82);ctx.closePath();ctx.fill();}}
      else{ctx.beginPath();ctx.ellipse(48,76,11,9,0,0,7);ctx.fill();ctx.fillRect(42,82,12,6);ctx.fillStyle=skin.base;for(const x of [43,53]){ctx.beginPath();ctx.arc(x,75,2.6,0,7);ctx.fill();}ctx.fillRect(47,81,2,4);}
    }ctx.restore();
  }
  function preview(canvas,id){const skin=D20Appearance.style(id),ctx=canvas.getContext('2d');canvas.width=180;canvas.height=150;ctx.clearRect(0,0,180,150);ctx.save();ctx.translate(20,5);ctx.beginPath();for(let j=0;j<6;j++){const a=j*Math.PI/3-Math.PI/2,x=70+67*Math.cos(a),y=70+67*Math.sin(a);j?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.clip();surface(ctx,skin,140);ctx.save();ctx.translate(22,22);face(ctx,skin,'20',true);ctx.restore();ctx.restore();ctx.strokeStyle=skin.edge;ctx.lineWidth=4;ctx.beginPath();for(let j=0;j<6;j++){const a=j*Math.PI/3-Math.PI/2,x=90+67*Math.cos(a),y=75+67*Math.sin(a);j?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.stroke();}
  window.DiceAppearance={surface,face,preview};
})();
