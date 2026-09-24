import { chromium } from 'playwright';
import { mkdirSync,writeFileSync } from 'node:fs';
import { pinClock } from './clock.mjs';

const out=new URL('../.omo/evidence/vq2/',import.meta.url);
mkdirSync(out,{recursive:true});
const YAW_BAR=20; // 과제가 지정한 이동 중 방향 오차 상한이다.
const FRAMES=240; // 네 초의 실제 보행을 채취해 각 행인의 여러 보폭을 포함한다.
const watchdog=setTimeout(()=>process.exit(1),90000); // 브라우저 고착을 한 번의 짧은 측정 안에서 종료한다.
watchdog.unref();
const browser=await chromium.launch({executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
try{
  const ctx=await browser.newContext({viewport:{width:1280,height:720}}); // 기준 경기장 해상도에서 실제 장면을 잰다.
  await pinClock(ctx);
  const p=await ctx.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(String(e)));
  await p.goto('http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran&vary=0');
  await p.click('#go',{force:true});
  await p.evaluate(()=>window.__crowd(3)); // 최상위 동네에서 모든 차림을 채취한다.
  const data=await p.evaluate(async count=>{
    const T=await import('/web/vendor/three.module.min.js');
    const walkers=window.__sceneRoot().children.filter(p=>p.userData.walker);
    if(!walkers.length)throw Error('행인 모집단이 비었다');
    const direction=new T.Vector3(),quat=new T.Quaternion();
    const angle=(p,dx,dz)=>{p.updateMatrixWorld(true);p.getWorldQuaternion(quat);direction.set(0,0,1).applyQuaternion(quat);return Math.acos(T.MathUtils.clamp((direction.x*dx+direction.z*dz)/(Math.hypot(dx,dz)*Math.hypot(direction.x,direction.z)),-1,1))*180/Math.PI;}; // 실제 월드 정면과 변위를 비교하고 선언한 heading 값은 읽지 않는다.
    const previous=walkers.map(p=>p.position.clone()),rows=[],last=[];
    for(let n=0;n<count;n++){
      if(n===count/2)walkers.forEach((p,i)=>{if(i%2)p.userData.speed*=-1;}); // 후반에는 절반을 반대로 보내 고정 방향 구현도 검출한다.
      await new Promise(requestAnimationFrame);
      walkers.forEach((p,i)=>{
        const dx=p.position.x-previous[i].x,dz=p.position.z-previous[i].z,travel=Math.hypot(dx,dz);
        if(p.visible&&travel>0.000001&&travel<6){ // 부동소수점 잡음과 화면 밖 순환 재배치를 표본에서 분리한다.
          rows.push({id:p.userData.variantId,error:angle(p,dx,dz),travel,direction:Math.sign(dx)});last[i]={dx,dz};
        }
        previous[i].copy(p.position);
      });
    }
    const candidate=walkers.findIndex((p,i)=>last[i]&&!p.userData.gaze);
    if(candidate<0)throw Error('대조군을 심을 이동 행인이 없다');
    const plant=walkers[candidate],delta=last[candidate],before=plant.rotation.y;
    plant.rotation.y+=Math.PI; // 실제 메시를 뒤로 돌려 같은 속도에서 역방향 오류를 심는다.
    const positive=angle(plant,delta.dx,delta.dz);plant.rotation.y=before;
    const stopped=walkers.find(p=>p!==plant&&!p.userData.gaze),speed=stopped.userData.speed;
    stopped.userData.speed=0; // 실제 이동을 멈춰 시간만 흘렀을 때 자세와 방향이 유지되는지 잰다.
    await new Promise(requestAnimationFrame);
    const snap=()=>({heading:stopped.rotation.y,distance:stopped.userData.walkDistance,feet:stopped.userData.walker.feet.map(f=>f.position.toArray())});
    const stopBefore=snap();
    for(let n=0;n<24;n++)await new Promise(requestAnimationFrame); // 정지 상태를 여러 렌더 프레임 동안 유지한다.
    const stopAfter=snap();
    const foot=stopped.userData.walker.feet[0],was=foot.position.z;foot.position.z+=0.1; // 정지한 발을 강제로 밀어 정지 판독이 실제 관절 변화를 검출하는지 묻는다.
    const stopPlanted=snap();foot.position.z=was;stopped.userData.speed=speed;
    return {directions:[...new Set(rows.map(r=>r.direction))],samples:rows.length,variants:[...new Set(rows.map(r=>r.id))],maxError:Math.max(...rows.map(r=>r.error)),positive,stopBefore,stopAfter,stopPlanted,examples:rows.slice(0,22)}; // 두 프레임의 전체 모집단을 원시 증거로 남긴다.
  },FRAMES);
  const errorStart=errors.length;
  await p.evaluate(()=>setTimeout(()=>{throw new Error('P22-VQ2 planted exception');},0)); // 실제 브라우저 예외를 심어 오류 수집 배선을 검증한다.
  await p.waitForTimeout(100); // 비동기 예외 이벤트가 Node 수집기에 도착할 여유다.
  const exceptionControl=errors.splice(errorStart);
  const checks={stoppedControl:JSON.stringify(data.stopBefore)!==JSON.stringify(data.stopPlanted),consoleControl:exceptionControl.some(e=>e.includes('P22-VQ2 planted exception')),bothDirections:data.directions.includes(-1)&&data.directions.includes(1),movingPopulation:data.samples>=500,allVariants:data.variants.length===7,facing:data.maxError<YAW_BAR,backwardControl:data.positive>YAW_BAR,stopped:JSON.stringify(data.stopBefore)===JSON.stringify(data.stopAfter),console:errors.length===0}; // 표본 하한은 여러 프레임의 전원을 요구하고 차림 수는 과제의 일곱 종류다.
  const pass=Object.values(checks).every(Boolean);
  writeFileSync(new URL('facing.json',out),JSON.stringify({invocation:'node tools/facing-gate.mjs',time:new Date().toISOString(),checks,data,errors,exceptionControl,pass},null,2));
  console.log('facing '+(pass?'PASS':'FAIL'),JSON.stringify({checks,samples:data.samples,maxError:data.maxError,positive:data.positive}));
  if(!pass)process.exitCode=1;
}finally{clearTimeout(watchdog);await browser.close();}
