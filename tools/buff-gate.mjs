// 위치 모집단: 수동은 hand-react(p_read=0.9), 자동은 botPlan 자취다. tools/position-pop.mjs가 난수 경계를 짝짓는다.
import { readFileSync } from "node:fs";
import { makeRng, buildSet, resolve, newKeeper, followerGain } from "./position-pop.mjs";
import { GROWABLE } from "../src/ledger.mjs";
import { newBuff, addBuff, spendBuff, readBuff, BUFF_CAP, BUFFS } from "../web/src/state/buff.mjs";

// 버프 게이트. 세 종이 선반 문구가 판 것을 실제로 움직이는가.
// 브라우저를 안 띄운다. 판정은 src/chain.mjs 순수 함수고, 짝지은 시드 비교라 표본이 싸다.
// 축은 전부 선반 문구에서 나왔다. 유추로 세운 축은 여기에 없다.

// 만렙 총 팔로워 방향은 0.1퍼센트 규모의 효과라 2000시드에서는 부호가 뒤집힌다.
const SEEDS = 6000;

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 키퍼는 한 명으로 고정한다. 버프 폭을 재는 자리라 키퍼 차이는 잡음이다.
// newKeeper는 저 handling 신인이다. 송진이 붙을 자리가 남아 있어야 폭이 보인다.
const base = newKeeper();

// 입력을 정답 방향으로 못 박는다. 자동은 방향을 오판해서 버프 신호를 덮는다.
function sweep(opt) {
  // 표본을 밖에서 넘길 수 있어야 같은 약을 신인과 만렘에게 나란히 대볼 수 있다.
  const k = opt.keeper || base;
  let saved = 0, shots = 0, fans = 0, lapse = 0, flairFans = 0;
  for (let s = 0; s < SEEDS; s++) {
    // 슛은 키퍼 스탯을 안 읽는다. 같은 시드면 어느 조건에서도 같은 다섯 구가 나온다.
    const set = buildSet(makeRng(s + 1), 5, 0);
    const rng = makeRng(s + 90001);
    for (const shot of set) {
      const r = resolve({
        keeper: k, shot, rng,
        mode: 'hand-react',
        grip: opt.grip || 0, studs: 0, pads: 0, socks: 0, frame: 0,
        focusAid: opt.focusAid || 1, rosin: !!opt.rosin
      });
      shots++;
      if (!r.conceded) saved++;
      // 이벤트는 문자열이 아니라 { t, line, cause } 객체다. 종류는 t가 소유한다.
      // 자양강장제는 focusAid로 한눈팔기와 수다를 함께 좁힌다. 그래서 이 수는 둘을 합친다.
      // 라포 게이트는 gazeAid만 좁히므로 distracted만 센다. 두 수가 다른 이유다.
      const leaked = r.events.some((e) => e.t === "distracted" || e.t === "talked");
      if (leaked) lapse++;
      const g = followerGain(k, r, 0, 1, opt.boost || 1);
      fans += g;
      // 자양강장제가 파는 교환의 반대편. talked가 열어 준 flair 2.2배 몫이다.
      if (r.events.some((e) => e.t === "talked")) flairFans += g;
    }
  }
  return { rate: saved / shots * 100, fans, lapse, flairFans, shots };
}

// 대조군. 같은 조건 두 번이 완전히 같아야 나머지 수치가 차이로 읽힌다.
const c1 = sweep({});
const c2 = sweep({});
check("control", c1.rate === c2.rate && c1.fans === c2.fans,
  "rate " + c1.rate.toFixed(2) + " vs " + c2.rate.toFixed(2) + " fans " + c1.fans + " vs " + c2.fans);

// 자양강장제. 한눈팔기와 수다를 줄이고, 수다로 버는 팔로워를 함께 줄인다.
const tonic = sweep({ focusAid: 0.5 });
check("tonic-save", tonic.rate > c1.rate,
  c1.rate.toFixed(2) + " -> " + tonic.rate.toFixed(2));
check("tonic-distract", tonic.lapse < c1.lapse,
  c1.lapse + " -> " + tonic.lapse);
// 교환의 반대편은 총 팔로워가 아니라 수다가 벌어 준 몫이다.
// 총합은 세이브가 늘어 오히려 오른다. 그 방향을 여기서 같이 찍어 선반 문구와 대조한다.
check("tonic-cost", tonic.flairFans < c1.flairFans,
  c1.flairFans + " -> " + tonic.flairFans + " (total " + c1.fans + " -> " + tonic.fans + ")");

// 같은 약을 만렙에게도 대본다. 수다 몫과 총합은 서로 다른 방향으로 움직일 수 있다.
const top = newKeeper();
for (const k of GROWABLE) top[k] = 10;
const topBase = sweep({ keeper: top });
const topTonic = sweep({ keeper: top, focusAid: 0.5 });
check("tonic-cost-at-max", topTonic.fans < topBase.fans,
  "total " + topBase.fans + " -> " + topTonic.fans + " (talk " + topBase.flairFans + " -> " + topTonic.flairFans + ")");
check("tonic-save-at-max", topTonic.rate > topBase.rate,
  topBase.rate.toFixed(2) + " -> " + topTonic.rate.toFixed(2));

// Parse the shipped sentence's scope, then reuse tonic-cost's directional test.
// Halving focusAid changes event probability; finite sweeps need not halve earnings exactly.
// An unknown claim fails closed instead of silently measuring a different quantity.
const tonicNote = BUFFS.find((b) => b.kind === "tonic").note;
const claim = /^한눈팔기와 수다가 반으로 준다\. (?:대신 )?(수다로 버는 팔로워가|화제도) 반(?:으로 준다|이다)$/u.exec(tonicNote);
const metric = claim ? (claim[1] === "수다로 버는 팔로워가" ? "flairFans" : "fans") : null;
const sentenceSweeps = [["rookie", c1, tonic], ["maxed", topBase, topTonic]].map(([segment, before, after]) => ({
  segment, before: metric ? before[metric] : null, after: metric ? after[metric] : null,
  ok: Boolean(metric) && before[metric] > 0 && after[metric] < before[metric] && after.lapse < before.lapse
}));
check("tonic-sentence", sentenceSweeps.every((s) => s.ok),
  JSON.stringify({ note: tonicNote, metric, sweeps: sentenceSweeps }));

// 바이럴 떡밥. 문구는 소문이 1.5배, 막는 실력과는 무관하다.
// 판정 인자가 아니라서 세이브율은 완전히 같아야 한다. 조금이라도 움직이면 축이 샌 것이다.
const hype = sweep({ boost: 1.5 });
check("hype-neutral", hype.rate === c1.rate,
  c1.rate.toFixed(2) + " vs " + hype.rate.toFixed(2));
check("hype-fans", hype.fans > c1.fans && hype.fans <= Math.ceil(c1.fans * 1.6),
  c1.fans + " -> " + hype.fans + " cap " + Math.ceil(c1.fans * 1.6));

// 송진. 문구는 장갑 한 등급, 그리고 3등급도 이득이다.
// 뒤쪽이 진짜 축이다. 만렙 장갑에서 효과가 0이면 선반이 거짓말을 판 것이다.
const rosin0 = sweep({ rosin: true });
check("rosin-bare", rosin0.rate > c1.rate,
  c1.rate.toFixed(2) + " -> " + rosin0.rate.toFixed(2));
const g3 = sweep({ grip: 3 });
const g3r = sweep({ grip: 3, rosin: true });
check("rosin-maxgrip", g3r.rate > g3.rate,
  g3.rate.toFixed(2) + " -> " + g3r.rate.toFixed(2));

// 상태 불변식. 한 슬롯이고, 구로 닳고, 천장이 있다.
const one = addBuff(newBuff(), "tonic");
check("slot-exclusive", addBuff(one, "hype").kind === "tonic",
  "tonic held, hype refused");
check("spend-step", spendBuff(one).shots === one.shots - 1,
  one.shots + " -> " + spendBuff(one).shots);
let drain = { kind: "tonic", shots: 1 };
check("spend-empty", spendBuff(drain).kind === "",
  "last shot frees the slot");
let stack = newBuff();
for (let i = 0; i < 9; i++) stack = addBuff(stack, "tonic");
check("cap", stack.shots === BUFF_CAP,
  "9 x 12 -> " + stack.shots);
check("read-halfstate", readBuff({ kind: "tonic", shots: 0 }).kind === "",
  "kind without shots dies");

const durations = BUFFS.map((spec) => {
  let buff = addBuff(newBuff(), spec.kind), effective = 0;
  for (let i = 0; i < spec.shots + 5; i++) {
    const applied = buff;
    buff = spendBuff(buff);
    effective += applied.kind === spec.kind;
  }
  let oldBuff = addBuff(newBuff(), spec.kind), oldEffective = 0;
  for (let i = 0; i < spec.shots + 5; i++) {
    oldBuff = spendBuff(oldBuff);
    oldEffective += oldBuff.kind === spec.kind;
  }
  return { kind: spec.kind, sold: spec.shots, effective, oldEffective };
});
check("buff:the-shots-sold-are-the-shots-with-the-effect",
  durations.every((d) => d.effective === d.sold), JSON.stringify(durations));
check("control:deplete-then-read-loses-the-last-shot",
  durations.every((d) => d.oldEffective === d.sold - 1), JSON.stringify(durations));

const main = readFileSync(new URL("../web/src/main.mjs", import.meta.url), "utf8");
// 위치 발동 함수의 실제 경계만 읽고 버프 시뮬레이션과 소모 순서 문턱은 유지한다.
const commitStart = main.indexOf("function commit() {");
const commitEnd = main.indexOf("\nfunction rollCaptions(", commitStart);
const commit = main.slice(commitStart, commitEnd);
const captureAt = commit.indexOf("const applied = state.buff");
const depleteAt = commit.indexOf("state.buff = spendBuff(state.buff)");
check("buff:main-reads-the-applied-buff-before-it-depletes",
  commitStart >= 0 && commitEnd > commitStart && captureAt >= 0 && depleteAt > captureAt,
  "capture " + captureAt + " before deplete " + depleteAt);

for (const n of notes) console.log("ok  " + n);
for (const f of fails) console.log("BAD " + f);
console.log(fails.length ? "buff FAIL " + fails.length : "buff PASS");
process.exitCode = fails.length ? 1 : 0;
