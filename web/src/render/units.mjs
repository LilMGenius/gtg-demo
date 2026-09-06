// 렌더 단위와 공용 보조 함수. 판정 단위는 여기에 없다.
import * as THREE from '../../vendor/three.module.min.js';
import { GOAL_HALF_W, GOAL_H } from '../../../src/chain.mjs';

/* 밝기를 세 단으로 끊는 자. 램버트는 면을 매끄럽게 깎아 3D 렌더로 읽히고, 끊긴 면은 그림으로 읽힌다.
   Nearest로 물려야 단 사이가 계단으로 남는다. 선형으로 물리면 다시 매끄러운 면이 된다.
   값은 셋이고 칸은 넷이다. 칸 수가 경계 자리를 정하기 때문이다. 세 칸이면 경계가 dotNL 0.33 두 곳에
   못 박히는데, 카메라가 보는 등은 왼쪽 끝 -0.56에서 오른쪽 끝 0.56까지 가고 가운데가 0.37이라
   그 경계로는 어두운 단이 왼쪽 한 줄만 먹었다. 실측으로 유니폼 화소의 4에서 10퍼센트였다.
   네 칸이면 경계가 0과 0.5에 서고 등이 셋으로 갈린다. 값 0과 0.35와 1.0은 램버트가 그 세 구간에서
   내던 평균 0과 0.25와 0.75 위에 얹은 것이라, 밝기는 그 자리에 두고 경계만 세운다. */
const RAMP = new THREE.DataTexture(new Uint8Array([0, 0, 89, 255]), 4, 1, THREE.RedFormat);
RAMP.minFilter = THREE.NearestFilter;
RAMP.magFilter = THREE.NearestFilter;
RAMP.generateMipmaps = false;
RAMP.needsUpdate = true;

export const flat = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: RAMP });
// 같은 색에 잡티를 얹은 재질. 색은 flat과 같고 밝기만 흔들린다.
export const flatMap = (c, tex) => new THREE.MeshToonMaterial({ color: c, map: tex, gradientMap: RAMP });
// 정점색을 쓰는 재질. 재질 색과 곱해지므로 밑색은 흰색에 가깝게 둔다.
export const flatVertex = (c) => new THREE.MeshToonMaterial({ color: c, vertexColors: true, gradientMap: RAMP });
// 바닥 두 판은 평면이라 법선이 한 방향뿐이다. 세 단으로 끊어도 한 단만 쓰고 밝기만 오른다.
// 흙은 조명 개수를 줄일 때 밝기를 맞대는 면이라 재질을 안 바꾼 채로 둔다.
export const flatLit = (c, tex) => new THREE.MeshLambertMaterial({ color: c, map: tex });
export const BALL_R = 0.14;

// 먹힌 공이 설 수 있는 골 입구 안쪽 한계. 골대 반폭 2.2에서 공 반지름과 그물 두께를 뺀 자리다.
// 이 밖에서 끝난 공은 골망 밖에 서고, 그러면 자막만 먹혔다고 말하고 그림은 아니라고 말한다.
// 꼬리 세 갈래가 같은 수를 따로 들고 있었다. 한 곳에서 읽는다.
export const MOUTH_X = 2.0;
// 화면 좌우와 판정 좌우를 맞추는 부호. 판정식은 건드리지 않는다.
export const VIEW_X = -1;
// 키커가 공 바로 뒤에 서면 대기 내내 공을 가린다. 측정값: 23프레임 연속 사라짐.
export const KICKER_OFF = 1.15;
// 골망 뒷면은 z = -1.5다. 1.09는 공을 z = -0.88에 세운다. 그물 앞 허공이다.
// 1.134가 공 반경만큼 그물에서 떨어진 자리다. 여기서 멈춰야 그물이 공을 받아낸 것으로 읽힌다.
export const BALL_PAST = 1.134;
// 꼬리 연출에서 공이 멈추는 자리. 그물에 닿지 않으면 들어간 게 아니라 허공에 선 것이 된다.
export const REST_Z = -1.36;
// 0.95는 화면에서 골라인 흰 줄과 공 아랫변이 정확히 맞물리는 높이였다.
// 골이 들어간 컷인데 공이 라인 위에 놓인 그림이 되어 득점으로 안 읽혔다.
// 골 높이 2.44의 위쪽 절반에 걸어야 공중에 걸린 것으로 읽힌다.
export const REST_Y = 1.34;
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

// 지오메트리 여러 개를 한 장으로 붙인다. 메시를 더 만들면 그만큼 드로우콜이 늘고,
// 행인 다섯에게 팔을 달면 예산을 넘긴다. 모양은 늘리되 부를 것은 그대로 둔다.
export function mergeGeos(list, colors) {
  let n = 0;
  let ni = 0;
  for (const g of list) { n += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  const idx = new Uint16Array(ni);
  // 색을 안 주면 정점색 자체를 만들지 않는다. 이미 이 함수를 쓰는 곳들은 단색 재질이라
  // 빈 color 어트리뷰트가 붙으면 검게 곱해진다.
  const col = colors ? new Float32Array(n * 3) : null;
  const tmp = colors ? new THREE.Color() : null;
  let vo = 0;
  let io2 = 0;
  for (let gi = 0; gi < list.length; gi += 1) {
    const g = list[gi];
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    if (col) {
      tmp.setHex(colors[gi]);
      for (let i = 0; i < g.attributes.position.count; i += 1) {
        col[(vo + i) * 3] = tmp.r;
        col[(vo + i) * 3 + 1] = tmp.g;
        col[(vo + i) * 3 + 2] = tmp.b;
      }
    }
    const src = g.index.array;
    for (let i = 0; i < src.length; i += 1) idx[io2 + i] = src[i] + vo;
    io2 += src.length;
    vo += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
