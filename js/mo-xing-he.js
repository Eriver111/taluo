/**
 * 星空塔罗 — Canvas 四层动态背景
 * 底层：紫色柔光云雾缓慢流动
 * 二层：细密星辰光点闪烁
 * 三层：极淡星轨纹理偶尔飘过
 * 四层：塔罗术语全屏渐入渐出流动
 * 用法：MoXingHe.start('mxhCanvas');
 */
var MoXingHe = (function(){
  var canvas, ctx, w, h, raf, running=false;
  var clouds=[], stars=[], inkStrokes=[], floatingTexts=[];
  var pointer={x:0.5,y:0.5,tx:0.5,ty:0.5};

  // 塔罗术语池
  var TERMS=[
    '愚者','魔术师','女祭司','女皇','皇帝','教皇','恋人','战车',
    '力量','隐者','命运之轮','正义','倒吊人','死神','节制','恶魔',
    '高塔','星星','月亮','太阳','审判','世界',
    '权杖','圣杯','宝剑','星币',
    '权杖王牌','圣杯王牌','宝剑王牌','星币王牌',
    '权杖骑士','圣杯骑士','宝剑骑士','星币骑士',
    '权杖王后','圣杯王后','宝剑王后','星币王后',
    '权杖国王','圣杯国王','宝剑国王','星币国王',
    '大阿尔卡纳','小阿尔卡纳','正位','逆位',
    '凯尔特十字','时间之流','单张指引',
    '火元素','水元素','风元素','土元素',
    '塔罗','占卜','洞见','直觉','命运',
    '新月','满月','星辰','月光','银河','宇宙'
  ];

  function randTerm(){return TERMS[Math.floor(Math.random()*TERMS.length)];}

  // === 流动文字粒子 ===
  function FloatingText(){
    this.reset();
    this.alpha=0;
    this.phase=Math.random()*15;
  }
  FloatingText.prototype.reset=function(){
    this.text=randTerm();
    this.x=(Math.random()-0.2)*1.4;
    this.y=(Math.random()-0.1)*1.2;
    this.vx=(Math.random()-0.5)*0.00012;
    this.vy=(Math.random()-0.5)*0.00008;
    this.fontSize=12+Math.floor(Math.random()*12);
    this.life=12+Math.random()*18;
    this.age=0;
    this.fading='in';
  };
  FloatingText.prototype.update=function(dt){
    this.x+=this.vx; this.y+=this.vy;
    if(this.x<-0.3)this.x=1.3; if(this.x>1.3)this.x=-0.3;
    if(this.y<-0.2)this.y=1.2; if(this.y>1.2)this.y=-0.2;
    this.age+=dt;
    if(this.age>this.life){this.reset();this.age=0;}
    var p=this.age/this.life;
    if(p<0.15)this.alpha=p/0.15*0.07;
    else if(p>0.75)this.alpha=(1-p)/0.25*0.07;
    else this.alpha=0.07;
  };
  FloatingText.prototype.draw=function(){
    ctx.save();
    ctx.globalAlpha=this.alpha;
    ctx.font='normal '+this.fontSize+'px "Source Han Serif SC","STKaiti","KaiTi","FangSong",serif';
    ctx.fillStyle='#c4a4ff';ctx.shadowColor='rgba(155,109,255,.08)';ctx.shadowBlur=2;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(this.text,this.x*w,this.y*h);
    ctx.restore();
  };

  // === 紫色云雾 ===
  function Cloud(){
    this.x=Math.random()*1.5-0.25; this.y=Math.random()*1.2-0.1;
    this.r=0.18+Math.random()*0.35;
    this.vx=(Math.random()-0.5)*0.00015; this.vy=(Math.random()-0.5)*0.00010;
    this.color=Math.random()<0.4?'violet':'ink';
    this.colorAlpha=this.color==='violet'?0.035:0.025;
  }
  Cloud.prototype.update=function(){
    this.x+=this.vx; this.y+=this.vy;
    if(this.x<-0.5)this.x=1.5; if(this.x>1.5)this.x=-0.5;
    if(this.y<-0.3)this.y=1.3; if(this.y>1.3)this.y=-0.3;
  };
  Cloud.prototype.draw=function(){
    var cx=this.x*w,cy=this.y*h,r=this.r*Math.min(w,h);
    var g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
    if(this.color==='violet'){g.addColorStop(0,'rgba(155,109,255,'+this.colorAlpha+')');g.addColorStop(1,'rgba(155,109,255,0)');}
    else{g.addColorStop(0,'rgba(100,90,130,'+this.colorAlpha+')');g.addColorStop(1,'rgba(100,90,130,0)');}
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
  };

  // === 星辰 ===
  function Star(){
    this.reset(); this.phase=Math.random()*Math.PI*2; this.speed=0.003+Math.random()*0.012;
  }
  Star.prototype.reset=function(){this.x=Math.random();this.y=Math.random();};
  Star.prototype.update=function(){this.phase+=this.speed;};
  Star.prototype.draw=function(){
    var alpha=0.12+0.22*Math.abs(Math.sin(this.phase)),sz=1+Math.sin(this.phase*2.3)*0.6;
    ctx.fillStyle='rgba(200,180,240,'+alpha+')';ctx.beginPath();ctx.arc(this.x*w,this.y*h,sz,0,Math.PI*2);ctx.fill();
  };

  // === 星轨 ===
  function InkStroke(){this.reset();}
  InkStroke.prototype.reset=function(){
    this.x=-0.15;this.y=Math.random()*0.7+0.15;this.len=0.08+Math.random()*0.18;
    this.alpha=0.006+Math.random()*0.014;this.speed=0.00025+Math.random()*0.0004;this.rot=Math.random()*0.3-0.15;
  };
  InkStroke.prototype.update=function(){this.x+=this.speed;if(this.x>1.2)this.reset();};
  InkStroke.prototype.draw=function(){
    ctx.save();ctx.translate(this.x*w,this.y*h);ctx.rotate(this.rot);
    ctx.lineWidth=1.5+Math.random()*2.5;ctx.strokeStyle='rgba(140,120,180,'+this.alpha+')';
    ctx.beginPath();ctx.moveTo(0,0);
    ctx.quadraticCurveTo(this.len*w*0.5,(Math.random()-0.5)*30,this.len*w,(Math.random()-0.5)*20);
    ctx.stroke();ctx.restore();
  };

  // === 主循环 ===
  var lastT=0;
  function resize(){if(!canvas)return;w=canvas.offsetWidth;h=canvas.offsetHeight;canvas.width=w;canvas.height=h;}
  function loop(t){
    if(!running)return;
    var dt=lastT?(t-lastT)/1000:0.03; lastT=t;
    pointer.x+=(pointer.tx-pointer.x)*0.02; pointer.y+=(pointer.ty-pointer.y)*0.02;

    ctx.clearRect(0,0,w,h);

    // 底层深紫色渐变
    var g0=ctx.createRadialGradient(w*0.5,h*0.35,0,w*0.5,h*0.35,Math.max(w,h));
    g0.addColorStop(0,'rgba(10,8,18,0.0)');g0.addColorStop(0.45,'rgba(10,8,18,0.55)');g0.addColorStop(1,'rgba(5,4,10,0.97)');
    ctx.fillStyle=g0;ctx.fillRect(0,0,w,h);

    for(var i=0;i<clouds.length;i++){clouds[i].update();clouds[i].draw();}
    for(var i=0;i<stars.length;i++){stars[i].update();stars[i].draw();}
    for(var i=0;i<inkStrokes.length;i++){inkStrokes[i].update();inkStrokes[i].draw();}

    // 流动文字层
    for(var i=0;i<floatingTexts.length;i++){floatingTexts[i].update(dt);floatingTexts[i].draw();}

    // 视差紫纹
    ctx.save();var px=(pointer.x-0.5)*16,py=(pointer.y-0.5)*12;ctx.translate(px,py);
    var gr=ctx.createLinearGradient(0,h*0.15,w*0.6,h*0.25);
    gr.addColorStop(0,'rgba(155,109,255,0)');gr.addColorStop(0.5,'rgba(155,109,255,'+(0.004+Math.sin(t*0.0003)*0.003)+')');gr.addColorStop(1,'rgba(155,109,255,0)');
    ctx.fillStyle=gr;ctx.fillRect(w*0.2,h*0.15,w*0.6,h*0.08);ctx.restore();

    raf=requestAnimationFrame(loop);
  }

  function init(canvasId, showTexts){
    showTexts = showTexts !== false;
    canvas=document.getElementById(canvasId);if(!canvas)return;
    ctx=canvas.getContext('2d');resize();window.addEventListener('resize',resize);
    clouds=[];stars=[];inkStrokes=[];floatingTexts=[];
    for(var i=0;i<8;i++)clouds.push(new Cloud());
    for(var i=0;i<120;i++)stars.push(new Star());
    for(var i=0;i<4;i++)inkStrokes.push(new InkStroke());
    if(showTexts) for(var i=0;i<18;i++)floatingTexts.push(new FloatingText());
    document.addEventListener('mousemove',function(e){pointer.tx=e.clientX/w;pointer.ty=e.clientY/h;});
    document.addEventListener('touchmove',function(e){pointer.tx=e.touches[0].clientX/w;pointer.ty=e.touches[0].clientY/h;},{passive:true});
    running=true;requestAnimationFrame(loop);
  }
  function stop(){running=false;if(raf)cancelAnimationFrame(raf);}
  return {start:init,stop:stop};
})();
