import { makeRng, buildSet, resolve, newKeeper, followerGain } from "../src/chain.mjs";
import { lookBoost } from "../web/src/state/gear.mjs";

// \uc7a5\ube44 \ud6a8\uacfc \uac8c\uc774\ud2b8. \uc5ec\ub35f \uc120\ubc18\uc774 \ud30c\ub294 \uac83\uc774 \ud310\uc815\uacfc \uc18c\ubb38\uc5d0\uc11c \uc2e4\uc81c\ub85c \uc6c0\uc9c1\uc774\ub294\uac00.
// gear-gate\ub294 \uc0c1\uac70\ub798\ub9cc \ubcf8\ub2e4. \uac12\uc744 \uce58\ub974\uace0 \ubb34\uc5c7\uc744 \ubc1b\ub294\uc9c0\ub294 \uc5b4\ub5a4 \uac8c\uc774\ud2b8\ub3c4 \uc548 \ubd24\ub2e4.
// \ube0c\ub77c\uc6b0\uc800\ub97c \uc548 \ub744\uc6b4\ub2e4. \ud310\uc815\uc740 src/chain.mjs \uc21c\uc218 \ud568\uc218\uace0, \uc9dd\uc9c0\uc740 \uc2dc\ub4dc \ube44\uad50\ub77c \ud45c\ubcf8\uc774 \uc2f8\ub2e4.
// \ucd95\uc740 \uc804\ubd80 \uc120\ubc18 \ubb38\uad6c\uc5d0\uc11c \ub098\uc654\ub2e4. \uc720\ucd94\ub85c \uc138\uc6b4 \ucd95\uc740 \uc5ec\uae30\uc5d0 \uc5c6\ub2e4.

// 2000\uc2dc\ub4dc x 5\uad6c = 10000\uad6c. buff-gate\uc640 \uac19\uc740 \ud45c\ubcf8\uc774\ub2e4. 1%p\ub97c \ud45c\uc900\uc624\ucc28 0.4%p\ub85c \uac00\ub978\ub2e4.
const SEEDS = 2000;

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// \ud0a4\ud37c\ub294 \ud55c \uba85\uc73c\ub85c \uace0\uc815\ud55c\ub2e4. \uc7a5\ube44 \ud3ed\uc744 \uc7ac\ub294 \uc790\ub9ac\ub77c \ud0a4\ud37c \ucc28\uc774\ub294 \uc7a1\uc74c\uc774\ub2e4.
// newKeeper\ub294 \uc800 handling \uc2e0\uc778\uc774\ub2e4. \uc7a5\uac11\uc774 \ubd99\uc744 \uc790\ub9ac\uac00 \ub0a8\uc544 \uc788\uc5b4\uc57c \ud3ed\uc774 \ubcf4\uc778\ub2e4.
const base = newKeeper();

// \uc785\ub825\uc744 \uc815\ub2f5 \ubc29\ud5a5\uc73c\ub85c \ubabb \ubc15\ub294\ub2e4. \uc790\ub3d9\uc740 \ubc29\ud5a5\uc744 \uc624\ud310\ud574\uc11c \uc7a5\ube44 \uc2e0\ud638\ub97c \ub36e\ub294\ub2e4.
function sweep(opt) {
  const o = opt || {};
  const city = o.city || 0;
  let saved = 0, shots = 0, fans = 0;
  const ev = { carriedIn: 0, gloveGone: 0, spill: 0, downed: 0, reboundMiss: 0, gaze: 0 };
  for (let s = 0; s < SEEDS; s++) {
    // \uc29b\uc740 \ud0a4\ud37c \uc2a4\ud0ef\uc744 \uc548 \uc77d\ub294\ub2e4. \uac19\uc740 \uc2dc\ub4dc\uc5d0 \uac19\uc740 \ub3d9\ub124\uba74 \uc5b4\ub290 \uc7a5\ube44\uc5d0\uc11c\ub3c4 \uac19\uc740 \ub2e4\uc12f \uad6c\uac00 \ub098\uc628\ub2e4.
    const set = buildSet(makeRng(s + 1), 5, city);
    const rng = makeRng(s + 90001);
    for (const shot of set) {
      const r = resolve({
        keeper: base, shot, rng,
        input: { dive: shot.side, errMs: 0, advance: 0, auto: false },
        grip: o.grip || 0, studs: o.studs || 0, pads: o.pads || 0,
        socks: o.socks || 0, frame: o.frame || 0
      });
      shots++;
      if (!r.conceded) saved++;
      if (shot.gaze) ev.gaze++;
      // \uc774\ubca4\ud2b8 \uc885\ub958\ub294 \ubb38\uc790\uc5f4\uc774 \uc544\ub2c8\ub77c \uac1d\uccb4\uc758 t\uac00 \uc18c\uc720\ud55c\ub2e4.
      for (const e of r.events) if (ev[e.t] !== undefined && e.t !== "gaze") ev[e.t]++;
      fans += followerGain(base, r, city, o.look || 1);
    }
  }
  return { rate: saved / shots * 100, fans, ev, shots };
}

const F = (x) => x.toFixed(2);

// \ub300\uc870\uad70. \uac19\uc740 \uc870\uac74 \ub450 \ubc88\uc774 \uc644\uc804\ud788 \uac19\uc544\uc57c \ub098\uba38\uc9c0 \uc218\uce58\uac00 \ucc28\uc774\ub85c \uc77d\ud78c\ub2e4.
const c1 = sweep({});
const c2 = sweep({});
check("control", c1.rate === c2.rate && c1.fans === c2.fans,
  "rate " + F(c1.rate) + " vs " + F(c2.rate) + " fans " + c1.fans + " vs " + c2.fans);

// \uc7a5\uac11. \ubb38\uad6c\ub294 \uc7a1\ub294 \uc190\uc774\ub2e4. \ub538\ub824 \uac00\ub294 \uac83\uacfc \ud758\ub9ac\ub294 \uac83 \ub450 \uac08\ub798\ub97c \uac19\uc774 \uc904\uc5ec\uc57c \ud55c\ub2e4.
const grip = sweep({ grip: 3 });
check("grip-save", grip.rate > c1.rate, F(c1.rate) + " -> " + F(grip.rate));
check("grip-glove", grip.ev.gloveGone < c1.ev.gloveGone,
  c1.ev.gloveGone + " -> " + grip.ev.gloveGone);
check("grip-spill", grip.ev.spill < c1.ev.spill,
  c1.ev.spill + " -> " + grip.ev.spill);

// \ucd95\uad6c\ud654. \ubb38\uad6c\ub294 \ub51b\ub294 \ubc1c\uc774\ub2e4. \uc606\uc73c\ub85c \ub728\ub294 \uc2dc\uac04\ub9cc \uc904\uc774\ubbc0\ub85c \uc138\uc774\ube0c\uc728\ub85c\ub9cc \ubcf4\uc778\ub2e4.
const boot = sweep({ studs: 3 });
check("studs-save", boot.rate > c1.rate, F(c1.rate) + " -> " + F(boot.rate));

// \uc720\ub2c8\ud3fc. \ubb38\uad6c\ub294 \ubc84\ud2f0\ub294 \ubab8\uc774\ub2e4. \uc815\uba74 \uac15\uc29b\uc5d0 \uac19\uc774 \ubc00\ub824 \ub4e4\uc5b4\uac00\ub294 \uac08\ub798\ub9cc \uc904\uc778\ub2e4.
const kit = sweep({ pads: 3 });
check("pads-carry", kit.ev.carriedIn < c1.ev.carriedIn,
  c1.ev.carriedIn + " -> " + kit.ev.carriedIn);
check("pads-save", kit.rate > c1.rate, F(c1.rate) + " -> " + F(kit.rate));

// \uc591\ub9d0. \ubb38\uad6c\ub294 \ub51b\uace0 \uc77c\uc5b4\uc11c\ub294 \ubc1c\ubaa9\uc774\ub2e4. \ud758\ub9b0 \ub4a4 \ub215\ub294 \uac08\ub798\ub9cc \uc904\uc778\ub2e4.
const sock = sweep({ socks: 3 });
check("socks-down", sock.ev.downed < c1.ev.downed,
  c1.ev.downed + " -> " + sock.ev.downed);

// \uace8\ub300. \ubb38\uad6c\ub294 \ud758\ub9b0 \uacf5\uc744 \uba39\ub294 \uadf8\ubb3c\uc774\ub2e4. \ub9ac\ubc14\uc6b4\ub4dc \uc790\uccb4\ub97c \ud1b5\uc9f8\ub85c \uc9c0\uc6b4\ub2e4.
const frame = sweep({ frame: 3 });
check("frame-eat", frame.ev.reboundMiss > c1.ev.reboundMiss,
  c1.ev.reboundMiss + " -> " + frame.ev.reboundMiss);
check("frame-save", frame.rate > c1.rate, F(c1.rate) + " -> " + F(frame.rate));

// \ub3d9\ub124. \ubb38\uad6c\ub294 \uc0ac\ub78c\uc774 \ub9ce\uc740 \uacf3\uc774\ub2e4. \uc18c\ubb38\uc774 \ucee4\uc9c0\ub294 \ub300\uc2e0 \ud55c\ub208\ud314 \uc77c\uc774 \ub298\uc5b4\ub09c\ub2e4.
// \ub450 \ubc29\ud5a5\uc774 \uac19\uc774 \uc11c\uc57c \ud1b5\uacfc\ub2e4. \ud314\ub85c\uc6cc\ub9cc \uc624\ub974\uba74 \uadf8\uac74 \uac12\uc774 \uc544\ub2c8\ub77c \uc21c\uc774\ub4dd\uc774\ub2e4.
const town = sweep({ city: 3 });
check("city-fans", town.fans > c1.fans, c1.fans + " -> " + town.fans);
check("city-cost", town.ev.gaze > c1.ev.gaze, c1.ev.gaze + " -> " + town.ev.gaze);

// \uc678\ud615 \ub450 \uc120\ubc18. \ud310\uc815 \uc778\uc790\uac00 \uc544\ub2c8\ub77c\uc11c \uc138\uc774\ube0c\uc728\uc740 \uc644\uc804\ud788 \uac19\uc544\uc57c \ud55c\ub2e4.
// \uc870\uae08\uc774\ub77c\ub3c4 \uc6c0\uc9c1\uc774\uba74 \uc2a4\ud0a8\uc774 \ud310\uc815\uc73c\ub85c \uc0cc \uac83\uc774\ub2e4.
const look = sweep({ look: 1.3 });
check("look-neutral", look.rate === c1.rate, F(c1.rate) + " vs " + F(look.rate));
check("look-fans", look.fans > c1.fans && look.fans <= Math.ceil(c1.fans * 1.3),
  c1.fans + " -> " + look.fans + " cap " + Math.ceil(c1.fans * 1.3));
// \uc2a4\ud0a8 \ucc9c\uc7a5\uc740 \ub3c4\uc2dc \uad00\uc911 1.36\ubcf4\ub2e4 \ub0ae\ub2e4. \ud310\uc815 \ubc16 \ucd95\uc774 \ud310\uc815 \uac12\uc744 \ubabb \ub118\uac8c \uc7a1\uc544 \ub454 \uc790\ub9ac\ub2e4.
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

for (const n of notes) console.log("ok  " + n);
for (const f of fails) console.log("BAD " + f);
console.log(fails.length ? "gear-effect FAIL " + fails.length : "gear-effect PASS");
process.exitCode = fails.length ? 1 : 0;
