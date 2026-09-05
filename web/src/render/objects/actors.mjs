// 배우. 원시 도형뿐이지만 관절은 있다.
// 몸통 하나를 통째로 기울이면 T포즈를 회전시킨 것으로만 읽힌다.
// 어깨와 고관절을 끝단 피벗으로 세우고, 각도를 데이터로 둔다. 과장은 여기서 나온다.
import * as THREE from '../../../vendor/three.module.min.js';
import { flat, flatMap, flatVertex, mergeGeos, standOnGround } from '../units.mjs';
import { clothTex } from '../texture.mjs';
import { jitterMesh, addOutline } from '../handmade.mjs';

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
  windup: {
    spine: [-0.18, 0, -0.10], neck: [-0.06, 0, 0],
    shL: [-0.52, 0, -0.34], elL: [-0.94, 0, 0.22],
    shR: [0.48, 0, 0.26], elR: [-0.70, 0, -0.18],
    hipL: [-0.16, 0, -0.10], knL: [0.24, 0, 0],
    hipR: [0.62, 0, 0.12], knR: [0.96, 0, 0]
  },
  // 임팩트. 차는 다리가 앞으로 끝까지 뻗고 상체가 뒤로 젖혀진다.
  // 백스윙. 차기 직전에 반대로 접는다. 예비동작이 없으면 발이 공에 닿는 순간이 무게를 잃는다.
  plant: {
    spine: [-0.34, 0, -0.18], neck: [-0.02, 0, 0.06],
    shL: [-0.92, 0, -0.58], elL: [-1.16, 0, 0.34],
    shR: [0.86, 0, 0.44], elR: [-0.52, 0, -0.26],
    hipL: [-0.24, 0, -0.12], knL: [0.36, 0, 0],
    hipR: [0.98, 0, 0.14], knR: [1.34, 0, 0]
  },
  strike: {
    spine: [0.22, 0, 0.12], neck: [-0.10, 0, 0],
    shL: [-1.10, 0, -0.78], elL: [-0.44, 0, 0.30],
    shR: [0.96, 0, 0.40], elR: [-0.24, 0, -0.16],
    hipL: [-0.06, 0, -0.12], knL: [0.16, 0, 0],
    hipR: [-1.24, 0, 0.08], knR: [0.12, 0, 0]
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
    hipR: [-1.74, 0, 0.06], knR: [-0.10, 0, 0]
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
  const darkMat = pupilMat;
  // 흰자 둘은 표정이 바뀌어도 자리가 그대로다. 한 장으로 붙여야 얼굴 하나가 드로우콜을 아홉 부르지 않는다.
  const whiteGeos = [];
  const eyes = [];
  for (const s of [-1, 1]) {
    /* 얼굴은 두 거리에서 쓰인다. 경기 화면은 골대 뒤에서 잡는 작은 뒤통수라 이목구비를
       크게 깎아야 읽히고, 상점 카드는 근접 초상이라 같은 크기가 흉물이 된다.
       먼 거리 기준으로만 깎아 흰자 지름이 머리 반지름의 0.68이었고, 두 개가 얼굴을 덮어
       파운더가 볼에 검은 김이 붙었다고 짚었다. 그 김은 입이고, 흰자에 밀려 자리가 없었다.
       가까운 쪽에 맞추고 먼 쪽은 facevis가 지킨다. 그 자가 열다섯 사건에서 얼굴 노출을 잰다. */
    const w = new THREE.SphereGeometry(r * 0.23, 10, 8);
    w.scale(1, 1.15, 0.42);
    w.translate(s * r * 0.36, r * 0.16, dir * r * 0.78);
    whiteGeos.push(w);
    // 동공은 감정마다 따로 늘어난다. 붙이면 한쪽 배율이 반대쪽 눈을 밖으로 민다.
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.115, 8, 6), darkMat);
    pupil.position.set(s * r * 0.36, r * 0.14, dir * r * 0.99);
    pupil.scale.set(1, 1.1, 0.5);
    head.add(pupil);
    eyes.push(pupil);
  }
  head.add(new THREE.Mesh(mergeGeos(whiteGeos), whiteMat));
  // 입은 벌어진 채로 둔다. 다물면 표정이 죽고, 벌리면 뭘 봐도 얼빠져 보인다.
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(r * 0.155, 8, 6), darkMat);
  mouth.position.set(0, -r * 0.4, dir * r * 0.9);
  // 폭이 좁으면 검은 원이 되어 공의 검은 오각 무늬와 구별이 안 된다. 가로로 눕혀야 입이다.
  mouth.scale.set(1.35, 0.6, 0.34);
  head.add(mouth);
  // 카메라는 골대 뒤에 있다. 키퍼는 키커를 보므로 화면에 잡히는 건 언제나 뒤통수다.
  // 구 하나에 정수리 반구만 얹으면 그 아래가 굴곡 없는 살색 판이 되어 머리로 안 읽힌다.
  // 뒷머리가 뒤통수를 어두운 덩어리로 덮고, 귀 둘이 그 위에 밝은 점으로 떨어져 실루엣을 깨다.
  // 이 넷은 움직이지 않으므로 정점색 한 장으로 붙인다.
  // 껍데기 각과 배율을 등급이 정한다. 색만 바꾸면 네 값이 같은 실루엣을 판다.
  const cut = hairCut || { wide: 1, tall: 1, phi: 0.42, tilt: 0 };
  const hair = new THREE.SphereGeometry(r * 1.05, 10, 8, 0, Math.PI * 2, 0, Math.PI * cut.phi);
  // 좌우로 죄면 볏이 되고 위로 늘리면 기른 머리가 된다. z는 그대로 둬야 뒤통수를 계속 덮는다.
  hair.scale(cut.wide, cut.tall, 1);
  // 집에서 깎은 머리는 한쪽이 눌린다. 라디안이라 0.07이면 4도쯤이다.
  if (cut.tilt) hair.rotateZ(cut.tilt);
  hair.translate(0, r * 0.08, -dir * r * 0.1);
  const nape = new THREE.SphereGeometry(r * 0.98, 10, 8);
  nape.scale(1, 1, 0.62);
  nape.translate(0, -r * 0.04, -dir * r * 0.42);
  const neck = new THREE.CylinderGeometry(r * 1.12, r * 0.66, r * 1.3, 8);
  neck.translate(0, -r * 1.05, -dir * r * 0.12);
  // 머리가 젖혀지면 카메라가 턱 밑면을 본다. 입 웨지만 빼고 어둡게 덮는다.
  const chin = new THREE.SphereGeometry(r * 1.04, 12, 6, Math.PI * (dir > 0 ? 0.64 : 1.64), Math.PI * 1.72, Math.PI * 0.5, Math.PI * 0.5);
  // 칼라가 머리와 어깨 사이 값을 끊는다.
  const collar = new THREE.CylinderGeometry(r * 1.22, r * 1.32, r * 0.26, 10);
  collar.translate(0, -r * 1.02, -dir * r * 0.1);
  const shellGeos = [hair, nape, neck, chin, collar];
  const shellColors = [hairTone || 0x2b1d14, 0x5a4030, 0x1a1712, 0x141110, 0xd7dfd2];
  /* 수염과 묶은 머리. 머리색과 피부색만으로는 백 명이 다섯 얼굴로 뭉친다.
     이 둘은 실루엣을 바꾸므로 카드 크기에서도, 경기장의 작은 머리에서도 갈린다.
     수염은 턱을 감싸는 얇은 껍데기다. 1은 짧고 2는 덥수룩해서 볼까지 올라온다. */
  const beard = face && face.beard ? face.beard : 0;
  if (beard) {
    const up = beard === 2 ? 0.62 : 0.44;
    const b = new THREE.SphereGeometry(r * 1.02, 12, 8, Math.PI * (dir > 0 ? 0.62 : 1.62), Math.PI * 1.76,
      Math.PI * (1 - up) * 0.5 + Math.PI * 0.22, Math.PI * up * 0.5);
    b.scale(1, 1, 1.02);
    b.translate(0, -r * 0.1, 0);
    shellGeos.push(b);
    // 수염은 머리보다 한 단 어둡다. 같은 색이면 턱과 머리가 한 덩어리로 붙는다.
    shellColors.push(hairTone === undefined ? 0x1c1712 : hairTone);
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
function seg(radius, len, color, tag, salt, cuff, span, girth) {
  const geo = new THREE.CapsuleGeometry(radius, len, 3, 6);
  geo.translate(0, -len / 2, 0);
  // 마디 중간에 밝은 띠를 하나 병합한다. 드로우콜은 그대로다.
  // 피벗 쪽에 두면 어깨 구와 몸통 측면에 묻혀 화면에 안 나온다.
  let m;
  if (cuff) {
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
  jitterMesh(m, 0.012, salt);
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
  const torsoGeo = new THREE.CapsuleGeometry(o.torsoR, o.torsoLen, 3, 8);
  torsoGeo.translate(0, o.torsoLen / 2, 0);
  torsoGeo.scale(kc.girth, kc.len, kc.girth);
  // 유니폼 한 장이 단색이면 사람이 아니라 색 견본이다. 구겨진 명암이 옷을 옷으로 만든다.
  const torso = new THREE.Mesh(torsoGeo, flatMap(o.shirt, clothTex()));
  torso.name = tag;
  jitterMesh(torso, 0.022, 3);
  addOutline(torso, 0.05);
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
  const neck = joint(spine, 0, (o.torsoLen + o.torsoR) * kc.len - o.torsoR * 0.18, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(o.headR, 10, 8), flat(o.skin));
  head.name = tag;
  head.position.y = o.headR * 0.92;
  // 머리는 작다. 몸통과 같은 진폭을 주면 두개골이 찌그러진 것으로 읽힌다.
  jitterMesh(head, 0.008, 11);
  addOutline(head, 0.045);
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
    const delt = new THREE.Mesh(new THREE.SphereGeometry(o.armR * 1.45, 8, 6), flat(o.sleeve));
    delt.name = tag;
    jitterMesh(delt, 0.015, side < 0 ? 25 : 26);
    sh.add(delt);
    // 어깨 스펀지. 상의 색이라 무엇이 두꺼워졌는지가 그 옷의 색으로 읽힌다.
    // 어깨 삼각근 구가 반지름 1.45라, 그 안에 넣으면 스펀지를 사도 화면이 그대로다.
    // 구 위로 올려 얹어야 어깨선이 각지고 넓어진 것이 보인다.
    if (kc.pad) {
      const th = o.armR * 1.1 * kc.pad;
      const pad = new THREE.Mesh(new THREE.BoxGeometry(o.armR * 2.7, th, o.armR * 2.7), flat(o.shirt));
      pad.name = tag;
      jitterMesh(pad, 0.015, side < 0 ? 27 : 28);
      pad.position.set(side * o.armR * 0.45, o.armR * 1.15 + th * 0.3, 0);
      sh.add(pad);
    }
    const upper = seg(o.armR, o.upperLen, o.sleeve, tag, side < 0 ? 21 : 22, o.cuffSleeve, o.cuffSpan, o.cuffGirth);
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
      const palm = new THREE.BoxGeometry(s, s * 1.15, s * 0.5);
      const thumb = new THREE.BoxGeometry(s * 0.44, s * 0.52, s * 0.46);
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
        pip.translate(col * s * 0.28, row * s * 0.3, s * 0.3);
        hand.push(pip);
      }
      const gv = new THREE.Mesh(mergeGeos(hand), flatMap(o.gloveTone || 0xf2d64b, clothTex()));
      gv.name = tag;
      // 장갑은 화면에서 가장 자주 보는 물건이다. 직육면체 그대로면 여기서 티가 제일 크게 난다.
      jitterMesh(gv, 0.02, side < 0 ? 31 : 32);
      addOutline(gv, 0.028);
      gv.position.set(0, -o.foreLen - s * 0.2, 0);
      el.add(gv);
      gloves.push(gv);
      gloveParent.push(el);
      // 장갑이 벗겨지면 그 손은 빈팔이 된다. 맨손을 미리 깔아두고 숨겨둔다.
      // 장갑만 날리면 팔가 끝에서 잘린 것으로 보인다.
      const bh = new THREE.Mesh(new THREE.SphereGeometry(o.gloveSize * 0.42, 8, 6), flat(o.skin));
      bh.name = tag;
      jitterMesh(bh, 0.02, side < 0 ? 33 : 34);
      addOutline(bh, 0.028);
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
      jitterMesh(gd, 0.012, side < 0 ? 45 : 46);
      gd.position.set(0, -o.shinLen * 0.46, o.faceDir * o.legR * 0.78);
      kn.add(gd);
    }
    // 그립 밴드는 발목을 한 바퀴 감는다.
    if (sc.band) {
      const bd = new THREE.Mesh(new THREE.CylinderGeometry(o.legR * 1.15 * sc.band, o.legR * 1.15 * sc.band, o.shinLen * 0.22, 8), flat(o.socks));
      bd.name = tag;
      jitterMesh(bd, 0.012, side < 0 ? 47 : 48);
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
      const parts = [new THREE.BoxGeometry(o.legR * 1.5 * (bc.wide || 1), sole, span)];
      // 돌기는 두 줄로 깐다. 한 줄이면 발바닥이 아니라 톱니로 읽힌다.
      const rows = Math.ceil(bc.pips / 2);
      for (let n = 0; n < bc.pips; n++) {
        const col = n % 2 === 0 ? -1 : 1;
        const row = Math.floor(n / 2);
        const len = o.legR * 0.26 * bc.pip;
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
      jitterMesh(boot, 0.016, side < 0 ? 51 : 52);
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
    torsoR: w * 0.55, torsoLen: h * 0.27,
    headR: h * 0.082, faceDir: 1,
    shoulderX: w * 0.56, armR: h * 0.048,
    upperLen: h * 0.17, foreLen: h * 0.16,
    hipX: w * 0.34, legR: w * 0.24,
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
    torsoR: 0.16, torsoLen: 0.48,
    headR: 0.145, faceDir: -1,
    shoulderX: 0.17, armR: 0.05,
    upperLen: 0.30, foreLen: 0.28,
    hipX: 0.10, legR: 0.085,
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
