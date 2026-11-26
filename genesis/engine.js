(() => {
'use strict';
const N=2000,MAX=200,DAY=8,TAU=2*Math.PI;
const spec={
 rabbit:{name:'苜蓿兔',category:'草食生物',code:'HR',color:'#e8ddba',describe:'在草丛中寻找浆果和嫩芽。敏锐的感知和轻快的脚步，帮助它躲开赤尾狐。',speed:23,prey:[],plant:true},
 fox:{name:'赤尾狐',category:'肉食生物',code:'CR',color:'#efa16b',describe:'沿河岸追踪苜蓿兔和蓝羽雀。捕猎收益必须抵得上追逐消耗的能量。',speed:30,prey:['rabbit','bird'],plant:false},
 bird:{name:'蓝羽雀',category:'杂食生物',code:'OM',color:'#a7b7f3',describe:'啄食果实，也捕捉年幼的苜蓿兔。可切换的食谱让它适应变化的林地。',speed:24,prey:['rabbit'],plant:true}
};
const types=Object.keys(spec),defaults={foodRate:100,mutation:8,threshold:72};
const river=[[0,.79],[.15,.74],[.30,.83],[.43,.76],[.54,.81],[.66,.78],[.81,.87],[.90,.85],[1,.73]];
const trees=[[.06,.03,.11,.18],[.22,.04,.11,.12],[.38,.01,.085,.065],[.59,.08,.10,.13],[.93,.055,.10,.09],[.035,.32,.06,.15],[.466,.244,.042,.055],[.633,.36,.095,.12],[.622,.598,.084,.1],[.054,.606,.095,.09],[.08,.915,.14,.16],[.22,.97,.068,.09],[.487,.86,.10,.095],[.965,.897,.08,.14],[.965,.48,.035,.12]];
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
function ground(x,y){x/=N;y/=N;if(x<.018||y<.025||x>.982||y>.975)return false;
 if(trees.some(([cx,cy,rx,ry])=>((x-cx)/rx)**2+((y-cy)/ry)**2<1))return false;
 let i=1;while(i<river.length-1&&river[i][0]<y)i++;
 const [y0,x0]=river[i-1],[y1,x1]=river[i],mid=x0+(x1-x0)*(y-y0)/(y1-y0);
 return Math.abs(x-mid)>.044||(x>.739&&x<.847&&y>.465&&y<.507);}
function rand(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
function position(s,near){for(let i=0;i<100;i++){const x=near?near.x+(rand(s)-.5)*120:rand(s)*N,y=near?near.y+(rand(s)-.5)*120:rand(s)*N;if(ground(x,y))return {x,y};}return near?{x:near.x,y:near.y}:{x:.3*N,y:.42*N};}
function day(s){return 1+Math.floor(s.time/DAY);}
function season(s){return Math.floor((day(s)-1)/6)%4;}
function record(s,text){s.events.unshift({day:day(s),text});s.events.length=Math.min(s.events.length,180);}
function add(s,type,parent=null){
 if(s.animals.length>=MAX||!spec[type])return null;
 const id=++s.nextId,mut=s.settings.mutation/100;
 const inherit=(v,spread,lo,hi)=>rand(s)<mut?clamp(v+(rand(s)-.5)*spread,lo,hi):v;
 const genes=parent?parent.genes.map(v=>inherit(v,.38,0,1)):Array.from({length:4},()=>.18+.68*rand(s));
 const brain=parent?parent.brain.map(v=>inherit(v,.55,-1.5,1.5)):Array.from({length:276},()=>rand(s)*1.5-.75);
 const a={id,type,...position(s,parent),genes,brain,gen:parent?parent.gen+1:1,parent:parent?.id||0,age:parent?0:5+rand(s)*16,energy:parent?43:53+rand(s)*33,cooldown:5+rand(s)*15,dir:rand(s)*TAU,aim:0,desire:1,think:rand(s)*.7,phase:rand(s)*TAU,cells:Array(16).fill(0),inputs:Array(12).fill(0),out:Array(4).fill(0),mode:'漫游'};
 s.animals.push(a);s.records[id]={id,type,gen:a.gen,parent:a.parent,born:day(s),children:[],died:0};
 if(parent){s.records[parent.id].children.push(id);s.births++;if(a.gen>s.peakGen){s.peakGen=a.gen;record(s,'第一只第 '+a.gen+' 代生物诞生了。');}}return a;
}
function food(s,n,near=null){for(let i=0;i<n&&s.foods.length<220;i++)s.foods.push({...position(s,near),kind:rand(s)<.55?'berries':'leaf'});}
function counts(s){const c={rabbit:0,fox:0,bird:0};s.animals.forEach(a=>c[a.type]++);return c;}
function sample(s){s.history.push({time:s.time,...counts(s),food:s.foods.length});if(s.history.length>60)s.history.shift();}
function make(name='青苔溪谷',population=36,seed=Date.now()>>>0){const s={version:1,name,seed,time:0,animals:[],foods:[],records:{},nextId:0,events:[],history:[],peakGen:1,births:0,deaths:0,settings:{...defaults},foodBudget:0,famineUntil:0,sampled:0,extinct:{}};
 for(let i=0;i<population;i++)add(s,types[i<Math.round(population*.66)?0:i<Math.round(population*.77)?1:2]);food(s,68);record(s,'溪谷建立，首批 '+population+' 只生物进入世界。');sample(s);return s;}
function near(a,list,test,limit){let best=null,min=limit*limit;for(const item of list){if(!test(item))continue;const d=(item.x-a.x)**2+(item.y-a.y)**2;if(d<min){min=d;best=item;}}return best?{item:best,dist:Math.sqrt(min)}:null;}
function feedBrain(a,ins){const b=a.brain;a.inputs=ins;
 for(let j=0;j<16;j++){let sum=b[192+j];for(let i=0;i<12;i++)sum+=ins[i]*b[j*12+i];a.cells[j]=Math.tanh(sum);}
 for(let j=0;j<4;j++){let sum=b[272+j];for(let i=0;i<16;i++)sum+=a.cells[i]*b[208+j*16+i];a.out[j]=Math.tanh(sum);}}
function think(s,a){const vis=195+350*a.genes[1],diet=spec[a.type];
 const plant=diet.plant?near(a,s.foods,()=>true,vis):null;
 const prey=diet.prey.length?near(a,s.animals,b=>b.energy>0&&diet.prey.includes(b.type)&&(a.type!=='bird'||b.age<7),vis*1.22):null;
 const threat=a.type!=='fox'?near(a,s.animals,b=>b.energy>0&&(b.type==='fox'||(a.type==='rabbit'&&a.age<7&&b.type==='bird')),vis*.65):null;
 const vec=(t,k)=>t?clamp((t.item[k]-a[k])/vis,-1,1):0;
 feedBrain(a,[a.energy/100,a.age/100,Math.cos(a.dir),Math.sin(a.dir),vec(plant,'x'),vec(plant,'y'),vec(prey,'x'),vec(prey,'y'),vec(threat,'x'),vec(threat,'y'),season(s)/3,rand(s)*2-1]);
 let target=null,away=false,effort=.72;
 if(threat&&a.energy>10&&threat.dist<vis*(.51+a.out[2]*.09)){target=threat;away=true;a.mode='避险';effort=1.78;}
 else if(prey&&(!plant||prey.dist<plant.dist*(1.25+a.out[3]*.45))&&a.energy<97){target=prey;a.mode='捕猎';effort=1.45;if(prey.dist<38+a.genes[3]*12){const bite=15+5*a.genes[3];a.energy=Math.min(100,a.energy+Math.min(bite,prey.item.energy)*.83);prey.item.energy-=bite;}}
 else if(plant&&a.energy<97){target=plant;a.mode='觅食';effort=1;if(plant.dist<40){const i=s.foods.indexOf(plant.item);if(i>=0){s.foods.splice(i,1);a.energy=Math.min(100,a.energy+19);}}}
 else a.mode='漫游';
 a.aim=target?Math.atan2(target.item.y-a.y,target.item.x-a.x)+(away?Math.PI:0)+a.out[0]*.14:a.dir+(rand(s)-.5)*1.1+a.out[0]*.45;
 a.desire=effort*(1+.13*a.out[1]);a.think=.55+rand(s)*.35;}
function step(s,dt){const last=season(s);s.time+=dt;
 if(s.famineUntil&&s.time>=s.famineUntil){s.famineUntil=0;record(s,'饥荒结束，植物恢复自然再生。');}
 if(!s.famineUntil)s.foodBudget+=dt*2.15*s.settings.foodRate/100*[1.17,1.30,.88,.58][season(s)]*Math.max(.12,1-s.foods.length/180);
 while(s.foodBudget>=1){food(s,1);s.foodBudget--;}
 const n=s.animals.length;for(let i=0;i<n;i++){const a=s.animals[i];if(a.energy<=0)continue;a.age+=dt;a.cooldown-=dt;a.think-=dt;if(a.think<=0)think(s,a);
  a.dir+=Math.atan2(Math.sin(a.aim-a.dir),Math.cos(a.aim-a.dir))*Math.min(1,dt*5);
  const pace=spec[a.type].speed*(.79+.55*a.genes[0])*a.desire;
  const x=a.x+Math.cos(a.dir)*pace*dt,y=a.y+Math.sin(a.dir)*pace*dt;
  if(ground(x,y)){a.x=x;a.y=y;}else{a.dir+=Math.PI*(.62+rand(s)*.45);a.aim=a.dir;a.think=.8;}
  a.energy-=dt*(.46+.23*a.genes[0]+.14*a.genes[1]+.11*a.genes[3]+.13*a.desire-.19*a.genes[2]);if(a.age>113+60*a.genes[2])a.energy=0;
  if(a.age>8&&a.cooldown<=0&&a.energy>=s.settings.threshold&&s.animals.length<MAX){add(s,a.type,a);a.energy-=32;a.cooldown=a.type==='fox'?60+rand(s)*30:15+rand(s)*11;}
 }
 s.animals=s.animals.filter(a=>{if(a.energy>0)return true;s.records[a.id].died=day(s);s.deaths++;return false;});
 const c=counts(s);for(const t of types){if(!c[t]&&!s.extinct[t]){record(s,spec[t].name+'在溪谷中消失了。');s.extinct[t]=true;}else if(c[t])s.extinct[t]=false;}
 if(last!==season(s))record(s,'溪谷进入'+['春季','夏季','秋季','冬季'][season(s)]+'。');
 if(s.time-s.sampled>=2.5){sample(s);s.sampled=s.time;}
}
function famine(s){s.foods.length=Math.round(s.foods.length*.15);s.famineUntil=s.time+3*DAY;s.foodBudget=0;record(s,'人为饥荒开始，三天内食物停止再生。');}
function diversity(s){if(s.animals.length<2)return 0;let sum=0;for(let i=0;i<4;i++){const m=s.animals.reduce((v,a)=>v+a.genes[i],0)/s.animals.length;sum+=Math.sqrt(s.animals.reduce((v,a)=>v+(a.genes[i]-m)**2,0)/s.animals.length);}return Math.min(100,Math.round(sum*50));}
window.Evo={make,step,food,add,record,counts,day,season,ground,famine,diversity,types,spec,defaults,MAX,N,DAY};
})();
