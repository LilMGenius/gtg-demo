import { chromium } from 'playwright';
import fs from 'node:fs';
// 3분 이내 제출 영상의 원본. 사람이 키보드 앞에 앉지 않고 스스로 찍는다.
// 자막은 여기서 넣지 않는다. 화면 위 카피는 hyperframes 컴포지션이 얹는다.
// 대신 장면이 바뀐 시각을 beats.json에 남겨서 오버레이가 그 시각에 붙게 한다.
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const DIR = process.env.OUT || 'video.local';
const t = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 420000); t.unref();

let b;
const t0 = Date.now();
const beats = [];
const mark = (id) => beats.push({ id, at: +((Date.now() - t0) / 1000).toFixed(2) });

try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: DIR, size: { width: 1280, height: 720 } }
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERR', String(e)));
  await p.goto('http://127.0.0.1:10310/web/index.html?seed=20', { waitUntil: 'load' });
  await p.waitForTimeout(700);
  const wait = (ms) => p.waitForTimeout(ms);

  // 성장 오버레이는 모달이다. 열리면 눌러주기 전까지 게임이 멈춘다.
  await p.evaluate(() => {
    window.__offerHold = 700;
    let shownAt = 0;
    setInterval(() => {
      const box = document.getElementById('offer');
      if (!box || box.hidden) { shownAt = 0; return; }
      if (!shownAt) shownAt = Date.now();
      if (Date.now() - shownAt < window.__offerHold) return;
      const btn = box.querySelector('button');
      if (btn) { btn.click(); shownAt = 0; }
    }, 220);
  });
  const offerUp = () => p.evaluate(() => {
    const box = document.getElementById('offer');
    return Boolean(box) && !box.hidden;
  });
  const holdOffer = (ms) => p.evaluate((v) => { window.__offerHold = v; }, ms);
  const awaitOffer = async (limit) => {
    for (let i = 0; i < limit / 250; i++) { if (await offerUp()) return true; await wait(250); }
    return false;
  };

  // 1장. 타이틀 화면을 그대로 보여준다.
  mark('title');
  await wait(4200);
  await p.click('#go', { force: true });
  await wait(1800);

  // 2장. 직접 막는다. 한 판은 슛 다섯 개다.
  mark('play');
  const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowRight'];
  for (let i = 0; i < 5; i++) {
    await wait(2000);
    await p.keyboard.press(KEYS[i]);
    await wait(2600);
    mark('shot' + (i + 1));
  }

  // 3장. 키운다. 다섯 개가 끝나면 성장 선택이 저절로 열린다.
  await holdOffer(999999);
  await awaitOffer(24000);
  mark('grow');
  await wait(9000);
  await holdOffer(700);
  await wait(2000);

  // 4장. 병맛 사건. 한 장면씩 불러서 충분히 보여준다.
  const SHOW = ['gloveGone', 'carriedIn', 'downed', 'talked', 'charge', 'beat'];
  for (const kind of SHOW) {
    await p.evaluate((kk) => window.__act(kk), kind);
    mark(kind);
    await wait(5200);
  }

  // 5장. 두 번째 판. 키운 뒤의 화면을 한 번 더 보여준다.
  mark('play2');
  for (let i = 0; i < 5; i++) {
    await wait(2000);
    await p.keyboard.press(KEYS[4 - i]);
    await wait(2600);
    mark('p2shot' + (i + 1));
  }
  await holdOffer(999999);
  await awaitOffer(24000);
  mark('grow2');
  await wait(6000);
  await holdOffer(700);
  await wait(2000);

  // 6장. 맡긴다. 자동이 실제로 막는 장면이 들어가야 한다.
  const on = await p.evaluate(() => document.getElementById('auto').classList.contains('on'));
  if (!on) await p.click('#auto', { force: true });
  mark('auto');
  await wait(40000);
  mark('end');
  await wait(2500);

  await ctx.close();
  const path = await p.video().path();
  fs.writeFileSync(DIR + '/beats.json', JSON.stringify({ video: path, beats }, null, 2));
  console.log('video', path);
  console.log('beats', JSON.stringify(beats));
} finally { clearTimeout(t); if (b) await b.close(); }
