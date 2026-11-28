const puppeteer=require('puppeteer-core');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const log='/tmp/stardust-bench.log';
(async()=>{
 const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
 try{
   for(const dir of ['baseline','stardust']){
     const context=await browser.createBrowserContext(),p=await context.newPage();
     await p.setViewport({width:640,height:400});
     await p.evaluateOnNewDocument(()=>{
       Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{
         await new Promise(r=>setTimeout(r,350));
         const im=new Image();im.src='./test-hand.jpg';await im.decode();
         const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;
         const ctx=c.getContext('2d'),draw=()=>ctx.drawImage(im,0,0);draw();
         const stream=c.captureStream(12);
         clearInterval(window.fixtureTimer);window.fixtureTimer=setInterval(draw,85);window.tracks=stream.getTracks();return stream;
       }});
     });
     await p.goto('http://127.0.0.1:8101/'+dir+'/');
     await p.waitForSelector('.scene');
     for(const variant of ['cold','reopen','reload']){
       if(variant==='reload'){await p.reload();await p.waitForSelector('.scene');}
       const before=fs.readFileSync(log,'utf8').length;
       await p.evaluate(()=>{window.t0=performance.now();document.querySelector('#camera').click();});
       try{await p.waitForFunction(()=>document.querySelector('#camera').getAttribute('aria-pressed')==='true'&&document.querySelector('#gesture').textContent==='指尖星轨',{timeout:75000,polling:30});}
       catch(e){console.log('NOTICE',await p.$eval('#notice',el=>el.textContent));throw e;}
       const ms=await p.evaluate(()=>Math.round(performance.now()-window.t0));
       const downloads=fs.readFileSync(log,'utf8').slice(before).split('\n').filter(s=>s.startsWith('BINARY '));
       const bytes=downloads.reduce((n,s)=>n+Number(s.split(' ').at(-1)),0);
       console.log('BENCHMARK',dir,variant,ms,'ms',bytes,'wire bytes',downloads.length,'requests');
       if(dir==='stardust'){
         if(variant==='cold'){assert.equal(downloads.length,2);assert(downloads.every(s=>s.includes('.bin ')));}
         else assert.equal(bytes,0);
       }
       await p.evaluate(()=>document.querySelector('#camera').click());
       assert(await p.evaluate(()=>window.tracks.every(t=>t.readyState==='ended')));
     }
     if(dir==='stardust'){
       // A cancel during the permission wait must release any late-arriving track.
       await p.evaluate(()=>{const b=document.querySelector('#camera');b.click();b.click();});
       await new Promise(r=>setTimeout(r,1000));
       assert(await p.evaluate(()=>window.tracks.every(t=>t.readyState==='ended')&&!document.querySelector('#video').srcObject));
     }
     await context.close();
   }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
