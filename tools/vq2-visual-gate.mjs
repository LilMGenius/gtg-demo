import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = new URL('../.omo/evidence/vq2/', import.meta.url);
mkdirSync(out, {recursive:true});
const timer = setTimeout(() => process.exit(1), 180000); // 화면 캡처가 멈추면 세 분 안에 종료한다.
timer.unref();
const browser = await chromium.launch({executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium-1228/chrome-win64/chrome.exe'});
const errors=[], artifacts=[];
try {
  let page=await browser.newPage({viewport:{width:1280,height:720}}); // 과제의 데스크톱 화면 크기다.
  page.on('pageerror',e=>errors.push(String(e)));
  const shot=async name=>{
    await page.screenshot({path:fileURLToPath(new URL(name+'.jpg',out)),type:'jpeg',quality:85}); // 참조와 같은 JPEG로 캡처하며 장변은 1600 이하로 유지한다.
    artifacts.push(name+'.jpg');
  };
  await page.goto('http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran');
  await page.click('#go',{force:true});
  await page.evaluate(()=>{window.__fixedStep(1/60);window.__plan(0,null,window.__frames()+1);}); // 한 프레임 뒤 세계를 멈춰 모든 화면에서 같은 포즈를 비교한다.
  await page.waitForTimeout(500); // 세계 정지와 별개인 HUD의 진입 전환이 끝난 화면을 담는다.
  await shot('pitch-1280x720');
  await page.setViewportSize({width:844,height:390}); // 과제의 가로 모바일 화면 크기다.
  await page.waitForTimeout(500); // 크기 변경 뒤 캔버스 재배치가 끝나야 빈 버퍼를 찍지 않는다.
  await shot('pitch-844x390');
  await page.setViewportSize({width:740,height:360}); // 좁은 가로 화면도 과제의 모집단이다.
  await page.waitForTimeout(500); // 캔버스 재배치 뒤에 찍는다.
  await shot('pitch-740x360');
  await page.setViewportSize({width:1280,height:720}); // 선반 전체를 같은 데스크톱 폭으로 비교한다.
  await page.evaluate(()=>window.__shop(true));
  for(const tab of ['hair','kit','beard']){
    await page.locator('#shop .tab[data-tab="'+tab+'"]').click({force:true});
    await page.waitForTimeout(500); // 패널 전환과 썸네일 굽기가 끝난 화면을 담는다.
    await shot(tab+'-shelf');
  }
  await page.locator('#shop .tab[data-tab="pull"]').click({force:true});
  await page.locator('#shop .show-legends').click({force:true});
  await page.waitForTimeout(500); // 쇼케이스 전환 뒤 실제 세 카드를 캡처한다.
  await shot('showcase-1280x720');
  await page.setViewportSize({width:844,height:390}); // 가로 모바일에서도 세 선수의 차림을 확인한다.
  await page.locator('.legend-showcase').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500); // 모바일 스크롤과 배치가 끝난 카드 표면을 읽는다.
  await shot('showcase-844x390');
  await page.setViewportSize({width:740,height:360}); // 좁은 가로 화면의 선수 카드도 확인한다.
  await page.locator('.legend-showcase').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500); // 카드 재배치를 기다린다.
  await shot('showcase-740x360');
  await page.setViewportSize({width:1280,height:720}); // 수염 비교판은 데스크톱 크기로 복귀한다.
  const pictures=await page.evaluate(async()=>{
    const m=await import('/web/src/render/thumb.mjs'),g=await import('/web/src/state/gear.mjs');
    const keeper=window.__keeperStats();
    return {rows:g.BEARDS.flatMap((b,rank)=>Array.from({length:3},(_,skin)=>({label:b.name+' · '+(g.BEARD_SKINS[rank][skin]?.name||'면도'),url:m.thumbURL('beard',keeper,g.lookOf({beard:rank,beardSkin:skin},keeper.name))}))), // 세 색의 열을 유지하며 면도는 모든 열에서 맨살이어야 한다.
      close:m.thumbURL('face',keeper,g.lookOf({beard:g.BEARDS.length-1},keeper.name))};
  });
  await page.close();
  page=await browser.newPage({viewport:{width:1280,height:720}}); // 게임 루프와 비교판 문서를 분리한다.
  page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/vq2-blank',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));
  await page.goto('http://127.0.0.1:10310/vq2-blank');
  // 실제 상품 렌더를 카드 크기로 나란히 두어 등급과 색을 동시에 비교한다.
  await page.setContent('<html lang="ko"><meta charset="utf-8"><style>body{margin:24px;background:#dce6df;color:#25363d;font:16px sans-serif}main{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}figure{margin:0;background:#ecf0e7;padding:8px;text-align:center}img{width:224px;height:103px;object-fit:contain}#close{position:absolute;right:40px;bottom:8px;width:224px;height:103px}</style><h1>수염 · 모든 등급과 색</h1><main></main></html>'); // 세 색을 같은 행에서 읽는 비교판이다.
  await page.evaluate(({rows,close})=>{const main=document.querySelector('main');for(const row of rows){const f=document.createElement('figure'),im=document.createElement('img'),caption=document.createElement('figcaption');im.src=row.url;caption.textContent=row.label;f.append(im,caption);main.append(f);}},pictures);
  await page.evaluate(()=>Promise.all([...document.images].map(im=>im.decode())));
  await shot('beard-all-tiers-tones');
  await page.setContent('<body style="margin:0;background:#dce6df"></body>');
  await page.evaluate(async()=>{
    const T=await import('/web/vendor/three.module.min.js'),a=await import('/web/src/render/objects/actors.mjs');
    const g=await import('/web/src/state/gear.mjs'),r=await import('/src/roster.mjs');
    const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setSize(1280,720); // 확대 이미지 대신 과제 해상도에서 실제 기하를 다시 렌더한다.
    document.body.append(renderer.domElement);
    const scene=new T.Scene();scene.background=new T.Color(0xdce6df); // 참조 비교판과 같은 중립 배경이다.
    scene.add(new T.HemisphereLight(0xe7f4ff,0x9b9384,2.1)); // 키트의 넓은 반구광으로 턱 곡면을 읽는다.
    const key=new T.DirectionalLight(0xffedce,3.2);key.position.set(-4,8,5);scene.add(key); // 키트의 단일 주광이다.
    const keeper=r.KEEPERS[0],rig=a.buildKeeper(keeper.height,keeper.weight,g.lookOf({beard:g.BEARDS.length-1},keeper.name));
    scene.add(rig);rig.updateMatrixWorld(true);
    const at=rig.userData.head.getWorldPosition(new T.Vector3()),cam=new T.PerspectiveCamera(30,1280/720,0.1,100); // 얼굴과 양쪽 턱을 함께 담는 근접 화각이다.
    cam.position.copy(at).add(new T.Vector3(0.25,0.05,1.8));cam.lookAt(at); // 약한 삼사분 각으로 턱 표면과 입의 틈을 함께 본다.
    renderer.render(scene,cam);
  });
  await shot('keeper-beard-closeup');
  await page.setViewportSize({width:1280,height:480}); // 일곱 차림의 소품과 얼굴을 같은 카드 높이에서 비교한다.
  await page.evaluate(async()=>{
    document.body.innerHTML='';
    const T=await import('/web/vendor/three.module.min.js'),a=await import('/web/src/render/objects/actors.mjs');
    const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,480); // 비교판의 실제 출력 해상도다.
    document.body.append(renderer.domElement);
    const scene=new T.Scene();scene.background=new T.Color(0xdce6df); // 얼굴과 소품 색을 가리지 않는 중립 배경이다.
    scene.add(new T.HemisphereLight(0xe7f4ff,0x9b9384,2.1)); // 키트 반구광이다.
    const key=new T.DirectionalLight(0xffedce,3.2);key.position.set(-4,8,5);scene.add(key); // 키트의 단일 주광이다.
    const variants=a.PASSER_VARIANTS.filter(v=>!['keeper','kicker'].includes(v.id));
    variants.forEach((v,i)=>{const rig=a.buildWalker(v);a.poseWalker(rig,0.12,{heading:0,time:1});rig.root.position.x=(i-3)*1.65;scene.add(rig.root);}); // 같은 보폭의 정면에서 일곱 차림을 나란히 세운다.
    const cam=new T.PerspectiveCamera(34,1280/480,0.1,100);cam.position.set(0,2.6,8.8);cam.lookAt(0,1.2,0); // 머리부터 발끝까지 한 장에 남기는 비교용 카메라다.
    renderer.render(scene,cam);
  });
  await shot('walker-lineup');

  const errorStart=errors.length;
  await page.evaluate(()=>setTimeout(()=>{throw new Error('P22-VQ2 planted exception');},0)); // 오류 없는 캡처의 수집기가 실제 예외를 감지하는지 검증한다.
  await page.waitForTimeout(100); // 비동기 예외 수집이 끝난 뒤 실제 오류와 대조군을 나눈다.
  const exceptionControl=errors.splice(errorStart),controlPass=exceptionControl.some(e=>e.includes('P22-VQ2 planted exception'));
  writeFileSync(new URL('visual.json',out),JSON.stringify({invocation:'node tools/vq2-visual-gate.mjs',browser:browser.version(),artifacts,beardSamples:pictures.rows.length,errors,exceptionControl,pass:errors.length===0&&pictures.rows.length>0&&controlPass},null,2));
  console.log(errors.length||!controlPass?'vq2-visual FAIL':'vq2-visual PASS',JSON.stringify({artifacts,errors}));
  if(errors.length||!controlPass)process.exitCode=1;
}finally{clearTimeout(timer);await browser.close();}
