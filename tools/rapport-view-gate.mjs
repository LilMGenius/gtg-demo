import { chromium } from 'playwright';
import { rapportTier, rapportGazeAid, rapportBoost } from '../web/src/state/rapport.mjs';

// 3단계/2단계/0단계를 한 화면에 같이 세운다. 15는 마지막 문턱, 8은 중간 문턱, 2는 문턱 미달
const FIX = { '0:0': 15, '0:2': 8, '0:3': 2 };
const URL = 'http://127.0.0.1:10310/web/index.html?seed=20';
const HEAD = '\uc544\ub294 \uc5bc\uad74';
const SUB = '\ub9d0 \uc11e\uc740 \ub9cc\ud07c \ud55c\ub208\uc744 \ub35c \ud310\ub2e4';
const RECORD = '\uc0c1\ub300 \uc804\uc801';
const EMPTY = '\uc544\uc9c1 \uc5bc\uad74\uc744 \ud2bc \uc0ac\ub78c\uc774 \uc5c6\ub2e4';

const fails = [];
const notes = [];
const check = (name, ok, detail) => { (ok ? notes : fails).push(name + ' ' + detail); };

setTimeout(() => { console.log('rapport-view FAIL watchdog'); process.exit(1); }, 150000).unref();

async function run(fixture) {
  const b = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe' });
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(URL, { waitUntil: 'load' });
    await p.click('#go', { force: true });
    // 저장은 첫 구 판정이 끝나야 써진다. 20초는 5구 한 세트가 도는 시간의 두 배
    let raw = null;
    for (let i = 0; i < 40; i++) {
      raw = await p.evaluate(() => localStorage.getItem('gtg.save.v1'));
      if (raw) break;
      await p.waitForTimeout(500);
    }
    if (!raw) throw new Error('save never appeared');
    const o = JSON.parse(raw);
    o.rapport = fixture;
    o.gear = o.gear || {};
    o.gear.city = 0; // 도시 0이어야 화면의 동네 이름이 고정된다
    await p.evaluate((s) => localStorage.setItem('gtg.save.v1', s), JSON.stringify(o));
    await p.reload({ waitUntil: 'load' });
    await p.click('#go', { force: true });
    await p.waitForTimeout(700); // 판정이 한 구도 돌기 전. 라포가 더 쌓이지 않는 창
    await p.evaluate(() => window.__freeze(true));
    await p.evaluate(() => window.__me(true));
    await p.waitForTimeout(400);
    const shot = await p.evaluate((a) => {
      const card = document.querySelector('#me .card');
      const kids = [...card.children];
      const bText = (n) => (n.querySelector('b') ? n.querySelector('b').textContent : '');
      const head = kids.findIndex((n) => bText(n) === a.HEAD);
      const rec = kids.findIndex((n) => bText(n) === a.RECORD);
      const slice = head < 0 ? [] : kids.slice(head + 1, rec < 0 ? kids.length : rec);
      const rows = slice.filter((n) => n.querySelector('b'));
      const dim = slice.filter((n) => n.className.includes('dim')).map((n) => n.textContent);
      const rect = (n) => { const r = n.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
      const read = () => {
        const cr = card.getBoundingClientRect();
        return { cardTop: Math.round(cr.top), cardBottom: Math.round(cr.bottom), rows: rows.map(rect) };
      };
      card.scrollTop = 0;
      const atTop = read();
      card.scrollTop = card.scrollHeight;
      const atBottom = read();
      return {
        headPresent: head >= 0,
        headSub: head >= 0 && kids[head].querySelector('i') ? kids[head].querySelector('i').textContent : '',
        rows: rows.map((n) => ({ b: n.querySelector('b').textContent, i: n.querySelector('i') ? n.querySelector('i').textContent : '' })),
        dim,
        scrollHeight: card.scrollHeight,
        clientHeight: card.clientHeight,
        atTop,
        atBottom
      };
    }, { HEAD, RECORD });
    const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('gtg.save.v1')).rapport);
    return { shot, kept, errs };
  } finally { await b.close(); }
}

const num = (s, head, tail) => {
  const i = s.indexOf(head);
  if (i < 0) return NaN;
  const rest = tail ? s.slice(i, s.indexOf(tail, i)) : s.slice(i);
  const m = rest.match(/-?\d+/);
  return m ? Number(m[0]) : NaN;
};

const main = await run(FIX);
const ctrl = await run({});

// 대조군: 같은 주입 경로, 라포만 비운다. 표본 0으로 통과하는 축을 막는다
check('ctrl:empty-rapport-note-only', ctrl.shot.headPresent && ctrl.shot.rows.length === 0 && ctrl.shot.dim.some((t) => t.includes(EMPTY)), 'rows=' + ctrl.shot.rows.length + ' dim=' + ctrl.shot.dim.length);
check('view:head-note-present', main.shot.headPresent && main.shot.headSub === SUB, 'head=' + main.shot.headPresent);

const keys = Object.keys(FIX).sort((x, y) => FIX[y] - FIX[x]);
check('view:row-count-matches-keys', main.shot.rows.length === keys.length, main.shot.rows.length + '/' + keys.length);
check('view:fixture-survived-injection', JSON.stringify(main.kept) === JSON.stringify(FIX), JSON.stringify(main.kept));

const counts = main.shot.rows.map((r) => num(r.i, '\ub9d0 \uc11e\uc740 \ud69f\uc218', '\ub2e8\uacc4'));
check('view:rows-descending', counts.every((n, i) => i === 0 || counts[i - 1] >= n), counts.join(','));

let mismatch = [];
keys.forEach((k, idx) => {
  const passer = Number(k.split(':')[1]);
  const row = main.shot.rows[idx];
  if (!row) { mismatch.push(k + ':missing'); return; }
  const aid = Math.round((1 - rapportGazeAid(FIX, 0, passer)) * 100);
  const fans = Math.round((rapportBoost(FIX, 0, passer) - 1) * 100);
  const tier = rapportTier(FIX, 0, passer);
  const gotAid = num(row.i, '\ud55c\ub208\ud314\uae30', '\uac10\uc18c');
  const gotFans = num(row.i, '\ud314\ub85c\uc6cc');
  const tierOk = tier === 0 ? row.i.includes('\uc5bc\uad74\ub9cc \uc775\uc5c8\ub2e4') : row.i.includes(String(tier) + '\ub2e8\uacc4');
  if (counts[idx] !== FIX[k] || gotAid !== aid || gotFans !== fans || !tierOk) {
    mismatch.push(k + ' screen=' + counts[idx] + '/' + gotAid + '/' + gotFans + ' calc=' + FIX[k] + '/' + aid + '/' + fans + ' tier=' + tier);
  }
});
check('view:numbers-match-judgment', mismatch.length === 0, mismatch.join(' | ') || 'all rows agree');

// 상수가 조용히 바뀌면 잡히도록 3단계 한 줄을 하드 앵커로 못 박는다
const top = main.shot.rows[0] ? main.shot.rows[0].i : '';
check('view:anchor-tier3-30pct-24pct', top.includes('30%') && top.includes('+24%'), top ? 'ok' : 'no row');

// 실측: scrollTop 0에서 세 줄 모두 카드 밑변 아래. 바닥까지 내리면 모두 카드 안
const belowFold = main.shot.atTop.rows.every((r) => r.top >= main.shot.atTop.cardBottom);
const inViewAfter = main.shot.atBottom.rows.every((r) => r.bottom <= main.shot.atBottom.cardBottom + 1 && r.top >= main.shot.atBottom.cardTop - 1);
check('scroll:rows-below-fold-until-scrolled', belowFold && inViewAfter, 'fold=' + belowFold + ' after=' + inViewAfter + ' h=' + main.shot.clientHeight + '/' + main.shot.scrollHeight);

const allErrs = main.errs.concat(ctrl.errs);
check('console:no-errors', allErrs.length === 0, allErrs.join(' | ') || 'clean');

for (const n of notes) console.log('  ok  ' + n);
for (const f of fails) console.log('  FAIL ' + f);
console.log('rapport-view ' + (fails.length ? 'FAIL ' : 'PASS ') + (notes.length + fails.length));
process.exitCode = fails.length ? 1 : 0;

