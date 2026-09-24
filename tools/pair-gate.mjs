import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SHELF_WORDS } from '../web/src/state/shelf.mjs';
import { BOTS } from '../web/src/state/bot.mjs';
import { BUFFS } from '../web/src/state/buff.mjs';

// spec/condition 게이트의 실제 상점과 저장 훅을 재사용한다. 카드의 짝 배치만 별도로 잰다.
const BASE = 'http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran';
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
// G3 수락 기준의 데스크톱과 가로 휴대폰 두 폭이다.
const VIEWS = [[1280, 720], [844, 390], [740, 360]];
// G3가 요구한 양 끝 화면의 네 선반을 직접 검토할 그림으로 남긴다.
const SHOTS = new Set(['glove', 'boot', 'bot', 'buff']);
// 카드 회전과 소수 픽셀 반올림 오차만 허용하는 수락 기준이다.
const PIXEL = 1;
// 이름과 값의 윗변은 한 줄 높이의 절반 안에 있어야 같은 줄이다.
const HALF_LINE = 0.5;
// 기존 spec 게이트와 같은 전체 실행 상한이다.
const WATCHDOG_MS = 150000;
// 썸네일과 패널 전환이 완료되는 condition 게이트의 관측 대기값이다.
const SETTLE_MS = 1300;
// JPEG는 화면 검토용으로 기존 condition 게이트와 같은 품질을 쓴다.
const JPEG_QUALITY = 85;
const out = new URL('../.omo/evidence/g3/', import.meta.url);
mkdirSync(out, { recursive: true });
const results = [];
const measurements = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log((pass ? 'PASS ' : 'FAIL ') + name + ' ' + JSON.stringify(detail));
}

// 정상 행과 심은 옛 문장을 같은 자로 잰다. 빈 모집단과 사라진 값도 실패다.
function measure({ pixel, halfLine }) {
  return [...document.querySelectorAll('#shop .card.gear')].map(card => {
    const cardBox = card.getBoundingClientRect();
    const rows = [...card.querySelectorAll('.effect-row')].map(row => {
      const name = row.querySelector('.effect-name');
      const value = row.querySelector('.effect-value');
      if (!name || !value) return { pass: false, reason: '짝 누락' };
      const n = name.getBoundingClientRect(), v = value.getBoundingClientRect(), r = row.getBoundingClientRect();
      const line = parseFloat(getComputedStyle(row).lineHeight);
      const style = getComputedStyle(name);
      const top = Math.abs(n.top - v.top);
      const sameLine = top <= line * halfLine;
      const fits = row.scrollWidth <= row.clientWidth + pixel && r.left >= cardBox.left - pixel && r.right <= cardBox.right + pixel;
      const full = row.title === name.textContent + ' ' + value.textContent;
      const ellipsis = name.scrollWidth <= name.clientWidth + pixel || (style.textOverflow === 'ellipsis' && style.overflow === 'hidden');
      return { name: name.textContent, value: value.textContent, top, line, width: row.clientWidth, nameWidth: name.clientWidth, nameScroll: name.scrollWidth,
        scroll: row.scrollWidth, sameLine, fits, full, ellipsis,
        pass: n.width > 0 && v.width > 0 && sameLine && fits && full && ellipsis };
    });
    return { rank: card.dataset.at, rows };
  });
}

const timer = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, WATCHDOG_MS);
timer.unref();
const browser = await chromium.launch({ executablePath: EXE });
try {
  console.log('browser ' + browser.version());
  const response = await fetch(BASE);
  check('server', response.ok, response.status);
  for (const [width, height] of VIEWS) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(BASE, { waitUntil: 'load' });
    await page.locator('#go').click({ force: true });
    await page.waitForFunction(() => typeof window.__shop === 'function');
    await page.evaluate(() => { window.__lockRound(); window.__shop(true); });
    await page.evaluate(() => document.fonts.ready);
    const shelves = [...Object.entries(SHELF_WORDS).map(([kind, shelf]) => [kind, shelf.list.length]), ['bot', BOTS.length], ['buff', BUFFS.length]];
    for (const [kind, expected] of shelves) {
      await page.locator('#shop .tab[data-tab="' + kind + '"]').click({ force: true });
      const cards = page.locator('#shop .card[data-spec="' + kind + '"]');
      await cards.first().waitFor();
      const data = await page.evaluate(measure, { pixel: PIXEL, halfLine: HALF_LINE });
      const rows = data.flatMap(card => card.rows);
      // 기본 장비만 효과가 없다. 봇·버프와 유료 등급에서 빈 행은 누락이다.
      const populated = data.every(card => card.rows.length > 0 || (kind !== 'bot' && kind !== 'buff' && Number(card.rank) === 0));
      check(width + 'x' + height + ':' + kind, data.length === expected && rows.length > 0 && populated && rows.every(row => row.pass),
        { cards: data.length, expected, rows: rows.length, failures: rows.filter(row => !row.pass) });
      measurements.push({ width, height, kind, data });
      const conditions = await cards.locator('.condition').evaluateAll(buttons => buttons.map(button => {
        const label = button.querySelector('.condition-label');
        const bar = button.querySelector('progress');
        const number = button.querySelector('small');
        if (!label || !bar || !number) return false;
        const l = label.getBoundingClientRect(), b = bar.getBoundingClientRect(), n = number.getBoundingClientRect();
        return b.top >= l.bottom && n.top >= l.bottom && b.width > 0 && number.textContent.includes('/')
          && bar.max === Number(button.dataset.min) && bar.value === Math.min(Number(button.dataset.value), Number(button.dataset.min));
      }));
      // 복수 조건은 각 진행 막대를 따로 센다. 조건을 통째로 생략한 카드도 빈 모집단으로 통과하지 못한다.
      const items = SHELF_WORDS[kind]?.list || (kind === 'bot' ? BOTS : BUFFS);
      const expectedConditions = items.reduce((sum, item) => sum + (item.conditions?.length || Number(Boolean(item.condition))), 0);
      if (expectedConditions) check(width + ':' + kind + ':condition-lines', conditions.length === expectedConditions && conditions.every(Boolean), { count: conditions.length, expected: expectedConditions });
      if (SHOTS.has(kind) && (width === VIEWS[0][0] || width === VIEWS.at(-1)[0])) {
        await cards.first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(SETTLE_MS);
        const file = kind + '-' + width + 'x' + height + '.jpg';
        await page.screenshot({ path: fileURLToPath(new URL(file, out)), type: 'jpeg', quality: JPEG_QUALITY });
        console.log('screenshot ' + file + ' ' + width + 'x' + height);
      }
    }
    if (width === VIEWS.at(-1)[0]) {
      await page.locator('#shop .tab[data-tab="glove"]').click({ force: true });
      // 이름을 바꾸는 랩도 숫자를 밀지 못하게 가장 긴 표본을 실제 카드에 심는다.
      await page.evaluate(() => {
        const row = document.querySelector('#shop .card[data-spec="glove"][data-at="1"] .effect-row');
        row.querySelector('.effect-name').textContent = '아주 긴 장갑 효과 이름이 카드 너비를 넘는 표본';
        row.title = row.querySelector('.effect-name').textContent + ' ' + row.querySelector('.effect-value').textContent;
      });
      const longData = await page.evaluate(measure, { pixel: PIXEL, halfLine: HALF_LINE });
      const longRow = longData.find(card => card.rank === '1').rows[0];
      check('control:long-name-keeps-value-and-full-title', longRow.pass && longRow.nameScroll > longRow.nameWidth, longRow);
      measurements.push({ width, height, control: 'long-name', data: longData });
      // G3의 원래 지적 문장을 첫 유료 등급 카드에 심어 같은 축이 줄 분리를 거절하게 한다.
      await page.evaluate(() => {
        const card = document.querySelector('#shop .card[data-spec="glove"][data-at="1"]');
        const row = card.querySelector('em');
        row.innerHTML = '<span class="effect-row" title="장갑 벗겨짐 -4%p, 흘림 -5%p" style="display:block;white-space:normal"><span class="effect-name" style="display:inline;overflow:visible">장갑 벗겨짐 -4%p, 흘림</span> <span class="effect-value" style="display:inline">-5%p</span></span>';
        // 이름만 들어가는 실측 폭을 주어 마지막 값이 다음 줄로 떨어지는 옛 카드 상태를 재현한다.
        row.style.maxWidth = row.querySelector('.effect-name').getBoundingClientRect().width + 'px';
      });
      const data = await page.evaluate(measure, { pixel: PIXEL, halfLine: HALF_LINE });
      const planted = data.find(card => card.rank === '1').rows;
      check('control:old-comma-sentence-rejected', planted.length > 0 && planted.some(row => !row.sameLine && !row.pass), planted);
      measurements.push({ width, height, control: 'old-comma', data });
    }
    check(width + ':runtime', errors.length === 0, errors);
    await context.close();
  }
} finally {
  clearTimeout(timer);
  await browser.close();
  writeFileSync(new URL('pair-results.json', out), JSON.stringify({ results, measurements }, null, 2));
}
console.log('pair ' + (results.every(row => row.pass) ? 'PASS ' : 'FAIL ') + results.length);
if (results.some(row => !row.pass)) process.exitCode = 1;
