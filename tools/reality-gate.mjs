import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import * as reality from '../src/reality.mjs';
import { ELEVEN, FIELD, ROLE_SLOTS, KICKERS, defaultEleven, kickerByName } from '../src/roster.mjs';
import { readSquadKickers } from '../web/src/state/save.mjs';

// 영어 수사와 십진수는 같은 숫자 공간으로 읽는다. 인용문에 없는 값은 NaN이라 통과하지 않는다.
const words = 'zero one two three four five six seven eight nine ten eleven twelve'.split(' ');
const quotedNumber = token => words.includes(token) ? words.indexOf(token) : Number(token);
const readNumber = (clause, pattern) => quotedNumber(clause.match(pattern)?.[1]);
// 부동소수 산술 오차만 허용한다. 조문의 반올림 오차를 숨기는 문턱이 아니다.
const equal = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-10;
function agrees(entry, name = 'TEAM_RULE') {
  const { source, values } = entry;
  if (!source || !['name', 'url', 'clause', 'checked'].every(key => typeof source[key] === 'string' && source[key].trim())) return false;
  const q = source.clause;
  let parsed;
  switch (name) {
    case 'TEAM_RULE':
      parsed = { maximum: readNumber(q, /maximum of (\w+) players/), goalkeepers: readNumber(q, /; (\w+) must be the goalkeeper/) };
      break;
    case 'GOAL':
      parsed = { width: readNumber(q, /posts is ([\d.]+) m/), height: readNumber(q, /ground is ([\d.]+) m/) };
      break;
    case 'PITCH_MARKS': {
      // 인용 순서는 골 에어리어, 페널티 에어리어다. 양쪽 깊이를 더해 폭을 복원한다.
      const depths = [...q.matchAll(/extend into the field of play for ([\d.]+) m/g)].map(m => Number(m[1]));
      const [areaD, boxD] = depths;
      const width = readNumber(reality.GOAL.source.clause, /posts is ([\d.]+) m/);
      parsed = { boxD, boxW: width + boxD * 2, areaD, areaW: width + areaD * 2,
        spot: readNumber(q, /mark is made ([\d.]+) m/), arcR: readNumber(q, /radius of ([\d.]+) m/),
        // 조문은 cm라 미터로 환산한다.
        lineMax: readNumber(q, /more than ([\d.]+) cm/) / 100 };
      break;
    }
    case 'BALL': {
      // 원문 둘레의 양 끝을 미터로 바꾸고 중간 둘레에서 지름을 유도한다.
      const circumferenceMin = readNumber(q, /between ([\d.]+) cm/) / 100;
      const circumferenceMax = readNumber(q, /and ([\d.]+) cm/) / 100;
      parsed = { circumferenceMin, circumferenceMax, diameter: (circumferenceMin + circumferenceMax) / (2 * Math.PI) };
      break;
    }
    case 'SOUND':
      parsed = { speed: readNumber(q, /about ([\d.]+) m\/s/), temperature: readNumber(q, /At ([\d.]+) °C/) };
      break;
    case 'AIR_ABSORPTION':
      // 조건은 ISO 기준값과 선택한 습도다. source.formulaInputs와 대조하고 흡음은 아래에서 재계산한다.
      return Object.keys(values).length === Object.keys(source.formulaInputs).length
        && Object.entries(values).every(([key, value]) => equal(value, source.formulaInputs[key]));
    case 'BAR_MODES': {
      // cos(beta)=sech(beta)는 cosh 곱보다 고차 근에서 안정적이다. 순서와 근 구간도 검사한다.
      const roots = values.roots;
      if (!Array.isArray(roots) || roots.length !== source.rootCount || values.ratios.length !== roots.length) return false;
      return roots.every((root, i) => root > (i + 1) * Math.PI && root < (i + 2) * Math.PI
        && Math.abs(Math.cos(root) - 1 / Math.cosh(root)) < 1e-10
        && equal(values.ratios[i], (root / roots[0]) ** 2));
    }
    default: return false;
  }
  return Object.keys(values).length === Object.keys(parsed).length
    && Object.entries(values).every(([key, value]) => equal(value, parsed[key]));
}
const entries = Object.entries(reality).filter(([, entry]) => typeof entry === 'object');
for (const [name, entry] of entries) {
  assert.ok(agrees(entry, name), name + ': 조문 또는 방정식과 수치가 일치해야 한다');
  // 모든 항목에 오류를 심는다. 특정 종류의 항목이 검증을 건너뛰면 대조군이 잡는다.
  const altered = structuredClone(entry);
  const key = Object.keys(altered.values)[0];
  if (Array.isArray(altered.values[key])) altered.values[key][0] += 1;
  else altered.values[key] += 1;
  assert.ok(!agrees(altered, name), name + ': 오염된 값 거부');
  console.log('  ok source:' + name + ' value-and-mutant ' + JSON.stringify(entry.values));
}
assert.ok(agrees({ ...reality.TEAM_RULE, source: { ...reality.TEAM_RULE.source, clause: reality.TEAM_RULE.source.clause.replace('eleven', '11').replace('; one ', '; 1 ') } }));
// ISO 원표의 반올림한 dB/km를 실제 산식으로 다시 구한다. 검증 허용폭은 원표의 마지막 자리다.
const air = reality.AIR_ABSORPTION;
for (const [frequency, expected] of air.source.referenceTable) {
  const got = reality.airAbsorption(frequency);
  const accepts = value => Number.isFinite(value) && Math.abs(value - expected) <= air.source.rounding;
  assert.ok(accepts(got), 'AIR_ABSORPTION ' + frequency + ': ' + got);
  assert.ok(!accepts(got * 2), 'AIR_ABSORPTION 오류 대조군');
  console.log('  ok formula:AIR_ABSORPTION ' + frequency + 'Hz ' + got.toFixed(4) + ' dB/km');
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
// 구별력 있는 실물 수치만 검사한다. 일반적인 정수까지 잡으면 배치와 규칙을 구분할 수 없다.
const fingerprints = [reality.GOAL.values.width, reality.GOAL.values.height, reality.GOAL.values.width / 2,
  reality.PITCH_MARKS.values.boxW, reality.PITCH_MARKS.values.areaW, reality.PITCH_MARKS.values.boxD,
  reality.PITCH_MARKS.values.arcR, reality.SOUND.values.speed];
const literal = new RegExp('(?<![\\d.])(?:' + fingerprints.map(n => String(n).replace('.', '\\.')).join('|') + ')(?![\\d.])');
const named = new RegExp('\\b(?:reality|' + entries.map(([name]) => name).join('|') + ')\\b');
const scan = source => source.split(/\r?\n/).flatMap((line, i) => literal.test(line) && !named.test(line) ? [{ line: i + 1, text: line }] : []);
// GOAL 양성 대조군은 소스 문자열에만 심고 작업 트리는 오염시키지 않는다.
const planted = 'const uncited = 7.32;'; // GOAL 오류 대조군
assert.equal(scan(planted).length, 1);
assert.equal(scan('// 속도 343m/s').length, 1); // SOUND의 단위가 붙어도 검출해야 한다.
assert.equal(scan('const cited = GOAL.values.width;').length, 0);
console.log('  ok controls:uncited-world-literal-rejected');
const root = fileURLToPath(new URL('../', import.meta.url));
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', 'fonts', 'vendor'].includes(entry.name) || entry.name.includes('.local.')) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : entry.name.endsWith('.mjs') || entry.name.endsWith('.js') ? [path] : [];
  });
}
const files = [...walk(join(root, 'src')), ...walk(join(root, 'web/src')),
  ...readdirSync(join(root, 'tools')).filter(name => name.endsWith('.mjs') && !name.includes('.local.')).map(name => join(root, 'tools', name))]
  .filter(path => path !== join(root, 'src/reality.mjs'));
assert.ok(files.length > 0, '빈 검사 모집단');
const violations = files.flatMap(path => scan(readFileSync(path, 'utf8')).map(hit => ({ file: relative(root, path), ...hit })));
for (const hit of violations) console.log('  FAIL fingerprint:' + hit.file + ':' + hit.line + ' ' + hit.text);
console.log('  scan files=' + files.length + ' violations=' + violations.length);
assert.equal(violations.length, 0, '실물 수치의 소유자는 reality다');
console.log('reality PASS');
