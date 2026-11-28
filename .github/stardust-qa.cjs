const puppeteer=require('puppeteer-core');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
  try{
    const p=await browser.newPage(),errors=[];
    p.on('pageerror',e=>errors.push(e.message));p.on('console',msg=>console.log('browser',msg.type(),msg.text()));
    await p.setViewport({width:1200,height:800});
    await p.evaluateOnNewDocument(()=>{
      const native=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(...args){
        const result=native.apply(this,args);
        if(this.id==='field'&&args[0]==='webgl2')window.renderGL=result;
        return result;
      };
      Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{
        if(window.denyTest)throw new DOMException('Denied','NotAllowedError');
        const im=new Image();im.src='./test-hand.jpg';await im.decode();
        const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;
        const ctx=c.getContext('2d');const frame=()=>ctx.drawImage(im,0,0);
        frame();const stream=c.captureStream(12);window.fixtureTimer=setInterval(frame,85);window.testStream=stream;return stream;
      }});
    });
    await p.goto('http://127.0.0.1:8100/Double-Study-Journal.html#posts');
    await p.click('#entries .entry a[href="./stardust/"]');await p.waitForSelector('.scene');
    assert.equal(await p.evaluate(()=>!!window.renderGL&&document.querySelector('#field').getContext('webgl2')===window.renderGL),true,'GPU renderer');
    for(const slug of ['dust','nebula','halo','eclipse','galaxy']){
      await p.click('[data-scene="'+slug+'"]');
      assert.equal(await p.$eval('[data-scene="'+slug+'"]',e=>e.getAttribute('aria-pressed')),'true');
    }
    await p.mouse.move(500,330);await p.mouse.move(530,345,{steps:8});
    await p.waitForFunction(()=>document.querySelector('#gesture').textContent.includes('星轨'));
    await p.mouse.down();await p.waitForFunction(()=>document.querySelector('#gesture').textContent.includes('聚合'));await p.mouse.up();
    const glError=await p.evaluate(()=>window.renderGL.getError());assert.equal(glError,0,'WebGL error');
    await p.click('#camera');
    try{await p.waitForFunction(()=>document.querySelector('#gesture').textContent==='指尖星轨',{timeout:65000});}
    catch(e){console.error(await p.$eval('#notice',n=>n.textContent));throw e;}
    await p.click('#camera');assert.equal(await p.evaluate(()=>window.testStream.getTracks().every(t=>t.readyState==='ended')),true);
    await p.setViewport({width:360,height:740,isMobile:true,hasTouch:true});
    await p.click('[data-scene="halo"]');await p.click('#settings');
    assert.equal(await p.$eval('#panel',d=>d.open),true);await p.click('#dismiss');
    const client=await p.createCDPSession();
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:93,y:270,id:1},{x:232,y:290,id:2}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:55,y:260,id:1},{x:270,y:300,id:2}]});
    await p.waitForFunction(()=>document.querySelector('#gesture').textContent==='双指缩放');
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await p.evaluate(()=>window.denyTest=true);await p.click('#camera');
    await p.waitForFunction(()=>document.querySelector('#notice').textContent.includes('未获得摄像头权限'));
    await p.click('[data-scene="dust"]');assert.equal(await p.$eval('#scene-name',n=>n.textContent),'自由星尘');
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);console.log('PASS: GPU / five scenes / pointer / real hand model from a fixture video stream / camera release / mobile layout');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
