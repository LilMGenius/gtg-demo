import { SHELF_WORDS } from '../web/src/state/shelf.mjs';
import { BOTS } from '../web/src/state/bot.mjs';
import { conditionLabel } from '../web/src/state/condition.mjs';

// 실제 조건 표에서 모집단을 얻고, 화면의 진행도는 별도로 읽은 저장 상태와 맞댄다.
export const CONDITION_ITEMS = [...Object.entries(SHELF_WORDS).flatMap(([tab, shelf]) => shelf.list
  .filter(item => item.condition).map(item => ({ tab, rank: item[shelf.field], field: shelf.field, item }))),
  ...BOTS.filter(item => item.condition).map(item => ({ tab: 'bot', rank: item.tier, field: 'bot', item }))];

export function conditionErrors(row, expected) {
  const errors = [];
  if (!row || !row.visible) return ['조건이 보이지 않음'];
  if (!row.text.includes('구매 조건 · ' + expected.label)) errors.push('조건 문구');
  if (row.value !== expected.value || row.min !== expected.min) errors.push('판정 값');
  if (row.progress.replaceAll(',', '') !== expected.value + '/' + expected.min) errors.push('진행도');
  if (row.price !== expected.cost) errors.push('가격');
  if (expected.value < expected.min && !row.disabled) errors.push('구매 잠금');
  return errors;
}

export async function auditConditions(reference) {
  const context = await reference.context().browser().newContext({ viewport: reference.viewportSize() });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran', { waitUntil: 'load' });
    await page.locator('#go').click({ force: true });
    await page.waitForFunction(() => typeof window.__shop === 'function');
    await page.evaluate(() => window.__lockRound());
    return await auditPage(page);
  } finally { await context.close(); }
}

async function auditPage(page) {
  await page.evaluate(() => { window.__wiki(false); window.__shop(true); });
  const rows = [];
  for (const { tab, rank, item } of CONDITION_ITEMS) {
    // 좁은 세로 표본은 회전 안내 아래의 문서 배치만 검사한다. 실제 입력은 condition 게이트의 가로 화면이 맡는다.
    await page.locator('#shop .tab[data-tab="' + tab + '"]').evaluate(button => button.click());
    const card = page.locator('#shop .card[data-spec="' + tab + '"][data-at="' + rank + '"]');
    await card.scrollIntoViewIfNeeded();
    const row = await card.evaluate(card => {
      const button = card.querySelector('.condition');
      const buy = card.querySelector('.buy');
      const rect = button?.getBoundingClientRect();
      return { text: button?.textContent, progress: button?.querySelector('small')?.textContent,
        value: Number(button?.dataset.value), min: Number(button?.dataset.min),
        price: Number(buy?.querySelector('[data-coin]')?.dataset.coin), disabled: buy?.disabled,
        visible: Boolean(rect && rect.width && rect.height && rect.top < innerHeight && rect.bottom > 0),
        keeper: window.__keeperStats(), record: window.__record(), fans: window.__fans() };
    });
    const key = item.condition.key;
    const value = key === 'fans' ? row.fans : key === 'saves'
      ? Object.values(row.record).reduce((sum, record) => sum + record.saved, 0) : row.keeper[key];
    const expected = { label: conditionLabel(item.condition), value, min: item.condition.min, cost: item.cost };
    const errors = conditionErrors(row, expected);
    // 한 칸 틀린 진행도를 심어 같은 판정이 반드시 거절하는지 본다.
    const control = conditionErrors({ ...row, progress: (value + 1) + '/' + expected.min }, expected).includes('진행도');
    rows.push({ tab, rank, errors, control });
  }
  return { pass: rows.length === CONDITION_ITEMS.length && rows.length > 0 && rows.every(row => !row.errors.length && row.control), rows };
}
