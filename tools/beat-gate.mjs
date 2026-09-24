// 패드와 타이밍 자가 퇴역해 화살표의 준비·도움닫기·접촉·자동 다이빙 시간축을 잰다.
// 표면 재삽입·disabled·입력 배선 제거의 양성 대조군을 새 조작에서 유지한다.
// playwright 브라우저 게이트이므로 느린 쓸기만 실행한다.
import { positionGate } from './position-browser.mjs';
import { judgeWindow, keeperAtLevel, buildSet, makeRng } from '../src/chain.mjs';

// 퇴역한 띠의 기하 축만 걷고 반응속도와 축구화의 기존 양성 대조군은 유지한다.
// 씨앗 20의 첫 레벨 첫 구는 종전 브라우저 표본과 같은 고정 기준이다.
const rng = makeRng(20), keeper = keeperAtLevel(1, rng), shot = buildSet(rng, 1)[0];
// 반응속도 양끝 1/10, 차이 30ms와 축구화 0/3은 종전 대조군의 문턱 그대로다.
const slow = judgeWindow({...keeper, reflex:1}, shot, {studs:0}).slackMs;
const fast = judgeWindow({...keeper, reflex:10}, shot, {studs:0}).slackMs;
const bare = judgeWindow(keeper, shot, {studs:0}).slackMs;
const boot = judgeWindow(keeper, shot, {studs:3}).slackMs;
for (const [name, pass, values] of [
  ['control:a-slower-keeper-gets-a-narrower-band', slow < fast - 30, {slow,fast}],
  ['control:boots-widen-the-band', bare < boot, {bare,boot}]
]) {
  console.log((pass ? 'PASS ' : 'FAIL ') + name + ' ' + JSON.stringify(values));
  if (!pass) throw new Error(name);
}
await positionGate('beat');
