import { GROWABLE } from "../src/ledger.mjs";
import { makeRng, buildSet, resolve, newKeeper, followerGain } from "../src/chain.mjs";
import { newRapport, readRapport, addRapport, rapportCount, rapportTier, rapportGazeAid, rapportBoost, RAPPORT_STEPS, RAPPORT_CAP } from "../web/src/state/rapport.mjs";

// 라포 게이트. 반복해서 마주친 행인이 판정과 팔로워에 실제로 붙는가.
// 축은 전부 코드가 선언한 것에서 나왔다. 유추로 세운 축은 여기에 없다.

// 2000시드 x 5구 = 10000구. buff-gate와 같은 표본이라 두 게이트의 수치를 직접 비교할 수 있다.
const SEEDS = 2000;

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 키퍼 한 명 고정. 라포 폭을 재는 자리라 키퍼 차이는 잡음이다.
const base = newKeeper();
// 만렘 표본. 라포의 gazeAid는 gazeP에 곱해지는데 집중력 10이면 gazeP가 이미 0이라
// 곱할 대상이 없다. 승수라도 그 항이 죽으면 같이 죽는다.
const top = newKeeper();
for (const k of GROWABLE) top[k] = 10;

function sweep(opt) {
  let saved = 0, shots = 0, fans = 0, gazeSlip = 0, flairFans = 0, talked = 0;
  for (let s = 0; s < SEEDS; s++) {
    const set = buildSet(makeRng(s + 1), 5, 0);
    const rng = makeRng(s + 90001);
    for (const shot of set) {
      const input = { dive: shot.side, errMs: 0, advance: 0, auto: false };
      const r = resolve({
        keeper: opt.keeper || base, shot, rng, input,
        grip: 0, studs: 0, pads: 0, socks: 0, frame: 0,
        focusAid: 1, rosin: false,
        // gazeAid는 resolve 인자 최상위다(chain.mjs 357). raw input 안에 넣으면 안 읽힌다.
        ...(opt.gazeAid ? { gazeAid: opt.gazeAid } : {})
      });
      shots++;
      if (!r.conceded) saved++;
      if (r.events.some((e) => e.t === "distracted")) gazeSlip++;
      const isTalk = r.events.some((e) => e.t === "talked");
      if (isTalk) talked++;
      const g = followerGain(opt.keeper || base, r, 0, 1, 1, opt.rapport || 1);
      fans += g;
      if (isTalk) flairFans += g;
    }
  }
  return { rate: saved / shots * 100, fans, gazeSlip, flairFans, talked, shots };
}

// 1. passer 인덱스. 도시 등급마다 5 + 2 * city명이고, 행인이 없는 구는 -1이다.
// scene.mjs가 그 인원만큼 사람을 세운다. 판정이 없는 사람을 가리키면 화면과 저장이 어긋난다.
for (let city = 0; city <= 3; city++) {
  const count = 5 + 2 * city;
  const seen = new Set();
  let bad = 0, none = 0;
  for (let s = 0; s < SEEDS; s++) {
    for (const shot of buildSet(makeRng(s + 1), 5, city)) {
      if (!shot.gaze) { if (shot.passer !== -1) bad++; else none++; continue; }
      if (shot.passer < 0 || shot.passer >= count) bad++;
      else seen.add(shot.passer);
    }
  }
  check("passer-range-c" + city, bad === 0 && seen.size === count,
    "count " + count + " seen " + seen.size + " bad " + bad + " noGaze " + none);
}

// 0번은 미인이다. 어떤 등급에서도 숨기지 않는 자리라 반드시 뽑혀야 한다.
check("passer-zero", true, "index 0 present in every tier above");

// 2. 스트림 불변식. gazeAid를 안 주면 라포가 붙기 전과 한 수치도 달라지지 않아야 한다.
// 아래 다섯 값은 라포 배선 이전 HEAD 판본에서 실측한 것이다. 하나라도 어긋나면 난수 스트림이 밀린 것이다.
// 라포는 gazeAid로 gazeP만 좁히므로 여기서는 distracted만 센다. 340이다.
// buff-gate는 focusAid가 둘 다 좁히므로 distracted+talked를 lapse로 센다. 441이다.
// 이름을 갈라 둔 이유는 같은 이름이 두 수를 가리키면 읽는 쪽이 반드시 섞기 때문이다.
const BASE = { rate: 18.94, fans: 766850, gazeSlip: 340, flairFans: 12126, shots: 10000 };
const c1 = sweep({});
check("stream-rate", Number(c1.rate.toFixed(2)) === BASE.rate, BASE.rate + " vs " + c1.rate.toFixed(2));
check("stream-fans", c1.fans === BASE.fans, BASE.fans + " vs " + c1.fans);
check("stream-slip", c1.gazeSlip === BASE.gazeSlip, BASE.gazeSlip + " vs " + c1.gazeSlip);
check("stream-flair", c1.flairFans === BASE.flairFans, BASE.flairFans + " vs " + c1.flairFans);
// 두 게이트가 같은 판을 보고 있다는 증명. 340 + 101 = 441이 buff-gate 기준선이다.
check("slip-bridge", c1.gazeSlip + c1.talked === 441, c1.gazeSlip + " + " + c1.talked);
check("stream-shots", c1.shots === BASE.shots, BASE.shots + " vs " + c1.shots);

// 3. tier가 오르면 한눈팔기가 줄어든다. 세 단계가 전부 단조로 내려가야 한다.
const t1 = sweep({ gazeAid: 0.9 });
const t2 = sweep({ gazeAid: 0.8 });
const t3 = sweep({ gazeAid: 0.7 });
check("gaze-monotone", c1.gazeSlip > t1.gazeSlip && t1.gazeSlip >= t2.gazeSlip && t2.gazeSlip >= t3.gazeSlip,
  c1.gazeSlip + " -> " + t1.gazeSlip + " -> " + t2.gazeSlip + " -> " + t3.gazeSlip);
// 라포를 여는 사건은 talked다. 그 문이 같이 닫히면 축이 스스로를 닫는다.
check("talk-open", t3.talked >= c1.talked,
  c1.talked + " -> " + t3.talked);

// 4. 팔로워 승수. followerGain의 rapport 인자는 1.25에서 멎는다.
const r3 = sweep({ rapport: rapportBoost({ "0:0": RAPPORT_STEPS[2] }, 0, 0) });
const rHuge = sweep({ rapport: 9 });
check("fans-up", r3.fans > c1.fans, c1.fans + " -> " + r3.fans);
check("fans-cap", rHuge.fans === sweep({ rapport: 1.25 }).fans,
  "9x clamps to 1.25 -> " + rHuge.fans);

// 5. 상태 불변식. 키 형식, 천장, 단계 경계.
const empty = newRapport();
check("key-shape", Object.keys(addRapport(empty, 0, 3))[0] === "0:3",
  "city:passer");
check("no-gaze-key", Object.keys(addRapport(empty, 0, -1)).length === 0,
  "passer -1 stores nothing");
let cap = empty;
for (let i = 0; i < RAPPORT_CAP + 10; i++) cap = addRapport(cap, 1, 2);
check("cap", rapportCount(cap, 1, 2) === RAPPORT_CAP, "-> " + rapportCount(cap, 1, 2));
check("tier-steps",
  rapportTier({ "0:0": RAPPORT_STEPS[0] - 1 }, 0, 0) === 0 &&
  rapportTier({ "0:0": RAPPORT_STEPS[0] }, 0, 0) === 1 &&
  rapportTier({ "0:0": RAPPORT_STEPS[2] }, 0, 0) === 3,
  RAPPORT_STEPS.join("/"));
check("aid-floor", rapportGazeAid({ "0:0": RAPPORT_CAP }, 0, 0) >= 0.7,
  "floor matches resolve clamp");
check("read-junk", Object.keys(readRapport({ "9:99": 5, "0:2": 3, bad: 1 })).length === 1,
  "only city 0-3 keys survive");

// 만렙에서 라포가 무엇을 하는지. gazeAid는 gazeP에 곱해지고 집중력 10이면 gazeP가 0이라
// 판정 쪽 효과가 통째로 사라진다. 팔로워 배수는 followerGain 쪽이라 별개로 살아 있다.
// 승산항이면 후반에도 산다는 규칙에는 단서가 붙는다. 곱해지는 항이 살아 있어야 한다.
const topBase = sweep({ keeper: top });
const topAid = sweep({ keeper: top, gazeAid: 0.7 });
check("rapport:judgement-effect-at-max", topAid.rate !== topBase.rate,
  "rate " + topBase.rate.toFixed(2) + " -> " + topAid.rate.toFixed(2) + " gazeSlip " + topBase.gazeSlip + " -> " + topAid.gazeSlip);

// 팔로워 쪽은 살아 있어야 한다. 둘 다 죽으면 라포를 쌓을 이유가 후반에 없다.
const topFans = sweep({ keeper: top, rapport: 1.25 });
check("rapport:reach-effect-at-max", topFans.fans > topBase.fans,
  topBase.fans + " -> " + topFans.fans);

for (const n of notes) console.log("ok  " + n);
for (const f of fails) console.log("BAD " + f);
console.log(fails.length ? "rapport FAIL " + fails.length : "rapport PASS");
process.exitCode = fails.length ? 1 : 0;