import {chromium} from 'playwright';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {passerCountAt} from '../web/src/state/passer.mjs';
const out=new URL('../.omo/evidence/p16/',import.meta.url);mkdirSync(out,{recursive:true});
// 실제 두 경기장과 카드 캡처가 멈추면 두 분 안에 닫는다.
const WATCHDOG=setTimeout(()=>process.exit(2),120000);
const browser=await chromium.launch({executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
const rows=[],errors=[];
try{
  // 수락 계약의 데스크톱 해상도이며 이미지 장변 상한보다 작다.
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:10310/web/index.html?seed=20&vary=0&preset=veteran');
  await page.locator('#go').click({force:true});
  await page.evaluate(()=>window.__lockRound());
  // 시작과 최상위 시설을 같은 시점과 카메라에서 비교한다.
  for(const tier of [0,3]){
    const crowd=await page.evaluate(tier=>window.__crowd(tier),tier);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const artifact='tier-'+tier+'-pitch.jpg';
    // 85 품질 JPEG는 렌더 화면을 대화에 넣을 때 용량을 제한한다.
    await page.screenshot({path:fileURLToPath(new URL(artifact,out)),type:'jpeg',quality:85});
    rows.push({tier,crowd,artifact,pass:crowd.filter(row=>row.on).length===passerCountAt(tier)});
  }
}finally{
  await browser.close();clearTimeout(WATCHDOG);
  writeFileSync(new URL('venue-view.json',out),JSON.stringify({rows,errors},null,2));
}
const pass=rows.length>0&&rows.every(row=>row.pass)&&!errors.length;
console.log('venue-view '+(pass?'PASS':'FAIL')+' '+rows.length);
if(!pass)process.exitCode=1;
