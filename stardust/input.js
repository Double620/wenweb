import {describeHand} from './hands.js';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);

export function createInput(engine, ink, onGesture){
  const canvas=engine.canvas, ctx=ink.getContext('2d');
  const f={hand:[0,0,0,0],wind:[0,0],trail:[0,0],zoom:1};
  let goal={...f,hand:[0,0,0,0],wind:[0,0],trail:[0,0]}, zoom=1;
  let lastPoint=null, lastStorm=-Infinity, lastInk=0, strokes=[], contacts=new Map(),pinch=null;
  let mode='',lastHand=0, previousPalm=null, handSpan=null,first=null,holdTimer=0,hold=false;
  const notify=name=>{if(mode!==name){mode=name;onGesture(name);}};
  function clean(){
    goal.hand[2]=goal.hand[3]=0;goal.trail=[0,0];lastPoint=null;first=null;hold=false;clearTimeout(holdTimer);
    notify('');
  }
  function move(x,y,kind,strength=1,allowWind=true){
    const t=performance.now(), [px,py]=engine.point(x,y);
    const fresh=lastPoint&&t-lastPoint.t<200, dt=fresh?Math.max(.016,(t-lastPoint.t)/1000):1;
    const vx=fresh?(px-lastPoint.px)/dt:0,vy=fresh?(py-lastPoint.py)/dt:0;
    goal.hand=[px,py,kind==='spread'?strength:0,kind==='pull'?strength:0];
    goal.trail=kind==='trail'?[clamp(vx,-3,3),clamp(vy,-3,3)]:[0,0];
    if(kind==='trail'&&t-lastInk>14){
      strokes.push({x,y,t,join:!!fresh&&lastPoint.kind===kind&&t-lastInk<120}); lastInk=t;
    }
    if(allowWind&&fresh&&Math.hypot(vx,vy)>3.8&&t-lastStorm>620&&Math.hypot(px-lastPoint.px,py-lastPoint.py)>.095){
      goal.wind=[clamp(vx,-7,7),clamp(vy,-7,7)];lastStorm=t;
    }
    lastPoint={t,px,py,kind};
    notify(t-lastStorm<550?'星尘风暴':({spread:'张掌扩散',pull:'引力聚合',trail:'指尖星轨',idle:''}[kind]));
  }
  function touchZoom(){
    const [a,b]=contacts.values();const span=distance(a,b);
    if(!pinch)pinch={span:Math.max(12,span),zoom};
    zoom=clamp(pinch.zoom*span/pinch.span,.52,1.85);clean();notify('双指缩放');
  }
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.button!==2)return;
    canvas.setPointerCapture(e.pointerId);contacts.set(e.pointerId,{x:e.clientX,y:e.clientY});lastHand=0;
    if(contacts.size===2){touchZoom();return;}
    first={x:e.clientX,y:e.clientY};hold=e.button===2||e.shiftKey;
    move(first.x,first.y,hold?'pull':'spread',1,false);
    clearTimeout(holdTimer);
    if(!hold) holdTimer=setTimeout(()=>{if(first&&contacts.size===1){hold=true;move(first.x,first.y,'pull',1,false);}},390);
  });
  canvas.addEventListener('pointermove',e=>{
    if(contacts.has(e.pointerId))contacts.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(contacts.size>=2){touchZoom();return;}
    if(performance.now()-lastHand<350&&!contacts.size)return;
    const dragging=contacts.size>0;
    if(first&&distance(first,{x:e.clientX,y:e.clientY})>9){clearTimeout(holdTimer);if(!hold)first=null;}
    move(e.clientX,e.clientY,hold||e.shiftKey?'pull':dragging&&first?'spread':'trail');
  });
  function release(e){
    contacts.delete(e.pointerId);pinch=null;clean();
    if(contacts.size===1){const p=[...contacts.values()][0];move(p.x,p.y,'trail',1,false);}
  }
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,release);
  canvas.addEventListener('pointerleave',()=>{if(!contacts.size&&!lastHand)clean();});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=clamp(zoom*Math.exp(-clamp(e.deltaY,-100,100)*.0025),.52,1.85);},{passive:false});
  function clearHands(){
    if(lastHand)clean();
    lastHand=0;previousPalm=null;handSpan=null;
  }
  function hands(landmarks,aspect){
    if(!landmarks.length){if(performance.now()-lastHand>170)clearHands();return;}
    if(contacts.size)return;
    const time=performance.now();
    if(!lastHand||time-lastHand>300){lastPoint=null;previousPalm=null;handSpan=null;}
    let hand=landmarks.map(p=>describeHand(p,aspect));
    if(previousPalm)hand.sort((a,b)=>distance(previousPalm,a.palm)-distance(previousPalm,b.palm));
    const main=hand[0];previousPalm=main.palm;
    const p=main.pointing?main.tip:main.palm;
    const kind=main.pointing?'trail':main.spread>.09?'spread':main.pull>.09?'pull':'idle';
    if(lastPoint&&lastPoint.kind!==kind)lastPoint=null;
    move((1-p.x)*innerWidth,p.y*innerHeight,kind,Math.max(main.spread,main.pull),true);
    if(hand.length===2){
      const other=hand[1].palm,span=Math.hypot((main.palm.x-other.x)*aspect,main.palm.y-other.y);
      if(!handSpan)handSpan={distance:Math.max(.08,span),zoom};
      zoom=clamp(handSpan.zoom*span/handSpan.distance,.52,1.85);notify('双手缩放');
    }else handSpan=null;
    lastHand=time;
  }
  let inkWidth=0, inkHeight=0;
  function tick(dt){
    const rate=1-Math.exp(-dt*15), now=performance.now();
    if(lastHand&&now-lastHand>420)clearHands();
    if(!contacts.size&&!lastHand&&lastPoint&&now-lastPoint.t>700)clean();
    if(now-lastStorm>550&&mode==='星尘风暴')notify('');
    for(let j=0;j<4;j++)f.hand[j]+=(goal.hand[j]-f.hand[j])*rate;
    for(let j=0;j<2;j++){
      f.wind[j]+=(goal.wind[j]-f.wind[j])*rate;goal.wind[j]*=Math.exp(-dt*3);
      f.trail[j]+=(goal.trail[j]-f.trail[j])*rate;goal.trail[j]*=Math.exp(-dt*5);
    }
    f.zoom+=(zoom-f.zoom)*rate;
    if(inkWidth!==innerWidth||inkHeight!==innerHeight){
      const dpr=Math.min(devicePixelRatio||1,1.5);inkWidth=innerWidth;inkHeight=innerHeight;
      ink.width=Math.round(inkWidth*dpr);ink.height=Math.round(inkHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    ctx.clearRect(0,0,inkWidth,inkHeight);
    while(strokes.length&&now-strokes[0].t>1250)strokes.shift();
    ctx.lineCap='round';ctx.globalCompositeOperation='lighter';
    for(let i=1;i<strokes.length;i++){
      const p=strokes[i-1],q=strokes[i];if(!q.join)continue;
      const life=clamp(1-(now-q.t)/1250,0,1);
      ctx.strokeStyle='rgba(172,140,255,'+(.46*life)+')';ctx.lineWidth=.65+life*1.25;
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();
      if(i%3===0){ctx.fillStyle='rgba(222,210,255,'+life*.8+')';ctx.fillRect(q.x+6*Math.sin(q.t),q.y+5*Math.cos(q.t),1.4,1.4);}
    }
    return f;
  }
  return {hands,clearHands,tick,reset(){zoom=1;strokes=[];clean();}};
}
