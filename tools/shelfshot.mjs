// 선반 썸네일을 굽고 재는 도구. 게이트가 아니라 사람이 보라고 만드는 판이다.
// 지적이 들어온 화면에서 고침을 다시 보라는 래칫에는 그 화면을 부를 자가 필요하고,
// 그 자가 없어서 같은 스크래치를 여섯 번 다시 썼다. 여섯 번의 답이 서로 비교가 안 됐다.
// 커밋을 워크트리로 펼쳐 각자 서버를 띄우면 이 도구 하나로 시점끼리 맞댈 수 있다.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = arg('port', '10310');
const TAG = arg('tag', 'now');
const SHELF = arg('shelf', 'hair');
const OUT = arg('out', 'shelfshot.local');
const BASE = 'http://127.0.0.1:' + PORT + '/web/index.html';

// 한 호출 90초 원칙에 맞춘 상한. 굽는 것은 등급당 수백 ms라 여기 닿으면 페이지가 안 뜬 것이다.
const wd = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 90000);
wd.unref();

// 선반 이름과 등급 표의 이름은 다르다. 셋을 한 줄로 묶어 둔다. 겨냥표의 키, 장비 칸,
// 등급 표다. 표 이름을 규칙으로 지어내면 studs가 BOOTS를 못 찾고 조용히 머리 표를 읽는다.
// 실제로 그렇게 돌려서 축구화 네 등급이 머리 이름을 달고 나왔다.
const SHELVES = {
  hair: { field: 'hair', rows: 'HAIRS' },
  studs: { field: 'studs', rows: 'BOOTS' },
  grip: { field: 'grip', rows: 'GLOVES' },
  pads: { field: 'pads', rows: 'KITS' },
  socks: { field: 'socks', rows: 'SOCKS' },
  ink: { field: 'ink', rows: 'TATTOOS' }
};
if (!SHELVES[SHELF]) { console.log('unknown shelf ' + SHELF + ', known ' + Object.keys(SHELVES).join(' ')); process.exit(1); }

mkdirSync(OUT, { recursive: true });
let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERR', String(e)));
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForSelector('#go', { timeout: 15000 });
  await p.click('#go', { force: true });
  await p.waitForTimeout(1400);

  const rows = await p.evaluate(async (a) => {
    const m = await import('/web/src/render/thumb.mjs');
    const g = await import('/web/src/state/gear.mjs');
    // 겨냥은 키퍼 치수를 타므로 표본을 고정한다. 안 고정하면 시점끼리 비교가 안 된다.
    const k = { height: 188, weight: 84 };
    const meas = (url) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = im.width; cv.height = im.height;
        const c = cv.getContext('2d');
        c.drawImage(im, 0, 0);
        const d = c.getImageData(0, 0, im.width, im.height).data;
        const W = im.width, H = im.height;
        let minX = W, maxX = -1, minY = H, maxY = -1, paint = 0;
        const edge = { top: 0, left: 0, right: 0, bottom: 0 };
        for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
          if (d[(y * W + x) * 4 + 3] <= 16) continue;
          paint += 1;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (y === 0) edge.top += 1;
          if (y === H - 1) edge.bottom += 1;
          if (x === 0) edge.left += 1;
          if (x === W - 1) edge.right += 1;
        }
        res({ W, H, paint, minX, maxX, minY, maxY, edge, url });
      };
      im.src = url;
    });
    const rows = g[a.rowsKey];
    const out = [];
    for (let n = 0; n < rows.length; n += 1) {
      const look = g.lookOf({ [a.field]: n });
      const r = await meas(m.thumbURL(a.shelf, k, look));
      r.name = rows[n].name || String(n);
      out.push(r);
    }
    return out;
  }, { shelf: SHELF, field: SHELVES[SHELF].field, rowsKey: SHELVES[SHELF].rows });

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const b64 = String(r.url).split(',')[1] || '';
    writeFileSync(OUT + '/' + TAG + '-' + SHELF + i + '.png', Buffer.from(b64, 'base64'));
    console.log(TAG + ' ' + SHELF + i + ' ' + r.name
      + ' | ' + r.W + 'x' + r.H
      + ' | fill ' + (100 * r.paint / (r.W * r.H)).toFixed(1) + '%'
      + ' | bbox ' + r.minX + ',' + r.minY + '-' + r.maxX + ',' + r.maxY
      + ' | edge t' + r.edge.top + ' l' + r.edge.left + ' r' + r.edge.right + ' b' + r.edge.bottom);
  }
} finally { if (b) await b.close(); }
process.exit(0);
