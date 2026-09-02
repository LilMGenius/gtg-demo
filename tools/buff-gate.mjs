import { makeRng, buildSet, resolve, newKeeper, followerGain } from "../src/chain.mjs";
import { newBuff, addBuff, spendBuff, readBuff, BUFF_CAP } from "../web/src/state/buff.mjs";

// 버프 게이트. 세 종이 선반 문구가 판 것을 실제로 움직이는가.
// 브라우저를 안 띄운다. 판정은 src/chain.mjs 순수 함수고, 짝지은 시드 비교라 표본이 싸다.
// 축은 전부 선반 문구에서 나왔다. 유추로 세운 축은 여기에 없다.

// 2000시드 x 5구 = 10000구. statsens와 같은 표본이다. 1%p를 표준오차 0.4%p로 가른다.
const SEEDS = 2000;

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 키퍼는 한 명으로 고정한다. 버프 폭을 재는 자리라 키퍼 차이는 잡음이다.
// newKeeper는 저 handling 신인이다. 송진이 붙을 자리가 남아 있어야 폭이 보인다.
const base = newKeeper();

// 입력을 정답 방향으로 못 박는다. 자동은 방향을 오판해서 버프 신호를 덮는다.
function sweep(opt) {
  let saved = 0, shots = 0, fans = 0, lapse = 0, flairFans = 0;
  for (let s = 0; s < SEEDS; s++) {
    // 슛은 키퍼 스탯을 안 읽는다. 같은 시드면 어느 조건에서도 같은 다섯 구가 나온다.
    const set = buildSet(makeRng(s + 1), 5, 0);
    const rng = makeRng(s + 90001);
    for (const shot of set) {
      const r = resolve({
        keeper: base, shot, rng,
        input: { dive: shot.side, errMs: 0, advance: 0, auto: false },
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
      const g = followerGain(base, r, 0, 1, opt.boost || 1);
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

// 자양강장제. 문구는 한눈팔기와 수다가 반, 대신 화제도 반이다.
// 두 방향이 같이 서야 통과다. 세이브만 오르고 화제가 안 내리면 교환이 아니라 순이득이다.
const tonic = sweep({ focusAid: 0.5 });
check("tonic-save", tonic.rate > c1.rate,
  c1.rate.toFixed(2) + " -> " + tonic.rate.toFixed(2));
check("tonic-distract", tonic.lapse < c1.lapse,
  c1.lapse + " -> " + tonic.lapse);
// 교환의 반대편은 총 팔로워가 아니라 수다가 벌어 준 몫이다.
// 총합은 세이브가 늘어 오히려 오른다. 그 방향을 여기서 같이 찍어 선반 문구와 대조한다.
check("tonic-cost", tonic.flairFans < c1.flairFans,
  c1.flairFans + " -> " + tonic.flairFans + " (total " + c1.fans + " -> " + tonic.fans + ")");

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

for (const n of notes) console.log("ok  " + n);
for (const f of fails) console.log("BAD " + f);
console.log(fails.length ? "buff FAIL " + fails.length : "buff PASS");
process.exitCode = fails.length ? 1 : 0;
