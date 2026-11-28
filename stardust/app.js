import {SCENES} from './geometry.js';
import {createEngine} from './engine.js';
import {createInput} from './input.js';
import {createTracker} from './hands.js';

const el=id=>document.getElementById(id);
const engine=createEngine(el('field'));
const input=createInput(engine,el('ink'),name=>el('gesture').textContent=name);
let selected=1;
const buttons=SCENES.map((scene,index)=>{
  const button=document.createElement('button');
  button.className='scene';button.type='button';button.dataset.scene=scene.slug;
  button.setAttribute('aria-pressed',String(index===selected));
  const image=new Image();image.src='./art/'+scene.slug+'.webp';image.alt='';
  const label=document.createElement('span');label.textContent=scene.name;
  button.append(image,label);button.onclick=()=>select(index);el('scenes').append(button);
  return button;
});
function select(index){
  engine.change(index);selected=index;
  buttons.forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
  el('scene-name').textContent=SCENES[index].name;el('scene-en').textContent=SCENES[index].en;
  el('position').firstChild.nodeValue=String(index+1).padStart(2,'0')+' ';
  document.documentElement.style.setProperty('--lilac',SCENES[index].tint);
}
let timer=0;
function message(text,timeout=5200){
  clearTimeout(timer);el('notice').hidden=false;el('notice').textContent=text;
  if(timeout)timer=setTimeout(()=>{el('notice').hidden=true;},timeout);
}
const panel=el('panel');
for(const [id,title] of [['settings','显示设置'],['guide','操作指南']]){
  el(id).onclick=()=>{
    el('panel-title').textContent=title;el('settings-body').hidden=id!=='settings';
    el('help-body').hidden=id!=='guide';panel.showModal();
  };
}
el('dismiss').onclick=()=>panel.close();
panel.onclick=e=>{if(e.target===panel){const r=panel.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)panel.close();}};
el('full').hidden=!document.fullscreenEnabled;
el('full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{message('浏览器暂时无法进入全屏。');}};
document.addEventListener('fullscreenchange',()=>{const text=document.fullscreenElement?'退出全屏':'进入全屏';el('full').title=text;el('full').setAttribute('aria-label',text);});
el('reset').onclick=()=>{input.reset();select(1);panel.close();};

const quality=el('quality'), tiers=[6000,9000,12000,18000];
function preferred(){
  if(!engine.gpu)return 6000;
  const narrow=Math.min(screen.width,screen.height);
  return matchMedia('(pointer:coarse)').matches?(narrow<600?9000:narrow<1050?12000:18000):18000;
}
let count=preferred(), bad=0,good=0;
function showCount(){el('count').textContent=count.toLocaleString('en-US');}
function applyQuality(){count=quality.value==='auto'?preferred():Number(quality.value);bad=good=0;showCount();}
quality.onchange=applyQuality;applyQuality();

function trackRate(fps){
  if(quality.value!=='auto')return;
  bad=fps<30?bad+1:0;good=fps>52?good+1:0;
  const current=tiers.indexOf(count);
  if(bad>=3&&current>0){count=tiers[current-1];bad=good=0;showCount();}
  if(good>=14&&count<preferred()){count=tiers[current+1];bad=good=0;showCount();}
}

const button=el('camera'),video=el('video');
let session=null;
function cameraUI(){
  const active=session?.ready, pending=!!session&&!active;
  button.querySelector('span').textContent=active?'关闭摄像头':pending?'取消开启':'开启摄像头';
  button.setAttribute('aria-pressed',String(!!active));
  el('mode').textContent=active?'手势识别':matchMedia('(pointer:coarse)').matches?'触屏模式':'指针模式';
  el('mode').parentElement.classList.toggle('active',!!active);
  el('hint').textContent=active?'张掌推开星尘，慢慢握拳让它们聚拢。':'划过星尘留下星轨，长按让星尘聚拢。';
  el('preview').hidden=!(active&&el('showPreview').checked);
}
el('showPreview').onchange=cameraUI;
el('hidePreview').onclick=()=>{el('showPreview').checked=false;cameraUI();};
function stopCamera(){
  const old=session;session=null;
  if(old){
    clearTimeout(old.loadTimeout);old.worker?.terminate();old.rejectWorker?.(Error('Stopped'));
    old.tracker?.close();old.stream?.getTracks().forEach(t=>t.stop());
  }
  video.pause();video.srcObject=null;input.clearHands();cameraUI();
}
function dispatchHands(s,landmarks){
  if(s!==session)return;
  s.busy=false;
  input.hands(landmarks,video.videoWidth/Math.max(1,video.videoHeight));
}
async function loadRecognition(s){
  if(window.Worker&&window.createImageBitmap&&window.OffscreenCanvas){
    try{
      await new Promise((resolve,reject)=>{
        s.rejectWorker=reject;
        const w=s.worker=new Worker('./tracker-worker.js');
        w.onerror=()=>reject(Error('Worker unavailable'));
        w.onmessage=({data})=>{
          if(data.type==='ready')resolve();
          if(data.type==='error')reject(Error(data.message));
        };
        w.postMessage({type:'load'});
      });
      if(session!==s)return;
      s.rejectWorker=null;
      s.worker.onmessage=({data})=>{
        if(data.type==='hands')dispatchHands(s,data.landmarks);
        else if(data.type==='error')runtimeFailure(s);
      };
      s.worker.onerror=()=>runtimeFailure(s);
      return;
    }catch(error){
      s.worker?.terminate();s.worker=null;s.rejectWorker=null;
      if(session!==s)throw error;
    }
  }
  const tracker=await createTracker();
  if(session!==s){tracker.close();return;}
  s.tracker=tracker;
}
async function runtimeFailure(s){
  if(s!==session)return;
  if(!s.worker){stopCamera();message('手势识别已中断，可重新开启摄像头。');return;}
  s.worker.terminate();s.worker=null;s.busy=true;
  try{
    const tracker=await createTracker();
    if(s!==session){tracker.close();return;}
    s.tracker=tracker;s.busy=false;
  }catch{if(s===session){stopCamera();message('手势识别暂时不可用，仍可用鼠标或触屏操控。');}}
}
async function capture(s,time){
  if(!s.ready||s.busy||video.readyState<2||video.currentTime===s.videoTime||time-s.lastTime<(s.worker?55:85))return;
  s.busy=true;s.lastTime=time;s.videoTime=video.currentTime;
  try{
    if(s.worker){
      const frame=await createImageBitmap(video);
      if(s!==session||!s.worker){frame.close();return;}
      s.worker.postMessage({frame,time},[frame]);
    }else dispatchHands(s,s.tracker.detectForVideo(video,time).landmarks);
  }catch{if(s===session)runtimeFailure(s);}
}
button.onclick=async()=>{
  if(session){stopCamera();el('notice').hidden=true;return;}
  if(!navigator.mediaDevices?.getUserMedia){message('此浏览器无法调用摄像头，仍可用鼠标或触屏操控。');return;}
  const s=session={ready:false,busy:false,lastTime:0,videoTime:-1};cameraUI();
  message('请允许使用前置摄像头。',0);
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480},frameRate:{ideal:24,max:30}}});
    if(session!==s){stream.getTracks().forEach(t=>t.stop());return;}
    s.stream=stream;video.srcObject=stream;
    stream.getVideoTracks()[0].addEventListener('ended',()=>{if(s===session){stopCamera();message('摄像头已断开。');}},{once:true});
    await video.play();if(s!==session)return;
    message('正在加载手部识别模型…',0);
    s.loadTimeout=setTimeout(()=>{if(session===s&&!s.ready){stopCamera();message('模型加载超时，可重试或继续用鼠标、触屏体验。');}},80000);
    await loadRecognition(s);if(s!==session)return;
    clearTimeout(s.loadTimeout);s.ready=true;cameraUI();message('摄像头已开启，将手掌放进画面。');
  }catch(e){
    if(session!==s)return;
    stopCamera();
    const tip={NotAllowedError:'未获得摄像头权限，可在浏览器中允许后重试。',NotFoundError:'未找到摄像头，仍可用鼠标或触屏操控。',NotReadableError:'摄像头正被占用，请关闭占用它的应用后重试。'};
    message(tip[e.name]||'手部识别加载失败，请检查网络后重试。鼠标和触屏仍可使用。');
  }
};
cameraUI();
let lastTime=0,windowStart=0,frames=0;
function animate(time){
  const dt=Math.min(.05,Math.max(0,(time-(lastTime||time))/1000));lastTime=time;
  engine.draw(dt,input.tick(dt),count,el('glow').checked);
  if(session?.ready)capture(session,time);
  if(!windowStart)windowStart=time;
  if(++frames&&time-windowStart>=1100){
    const fps=Math.round(frames*1000/(time-windowStart));el('fps').textContent=String(fps);
    trackRate(fps);frames=0;windowStart=time;
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
document.addEventListener('visibilitychange',()=>{lastTime=windowStart=frames=0;if(document.hidden&&session){stopCamera();el('notice').hidden=true;}});
addEventListener('pagehide',stopCamera);
engine.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();stopCamera();message('图形设备已暂停，正在等待浏览器恢复。',0);});
engine.canvas.addEventListener('webglcontextrestored',()=>location.reload());
document.addEventListener('keydown',e=>{
  if(panel.open||e.altKey||e.ctrlKey||e.metaKey||e.repeat)return;
  if(/^[1-5]$/.test(e.key))select(Number(e.key)-1);
  else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();select((selected+(e.key==='ArrowRight'?1:4))%5);}
});
