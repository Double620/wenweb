// Heavy assets start only on camera intent, using the SIMD variant selected by MediaPipe.
export async function createTracker(report=()=>{},signal){
  const root=new URL('./vendor/',import.meta.url);
  const [{HandLandmarker,FilesetResolver},{loadPlan,readAsset}]=await Promise.all([
    import('./vendor/vision_bundle.mjs'),import('./asset-loader.js')
  ]);
  const files=await FilesetResolver.forVisionTasks(new URL('wasm',root).href);
  const plans=[loadPlan(new URL('hand_landmarker.task',root).href),loadPlan(files.wasmBinaryPath)];
  const loaded=[0,0],total=plans[0].expected+plans[1].expected;
  let last=-1;
  const progress=(i,n)=>{
    loaded[i]=Math.min(plans[i].expected,n);
    const percent=Math.floor(100*(loaded[0]+loaded[1])/total);
    if(percent!==last){last=percent;report({phase:'download',percent});}
  };
  const [model,wasm]=await Promise.all(plans.map((p,i)=>readAsset(p,signal,n=>progress(i,n))));
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  report({phase:'initialize'});
  const url=URL.createObjectURL(wasm.slice(0,wasm.size,'application/wasm'));
  try{
    return await HandLandmarker.createFromOptions({...files,wasmBinaryPath:url},{
      baseOptions:{modelAssetBuffer:new Uint8Array(await model.arrayBuffer()),delegate:'CPU'},
      runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.55
    });
  }finally{URL.revokeObjectURL(url);}
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
