import { resolve, buildSet, makeRng, followerGain } from '../../../src/chain.mjs';
import { GROWABLE } from '../../../src/ledger.mjs';

/* 한 칸을 한 번 더 올리면 무엇이 얼마나 바뀌는가. 훈련장이 숫자 옆에 이 값을 세워야 올린 능력치가
   게임에서 무슨 일을 하는지가 위키를 열지 않고 읽힌다. 판정은 제품 resolve 그대로이고, 같은 시드를
   짝지어 한 칸만 다르게 굴리므로 차이는 그 칸의 몫이다. 봇 입력으로 잰다. 손 입력은 사람마다 달라
   한 수로 적을 수 없다.
   표본 수는 잡음과 대기의 교환이다. 한 칸 오름의 세이브 몫이 0.1에서 1.5퍼센트포인트라, 레벨 13 신인에서
   7500구는 다이빙 -0.23과 오프더볼 -0.15를 냈고 30000구에서 둘 다 0.1 아래로, 민첩성은 0.13에서 0.27로
   섰다. 노드에서 열여섯 번 굴리는 데 1초 안팎이라 창을 먼저 그리고 칸마다 쉬어 가며 채운다. */
export const IMPACT_SETS = 6000;
// 0.1 반올림 아래는 잡음과 못 가른다. 그 칸은 영향 없음으로 적는다.
export const IMPACT_FLOOR = 0.1;

function sample(keeper, level, city, sets) {
  let saved = 0, shots = 0, fans = 0;
  for (let s = 0; s < sets; s += 1) {
    const rng = makeRng(s + 90001);
    // resolve가 연속 실점을 키퍼에 적는다. 복사본에 굴려야 화면의 키퍼가 안 바뀐다.
    const k = { ...keeper, streak: 0 };
    for (const shot of buildSet(makeRng(s + 1), level, city)) {
      const r = resolve({ keeper: k, shot, rng });
      shots += 1;
      if (!r.conceded) saved += 1;
      fans += followerGain(k, r, city);
    }
  }
  return { save: saved / shots * 100, fans: fans / shots };
}

export function impactBase(keeper, city = 0, sets = IMPACT_SETS) {
  return sample(keeper, Math.max(1, keeper.level || 1), city, sets);
}

// cap보다 낮은 칸만 잰다. 반환은 세이브 퍼센트포인트 차와 팔로워 증가율.
export function statImpact(keeper, stat, base, city = 0, sets = IMPACT_SETS, cap = 10) {
  if (!GROWABLE.includes(stat) || keeper[stat] >= cap) return null;
  const after = sample({ ...keeper, [stat]: keeper[stat] + 1 }, Math.max(1, keeper.level || 1), city, sets);
  const save = after.save - base.save;
  const fans = base.fans > 0 ? (after.fans / base.fans - 1) * 100 : 0;
  return { save: Math.abs(save) < IMPACT_FLOOR ? 0 : save, fans: Math.abs(fans) < IMPACT_FLOOR * 10 ? 0 : fans };
}
// 지금 값이 훈련 안 한 1에 비해 벌어 주는 몫. 내 정보가 칸마다 적는다. 한 칸 올림(훈련장)과 다른 물음이라 함수도 다르다.
export function statHeld(keeper, stat, base, city = 0, sets = IMPACT_SETS) {
  if (!GROWABLE.includes(stat) || keeper[stat] <= 1) return { save: 0, fans: 0 };
  const bare = sample({ ...keeper, [stat]: 1 }, Math.max(1, keeper.level || 1), city, sets);
  const save = base.save - bare.save;
  const fans = bare.fans > 0 ? (base.fans / bare.fans - 1) * 100 : 0;
  return { save: Math.abs(save) < IMPACT_FLOOR ? 0 : save, fans: Math.abs(fans) < IMPACT_FLOOR * 10 ? 0 : fans };
}
