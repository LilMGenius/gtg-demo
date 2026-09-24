import { CAUSE_LABEL } from '../src/ledger.mjs';
import { TRAITS } from '../src/roster.mjs';
import { AXIS_WORD } from '../web/src/state/shelf.mjs';

// 표현 정본 이름 절의 상한이다. 수치와 접두는 이름 밖에서 그린다.
const limits = { stat: 6, trait: 8, effect: 10 };
const groups = { stat: Object.values(CAUSE_LABEL), trait: Object.keys(TRAITS), effect: Object.values(AXIS_WORD) };
const over = (labels, limit) => labels.filter(label => [...label].length > limit);
const fails = [];
for (const [kind, labels] of Object.entries(groups)) {
  const bad = over(labels, limits[kind]);
  const control = over([...labels, '가'.repeat(limits[kind] + 1)], limits[kind]);
  const ok = labels.length > 0 && bad.length === 0 && control.length === 1;
  console.log(kind, ok ? 'PASS' : 'FAIL', JSON.stringify({ count: labels.length, bad, control: control.length }));
  if (!ok) fails.push(kind);
}
console.log('names ' + (fails.length ? 'FAIL ' + fails.join(',') : 'PASS 3'));
process.exitCode = fails.length ? 1 : 0;
