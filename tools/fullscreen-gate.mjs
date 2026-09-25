import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { pinClock } from './clock.mjs';
// 프로젝트의 브라우저와 시계, 과거 파일 응답 대조군을 재사용한다.
const BASE = 'http://127.0.0.1:10310/web/index.html';
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const ROOT = new URL('../', import.meta.url);
const failures = [];
const check = (axis, ok, detail) => { console.log((ok ? 'GREEN ' : 'RED ') + axis + ' ' + JSON.stringify(detail)); if (!ok) failures.push(axis); };
const timer = setTimeout(() => { console.error('fullscreen WATCHDOG'); process.exit(1); }, 90000);
timer.unref();
let browser;
try {
 browser = await chromium.launch({ executablePath: EXE });
 console.log('BINARY ' + JSON.stringify({node:process.version, executable:EXE, chromium:browser.version(), invocation:process.argv}));
 const fresh = async (touch, control = false, unsupported = false) => {
  const ctx = await browser.newContext({hasTouch:touch, viewport:{width:740,height:360}});
  await pinClock(ctx);
  if (unsupported) await ctx.addInitScript(() => { Object.defineProperty(Document.prototype,'fullscreenEnabled',{get:()=>false,configurable:true}); Object.defineProperty(Element.prototype,'webkitRequestFullscreen',{value:undefined,configurable:true}); });
  const p = await ctx.newPage();
  if(control) for(const file of ['index.html','src/main.mjs']) {
   const body=execFileSync('git',['show','4eb39f9:web/'+file],{cwd:ROOT,encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:1024*1024});
   await p.route('**/web/'+file+'*',r=>r.fulfill({status:200,contentType:file.endsWith('html')?'text/html':'text/javascript',body}));
  }
  // 과거 main이 읽는 판정과 화면 모듈도 같은 커밋으로 응답한다.
  if (control) await p.route(/\/(?:web\/src|src)\/.*\.mjs(?:\?.*)?$/, route => {
   const path = new URL(route.request().url()).pathname.slice(1);
   const body = execFileSync('git', ['show', '4eb39f9:' + path], {cwd:ROOT, encoding:'utf8'});
   return route.fulfill({contentType:'text/javascript', body});
  });
  const bootError = new Promise((_, reject) => p.once('pageerror', e => reject(new Error('boot: ' + e.message))));
  await p.goto(BASE+'?seed=20&preset=veteran');
  await Promise.race([bootError, p.waitForFunction(()=>typeof window.__wiki==='function')]);
  return p;
 };
 const tags=p=>p.evaluate(()=>['apple-mobile-web-app-capable','apple-mobile-web-app-status-bar-style','mobile-web-app-capable'].every((name,i)=>document.querySelector('meta[name="'+name+'"]')?.content===['yes','black-translucent','yes'][i]) && Boolean(document.querySelector('link[rel="manifest"]')));
 const state=p=>p.evaluate(()=>({root:document.fullscreenElement===document.documentElement,log:window.__fsLog||[],pressed:document.getElementById('fullscreen')?.getAttribute('aria-pressed')}));
 const start=async p=>{await p.locator('#go').tap({force:true}); await p.waitForFunction(()=>document.getElementById('title').hidden);await p.waitForTimeout(350);return state(p);};
 const cAxis=s=>s.root||s.log.filter(x=>x.call==='requestFullscreen').length===1;
 const p=await fresh(true);
 const url=await p.locator('link[rel="manifest"]').evaluate(e=>e.href);
 const response=await p.request.get(url),manifest=await response.json();
 const entry=await p.request.get(new URL(manifest.start_url,url).href);
 check('a:manifest',response.status()===200&&manifest.display==='fullscreen'&&manifest.orientation==='landscape'&&entry.status()===200,{status:response.status(),manifest,entry:entry.status()});
 for (const size of [192,512]) {
  const icon=manifest.icons.find(i=>i.sizes===`${size}x${size}`&&i.type==='image/png');
  const loaded=icon?await p.evaluate(async ({src,size})=>{const image=new Image();image.src=src;try{await image.decode();return {width:image.naturalWidth,height:image.naturalHeight,ok:image.naturalWidth===size&&image.naturalHeight===size};}catch{return {ok:false};}}, {src:new URL(icon.src,url).href,size}):{ok:false};
  check('readiness:install-icon-'+size,loaded.ok,loaded);
 }
 check('b:metadata',await tags(p),'three meta tags and manifest link');
 const touch=await start(p);
 check('c:touch-start',cAxis(touch),touch);
 await p.context().close();
 const d=await fresh(false);
 await d.click('#go',{force:true});await d.waitForTimeout(350);
 check('e:desktop-start',(await state(d)).log.length===0,await state(d));
 const plate=await d.locator('#fullscreen').evaluate(e=>({native:e.tagName==='BUTTON',hud:e.parentElement.id==='hud',rest:getComputedStyle(e).getPropertyValue('--col-r'),visible:e.offsetWidth>0}));
 await d.click('#fullscreen');
 await d.waitForFunction(()=>document.getElementById('fullscreen').getAttribute('aria-pressed')==='true');
 const on=await state(d);
 await d.click('#fullscreen');
 await d.waitForFunction(()=>document.getElementById('fullscreen').getAttribute('aria-pressed')==='false');
 const off=await state(d);
 check('d:toggle',plate.native&&plate.hud&&plate.visible&&Boolean(plate.rest)&&on.root&&on.pressed==='true'&&off.pressed==='false'&&off.log.map(x=>x.call).join(',')==='requestFullscreen,exitFullscreen',{plate,on,off});
 await d.keyboard.press('v');await d.waitForFunction(()=>document.fullscreenElement);
 await d.keyboard.press('v');await d.waitForFunction(()=>!document.fullscreenElement);
 check('keyboard:V',(await state(d)).log.length===4,await state(d));
 await d.context().close();
 const old=await fresh(true,true);
 const b=await tags(old),c=cAxis(await start(old));
 check('f:served-parent-b-red-c-red',!b&&!c,{revision:'4eb39f9',b,c,state:await state(old)});
 await old.context().close();
 const no=await fresh(true,false,true);await start(no);await no.click('#wikiBtn');
 await no.locator('#wiki .cats [data-cat="hand"]').click();
 check('unsupported:hidden-and-home-screen-help',await no.locator('#fullscreen').evaluate(e=>e.hidden)&&(await no.locator('#wiki').innerText()).includes('iPhone')&&(await state(no)).log.length===0,await state(no));
 await no.context().close();
} catch(e) {check('exception',false,e.stack);}
finally {if(browser) await browser.close();clearTimeout(timer);}
console.log('fullscreen '+(failures.length?'FAIL '+failures.length:'PASS'));
process.exitCode=failures.length?1:0;
