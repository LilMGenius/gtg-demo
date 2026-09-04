// 헛구의 자. 모든 슛이 골문 안으로 갔다. 키커는 절대 빗나가지 않는 존재였고,
// 그래서 주전 열하나를 고르는 일이 난도만 정하고 판의 밀도는 안 정했다.
// 못 차는 키커를 세우면 막기는 쉬운데 그 쉬움에 대가가 없었다.
//
// 축은 셋이다. 헛구가 나는가, 잘 차는 키커일수록 덜 나는가, 보상이 실점과 세이브 사이인가.
// 마지막이 이 랩의 핵이다. 순서가 어긋나면 못 차는 키커를 세우는 쪽이 이득이 되어
// 선수단 화면이 거꾸로 선다.
// 표본 범위: 키퍼는 한 사람으로 고정한다. 재는 것은 키커 쪽 확률이라 키퍼가 결론을 안 바꾼다.

import { makeRng, resolve, keeperAtLevel, autoInput, followerGain } from "../src/chain.mjs";
import { KICKERS, kickerByName, defaultEleven } from "../src/roster.mjs";
import { coinGain, COIN_SAVE, COIN_CONCEDED, COIN_WIDE } from "../web/src/state/wallet.mjs";

const N = 20000;
const LINE = String.fromCharCode(10);
const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 한 사람이 한 무리를 상대로 치른 판. 키커만 갈아 끼우고 나머지는 같다.
function run(pool) {
  const rng = makeRng(11);
  const k = keeperAtLevel(5, rng);
  let balls = 0, wide = 0, conceded = 0;
  while (balls < N) {
    const shot = { aimX: 0.8, aimY: 0.9, course: "상단", strong: false, chip: false, gaze: false, bend: 0,
      flight: 0.62, side: 1, forced: false, kicker: pool[Math.floor(rng() * pool.length)], passer: 0 };
    balls += 1;
    const r = resolve({ keeper: k, shot, rng, input: autoInput(k, shot, rng),
      grip: 0, studs: 0, pads: 0, socks: 0, frame: 0, focusAid: 1, rosin: false, gazeAid: 1 });
    if (r.untested) wide += 1;
    if (r.conceded) conceded += 1;
  }
  return { wide: wide / balls * 100, conceded: conceded / balls * 100 };
}

const cheap = defaultEleven().map(kickerByName);
// 명단에서 가장 잘 차는 열하나. 침착성과 결정력이 헛구를 산다.
const dear = KICKERS.slice().sort((a, b) => (b.composure + b.finishing) - (a.composure + a.finishing)).slice(0, 11);
const a = run(cheap);
const b = run(dear);

check("instrument:both-line-ups-actually-played", true, N + " balls each");
check("wide:a-kicker-can-miss-the-goal-entirely", a.wide > 0, a.wide.toFixed(2) + "% wide with the cheap eleven");
// 이 부등호가 키커를 사는 이유다. 뒤집히면 영입이 손해가 된다.
check("wide:a-better-line-up-wastes-fewer-balls", b.wide < a.wide,
  "cheap " + a.wide.toFixed(2) + "% against dear " + b.wide.toFixed(2) + "%");
check("control:the-better-line-up-is-also-harder-to-stop", b.conceded > a.conceded,
  "cheap " + a.conceded.toFixed(2) + "% conceded against dear " + b.conceded.toFixed(2) + "%");

// 보상 순서. 실점 < 헛구 < 세이브가 이 랩의 전부다.
const wideCoin = coinGain(false, 10, true);
const saveCoin = coinGain(false, 1, false);
check("wide:the-purse-puts-a-wasted-ball-between-a-goal-and-a-save",
  COIN_CONCEDED < wideCoin && wideCoin < saveCoin,
  "conceded " + COIN_CONCEDED + " < wide " + wideCoin + " < save " + saveCoin);
check("control:a-famous-name-does-not-raise-the-wasted-ball",
  coinGain(false, 10, true) === coinGain(false, 1, true), "same at fame 1 and 10");

const keeper = keeperAtLevel(5, makeRng(3));
const ev = (t) => ({ events: [{ t }], conceded: t === "goal", fame: 8, untested: t === "wide" });
const fanWide = followerGain(keeper, ev("wide"), 0, 1, 1, 1, 1);
const fanSave = followerGain(keeper, ev("save"), 0, 1, 1, 1, 1);
const fanGoal = followerGain(keeper, ev("goal"), 0, 1, 1, 1, 1);
check("wide:the-followers-put-it-between-a-goal-and-a-save",
  fanGoal < fanWide && fanWide < fanSave,
  "goal " + fanGoal + " < wide " + fanWide + " < save " + fanSave);

if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
console.log(fails.length ? "wide FAIL " + fails.length : "wide PASS " + notes.length);
if (fails.length) process.exitCode = 1;
