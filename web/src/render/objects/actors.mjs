// 배우. 원시 도형뿐이지만 관절은 있다.
// 몸통 하나를 통째로 기울이면 T포즈를 회전시킨 것으로만 읽힌다.
// 어깨와 고관절을 끝단 피벗으로 세우고, 각도를 데이터로 둔다. 과장은 여기서 나온다.
import * as THREE from '../../../vendor/three.module.min.js';
import { flat, flatMap, standOnGround } from '../units.mjs';
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
    shL: [-1.52, 0, -0.34], elL: [-1.40, 0, 0.52],
    shR: [-1.58, 0, 0.40], elR: [-1.46, 0, -0.50],
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
  swoon: {
    spine: [0.06, 0, 0.30], neck: [-0.16, 0, 0.10],
    shL: [0.32, 0, -0.16], elL: [-0.22, 0, 0.08],
    shR: [0.38, 0, 0.20], elR: [-0.26, 0, -0.06],
    hipL: [-0.04, 0, -0.14], knL: [0.12, 0, 0],
    hipR: [-0.02, 0, 0.16], knR: [0.10, 0, 0]
  },
  // 드리블하러 나간다. 달리는 팔다리 엇갈림.
  // 카메라가 뒤에 있으니 rx로만 흔든 팔은 시선축과 나란해 몸통에 파묻힌다.
  // 압으로 벌리는 것은 rz가 한다. 앞뒤 엇갈림은 rx에 남기고 폭만 줄인다.
  dribble: {
    spine: [-0.36, 0, 0], neck: [0.18, 0, 0],
    shL: [-0.58, 0, -0.86], elL: [-0.92, 0, 0.20],
    shR: [0.52, 0, 0.82], elR: [-0.74, 0, -0.18],
    hipL: [-0.82, 0, -0.09], knL: [0.92, 0, 0],
    hipR: [0.58, 0, 0.10], knR: [0.34, 0, 0]
  },
  // 장갑이 벗겨졌다. 맨손이 된 쪽 팔만 끝까지 뻗고 반대쪽은 몸에 붙는다.
  // 고개가 그 손을 본다. 두 팔이 같은 쪽을 가리키는 다이빙과 여기서 갈린다.
  reachR: {
    spine: [-0.18, 0, -0.52], neck: [0.10, 0, -0.92],
    shL: [-0.72, 0, -0.30], elL: [-1.30, 0, 0.70],
    shR: [-0.20, 0, 2.48], elR: [0.10, 0, -0.06],
    hipL: [0.44, 0, -0.16], knL: [0.30, 0, 0],
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
  hugfall: {
    spine: [-0.94, 0, 0.10], neck: [0.52, 0, 0.14],
    shL: [-1.30, 0, -0.12], elL: [-2.20, 0, 0.90],
    shR: [-1.36, 0, 0.16], elR: [-2.26, 0, -0.86],
    hipL: [-1.50, 0, -0.30], knL: [1.90, 0, 0],
    hipR: [-1.44, 0, 0.34], knR: [1.80, 0, 0]
  },
  // 제껴졌다. 팔이 뒤로 휘청이고 상체가 돌아서 공을 쫓는다.
  stumble: {
    spine: [0.40, 0, -0.24], neck: [-0.40, 0, -0.60],
    shL: [0.94, 0, -1.34], elL: [-0.70, 0, 0.40],
    shR: [1.10, 0, 1.42], elR: [-0.64, 0, -0.44],
    hipL: [0.36, 0, -0.44], knL: [1.14, 0, 0],
    hipR: [-1.10, 0, 0.22], knR: [0.20, 0, 0]
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
export function addFace(head, r, dir, skin) {
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xfbfbf5 });
  const darkMat = pupilMat;
  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.34, 10, 8), whiteMat);
    eye.position.set(s * r * 0.42, r * 0.16, dir * r * 0.7);
    eye.scale.set(1, 1.15, 0.42);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.17, 8, 6), darkMat);
    pupil.position.set(s * r * 0.42, r * 0.14, dir * r * 0.95);
    pupil.scale.set(1, 1.1, 0.5);
    head.add(eye, pupil);
    eyes.push(pupil);
  }
  // 입은 벌어진 채로 둔다. 다물면 표정이 죽고, 벌리면 뭘 봐도 얼빠져 보인다.
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(r * 0.26, 8, 6), darkMat);
  mouth.position.set(0, -r * 0.42, dir * r * 0.84);
  mouth.scale.set(1.1, 0.7, 0.4);
  head.add(mouth);
  // 머리카락. 뒤통수가 민머리면 카메라 뒤에서 본 키퍼가 달걀이 된다.
  // 정수리만 덮는다. 더 내리면 앞머리가 얼굴을 삼켜 검은 헬멧이 된다.
  const hair = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), flat(0x2b1d14));
  hair.position.set(0, r * 0.08, -dir * r * 0.1);
  head.add(hair);
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
function seg(radius, len, color, tag, salt) {
  const geo = new THREE.CapsuleGeometry(radius, len, 3, 6);
  geo.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(geo, flat(color));
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

  const torsoGeo = new THREE.CapsuleGeometry(o.torsoR, o.torsoLen, 3, 8);
  torsoGeo.translate(0, o.torsoLen / 2, 0);
  // 유니폼 한 장이 단색이면 사람이 아니라 색 견본이다. 구겨진 명암이 옷을 옷으로 만든다.
  const torso = new THREE.Mesh(torsoGeo, flatMap(o.shirt, clothTex()));
  torso.name = tag;
  jitterMesh(torso, 0.022, 3);
  addOutline(torso, 0.05);
  spine.add(torso);

  const neck = joint(spine, 0, o.torsoLen + o.torsoR * 0.35, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(o.headR, 10, 8), flat(o.skin));
  head.name = tag;
  head.position.y = o.headR * 0.92;
  // 머리는 작다. 몸통과 같은 진폭을 주면 두개골이 찌그러진 것으로 읽힌다.
  jitterMesh(head, 0.008, 11);
  addOutline(head, 0.045);
  addFace(head, o.headR, o.faceDir, o.skin);
  neck.add(head);

  const joints = { spine, neck };
  const arms = [];
  const gloves = [];
  const gloveParent = [];
  const bareHands = [];
  for (const side of [-1, 1]) {
    const k = side < 0 ? 'L' : 'R';
    const sh = joint(spine, side * o.shoulderX, o.torsoLen * 0.92, 0);
    // 어깨에 살이 없으면 팔이 몸통 옆에 떠 있는 별개 물체로 읽힌다.
    // 팔을 어느 각도로 돌려도 피벗에 있는 이 구가 몸통과 팔 사이를 메운다.
    const delt = new THREE.Mesh(new THREE.SphereGeometry(o.armR * 1.45, 8, 6), flat(o.shirt));
    delt.name = tag;
    jitterMesh(delt, 0.015, side < 0 ? 25 : 26);
    sh.add(delt);
    const upper = seg(o.armR, o.upperLen, o.shirt, tag, side < 0 ? 21 : 22);
    sh.add(upper);
    const el = joint(sh, 0, -o.upperLen, 0);
    const fore = seg(o.armR * 0.92, o.foreLen, o.skin, tag, side < 0 ? 23 : 24);
    el.add(fore);
    joints['sh' + k] = sh;
    joints['el' + k] = el;
    arms.push(sh);
    if (o.gloveSize) {
      const gv = new THREE.Mesh(new THREE.BoxGeometry(o.gloveSize, o.gloveSize, o.gloveSize * 0.45), flatMap(0xf2d64b, clothTex()));
      gv.name = tag;
      // 장갑은 화면에서 가장 자주 보는 물건이다. 직육면체 그대로면 여기서 티가 제일 크게 난다.
      jitterMesh(gv, 0.02, side < 0 ? 31 : 32);
      addOutline(gv, 0.028);
      gv.position.set(0, -o.foreLen - o.gloveSize * 0.2, 0);
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
    const thigh = seg(o.legR, o.thighLen, o.shorts, tag, side < 0 ? 41 : 42);
    hp.add(thigh);
    const kn = joint(hp, 0, -o.thighLen, 0);
    const shin = seg(o.legR * 0.82, o.shinLen, o.socks, tag, side < 0 ? 43 : 44);
    kn.add(shin);
    // 축구화가 없으면 다리가 잘린 막대로 끝난다. 발은 실루엣에서 가장 아래에 있고 제일 먼저 보인다.
    if (o.bootLen) {
      const boot = new THREE.Mesh(new THREE.BoxGeometry(o.legR * 1.5, o.legR * 0.9, o.bootLen), flat(0x14100c));
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
    g.userData.gloveHome = gloves.map((m) => m.position.clone());
    g.userData.gloveParent = gloveParent;
    g.userData.bareHands = bareHands;
  }
  return g;
}

export function buildKeeper(height, weight) {
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
    // 상의 초록과 같은 계열의 양말을 신겨 키트로 묶고, 반바지는 무릎 위치를 알려줄 정도로만 밝힌다.
    shirt: 0x2f8f5b, skin: 0xe8c39a, shorts: 0x2b3b4e, socks: 0x2f8f5b,
    phase: 0.7, rest: POSES.ready
  });
  g.userData.girth = w;
  return g;
}

export function buildKicker() {
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
    shirt: 0xc9483a, skin: 0xd8a877, shorts: 0xede7d8, socks: 0xf2b431,
    phase: 2.1, rest: POSES.windup
  });
  return g;
}
