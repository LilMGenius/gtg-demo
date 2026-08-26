import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, makeRng, newKeeper, buildSet } from "../src/chain.mjs";
import { LEDGER } from "../src/ledger.mjs";

// C1. 한 구는 단계 넷에서 끊기고 롤은 여섯까지 굴러간다.
// 실점했으면 원인이 반드시 붙는다. 원인 없는 실점은 사고 원장 밖이다.

function play(seed, keeper, opts) {
  const rng = makeRng(seed);
  const shots = buildSet(rng, keeper.level || 5);
  const out = [];
  for (const shot of shots) {
    out.push(resolve(Object.assign({ keeper, shot, rng }, opts || {})));
  }
  return out;
}

test("C1-a 단계는 넷을 안 넘는다", () => {
  const keeper = newKeeper();
  for (let seed = 1; seed <= 400; seed++) {
    for (const r of play(seed, keeper)) {
      assert.ok(r.stage >= 1 && r.stage <= 4, "stage=" + r.stage + " seed=" + seed);
    }
  }
});

test("C1-b 롤은 여섯을 안 넘는다", () => {
  const keeper = newKeeper();
  for (let seed = 1; seed <= 400; seed++) {
    for (const r of play(seed, keeper)) {
      assert.ok(r.rolls >= 1 && r.rolls <= 6, "rolls=" + r.rolls + " seed=" + seed);
    }
  }
});

test("C1-c 실점이면 원인이 붙는다", () => {
  const keeper = newKeeper();
  for (let seed = 1; seed <= 400; seed++) {
    for (const r of play(seed, keeper)) {
      if (r.conceded) assert.ok(r.cause !== null && r.cause !== undefined, "cause null seed=" + seed);
      else assert.equal(r.cause, null, "세이브에 원인이 붙었다 seed=" + seed);
    }
  }
});

test("C1-d 원인은 원장 안에 있다", () => {
  const keeper = newKeeper();
  for (let seed = 1; seed <= 400; seed++) {
    for (const r of play(seed, keeper)) {
      if (r.cause) assert.ok(LEDGER.includes(r.cause), "원장 밖 원인 " + r.cause);
    }
  }
});

test("C1-e 마지막 롤이 열려 있다", () => {
  // 빈 골대를 앞에 두고도 공격수가 넘길 수 있어야 반전이 끝까지 열린다.
  const keeper = newKeeper();
  let openGoalSaved = 0;
  let openGoalScored = 0;
  for (let seed = 1; seed <= 3000; seed++) {
    for (const r of play(seed, keeper)) {
      const last = r.events[r.events.length - 2];
      if (!last) continue;
      if (last.t === "skied") openGoalSaved++;
      if (last.t === "openGoalScored") openGoalScored++;
    }
  }
  assert.ok(openGoalSaved > 0, "빈 골대에서 세이브가 한 번도 안 났다");
  assert.ok(openGoalScored > 0, "빈 골대에서 실점이 한 번도 안 났다");
});

test("C1-f 같은 시드는 같은 결과를 낸다", () => {
  const keeper = newKeeper();
  const a = play(77, keeper).map((r) => r.conceded + ":" + r.cause);
  const b = play(77, keeper).map((r) => r.conceded + ":" + r.cause);
  assert.deepEqual(a, b);
});

test("C1-g 결과 이벤트가 마지막에 하나 있다", () => {
  const keeper = newKeeper();
  for (let seed = 1; seed <= 200; seed++) {
    for (const r of play(seed, keeper)) {
      const results = r.events.filter((e) => e.t === "result");
      assert.equal(results.length, 1);
      assert.equal(r.events[r.events.length - 1].t, "result");
    }
  }
});
