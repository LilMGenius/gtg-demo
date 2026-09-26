import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { clearDraw } from './draw.mjs';

// 창 뼈대의 자. 탭이 있는 창은 탭을 바꿔도 탭 줄과 닫기가 같은 자리에 서야 한다.
// 상점에서 뽑기 선반만 탈의실이 없어 탭 줄이 선반 기둥 폭을 따라 다르게 접히고, 닫기가 선반 높이를 따라 뛰었다.
// 사람 손은 탭과 닫기를 자리로 기억하므로 자리가 선반마다 다르면 매번 다시 찾는다.
// 축은 셋이다. 탭마다 탭 줄과 닫기의 좌표가 같은가, 닫기가 화면 안인가, 창 닫기 부품이 한 벌인가.
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const BASE = 'http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran';
// 게임이 실제로 도는 가로 두 크기와 넓은 데스크톱. 세로 폰은 입는 선반이 회전 안내로 덮이므로 뼈대를 못 잰다.
const SIZES = [[1920, 1080], [1280, 720], [844, 390]];
// 탭이 있는 창과 그 창을 여는 손잡이. 새 탭 창이 생기면 여기 한 줄이 늘어난다.
const PANELS = [{ id: 'shop', open: 'window.__shop(true)' }, { id: 'me', open: 'window.__me(true)' }];
// 1px은 반올림 오차다. 탭의 기울임은 요소마다 고정이라 좌표를 흔들지 않는다.
const TOL = 1;
const t = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 240000); t.unref();
const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + ' ' + (typeof d === 'string' ? d : JSON.stringify(d)));

// 닫기 부품은 한 벌이다. 창 id마다 같은 규칙을 복사하면 한 창만 고친 날 닫기가 창마다 다른 물건이 된다.
const css = readFileSync(new URL('../web/src/ui/hud.css', import.meta.url), 'utf8');
const copies = (css.match(/#[a-z]+ \.close\{padding:9px 26px 11px/g) || []).length;
check('shell:the-close-button-is-one-rule', copies === 0 && /:is\([^)]*\) > \.close\{/.test(css), copies + ' per-panel copies');

const b = await chromium.launch({ executablePath: EXE });
try {
  for (const [W, H] of SIZES) {
    for (const panel of PANELS) {
      const p = await b.newPage({ viewport: { width: W, height: H } });
      await p.goto(BASE); await p.locator('#go').click({ force: true }); await clearDraw(p);
      await p.evaluate(panel.open); await p.waitForTimeout(400);
      const tabs = await p.evaluate((id) => [...document.querySelectorAll('#' + id + ' .tab')].map((e) => e.dataset.tab), panel.id);
      const at = () => p.evaluate((id) => {
        const r = (s) => { const e = document.querySelector('#' + id + ' ' + s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width)]; };
        const c = document.querySelector('#' + id + ' > .close');
        const cb = c && c.getBoundingClientRect();
        // 줄마다 탭 수. 흘려 접으면 끝의 한 칸만 다음 줄로 떨어진다. 줄은 윗변으로 가른다.
        const rows = {};
        for (const e of document.querySelectorAll('#' + id + ' .tab')) { const y = Math.round(e.getBoundingClientRect().top / 8); rows[y] = (rows[y] || 0) + 1; }
        return { tabs: r('.tabs'), close: r('> .close'), inView: Boolean(cb && cb.top >= 0 && cb.bottom <= innerHeight), rows: Object.values(rows) };
      }, panel.id);
      const seen = [];
      for (const tab of tabs) {
        await p.evaluate(([id, k]) => document.querySelector('#' + id + ' .tab[data-tab="' + k + '"]').click(), [panel.id, tab]);
        await p.waitForTimeout(160);
        seen.push({ tab, ...(await at()) });
      }
      const drift = (key) => seen.filter((s) => s[key] && seen[0][key] && s[key].some((v, i) => Math.abs(v - seen[0][key][i]) > TOL)).map((s) => s.tab + ' ' + s[key].join(','));
      const tag = W + 'x' + H + ':' + panel.id;
      check(tag + ':instrument:the-panel-has-tabs', tabs.length > 1, tabs.length + ' tabs');
      check(tag + ':shell:the-tab-row-holds-still-across-tabs', drift('tabs').length === 0, drift('tabs').join(' | ') || 'still at ' + (seen[0].tabs || []).join(','));
      check(tag + ':shell:close-holds-still-across-tabs', drift('close').length === 0, drift('close').join(' | ') || 'still at ' + (seen[0].close || []).join(','));
      check(tag + ':shell:close-is-on-screen-on-every-tab', seen.every((s) => s.inView), seen.filter((s) => !s.inView).map((s) => s.tab).join(', ') || 'all');
      check(tag + ':shell:tab-rows-hold-equal-counts', new Set(seen[0].rows).size === 1, seen[0].rows.join('+'));
      // 대조군. 몸이 제 높이만큼 자라게 풀면 선반마다 닫기가 뛰어야 계기가 산다. 상점만 몸 높이가 선반마다 크게 다르다.
      if (panel.id === 'shop' && W === 1280) {
        const plant = await p.addStyleTag({ content: '#shop{overflow:auto!important}#shop .shopbody{flex:none!important;overflow:visible!important}' });
        const moved = [];
        for (const tab of tabs) {
          await p.evaluate((k) => document.querySelector('#shop .tab[data-tab="' + k + '"]').click(), tab); await p.waitForTimeout(160);
          moved.push({ tab, ...(await at()) });
        }
        const base = moved[0].close;
        check(tag + ':control:a-body-that-grows-moves-close', moved.some((s) => s.close && base && Math.abs(s.close[1] - base[1]) > TOL), moved.map((s) => s.tab + ' ' + (s.close || [])[1]).join(' '));
        await plant.evaluate((n) => n.remove());
      }
      await p.close();
    }
  }
} catch (e) { check('instrument:run-completed', false, String(e).slice(0, 300)); }
await b.close();
if (notes.length) console.log(notes.map((x) => '  ok   ' + x).join('\n'));
if (fails.length) console.log(fails.map((x) => '  FAIL ' + x).join('\n'));
console.log(fails.length ? 'shell FAIL ' + fails.length : 'shell PASS ' + notes.length);
process.exit(fails.length ? 1 : 0);
