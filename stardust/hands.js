// MediaPipe Tasks Vision 0.10.14 and the Google float16/v1 model are served with the assignment.
// Only application assets are fetched. Camera frames are passed directly to the local runtime.
export async function createTracker(){
  const root=new URL('./vendor/',import.meta.url);
  const {HandLandmarker,FilesetResolver}=await import('./vendor/vision_bundle.mjs');
  const [files,response]=await Promise.all([
    FilesetResolver.forVisionTasks(new URL('wasm',root).href),
    fetch(new URL('hand_landmarker.task',root))
  ]);
  if(!response.ok)throw Error('Cannot load the hand model');
  const bytes=new Uint8Array(await response.arrayBuffer());
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  if(hash!=='fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1')throw Error('Invalid hand model');
  return HandLandmarker.createFromOptions(files,{
    baseOptions:{modelAssetBuffer:bytes,delegate:'CPU'}, runningMode:'VIDEO',numHands:2,
    minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.55
  });
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
