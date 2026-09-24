import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { CITIES, CITY_SKINS, readGear, venueAt, wealthBand } from '../web/src/state/gear.mjs';
import { purchaseCondition } from '../web/src/state/condition.mjs';
import { passerVenue, passerCountAt } from '../web/src/state/passer.mjs';
import { pay } from '../web/src/state/wallet.mjs';

// 수락 계약의 네 시설명을 순서대로 고정한다. 도시 수는 기존 저장의 변형 세 칸이다.
const names = ['동네 운동장', '풋살장', '잔디 축구장', '프로 경기장'];
assert.deepEqual(CITIES.map(row => row.name), names);
const rows = [];
for (const item of CITIES) {
  assert.equal(CITY_SKINS[item.city].length, 3);
  assert.equal(passerCountAt(item.city), 5 + 2 * item.city);
  for (const [variant, host] of CITY_SKINS[item.city].entries()) {
    assert.equal(host.tier, item.city);
    assert.equal(host.wealth, wealthBand(host.income.values.income));
    assert.equal(host.name, item.name + ' · ' + host.city);
    assert.equal(passerVenue(item.city, variant), venueAt(item.city, variant));
    assert.equal(readGear({ city: item.city, citySkin: variant }).citySkin, variant);
  }
  if (!item.conditions.length) continue;
  const ready = () => ({ keeper: { level: item.conditions[0].min }, record: { bot: { saved: item.conditions[1].min } }, fans: item.conditions[2].min, place: readGear({}), wallet: { coin: item.cost, cash: 0 } });
  for (const condition of item.conditions) {
    const state = ready();
    if (condition.key === 'level') state.keeper.level--;
    if (condition.key === 'saves') state.record.bot.saved--;
    if (condition.key === 'fans') state.fans--;
    assert.equal(purchaseCondition(item, state).met, false);
    assert.equal(state.wallet.coin, item.cost);
    rows.push({ tier: item.city, axis: condition.key, blocked: true });
  }
  const state = ready();
  assert.equal(purchaseCondition(item, state).met, true);
  const payment = pay(state.wallet, item.cost);
  assert.ok(payment);
  assert.equal(state.wallet.coin, 0);
  state.place = readGear(JSON.parse(JSON.stringify(state.place)));
  state.keeper.level = 1;
  state.fans = 0;
  state.record = {};
  assert.equal(purchaseCondition(item, state).met, true);
  rows.push({ tier: item.city, axis: 'met-buy-and-restored-unlock', pass: true, payment });
}
// 손상된 도시 이름을 같은 자로 재면 반드시 실패해야 한다.
assert.throws(() => assert.deepEqual(['공터', ...names.slice(1)], names));
const out = new URL('../.omo/evidence/p16/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('venue-state.json', out), JSON.stringify({ names, hosts: CITY_SKINS.flat().map(({ name, country, flag, wealth }) => ({ name, country, flag, wealth })), rows }, null, 2));
console.log('venue PASS ' + rows.length + ' conditions, hosts, saved variants and persistent unlocks');
