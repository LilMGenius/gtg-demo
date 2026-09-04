import { chromium } from 'playwright';
import { rapportTier, rapportGazeAid, rapportBoost } from '../web/src/state/rapport.mjs';

// 3단계/2단계/0단계를 한 화면에 같이 세운다. 15는 마지막 문턱, 8은 중간 문턱, 2는 문턱 미달
const FIX = { '0:0': 15, '0:2': 8, '0:3': 2 };
const URL = 'http://127.0.0.1:10310/web/index.html?seed=20';
const HEAD = '아는 얼굴';
const SUB = '말 섞은 만큼 한눈을 덜 판다';
const RECORD = '상대 전적';
const EMPTY = '아직 얼굴을 튼 사람이 없다';

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
    // 아는 얼굴은 내 정보의 제 칸에 있다. 칸을 안 열면 이 자가 능력치 격자를 세게 된다.
    await p.click('#me .tab[data-tab="face"]', { force: true });
    await p.waitForTimeout(400);
    const shot = await p.evaluate((a) => {
      const card = document.querySelector('#me .pane');
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
      // 한 위치에서 세 줄이 동시에 보이는지는 줄 높이가 늘면 깨지는 우연이다.
      // 축이 재려던 것은 도달 가능성이므로 줄마다 따로 불러 그때 카드 안에 있는지 본다.
      const reach = rows.map((n) => {
        n.scrollIntoView({ block: 'center' });
        const cr = card.getBoundingClientRect();
        const r = n.getBoundingClientRect();
        return r.top >= cr.top - 1 && r.bottom <= cr.bottom + 1;
      });
      card.scrollTop = 0;
      const atBottom = read();
      return {
        headPresent: head >= 0,
        headSub: head >= 0 && kids[head].querySelector('i') ? kids[head].querySelector('i').textContent : '',
        rows: rows.map((n) => ({ b: n.querySelector('b').textContent, i: n.querySelector('i') ? n.querySelector('i').textContent : '' })),
        dim,
        scrollHeight: card.scrollHeight,
        clientHeight: card.clientHeight,
        reach,
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

const counts = main.shot.rows.map((r) => num(r.i, '말 섞은 횟수', '단계'));
check('view:rows-descending', counts.every((n, i) => i === 0 || counts[i - 1] >= n), counts.join(','));

let mismatch = [];
keys.forEach((k, idx) => {
  const passer = Number(k.split(':')[1]);
  const row = main.shot.rows[idx];
  if (!row) { mismatch.push(k + ':missing'); return; }
  const aid = Math.round((1 - rapportGazeAid(FIX, 0, passer)) * 100);
  const fans = Math.round((rapportBoost(FIX, 0, passer) - 1) * 100);
  const tier = rapportTier(FIX, 0, passer);
  const gotAid = num(row.i, '한눈팔기', '감소');
  const gotFans = num(row.i, '팔로워');
  const tierOk = tier === 0 ? row.i.includes('얼굴만 익었다') : row.i.includes(String(tier) + '단계');
  if (counts[idx] !== FIX[k] || gotAid !== aid || gotFans !== fans || !tierOk) {
    mismatch.push(k + ' screen=' + counts[idx] + '/' + gotAid + '/' + gotFans + ' calc=' + FIX[k] + '/' + aid + '/' + fans + ' tier=' + tier);
  }
});
check('view:numbers-match-judgment', mismatch.length === 0, mismatch.join(' | ') || 'all rows agree');

// 상수가 조용히 바뀌면 잡히도록 3단계 한 줄을 하드 앵커로 못 박는다
const top = main.shot.rows[0] ? main.shot.rows[0].i : '';
check('view:anchor-tier3-30pct-24pct', top.includes('30%') && top.includes('+24%'), top ? 'ok' : 'no row');

/* 줄에 닿을 수 있는가. 옛 화면은 세 줄이 전부 접힌 자리 아래에 있었고 그때는 접힘 자체가 조건이었다.
   칸이 갈리면서 아는 얼굴은 제 칸을 통째로 쓰므로 첫 줄부터 보이는 것이 정상이다.
   그래서 접힘은 조건이 아니라 상태로 적고, 묻는 것은 하나로 좁힌다. 모든 줄이 결국 칸 안에 들어오는가. */
const belowFold = main.shot.atTop.rows.filter((r) => r.top >= main.shot.atTop.cardBottom).length;
const inViewAfter = main.shot.reach.every(Boolean);
check('scroll:every-row-can-be-reached', inViewAfter,
  belowFold + ' of ' + main.shot.atTop.rows.length + ' start below the fold, all reachable ' + inViewAfter
  + ' h=' + main.shot.clientHeight + '/' + main.shot.scrollHeight);

const allErrs = main.errs.concat(ctrl.errs);
check('console:no-errors', allErrs.length === 0, allErrs.join(' | ') || 'clean');

for (const n of notes) console.log('  ok  ' + n);
for (const f of fails) console.log('  FAIL ' + f);
console.log('rapport-view ' + (fails.length ? 'FAIL ' : 'PASS ') + (notes.length + fails.length));
process.exitCode = fails.length ? 1 : 0;
