import { chromium } from 'playwright';

// 바닥 맵의 이웃 화소차가 잔모래로 공과 경쟁하는지 재고, 체크무늬 대조군으로 자를 검증한다.
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const BASE = 'http://127.0.0.1:10310/web/index.html?seed=20';
const browser = await chromium.launch({ executablePath: EXE });
try {
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  const rows = await page.evaluate(async () => {
    const { dirtTex, scuffTex } = await import('./src/render/texture.mjs');
    const measure = (cv) => {
      const { width: w, height: h } = cv;
      const bytes = cv.getContext('2d').getImageData(0, 0, w, h).data;
      let delta = 0, min = Infinity, max = -Infinity, count = 0;
      for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) {
        const i = (y * w + x) * 4; // RGBA 네 채널 중 밝기 변화가 실린 빨강 채널을 읽는다.
        delta += Math.abs(bytes[i] - bytes[i - 4]);
        min = Math.min(min, bytes[i]); max = Math.max(max, bytes[i]); count++;
      }
      return { adjacent: delta / count, range: max - min, count };
    };
    const control = document.createElement('canvas');
    control.width = control.height = 64; // 한 픽셀 줄무늬가 충분히 반복되는 작은 양성 대조군이다.
    const c = control.getContext('2d');
    for (let x = 0; x < control.width; x++) {
      c.fillStyle = x % 2 ? '#ffffff' : '#000000'; // 인접 화소가 최대 대비를 내야 검출 배선이 살아 있다.
      c.fillRect(x, 0, 1, control.height);
    }
    return { dirt: measure(dirtTex().image), scuff: measure(scuffTex().image), control: measure(control) };
  });
  const limit = 1; // 인접 텍셀 평균차를 한 sRGB 단계 아래로 묶어 잔무늬를 막는다.
  const checks = {
    'dirt:quiet': rows.dirt.count > 0 && rows.dirt.adjacent < limit,
    'wear:broad-and-present': rows.scuff.count > 0 && rows.scuff.adjacent < limit && rows.scuff.range > limit,
    'control:detects-high-frequency': rows.control.count > 0 && rows.control.adjacent > limit
  };
  console.log(JSON.stringify({ rows, checks }, null, 2));
  const ok = Object.values(checks).every(Boolean);
  console.log(ok ? 'texture PASS' : 'texture FAIL');
  if (!ok) process.exitCode = 1;
} finally { await browser.close(); }
