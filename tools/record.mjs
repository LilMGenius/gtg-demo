import { chromium } from 'playwright';
// 무인 녹화. 오토 모드를 켜고 게임이 스스로 도는 동안 프레임을 받는다.
// 사람이 화면을 녹화하면 매번 다른 영상이 나온다. 이건 씨드가 같으면 같은 영상이 나온다.
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const SEC = Number(process.env.SEC || 70);
const DIR = process.env.OUT || 'video.local';
const t = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, (SEC + 60) * 1000); t.unref();
let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: DIR, size: { width: 1280, height: 720 } }
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERR', String(e)));
  await p.goto('http://127.0.0.1:10310/web/index.html?seed=20', { waitUntil: 'load' });
  // 타이틀을 한 박자 보여준 뒤 들어간다. 바로 넘기면 게임 이름이 영상에 안 남는다.
  await p.waitForTimeout(2600);
  await p.click('#go', { force: true });
  await p.waitForTimeout(900);
  // 오토가 이미 켜져 있으면 누르는 순간 꺼진다. 상태를 읽고 필요할 때만 누른다.
  const on = await p.evaluate(() => document.getElementById('auto').classList.contains('on'));
  if (!on) await p.click('#auto', { force: true });
  await p.waitForTimeout(SEC * 1000);
  await ctx.close();
  const f = await p.video().path();
  console.log('video', f);
} finally { clearTimeout(t); if (b) await b.close(); }
