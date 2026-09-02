// C4 체격. 키와 몸무게가 세이브율 총합이 아니라 방향에 붙는지 잰다.
// 실측 연구가 말하는 것은 하나다. 슛 난이도를 통제하면 신장과 세이브율에 유의한 상관이 없다.
// 그래서 상단과 하단이 반대로 움직이고 합이 대략 0이어야 통과다.

import { resolve, makeRng, buildSet, keeperAtLevel } from "../src/chain.mjs";
import { CAUSE_LABEL } from "../src/ledger.mjs";

const BALLS = 30000;
const LEVEL = 5;

const BODIES = [
  { label: "전봇대 205 / 58", height: 205, weight: 58 },
  { label: "평균   188 / 84", height: 188, weight: 84 },
  { label: "공     165 / 105", height: 165, weight: 105 }
];

const COURSES = ["상단", "하단", "정면"];

function run(body) {
  const byCourse = new Map(COURSES.map((c) => [c, { balls: 0, saved: 0 }]));
  const causes = new Map();
  let seed = 424242;
  let balls = 0;
  while (balls < BALLS) {
    seed += 1;
    const rng = makeRng(seed);
    const keeper = Object.assign(keeperAtLevel(LEVEL, rng), { height: body.height, weight: body.weight });
    for (const shot of buildSet(rng, LEVEL)) {
      if (balls >= BALLS) break;
      const r = resolve({ keeper, shot, rng });
      balls++;
      const slot = byCourse.get(shot.course);
      slot.balls++;
      if (!r.conceded) slot.saved++;
      else causes.set(r.cause, (causes.get(r.cause) || 0) + 1);
    }
  }
  return { byCourse, causes, balls };
}

const pad = (s, n) => String(s).padEnd(n, " ");
const padL = (s, n) => String(s).padStart(n, " ");

const results = BODIES.map((b) => ({ body: b, out: run(b) }));

console.log("코스별 세이브율  구 " + BALLS + " / 체형");
console.log("");
console.log(pad("체형", 20) + COURSES.map((c) => padL(c, 9)).join("") + padL("전체", 9));
for (const { body, out } of results) {
  let saved = 0;
  let all = 0;
  const row = COURSES.map((c) => {
    const s = out.byCourse.get(c);
    saved += s.saved;
    all += s.balls;
    return padL((s.saved / s.balls * 100).toFixed(1) + "%", 9);
  }).join("");
  console.log(pad(body.label, 20) + row + padL((saved / all * 100).toFixed(1) + "%", 9));
}

const tall = results[0].out;
const round = results[2].out;
const rate = (o, c) => o.byCourse.get(c).saved / o.byCourse.get(c).balls;

const upper = rate(tall, "상단") - rate(round, "상단");
const lower = rate(tall, "하단") - rate(round, "하단");
const front = rate(round, "정면") - rate(tall, "정면");

console.log("");
console.log("전봇대 빼기 공, 상단 " + (upper * 100).toFixed(2) + "pp   하단 " + (lower * 100).toFixed(2) + "pp");
console.log("공 빼기 전봇대, 정면 " + (front * 100).toFixed(2) + "pp");

console.log("");
console.log(pad("실점 원인", 16) + results.map((r) => padL(r.body.label.split(" ")[0], 10)).join(""));
const allCauses = [...new Set(results.flatMap((r) => [...r.out.causes.keys()]))].sort();
for (const cause of allCauses) {
  const row = results.map((r) => {
    const total = [...r.out.causes.values()].reduce((a, b) => a + b, 0);
    const n = r.out.causes.get(cause) || 0;
    return padL((n / total * 100).toFixed(1) + "%", 10);
  }).join("");
  console.log(pad(CAUSE_LABEL[cause] || cause, 16) + row);
}

// 분포가 갈리는가. 두 극단의 원인 분포 사이 총변동거리.
function share(o) {
  const total = [...o.causes.values()].reduce((a, b) => a + b, 0);
  const m = new Map();
  for (const [k, v] of o.causes) m.set(k, v / total);
  return m;
}
const st = share(tall);
const sr = share(round);
let tvd = 0;
for (const k of allCauses) tvd += Math.abs((st.get(k) || 0) - (sr.get(k) || 0));
tvd /= 2;

const c4Upper = upper > 0.01;
const c4Lower = lower < -0.01;
const c4Front = front > 0.01;
const c4Split = tvd > 0.05;

console.log("");
console.log("상단은 큰 키퍼가 잡는다   " + (c4Upper ? "PASS" : "FAIL"));
console.log("하단은 작은 키퍼가 빠르다 " + (c4Lower ? "PASS" : "FAIL"));
console.log("정면은 무거운 쪽이 막는다 " + (c4Front ? "PASS" : "FAIL"));
console.log("원인 분포가 갈린다 TVD " + tvd.toFixed(3) + "  " + (c4Split ? "PASS" : "FAIL"));

if (!(c4Upper && c4Lower && c4Front && c4Split)) process.exit(1);
