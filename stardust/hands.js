// Local inference. Frames never leave the browser. The worker loads only model/runtime files.
const local=new URL('./vendor/',import.meta.url).href.replace(/\/$/,'');
const libraries=[
  local,
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14',
  'https://unpkg.com/@mediapipe/tasks-vision@0.10.14'
];
const models=[
  local+'/hand_landmarker.task',
  'https://cdn.jsdelivr.net/gh/kiya0908/gesture-synth-weld@c8e0c70e8d1db8fcce75d97d61fd725553f5e36f/public/v1.0.1/hand_landmarker.task',
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
];
async function modelBytes(){
  for(const url of models){
    const control=new AbortController(), timeout=setTimeout(()=>control.abort(),16000);
    try{
      const response=await fetch(url,{signal:control.signal});
      if(!response.ok)throw Error('Model unavailable');
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.length!==7819105)throw Error('Incomplete model');
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
      if(hash!=='fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1')throw Error('Invalid model');
      return bytes;
    }catch(error){if(url===models.at(-1))throw error;}
    finally{clearTimeout(timeout);}
  }
}
export async function createTracker(){
  const bytes=await modelBytes();
  for(const root of libraries){
    try{
      const {HandLandmarker,FilesetResolver}=await import(root+'/vision_bundle.mjs');
      const files=await FilesetResolver.forVisionTasks(root+'/wasm');
      return await HandLandmarker.createFromOptions(files,{
        baseOptions:{modelAssetBuffer:bytes,delegate:'CPU'}, runningMode:'VIDEO',numHands:2,
        minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.55
      });
    }catch(error){if(root===libraries.at(-1))throw error;}
  }
}
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
const dist=(a,b,aspect)=>Math.hypot((a.x-b.x)*aspect,a.y-b.y);
export function describeHand(points,aspect){
  const palm={x:(points[0].x+points[5].x+points[9].x+points[17].x)/4,
    y:(points[0].y+points[5].y+points[9].y+points[17].y)/4};
  const open=[8,12,16,20].map(tip=>{
    const extension=dist(points[tip],points[0],aspect)/Math.max(.015,dist(points[tip-2],points[0],aspect));
    return clamp((extension-.89)/.57,0,1);
  });
  const openness=open.reduce((a,b)=>a+b,0)/4;
  const pointing=open[0]>.73&&open.slice(1).every(n=>n<.46);
  return {palm,tip:points[8],pointing,spread:pointing?0:clamp((openness-.49)*2.1,0,1),pull:pointing?0:clamp((.49-openness)*2.25,0,1)};
}
