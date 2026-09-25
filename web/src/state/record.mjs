import { shotOutcome } from '../../../src/reality.mjs';

// 실제 판정의 세 갈래를 장부와 경기장 조건이 같은 이름으로 읽는다.
export function recordShot(record, name, result) {
  if (!name) return;
  const row = record[name] || (record[name] = { saved: 0, conceded: 0, missed: 0 });
  const key = shotOutcome(result);
  // 빈 칸은 영에서 시작하고 완료한 슛 하나가 한 결과 칸만 올린다.
  row[key] = (row[key] || 0) + 1;
}
