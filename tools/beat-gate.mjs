// 패드와 타이밍 자가 퇴역해 화살표의 준비·도움닫기·접촉·자동 다이빙 시간축을 잰다.
// 표면 재삽입·disabled·입력 배선 제거의 양성 대조군을 새 조작에서 유지한다.
// playwright 브라우저 게이트이므로 느린 쓸기만 실행한다.
import { positionGate } from './position-browser.mjs';
await positionGate('beat');
