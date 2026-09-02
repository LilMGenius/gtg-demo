import { makeRng, buildSet, resolve, newKeeper, followerGain } from "../src/chain.mjs";
import { GROWABLE } from "../src/ledger.mjs";
import { lookBoost, GLOVES, BOOTS, KITS, SOCKS, GOALS, CITIES, HAIRS, TATTOOS } from "../web/src/state/gear.mjs";

// 장비 효과 게이트. 여덟 선반이 파는 것이 판정과 소문에서 실제로 움직이는가.
// gear-gate는 상거래만 본다. 값을 치르고 무엇을 받는지는 어떤 게이트도 안 봤다.
// 브라우저를 안 띄운다. 판정은 src/chain.mjs 순수 함수고, 짝지은 시드 비교라 표본이 싸다.
// 축은 전부 선반 문구에서 나왔다. 유추로 세운 축은 여기에 없다.

// 2000시드 x 5구 = 10000구. buff-gate와 같은 표본이다. 1%p를 표준오차 0.4%p로 가른다.
const SEEDS = 2000;

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 키퍼는 한 명으로 고정한다. 장비 폭을 재는 자리라 키퍼 차이는 잡음이다.
// newKeeper는 저 handling 신인이다. 장갑이 붙을 자리가 남아 있어야 폭이 보인다.
const base = newKeeper();

// 입력을 정답 방향으로 못 박는다. 자동은 방향을 오판해서 장비 신호를 덮는다.
function sweep(opt) {
  const o = opt || {};
  const city = o.city || 0;
  // 머리와 타투는 판정을 안 건드리고 외형 승수로만 소문에 들어간다.
  const look = o.look !== undefined ? o.look : lookBoost({ hair: o.hair || 0, ink: o.ink || 0 });
  let saved = 0, shots = 0, fans = 0;
  const ev = { carriedIn: 0, gloveGone: 0, spill: 0, downed: 0, reboundMiss: 0, gaze: 0 };
  for (let s = 0; s < SEEDS; s++) {
    // 슛은 키퍼 스탯을 안 읽는다. 같은 시드에 같은 동네면 어느 장비에서도 같은 다섯 구가 나온다.
    const set = buildSet(makeRng(s + 1), 5, city);
    const rng = makeRng(s + 90001);
    for (const shot of set) {
      const r = resolve({
        keeper: opt.keeper || base, shot, rng,
        input: { dive: shot.side, errMs: 0, advance: 0, auto: false },
        grip: o.grip || 0, studs: o.studs || 0, pads: o.pads || 0,
        socks: o.socks || 0, frame: o.frame || 0
      });
      shots++;
      if (!r.conceded) saved++;
      if (shot.gaze) ev.gaze++;
      // 이벤트 종류는 문자열이 아니라 객체의 t가 소유한다.
      for (const e of r.events) if (ev[e.t] !== undefined && e.t !== "gaze") ev[e.t]++;
      fans += followerGain(opt.keeper || base, r, city, look);
    }
  }
  return { rate: saved / shots * 100, fans, ev, shots };
}

const F = (x) => x.toFixed(2);

// 대조군. 같은 조건 두 번이 완전히 같아야 나머지 수치가 차이로 읽힌다.
const c1 = sweep({});
const c2 = sweep({});
check("control", c1.rate === c2.rate && c1.fans === c2.fans,
  "rate " + F(c1.rate) + " vs " + F(c2.rate) + " fans " + c1.fans + " vs " + c2.fans);

// 장갑. 문구는 잡는 손이다. 딸려 가는 것과 흘리는 것 두 갈래를 같이 줄여야 한다.
const grip = sweep({ grip: 3 });
check("grip-save", grip.rate > c1.rate, F(c1.rate) + " -> " + F(grip.rate));
check("grip-glove", grip.ev.gloveGone < c1.ev.gloveGone,
  c1.ev.gloveGone + " -> " + grip.ev.gloveGone);
check("grip-spill", grip.ev.spill < c1.ev.spill,
  c1.ev.spill + " -> " + grip.ev.spill);

// 축구화. 문구는 딛는 발이다. 옆으로 뜨는 시간만 줄이므로 세이브율로만 보인다.
const boot = sweep({ studs: 3 });
check("studs-save", boot.rate > c1.rate, F(c1.rate) + " -> " + F(boot.rate));

// 유니폼. 문구는 버티는 몸이다. 정면 강슛에 같이 밀려 들어가는 갈래만 줄인다.
const kit = sweep({ pads: 3 });
check("pads-carry", kit.ev.carriedIn < c1.ev.carriedIn,
  c1.ev.carriedIn + " -> " + kit.ev.carriedIn);
check("pads-save", kit.rate > c1.rate, F(c1.rate) + " -> " + F(kit.rate));

// 양말. 문구는 딛고 일어서는 발목이다. 흘린 뒤 눕는 갈래만 줄인다.
const sock = sweep({ socks: 3 });
check("socks-down", sock.ev.downed < c1.ev.downed,
  c1.ev.downed + " -> " + sock.ev.downed);

// 골대. 문구는 흘린 공을 먹는 그물이다. 리바운드 자체를 통째로 지운다.
const frame = sweep({ frame: 3 });
check("frame-eat", frame.ev.reboundMiss > c1.ev.reboundMiss,
  c1.ev.reboundMiss + " -> " + frame.ev.reboundMiss);
check("frame-save", frame.rate > c1.rate, F(c1.rate) + " -> " + F(frame.rate));

// 동네. 문구는 사람이 많은 곳이다. 소문이 커지는 대신 한눈팔 일이 늘어난다.
// 두 방향이 같이 서야 통과다. 팔로워만 오르면 그건 값이 아니라 순이득이다.
const town = sweep({ city: 3 });
check("city-fans", town.fans > c1.fans, c1.fans + " -> " + town.fans);
check("city-cost", town.ev.gaze > c1.ev.gaze, c1.ev.gaze + " -> " + town.ev.gaze);

// 외형 두 선반. 판정 인자가 아니라서 세이브율은 완전히 같아야 한다.
// 조금이라도 움직이면 스킨이 판정으로 샌 것이다.
const look = sweep({ look: 1.3 });
check("look-neutral", look.rate === c1.rate, F(c1.rate) + " vs " + F(look.rate));
check("look-fans", look.fans > c1.fans && look.fans <= Math.ceil(c1.fans * 1.3),
  c1.fans + " -> " + look.fans + " cap " + Math.ceil(c1.fans * 1.3));
// 스킨 천장은 도시 관중 1.36보다 낮다. 판정 밖 축이 판정 값을 못 넘게 잡아 둔 자리다.
check("look-cap", lookBoost({ hair: 3, ink: 3 }) === 1.3,
  "hair3+ink3 -> " + lookBoost({ hair: 3, ink: 3 }));

// 등급 사다리. 위의 축은 전부 0과 3만 비교한다.
// 양 끝만 재면 중간 등급이 값만 받고 아무것도 안 줘도 게이트가 초록이다.
// 사다리는 끝점이 아니라 계단이다. 인접한 두 등급이 매번 같은 방향으로 움직여야 통과다.
const RANKS = [0, 1, 2, 3];
const rungs = {};
function ladder(field) {
  // 한 선반의 네 등급을 한 번만 돌리고 여러 축이 같은 표본을 나눠 쓴다.
  if (!rungs[field]) rungs[field] = RANKS.map((r) => sweep({ [field]: r }));
  return rungs[field];
}
function mono(name, field, pick, dir) {
  const v = ladder(field).map(pick);
  let ok = true;
  for (let i = 1; i < v.length; i++) {
    // dir가 1이면 오르기만, -1이면 내리기만 해야 한다. 같아도 계단이 죽은 것이라 불통과다.
    if (dir > 0 ? !(v[i] > v[i - 1]) : !(v[i] < v[i - 1])) ok = false;
  }
  check(name, ok, v.join(" -> "));
}

const rateOf = (s) => Number(s.rate.toFixed(4));

// 장갑 세 축. 세이브율은 오르고, 딸려 가는 것과 흘리는 것은 계단마다 줄어야 한다.
mono("mono-grip-save", "grip", rateOf, 1);
mono("mono-grip-glove", "grip", (s) => s.ev.gloveGone, -1);
mono("mono-grip-spill", "grip", (s) => s.ev.spill, -1);

// 축구화는 옆으로 뜨는 시간만 줄인다. 드러나는 축은 세이브율 하나다.
mono("mono-studs-save", "studs", rateOf, 1);

// 유니폼은 같이 밀려 들어가는 갈래를 계단마다 줄이면서 세이브율을 올린다.
mono("mono-pads-save", "pads", rateOf, 1);
mono("mono-pads-carry", "pads", (s) => s.ev.carriedIn, -1);

// 양말은 눕는 갈래를 줄이고 그만큼 세이브율을 올린다.
mono("mono-socks-save", "socks", rateOf, 1);
mono("mono-socks-down", "socks", (s) => s.ev.downed, -1);

// 골대는 흘린 공을 먹는다. 먹힌 횟수와 세이브율이 같이 올라가야 한다.
mono("mono-frame-save", "frame", rateOf, 1);
mono("mono-frame-eat", "frame", (s) => s.ev.reboundMiss, 1);

// 동네는 대가 축이다. 소문과 한눈팔 기회는 오르고 세이브율은 내려가면서 둘 다 계단이다.
mono("mono-city-fans", "city", (s) => s.fans, 1);
mono("mono-city-gaze", "city", (s) => s.ev.gaze, 1);
mono("mono-city-save", "city", rateOf, -1);

// 스킨 두 선반도 등급과 값이 있다. 판정 밖 축이라고 사다리를 안 재면 같은 구멍이 남는다.
// 외형은 세이브율을 안 건드리므로 축은 소문 하나다.
mono("mono-hair-fans", "hair", (s) => s.fans, 1);
mono("mono-ink-fans", "ink", (s) => s.fans, 1);

// 값당 효과. 위의 사다리는 방향만 본다. 3등급이 1등급의 약 5.9배 값인데
// 효과 증분이 2배도 안 되면 마지막 칸은 값만 받고 거의 아무것도 안 주는 칸이다.
// 등급마다 값당 효과가 같기를 요구하면 방치형의 정상적인 후반 체감 감소까지 빨개진다.
// 그렇다고 절반 아래로 떨어지면 마지막 칸을 산 사람이 손해다. 그래서 하한을 1등급의 40%로 잡았다.
const COST = {
  grip: GLOVES.map((g) => g.cost),
  studs: BOOTS.map((g) => g.cost),
  pads: KITS.map((g) => g.cost),
  socks: SOCKS.map((g) => g.cost),
  frame: GOALS.map((g) => g.cost),
  city: CITIES.map((g) => g.cost),
  hair: HAIRS.map((g) => g.cost),
  ink: TATTOOS.map((g) => g.cost)
};
const VALUE_FLOOR = 0.4;
function value(name, field, pick) {
  // 등급은 순서대로 살 필요가 없다. 등급 r의 지출은 그 행의 cost 하나이고 누적이 아니다.
  const v = ladder(field).map(pick);
  const per = (r) => Math.abs(v[r] - v[0]) / COST[field][r];
  const ratio = per(3) / per(1);
  check(name, ratio >= VALUE_FLOOR,
    "r1 " + per(1).toExponential(2) + " r3 " + per(3).toExponential(2) + " ratio " + ratio.toFixed(2));
}

// 선반마다 그 선반이 파는 문구의 알맹이 축 하나씩만 잰다.
// 동네는 대가 축이라 세이브율이 아니라 소문 쪽으로 잰다.
value("value-grip-save", "grip", rateOf);
value("value-studs-save", "studs", rateOf);
value("value-pads-save", "pads", rateOf);
value("value-socks-save", "socks", rateOf);
value("value-frame-save", "frame", rateOf);
value("value-city-fans", "city", (s) => s.fans);
value("value-hair-fans", "hair", (s) => s.fans);
value("value-ink-fans", "ink", (s) => s.fans);

// 표본 범위: 위 축들은 전부 신인 키퍼로 잰다. 장비는 감산항에 얹혀 있어 스탯이 오르면 시들므로,
// 값당이 후반에 어떻게 되는지는 만렙 키퍼로 한 번 더 재야 나온다.
const top = newKeeper();
for (const s of GROWABLE) top[s] = 10;
const topBase = sweep({ keeper: top }).rate;
const perAtMax = (rank) => Math.abs(sweep({ keeper: top, grip: rank }).rate - topBase) / COST.grip[rank];
const p1 = perAtMax(1), p3 = perAtMax(3);
const ratioMax = p3 / p1;
check("value-grip-save-at-max", ratioMax >= VALUE_FLOOR,
  "r1 " + p1.toExponential(2) + " r3 " + p3.toExponential(2) + " ratio " + ratioMax.toFixed(2));

for (const n of notes) console.log("ok  " + n);
for (const f of fails) console.log("BAD " + f);
console.log(fails.length ? "gear-effect FAIL " + fails.length : "gear-effect PASS");
process.exitCode = fails.length ? 1 : 0;
