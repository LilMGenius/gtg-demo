import assert from 'node:assert/strict';
import { makeRng, newKeeper, buildSet, resolve } from './position-pop.mjs';
import { recordShot } from '../web/src/state/record.mjs';
import { readRecord } from '../web/src/state/save.mjs';
import { purchaseCondition } from '../web/src/state/condition.mjs';
import { shotOutcome } from '../src/reality.mjs';

const record = {}, expected = { saved: 0, conceded: 0, missed: 0 };
// 기존 위치 모집단의 200개 씨앗이면 실점·세이브·골문 밖의 실제 증인을 모두 얻는다.
for (let seed = 1; seed <= 200; seed++) {
  const keeper = newKeeper();
  for (const shot of buildSet(makeRng(seed))) {
    const result = resolve({ keeper, shot, rng: makeRng(seed), mode: 'hand-react' });
    // 제품 상수가 아닌 사건 증인으로 기대 집계를 독립적으로 만든다.
    const kind = result.events.some(e => e.t === 'wide') ? 'missed' : result.conceded ? 'conceded' : 'saved';
    expected[kind]++;
    recordShot(record, '대조 키커', result);
    assert.equal(shotOutcome(result), kind);
    if (kind === 'missed') assert.equal(result.events.at(-1).line, '빗나감');
  }
}
assert.ok(Object.values(expected).every(n => n > 0), '세 갈래 모두 양의 증인');
assert.deepEqual(record['대조 키커'], expected);
assert.deepEqual(readRecord({ record: JSON.parse(JSON.stringify(record)) }), record);
// 옛 장부 모양은 보존하되 새 빗나감 필드를 추측해서 빼지는 않는다.
assert.deepEqual(readRecord({ record: { old: { saved: 2, conceded: 1 } } }).old, { saved: 2, conceded: 1, missed: 0 });
const misses = {};
recordShot(misses, '대조 키커', { conceded: false, untested: true });
assert.deepEqual(readRecord({ record: misses }), misses);
// 한 세이브 문턱은 빗나감 하나로 문이 열리는 이전 오류를 최소 표본에서 잡는다.
const item = { condition: { key: 'saves', min: 1 } };
const gate = table => purchaseCondition(item, { record: table, keeper: newKeeper() }).met;
assert.equal(gate(misses), false);
const oldCounter = { '대조 키커': { saved: 1, conceded: 0 } };
assert.equal(gate(oldCounter), true, '옛 집계 대조는 잘못 문을 연다');
recordShot(misses, '대조 키커', { conceded: false, untested: false });
assert.equal(gate(misses), true, '실제 세이브 대조만 문을 연다');
console.log('tally PASS', JSON.stringify({ expected, oldCounterRejected: !gate({ '대조 키커': { ...oldCounter['대조 키커'], saved: 0 } }), realSaveOpens: gate(misses) }));
