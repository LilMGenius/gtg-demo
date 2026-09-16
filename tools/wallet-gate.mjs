import { chromium } from "playwright";
import { execFileSync } from 'node:child_process';
import { CASH_RATE, cashPrice } from '../web/src/state/wallet.mjs';

// 지갑 게이트. 재화가 두 갈래로 갈려 있는가.
// 축의 출처는 전부 파운더 선언이다. 시간으로 버는 재화와 결제로만 얻는 재화를 구분한다.
// 유추로 세운 축은 여기에 없다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html?seed=20";
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

async function cashLane(ctx, parent = false) {
  const page = await ctx.newPage();
  if (parent) {
    // Existing wiki-gate served-parent control; date and wiki import the new wallet API too.
    for (const file of ['main.mjs', 'state/wallet.mjs', 'state/date.mjs', 'ui/wiki.mjs']) {
      const body = execFileSync('git', ['show', '258b2a4:web/src/' + file], { encoding: 'utf8' });
      await page.route('**/src/' + file, route => route.fulfill({ contentType: 'text/javascript', body }));
    }
  }
  try {
    await page.goto(URL + '&preset=rich,veteran');
    if (parent) {
      const booted = await page.evaluate(() => typeof window.__wallet === 'function');
      check('instrument:the-parent-fixture-boots', booted, String(booted));
      if (!booted) return {};
    }
    await page.click('#go', { force: true });
    await page.evaluate(() => { window.__wallet().cash = 8000; window.__shop(true); });
    const tabs = await page.locator('#shop .tab').evaluateAll(es => es.map(e => e.dataset.tab));
    const rows = [];
    for (const tab of tabs) {
      await page.locator('#shop .tab[data-tab="' + tab + '"]').click({ force: true });
      rows.push(await page.locator('#shop .price').evaluateAll(es => es.map(e => ({ coin: +e.dataset.coin, cash: +e.dataset.cash, token: +(e.querySelector('.cash')?.dataset.cash) }))));
    }
    const table = list => list.length === tabs.length && list.every(es => es.length > 0 && es.every(e => e.cash === cashPrice(e.coin) && e.token === e.cash));
    const result = { 'cash:one-conversion-table': cashPrice(150) === Math.ceil(150 / CASH_RATE) && table(rows) };
    await page.locator('#shop .tab[data-tab="glove"]').click({ force: true });
    const planted = await page.evaluate(() => {
      const e = document.querySelector('#shop .price'); if (!e) return [];
      e.dataset.cash = String(+e.dataset.cash + 1);
      return [...document.querySelectorAll('#shop .price')].map(e => ({ coin: +e.dataset.coin, cash: +e.dataset.cash, token: +(e.querySelector('.cash')?.dataset.cash) }));
    });
    if (!parent) {
      const red = !table(rows.map((es, i) => i === 0 ? planted : es));
      console.log('CONTROL planted-rate cash:one-conversion-table ' + (red ? 'RED' : 'GREEN'));
      check('control:a-planted-rate-mismatch-is-caught', red && planted.length > 0, JSON.stringify(planted[0]));
    }
    await page.evaluate(() => window.__shop(true));
    result['cash:gold-is-paid-first'] = await page.evaluate(() => {
      const w=window.__wallet(), b=document.querySelector('#shop .buy[data-rank="1"]');
      const c=b.querySelector('.price'); if(!c) return false;
      const gold=+c.dataset.coin, coin=w.coin, cash=w.cash; b.click();
      return w.coin===coin-gold && w.cash===cash;
    });
    // Same drain path as price-gate: mutate the exposed wallet, then re-render.
    result['cash:cash-pays-when-gold-is-short'] = await page.evaluate(() => {
      const w=window.__wallet(); w.coin=0; window.__shop(true);
      const b=document.querySelector('#shop .buy[data-rank="3"]'), c=b.querySelector('.price'); if(!c || b.disabled) return false;
      const cash=w.cash, cost=+c.dataset.cash; b.click(); return w.coin===0 && w.cash===cash-cost && window.__gear().grip===3;
    });
    result['cash:both-short-disables'] = await page.evaluate(() => {
      const w=window.__wallet(); w.coin=0; w.cash=0;
      document.querySelector('#shop .tab[data-tab="boot"]').click();
      const b=document.querySelector('#shop .buy[data-rank="3"]'), g=b.querySelector('.px:not(.cash)'), c=b.querySelector('.cash');
      return b.disabled && g?.classList.contains('bad-price') && c?.classList.contains('bad-cash') && getComputedStyle(g).color===getComputedStyle(c).color;
    });
    return result;
  } finally { await page.close(); }
}

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  await p.goto(URL, { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "load" });
  await p.waitForTimeout(1200);

  // 대조군. 저장을 지우면 두 갈래 모두 0에서 시작한다.
  // 한 갈래만 0이면 나머지 한 갈래는 이전 판의 잔고를 끌고 온 것이다.
  const start = await p.evaluate(() => window.__wallet());
  check("control:cleared-save-starts-both-at-zero", start.coin === 0 && start.cash === 0, JSON.stringify(start));

  await p.click("#go", { force: true });
  await p.waitForTimeout(1400);
  // 네 구면 결과가 갈리기에 충분하고, 한 세트 안에서 끝나 재시작 대기와 섞이지 않는다.
  for (let i = 0; i < 4; i++) { await p.keyboard.press(i % 2 ? "ArrowRight" : "ArrowLeft"); await p.waitForTimeout(3200); }
  await p.waitForTimeout(2000);

  const played = await p.evaluate(() => window.__wallet());
  check("coin:play-grants-coin", played.coin > 0, JSON.stringify(played));
  // 이 랩의 산출물은 캐시를 올리는 경로가 없다는 것이다. 플레이로 캐시가 오르면 두 갈래가 한 갈래다.
  check("cash:play-never-grants-cash", played.cash === 0, String(played.cash));
  // 골드가 선언한 단가로만 들어왔는가. 단가는 실점 4와 세이브 12~30이고 전부 짝수이므로,
  // 다른 경로가 잔고를 건드리면 나머지가 남는다. 굴러간 구의 수를 몰라도 서는 축이다.
  // 4에서 2로 내린 것은 문턱 인하가 아니라 선언이 단가 집합을 넓혔기 때문이다.
  // 정확한 값 검증은 reward-gate.mjs가 가져간다.
  check("coin:gain-is-a-sum-of-the-declared-units", played.coin % 2 === 0, String(played.coin));

  // 두 갈래가 각각 살아남는가. 캐시는 결제 경로가 없으니 손으로 넣어 확인한다.
  await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem(window.__saveKey()));
    s.wallet.cash = 7;
    localStorage.setItem(window.__saveKey(), JSON.stringify(s));
  });
  await p.reload({ waitUntil: "load" });
  await p.waitForTimeout(1200);
  const back = await p.evaluate(() => window.__wallet());
  check("save:both-tracks-survive-reload", back.coin === played.coin && back.cash === 7, JSON.stringify(back));

  const shown = await p.evaluate(() => document.getElementById("purse").textContent);
  check("hud:purse-shows-both-tracks", shown.includes(String(back.coin)) && shown.includes("7"), shown);
  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");

  const lane = await cashLane(ctx);
  for (const [axis, ok] of Object.entries(lane)) check(axis, ok, String(ok));
  const parentContext = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const parent = await cashLane(parentContext, true);
  for (const [axis, ok] of Object.entries(parent)) {
    console.log('CONTROL served-parent 258b2a4 ' + axis + ' ' + (ok ? 'GREEN' : 'RED'));
    check('control:parent-reddens-' + axis, !ok, String(ok));
  }
  await parentContext.close();
  console.log(notes.map((s) => "  ok   " + s).join("\n"));
  if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
  console.log(fails.length ? "wallet FAIL " + fails.length : "wallet PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
