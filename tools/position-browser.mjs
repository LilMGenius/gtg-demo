import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// zone/hand/beat의 Playwright·시드·양성 대조군 방식을 위치 표면에 재사용한다.
const BASE = 'http://127.0.0.1:10310/web/index.html?seed=20&preset=veteran,rich';
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const OUT = fileURLToPath(new URL('../.omo/evidence/p15-u2/', import.meta.url));
// 요청된 두 해상도와 터치 하한, 반 초 홀드의 허용 오차다.
const SIZES = [[1280, 720], [740, 360]], TOUCH = 48, HOLD = 0.5, TOL = 0.1;
// 10ms 세계시계는 50ms 기록 간격을 정확히 다섯 프레임으로 나눈다.
const STEP = 0.01;
// 기존 beat의 120초보다 짧은 단일 브라우저 종료 상한이다.
const WATCHDOG = 90000;
const advance = (p, seconds) => p.evaluate(([seconds, step]) => new Promise(done => {
  const stop = window.__frames() + Math.round(seconds / step);
  window.__fixedStep(step);
  window.__plan(0, null, stop + 1);
  window.__freeze(false);
  const poll = () => window.__frames() >= stop + 1 ? done() : requestAnimationFrame(poll);
  requestAnimationFrame(poll);
}), [seconds, STEP]);
const snap = p => p.evaluate(() => ({ ...window.__position(), world: window.__keeperPos(),
  ball: window.__ballPos(), result: window.__positionResult, input: window.__lastInput }));
const arrows = p => p.locator('.move-arrow').evaluateAll(es => es.map(e => {
  const r=e.getBoundingClientRect();
  return {label:e.getAttribute('aria-label'),pressed:e.getAttribute('aria-pressed'),x:r.x,y:r.y,width:r.width,height:r.height,disabled:e.disabled,color:getComputedStyle(e).backgroundColor};
}));
// zone의 기존 평균 밝기 계기를 판 두 장에 재사용한다. 배경 선언이 아니라 찍힌 화소를 읽는다.
const luminance = async (p, rect) => {
  const png = (await p.screenshot({clip:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}})).toString('base64');
  return p.evaluate(src=>new Promise(done=>{
    const im=new Image();im.onload=()=>{
      const c=document.createElement('canvas');c.width=im.width;c.height=im.height;
      const g=c.getContext('2d');g.drawImage(im,0,0);const d=g.getImageData(0,0,c.width,c.height).data;
      let sum=0;for(let i=0;i<d.length;i+=4)sum+=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
      done(sum/(d.length/4));
    };im.src='data:image/png;base64,'+src;
  }),png);
};
export async function positionGate(name) {
  mkdirSync(OUT,{recursive:true});
  const results=[], errors=[];
  const check=(axis,ok,observed)=>{results.push({axis,pass:Boolean(ok),observed});console.log((ok?'PASS ':'FAIL ')+name+':'+axis+' '+JSON.stringify(observed));};
  const timer=setTimeout(()=>{console.error('WATCHDOG');process.exit(1);},WATCHDOG);timer.unref();
  let browser;
  try {
    check('server-http-200',(await fetch(BASE)).status===200,BASE);
    browser=await chromium.launch({executablePath:EXE});
    console.log('BINARY '+JSON.stringify({node:process.execPath,version:process.version,chromium:browser.version(),exe:EXE}));
    for(const [width,height] of SIZES){
      const context=await browser.newContext({viewport:{width,height},hasTouch:true});
      const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));
      await p.goto(BASE);await p.waitForSelector('#go');
      await p.evaluate(()=>window.__freeze(true));await p.click('#go',{force:true});
      const tag=width+'x'+height;
      const shot=kind=>p.screenshot({path:OUT+name+'-'+tag+'-'+kind+'.jpg',type:'jpeg'});
      const button=p.locator('.move-arrow').first();
      if(name==='zone'){
        const a=await arrows(p);
        check(tag+'-two-arrows-48px',a.length===2&&a.every(x=>x.width>=TOUCH&&x.height>=TOUCH&&x.x>=0&&x.y>=0&&x.x+x.width<=width&&x.y+x.height<=height),a);
        check(tag+'-labels',a.map(x=>x.label).join('/')==='왼쪽으로/오른쪽으로',a);
        check(tag+'-retired-surfaces-absent',await p.locator('.zone,#beat,#out').count()===0,await p.locator('.zone,#beat,#out').count());
        await p.evaluate(()=>{const e=document.createElement('button');e.className='zone';document.body.append(e);});
        check(tag+'-old-pad-positive-control',await p.locator('.zone').count()===1,await p.locator('.zone').count());await p.locator('.zone').evaluate(e=>e.remove());
        await advance(p,0.3);await shot('set');
        const bare=await luminance(p,a[0]);
        await button.dispatchEvent('pointerdown',{pointerId:1});
        const down=await arrows(p);
        check(tag+'-pressed-state-visible',down[0].pressed==='true'&&down[1].pressed==='false'&&down[0].color!==down[1].color,down);
        const lit=await luminance(p,a[0]);
        // 기존 zone의 밝기 차이 하한 3과 같은 화소 두 장 허용차 5를 보존한다.
        check(tag+'-pressed-pixels',Math.abs(lit-bare)>3,{bare,lit});
        await advance(p,0.3);await shot('shuffle');await button.dispatchEvent('pointerup',{pointerId:1});
        check(tag+'-release-clears-pressed',(await arrows(p)).every(x=>x.pressed==='false'),await arrows(p));
        const released=await luminance(p,a[0]);
        check(tag+'-released-pixels-match-bare',Math.abs(released-bare)<5,{bare,released});
        await button.evaluate(e=>e.disabled=true);
        check(tag+'-disabled-positive-control',(await arrows(p)).filter(x=>x.disabled).length===1,await arrows(p));await button.evaluate(e=>e.disabled=false);
        check(tag+'-arrows-enabled',(await arrows(p)).every(x=>!x.disabled),await arrows(p));
        await button.focus();await p.keyboard.down('Enter');const enter=await snap(p);await p.keyboard.up('Enter');
        await p.locator('.move-arrow').last().focus();await p.keyboard.down(' ');const space=await snap(p);await p.keyboard.up(' ');
        check(tag+'-focused-key-arrows',enter.held===-1&&space.held===1,{enter:enter.held,space:space.held});
        await button.evaluate(e=>e.addEventListener('keydown',event=>{event.preventDefault();event.stopPropagation();},{once:true}));
        await button.focus();await p.keyboard.down('Enter');const withheld=await snap(p);await p.keyboard.up('Enter');
        check(tag+'-withheld-key-positive-control',withheld.held===0,withheld.held);
      }
      if(name==='hand'){
        await button.evaluate(e=>{const fn=e.onpointerdown;e.onpointerdown=null;e._restore=()=>e.onpointerdown=fn;});
        await button.dispatchEvent('pointerdown',{pointerId:1});
        check(tag+'-cut-button-positive-control',!(await snap(p)).manual,(await snap(p)).manual);await button.evaluate(e=>e._restore());
        await button.dispatchEvent('pointerdown',{pointerId:1});const before=await snap(p);
        await advance(p,HOLD);const after=await snap(p);const expected=before.speed*HOLD;
        check(tag+'-left-hold-speed',Math.abs((before.x-after.x)/expected-1)<=TOL,{before:before.x,after:after.x,expected});
        check(tag+'-left-world-positive',after.world.x>before.world.x,{before:before.world.x,after:after.world.x});await shot('shuffle');
        await button.dispatchEvent('pointerup',{pointerId:1});await advance(p,0.1);const stopped=await snap(p);
        check(tag+'-release-stops',stopped.x===after.x,{after:after.x,stopped:stopped.x});
        await p.keyboard.down('ArrowRight');await advance(p,HOLD);await p.keyboard.up('ArrowRight');const key=await snap(p);
        check(tag+'-key-equals-button',Math.abs((key.x-stopped.x)/expected-1)<=TOL,{distance:key.x-stopped.x,expected});
        await p.keyboard.down('ArrowLeft');await p.keyboard.down('ArrowRight');await advance(p,0.1);
        check(tag+'-opposite-inputs-neutral',(await snap(p)).x===key.x,(await snap(p)).x);await p.keyboard.up('ArrowLeft');await p.keyboard.up('ArrowRight');
      }
      if(name==='beat'){
        const start=await snap(p);await p.keyboard.down('ArrowLeft');await advance(p,0.5);await p.keyboard.up('ArrowLeft');await advance(p,0.7);
        const set=await snap(p);check(tag+'-set-unresolved',!set.resolved,{elapsed:set.elapsed,resolved:set.resolved});
        await advance(p,0.5);const run=await snap(p);check(tag+'-runup-unresolved',!run.resolved&&run.ball.z===start.ball.z,{elapsed:run.elapsed,ball:run.ball,resolved:run.resolved});
        await advance(p,0.1);const contact=await snap(p);check(tag+'-contact-starts-ball',contact.ball.z<start.ball.z,{before:start.ball.z,after:contact.ball.z});
        check(tag+'-contact-does-not-resolve',contact.contacted&&!contact.resolved,{contacted:contact.contacted,resolved:contact.resolved});
        check(tag+'-aim-once-at-contact',contact.aimCalls===1&&contact.resolveCalls===0,{aim:contact.aimCalls,resolve:contact.resolveCalls});
        await p.keyboard.down('ArrowRight');await advance(p,0.1);await p.keyboard.up('ArrowRight');const follow=await snap(p);
        check(tag+'-post-contact-movement',follow.x>contact.x&&!follow.resolved,{before:contact.x,after:follow.x,resolved:follow.resolved});
        // 판정 시각은 체인이 소유한다. 최대 비행 1.1초 안에서 실제 발동을 기다린다.
        await advance(p,0.1);let final=await snap(p);
        while(!final.resolved&&final.elapsed-final.set-final.runup<1.1){await advance(p,STEP);final=await snap(p);}
        check(tag+'-trace-sampled',final.input?.trace?.length>=21&&final.input.trace.filter(x=>x.ms<=0).every((x,i)=>Math.abs(x.ms-(-1000+i*50))<0.001),final.input?.trace);
        check(tag+'-off-centre-dive',Math.abs(final.result?.input?.x)>0.1,final.result?.input?.x);
        // 접촉 때 0이던 판정 호출이 발동 때 하나가 되는 양성 대조군을 함께 읽는다.
        check(tag+'-resolve-once-at-trigger',final.resolved&&final.aimCalls===1&&final.resolveCalls===1,{aim:final.aimCalls,resolve:final.resolveCalls});
        check(tag+'-trace-includes-post-contact',final.input.trace.at(-1).ms>0&&final.input.trace.some(x=>x.ms<0),final.input.trace.at(-1));
        const locked=final.x;await p.keyboard.down('ArrowRight');await advance(p,0.1);await p.keyboard.up('ArrowRight');
        check(tag+'-input-after-dive-ignored',(await snap(p)).x===locked,{before:locked,after:(await snap(p)).x});
        // 발동 0.25초 뒤라 뻗는 몸이 실제로 보이는 중간 프레임을 남긴다.
        await advance(p,0.15);await shot('dive');
        await advance(p,1.5);await shot('caption');
        check(tag+'-caption-visible',await p.locator('#caption').isVisible()&&(await p.locator('#caption').textContent()).length>0,await p.locator('#caption').textContent());
      }
      await context.close();
    }
    if(name==='hand'){
      for(const paid of [false,true]){
        const context=await browser.newContext({viewport:{width:1280,height:720}});
        const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(BASE);await p.waitForSelector('#go');
        await p.evaluate(on=>{
          window.__freeze(true);
          if(on){Object.assign(window.__bot(),{tier:1,ms:60000});document.getElementById('auto').onpointerdown();}
        },paid);
        await p.click('#go',{force:true});
        // 중앙에서 준비 위치로 정렬한 뒤, 계획의 첫 시점부터 접촉 직전까지 정지를 잰다.
        await advance(p,STEP); const initial=await snap(p);
        // 계획은 밀리초, 브라우저 시계는 초이며 advance가 더하는 마지막 한 프레임을 뺀다.
        await advance(p,initial.set+initial.runup+initial.plan[0].ms/1000-initial.elapsed-STEP);
        const start=await snap(p);
        // 두 프레임은 advance의 종료 프레임 하나와 접촉 전 여유 한 프레임이다.
        await advance(p,start.set+start.runup-start.elapsed-2*STEP); const before=await snap(p);
        // 기존 추적 오차 0.02를 준비 위치에도 그대로 적용한다.
        check((paid?'bot':'idle')+'-stationary-before-contact',!before.contacted&&Math.abs(before.x-start.x)<0.02,{start:start.x,before:before.x,startMs:(start.elapsed-start.set-start.runup)*1000,beforeMs:(before.elapsed-before.set-before.runup)*1000,contacted:before.contacted});
        // 실제 계획에서 움직이는 구간의 시작을 읽고 판정 전 프레임만 재생한다.
        let after=before;
        const segment=before.plan.findIndex((point,i,plan)=>i>0&&point.x!==plan[i-1].x);
        const onset=segment<0?Infinity:before.plan[segment-1].ms;
        do {
          await advance(p,STEP);
          const next=await snap(p);
          if(next.resolved) break;
          after=next;
        } while((after.elapsed-after.set-after.runup)*1000<=onset||Math.abs(after.x-before.x)===0);

        const ms=(after.elapsed-after.set-after.runup)*1000;
        const plan=after.plan;let want=plan.at(-1).x;
        for(let i=1;i<plan.length;i++){if(ms<=plan[i].ms){const a=plan[i-1],b=plan[i];want=a.x+(b.x-a.x)*(ms-a.ms)/(b.ms-a.ms);break;}}
        // 0.02는 10ms 고정 프레임의 최대 한 걸음보다 넓은 렌더 추적 오차다.
        check((paid?'bot':'idle')+'-follows-plan',!after.manual&&!after.resolved&&(!Number.isFinite(onset)||ms<=onset||Math.abs(after.x-before.x)>0)&&Math.abs(after.x-want)<0.02,{before:before.x,after:after.x,want,ms,onset:Number.isFinite(onset)?onset:null,resolved:after.resolved});
        // 몸 앞에 오는 공은 도착 직전까지 서 있으므로 비행 0.7초를 모두 지난다.
        await advance(p,0.8);const result=await snap(p);
        check((paid?'bot':'idle')+'-credit-attribution',result.input?.auto===paid,result.input?.auto);
        await context.close();
      }
      // 만렙 판단력은 접촉 뒤 반응이 발동보다 먼저 오는 실제 봇 자취를 노출한다.
      {
        const context=await browser.newContext();const p=await context.newPage();
        await p.goto(BASE.replace('veteran,rich','maxed,veteran,rich'));await p.waitForSelector('#go');
        await p.evaluate(()=>{window.__freeze(true);Object.assign(window.__bot(),{tier:1,ms:60000});document.getElementById('auto').onpointerdown();});
        await p.click('#go',{force:true});await advance(p,2.5);const sample=await snap(p);
        const post=sample.frames.filter(f=>f.ms>0),plan=sample.plan;
        const at=ms=>{for(let i=1;i<plan.length;i++){if(ms<=plan[i].ms){const a=plan[i-1],b=plan[i];return a.x+(b.x-a.x)*(ms-a.ms)/(b.ms-a.ms);}}return plan.at(-1).x;};
        const distance=Math.max(...post.map(f=>f.x))-Math.min(...post.map(f=>f.x));
        const error=Math.max(...post.map(f=>Math.abs(f.x-at(f.ms))));
        check('bot-post-contact-follows-plan',distance>0&&error<0.02,{distance,error,samples:post.length});
        await context.close();
      }
      const context=await browser.newContext();const p=await context.newPage();await p.goto(BASE);await p.waitForSelector('#go');
      const migration=await p.evaluate(()=>{
        const key=window.__saveKey();window.__persist();const record=JSON.parse(localStorage.getItem(key));record.pref=-1;localStorage.setItem(key,JSON.stringify(record));return {key,had:'pref' in record};
      });
      await p.reload();await p.waitForSelector('#go');
      const saved=await p.evaluate(()=>{window.__persist();return JSON.parse(localStorage.getItem(window.__saveKey()));});
      check('old-save-drops-pref',migration.had&&!Object.hasOwn(saved,'pref')&&saved.squad.length>0,{pref:saved.pref,squad:saved.squad.length});await context.close();
    }
    check('browser-errors-zero',errors.length===0,errors);
  }catch(e){check('exception',false,e.stack);}finally{if(browser)await browser.close();clearTimeout(timer);}
  writeFileSync(OUT+name+'.json',JSON.stringify({invocation:'node tools/'+name+'-gate.mjs',results},null,2));
  const fails=results.filter(r=>!r.pass).length;console.log(name+' '+(fails?'FAIL '+fails:'PASS '+results.length));if(fails)process.exitCode=1;
}
