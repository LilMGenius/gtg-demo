// 렌더 단위와 공용 보조 함수. 판정 단위는 여기에 없다.
import * as THREE from '../../vendor/three.module.min.js';
import { GOAL_HALF_W, GOAL_H } from '../../../src/chain.mjs';

export const flat = (c) => new THREE.MeshLambertMaterial({ color: c });
// 같은 색에 잡티를 얹은 재질. 색은 flat과 같고 밝기만 흔들린다.
export const flatMap = (c, tex) => new THREE.MeshLambertMaterial({ color: c, map: tex });
export const BALL_R = 0.14;
// 화면 좌우와 판정 좌우를 맞추는 부호. 판정식은 건드리지 않는다.
export const VIEW_X = -1;
// 키커가 공 바로 뒤에 서면 대기 내내 공을 가린다. 측정값: 23프레임 연속 사라짐.
export const KICKER_OFF = 1.15;
// 골망은 z = -0.75에 있다. q가 1.09면 공이 딱 그 자리에서 선다.
export const BALL_PAST = 1.09;
// 골망 안에서 공이 멈추는 자리. 더 깊이 보내면 카메라가 가까워 공이 프레임 아래로 내려간다.
export const REST_Z = -0.7;
export const REST_Y = 0.95;
// 판정 단위와 렌더 미터는 같지 않다.
// 판정의 골대는 4.4 x 1.9이고 사람은 1.9이라 키퍼 머리가 크로스바에 닿는다.
// 실제 골대는 7.32 x 2.44다. 그 비율로 그려야 사람이 골대 안에 들어간다.
// 판정식은 건들지 않는다. 여기서 단위만 바꾼다.
export const R_HALF_W = 3.66;
export const R_H = 2.44;
export const SX = R_HALF_W / GOAL_HALF_W;
export const SY = R_H / GOAL_H;
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => t * t * (3 - 2 * t);
// 캡슐은 중심 기준이라 반경만큼 더 내려간다. 눈대중으로 놓으면 발이 흙 속에 묻힌다.
export const standOnGround = (g) => {
  const b = new THREE.Box3().setFromObject(g);
  for (const c of g.children) c.position.y -= b.min.y;
};
