// 배우. 원시 도형뿐이지만 관절은 있다.
// 몸통 하나를 통째로 기울이면 T포즈를 회전시킨 것으로만 읽힌다.
// 어깨와 고관절을 끝단 피벗으로 세우고, 각도를 데이터로 둔다. 과장은 여기서 나온다.
import * as THREE from '../../../vendor/three.module.min.js';
import { mergeGeos, standOnGround } from '../units.mjs';
import { clothTex, inkTex } from '../texture.mjs';
// Three.js MIT CapsuleGeometry를 키트와 공유하고 기존 관절 피벗에 맞춰 복제한다.
// 출처: https://threejs.org/docs/pages/CapsuleGeometry.html (MIT, three 패키지 LICENSE).
const KIT = {cap:6, radial:16, sphere:20, rings:14, roughness:0.9}; // 키트의 둥근 외곽선과 넓은 무광 반사를 그대로 쓴다.
const capsuleCache = new Map();
function capsuleGeometry(radius, length) {
  const key = radius + ':' + length;
  if (!capsuleCache.has(key)) capsuleCache.set(key, new THREE.CapsuleGeometry(radius, length, KIT.cap, KIT.radial));
  return capsuleCache.get(key).clone();
}
function flat(color) { return new THREE.MeshStandardMaterial({color, roughness:KIT.roughness}); }
function flatMap(color, map) { const m=flat(color); m.map=map; return m; }
function flatVertex(color) { const m=flat(color); m.vertexColors=true; return m; }
// 키트는 매끈한 기하 자체로 실루엣을 만들므로 임의 정점 잡음과 복제 외곽선을 쓰지 않는다.

// 동공은 연출이 바꿔 끼우므로 재질을 밖에서 소유한다.
export const pupilMat = new THREE.MeshBasicMaterial({ color: 0x18140f });

// 관절 이름. 포즈는 이 열 개의 오일러각 묶음이다.
export const JOINTS = ['spine', 'neck', 'shL', 'elL', 'shR', 'elR', 'hipL', 'knL', 'hipR', 'knR'];

// 각도 규약. 사지는 피벗에서 아래로 뻗는다.
// rz 양수는 팔다리를 +x 쪽으로 젖힌다. rx 음수는 +z(키커 쪽, 카메라 반대)로 뻗는다.
// 좌우를 따로 적는다. 대칭인 몸은 마네킹으로 읽힌다.
export const POSES = {
  // 어깨 각이 0.64와 0.72로 갈렸을 뿐이라 정지 프레임에서는 좌우가 같은 각으로 읽혔다.
  // 무게를 한쪽 다리에 싣는다. 짚은 다리는 펴고 뜬 다리는 굽혀서 골반을 기울인다.
  // 공을 기다리는 자세. 무릎을 펴고 서면 정지 한 장에서 골키퍼가 아니라 그냥 서 있는 사람이다.
  // 무릎을 접고 두 팔을 대칭으로 벌린다. 이 실루엣 하나가 포지션을 말한다.
  // brace보다는 얕게 접는다. 대기 내내 brace로 서 있으면 매 순간이 절정이라 절정이 사라진다.
  ready: {
    spine: [-0.30, 0, 0], neck: [0.12, 0, 0],
    shL: [-0.30, 0, -0.78], elL: [-0.86, 0, 0.06],
    shR: [-0.36, 0, 0.84], elR: [-0.94, 0, -0.04],
    hipL: [-0.40, 0, -0.30], knL: [0.80, 0, 0],
    hipR: [-0.38, 0, 0.26], knR: [0.76, 0, 0]
  },
  brace: {
    spine: [-0.30, 0, 0], neck: [0.14, 0, 0],
    shL: [-0.78, 0, -1.08], elL: [-0.88, 0, 0.46],
    shR: [-0.82, 0, 1.14], elR: [-0.92, 0, -0.44],
    hipL: [-0.36, 0, -0.24], knL: [0.64, 0, 0],
    hipR: [-0.34, 0, 0.26], knR: [0.62, 0, 0]
  },
  // 하늘로 넘어갔다. brace를 돌려쓰니 막으려던 컷과 넘긴 컷이 같은 그림이었다.
  // 몸은 뒤로 젖혀지고 두 팔은 머리 위로 올라가며 시선이 바를 넘어간 공을 따라간다.
  skyward: {
    spine: [0.30, 0, 0.06], neck: [0.55, 0, 0],
    shL: [0.10, 0, -2.55], elL: [-0.30, 0, 0.20],
    shR: [0.14, 0, 2.62], elR: [-0.26, 0, -0.18],
    hipL: [0.22, 0, -0.20], knL: [0.30, 0, 0],
    hipR: [-0.30, 0, 0.18], knR: [0.62, 0, 0]
  },
  // 다이빙. 두 팔이 같은 쪽을 가리켜야 뻗은 것으로 보인다. 다리는 끌려간다.
  diveR: {
    spine: [-0.06, 0, -0.30], neck: [0.02, 0, -0.38],
    shL: [-0.34, 0, 1.78], elL: [-0.10, 0, 0.26],
    shR: [-0.28, 0, 2.02], elR: [-0.06, 0, -0.16],
    hipL: [0.16, 0, -0.58], knL: [0.52, 0, 0],
    hipR: [0.10, 0, -0.34], knR: [0.74, 0, 0]
  },
  // 잡았다. 공을 가슴에 안고 팔꿈치를 접는다.
  clutch: {
    spine: [-0.24, 0, 0.05], neck: [-0.10, 0, 0],
    shL: [-1.15, 0, -0.34], elL: [-1.40, 0, 0.52],
    shR: [-1.20, 0, 0.40], elR: [-1.46, 0, -0.50],
    hipL: [-0.18, 0, -0.12], knL: [0.34, 0, 0],
    hipR: [-0.16, 0, 0.14], knR: [0.30, 0, 0]
  },
  // 자빠짐. 무릎은 반대로 꺾이고 팔은 머리 위로 넘어간다. 정상 인체는 여기서 포기한다.
  faceplant: {
    spine: [-0.62, 0, 0.12], neck: [-0.52, 0, -0.18],
    shL: [-2.24, 0, -0.62], elL: [0.20, 0, 0.94],
    shR: [-2.36, 0, 0.68], elR: [0.24, 0, -0.88],
    hipL: [-0.54, 0, -0.46], knL: [1.42, 0, 0],
    hipR: [-0.48, 0, 0.50], knR: [1.30, 0, 0]
  },
  // 한눈판다. 상체가 옆으로 기울고 팔이 풀린다. 목은 연출이 따로 더 돌린다.
  // 기울기를 rz에 몰아준다. 카메라가 골대 뒤라 rx로만 푼 팔은 몸통에 겹쳐 대기 자세로 읽혔다.
  // 한쪽 팔은 바깥으로 날리고 반대쪽은 늘어뜨려 좌우를 깨뜨린다.
  swoon: {
    spine: [0.10, 0, 0.54], neck: [0.46, 0, 0.26],
    shL: [0.28, 0, -1.06], elL: [-0.16, 0, 0.12],
    shR: [0.44, 0, 0.34], elR: [-0.62, 0, -0.14],
    hipL: [-0.06, 0, -0.52], knL: [0.10, 0, 0],
    hipR: [-0.02, 0, 0.36], knR: [0.44, 0, 0]
  },
  /* 눈맞음 갈래의 자세들. 한 사건이 늘 같은 그림이면 두 번째부터 정보가 없다.
     전부 서 있는 자세에서 갈리므로 다이빙 계열과 실루엣이 안 겹친다. */
  // 셀카. 한 팔을 앞으로 뻗어 화면을 들고 상체를 뒤로 젖혀 둘이 다 들어가게 한다.
  // 팔만 들면 손 흔들기와 실루엣 거리가 0.337로 바 0.35에 못 미쳤다. 상체와 무릎까지
  // 같이 움직여야 두 갈래가 자막 없이도 다른 그림이 된다.
  selfie: {
    spine: [-0.30, 0, 0.52], neck: [0.46, 0, 0.62],
    shL: [-1.32, 0, -0.86], elL: [-1.30, 0, 0.40],
    shR: [-0.86, 0, 0.62], elR: [-1.42, 0, -0.30],
    hipL: [-0.36, 0, -0.34], knL: [0.52, 0, 0],
    hipR: [-0.10, 0, 0.30], knR: [0.20, 0, 0]
  },
  // 어부바. 허리를 앞으로 접고 두 팔을 뒤로 벌려 등을 내준다.
  piggy: {
    spine: [0.78, 0, 0], neck: [-0.34, 0, 0],
    shL: [1.02, 0, -0.62], elL: [-1.10, 0, 0.24],
    shR: [1.02, 0, 0.62], elR: [-1.10, 0, -0.24],
    hipL: [-0.30, 0, -0.26], knL: [0.46, 0, 0],
    hipR: [-0.30, 0, 0.26], knR: [0.46, 0, 0]
  },
  // 포옹. 두 팔을 앞으로 크게 벌려 감싼다.
  hug: {
    spine: [-0.10, 0, 0], neck: [0.18, 0, 0],
    shL: [-1.06, 0, -0.74], elL: [-0.86, 0, 0.44],
    shR: [-1.06, 0, 0.74], elR: [-0.86, 0, -0.44],
    hipL: [-0.04, 0, -0.22], knL: [0.10, 0, 0],
    hipR: [-0.04, 0, 0.22], knR: [0.10, 0, 0]
  },
  // 무릎 꿇기. 한쪽 무릎을 깊게 접고 상체를 세운 채 한 손을 내민다.
  kneel: {
    spine: [-0.16, 0, 0], neck: [0.22, 0, 0],
    shL: [-0.92, 0, -0.30], elL: [-0.42, 0, 0.18],
    shR: [0.30, 0, 0.34], elR: [-0.40, 0, -0.12],
    hipL: [-1.42, 0, -0.18], knL: [1.62, 0, 0],
    hipR: [-0.22, 0, 0.24], knR: [0.28, 0, 0]
  },
  // 네 발로 기기. 상체를 앞으로 완전히 접고 두 팔로 땅을 짚는다.
  crawl: {
    spine: [1.28, 0, 0], neck: [-0.72, 0, 0],
    shL: [-1.46, 0, -0.24], elL: [-0.18, 0, 0.10],
    shR: [-1.46, 0, 0.24], elR: [-0.18, 0, -0.10],
    hipL: [-1.10, 0, -0.22], knL: [1.30, 0, 0],
    hipR: [-1.10, 0, 0.22], knR: [1.30, 0, 0]
  },
  // 손 흔들기. 한 팔만 높이 들어 흔든다. 나머지는 서 있는 그대로다.
  wave: {
    spine: [0.04, 0, 0.12], neck: [0.24, 0, 0.20],
    shL: [-2.26, 0, -0.30], elL: [-0.44, 0, 0.26],
    shR: [0.30, 0, 0.28], elR: [-0.34, 0, -0.10],
    hipL: [-0.02, 0, -0.20], knL: [0.06, 0, 0],
    hipR: [-0.02, 0, 0.20], knR: [0.10, 0, 0]
  },
  // 쫓아붙기. 상체를 앞으로 내밀고 두 팔을 앞으로 뻗어 따라간다.
  // 이름을 follow로 두면 키커의 팔로스루와 한 이름이 된다. 갈래 자세는 trail이 소유한다.
  trail: {
    spine: [0.34, 0, 0.16], neck: [0.10, 0, 0.30],
    shL: [-1.18, 0, -0.46], elL: [-0.26, 0, 0.20],
    shR: [-1.02, 0, 0.40], elR: [-0.30, 0, -0.18],
    hipL: [-0.62, 0, -0.18], knL: [0.74, 0, 0],
    hipR: [-0.16, 0, 0.20], knR: [0.24, 0, 0]
  },
  // 개그. 상체를 뒤로 젖히고 두 팔을 벌린다. 웃기려고 몸을 던지는 자세다.
  joke: {
    spine: [-0.42, 0, 0], neck: [-0.30, 0, 0.18],
    shL: [-1.86, 0, -0.66], elL: [-0.30, 0, 0.34],
    shR: [-1.86, 0, 0.66], elR: [-0.30, 0, -0.34],
    hipL: [0.22, 0, -0.24], knL: [-0.18, 0, 0],
    hipR: [0.18, 0, 0.26], knR: [-0.14, 0, 0]
  },
  // 드리블하러 나간다. 달리는 팔다리 엇갈림.
  // 카메라가 뒤에 있으니 rx로만 흔든 팔은 시선축과 나란해 몸통에 파묻힌다.
  // 압으로 벌리는 것은 rz가 한다. 앞뒤 엇갈림은 rx에 남기고 폭만 줄인다.
  // 그 폭이 대기 자세의 어깨 각과 거의 같아서 나가는 컷이 서 있는 컷으로 읽혔다.
  // 팔은 대기보다 두 배로 벌리고 다리는 좌우로도 갈라야 달리는 실루엣이 된다.
  dribble: {
    spine: [-0.54, 0, -0.18], neck: [0.42, 0, 0.14],
    shL: [-0.32, 0, -1.28], elL: [-1.26, 0, 0.34],
    shR: [-0.30, 0, 1.66], elR: [-1.00, 0, -0.22],
    hipL: [-0.88, 0, -0.74], knL: [1.46, 0, 0],
    hipR: [0.66, 0, 0.64], knR: [0.22, 0, 0]
  },
  // 장갑이 벗겨졌다. 맨손이 된 쪽 팔만 끝까지 뻗고 반대쪽은 몸에 붙는다.
  // 고개가 그 손을 본다. 두 팔이 같은 쪽을 가리키는 다이빙과 여기서 갈린다.
  reachR: {
    spine: [-0.18, 0, -0.52], neck: [0.60, 0, -0.70],
    shL: [-0.72, 0, -0.58], elL: [-1.30, 0, -0.26],
    shR: [-0.20, 0, 2.48], elR: [0.10, 0, -0.06],
    hipL: [0.08, 0, 0.54], knL: [0.66, 0, 0],
    hipR: [-0.30, 0, -0.74], knR: [1.10, 0, 0]
  },
  // 쳐냈다. 손바닥으로 밀어낸 뒤 팔이 튕겨 접힌다. 몸은 아직 서 있다.
  swatR: {
    spine: [-0.34, 0, 0.22], neck: [0.16, 0, 0.10],
    shL: [-0.26, 0, -1.14], elL: [-0.40, 0, 0.30],
    shR: [-0.94, 0, 1.24], elR: [-1.70, 0, -1.10],
    hipL: [-0.50, 0, -0.34], knL: [0.98, 0, 0],
    hipR: [-0.20, 0, 0.44], knR: [0.44, 0, 0]
  },
  // 세게 밀어냈다. 팔이 몸을 가로질러 넘어가고 어깨가 따라 돌아간다.
  shoveR: {
    spine: [-0.10, 0, 0.62], neck: [-0.26, 0, 0.44],
    shL: [0.86, 0, -1.62], elL: [-0.30, 0, -0.50],
    shR: [-1.96, 0, 0.52], elR: [0.40, 0, 0.86],
    hipL: [-0.10, 0, -0.90], knL: [0.20, 0, 0],
    hipR: [0.52, 0, 0.18], knR: [1.24, 0, 0]
  },
  // 밀어냈는데 몸이 남았다. 같은 밀기지만 다리가 엇갈리고 바닥에 눌린다.
  sprawlR: {
    spine: [-0.86, 0, 0.34], neck: [0.44, 0, 0.30],
    shL: [-1.40, 0, -1.90], elL: [0.60, 0, -0.20],
    shR: [-2.10, 0, 1.30], elR: [0.70, 0, 0.30],
    hipL: [0.90, 0, 0.62], knL: [-0.60, 0, 0],
    hipR: [-1.20, 0, -0.20], knR: [1.60, 0, 0]
  },
  // 한 손으로 걷어 올려 잡았다. 가슴에 안는 것과는 다른 몸이다.
  snatch: {
    spine: [-0.42, 0, -0.34], neck: [-0.30, 0, -0.30],
    shL: [-0.16, 0, -0.44], elL: [-0.30, 0, 0.20],
    shR: [-2.30, 0, 0.60], elR: [-0.60, 0, -0.30],
    hipL: [-0.60, 0, -0.20], knL: [0.90, 0, 0],
    hipR: [-0.24, 0, 0.30], knR: [0.36, 0, 0]
  },
  // 공을 안은 채로 끌려 들어간다. 팔이 가슴에 묶여 있어서 손으로 못 짚는다.
  // 허벅지는 시선축에서 떼어 놓는다. hip rx가 -1.5면 허벅지가 카메라 정면을 향해
  // 한 점으로 줄고 몸통 뒤로 숨어서, 접힌 정강이만 떨어져 나온 토막으로 읽힌다.
  hugfall: {
    spine: [-0.94, 0, 0.10], neck: [0.52, 0, 0.14],
    shL: [1.02, 0, -0.66], elL: [-1.70, 0, 1.02],
    shR: [1.08, 0, 0.70], elR: [-1.74, 0, -0.98],
    hipL: [-1.06, 0, -0.64], knL: [1.16, 0, 0],
    hipR: [-0.84, 0, 0.72], knR: [1.02, 0, 0]
  },
  // 제껴졌다. 팔이 뒤로 휘청이고 상체가 돌아서 공을 쫓는다.
  // 상체 기울기와 다리 벌림도 rz로 키운다. 팔만 벌리면 밀어낸 컷과 폭이 겹친다.
  stumble: {
    spine: [0.40, 0, -0.66], neck: [-0.40, 0, -0.60],
    shL: [0.94, 0, -1.34], elL: [-0.70, 0, 0.40],
    shR: [1.10, 0, 1.42], elR: [-0.64, 0, -0.44],
    hipL: [0.36, 0, -0.88], knL: [1.14, 0, 0],
    hipR: [-1.10, 0, 0.60], knR: [0.20, 0, 0]
  },
  // 키커 준비. 디딤발은 버티고 차는 발은 뒤로 접힌다.
  // setPose uses joint-local Euler angles: faceDir only places face and boot geometry.
  // For the -z-facing kicker, negative leg rx winds back; positive rx swings toward the camera.
  windup: {
    // 양의 앞기울기로 지지발 위에 몸을 싣고 감은 어깨가 임팩트에서 반대로 풀리게 한다.
    spine: [0.32, 0.28, 0.2], neck: [-0.06, 0, 0],
    shL: [-0.52, 0, -0.34], elL: [-0.94, 0, 0.22],
    shR: [0.48, 0, 0.26], elR: [-0.70, 0, -0.18],
    hipL: [-0.16, 0, -0.10], knL: [0.24, 0, 0],
    hipR: [-0.95, 0, 0.48], knR: [-1.10, 0, 0] // 허벅지를 뒤로 0.95, 옆으로 0.48 돌리고 무릎을 1.10 접어 장화 외곽선을 몸 밖에 둔다.
  },
  // Plant releases the backswing before the strike so the foot keeps moving toward -z.
  plant: {
    // 양의 앞기울기로 지지발 위에 몸을 싣고 감은 어깨가 임팩트에서 반대로 풀리게 한다.
    spine: [0.44, 0.12, 0.22], neck: [-0.02, 0, 0.06],
    shL: [-0.92, 0, -0.58], elL: [-1.16, 0, 0.34],
    shR: [0.86, 0, 0.44], elR: [-0.52, 0, -0.26],
    hipL: [-0.24, 0, -0.12], knL: [0.36, 0, 0],
    hipR: [-0.10, 0, 0.14], knR: [-0.20, 0, 0]
  },
  strike: {
    // 양의 앞기울기로 지지발 위에 몸을 싣고 감은 어깨가 임팩트에서 반대로 풀리게 한다.
    spine: [0.5, -0.24, 0.18], neck: [-0.10, 0, 0],
    shL: [-1.10, 0, -0.78], elL: [-0.44, 0, 0.30],
    shR: [0.96, 0, 0.40], elR: [-0.24, 0, -0.16],
    hipL: [-0.06, 0, -0.12], knL: [0.16, 0, 0],
    hipR: [0.70, 0, 0.08], knR: [-0.12, 0, 0]
  },
  // 넣고 나서. 두 팔을 위로 벌리고 상체를 젖힌다. 다리 하나는 뒤로 차올린다.
  // 만세만 하면 벌서는 자세다. 골반이 앞으로 나가야 달려나가는 것으로 읽힌다.
  cheer: {
    spine: [0.34, 0, -0.08], neck: [-0.34, 0, 0.06],
    shL: [-0.46, 0, -2.42], elL: [-0.22, 0, 0.30],
    shR: [-0.40, 0, 2.36], elR: [-0.18, 0, -0.26],
    hipL: [-0.42, 0, -0.16], knL: [0.22, 0, 0],
    hipR: [0.74, 0, 0.18], knR: [1.48, 0, 0]
  },
  // 막혔다. 두 손이 머리로 올라가고 허리가 접힌다. 골대를 못 쳐다본다.
  despair: {
    spine: [-0.68, 0, 0.06], neck: [0.42, 0, -0.08],
    shL: [-2.34, 0, -0.46], elL: [-2.10, 0, 0.62],
    shR: [-2.28, 0, 0.52], elR: [-2.04, 0, -0.58],
    hipL: [-0.52, 0, -0.14], knL: [0.66, 0, 0],
    hipR: [-0.48, 0, 0.16], knR: [0.60, 0, 0]
  },
  // 팔로스루. 차는 다리가 임팩트를 지나치고 상체가 따라간다. 임팩트에서 멈추면 공을 밀었을 뿐이다.
  follow: {
    spine: [0.40, 0, 0.22], neck: [-0.16, 0, -0.06],
    shL: [-1.46, 0, -1.04], elL: [-0.30, 0, 0.42],
    shR: [1.30, 0, 0.54], elR: [-0.14, 0, -0.22],
    hipL: [-0.22, 0, -0.14], knL: [0.32, 0, 0],
    hipR: [1.25, 0, 0.06], knR: [-0.10, 0, 0]
  },
  /* 킥 종류별 예비. 키커 포즈는 여섯이고(windup plant strike follow cheer despair) 그중 감는 자세만
     종류를 탄다. 발이 공에 닿은 뒤의 셋은 접촉이 이미 정해 놓은 몸이라 종류가 아니라 결과가 소유한다.
     네 예비 자세의 실루엣 차이는 pose 게이트가 실제 관절의 월드 좌표로 잰다. */
  // 인사이드. 골반을 열고 차는 다리를 옆으로 돌린다. 감아 차는 발은 몸을 가로질러 들어온다.
  windInside: {
    // 양의 앞기울기로 지지발 위에 몸을 싣고 감은 어깨가 임팩트에서 반대로 풀리게 한다.
    spine: [0.22, 0.32, 0.38], neck: [-0.10, 0, 0.22],
    shL: [-0.30, 0, -0.90], elL: [-0.60, 0, 0.60],
    shR: [0.20, 0, 0.86], elR: [-1.10, 0, -0.30],
    hipL: [-0.10, 0, -0.34], knL: [0.20, 0, 0],
    hipR: [-0.70, 0, 0.90], knR: [-1.05, 0, 0] // 인사이드는 옆으로 0.90 열고 뒤로 0.70 감아 다른 슛과 발 방향을 구별한다.
  },
  // 인스텝. 발등으로 곧게 민다. 무릎을 뒤로 접고 상체를 조금 눕혀 축을 세운다.
  windInstep: {
    // 양의 앞기울기로 지지발 위에 몸을 싣고 감은 어깨가 임팩트에서 반대로 풀리게 한다.
    spine: [0.32, 0.28, 0.18], neck: [-0.02, 0, 0.04],
    shL: [-0.80, 0, -0.62], elL: [-1.10, 0, 0.30],
    shR: [0.72, 0, 0.44], elR: [-0.60, 0, -0.24],
    hipL: [-0.22, 0, -0.12], knL: [0.30, 0, 0],
    hipR: [-0.90, 0, 0.42], knR: [-1.20, 0, 0] // 인스텝은 무릎을 1.20 접되 옆 벌림을 0.42로 좁혀 곧게 차는 방향을 남긴다.
  },
  // 칩. 백스윙이 짧고 상체가 선다. 크게 감으면 퍼올리는 공이 아니라 그냥 강슛이 된다.
  windChip: {
    // 양의 앞기울기로 지지발 위에 몸을 싣고 감은 어깨가 임팩트에서 반대로 풀리게 한다.
    spine: [0.12, 0.12, 0.1], neck: [0.10, 0, 0],
    shL: [-0.20, 0, -0.18], elL: [-0.50, 0, 0.10],
    shR: [0.14, 0, 0.14], elR: [-0.36, 0, -0.08],
    hipL: [-0.08, 0, -0.08], knL: [0.14, 0, 0],
    hipR: [-0.42, 0, 0.24], knR: [-0.65, 0, 0] // 칩은 다른 슛의 절반 정도 감아 작은 예비 동작 안에서도 장화가 보이게 한다.
  },
  // 강슛. 고관절을 더 뒤로 젖히고 두 팔을 크게 벌려 균형을 잡는다.
  windPower: {
    // 양의 앞기울기로 지지발 위에 몸을 싣고 감은 어깨가 임팩트에서 반대로 풀리게 한다.
    spine: [0.44, 0.4, 0.26], neck: [-0.24, 0, 0.06],
    shL: [-1.30, 0, -1.10], elL: [-0.70, 0, 0.50],
    shR: [1.20, 0, 0.80], elR: [-0.30, 0, -0.40],
    hipL: [-0.34, 0, -0.16], knL: [0.52, 0, 0],
    hipR: [-0.98, 0, 0.45], knR: [-1.22, 0, 0] // 강슛은 가장 큰 0.98 뒤감기와 1.22 무릎 접기로 발을 골반 뒤에서 끌어낸다.
  }
};

// 좌우를 뒤집는다. 다이빙 왼쪽은 오른쪽의 거울이지 별개 데이터가 아니다.
export function mirrorPose(p) {
  const flip = (a) => [a[0], -a[1], -a[2]];
  return {
    spine: flip(p.spine), neck: flip(p.neck),
    shL: flip(p.shR), elL: flip(p.elR),
    shR: flip(p.shL), elR: flip(p.elL),
    hipL: flip(p.hipR), knL: flip(p.knR),
    hipR: flip(p.hipL), knR: flip(p.knL)
  };
}
POSES.diveL = mirrorPose(POSES.diveR);
POSES.reachL = mirrorPose(POSES.reachR);
POSES.swatL = mirrorPose(POSES.swatR);
POSES.shoveL = mirrorPose(POSES.shoveR);
POSES.sprawlL = mirrorPose(POSES.sprawlR);

// 킥 종류에서 예비 자세로 가는 표. 종류 이름은 판정 칸이 아니라 화면이 shot에서 고른 이름이다.
export const KICK_WIND = {
  inside: POSES.windInside, instep: POSES.windInstep,
  chip: POSES.windChip, power: POSES.windPower
};

/* 세이브 포즈의 예비와 잔여. 사건마다 몸이 다르게 무너지는데 되감는 깊이와 떠는 주기는 상수 한 쌍이라,
   열두 세이브가 같은 박자로 지나갔다. ant는 최종 자세에서 사건 직전 몸 쪽으로 되미는 깊이이고
   (1이면 예비 없음), per는 그 뒤 감쇠 진동의 주기(초)다.
   두 수는 각자 제 몸에서 나온다. 표를 읽는 순서는 대기 자세에서 떨어진 관절 각 거리이고
   (실측 L2, 라디안, 줄머리에 적어 둔다) 그 거리는 진동 주기의 기본선이다. 멀리 무너진 몸일수록
   되돌아올 거리가 길어 오래 떨기 때문이다. 다만 그 거리가 못 보는 것이 셋 있고, 그 셋은 아래에
   예외로 적어 둔다. 예외는 이름을 적은 만큼만 허용되고, 넷째가 생기면 pose 게이트의 beat 축이
   빨개진다. 거리로 설명되지 않는 박자를 말없이 늘리지 않기 위한 자리다.
   ant는 이 순서를 따르지 않는다. 되감을 수 있는 깊이는 몸이 무너진 거리가 아니라 되감을 관절이
   남아 있는지가 정하고(팔 하나만 튕긴 몸은 그 팔을 깊게 되감을 수 있고, 공에 팔이 묶인 몸은 못 한다)
   그것은 한 축의 거리로 안 나온다. 그래서 ant에는 순서 주장을 걸지 않는다.
   고치기 전의 한 쌍은 1.22와 0.84초였고 표는 그 값을 reachR 자리에 두고 양쪽으로 벌린다.
   열두 줄은 세이브 열두 사건이 닿는 포즈다(자빠짐은 downed와 lost가 나눠 쓰고, 빈 골대의
   despair까지 포함한다). 좌우 거울은 같은 몸이라 같은 줄을 쓰고, 눈맞음 갈래의 자세는
   gaze 게이트가 소유하므로 기본값으로 남는다. */
export const POSE_BEAT = {
  // 1.694. 손바닥으로 쳐낸 팔만 튕겨 접힌다. 몸이 거의 안 무너져 예비도 잔여도 가장 짧다.
  swatR: { ant: 1.26, per: 0.58 },
  // 1.850. 공을 가슴에 안으면 진동을 공이 먹는다. 되감을 자리도 팔 안쪽뿐이다.
  clutch: { ant: 1.14, per: 0.62 },
  /* 1.944. 예외 하나. 이미 일어나 달려 나가는 몸이라 뒤로 되감으면 나가는 걸음이 끊긴다.
     떨림도 다음 동작이 먹어서 표에서 가장 짧다. 거리는 이 사건이 끝이 아니라 시작이라는 것을 못 본다. */
  dribble: { ant: 1.10, per: 0.50 },
  // 2.261. 한 손으로 걷어 올린다. 되감김은 깊고 진동은 팔 하나만 남아 짧다.
  snatch: { ant: 1.30, per: 0.72 },
  // 2.719. 손끝까지 뻗는다. 표의 가운데 줄이고 고치기 전의 한 쌍이 여기 서 있다.
  reachR: { ant: 1.22, per: 0.84 },
  // 2.871. 제껴져 휘청인다. 다리가 살아 있어 진동이 오래 남는다.
  stumble: { ant: 1.22, per: 0.94 },
  // 2.962. 공을 안은 채 끌려 들어간다. 팔이 묶여 못 짚으니 몸통이 길게 떤다.
  hugfall: { ant: 1.18, per: 1.02 },
  // 2.958. 넘어간 공을 올려다본다. 접촉이 없어 되감김은 얕고 몸은 천천히 흔들린다.
  skyward: { ant: 1.16, per: 1.06 },
  /* 3.251. 예외 둘. 팔이 몸을 가로질러 넘어가는 만큼 관절 각 거리는 크지만, 두 발이 땅에 남아
     몸통이 그 위에서 멈춘다. 진동을 받아 줄 땅이 있어 떨림이 짧다. 거리는 발이 어디 있는지를 못 본다. */
  shoveR: { ant: 1.32, per: 0.86 },
  /* 3.429. 예외 셋. 팔과 허리를 한 번에 접어 각 거리가 크지만 공에 닿은 적이 없다. 받은 충격이
     없으니 떨 것도 없고, 두 발도 그대로 땅에 있다. 거리는 접촉이 있었는지를 못 본다. */
  despair: { ant: 1.20, per: 0.78 },
  // 3.628. 무릎이 반대로 꺾이며 엎어진다. 깊게 되감고 길게 떤다.
  faceplant: { ant: 1.38, per: 1.12 },
  // 4.173. 바닥에 눌린 채로 남는다. 가장 멀리 무너지므로 표의 양 끝을 가진다.
  sprawlR: { ant: 1.40, per: 1.18 }
};
/* 거리 순서를 따르지 않는 세 줄. 이름을 여기 적은 것만 예외이고, 각각의 이유는 그 줄의 주석에 있다.
   넷째가 생기면 게이트가 빨개진다. 표를 고치는 사람은 그 줄의 물리를 여기에 같이 적어야 한다. */
export const BEAT_EXCEPT = ['dribble', 'shoveR', 'despair'];
// 표에 없는 포즈의 박자. 고치기 전에 열다섯 사건이 다 같이 쓰던 한 쌍이다.
export const BEAT_DEFAULT = { ant: 1.22, per: 0.84 };

// 포즈에서 그 몸의 박자로 가는 길. 거울까지 같은 줄에 걸어야 왼쪽으로 뛴 몸이 오른쪽과 다르게 떨지 않는다.
const BEAT_BY_POSE = new Map();
for (const name of Object.keys(POSE_BEAT)) {
  if (POSES[name]) BEAT_BY_POSE.set(POSES[name], POSE_BEAT[name]);
  const twin = name.endsWith('R') ? POSES[name.slice(0, -1) + 'L'] : null;
  if (twin) BEAT_BY_POSE.set(twin, POSE_BEAT[name]);
}
export const beatOf = (pose) => BEAT_BY_POSE.get(pose) || BEAT_DEFAULT;

/* 두 자세 사이의 관절 각 거리. 몸이 목표 자세에 얼마나 도착했는지를 묻는 자리가 이 수를 쓴다.
   화면 실루엣이 아니라 각도로 재는 이유는, 도착 여부는 카메라가 어디 있든 같은 사실이어서다. */
export function poseDist(a, b) {
  let s = 0;
  for (const j of JOINTS) for (let i = 0; i < 3; i += 1) { const d = a[j][i] - b[j][i]; s += d * d; }
  return Math.sqrt(s);
}

export function lerpPose(a, b, t) {
  const k = Math.min(1, Math.max(0, t));
  const out = {};
  for (const j of JOINTS) {
    const x = a[j], y = b[j];
    out[j] = [x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k];
  }
  return out;
}

// 두 포즈를 잇는 선을 양쪽으로 늘린다. t가 0 미만이면 b의 반대쪽, 1을 넘으면 b 너머다.
// 예비와 잔여 동작은 새 데이터가 아니라 이 선의 바깥 구간이다. 사건마다 선이 다르므로
// 유도된 키도 사건마다 다르고, 포즈 표를 사건 수만큼 늘리지 않아도 된다.
export function pushPose(a, b, t) {
  const out = {};
  for (const j of JOINTS) {
    const x = a[j], y = b[j];
    out[j] = [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  }
  return out;
}

// 포즈를 뼈대에 얹는다. 정지 프레임은 만들지 않는다.
// 흔들림이 0이면 어떤 포즈든 마네킹으로 읽힌다.
export function setPose(g, pose, time = 0) {
  const j = g.userData.joints;
  if (!j) return;
  const s = g.userData.sway ?? 1;
  const w = (f, a) => Math.sin(time * f + g.userData.phase) * a * s;
  for (const name of JOINTS) {
    const p = pose[name];
    j[name].rotation.set(p[0], p[1], p[2]);
  }
  j.spine.rotation.z += w(2.9, 0.035);
  j.spine.rotation.x += w(1.7, 0.028);
  j.neck.rotation.y += w(1.3, 0.09);
  j.shL.rotation.z += w(2.6, 0.075);
  j.shR.rotation.z -= w(2.3, 0.085);
  j.elL.rotation.x += w(3.4, 0.06);
  j.elR.rotation.x -= w(3.1, 0.07);
  g.userData.pose = pose;
}

// 얼굴. 흰자 위에 검은 동공을 얹는다. 눈이 없으면 사람이 아니라 캡슐이다.
// dir은 얼굴이 보는 쪽이다. 키퍼는 키커를 보고, 키커는 렌즈 쪽을 본다.
// hairTone은 상점 헤어 등급의 색이고 hairCut은 그 등급의 형태다.
// 안 넘기면 기본 갈색에 기본 반구로 선다.
export function addFace(head, r, dir, skin, hairTone, hairCut, face) {
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xfbfbf5 });
  const darkMat = pupilMat.clone(); // 경기장의 알파 마스크 셰이더가 썸네일의 눈과 입에 새지 않게 재질을 분리한다.
  // 흰자 둘은 표정이 바뀌어도 자리가 그대로다. 한 장으로 붙여야 얼굴 하나가 드로우콜을 아홉 부르지 않는다.
  const whiteGeos = [];
  const eyes = [];
  for (const s of [-1, 1]) {
    /* 얼굴은 두 거리에서 쓰인다. 경기 화면은 골대 뒤에서 잡는 작은 뒤통수라 이목구비를
       크게 깎아야 읽히고, 상점 카드는 근접 초상이라 같은 크기가 흉물이 된다.
       먼 거리 기준으로만 깎아 흰자 지름이 머리 반지름의 0.68이었고, 두 개가 얼굴을 덮어
       파운더가 볼에 검은 김이 붙었다고 짚었다. 그 김은 입이고, 흰자에 밀려 자리가 없었다.
       가까운 쪽에 맞추고 먼 쪽은 facevis가 지킨다. 그 자가 열다섯 사건에서 얼굴 노출을 잰다. */
    const w = new THREE.SphereGeometry(r * 0.203, KIT.sphere, KIT.rings);
    w.scale(1, 1.15, 0.42);
    w.translate(s * r * 0.36, r * 0.095, dir * r * 0.9); // 키트 눈 간격과 작은 흰자를 구 표면에 맞춘다.
    whiteGeos.push(w);
    // 동공은 감정마다 따로 늘어난다. 붙이면 한쪽 배율이 반대쪽 눈을 밖으로 민다.
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.086, KIT.sphere, KIT.rings), darkMat);
    pupil.position.set(s * r * 0.36, r * 0.081, dir * r * 0.98); // 흰자 앞에 작은 동공을 둔다.
    pupil.scale.set(1, 1.5, 0.6); // 키트의 세로 눈동자 비율이다.
    head.add(pupil);
    eyes.push(pupil);
  }
  head.add(new THREE.Mesh(mergeGeos(whiteGeos), whiteMat));
  // 입은 벌어진 채로 둔다. 다물면 표정이 죽고, 벌리면 뭘 봐도 얼빠져 보인다.
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(r * 0.155, 8, 6), darkMat);
  mouth.position.set(0, -r * 0.4, dir * r * 0.9);
  // 폭이 좁으면 검은 원이 되어 공의 검은 오각 무늬와 구별이 안 된다. 가로로 눕혀야 입이다.
  mouth.scale.set(1.25, 0.38, 0.34); // 얇은 키트 입을 사건 표정의 기준 배율로 쓴다.
  head.add(mouth);
  // 카메라는 골대 뒤에 있다. 키퍼는 키커를 보므로 화면에 잡히는 건 언제나 뒤통수다.
  // 구 하나에 정수리 반구만 얹으면 그 아래가 굴곡 없는 살색 판이 되어 머리로 안 읽힌다.
  // 뒷머리가 뒤통수를 어두운 덩어리로 덮고, 귀 둘이 그 위에 밝은 점으로 떨어져 실루엣을 깨다.
  // 이 넷은 움직이지 않으므로 정점색 한 장으로 붙인다.
  // 껍데기 각과 배율을 등급이 정한다. 색만 바꾸면 네 값이 같은 실루엣을 판다.
  const cut = hairCut || { wide: 1, tall: 1, phi: 0.42, tilt: 0 };
  // 늘린 머리도 입 높이 아래로 내려오지 않는다. 반지름 1.05배는 위의 기존 껍데기 두께다.
  const hair = new THREE.SphereGeometry(r * 1.05, KIT.sphere, KIT.rings, 0, Math.PI * 2, 0, Math.min(Math.PI * cut.phi, Math.PI * 0.43));
  // 좌우로 죄면 볏이 되고 위로 늘리면 기른 머리가 된다. z는 그대로 둬야 뒤통수를 계속 덮는다.
  const hp=hair.attributes.position, hu=hair.attributes.uv;
  const height=Math.max(1,cut.tall)+(cut.phi>0.5&&cut.wide>0.9?0.22:0); // 넓은 탈색 헤어는 정수리를 더 세워 기본 커트와 실루엣이 갈리게 한다.
  for(let i=0;i<hp.count;i++){
    const blend=Math.min(1,hu.getY(i)*6); // 마지막 두 위도 띠만 두피에 접어 등급별 볏 높이를 보존한다. // 아랫단은 두피에 붙이고 정수리만 등급 비율로 늘린다.
    hp.setXYZ(i,hp.getX(i)*cut.wide,hp.getY(i)*(1+(height-1)*blend),hp.getZ(i));
  }
  hair.computeVertexNormals(); // 정수리 덮개는 피부 구보다 커야 낮은 헤어도 피부가 뚫고 나오지 않는다.
  // 집에서 깎은 머리는 한쪽이 눌린다. 라디안이라 0.07이면 4도쯤이다.
  if (cut.tilt) for(let i=0;i<hp.count;i++) hp.setX(i,hp.getX(i)+Math.sin(cut.tilt)*r*hu.getY(i)); // 눌린 정수리만 기울이고 두피 접촉선은 고정한다.
  // 정수리 껍질은 머리와 원점을 공유해야 헤어 아랫단이 두피에서 떠 있지 않는다.

  /* 목은 머리보다 가늘다. 1.12r로 시작하면 머리보다 굵어 어깨 위에 기둥이 서고,
     그 위에 밝은 칼라까지 얹혀 있어서 파운더가 목깁스를 찼다고 짚었다.
     0.62r은 두개골 반지름의 3분의 2로, 사람 목이 머리에 대해 갖는 비율에 가깝다. */
  const neck = new THREE.CylinderGeometry(r * 0.62, r * 0.58, r * 0.9, 8);
  neck.translate(0, -r * 0.92, -dir * r * 0.12);
  /* 칼라를 뺐다. 머리와 어깨 사이 값이 안 끊긴다는 문제에 실물에 없는 원반을 얹어
     풀었고, 사람은 없는 물건이 몸에 붙어 있으면 그것을 결함이 아니라 병으로 읽는다.
     값은 목을 가늘게 해서 끊는다. 가는 목은 양옆에 배경을 남기므로 그 자체가 경계다. */
  const shellGeos = [hair, neck]; // 정수리만 머리색으로 덮고 턱까지 내려오는 뒷머리 구는 쓰지 않는다.
  const shellColors = [hairTone || 0x2b1d14, skin]; // 목은 피부색이며 수염은 별도 데이터만 칠한다.
  /* 수염과 묶은 머리. 머리색과 피부색만으로는 백 명이 다섯 얼굴로 뭉친다.
     이 둘은 실루엣을 바꾸므로 카드 크기에서도, 경기장의 작은 머리에서도 갈린다.
     수염은 턱과 인중에 붙는 껍데기다. 1은 짧고 2는 덥수룩해서 조금 더 서고 넓다. */
  const beard = face && face.beard ? face.beard : 0;
  if (beard) {
    // 수염은 피부 구의 턱 표면을 따라가며 입과 볼은 비워 둔다. 면도는 이 분기 자체가 없다.
    const shape = face.beardShape || (beard === 1 ? 'stubble' : face.tail ? 'goatee' : 'full');
    const stubble = shape === 'stubble', goatee = shape === 'goatee';
    const shell = stubble ? 1.008 : goatee ? 1.025 : 1.018; // 잔수염은 피부 바로 위, 긴 수염만 턱 실루엣 밖으로 나온다.
    const span = Math.PI * (goatee ? 0.24 : stubble ? 1 : 1.1); // 염소수염은 턱끝만, 나머지는 아래턱 양옆까지 덮는다.
    const top = Math.acos(-0.52 / shell); // 입 아랫선보다 아래에서 시작해 볼과 입을 비운다.
    const chin = new THREE.SphereGeometry(r * shell, 32, 12,
      Math.PI * (dir > 0 ? 0.5 : 1.5) - span / 2, span, top, Math.PI - top); // 촘촘한 곡면이 각진 턱띠 대신 턱선을 따라간다.
    const jawPos = chin.attributes.position, jawUV = chin.attributes.uv;
    for (let i = 0; i < jawPos.count; i++) {
      const u = jawUV.getX(i), v = jawUV.getY(i);
      const lip = goatee ? -0.58 : stubble ? -0.45 - 0.20 * Math.sin(Math.PI * u) ** 2 : -0.30 - 0.28 * Math.sin(Math.PI * u) ** 2; // 풍성한 수염의 볼 가장자리는 -0.30에서 시작해 입 아래 -0.58까지 둥글게 내려간다. // 가운데는 입 아래로 파고 양옆은 아래턱을 따라 완만히 오른다.
      const begin = Math.acos(lip / shell), theta = begin + (Math.PI - begin) * (1 - v); // 기존 구의 위도를 다시 배치해 일자 턱띠를 없앤다.
      const phi = Math.atan2(jawPos.getZ(i), jawPos.getX(i));
      const full = !stubble && !goatee;
      const depth = full ? (Math.sin((1 - v) * Math.PI) * 0.60 + (1 - v) * 0.35) * r : 0; // 중간은 반경의 60% 부풀리고 끝은 35% 앞에 남겨 턱 아래로 이어지는 둥근 덩어리를 만든다.
      const drop = full ? (1 - v) * r * 0.70 : 0; // 턱 아래 반경의 70%까지 내려 잔수염과 풍성한 수염의 외곽선을 나눈다.
      jawPos.setXYZ(i, r * shell * Math.sin(theta) * Math.cos(phi), r * shell * Math.cos(theta) - drop, r * shell * Math.sin(theta) * Math.sin(phi) + dir * depth);
    }
    if (goatee) chin.scale(1, 1.08, 1); // 턱끝에만 짧은 술을 내려 둥근 공처럼 보이지 않게 한다.
    chin.computeVertexNormals();
    const musSpan = Math.PI * (goatee ? 0.13 : 0.20); // 콧수염은 입 폭 안팎의 얇은 조각이며 뺨으로 번지지 않는다.
    const musTop = Math.acos(-0.22 / shell), musBottom = Math.acos(-0.29 / shell); // 입 윗선과 콧수염 사이 피부 여백을 남긴다.
    const mus = new THREE.SphereGeometry(r * shell, 24, 4,
      Math.PI * (dir > 0 ? 0.5 : 1.5) - musSpan / 2, musSpan, musTop, musBottom - musTop); // 가는 윗입술 그림자를 매끄러운 곡면으로 만든다.
    const musPos = mus.attributes.position, musUV = mus.attributes.uv;
    for (let i = 0; i < musPos.count; i++) {
      const u = musUV.getX(i), v = musUV.getY(i);
      const middle = -0.25 + 0.035 * Math.cos(u * Math.PI * 2); // 인중에서 양끝으로 올라가는 짧은 콧수염 곡선이다.
      const y = middle + (v - 0.5) * 0.07 * Math.sin(u * Math.PI); // 양끝 두께를 줄여 직사각형 검은 띠가 되지 않게 한다.
      const phi = Math.atan2(musPos.getZ(i), musPos.getX(i)), radius = Math.sqrt(shell * shell - y * y) * r;
      musPos.setXYZ(i, radius * Math.cos(phi), y * r, radius * Math.sin(phi));
    }
    mus.computeVertexNormals();
    for (const g of [chin, mus]) {
      if (stubble) {
        const shade = flatVertex(0xffffff); // 흰 재질에 독립된 수염색 정점만 곱한다.
        shade.transparent = true; shade.opacity = 0.45; shade.depthWrite = false; // 잔수염은 피부 윤곽을 보존하는 얇은 음영이다.
        head.add(new THREE.Mesh(mergeGeos([g], [face.beardTone ?? 0x1c1712]), shade)); // 염색 색은 이 표면에 들어오지 않는다.
        continue;
      }
      shellGeos.push(g);
      // 수염은 독립된 짙은 갈색이다. 기존 기본색을 유지해 염색이 턱으로 새지 않는다.
      shellColors.push(face.beardTone ?? 0x1c1712);
    }
  }
  // 뒤로 묶은 머리. 뒤통수에서 뒤로 뻗는 덩어리 하나면 실루엣이 갈린다.
  if (face && face.tail) {
    const tail = new THREE.SphereGeometry(r * 0.46, 8, 6);
    tail.scale(0.72, 0.86, 1.5);
    tail.translate(0, r * 0.1, -dir * r * 1.16);
    shellGeos.push(tail);
    shellColors.push(hairTone || 0x2b1d14);
  }
  for (const s of [-1, 1]) {
    const ear = new THREE.SphereGeometry(r * 0.32, 8, 6);
    ear.scale(0.44, 1.05, 0.78);
    ear.translate(s * r * 0.92, r * 0.02, -dir * r * 0.06);
    shellGeos.push(ear);
    shellColors.push(skin);
  }
  head.add(new THREE.Mesh(mergeGeos(shellGeos, shellColors), flatVertex(0xffffff)));
  head.userData.eyes = eyes;
  head.userData.mouth = mouth;
  // 표정은 입 크기로 갈린다. 기준 배율을 여기서 넘겨야 쓰는 쪽이 상수를 두 번 적지 않는다.
  head.userData.mouthRest = mouth.scale.clone();
  head.userData.skin = skin;
  return head;
}

// 피벗이 끝단인 마디. 원점에서 아래로 뻗는다.
// 캡슐을 중앙 피벗으로 두면 어깨를 돌렸을 때 팔이 몸통을 관통한다.
// 사지에는 외곽선을 안 건다. 팔 여덟 개가 각자 복제본을 달면 드로우콜이 두 배가 되고,
// 가늘어서 어차피 선만 남는다. 실루엣을 만드는 건 몸통과 머리다.
function seg(radius, len, color, tag, salt, cuff, span, girth, ink) {
  const geo = capsuleGeometry(radius, len);
  geo.translate(0, -len / 2, 0);
  // 마디 중간에 밝은 띠를 하나 병합한다. 드로우콜은 그대로다.
  // 피벗 쪽에 두면 어깨 구와 몸통 측면에 묻혀 화면에 안 나온다.
  let m;
  if (Number.isFinite(ink)) {
    /* 문신은 팔에 끼운 고리가 아니라 맨살에 새긴 그림이다. 고리로 그리면 등급이 굵기만 바꾸고
       스티커와 이름 석 자와 먹토시가 화면에서 같은 물건으로 선다. 무늬를 캡슐 UV에 굽는다.
       재질 색을 흰색으로 두고 소매 색까지 텍스처가 칠하는 이유는 texture.mjs inkTex가 적어 둔다.
       메시는 그대로 하나라 드로우콜도 그대로다. 고리 갈래는 반바지 밑단이 계속 쓴다. */
    m = new THREE.Mesh(geo, flatMap(0xffffff, inkTex(color, cuff, ink, span, girth)));
  } else if (cuff) {
    // 띄의 높이를 데이터가 정한다. 아랫단은 그대로 두고 위로만 자라 어깨를 향해 덮는다.
    const h = len * (span || 0.16);
    // 감는 두께도 등급이 정한다. 면적만 늘리면 먹토시가 스티커를 길게 늘인 것으로 읽힌다.
    const rr = radius * 1.18 * (girth || 1);
    const ring = new THREE.CylinderGeometry(rr, rr, h, 8);
    // 아랫단을 팔꿈치 쪽에 고정하고 위로 자란다. 가운데를 고정하면 넓은 등급이 팔 밖으로 나간다.
    ring.translate(0, -(0.86 * len - h / 2), 0);
    m = new THREE.Mesh(mergeGeos([geo, ring], [color, cuff]), flatVertex(0xffffff));
  } else {
    m = new THREE.Mesh(geo, flat(color));
  }
  m.name = tag;
  // 사지는 얇다. 0.035를 그대로 주면 팔이 끊어진 것처럼 잘록해진다.

  return m;
}

function joint(parent, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  parent.add(o);
  return o;
}

// 뼈대 하나. 키퍼와 키커는 치수와 색만 다르다.
function buildBody(o) {
  const g = new THREE.Group();
  const tag = o.tag;
  const hip = joint(g, 0, o.hipY, 0);
  const spine = joint(hip, 0, 0, 0);

  // 품과 기장을 등급이 정한다. 뼈대는 안 건드린다. 관절을 같이 늘리면 팔이 몸통에서 떨어진다.
  const kc = o.kitCut || { girth: 1, len: 1, pad: 0 };
  const rigRadius = o.tag === 'keeper' ? o.torsoR * 0.55 / 0.85 : 0.16; // 기존 관절 높이를 보존해 몸통 폭이 사건 포즈의 누움 판정을 바꾸지 않게 한다.
  const torsoHeight = o.tag === 'keeper' ? 0.85 : 1; // 비평의 15% 단축을 목에도 적용해 머리를 짧은 장난감 몸통에 붙인다.
  const neckY = ((o.torsoLen + rigRadius) * kc.len - rigRadius * 0.18) * torsoHeight; // 사건 포즈의 기존 목 앵커다.
  const torsoGeo = capsuleGeometry(o.torsoR, o.torsoLen);
  torsoGeo.translate(0, o.torsoLen / 2, 0);
  torsoGeo.scale(kc.girth, kc.len, kc.girth);
  torsoGeo.scale(1, (neckY - o.headR * 0.1) / ((o.torsoLen + o.torsoR) * kc.len), 1); // 넓힌 몸통의 윗끝을 턱 아래로 내려 얼굴과 수염을 가리지 않는다.
  if (o.tag === 'keeper') {
    const positions = torsoGeo.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const lower = 1 - THREE.MathUtils.clamp(positions.getY(i) / neckY, 0, 1); // 목에서 골반까지 기존 높이를 정규화한다.
      const breadth = 1 + 0.15 * lower * kc.girth * kc.girth; // 기본 몸의 골반은 15% 넓히고 품이 큰 면티는 밑단을 더 퍼뜨려 몸에 붙는 체육복과 구별한다.
      positions.setXYZ(i, positions.getX(i) * breadth, positions.getY(i), positions.getZ(i) * breadth);
    }
    torsoGeo.computeVertexNormals();
  }
  // 유니폼 한 장이 단색이면 사람이 아니라 색 견본이다. 구겨진 명암이 옷을 옷으로 만든다.
  const torso = new THREE.Mesh(torsoGeo, flat(o.shirt));
  torso.name = tag;


  spine.add(torso);

  /* 목은 몸통 위에 선다. 상의 등급이 몸통을 세로 kc.len으로 늘리는데 이 자리를 원래
     기장으로 두었더니 머리가 통째로 옷 안에 잠겼다. 실측으로 시작 상의(len 1.26)에서
     정수리가 몸통 꼭대기보다 0.05m 아래였고, 머리가 화면에서 가진 칸이 312칸 중 21칸이었다.
     팔은 그대로 둔다. 어깨는 몸통 옆면에 붙지 윗면에 붙지 않아 기장을 안 탄다. */
  /* 그래서 기준을 기장이 아니라 몸통 꼭대기로 옮긴다. 목은 꼭대기에서 몸통 반경의 0.65만큼
     아래이고 그 거리는 옷을 안 탄다. kc.len이 1이면 원래 값 torsoLen + 0.35 torsoR과 같다. */
  /* 0.65는 원래 붙임새인데 눈이 옷깃 아래 0.067m로 잠긴다. 반대로 0.05는 눈이 뜨는 대신
     머리를 몸통 꼭대기까지 올려 머리가 몸에서 떨어져 보인다. 파운더가 그 둘을 차례로 짚었다.
     0.18은 눈이 뜨는 선에서 머리를 가장 낮게 놓는 자리다. 실측으로 가장 나쁜 등급이 0.006m다.
     두 조건이 반대 방향이라 여유를 더 주면 다시 떠오르므로 이 값은 최대가 아니라 경계다. */
  const neck = joint(spine, 0, neckY, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(o.headR, KIT.sphere, KIT.rings), flat(o.skin));
  head.name = tag;
  head.position.y = o.headR * 0.92;
  // 머리는 작다. 몸통과 같은 진폭을 주면 두개골이 찌그러진 것으로 읽힌다.


  addFace(head, o.headR, o.faceDir, o.skin, o.hair, o.hairCut, o.face);
  neck.add(head);

  const joints = { spine, neck };
  const arms = [];
  const gloves = [];
  const gloveParent = [];
  // 축구화 칸은 축구화를 겨냥해야 한다. 무릎에서 상수만큼 내려가 잡으면 그 상수가 키를 안 따라가고,
  // 칸에 정강이만 담긴다. 실제 메시를 들고 있으면 겨냥이 몸 크기와 같이 움직인다.
  const boots = [];
  const bareHands = [];
  for (const side of [-1, 1]) {
    const k = side < 0 ? 'L' : 'R';
    const sh = joint(spine, side * o.shoulderX, o.torsoLen * 0.92, 0);
    // 어깨에 살이 없으면 팔이 몸통 옆에 떠 있는 별개 물체로 읽힌다.
    // 팔을 어느 각도로 돌려도 피벗에 있는 이 구가 몸통과 팔 사이를 메운다.
    const delt = new THREE.Mesh(new THREE.SphereGeometry(o.armR * 1.45, KIT.sphere, KIT.rings), flat(o.sleeve));
    delt.name = tag;

    sh.add(delt);
    // 어깨 스펀지. 상의 색이라 무엇이 두꺼워졌는지가 그 옷의 색으로 읽힌다.
    // 어깨 삼각근 구가 반지름 1.45라, 그 안에 넣으면 스펀지를 사도 화면이 그대로다.
    // 구 위로 올려 얹어야 어깨선이 각지고 넓어진 것이 보인다.
    if (kc.pad) {
      /* 폭을 팔 반지름으로만 잡으면 그 폭이 키만 따라간다. 품은 몸무게가 정하므로, 짧고 무거운 몸은
         상의가 옆으로 가장 넓어지는 자리에서 스펀지가 가장 작다. 실측 165/96에서 1등급과 3등급이 칠한
         자리의 0.765를 공유해 상한 0.75를 넘었고, 같은 쌍이 188/84에서 0.655였다. 그래서 폭에 몸통 품을 싣는다.
         깊이는 안 싣는다. 어깨에 박힌 스펀지는 옆으로 넓지 앞뒤로 두껍지 않고, 깊이를 같이 키우면
         상자 뒷모서리가 위로 올라와 어깨선이 칸 위 변에 닿는다. 실측으로 그때 어깨 상자 위끝의 여유가
         0.112에서 0.047로 줄었다. */
      const th = o.armR * 1.1 * kc.pad;
      const wide = o.armR * 1.9 + o.torsoR * kc.girth * 0.9;
      const pad = new THREE.Mesh(new THREE.BoxGeometry(wide, th, o.armR * 2.7), flat(o.shirt));
      pad.name = tag;

      /* 몸통 껍질 폭 0.05를 어깨 여유의 단위로 쓴다. 준비 자세의 어깨는 기울어 있어 로컬 y만
         올리면 스펀지가 목 안으로 들어간다. 작은 스펀지는 덜 올리고 두꺼운 저지는 더 솟는다.
         외곽선은 handmade.mjs의 addOutline을 장갑과 축구화의 폭 0.028로 그대로 쓴다. */
      pad.position.set(side * (o.armR * 1.1 + Math.max(1, kc.pad) * 0.05), o.armR * 1.15 + th * 0.3 - 0.05, o.armR * 1.2); // 넓은 상체 앞쪽에 어깨 패드를 앉혀 양쪽이 가려지지 않게 한다.

      sh.add(pad);
    }
    const upper = seg(o.armR, o.upperLen, o.sleeve, tag, side < 0 ? 21 : 22, o.cuffSleeve, o.cuffSpan, o.cuffGirth, o.inkGrade);
    sh.add(upper);
    const el = joint(sh, 0, -o.upperLen, 0);
    const fore = seg(o.armR * 0.92, o.foreLen, o.skin, tag, side < 0 ? 23 : 24);
    el.add(fore);
    joints['sh' + k] = sh;
    joints['el' + k] = el;
    arms.push(sh);
    if (o.gloveSize) {
      // 손 크기와 손목밴드와 빨판을 등급이 정한다. 색만 바꾸면 목장갑과 빨판 장갑이
      // 같은 벙어리장갑으로 서고, 820을 치른 이유가 화면에 없다.
      const gc = o.gloveCut || { bulk: 1, cuff: 1, pips: 0 };
      const s = o.gloveSize * gc.bulk;
      // 정육면체는 어느 각도에서 봐도 노란 상자다. 벗겨져 날아가는 순간에는 카드 한 장으로 읽혔다.
      // 손바닥, 엄지, 손목밴드를 하나로 병합한다. 실루엣이 벙어리장갑이 되고 드로우콜은 그대로 하나다.
      const palm = new THREE.SphereGeometry(s * 0.5, KIT.sphere, KIT.rings); // 기존 손 폭 안에서 벙어리장갑을 둥글게 만든다.
      palm.scale(1, 1.15, 0.5); // 장갑 앵커와 등급별 폭을 보존한다.
      const thumb = new THREE.SphereGeometry(s * 0.26, KIT.sphere, KIT.rings); // 엄지는 손바닥보다 작은 둥근 덩어리다.
      thumb.scale(0.85, 1, 0.88); // 기존 엄지의 접촉 범위를 보존한다.
      thumb.translate(side * s * 0.6, s * 0.1, 0);
      const cuffH = s * 0.32 * gc.cuff;
      const cuff = new THREE.BoxGeometry(s * 1.12, cuffH, s * 0.58);
      // 손바닥 위에서 시작해 위로 자란다. 가운데를 고정하면 밴드가 길수록 손을 파고든다.
      cuff.translate(0, s * 0.575 + cuffH * 0.5, 0);
      const hand = [palm, thumb, cuff];
      // 빨판은 손바닥 바깥면에 붙는다. 공을 잡는 면이라 카메라가 보는 쪽이기도 하다.
      for (let n = 0; n < gc.pips; n++) {
        // 가운데 하나에 네 귀퉁이. 다섯을 한 줄로 깔면 손가락 자국으로 읽힌다.
        const col = n === 0 ? 0 : (n % 2 === 0 ? 1 : -1);
        const row = n === 0 ? 0 : (n <= 2 ? 1 : -1);
        const pip = new THREE.BoxGeometry(s * 0.2, s * 0.2, s * 0.22);
        /* 0.3s는 빨판을 손바닥에 반쯤 묻는 자리다. 손바닥 앞면이 0.25s이고 돌기가 0.22s라
           0.19s에서 0.41s를 차지해 뒤쪽이 손에 먹혔고, 등급 이름이 파는 그 돌기가 실루엣에는
           0.16s만 섰다. 0.42s는 돌기가 통째로 손바닥 앞에 서는 자리다. 실측으로 같은 값에서
           자리만 옮겼더니 2등급과 3등급이 나눠 쓴 자리가 0.708에서 0.660으로 떨어졌다.
           수로는 못 고친다. col과 row가 n의 홀짝과 n<=2로만 갈려서 다섯을 넘긴 빨판은 같은
           다섯 자리에 겹쳐 쌓인다. 실측: 돌기를 아예 빼면 이 선반의 최악 쌍이 0.801에서
           0.853으로 오른다. */
        pip.translate(col * s * 0.28, row * s * 0.3, s * 0.26); // 둥근 손바닥 가장자리에도 빨판 뒷면이 닿도록 얕게 붙인다.
        hand.push(pip);
      }
      const gv = new THREE.Mesh(mergeGeos(hand), flatMap(o.gloveTone || 0xf2d64b, clothTex()));
      gv.name = tag;
      gv.userData.partVertices = hand.map(g => g.attributes.position.count); // 합친 장갑의 조각 경계를 계기가 실제 기하에서 읽는다.
      gv.geometry.computeBoundingBox();
      // 장갑은 화면에서 가장 자주 보는 물건이다. 직육면체 그대로면 여기서 티가 제일 크게 난다.


      gv.position.set(0, -o.foreLen - s * 0.2, 0);
      el.add(gv);
      gloves.push(gv);
      gloveParent.push(el);
      // 장갑이 벗겨지면 그 손은 빈팔이 된다. 맨손을 미리 깔아두고 숨겨둔다.
      // 장갑만 날리면 팔가 끝에서 잘린 것으로 보인다.
      const bh = new THREE.Mesh(new THREE.SphereGeometry(o.gloveSize * 0.42, 8, 6), flat(o.skin));
      bh.name = tag;


      bh.position.set(0, -o.foreLen - o.gloveSize * 0.16, 0);
      bh.visible = false;
      el.add(bh);
      bareHands.push(bh);
    }
    const hp = joint(hip, side * o.hipX, 0, 0);
    const thigh = seg(o.legR, o.thighLen, o.shorts, tag, side < 0 ? 41 : 42, o.cuffShorts);
    hp.add(thigh);
    const kn = joint(hp, 0, -o.thighLen, 0);
    // 양말 두께와 덧댄 것을 등급이 정한다. 색만 바꾸면 보호대를 사도 정강이가 그대로다.
    const sc = o.sockCut || { girth: 1, guard: 0, band: 0 };
    const shin = seg(o.legR * 0.82 * sc.girth, o.shinLen, o.socks, tag, side < 0 ? 43 : 44);
    kn.add(shin);
    // 보호대는 정강이 앞면에 덧댄 판이다. 얼굴이 보는 쪽이 앞이다.
    if (sc.guard) {
      const gd = new THREE.Mesh(new THREE.BoxGeometry(o.legR * 1.3, o.shinLen * 0.62, o.legR * 0.5 * sc.guard), flat(o.socks));
      gd.name = tag;

      gd.position.set(0, -o.shinLen * 0.46, o.faceDir * o.legR * 0.78);
      kn.add(gd);
    }
    // 그립 밴드는 발목을 한 바퀴 감는다.
    if (sc.band) {
      const bd = new THREE.Mesh(new THREE.CylinderGeometry(o.legR * 1.15 * sc.band, o.legR * 1.15 * sc.band, o.shinLen * 0.22, 8), flat(o.socks));
      bd.name = tag;

      bd.position.set(0, -o.shinLen * 0.86, 0);
      kn.add(bd);
    }
    // 축구화가 없으면 다리가 잘린 막대로 끝난다. 발은 실루엣에서 가장 아래에 있고 제일 먼저 보인다.
    if (o.bootLen) {
      // 포스트 렌더타깃이 8비트 선형이라 이보다 어두우면 세 채널이 각기 다른 정수로 반올림돼 색비가 깨진다.
      // 0x14100c는 화면에 (41,2,2) 순적색으로 나왔고, 0x2a241c부터 (26,17,17) 가죽 갈색이 보존된다.
      // 밑창과 돌기를 등급이 정한다. 색만 바꾸면 스터드 여섯 개라고 이름 붙은 신발과
      // 실내화가 같은 상자로 서고, 화면에서 880을 치른 이유가 안 보인다.
      const bc = o.bootCut || { sole: 1, long: 1, wide: 1, pips: 0, pip: 0, girth: 1 };
      const sole = o.legR * 0.9 * bc.sole;
      const span = o.bootLen * (bc.long || 1);
      // Three.js MIT 구를 기존 신발 봉투에 맞춰 눌러 둥근 발끝을 만들고 장비별 치수를 보존한다.
      const toe = new THREE.SphereGeometry(1, KIT.sphere, KIT.rings); // 공유 키트의 분할을 사용한다.
      toe.scale(o.legR * 1.5 * (bc.wide || 1) / 2, sole / 2, span / 2); // 기존 상자 폭과 높이와 길이의 절반이 구의 반축이다.
      const parts = [toe];
      // 돌기는 두 줄로 깐다. 한 줄이면 발바닥이 아니라 톱니로 읽힌다.
      const rows = Math.ceil(bc.pips / 2);
      for (let n = 0; n < bc.pips; n++) {
        const col = n % 2 === 0 ? -1 : 1;
        const row = Math.floor(n / 2);
        const len = o.legR * 0.32 * bc.pip; // 스파이크 돌기를 늘려 짧은 스터드와 카드 외곽선이 겹치지 않게 한다.
        const th = o.legR * 0.2 * (bc.girth || 1);
        const pip = new THREE.BoxGeometry(th, len, th);
        // 앞뒤로 고르게 편다. rows가 1이면 가운데 하나다.
        const z = rows > 1 ? (row / (rows - 1) - 0.5) * span * 0.72 : 0;
        pip.translate(col * o.legR * 0.4, -(sole + len) * 0.5, z);
        parts.push(pip);
      }
      const boot = new THREE.Mesh(mergeGeos(parts), flat(o.bootTone || 0x2a241c));
      boots.push(boot);
      boot.name = tag;

      // 발끝은 얼굴이 보는 쪽으로 나간다. 뒤꿈치는 발목 밑에 남긴다.
      boot.position.set(0, -o.shinLen - o.legR * 0.36, o.faceDir * (o.bootLen * 0.28));
      kn.add(boot);
    }
    joints['hip' + k] = hp;
    joints['kn' + k] = kn;
  }

  g.userData.joints = joints;
  g.userData.phase = o.phase;
  g.userData.arms = arms;
  g.userData.head = head;
  g.userData.torso = torso;
  g.userData.contactFeet = boots; // 장갑 없는 키커도 발 접촉 음영에 같은 앵커를 제공한다.
  setPose(g, o.rest, 0);
  standOnGround(g);
  if (gloves.length) {
    g.userData.gloves = gloves;
    g.userData.boots = boots;
    g.userData.gloveHome = gloves.map((m) => m.position.clone());
    g.userData.gloveParent = gloveParent;
    g.userData.bareHands = bareHands;
  }
  return g;
}

// look은 상점 외형이다. { hair, ink }. 없으면 기본 팔레트로 선다.
export function buildKeeper(height, weight, look) {
  const h = height / 100;
  const w = 0.30 + (weight - 84) * 0.0035;
  const g = buildBody({
    tag: 'keeper',
    hipY: h * 0.47,
    torsoR: w * 0.85, torsoLen: h * 0.27, // 넉넉한 키트 몸통을 기존 척추 길이에 붙인다.
    headR: h * 0.14, faceDir: 1, // 머리를 몸통 폭과 비슷하게 키워 장난감 비율로 읽힌다.
    shoulderX: w * 0.644, armR: h * 0.048, // 0.56×1.15인 어깨 폭으로 팔이 넓어진 옷 안에 잠기지 않게 한다.
    upperLen: h * 0.17, foreLen: h * 0.16,
    hipX: w * 0.48 * 1.15, legR: w * 0.45 * 1.15, // 비평의 15% 하반신 확장을 다리 간격에도 주어 발 사이 틈을 보존한다.
    // 몸통 반폭의 절반에 두툼한 다리를 두어 막대처럼 보이는 후면을 고친다.
    thighLen: h * 0.21, shinLen: h * 0.20,
    gloveSize: h * 0.115, bootLen: h * 0.14,
    // 반바지·양말·축구화가 전부 검정에 가까워 하반신이 기둥 하나로 뭉쳤다.
    // 양말이 상의와 같은 초록이면 몸이 누울 때 정강이가 몸통에서 떨어져 나온 조각으로 읽힌다.
    // 양말은 상의보다 두 밴드 밝은 청록으로 올려 다리 끝을 따로 세우고,
    // 반바지는 무릎 위치를 알려줄 정도로만 밝힌다.
    // 같은 초록을 어둡게만 내린 소매는 팔이 아니라 몸통에 진 그림자로 읽혔다.
    // 색상을 청록으로 꺾으면 밝기가 아니라 색이 팔을 세우고, 양말과 한 벌로 묶인다.
    shirt: (look && look.shirt) || 0x2f8f5b, kitCut: look && look.kitCut,
    /* 피부와 머리는 걸치는 것이 아니라 그 사람이다. 상점 헤어 등급을 산 사람만 look이 그것을 덮고,
       안 샀으면 그 선수 자신의 얼굴이 선다. face가 없으면 옛 기본값 그대로다. */
    sleeve: 0x073239, skin: (look && look.face && look.face.skin) || 0xe8c39a,
    shorts: 0x2b3b4e, socks: (look && look.sock) || 0x63d3e8, sockCut: look && look.sockCut,
    cuffSleeve: (look && look.ink) || 0x5f8f93, cuffSpan: (look && look.inkSpan) || 0.16, cuffGirth: (look && look.inkGirth) || 1,
    // 등급이 무늬를 고른다. 상점에 손댄 적 없는 사람은 0등급이라 맨살이고, 그것도 무늬 표의 한 칸이다.
    inkGrade: (look && look.inkGrade) || 0,
    cuffShorts: 0x6d8898, gloveTone: (look && look.glove) || 0xf2d64b,
    gloveCut: look && look.gloveCut,
    bootTone: (look && look.boot) || 0x2a241c, bootCut: look && look.bootCut,
    hair: (look && look.hair) || (look && look.face && look.face.hair),
    hairCut: (look && look.hairCut) || (look && look.face && look.face.cut),
    face: look && look.face,
    phase: 0.7, rest: POSES.ready
  });
  g.userData.girth = w;
  return g;
}

export function buildKicker(face) {
  const g = buildBody({
    tag: 'kicker',
    hipY: 0.88,
    torsoR: 0.25, torsoLen: 0.48, // 키커도 키퍼와 같은 둥근 몸통 폭을 쓴다.
    headR: 0.26, faceDir: -1, // 키커 얼굴도 같은 키트의 큰 머리 비율이다.
    shoulderX: 0.17, armR: 0.05,
    upperLen: 0.30, foreLen: 0.28,
    hipX: 0.15, legR: 0.14, // 키퍼와 같은 짧고 두툼한 장난감 다리 비율이며 양발 사이 틈을 남긴다.
    thighLen: 0.40, shinLen: 0.38,
    gloveSize: 0, bootLen: 0.24,
    // 카메라가 골대 뒤에 있어 크로스바가 키커의 다리를 가로로 자른다.
    // 흰 양말은 흰 바에, 남색 반바지는 어두운 그물 띠에 먹혀 잘린 조각이 다리로 안 읽힌다.
    // 배경 어느 띠에도 없는 색을 쓴다.
    // 키커도 사람이라 얼굴을 받는다. 안 주면 옛 기본값 그대로 선다.
    shirt: 0xc9483a, sleeve: 0x6d1c14, skin: (face && face.skin) || 0xd8a877,
    shorts: 0xede7d8, socks: 0xf2b431,
    hair: face && face.hair, hairCut: face && face.cut, face,
    phase: 2.1, rest: POSES.windup
  });
  return g;
}

const T = THREE; // 검증한 키트의 Three.js 기하와 관절 배선을 같은 렌더 모듈에서 쓴다.
// Three.js MIT CapsuleGeometry와 Quaternion.setFromUnitVectors를 그대로 사용하고 비율만 바꾼다: https://threejs.org/docs/pages/CapsuleGeometry.html
// 수치는 세계 미터 대신 머리가 넉넉한 장난감 비율이며 캡슐 끝이 관절을 덮도록 정했다.
const C = {cap:6, radial:16, sphere:20, rings:14, roughness:0.9, hip:0.73, chest:1.13, head:1.87, radius:0.37, torso:0.35, length:0.32, shoulder:0.4, arm:0.12, leg:0.14, foot:0.105, stride:0.92, lift:0.19};
// 피부와 옷은 참조 화면처럼 무광의 큰 색면으로 나누고 소품마다 실루엣을 다르게 잡았다.
export const PASSER_VARIANTS = [
  {id:'keeper',name:'골키퍼',shirt:0x168f89,pants:0x233d55,skin:0xdca078,hair:0x322821,width:1.08,height:1,prop:'gloves'}, // 넓은 상체와 청록색은 골키퍼를 먼저 읽게 한다.
  {id:'kicker',name:'키커',shirt:0xe56b4b,pants:0xf0e8d7,skin:0x995f42,hair:0x292627,width:0.96,height:1.04,prop:'band'}, // 주황과 밝은 반바지는 키퍼와 반대 색면이다.
  {id:'student',name:'학생',shirt:0xe8b343,pants:0x354d72,skin:0xe7b893,hair:0x332c36,width:0.92,height:0.92,prop:'pack'}, // 작은 체격과 큰 가방이 학생의 실루엣이다.
  {id:'office',name:'직장인',shirt:0x465e80,pants:0x27364f,skin:0xbf8465,hair:0x282b31,width:1.02,height:1.06,prop:'tie'}, // 길고 단정한 상체가 직장인 비율이다.
  {id:'delivery',name:'배달원',shirt:0xf0ba3c,pants:0x364346,skin:0xd59d72,hair:0x313332,width:1.14,height:0.98,prop:'helmet'}, // 헬멧과 상자 폭이 배달원의 원거리 표식이다.
  {id:'jogger',name:'운동객',shirt:0xdf6478,pants:0x633d64,skin:0x87533d,hair:0x252c2c,width:0.88,height:1.03,prop:'visor'}, // 좁은 몸과 바이저가 운동객을 구별한다.
  {id:'tourist',name:'관광객',shirt:0x76b8a9,pants:0xc89768,skin:0xe2ad85,hair:0x665047,width:1.18,height:0.98,prop:'hat'}, // 넓은 몸과 챙 모자가 관광객의 외곽선을 만든다.
  {id:'elder',name:'어르신',shirt:0xa28aad,pants:0x5f6178,skin:0xc9977e,hair:0xdbd7cc,width:0.98,height:0.89,prop:'cane'}, // 낮은 키와 지팡이로 과도한 허리 굽힘 없이 구별한다.
  {id:'fashion',name:'패셔니스타',shirt:0xb84f56,pants:0x763b49,skin:0xe6b28c,hair:0x413036,width:0.94,height:1.07,prop:'bag'} // 성인 코트, 선글라스와 가방으로만 매력을 표현한다.
];
const sphere = new T.SphereGeometry(1,C.sphere,C.rings); // 단위 구를 공유해 얼굴과 소품의 생성 비용을 줄인다.
const up = new T.Vector3(0,1,0); // 캡슐의 기본 축이다.
const mats = new Map();
function material(color){if(!mats.has(color))mats.set(color,new T.MeshStandardMaterial({color,roughness:C.roughness}));return mats.get(color);}
function ball(parent,color,pos,scale){const m=new T.Mesh(sphere,material(color));m.position.set(...pos);m.scale.set(...scale);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function capsule(parent,color,r,length,pos){const m=new T.Mesh(capsuleGeometry(r,length),material(color));m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function group(parent,pos){const g=new T.Group();g.position.set(...pos);parent.add(g);return g;}
function limb(parent,color,r){return capsule(parent,color,r,0.15,[0,0,0]);} // 중심 구간을 짧은 0.15 구간으로 만들어 늘려도 둥근 관절 끝이 납작해지지 않게 한다.
function between(m,a,b,r){
  const av=new T.Vector3(...a),bv=new T.Vector3(...b),distance=av.distanceTo(bv);
  m.position.copy(av).add(bv).multiplyScalar(0.5); // 끝점 사이 중앙에 캡슐을 놓는다.
  m.quaternion.setFromUnitVectors(up,bv.clone().sub(av).normalize());
  const position=m.geometry.attributes.position;
  const rest=m.userData.restLimb || (m.userData.restLimb=position.array.slice());
  for(let i=0;i<position.count;i++){
    const y=rest[i*3+1]; // XYZ 정점의 세 채널 중 세로 축만 늘린다.
    position.setY(i,y+Math.sign(y)*(distance-r-0.15)/2); // 중심 길이 0.15를 늘리되 반경만큼 덜 연장해 끝이 관절을 덮으면서 발밑으로 뚫리지 않게 한다.
  }
  position.needsUpdate=true;
  m.geometry.computeBoundingSphere();
} // 캡슐 중심선이 관절 끝점까지 닿으므로 둥근 끝이 관절을 충분히 덮는다.
export function buildWalker(v=PASSER_VARIANTS[0]){
  const root=new T.Group(), hips=group(root,[0,C.hip,0]), chest=group(hips,[0,C.chest-C.hip,0]); // 원점은 지면이고 골반과 가슴은 따로 회전한다.
  root.scale.set(v.width,v.height,v.width);
  capsule(chest,v.shirt,C.torso,C.length,[0,0,0]);
  ball(hips,v.pants,[0,0,0],[0.31,0.23,0.25]); // 바지의 둥근 골반은 몸통과 다리의 틈만 채운다.
  const head=group(chest,[0,C.head-C.chest,0]);
  ball(head,v.skin,[0,0,0],[C.radius,C.radius*1.04,C.radius*0.94]); // 머리는 몸통보다 크고 정면만 살짝 평평하다.
  const hair=new T.Mesh(new T.SphereGeometry(C.radius*1.02,C.sphere,C.rings,0,Math.PI*2,0,Math.PI*0.43),material(v.hair)); // 정수리만 덮어 턱을 감싸는 머리카락 회귀를 막는다.
  hair.scale.y=1.08;head.add(hair);hair.castShadow=true; // 머리의 세로 배율보다 높여 정수리에 피부가 뚫리지 않게 한다.
  for(const side of [-1,1]){ // 양쪽 귀와 눈을 같은 정면에 둔다.
    ball(head,v.skin,[side*0.35,-0.015,0],[0.07,0.1,0.065]); // 귀는 실루엣을 깨되 머리보다 작다.
    ball(head,0xfaf7e9,[side*0.135,0.035,0.321],[0.075,0.086,0.035]); // 눈 간격은 코가 겹치지 않는 머리 폭의 삼분의 일이다.
    ball(head,0x272c31,[side*0.135,0.03,0.352],[0.032,0.048,0.019]); // 검은 눈동자는 축소해도 한 점으로 남는다.
  }
  ball(head,v.skin,[0,-0.058,0.352],[0.069,0.062,0.065]); // 작은 코가 측면 얼굴의 방향을 보여 준다.
  ball(head,0x6b3e38,[0,-0.17,0.305],[0.072,0.022,0.025]); // 얇은 입은 얼굴에 검은 덩어리를 만들지 않는다.
  const arms=[],legs=[],feet=[];
  for(const side of [-1,1]){
    const arm=limb(chest,v.shirt,C.arm),fore=limb(chest,v.skin,C.arm*0.98); // 맨팔 반경을 소매의 98퍼센트로 두어 접합면의 깊이 충돌을 없애고 윤곽은 잇는다.
    const hand=ball(chest,v.prop==='gloves'?0xf6df8a:v.skin,[0,0,0],[0.13,0.15,0.12]); // 손의 반축 0.13/0.15/0.12는 팔 반경에 맞춰 손목의 갑작스러운 부풀음을 줄인다.
    arms.push({side,arm,fore,hand});
    legs.push({side,thigh:limb(root,v.pants,C.leg),shin:limb(root,v.pants,C.leg)}); // 짧고 두툼한 다리를 두 마디로 유지한다.
    feet.push(ball(root,0x303b49,[side*0.19,C.foot,0.05],[0.16,C.foot,0.25])); // 넓은 신발은 접지와 전진 방향을 읽게 한다.
  }
  const accessory=group(chest,[0,0,0]);
  const prop=v.prop;
  if(prop==='pack'||prop==='helmet')ball(accessory,prop==='pack'?0x5b887a:0xe7773f,[0,0,-0.36],[0.29,0.36,0.18]); // 등짐은 뒤쪽으로만 돌출한다.
  if(prop==='helmet')ball(head,0xf0b52d,[0,0.15,-0.025],[0.41,0.31,0.37]); // 헬멧은 눈 위에서 끝나 얼굴을 가리지 않는다.
  if(['hat','visor','band'].includes(prop)){
    ball(head,prop==='hat'?0xe3c68e:0xf5e8cf,[0,0.19,0.07],[0.43,0.045,0.42]); // 챙은 눈보다 높고 넓게 돌출한다.
    if(prop==='hat')ball(head,0xe3c68e,[0,0.32,-0.025],[0.29,0.19,0.28]); // 관광 모자의 낮은 크라운이다.
  }
  if(prop==='tie'){
    capsule(accessory,0xeac3a0,0.045,0.23,[0,0.05,0.32]); // 넥타이는 상의 앞면에만 선다.
    ball(accessory,0x513f35,[0.52,-0.43,0],[0.21,0.23,0.1]); // 서류 가방으로 손쪽 실루엣을 구별한다.
  }
  if(prop==='hat')ball(accessory,0x354a50,[0,-0.13,0.34],[0.16,0.115,0.09]); // 카메라가 관광객을 읽게 한다.
  if(prop==='cane'){
    capsule(accessory,0x805d40,0.035,0.84,[0.54,-0.57,0.16]); // 지팡이 끝이 지면에 닿는 길이다.
    ball(head,v.hair,[0,0.25,-0.13],[0.3,0.17,0.29]); // 흰 머리의 낮은 덩어리다.
  }
  if(prop==='bag'){
    ball(chest,v.shirt,[0,-0.26,0],[0.38,0.28,0.29]); // 코트 밑단을 넓혀 바지 차림과 실루엣이 갈리게 한다.
    for(const side of [-1,1])ball(head,0x283740,[side*0.145,0.065,0.342],[0.125,0.075,0.035]); // 선글라스는 눈 높이에만 둔다.
    capsule(head,v.hair,0.15,0.3,[0,0.02,-0.3]); // 단발은 뒤통수에서 끝나 턱을 감싸지 않는다.
    ball(accessory,0xe6bb74,[0.48,-0.4,0.12],[0.19,0.23,0.11]); // 옆 가방이 코트와 다른 색면을 만든다.
    const handle=new T.Mesh(new T.TorusGeometry(0.12,0.026,8,20),material(0xe6bb74)); // 손잡이는 가방 폭에 맞춘 작은 고리다.
    handle.position.set(0.48,-0.15,0.12);accessory.add(handle); // 가방 바로 위에 손잡이를 붙인다.
  }
  const rig={root,hips,chest,head,arms,legs,feet,accessory,v};
  poseWalker(rig,0);return rig; // 생성 즉시 땅에 선 자세를 보장한다.
}
// 감쇠 조화진동 해를 사용해 프레임 간격과 무관하게 겹동작을 재생한다. https://en.wikipedia.org/wiki/Harmonic_oscillator
export function poseWalker(rig,distance,{mode='walk',time=0,heading=0}={}){
  const {root,hips,chest,head,arms,legs,feet,v}=rig;
  const cycle=distance/C.stride,phase=cycle*Math.PI*2; // 한 주기의 이동 거리를 보폭에 묶는다.
  const sway=Math.sin(phase)*0.11; // 0.11의 골반 기울기로 작은 화면에서도 디딤 쪽 체중 이동을 읽게 한다.
  root.rotation.set(0,heading,0);hips.rotation.set(0,sway,sway);chest.rotation.set(0,-sway*1.4,-sway*2); // 부모 골반 기울기를 상쇄한 뒤 같은 크기로 어깨가 반대 기울기를 갖게 두 배 역회전한다.
  head.rotation.z=Math.exp(-time*2.8)*Math.sin(time*10)*0.09+sway*0.3; // 감쇠율은 삼 초 안에 잔동작이 가라앉는 범위다.
  rig.accessory.rotation.z=Math.exp(-time*2.4)*Math.sin(time*8)*0.08-sway; // 소품은 머리보다 느리게 뒤따른다.
  for(let i=0;i<legs.length;i++){
    const {side,thigh,shin}=legs[i];
    const q=T.MathUtils.euclideanModulo(cycle+i*0.5,1); // 두 발은 반 주기만큼 어긋난다.
    const stance=q<0.5,u=(q-0.5)*2; // 절반은 지면 고정이고 절반은 공중 회수다.
    const z=stance?C.stride*(0.25-q):T.MathUtils.lerp(-C.stride*0.25,C.stride*0.25,T.MathUtils.smoothstep(u,0,1)); // 지지 구간의 역이동이 루트 이동을 정확히 상쇄한다.
    const y=C.foot+(stance?0:Math.sin(u*Math.PI)*C.lift); // 공중에서만 발끝을 들고 양 끝에서 지면에 붙인다.
    const x=side*(v.prop==='bag'?0.155:0.19); // 코트 걸음은 발 간격만 좁히고 신체 부위는 강조하지 않는다.
    feet[i].position.set(x,y,z);feet[i].userData.stance=stance;
    const knee=[x,0.41,z*0.5+0.12]; // 무릎은 앞쪽으로만 접혀 역관절을 막는다.
    const hip=new T.Vector3(x,0,0).applyEuler(hips.rotation).add(hips.position); // 기운 골반에 허벅지 시작점을 붙이고 발의 지면 궤적은 보존한다.
    between(thigh,hip.toArray(),knee,C.leg);between(shin,knee,[x,y,z],C.leg); // 신발까지 끊기지 않는 두 마디다.
  }
  for(const {side,arm,fore,hand} of arms){
    const swing=Math.sin(phase+(side>0?Math.PI:0))*0.34; // 팔의 이동폭을 0.34로 키워 반대 다리와 함께 전진하는 외곽선을 드러낸다.
    const elbow=[side*0.43,-0.22,swing],end=[side*0.47,-0.5,swing*1.3]; // 팔을 몸에서 조금 벌려 외곽선을 유지한다.
    if(mode==='shuffle'){elbow[2]=0.25;end[1]=-0.05;end[2]=0.43;} // 셔플은 장갑을 앞에 들고 공을 향한다.
    if(mode==='dive'){elbow[0]=side*0.3;elbow[1]=0.9;end[0]=side*0.24;end[1]=1.45;end[2]=0.12;} // 누운 몸의 머리 위로 양손이 함께 뻗는다.
    between(arm,[side*C.shoulder,0.2,0],elbow,C.arm);between(fore,elbow,end,C.arm*0.92);hand.position.set(...end); // 같은 관절 배선을 세 동작이 공유한다.
  }
  if(mode==='shuffle'){
    for(const f of feet){const old=f.position.z;f.position.z=0;f.position.x+=old;} // 셔플만 보폭 축을 옆으로 바꾼다.
    for(let i=0;i<legs.length;i++){const l=legs[i],f=feet[i].position,k=[l.side*0.2,0.36,0.14];between(l.thigh,[l.side*0.19,C.hip,0],k,C.leg);between(l.shin,k,f.toArray(),C.leg);} // 옆으로 벌어진 발까지 무릎을 다시 연결한다.
  }
  if(mode==='dive')root.rotation.z=-Math.PI*0.43; // 수평에 가까운 옆다이빙이며 발이 손을 따라가는 실루엣이다.
  root.updateMatrixWorld(true);
}
