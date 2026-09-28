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
const PANELS = [{ id: 'shop', open: 'window.__shop(true)', tab: '.tab', key: 'tab', row: '.tabs' }, { id: 'me', open: 'window.__me(true)', tab: '.tab', key: 'tab', row: '.tabs' },
  { id: 'roster', open: 'window.__roster(true)', tab: '.kind', key: 'pos', row: '.kinds' },
  // 위키 분류도 탭이다. 시트가 가운데에 서면 본문 길이를 따라 분류 열이 뛰었다(1920x1080 이 게임 y261, 장비 y25).
  { id: 'wiki', open: 'window.__wiki(true)', tab: '.cats button', key: 'cat', row: '.cats' }];
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
  // 창과 창 사이. 닫기는 창마다가 아니라 게임에 한 자리다. 창을 바꿔도 닫기의 중심이 같고,
  // 그 중심을 누르면 닫기가 잡혀야 한다(굴린 내용이 그 위를 지나가지 않는다).
  const EVERY = ['gym', 'roster', 'gram', 'me', 'shop', 'wiki'];
  for (const [W, H] of [[1920, 1080], [1280, 720], [844, 390], [740, 360]]) {
    const p = await b.newPage({ viewport: { width: W, height: H } });
    await p.goto(BASE); await p.locator('#go').click({ force: true }); await clearDraw(p);
    const seen = [];
    const touch = [];
    for (const id of EVERY) {
      await p.evaluate((id) => window['__' + id](true), id); await p.waitForTimeout(400);
      // 구르는 창은 끝까지 굴린 자리에서도 잰다. 내용이 닫기를 덮는 것은 굴린 뒤다.
      await p.evaluate((id) => { for (const e of document.querySelectorAll('#' + id + ', #' + id + ' *')) if (e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight; }, id);
      await p.waitForTimeout(200);
      // 창 안의 전환 칸도 손가락 바닥을 지킨다. 탭이 아닌 전환(이적시장 키퍼/키커)과 위키 분류다.
      const SWITCHES = { shop: '.pull-bar .roles button', wiki: '.cats button' };
      if (H < 520 && SWITCHES[id]) touch.push(await p.evaluate(([id, sel]) => {
        const b = [...document.querySelectorAll('#' + id + ' ' + sel)].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
        return { id, n: b.length, small: b.length ? Math.round(Math.min(...b.map((r) => Math.min(r.width, r.height)))) : 0 };
      }, [id, SWITCHES[id]]));
      seen.push(await p.evaluate((id) => {
        const c = document.querySelector('#' + id + ' > .close');
        if (!c) return { id, none: true };
        const r = c.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        return { id, c: [Math.round(cx), Math.round(cy)], hit: hit === c || c.contains(hit), inView: r.top >= 0 && r.bottom <= innerHeight };
      }, id));
      await p.evaluate((id) => window['__' + id](false), id); await p.waitForTimeout(200);
    }
    const tag = W + 'x' + H + ':every';
    const base = seen.find((s) => s.c);
    check(tag + ':instrument:every-panel-has-a-close', seen.every((s) => !s.none), seen.filter((s) => s.none).map((s) => s.id).join(', ') || EVERY.length + ' panels');
    check(tag + ':shell:close-stands-in-one-place-across-panels', seen.every((s) => s.c && Math.abs(s.c[0] - base.c[0]) <= TOL && Math.abs(s.c[1] - base.c[1]) <= TOL), seen.map((s) => s.id + ' ' + (s.c || []).join(',')).join(' | '));
    check(tag + ':shell:close-is-on-top-after-the-roll', seen.every((s) => s.hit && s.inView), seen.filter((s) => !s.hit || !s.inView).map((s) => s.id).join(', ') || 'all');
    if (H < 520) check(tag + ':shell:panel-switches-clear-the-touch-floor', touch.length === 2 && touch.every((t) => t.n > 0 && t.small >= 44), touch.map((t) => t.id + ' ' + t.n + ' smallest ' + t.small + 'px').join(', '));
    if (W === 740) {
      const plant = await p.addStyleTag({ content: '#shop .pull-bar .roles button{min-height:0!important}' });
      await p.evaluate(() => window.__shop(true)); await p.waitForTimeout(300);
      const low = await p.evaluate(() => Math.round(Math.min(...[...document.querySelectorAll('#shop .pull-bar .roles button')].map((e) => e.getBoundingClientRect().height))));
      await p.evaluate(() => window.__shop(false)); await plant.evaluate((n) => n.remove());
      check(tag + ':control:a-switch-without-its-floor-falls-under-44', low < 44, 'planted switch ' + low + 'px');
    }
    // 대조군. 한 창의 닫기를 흐름으로 되돌리면 그 창만 자리가 달라져 위 축이 빨개져야 계기가 산다.
    if (W === 1280) {
      const plant = await p.addStyleTag({ content: '#gym > .close{position:static!important;translate:none!important}' });
      await p.evaluate(() => window.__gym(true)); await p.waitForTimeout(400);
      const moved = await p.evaluate(() => { const r = document.querySelector('#gym > .close').getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; });
      await p.evaluate(() => window.__gym(false)); await plant.evaluate((n) => n.remove());
      check(tag + ':control:a-close-back-in-the-flow-moves', Math.abs(moved[1] - base.c[1]) > TOL, 'planted gym ' + moved.join(',') + ' against ' + base.c.join(','));
    }
    await p.close();
  }
  for (const [W, H] of SIZES) {
    for (const panel of PANELS) {
      const p = await b.newPage({ viewport: { width: W, height: H } });
      await p.goto(BASE); await p.locator('#go').click({ force: true }); await clearDraw(p);
      await p.evaluate(panel.open); await p.waitForTimeout(400);
      const tabs = await p.evaluate((pn) => [...document.querySelectorAll('#' + pn.id + ' ' + pn.tab)].map((e) => e.dataset[pn.key]), panel);
      const at = () => p.evaluate((pn) => {
        const id = pn.id;
        const r = (s) => { const e = document.querySelector('#' + id + ' ' + s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width)]; };
        const c = document.querySelector('#' + id + ' > .close');
        const cb = c && c.getBoundingClientRect();
        // 줄마다 탭 수. 흘려 접으면 끝의 한 칸만 다음 줄로 떨어진다. 줄은 윗변으로 가른다.
        const rows = {};
        for (const e of document.querySelectorAll('#' + pn.id + ' ' + pn.tab)) { const y = Math.round(e.getBoundingClientRect().top / 8); rows[y] = (rows[y] || 0) + 1; }
        // 탭 하나하나의 왼끝과 가장 작은 변. 줄 상자가 그대로여도 안의 탭이 옆으로 뛰면 손이 헛짚는다.
        const each = [...document.querySelectorAll('#' + pn.id + ' ' + pn.tab)].map((e) => e.getBoundingClientRect());
        return { tabs: r(pn.row), close: r('> .close'), inView: Boolean(cb && cb.top >= 0 && cb.bottom <= innerHeight), rows: Object.values(rows),
          lefts: each.map((b) => Math.round(b.left)), small: Math.round(Math.min(...each.map((b) => Math.min(b.width, b.height)))) };
      }, panel);
      const seen = [];
      for (const tab of tabs) {
        await p.evaluate(([pn, k]) => document.querySelector('#' + pn.id + ' ' + pn.tab + '[data-' + pn.key + '="' + k + '"]').click(), [panel, tab]);
        await p.waitForTimeout(160);
        seen.push({ tab, ...(await at()) });
      }
      const drift = (key) => seen.filter((s) => s[key] && seen[0][key] && s[key].some((v, i) => Math.abs(v - seen[0][key][i]) > TOL)).map((s) => s.tab + ' ' + s[key].join(','));
      const tag = W + 'x' + H + ':' + panel.id;
      check(tag + ':instrument:the-panel-has-tabs', tabs.length > 1, tabs.length + ' tabs');
      check(tag + ':shell:the-tab-row-holds-still-across-tabs', drift('tabs').length === 0, drift('tabs').join(' | ') || 'still at ' + (seen[0].tabs || []).join(','));
      check(tag + ':shell:close-holds-still-across-tabs', drift('close').length === 0, drift('close').join(' | ') || 'still at ' + (seen[0].close || []).join(','));
      check(tag + ':shell:close-is-on-screen-on-every-tab', seen.every((s) => s.inView), seen.filter((s) => !s.inView).map((s) => s.tab).join(', ') || 'all');
      check(tag + ':shell:each-tab-holds-its-place-across-tabs', drift('lefts').length === 0, drift('lefts').slice(0, 2).join(' | ') || 'still');
      // 손가락 하나가 닿는 44px 바닥. 세로가 짧은 폭만 잰다. 넓은 화면의 탭은 마우스 표적이라 이 바닥의 대상이 아니다.
      if (H < 520) check(tag + ':shell:every-tab-clears-the-touch-floor', seen.every((s) => s.small >= 44), 'smallest side ' + Math.min(...seen.map((s) => s.small)) + 'px');
      // 대조군. 지금 탭에만 이름을 다시 달면 그 탭이 넓어져 뒤의 탭이 선반마다 옆으로 뛰어야 한다.
      if (H < 520 && panel.id === 'shop') {
        const plant = await p.addStyleTag({ content: '#shop .tab[aria-current] span{position:static!important;width:auto!important;height:auto!important;clip-path:none!important}' });
        const moved = [];
        for (const tab of tabs.slice(0, 4)) {
          await p.evaluate(([pn, k]) => document.querySelector('#' + pn.id + ' ' + pn.tab + '[data-' + pn.key + '="' + k + '"]').click(), [panel, tab]);
          await p.waitForTimeout(120); moved.push({ tab, ...(await at()) });
        }
        await plant.evaluate((n) => n.remove());
        const jumps = moved.filter((s) => s.lefts.some((v, i) => Math.abs(v - moved[0].lefts[i]) > TOL)).length;
        check(tag + ':control:a-named-current-tab-makes-the-others-jump', jumps > 0, jumps + ' of ' + moved.length + ' selections moved the row');
      }
      // 몸을 끝까지 굴려도 탭 줄은 제자리다. 창 전체가 구르면 탭이 내용과 같이 화면 밖으로 밀린다.
      const rollAll = () => p.evaluate((id) => { for (const e of document.querySelectorAll('#' + id + ', #' + id + ' *')) if (e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight; }, panel.id);
      const before = (await at()).tabs;
      await rollAll(); await p.waitForTimeout(200);
      const after = (await at()).tabs;
      const stays = (a, b) => Boolean(a && b) && a.every((v, i) => Math.abs(v - b[i]) <= TOL);
      check(tag + ':shell:the-tab-row-stays-when-the-body-rolls', stays(before, after), (before || []).join(',') + ' -> ' + (after || []).join(','));
      if (panel.id === 'roster' && W === 1280) {
        await p.evaluate(() => { for (const e of document.querySelectorAll('#roster, #roster *')) e.scrollTop = 0; });
        const plant = await p.addStyleTag({ content: '#roster{overflow:auto!important}#roster > .rosterbody{flex:none!important;overflow:visible!important}' });
        await p.waitForTimeout(150);
        const pb = (await at()).tabs; await rollAll(); await p.waitForTimeout(200); const pa = (await at()).tabs;
        await plant.evaluate((n) => n.remove());
        check(tag + ':control:a-panel-that-rolls-whole-moves-the-tab-row', !stays(pb, pa), (pb || []).join(',') + ' -> ' + (pa || []).join(','));
      }
      check(tag + ':shell:tab-rows-hold-equal-counts', new Set(seen[0].rows).size === 1, seen[0].rows.join('+'));
      // 대조군. 몸이 제 높이만큼 자라게 풀면 선반마다 닫기가 뛰어야 계기가 산다. 상점만 몸 높이가 선반마다 크게 다르다.
      if (panel.id === 'shop' && W === 1280) {
        const plant = await p.addStyleTag({ content: '#shop{overflow:auto!important}#shop .shopbody{flex:none!important;overflow:visible!important}#shop > .close{position:static!important;translate:none!important}' });
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
  /* 창 안의 갈래 탭은 한 벌이다. 켜진 탭의 바탕과 글자색과 높이를 네 창에서 읽어 한 모양인지 본다.
     위키만 노랑 바탕에 40px이었을 때 이 자가 없어 아무도 못 봤다. 대조군은 위키 켜진 탭을 옛 노랑으로 되돌린다. */
  const TABS = [['shop', '.tab[aria-current="true"]'], ['me', '.tab[aria-current="true"]'], ['roster', '.kind[aria-selected="true"]'], ['wiki', '.cats button[aria-current="true"]']];
  const tp = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await tp.goto(BASE); await tp.locator('#go').click({ force: true }); await clearDraw(tp);
  const lit = async () => {
    const out = [];
    for (const [id, sel] of TABS) {
      await tp.evaluate((id) => window['__' + id](true), id); await tp.waitForTimeout(300);
      out.push(await tp.evaluate(([id, sel]) => {
        const e = document.querySelector('#' + id + ' ' + sel);
        if (!e) return { id, none: true };
        const s = getComputedStyle(e);
        return { id, look: s.backgroundColor + ' / ' + s.color, h: Math.round(e.getBoundingClientRect().height) };
      }, [id, sel]));
      await tp.evaluate((id) => window['__' + id](false), id); await tp.waitForTimeout(150);
    }
    return out;
  };
  const tabsNow = await lit();
  check('shell:instrument:every-panel-shows-a-lit-tab', tabsNow.every((s) => !s.none), tabsNow.filter((s) => s.none).map((s) => s.id).join(', ') || TABS.length + ' panels');
  check('shell:a-lit-tab-looks-the-same-in-every-panel', new Set(tabsNow.map((s) => s.look)).size === 1 && tabsNow.every((s) => s.h >= 44),
    tabsNow.map((s) => s.id + ' ' + s.look + ' ' + s.h + 'px').join(' | '));
  const oldWiki = await tp.addStyleTag({ content: '#wiki .cats button[aria-current="true"]{background:#ffd83d!important;color:#12160e!important}' });
  const planted = await lit();
  await oldWiki.evaluate((n) => n.remove());
  check('shell:control:the-old-yellow-wiki-tab-is-caught', new Set(planted.map((s) => s.look)).size > 1, planted.map((s) => s.id + ' ' + s.look).join(' | '));
  await tp.close();
  /* 빈 목록 위 제목. 빈 칸은 비워 두거나 아이콘 하나이고(gamedev 창 절), 그 위에 제목이 서면 빈 상자 위 라벨이 된다.
     빈 목록이 생기는 것은 새 저장이라 프리셋 없이 열고, 탭 있는 창은 탭마다 잰다. 비었다는 것은 글자도 그림도
     없는 상자다. h5는 뒤가 없거나 빈 상자면 걸리고, 이름과 값이 한 줄에 선 .note 줄은 마지막 줄일 수 있으므로
     뒤에 빈 상자가 있을 때만 걸린다(실측: 내 정보 히든 줄 '프로의식 적당'을 제목으로 잘못 셌다).
     대조군은 내 정보에 제목과 빈 줄을 심는다. */
  const ep = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await ep.goto(BASE.split('&preset=')[0]); await ep.locator('#go').click({ force: true }); await clearDraw(ep);
  const PANES = { gym: null, roster: '.kind[data-pos]', gram: null, me: '.tab[data-tab]', wiki: null };
  const bare = async () => {
    const out = [];
    for (const [id, tabSel] of Object.entries(PANES)) {
      await ep.evaluate((id) => window['__' + id](true), id); await ep.waitForTimeout(300);
      const keys = tabSel ? await ep.evaluate(([id, s]) => [...document.querySelectorAll('#' + id + ' ' + s)].map((e) => e.dataset.pos || e.dataset.tab), [id, tabSel]) : [null];
      for (const k of keys) {
        if (k) { await ep.evaluate(([id, s, k]) => [...document.querySelectorAll('#' + id + ' ' + s)].find((e) => (e.dataset.pos || e.dataset.tab) === k).click(), [id, tabSel, k]); await ep.waitForTimeout(200); }
        out.push(...(await ep.evaluate(([id, k]) => [...document.querySelectorAll('#' + id + ' h5, #' + id + ' .note:has(> b)')]
          .filter((h) => h.getClientRects().length)
          .filter((h) => { const n = h.nextElementSibling; const empty = (e) => !e.textContent.trim() && !e.querySelector('img,svg,canvas'); return h.tagName === 'H5' ? (!n || empty(n)) : Boolean(n) && empty(n); })
          .map((h) => id + (k ? ':' + k : '') + ' "' + h.textContent.trim().slice(0, 12) + '"'), [id, k])));
      }
      await ep.evaluate((id) => window['__' + id](false), id); await ep.waitForTimeout(150);
    }
    return out;
  };
  const emptyHeads = await bare();
  check('shell:no-heading-stands-over-an-empty-list', emptyHeads.length === 0, emptyHeads.join(', ') || Object.keys(PANES).length + ' panels on a fresh save');
  await ep.evaluate(() => { window.__me(true); const pane = document.querySelector('#me .pane') || document.querySelector('#me'); pane.insertAdjacentHTML('beforeend', '<h5>심은 제목</h5><div class="row"></div>'); });
  const plantedHead = await ep.evaluate(() => [...document.querySelectorAll('#me h5')].filter((h) => { const n = h.nextElementSibling; return !n || (!n.children.length && !n.textContent.trim()); }).length);
  await ep.evaluate(() => window.__me(false));
  check('shell:control:a-planted-heading-over-an-empty-row-is-caught', plantedHead > 0, plantedHead + ' planted');
  await ep.close();
  /* 닫기가 창 내용을 덮는가. 짧은 화면의 닫기가 재화 띠 아래 귀에 섰을 때 만남 첫 선택지와 훈련장 판단력 칸을 덮었는데,
     위 축은 닫기가 눌리는지만 물어 초록이었다. 닫기 상자와 겹치는 창 안의 잎 요소(자식 요소가 없는 글자나 그림, 버튼)를 센다.
     만남은 창 여섯과 따로 열리므로 여기서 같이 연다. 대조군은 닫기를 옛 자리(띠 아래)로 되돌린다. */
  const cover = async (pg) => pg.evaluate(() => {
    const hits = [];
    for (const id of ['gym', 'roster', 'gram', 'me', 'shop', 'wiki', 'date']) {
      if (id === 'date') window.__date(0, 0); else window['__' + id](true);
      const box = document.getElementById(id);
      const c = box.querySelector(':scope > .close');
      const r = c.getBoundingClientRect();
      for (const e of box.querySelectorAll('*')) {
        if (e === c || c.contains(e) || e.contains(c)) continue;
        const leaf = e.matches('button, img, svg, canvas') || (!e.children.length && e.textContent.trim());
        if (!leaf || !e.getClientRects().length || getComputedStyle(e).visibility === 'hidden') continue;
        /* 보이는 몫만 잰다. 구르는 상자 밖으로 잘린 줄은 닫기 밑에 있어도 화면에 없다. 조상마다 잘림 상자(테두리 안)를 겹친다. */
        const q = e.getBoundingClientRect();
        let [l, tp, rt, bt] = [q.left, q.top, q.right, q.bottom];
        for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
          if (getComputedStyle(a).overflowY === 'visible' && getComputedStyle(a).overflowX === 'visible') continue;
          const ab = a.getBoundingClientRect();
          l = Math.max(l, ab.left + a.clientLeft); tp = Math.max(tp, ab.top + a.clientTop);
          rt = Math.min(rt, ab.left + a.clientLeft + a.clientWidth); bt = Math.min(bt, ab.top + a.clientTop + a.clientHeight);
        }
        if (rt - l > 1 && bt - tp > 1 && l < r.right - 1 && rt > r.left + 1 && tp < r.bottom - 1 && bt > r.top + 1) { hits.push(id + ' ' + (e.className || e.tagName).toString().slice(0, 20)); break; }
      }
      if (id === 'date') window.__date(); else window['__' + id](false);
    }
    return hits;
  });
  for (const [W, H] of [[1280, 720], [844, 390], [740, 360]]) {
    const cp = await b.newPage({ viewport: { width: W, height: H } });
    await cp.goto(BASE); await cp.locator('#go').click({ force: true }); await clearDraw(cp);
    const hits = await cover(cp);
    check(W + 'x' + H + ':shell:close-covers-nothing-in-its-panel', hits.length === 0, hits.join(', ') || '7 panels clear');
    /* 탭 줄은 창끼리도 한 줄에 선다. 창 안에서 탭을 바꿀 때만 재면, 창마다 제 머리 아래에 둔 탭이 74, 87, 98, 144px으로
       갈려도 초록이었다(740x360). 대조군은 선수단 탭 줄을 제목 아래로 되돌린다. */
    const ROWS = [['shop', '.tabs'], ['roster', '.kinds'], ['me', '.tabs'], ['wiki', '.cats']];
    const tops = async () => { const out = []; for (const [id, row] of ROWS) { await cp.evaluate((i) => window['__' + i](true), id); await cp.waitForTimeout(250); out.push(id + ' ' + (await cp.evaluate(([i, r]) => Math.round(document.querySelector('#' + i + ' ' + r).getBoundingClientRect().top), [id, row]))); await cp.evaluate((i) => window['__' + i](false), id); await cp.waitForTimeout(120); } return out; };
    const same = (list) => new Set(list.map((s) => Number(s.split(' ')[1]))).size === 1;
    const rowTops = await tops();
    check(W + 'x' + H + ':shell:tab-rows-share-one-top-across-panels', same(rowTops), rowTops.join(', '));
    if (W === 740) {
      const plant = await cp.addStyleTag({ content: '#roster > .ptitle{position:static;translate:none;order:1}#roster > .kinds{order:2}#roster > .rosterbody{order:3}' });
      const planted = await tops();
      await plant.evaluate((n) => n.remove());
      check(W + 'x' + H + ':control:a-tab-row-under-its-title-is-caught', !same(planted), planted.join(', '));
    }
    if (W === 740) {
      await cp.addStyleTag({ content: ':is(#gym,#roster,#gram,#me,#shop,#wiki,#date) > .close{top:calc(var(--strip-b) + var(--gap-2))!important}' });
      const old = await cover(cp);
      check(W + 'x' + H + ':control:the-old-close-under-the-strip-is-caught', old.length > 0, old.join(', ') || 'nothing caught');
    }
    await cp.close();
  }
} catch (e) { check('instrument:run-completed', false, String(e).slice(0, 300)); }
await b.close();
if (notes.length) console.log(notes.map((x) => '  ok   ' + x).join('\n'));
if (fails.length) console.log(fails.map((x) => '  FAIL ' + x).join('\n'));
console.log(fails.length ? 'shell FAIL ' + fails.length : 'shell PASS ' + notes.length);
process.exit(fails.length ? 1 : 0);
