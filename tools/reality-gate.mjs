import assert from 'node:assert/strict';
import * as reality from '../src/reality.mjs';
import { ELEVEN, FIELD, ROLE_SLOTS, KICKERS, defaultEleven, kickerByName } from '../src/roster.mjs';
import { readSquadKickers } from '../web/src/state/save.mjs';

// 배열 위치가 영어 수사의 값이다. 인용문의 수를 코드 상수와 별도로 복원한다.
const words = 'zero one two three four five six seven eight nine ten eleven twelve'.split(' ');
const quotedNumber = (word) => words.indexOf(word);
function agrees(entry) {
  const { source, values } = entry;
  if (!source || !['name', 'url', 'clause', 'checked'].every((key) => typeof source[key] === 'string' && source[key].trim())) return false;
  const maximum = source.clause.match(/maximum of (\w+) players/);
  const keepers = source.clause.match(/; (\w+) must be the goalkeeper/);
  const parsed = { maximum: quotedNumber(maximum?.[1]), goalkeepers: quotedNumber(keepers?.[1]) };
  return Object.entries(values).every(([key, value]) => Number.isFinite(value) && value === parsed[key]);
}
for (const [name, entry] of Object.entries(reality)) {
  assert.ok(agrees(entry), name + ': 조문과 수치가 일치해야 한다');
  console.log('  ok source:' + name + ' ' + JSON.stringify(entry));
}
const rule = reality.TEAM_RULE.values;
const legal = (slots) => rule.goalkeepers + Object.values(slots).reduce((a, b) => a + b) === rule.maximum;
assert.ok(legal(ROLE_SLOTS));
assert.equal(ELEVEN, rule.maximum);
assert.equal(FIELD, rule.maximum - rule.goalkeepers);
assert.equal(defaultEleven().length, FIELD);
// 이전 오류 그대로인 4-4-3과 골키퍼 하나를 대조군으로 세운다.
const oldSlots = { 수비수: 4, 미드필더: 4, 공격수: 3 };
assert.ok(!legal(oldSlots));
// 인용문은 그대로인데 최대 인원만 한 명 늘리면 수치 검증이 반드시 거부해야 한다.
assert.ok(!agrees({ ...reality.TEAM_RULE, values: { ...rule, maximum: rule.maximum + rule.goalkeepers } }));
console.log('  ok controls:clause-mismatch-and-4-4-3-rejected');

const all = KICKERS.map((k) => k.name);
const fallback = defaultEleven();
const roleOf = (name) => kickerByName(name)?.role;
const read = (saved, defaults = fallback) => readSquadKickers(saved, all, defaults, FIELD, roleOf, ROLE_SLOTS);
const full = (got) => {
  assert.equal(got.eleven.length, rule.maximum - rule.goalkeepers);
  assert.equal(new Set(got.eleven).size, got.eleven.length);
  for (const [role, slots] of Object.entries(ROLE_SLOTS)) assert.equal(got.eleven.filter((n) => roleOf(n) === role).length, slots);
};
const old = Object.entries(oldSlots).flatMap(([role, count]) => KICKERS.filter((k) => k.role === role).slice(-count).map((k) => k.name));
const saved = { kickers: old, eleven: old };
const before = JSON.stringify(saved);
const migrated = read(saved);
full(migrated);
const overflow = old.filter((n) => roleOf(n) === '미드필더').at(-1);
assert.deepEqual(migrated.eleven, old.filter((n) => n !== overflow));
assert.ok(migrated.kickers.includes(overflow));
assert.ok(old.every((n) => migrated.kickers.includes(n)));
assert.equal(JSON.stringify(saved), before);
assert.deepEqual(read(migrated), migrated);
full(read(null));
full(read({ kickers: old, eleven: [old[0], old[0], '없는 선수'] }));
// 시작 명단에서 한 역할이 빠진 경우에도 보유 명단의 그 역할로 채워야 한다.
const withoutMidfield = fallback.filter((n) => roleOf(n) !== '미드필더');
full(read({ kickers: old, eleven: [] }, withoutMidfield));
console.log('  ok migration:saved-order-overflow-benched-ownership-preserved-idempotent-deficits-filled');
console.log('reality PASS');
