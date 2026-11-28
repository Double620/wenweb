import {createCloud, MAX_COUNT} from './geometry.js';

const vertex = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec3 previous;
layout(location=1) in vec3 velocity;
layout(location=2) in vec3 origin;
layout(location=3) in vec3 destination;
layout(location=4) in vec4 trait;
uniform float dt,clock,morph,zoom,dpr,glow,quality;
uniform vec2 extent,center,wind;
uniform vec4 hand;
uniform vec2 trail;
uniform float scene[5];
uniform int pass;
out vec3 updated;
out vec3 speed;
out vec3 color;
out float luminosity;
out float spark;
void main(){
  vec3 base=mix(origin,destination,morph);
  float radius=length(base.xy);
  float turn=.036*sin(clock*.15)+.018*sin(clock*.23+radius*3.);
  mat2 rotation=mat2(cos(turn),sin(turn),-sin(turn),cos(turn));
  base.xy=rotation*base.xy;
  vec3 flow=vec3(sin(base.y*5.+clock*.38+trait.x*4.),cos(base.x*4.5+clock*.29+trait.y*2.),sin(clock*.37+trait.x*5.));
  base=base*zoom+flow*(.009+.021*scene[0]+.016*scene[2]);
  vec2 delta=previous.xy-hand.xy;
  float dist=length(delta);
  vec2 away=delta/max(dist,.018);
  float near=exp(-dist*dist*3.8);
  vec3 force=(base-previous)*8.3;
  force.xy+=away*hand.z*near*10.;
  force.xy+=(-delta*18.+vec2(-away.y,away.x)*2.5)*near*hand.w;
  force.z+=sin(trait.y*6.28)*near*hand.z*2.4;
  force.xy+=wind*(1.4+.6*sin(previous.y*5.+clock));
  force.xy+=trail*near*(1.1+trait.y);
  speed=(velocity+force*dt)*exp(-3.1*dt);
  updated=previous+speed*dt;
  vec3 p=pass==1?previous:updated;
  float lens=1./(1.-clamp(p.z,-1.8,1.8)*.105);
  gl_Position=vec4(p.xy*lens*extent+center,0.,1.);
  vec3 cool=mix(vec3(.22,.31,.98),vec3(.73,.41,.98),trait.x*.85);
  cool=mix(cool,vec3(.57,.82,1.),smoothstep(.76,.99,trait.y));
  float core=exp(-radius*4.3);
  vec3 galaxy=mix(cool,vec3(1.,.76,.57),core);
  vec3 ice=mix(vec3(.16,.45,.95),vec3(.72,.75,1.),trait.x);
  vec3 neb=mix(vec3(.13,.55,.94),vec3(.95,.29,.76),smoothstep(-.5,.46,base.x+.22*sin(base.y*5.)));
  vec3 halo=mix(vec3(.87,.49,.23),vec3(.91,.87,.65),trait.x);
  vec3 fire=mix(vec3(.88,.14,.08),vec3(1.,.78,.43),exp(-radius*1.7)+trait.x*.28);
  color=scene[0]*ice+scene[1]*galaxy+scene[2]*neb+scene[3]*halo+scene[4]*fire;
  color=mix(color,vec3(.95,.93,1.),.40*pow(trait.z,5.));
  color=mix(color,vec3(1.,.79,.58),hand.w*near*.50);
  float depth=clamp(.75+p.z*.32,.45,1.25);
  spark=step(.975,trait.w);
  luminosity=(.40+.54*trait.y+.4*pow(trait.z,4.))*depth*(.87+.13*sin(clock*(.7+trait.y)+trait.x*94.));
  luminosity+=min(1.,length(speed))*.35;
  luminosity*=1.-scene[4]*(1.-smoothstep(.116,.141,length(p.xy-vec2(0.,.047)*zoom)/zoom));
  if(pass==1){
    gl_PointSize=clamp((23.+trait.y*49.)*dpr*depth,1.,126.);
    luminosity*=glow*quality*.058;
    if(trait.w>.14) gl_Position.xy=vec2(3.);
  }else{
    gl_PointSize=clamp((1.2+1.95*pow(trait.z,2.)+spark*5.8)*dpr*lens,1.,28.);
  }
}`;
const fragment=`#version 300 es
precision mediump float;
precision highp int;
in vec3 color;
in float luminosity;
in float spark;
uniform int pass;
out vec4 outputColor;
void main(){
  vec2 uv=gl_PointCoord*2.-1.;
  float rr=dot(uv,uv);
  if(rr>1.) discard;
  float a;
  if(pass==1){a=exp(-4.5*rr)*(1.-rr);}
  else{
    a=.88*exp(-4.7*rr)+.13*exp(-1.8*rr)*(1.-rr);
    if(spark>.5) a=.94*exp(-15.*rr)+.25*(exp(-abs(uv.x)*20.)+exp(-abs(uv.y)*20.))*exp(-rr*3.);
  }
  float power=a*luminosity;
  outputColor=vec4(color*power,min(1.,power));
}`;
function makeProgram(gl){
  const prog=gl.createProgram();
  for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
    const shader=gl.createShader(type); gl.shaderSource(shader,source); gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(prog,shader);
  }
  gl.transformFeedbackVaryings(prog,['updated','speed'],gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(prog));
  return prog;
}
function makeGPU(canvas,cloud,gl) {
  const prog=makeProgram(gl);gl.useProgram(prog);
  const uniforms={};
  for(const key of ['dt','clock','morph','zoom','dpr','extent','center','wind','hand','trail','scene','pass','glow','quality'])
    uniforms[key]=gl.getUniformLocation(prog,key==='scene'?'scene[0]':key);
  const stream=(data,mode)=>{
    const b=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,b); gl.bufferData(gl.ARRAY_BUFFER,data,mode);return b;
  };
  const seed=new Float32Array(MAX_COUNT*6);
  for(let i=0;i<MAX_COUNT;i++) for(let k=0;k<3;k++)seed[i*6+k]=cloud.targets[1][i*3+k];
  const states=[stream(seed,gl.DYNAMIC_COPY),stream(seed,gl.DYNAMIC_COPY)];
  const traits=stream(cloud.traits,gl.STATIC_DRAW);
  const shapes=[stream(cloud.targets[1],gl.DYNAMIC_DRAW),stream(cloud.targets[1],gl.DYNAMIC_DRAW)];
  function attr(n,b,size,stride=0,offset=0){
    gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(n);gl.vertexAttribPointer(n,size,gl.FLOAT,false,stride,offset);
  }
  const vaos=states.map(b=>{
    const a=gl.createVertexArray();gl.bindVertexArray(a);
    attr(0,b,3,24);attr(1,b,3,24,12);attr(2,shapes[0],3);attr(3,shapes[1],3);attr(4,traits,4);
    return a;
  });
  gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER,null);
  gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.ONE,gl.ONE,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  let front=0;
  return {
    change(start,end){
      [start,end].forEach((v,i)=>{gl.bindBuffer(gl.ARRAY_BUFFER,shapes[i]);gl.bufferSubData(gl.ARRAY_BUFFER,0,v);});
      gl.bindBuffer(gl.ARRAY_BUFFER,null);
    },
    frame(f){
      gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
      for(const k of ['dt','clock','morph','zoom','dpr','glow','quality']) gl.uniform1f(uniforms[k],f[k]);
      for(const k of ['extent','center','wind','trail']) gl.uniform2fv(uniforms[k],f[k]);
      gl.uniform4fv(uniforms.hand,f.hand);gl.uniform1fv(uniforms.scene,f.scene);
      gl.bindVertexArray(vaos[front]); gl.uniform1i(uniforms.pass,0);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,states[1-front]);
      gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,f.count);gl.endTransformFeedback();
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);
      front=1-front;
      if(f.glow>.01){
        gl.bindVertexArray(vaos[front]);gl.uniform1i(uniforms.pass,1);gl.drawArrays(gl.POINTS,0,f.count);
      }
      gl.bindVertexArray(null);
    }
  };
}
function makeCanvas(canvas,cloud) {
  canvas.style.mixBlendMode='screen';
  const ctx=canvas.getContext('2d',{alpha:false});
  const mist=document.createElement('canvas'),mistCtx=mist.getContext('2d',{alpha:false});
  let a=cloud.targets[1], b=a, pixels,fogPixels,fog,temp;
  const p=new Float32Array(a), v=new Float32Array(a.length),TAU=2*Math.PI;
  const colors=cloud.targets.map((points,scene)=>{
    const rgb=new Uint8Array(cloud.count*3);
    for(let i=0;i<cloud.count;i++){
      const j=3*i, t=4*i, x=points[j],y=points[j+1];
      const core=Math.exp(-Math.hypot(x,y)*4.3), seed=cloud.traits[t],shine=cloud.traits[t+1]**4;
      const palette=[
        [79+62*seed,115+60*shine,233],
        [100+78*seed+125*core,85+48*shine+118*core,221-65*core+32*shine],
        [95+144*(.5+.5*Math.sin(x*3)),86+78*shine,222+30*seed],
        [243,146+80*shine,89+94*seed],
        [255,81+132*core+24*shine,38+80*core]
      ][scene];
      for(let k=0;k<3;k++)rgb[j+k]=Math.min(255,palette[k]);
    }
    return rgb;
  });
  let from=new Float32Array(colors[1]),to=colors[1],blend=1;
  // Two tiny separable filters integrate radiant dust without blurring the foreground stars.
  function blur(source,out,w,h,horizontal){
    const axis=horizontal?1:w;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const j=(x+y*w)*3,coord=horizontal?x:y,edge=horizontal?w:h;
      for(let k=0;k<3;k++){
        let sum=source[j+k]*.28;
        for(let n=1;n<=3;n++){
          const left=Math.min(n,coord),right=Math.min(n,edge-1-coord),weight=n===1?.21:n===2?.11:.04;
          sum+=(source[j-left*axis*3+k]+source[j+right*axis*3+k])*weight;
        }
        out[j+k]=sum;
      }
    }
  }
  return {
    change(start,end){
      a=start;b=end;
      for(let i=0;i<from.length;i++)from[i]+=(to[i]-from[i])*blend;
      to=colors[cloud.targets.indexOf(end)];
    },
    frame(f){
      const w=canvas.width,h=canvas.height;
      if(!pixels||pixels.width!==w||pixels.height!==h){
        pixels=ctx.createImageData(w,h);
        const raw=new Uint32Array(pixels.data.buffer);raw.fill(0xff000000);
        mist.width=Math.ceil(w/10);mist.height=Math.ceil(h/10);
        fogPixels=mistCtx.createImageData(mist.width,mist.height);
        new Uint32Array(fogPixels.data.buffer).fill(0xff000000);
        fog=new Float32Array(mist.width*mist.height*3);temp=new Float32Array(fog.length);
      }
      new Uint32Array(pixels.data.buffer).fill(0xff000000);
      fog.fill(0);blend=f.morph;
      const halfW=w*.5,halfH=h*.5,damp=Math.exp(-3.1*f.dt),fw=mist.width,fh=mist.height;
      const data=pixels.data, density=Math.sqrt(18000/f.count);
      for(let i=0;i<f.count;i++){
        const j=3*i, t=4*i,dx=p[j]-f.hand[0],dy=p[j+1]-f.hand[1],r=Math.hypot(dx,dy),near=Math.exp(-r*r*3.8);
        for(let k=0;k<3;k++){
          const d=k===0?dx:dy, side=k===0?-dy:dx;
          const goal=(a[j+k]+(b[j+k]-a[j+k])*blend)*f.zoom+.014*Math.sin(f.clock*.37+cloud.traits[t]*TAU+k);
          const local=k===2?0:near*(d/(r+.018)*10*f.hand[2]+(-d*18+side/(r+.018)*2.5)*f.hand[3]+f.trail[k])+f.wind[k];
          v[j+k]=v[j+k]*damp+((goal-p[j+k])*8.3+local)*f.dt*damp;p[j+k]+=v[j+k]*f.dt;
        }
        const lens=1/(1-Math.max(-1.8,Math.min(1.8,p[j+2]))*.105);
        const x=halfW*(1+f.center[0]+p[j]*lens*f.extent[0]),y=halfH*(1-f.center[1]-p[j+1]*lens*f.extent[1]);
        const ix=Math.floor(x),iy=Math.floor(y);
        if(ix<2||iy<2||ix>=w-2||iy>=h-2)continue;
        if(f.scene[4]>.8&&Math.hypot(p[j],p[j+1]-.047*f.zoom)<.12*f.zoom)continue;
        const fracX=x-ix,fracY=y-iy,at=(ix+iy*w)*4,fa=(Math.floor(ix/10)+Math.floor(iy/10)*fw)*3;
        const shine=cloud.traits[t+2],bright=(.50+shine**4*1.7)*density,flare=cloud.traits[t+3]>.97;
        for(let k=0;k<3;k++){
          const c=from[j+k]+(to[j+k]-from[j+k])*blend,light=c*bright;
          data[at+k]+=light*(1-fracX)*(1-fracY);data[at+4+k]+=light*fracX*(1-fracY);
          data[at+w*4+k]+=light*(1-fracX)*fracY;data[at+w*4+4+k]+=light*fracX*fracY;
          if(flare){data[at+k]+=c*.55;data[at-4+k]+=c*.23;data[at+4+k]+=c*.23;data[at-w*4+k]+=c*.22;data[at+w*4+k]+=c*.22;}
          fog[fa+k]+=c*bright*.075*density;
        }
      }
      ctx.globalCompositeOperation='source-over';ctx.putImageData(pixels,0,0);
      if(f.glow){
        blur(fog,temp,fw,fh,true);blur(temp,fog,fw,fh,false);
        const glowData=fogPixels.data;
        for(let i=0;i<fw*fh;i++)for(let k=0;k<3;k++)glowData[4*i+k]=205*(1-Math.exp(-fog[3*i+k]/250));
        mistCtx.putImageData(fogPixels,0,0);ctx.globalCompositeOperation='lighter';
        ctx.imageSmoothingEnabled=true;ctx.drawImage(mist,0,0,w,h);
      }
    }
  };
}
export function createEngine(canvas){
  const cloud=createCloud();
  let renderer, gpu=true;
  try {
    const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,powerPreference:'high-performance'});
    if(!gl)throw Error('WebGL2 unavailable');
    renderer=makeGPU(canvas,cloud,gl);
  }catch(e){
    console.info('Using the 2D renderer',e.message);
    const fallback=canvas.cloneNode();canvas.replaceWith(fallback);canvas=fallback;
    renderer=makeCanvas(canvas,cloud);gpu=false;
  }
  let start=new Float32Array(cloud.targets[1]), end=cloud.targets[1],previous=new Float32Array([0,1,0,0,0]);
  let progress=1, selected=1,clock=0;
  const weights=new Float32Array(previous), clamp=n=>Math.min(1,Math.max(0,n));
  const view={center:[0,0],extent:[1,1],dpr:1};
  function resize(){
    const w=canvas.clientWidth,h=canvas.clientHeight,small=w<660;
    view.dpr=Math.min(devicePixelRatio||1, gpu?1.65:1.15);
    const scale=small?Math.min(w*.38,h*.31):Math.min(w*.342,h*.49);
    view.center=[small?.01:.053,small?.03:.034];view.extent=[2*scale/w,2*scale/h];
    canvas.width=Math.max(1,Math.round(w*view.dpr));canvas.height=Math.max(1,Math.round(h*view.dpr));
  }
  resize();new ResizeObserver(resize).observe(canvas);
  const smooth=()=>progress*progress*(3-2*progress);
  return {canvas,gpu,
    point(x,y){return [(2*x/canvas.clientWidth-1-view.center[0])/view.extent[0],(1-2*y/canvas.clientHeight-view.center[1])/view.extent[1]];},
    change(id){
      if(selected===id)return;
      const ratio=smooth();
      for(let j=0;j<start.length;j++)start[j]+=(end[j]-start[j])*ratio;
      previous.set(weights); selected=id;end=cloud.targets[id];progress=0;
      renderer.change(start,end);
    },
    draw(dt,input,count,glow,elapsed=dt){
      clock+=elapsed;progress=clamp(progress+elapsed/1.85);
      const ratio=smooth();
      for(let i=0;i<5;i++)weights[i]=previous[i]*(1-ratio)+(i===selected?ratio:0);
      renderer.frame({...view,...input,clock,dt,morph:ratio,count,glow:glow?1:0,quality:Math.min(2,18000/count),scene:weights});
    }
  };
}
