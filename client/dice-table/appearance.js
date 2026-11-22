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
    }else if(skin.pattern==='honey'){
      ctx.globalAlpha=.65;ctx.strokeStyle='#ffe09b';for(let row=-1;row<9;row++)for(let col=-1;col<9;col++){const x=col*36+(row%2)*18,y=row*31;ctx.beginPath();for(let j=0;j<6;j++){const a=j*Math.PI/3;const px=x+21*Math.cos(a),py=y+21*Math.sin(a);j?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.stroke();}
      for(const [x,y] of [[62,59],[176,181]]){ctx.globalAlpha=.85;ctx.fillStyle='#fff1c2';for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(x+side*8,y-8,9,5,side*.6,0,7);ctx.fill();}ctx.fillStyle='#352417';ctx.beginPath();ctx.ellipse(x,y,9,13,0,0,7);ctx.fill();ctx.strokeStyle='#ffd767';ctx.lineWidth=3;line(x-7,y-4,x+7,y-4);line(x-7,y+3,x+7,y+3);}
    }else if(skin.pattern==='mushrooms'){
      ctx.globalAlpha=.9;for(let i=0;i<13;i++){const x=rand()*256,y=rand()*256,r=9+rand()*9;ctx.fillStyle='#dce2b7';ctx.fillRect(x-2,y,4,r*1.25);ctx.fillStyle=i%3?'#be504e':'#e1b873';ctx.beginPath();ctx.ellipse(x,y,r,r*.7,0,Math.PI,Math.PI*2);ctx.closePath();ctx.fill();ctx.fillStyle='#fff5df';for(let j=0;j<4;j++){ctx.beginPath();ctx.arc(x+(rand()-.5)*r,y-r*.35,1.7,0,7);ctx.fill();}}ctx.fillStyle='#b4df9e';for(let i=0;i<60;i++){ctx.globalAlpha=.3+rand()*.6;ctx.beginPath();ctx.arc(rand()*256,rand()*256,rand()*1.5+.5,0,7);ctx.fill();}
    }else if(skin.pattern==='porcelain'){
      ctx.globalAlpha=.85;ctx.strokeStyle='#205894';ctx.fillStyle='#3773ab';for(let y=30;y<300;y+=75)for(let x=30;x<300;x+=75){for(let j=0;j<8;j++){const a=j*Math.PI/4;ctx.beginPath();ctx.ellipse(x+13*Math.cos(a),y+13*Math.sin(a),10,4,a,0,7);ctx.stroke();}ring(x,y,5);ctx.beginPath();ctx.moveTo(x,y+20);ctx.bezierCurveTo(x-32,y+12,x-28,y+48,x+8,y+42);ctx.stroke();}ctx.lineWidth=3;for(const v of [8,248]){line(v,0,v,256);line(0,v,256,v);}
    }else if(skin.pattern==='waves'){
      ctx.globalAlpha=.8;for(let y=-15;y<290;y+=24){ctx.strokeStyle=y%48?'#99e2d4':'#208899';ctx.beginPath();for(let x=-10;x<280;x+=3){const py=y+Math.sin(x/32+y*.055)*12;x===-10?ctx.moveTo(x,py):ctx.lineTo(x,py);}ctx.stroke();}ctx.strokeStyle='#eff4d7';for(let i=0;i<8;i++){const x=rand()*256,y=rand()*256;ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*1.5);ctx.stroke();ctx.beginPath();ctx.arc(x+4,y,6,Math.PI,Math.PI*2.5);ctx.stroke();}
    }else if(skin.pattern==='glass'){
      ctx.globalAlpha=.85;ctx.lineWidth=3;ctx.strokeStyle=skin.edge;for(let y=-40;y<280;y+=55)for(let x=-30;x<280;x+=55){const cx=x+25+(y%2)*14,cy=y+25;for(let j=0;j<4;j++){ctx.fillStyle=['#772f5e','#213c85','#268076','#9c5335'][(j+Math.floor(x/55)+8)%4];const a=j*Math.PI/2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+38*Math.cos(a),cy+38*Math.sin(a));ctx.lineTo(cx+38*Math.cos(a+Math.PI/2),cy+38*Math.sin(a+Math.PI/2));ctx.closePath();ctx.fill();ctx.stroke();}}
    }else if(skin.pattern==='sakura'){
      ctx.globalAlpha=.8;ctx.strokeStyle='#794560';ctx.lineWidth=3;for(let i=0;i<4;i++){const y=25+i*65;ctx.beginPath();ctx.moveTo(-15,y+30);ctx.bezierCurveTo(55,y-20,140,y+50,280,y-25);ctx.stroke();}for(let i=0;i<20;i++){const x=rand()*256,y=rand()*256;ctx.fillStyle=i%2?'#ffeaf0':'#f4b7d0';for(let j=0;j<5;j++){const a=j*Math.PI/2.5;ctx.beginPath();ctx.ellipse(x+5*Math.cos(a),y+5*Math.sin(a),6,3,a,0,7);ctx.fill();}ctx.fillStyle='#bb775b';ctx.beginPath();ctx.arc(x,y,2,0,7);ctx.fill();}
    }else if(skin.pattern==='dunes'){
      ctx.globalAlpha=.9;for(let y=-35;y<300;y+=28){ctx.fillStyle=['#e4b76f','#a86538','#c88b4b','#f0d299'][((y+35)/28)%4];ctx.beginPath();ctx.moveTo(-5,y+40);for(let x=-5;x<265;x+=4)ctx.lineTo(x,y+Math.sin(x/48+y/27)*15);ctx.lineTo(265,y+45);ctx.closePath();ctx.fill();}ctx.fillStyle='#fff2c4';ctx.globalAlpha=.3;for(let i=0;i<350;i++)ctx.fillRect(rand()*256,rand()*256,1,1);
    }else if(skin.pattern==='malachite'){
      ctx.globalAlpha=.8;for(const [x,y] of [[55,85],[223,240]])for(let r=6;r<270;r+=9){ctx.strokeStyle=(r%18<9)?'#0d3a2a':'#95c99a';ctx.lineWidth=4;ctx.beginPath();for(let j=0;j<=100;j++){const a=j*Math.PI/50,d=r+Math.sin(a*6+r)*4;const px=x+Math.cos(a)*d,py=y+Math.sin(a)*d*.75;j?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();}
    }else if(skin.pattern==='citrus'){
      ctx.globalAlpha=.9;for(let i=0;i<10;i++){const x=rand()*256,y=rand()*256,r=18+rand()*10;ctx.fillStyle=i%2?'#ffdb62':'#eb8b35';ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();ctx.strokeStyle='#ffefad';ctx.lineWidth=3;ring(x,y,r-4);ctx.lineWidth=1.4;for(let j=0;j<8;j++){const a=j*Math.PI/4;line(x,y,x+Math.cos(a)*(r-6),y+Math.sin(a)*(r-6));}ctx.fillStyle='#fff3c8';ctx.beginPath();ctx.arc(x,y,2.5,0,7);ctx.fill();}
    }else if(skin.pattern==='tarot'){
      ctx.globalAlpha=.75;ctx.strokeStyle=skin.ink;ctx.lineWidth=1.3;for(let row=0;row<4;row++)for(let col=0;col<4;col++){const x=col*69+5,y=row*69+3;ctx.strokeRect(x,y,47,61);ctx.strokeRect(x+3,y+3,41,55);if((row+col)%2){ctx.beginPath();ctx.arc(x+24,y+28,13,.7,5.6);ctx.arc(x+30,y+25,11,5.2,1.4,true);ctx.closePath();ctx.stroke();}else{ring(x+24,y+28,9);for(let j=0;j<12;j++){const a=j*Math.PI/6;line(x+24+11*Math.cos(a),y+28+11*Math.sin(a),x+24+16*Math.cos(a),y+28+16*Math.sin(a));}}}
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
    if(['honey','mushrooms','waves','glass','dunes','malachite','citrus','tarot'].includes(skin.pattern)){ctx.globalAlpha=.82;ctx.fillStyle=skin.base;ctx.beginPath();ctx.arc(48,48,32,0,7);ctx.fill();}
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
