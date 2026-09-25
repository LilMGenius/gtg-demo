import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {CITY_SKINS} from '../web/src/state/gear.mjs';
import {passerRosterAt} from '../web/src/state/passer.mjs';
const out=new URL('../.omo/evidence/p16/',import.meta.url);mkdirSync(out,{recursive:true});
const rows=[],errors=[];
const check=(name,pass,detail)=>{rows.push({name,pass,detail});console.log(pass?'PASS':'FAIL',name,JSON.stringify(detail));};
// 개최지 열두 곳과 부유도 네 줄의 캡처 시간 예산이다.
const WATCHDOG=setTimeout(()=>process.exit(2),240000);
const browser=await chromium.launch({executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
try{
  // 기존 VQ2 비교판의 가로 해상도를 그대로 사용한다.
  let page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:10310/web/index.html?seed=20&vary=0&preset=veteran');
  await page.locator('#go').click({force:true});
  await page.evaluate(()=>window.__lockRound());
  for(const [tier,hosts] of CITY_SKINS.entries())for(const [variant,host] of hosts.entries()){
    const expected=passerRosterAt(tier,variant);
    const actual=await page.evaluate(({tier,variant})=>{
      window.__crowd(tier,variant);
      return window.__sceneRoot().children.filter(body=>body.userData.walker&&body.visible).map(body=>({
        key:body.userData.roster?.key,country:body.userData.roster?.country,wealth:body.userData.roster?.wealth,
        kind:body.userData.walker.v.id,shirt:Array.from(body.userData.walker.chest.children.find(part=>part.isMesh).geometry.getAttribute('color').array.slice(0,3))
      }));
    },{tier,variant});
    check('venue-pool:'+tier+':'+variant,actual.length===expected.length&&actual.every((row,i)=>row.key===expected[i].key&&row.kind===expected[i].id&&row.country===host.country&&row.wealth===host.wealth),{host:host.name,actual,expected});
  }
  const before=errors.length;
  await page.evaluate(()=>setTimeout(()=>{throw Error('P16 심은 오류');},0));
  // 비동기 오류 이벤트가 수집기에 도착하도록 한 틱보다 충분히 긴 100밀리초를 둔다.
  await page.waitForTimeout(100);
  const control=errors.splice(before);
  check('control:console',control.some(error=>error.includes('P16 심은 오류')),control);
  await page.close();
  // 코드가 제공한 부유도 0·1·2·3의 대표 개최지를 한 곳씩 실제로 그린다.
  for(const [tier,variant] of [[2,2],[2,1],[2,0],[3,2]]){
    const host=CITY_SKINS[tier][variant];
    page=await browser.newPage({viewport:{width:1280,height:480}});
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/p16-lineup.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0"></body></html>'}));
    await page.goto('http://127.0.0.1:10310/p16-lineup.html');
    const lineup=await page.evaluate(async({tier,variant})=>{
      const T=await import('/web/vendor/three.module.min.js');
      const {buildPassers}=await import('/web/src/render/objects/pitch.mjs');
      const {poseWalker}=await import('/web/src/render/objects/actors.mjs');
      const {passerCountAt}=await import('/web/src/state/passer.mjs');
      // VQ2 비교판의 무광 배경·반구광·단일 주광을 재사용한다.
      const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,480);
      document.body.append(renderer.domElement);
      const scene=new T.Scene();scene.background=new T.Color(0xdce6df);
      scene.add(new T.HemisphereLight(0xe7f4ff,0x9b9384,2.1));
      const light=new T.DirectionalLight(0xffedce,3.2);light.position.set(-4,8,5);scene.add(light);
      const bodies=buildPassers(scene,passerCountAt(tier),tier,variant);
      // 1.3 간격은 넓은 관광객 가방까지 겹치지 않는 전신 비교 간격이다.
      bodies.forEach((body,i)=>{body.position.set((i-(bodies.length-1)/2)*1.3,0,0);poseWalker(body.userData.walker,0.12,{heading:0,time:1});});
      // 최대 열한 명을 같은 크기로 담기 위해 VQ2의 34도 화각에서 거리를 11.5로 고정한다.
      const camera=new T.PerspectiveCamera(34,1280/480,0.1,100);camera.position.set(0,2.6,11.5);camera.lookAt(0,1.2,0);
      renderer.render(scene,camera);
      return bodies.map(body=>({roster:body.userData.roster,rig:body.userData.walker.v.id}));
    },{tier,variant});
    // 렌더 비교판의 JPEG 품질 85는 장변 제한과 함께 대화 무게를 제한한다.
    const artifact='pedestrians-wealth-'+host.wealth+'.jpg';
    await page.screenshot({path:fileURLToPath(new URL(artifact,out)),type:'jpeg',quality:85});
    check('lineup:'+host.wealth,lineup.length>0&&lineup.every(row=>row.roster.id===row.rig),{host:host.name,artifact,lineup});
    await page.close();
  }
  check('console',errors.length===0,errors);
}finally{await browser.close();clearTimeout(WATCHDOG);writeFileSync(new URL('passer-pool.json',out),JSON.stringify(rows,null,2));}
const pass=rows.every(row=>row.pass);
console.log('passer-pool '+(pass?'PASS ':'FAIL ')+rows.length);
if(!pass)process.exitCode=1;
