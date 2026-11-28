// The cache contains only immutable, verified model/runtime files. Versioned URLs also
// let GitHub Pages and the browser's HTTP cache reuse the compressed downloads.
import {assets} from './vendor/hand-assets.js';
const base=new URL('./vendor/',import.meta.url);
const cacheName='stardust-hand-assets-v1';
const supportsGzip=typeof DecompressionStream==='function';
export function loadPlan(rawUrl){
  const spec=assets[new URL(rawUrl).pathname.split('/').pop()];
  return {...spec,rawUrl,packedUrl:new URL(spec.packed,base).href,expected:supportsGzip?spec.transfer:spec.bytes};
}
async function download(url,signal,progress){
  const response=await fetch(url,{signal});
  if(!response.ok)throw Error('Cannot fetch hand asset: '+response.status);
  if(!response.body?.getReader)return response.blob();
  const parts=[],reader=response.body.getReader();
  let received=0;
  try{
    while(true){
      const chunk=await reader.read();if(chunk.done)break;
      parts.push(chunk.value);received+=chunk.value.byteLength;progress(received);
    }
  }finally{reader.releaseLock();}
  return new Blob(parts);
}
async function validate(blob,plan){
  if(blob.size!==plan.bytes)throw Error('Incomplete hand asset');
  const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());
  const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  if(hash!==plan.sha256)throw Error('Damaged hand asset');
  return blob;
}
export async function readAsset(plan,signal,progress){
  const cache=await globalThis.caches?.open(cacheName).catch(()=>null);
  const cached=await cache?.match(plan.packedUrl).catch(()=>null);
  if(cached){
    const blob=await cached.blob();
    if(blob.size===plan.bytes){progress(plan.expected);return blob;}
  }
  let result;
  if(supportsGzip){
    try{
      const packed=await download(plan.packedUrl,signal,progress);
      const stream=packed.stream().pipeThrough(new DecompressionStream('gzip'));
      result=await validate(await new Response(stream).blob(),plan);
    }catch(error){if(signal?.aborted)throw error;}
  }
  if(!result)result=await validate(await download(plan.rawUrl,signal,n=>progress(n*plan.expected/plan.bytes)),plan);
  progress(plan.expected);
  if(cache)cache.put(plan.packedUrl,new Response(result)).catch(()=>{});
  return result;
}
