import { isDeepStrictEqual } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { SKINS, BEARDS, BEARD_SKINS, readGear, lookOf } from '../web/src/state/gear.mjs';
import { SHELF_WORDS } from '../web/src/state/shelf.mjs';
import { load, saveKey } from '../web/src/state/save.mjs';
import { FACES_V } from '../web/src/state/passer.mjs';

// 상점의 skinsAt 목록 전체를 순회한다. 이름은 표시 문구이고 나머지는 색 또는 형태 데이터다.
// 색 키는 gear의 계약을 따른다. post는 기둥 색, sky·haze는 하늘·안개 색이다. 그물 농도 dim은 같은 등급에서 고정한다.
// 중첩 cut까지 Node의 isDeepStrictEqual로 비교하므로 새 기하 키도 별도 등록 없이 검사된다.
const colourKeys = new Set(['tone', 'post', 'sky', 'haze']);
const geometryOf = variant => Object.fromEntries(Object.entries(variant).filter(([key]) => key !== 'name' && !colourKeys.has(key)));
const differences = variants => {
  const [first, ...rest] = variants;
  if (!first) return [{ reason: '빈 변형 목록' }];
  const baseline = geometryOf(first);
  return rest.filter(variant => !isDeepStrictEqual(geometryOf(variant), baseline))
    .map(variant => ({ baseline: first, variant }));
};
const out = new URL('../.omo/evidence/g2/', import.meta.url);
mkdirSync(out, { recursive: true });
const rows = [];
const check = (name, pass, data) => {
  rows.push({ name, pass, data });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(data)}`);
};
for (const [field, tiers] of Object.entries(SKINS)) {
  const shelf = Object.values(SHELF_WORDS).find(row => row.field === field);
  check(`swatch:${field}:catalogue`, Boolean(shelf) && tiers.length === shelf.list.length, { tiers: tiers.length });
  for (const [tier, variants] of tiers.entries()) {
    const failures = differences(variants);
    check(`swatch:${field}:${tier}`, variants.length > 0 && failures.length === 0,
      { name: shelf?.list[tier]?.name, variants: variants.length, failures });
  }
}

// 0은 무료 면도 칸, 1은 칠할 털이 있는 첫 등급이다. 한 변형만 있어야 면도 색 버튼이 사라진다.
check('shave:single-free-clean-variant', BEARDS[0].cost === 0 && BEARD_SKINS[0].length === 1 && BEARD_SKINS[0][0].cut.beard === 0, BEARD_SKINS[0]);
check('control:colour-only-is-accepted', differences(BEARD_SKINS[1]).length === 0, BEARD_SKINS[1]);
const original = structuredClone(BEARD_SKINS[1][0]);
const planted = { ...structuredClone(original), cut: { ...original.cut, shape: '심은 다른 모양' } };
const caught = differences([original, planted]);
check('control:changed-cut-is-rejected', caught.length > 0, caught);

// 옛 무료 변형 1·2를 각각 복원한다. 다른 선반은 최고 유료 등급과 마지막 변형으로 손실을 감시한다.
const paid = Object.fromEntries(Object.entries(SKINS).flatMap(([field, tiers]) =>
  [[field, tiers.length - 1], [field + 'Skin', tiers.at(-1).length - 1]]));
const previousStorage = globalThis.localStorage;
try {
  for (const variant of [1, 2]) {
    const gear = { ...paid, beard: 0, beardSkin: variant };
    // 레벨 1은 load가 유효한 키퍼로 읽는 시작 레벨이며 잔고는 유료 수염 한 칸 값으로 구별한다.
    const keeper = { level: 1, worn: { ...gear } };
    const raw = { faces: FACES_V, keeper, squad: [keeper, { level: 1, worn: { ...paid } }], pick: 0,
      gear: { ...gear }, wallet: { coin: BEARDS[1].cost }, tickets: BEARDS[1].cost };
    const expected = structuredClone(raw);
    for (const target of [expected.gear, expected.keeper.worn, expected.squad[0].worn]) target.beardSkin = 0;
    const storage = new Map([[saveKey(), JSON.stringify(raw)]]);
    globalThis.localStorage = { getItem: key => storage.get(key) ?? null };
    const restored = load();
    check(`save:legacy-shave-${variant}-preserves-paid-items`, isDeepStrictEqual(restored, expected), { raw, restored });
    const legacy = { faces: FACES_V, keeper: { level: 1 }, gear };
    storage.set(saveKey(), JSON.stringify(legacy));
    check(`save:shared-legacy-shave-${variant}`, load()?.gear.beardSkin === 0, load());
    const normalized = readGear(gear);
    check(`shave:legacy-${variant}-renders-clean`, normalized.beardSkin === 0 && lookOf(gear).face.beard === 0,
      { normalized, face: lookOf(gear).face });
  }
} finally {
  if (previousStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousStorage;
}
const pass = rows.every(row => row.pass);
writeFileSync(new URL('swatch-results.json', out), JSON.stringify({ pass, rows }, null, 2));
console.log(`swatch ${pass ? 'PASS' : 'FAIL'} ${rows.length}`);
// 실패 행이 하나라도 있으면 셸에서 관측 가능한 비정상 종료를 남긴다.
if (!pass) process.exitCode = 1;
