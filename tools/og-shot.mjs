// 공유 미리보기 그림을 제목 화면에서 굽는다. 배포에 그림 파일이 한 장도 없어 링크를
// 공유하면 미리보기가 글자뿐이었다. 밖에서 그림을 가져오면 권리 질의가 생기고, 제목 화면은
// 게임 자체 렌더러가 그리는 것이라 자작 칸에 든다. 1200x630은 OG가 권하는 비율이다.
// 게임은 16:9로 서므로 그 비율 뷰포트에서 찍고 가운데를 잘라 630 높이에 맞춘다.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const URL = 'http://127.0.0.1:10310/web/index.html?seed=20';
const OUT = process.argv[2] || 'web/assets/og.png';
const t = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 60000);
t.unref();

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  // 1200 폭에 16:9면 675 높이다. 위아래 22px씩 잘라 630을 만든다.
  const p = await (await b.newContext({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 1 })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(URL, { waitUntil: 'load' });
  // 제목 화면은 서체와 배경 장면이 다 뜬 뒤가 그림이다. 1.2초는 tail-shot이 같은 자리에 쓰는 값이다.
  await p.waitForTimeout(1200);
  mkdirSync('web/assets', { recursive: true });
  await p.screenshot({ path: OUT, clip: { x: 0, y: 22, width: 1200, height: 630 } });
  console.log(JSON.stringify({ out: OUT, errs }));
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
process.exit(0);

