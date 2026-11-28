// The same three-dimensional formations also drive the scene thumbnails.
export const SCENES = [
  {name: '自由星尘', slug: 'dust', en: 'Drift', tint: '#9bb7fa'},
  {name: '螺旋银河', slug: 'galaxy', en: 'Spiral galaxy', tint: '#d3adfa'},
  {name: '梦幻星云', slug: 'nebula', en: 'Nebula', tint: '#b1a0ff'},
  {name: '星尘光环', slug: 'halo', en: 'Halo', tint: '#f3d091'},
  {name: '黑洞坍缩', slug: 'eclipse', en: 'Collapse', tint: '#ffa97b'}
];
export const MAX_COUNT = 18000;
const tau = 2 * Math.PI;
function generator() {
  let state = 19471207;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return (state + .5) / 4294967296;
  };
}
function tilt(x,y,z,angle,incline) {
  const v = y*Math.cos(incline) - z*Math.sin(incline);
  return [x*Math.cos(angle)-v*Math.sin(angle), x*Math.sin(angle)+v*Math.cos(angle), y*Math.sin(incline)+z*Math.cos(incline)];
}
export function createCloud(count=MAX_COUNT) {
  const rand=generator();
  const normal=()=>Math.sqrt(-2*Math.log(rand()))*Math.cos(tau*rand());
  const targets=SCENES.map(()=>new Float32Array(count*3));
  const traits=new Float32Array(count*4);
  for(let i=0;i<count;i++){
    const u=rand(), v=rand(), w=rand(), a=rand()*tau, n=normal(), m=normal(), j=normal();
    const arm=i%3, band=Math.floor(rand()*9), rare=rand(), size=rand();
    // Field stars stay sparse at the edges. Interleaving keeps every quality tier balanced.
    traits.set([v, w, size, rare],4*i);
    const cloudX=n*0.81, cloudY=m*.47, cloudZ=j*.26;
    targets[0].set(tilt(cloudX,cloudY+.15*Math.sin(cloudX*3+v*2),cloudZ,.15,.55),3*i);
    const r=.025+1.49*Math.pow(u,.80), bulge=v<.16;
    const theta=arm*tau/3+4.1*Math.log(1+r*2.15)+(.08+.12*r)*n + (band-4)*.028;
    const scatter=w<.18 ? .14 : .023;
    const gx=bulge ? .145*n : r*Math.cos(theta)+scatter*n;
    const gy=bulge ? .135*m : r*Math.sin(theta)+scatter*m;
    const gz=bulge ? .07*j : j*(.021+.037*r);
    targets[1].set(tilt(gx,gy,gz,.27,1.00),3*i);
    // Nested, translucent folded sheets, with blue edges and a rose-coloured waist.
    const t=a, l=(u-.5)*1.75, wave=t*2+l*2.8;
    const nr=(.56+.18*Math.cos(wave)+.13*Math.sin(3*t-l))*(.65+.5*u)+.038*n;
    targets[2].set(tilt(1.45*nr*Math.cos(t)+.28*l,nr*Math.sin(t)+.17*Math.sin(3*t),l*.62+.22*Math.sin(wave)+.064*m,-.27,.49),3*i);
    const hr=.66 + .16*u+.044*Math.sin(a*3+band*.5)+.026*n;
    targets[3].set(tilt(1.30*hr*Math.cos(a),1.30*hr*Math.sin(a),.19*Math.sin(a*2+u*3)+.031*m,.32,.85),3*i);
    const er=.29+1.10*Math.pow(u,1.75), ea=a+.68*Math.log(er);
    const ex=er*Math.cos(ea), ey=er*Math.sin(ea);
    // Far-side light rises in a lensed arch above the narrow accretion disc.
    const arch=Math.max(0,Math.sin(ea))*Math.exp(-2.7*(er-.29));
    const eclipse=tilt(ex,ey*.29+.32*arch+.014*m,ey*.68,-.12,0);
    targets[4].set(eclipse,3*i);
  }
  return {targets,traits,count};
}
