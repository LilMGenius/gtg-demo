import { chromium } from 'playwright';
import { mkdirSync,writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pinClock } from './clock.mjs';

const out=new URL('../.omo/evidence/vq2/',import.meta.url);mkdirSync(out,{recursive:true});
const timer=setTimeout(()=>process.exit(1),90000);timer.unref(); // 각 모드와 세 화면을 짧은 감시 시간 안에서 검증한다.
const browser=await chromium.launch({executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
const rows=[],errors=[];
try{
  for(const pixel of [false,true])for(const [width,height] of [[1280,720],[844,390],[740,360]]){ // 과제의 데스크톱과 두 가로 모바일 화면에서 같은 스위치를 잰다.
    const dpr=width===844?3:1; // 고밀도 가로 폰에서도 기본 버퍼가 기기 해상도를 그대로 쓰는지 확인한다.
    const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr});await pinClock(ctx);
    const page=await ctx.newPage();page.on('pageerror',e=>errors.push(String(e)));
    await page.goto('http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran'+(pixel?'&pix=1':''));
    await page.click('#go',{force:true});
    const stop=await page.evaluate(()=>{const at=window.__frames()+2;window.__plan(0,null,at);return at;}); // 정지한 같은 경기에서 렌더 경로만 비교한다.
    await page.waitForFunction(at=>window.__frames()>at,stop);
    const actual=await page.evaluate(async()=>{
      const T=await import('/web/vendor/three.module.min.js'),s=window.__pixState(),scene=window.__sceneRoot();
      const contacts=scene.children.filter(o=>o.userData.contact),map=contacts[0]?.material.map;
      let alpha=null;
      if(map){
        const cv=map.image,c=cv.getContext('2d'),image=c.getImageData(0,0,cv.width,cv.height);
        const read=()=>({center:c.getImageData(cv.width/2,cv.height/2,1,1).data[3],edge:c.getImageData(0,0,1,1).data[3]}); // 실제 음영 텍스처의 중심과 모서리를 읽는다.
        const live=read();c.fillStyle='white';c.fillRect(0,0,cv.width,cv.height);const flat=read();c.putImageData(image,0,0); // 균일 원판을 심어 부드러운 가장자리 측정의 양성 대조군으로 쓴다.
        alpha={live,flat};
      }
      return {...s,contacts:contacts.length,alpha,pcf:s.shadowType===T.PCFShadowMap};
    });
    const soft=a=>Boolean(a&&a.center>a.edge&&a.edge===0);
    const checks={nativeDpr:pixel||actual.dpr===dpr,switch:actual.on===pixel&&actual.filtered===pixel,resolution:pixel?actual.rt[1]<actual.canvas[1]||height<actual.rt[1]:actual.rt.every((v,i)=>v===actual.canvas[i]),stencil:actual.stencil,lights:actual.lights.filter(x=>x==='HemisphereLight').length===1&&actual.lights.filter(x=>x==='DirectionalLight').length===1,pcf:actual.pcf,contacts:actual.contacts>0,soft:soft(actual.alpha?.live),flatControl:!soft(actual.alpha?.flat)}; // 동일 스위치, 실제 버퍼, 두 조명과 접촉 음영을 각각 판정한다.
    rows.push({pixel,width,height,actual,checks});
    if(pixel&&width===1280)await page.screenshot({path:fileURLToPath(new URL('pixel-opt-in-1280x720.jpg',out)),type:'jpeg',quality:85}); // 선택한 픽셀판도 같은 크기의 JPEG 증거로 남긴다.
    const errorStart=errors.length;
    await page.evaluate(()=>setTimeout(()=>{throw new Error('P22-VQ2 planted exception');},0)); // 모드마다 실제 예외가 수집되는지 확인한다.
    await page.waitForTimeout(100); // 예외 이벤트가 수집기에 도착할 여유다.
    const exceptionControl=errors.splice(errorStart);checks.consoleControl=exceptionControl.some(e=>e.includes('P22-VQ2 planted exception'));
    rows[rows.length-1].exceptionControl=exceptionControl;
    await ctx.close();
  }
  const pass=errors.length===0&&rows.every(r=>Object.values(r.checks).every(Boolean));
  writeFileSync(new URL('resolution.json',out),JSON.stringify({invocation:'node tools/resolution-gate.mjs',time:new Date().toISOString(),browser:browser.version(),rows,errors,pass},null,2));
  console.log('resolution '+(pass?'PASS':'FAIL'),JSON.stringify({rows:rows.map(r=>({pixel:r.pixel,width:r.width,checks:r.checks})),errors}));if(!pass)process.exitCode=1;
}finally{clearTimeout(timer);await browser.close();}
