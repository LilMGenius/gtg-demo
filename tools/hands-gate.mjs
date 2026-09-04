// 손에 들어온 공은 손이 공 쪽으로 갔을 때만이라는 자.
// 반대로 뛰었는데 공이 멈춘 구가 전부 잡았다로 끝나서, 화면은 키퍼가 한쪽으로 날아간 뒤
// 공이 반대편 장갑으로 순간이동하는 그림을 그렸다. 판정이 결과 종류를 안 갈라 놓았기 때문이고,
// 연출로 덮을 수 있는 결함이 아니었다. 다리나 몸이나 머리에 맞은 공은 손에 안 들어온다.
//
// 축은 셋에 대조군 셋이다. 잘못 뛴 구가 손으로 안 끝나는가, 그런 구가 표본에 실제로 있는가,
// 막히기는 하는가, 막힌 공이 살아 있는가, 그리고 잡은 쪽이 여전히 더 이득인가.
// 대조군 없이 첫 축만 재면 잘못 뛴 구를 아예 안 만드는 표본으로도 초록이 된다.

import { makeRng, buildSet, resolve, keeperAtLevel, autoInput, ballInHand, restartDelay } from "../src/chain.mjs";

const N = 20000;
// 판단력이 방향 읽기를 사므로 레벨마다 잘못 뛰는 빈도가 다르다. 세 구간을 다 본다.
const LEVELS = [1, 10, 30];
const LINE = String.fromCharCode(10);

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 몸에 맞은 공이 흘러 들어가는 3단의 결과들. 하나라도 뒤에 오면 그 공은 살아 있었던 것이다.
const LIVE = new Set(["rebound", "reboundMiss", "downed"]);
const rows = [];

for (const lv of LEVELS) {
  const rng = makeRng(7 + lv);
  const k = keeperAtLevel(lv, rng);
  let balls = 0, wrongWay = 0, handAfterWrongWay = 0, blocked = 0, blockedWentLive = 0;
  let handDelay = 0, handN = 0, footDelay = 0, footN = 0;
  while (balls < N) {
    for (const shot of buildSet(rng, lv, 0)) {
      if (balls >= N) break;
      balls += 1;
      const input = autoInput(k, shot, rng);
      const r = resolve({ keeper: k, shot, rng, input, grip: 0, studs: 0, pads: 0, socks: 0, frame: 0, focusAid: 1, rosin: false, gazeAid: 1 });
      const kinds = r.events.map((e) => e.t);
      const inHand = kinds.some((x) => x === "catch" || x === "save");
      const off = input.dive !== shot.side;
      if (off) wrongWay += 1;
      if (off && inHand) handAfterWrongWay += 1;
      const at = kinds.indexOf("bodyBlock");
      if (at >= 0) {
        blocked += 1;
        if (kinds.slice(at + 1).some((x) => LIVE.has(x))) blockedWentLive += 1;
      }
      const d = restartDelay(k, r);
      if (ballInHand(r)) { handDelay += d; handN += 1; } else { footDelay += d; footN += 1; }
    }
  }
  rows.push({ lv, balls, wrongWay, handAfterWrongWay, blocked, blockedWentLive,
    hand: handN ? handDelay / handN : 0, foot: footN ? footDelay / footN : 0 });
}

check("control:the-sample-contains-wrong-way-dives",
  rows.every((r) => r.wrongWay > 0),
  rows.map((r) => "Lv" + r.lv + " " + r.wrongWay + " of " + r.balls).join(", "));
check("control:a-wrong-way-dive-can-still-stop-the-ball",
  rows.every((r) => r.blocked > 0),
  rows.map((r) => "Lv" + r.lv + " " + r.blocked).join(", "));
check("hands:a-wrong-way-dive-never-ends-with-the-ball-in-the-glove",
  rows.every((r) => r.handAfterWrongWay === 0),
  rows.map((r) => "Lv" + r.lv + " " + r.handAfterWrongWay).join(", "));
check("hands:a-body-block-leaves-the-ball-live",
  rows.every((r) => r.blocked === r.blockedWentLive),
  rows.map((r) => "Lv" + r.lv + " " + r.blockedWentLive + " of " + r.blocked).join(", "));
// 캐치가 더 좋아야 손으로 잡을 이유가 남는다. 그 이득은 재시작이 빠른 것으로 이미 지급된다.
check("hands:holding-the-ball-restarts-sooner-than-fetching-it",
  rows.every((r) => r.hand < r.foot),
  rows.map((r) => "Lv" + r.lv + " " + r.hand.toFixed(2) + "s against " + r.foot.toFixed(2) + "s").join(", "));

if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
console.log(fails.length ? "hands FAIL " + fails.length : "hands PASS " + notes.length);
if (fails.length) process.exitCode = 1;
