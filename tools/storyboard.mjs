import { chromium } from 'playwright';
import fs from 'node:fs';
// 3분 이내 제출 영상의 원본. 사람이 키보드 앞에 앉지 않고 스스로 찍는다.
// 자막은 여기서 넣지 않는다. 화면 위 카피는 hyperframes 컴포지션이 얹는다.
// 대신 장면이 바뀐 시각을 beats.json에 남겨서 오버레이가 그 시각에 붙게 한다.
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const DIR = process.env.OUT || 'video.local';
const FRAMES = DIR + '/frames';
const W = 1920;
const H = 1080;
const FPS = 60;
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const t = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 420000); t.unref();

let b;
const t0 = Date.now();
const beats = [];
const mark = (id) => beats.push({ id, at: +((Date.now() - t0) / 1000).toFixed(2) });

try {
  // 대우수 배율로 들어가면 확대 보간이 한 번 더 걸리고 그 자리에서 자글거림이 난다.
  // 트레일러가 1920x1080이므로 캡처도 같은 치수로 받는다.
  b = await chromium.launch({ executablePath: EXE, args: ['--force-device-scale-factor=1'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H } });
  const p = await ctx.newPage();
  // 캡처 영상은 오디오를 담지 못한다. 발화 시각을 받아적어 나중에 깔아 넣는다.
  // beats와 같은 시계를 써야 두 목록을 한 시간축 위에 올릴 수 있다.
  await p.addInitScript((zero) => { window.__sfxLog = []; window.__sfxT0 = zero; }, t0);
  p.on('pageerror', (e) => console.log('ERR', String(e && e.stack || e)));
  await p.goto('http://127.0.0.1:10310/web/index.html?seed=20', { waitUntil: 'load' });
  // 저장이 남아 있으면 다음 캡처가 지난 번 레벨에서 시작한다.
  // 영상은 처음 여는 사람이 보는 것과 같아야 한다. 1레벨부터다.
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(700);
  const wait = (ms) => p.waitForTimeout(ms);

  // Playwright recordVideo는 VP8 25fps 고정이다. CDP 스크린캡스트는 페인트마다 한 장을 준다.
  // 프레임 간격은 고르지 않으므로 각 장의 시각을 적어 둔다. concat이 그걸 시간축으로 쓴다.
  const cdp = await ctx.newCDPSession(p);
  const stamps = [];
  let seq = 0;
  cdp.on('Page.screencastFrame', async (f) => {
    const i = seq; seq += 1;
    fs.writeFileSync(FRAMES + '/f' + String(i).padStart(6, '0') + '.jpg', Buffer.from(f.data, 'base64'));
    stamps.push(f.metadata.timestamp);
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch { /* 페이지가 닫힐 때 난다 */ }
  });

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

  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

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

  // 성장 오버레이는 모달이다. 열려 있는 동안은 판이 안 굴러간다.
  // 닫고 사건을 보여주면 그 사이에 다음 판이 끝나면서 모달이 또 열려 장면을 자른다.
  // 열어둔 채 화면에서만 숨긴다. 판은 멈춰 있고 연출만 돌아간다.
  await p.evaluate(() => { document.getElementById('offer').style.visibility = 'hidden'; });
  await wait(600);

  // 4장. 병맛 사건. 한 장면씩 불러서 충분히 보여준다.
  const SHOW = ['gloveGone', 'carriedIn', 'downed', 'talked', 'charge', 'beat'];
  for (const kind of SHOW) {
    await p.evaluate((kk) => window.__act(kk), kind);
    mark(kind);
    await wait(5200);
  }

  await p.evaluate(() => { document.getElementById('offer').style.visibility = ''; });
  await wait(900);
  await holdOffer(700);
  await wait(2000);

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

  // 영상 시간축과 맞추려면 페이지 시계를 캡처 시작 시각 기준으로 옮겨야 한다.
  const sfx = await p.evaluate(() => window.__sfxLog.map(([n, a, t]) => [n, a, +((t + performance.timeOrigin - window.__sfxT0) / 1000).toFixed(3)]));
  await cdp.send('Page.stopScreencast');
  await p.waitForTimeout(300);
  await ctx.close();

  // 첫 프레임을 0초로 놓고 나머지를 그 뒤로 줄 세운다.
  // beats가 캐프쳐 시작 시각 기준이므로 그 차이를 먼저 빼야 두 목록이 같은 시계를 쓴다.
  const n = Math.min(seq, stamps.length);
  const rel = stamps.slice(0, n).map((v) => v - stamps[0]);
  const lines = [];
  for (let i = 0; i < n; i += 1) {
    lines.push("file 'frames/f" + String(i).padStart(6, '0') + ".jpg'");
    const next = i + 1 < n ? rel[i + 1] : rel[i] + 1 / FPS;
    lines.push('duration ' + Math.max(1 / 240, next - rel[i]).toFixed(6));
  }
  lines.push("file 'frames/f" + String(n - 1).padStart(6, '0') + ".jpg'");
  fs.writeFileSync(DIR + '/frames.txt', lines.join(String.fromCharCode(10)) + String.fromCharCode(10));

  // 캡처가 실제로 시작한 순간은 startScreencast 뒤의 첫 프레임이다.
  // 그 전까지 흘러간 시간을 빼야 beats가 영상 시간축과 맞는다.
  const shift = beats.length ? beats[0].at : 0;
  const shifted = beats.map((x) => ({ id: x.id, at: +(x.at - shift).toFixed(2) }));
  fs.writeFileSync(DIR + '/beats.json', JSON.stringify({ frames: n, fps: FPS, seconds: +rel[n - 1].toFixed(2), shift, beats: shifted }, null, 2));
  fs.writeFileSync(DIR + '/sfx.json', JSON.stringify({ t0, shift, events: sfx.map(([nm, a, at]) => [nm, a, +(at - shift).toFixed(3)]) }, null, 2));
  console.log('sfx', sfx.length);
  console.log('frames', n, 'seconds', rel[n - 1].toFixed(2), 'fps', (n / rel[n - 1]).toFixed(1));
  console.log('beats', JSON.stringify(shifted));
} finally { clearTimeout(t); if (b) await b.close(); }
