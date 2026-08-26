// 배우. 원시 도형뿐이지만 관절은 있다.
// 몸통 하나를 통째로 기울이면 T포즈를 회전시킨 것으로만 읽힌다.
// 어깨와 고관절을 끝단 피벗으로 세우고, 각도를 데이터로 둔다. 과장은 여기서 나온다.
import * as THREE from '../../../vendor/three.module.min.js';
import { flat, standOnGround } from '../units.mjs';

// 동공은 연출이 바꿔 끼우므로 재질을 밖에서 소유한다.
export const pupilMat = new THREE.MeshBasicMaterial({ color: 0x18140f });

// 관절 이름. 포즈는 이 열 개의 오일러각 묶음이다.
export const JOINTS = ['spine', 'neck', 'shL', 'elL', 'shR', 'elR', 'hipL', 'knL', 'hipR', 'knR'];

// 각도 규약. 사지는 피벗에서 아래로 뻗는다.
// rz 양수는 팔다리를 +x 쪽으로 젖힌다. rx 음수는 +z(키커 쪽, 카메라 반대)로 뻗는다.
// 좌우를 따로 적는다. 대칭인 몸은 마네킹으로 읽힌다.
export const POSES = {
  idle: {
    spine: [-0.10, 0, 0.03], neck: [0.06, 0, -0.05],
    shL: [-0.24, 0, -0.64], elL: [-0.55, 0, 0.30],
    shR: [-0.29, 0, 0.72], elR: [-0.64, 0, -0.38],
    hipL: [-0.10, 0, -0.10], knL: [0.22, 0, 0],
    hipR: [-0.07, 0, 0.13], knR: [0.27, 0, 0]
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
  dribble: {
    spine: [-0.36, 0, 0], neck: [0.18, 0, 0],
    shL: [-1.12, 0, -0.34], elL: [-1.20, 0, 0.22],
    shR: [0.92, 0, 0.32], elR: [-1.02, 0, -0.20],
    hipL: [-0.82, 0, -0.09], knL: [0.92, 0, 0],
    hipR: [0.58, 0, 0.10], knR: [0.34, 0, 0]
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
  strike: {
    spine: [0.22, 0, 0.12], neck: [-0.10, 0, 0],
    shL: [-1.10, 0, -0.78], elL: [-0.44, 0, 0.30],
    shR: [0.96, 0, 0.40], elR: [-0.24, 0, -0.16],
    hipL: [-0.06, 0, -0.12], knL: [0.16, 0, 0],
    hipR: [-1.24, 0, 0.08], knR: [0.12, 0, 0]
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
  head.userData.skin = skin;
  return head;
}

// 피벗이 끝단인 마디. 원점에서 아래로 뻗는다.
// 캡슐을 중앙 피벗으로 두면 어깨를 돌렸을 때 팔이 몸통을 관통한다.
function seg(radius, len, color, tag) {
  const geo = new THREE.CapsuleGeometry(radius, len, 3, 6);
  geo.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(geo, flat(color));
  m.name = tag;
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
  const torso = new THREE.Mesh(torsoGeo, flat(o.shirt));
  torso.name = tag;
  spine.add(torso);

  const neck = joint(spine, 0, o.torsoLen + o.torsoR * 0.35, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(o.headR, 10, 8), flat(o.skin));
  head.name = tag;
  head.position.y = o.headR * 0.92;
  addFace(head, o.headR, o.faceDir, o.skin);
  neck.add(head);

  const joints = { spine, neck };
  const arms = [];
  const gloves = [];
  const gloveParent = [];
  for (const side of [-1, 1]) {
    const k = side < 0 ? 'L' : 'R';
    const sh = joint(spine, side * o.shoulderX, o.torsoLen * 0.92, 0);
    const upper = seg(o.armR, o.upperLen, o.shirt, tag);
    sh.add(upper);
    const el = joint(sh, 0, -o.upperLen, 0);
    const fore = seg(o.armR * 0.92, o.foreLen, o.skin, tag);
    el.add(fore);
    joints['sh' + k] = sh;
    joints['el' + k] = el;
    arms.push(sh);
    if (o.gloveSize) {
      const gv = new THREE.Mesh(new THREE.BoxGeometry(o.gloveSize, o.gloveSize, o.gloveSize * 0.45), flat(0xf2d64b));
      gv.name = tag;
      gv.position.set(0, -o.foreLen - o.gloveSize * 0.2, 0);
      el.add(gv);
      gloves.push(gv);
      gloveParent.push(el);
    }
    const hp = joint(hip, side * o.hipX, 0, 0);
    const thigh = seg(o.legR, o.thighLen, o.shorts, tag);
    hp.add(thigh);
    const kn = joint(hp, 0, -o.thighLen, 0);
    const shin = seg(o.legR * 0.82, o.shinLen, o.socks, tag);
    kn.add(shin);
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
    shoulderX: w * 0.62, armR: h * 0.048,
    upperLen: h * 0.17, foreLen: h * 0.16,
    hipX: w * 0.34, legR: w * 0.24,
    thighLen: h * 0.21, shinLen: h * 0.20,
    gloveSize: h * 0.115,
    shirt: 0x2f8f5b, skin: 0xe8c39a, shorts: 0x14202c, socks: 0x1b2c3c,
    phase: 0.7, rest: POSES.idle
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
    shoulderX: 0.19, armR: 0.05,
    upperLen: 0.30, foreLen: 0.28,
    hipX: 0.10, legR: 0.085,
    thighLen: 0.40, shinLen: 0.38,
    gloveSize: 0,
    shirt: 0xc9483a, skin: 0xd8a877, shorts: 0x243043, socks: 0xe4e0d6,
    phase: 2.1, rest: POSES.windup
  });
  return g;
}
