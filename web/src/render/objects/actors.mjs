// 배우. 원시 도형뿐이다. 관절은 없고 몸통이 통째로 기울어진다.
// 그 뻣뻣함이 병맛의 절반이다.
import * as THREE from '../../../vendor/three.module.min.js';
import { flat, standOnGround } from '../units.mjs';

// 동공은 연출이 바꿔 끼우므로 재질을 밖에서 소유한다.
export const pupilMat = new THREE.MeshBasicMaterial({ color: 0x18140f });

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

export function buildKeeper(height, weight) {
  const g = new THREE.Group();
  const h = height / 100;
  const w = 0.30 + (weight - 84) * 0.0035;
  const headR = h * 0.075;

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(w, h * 0.42, 3, 8), flat(0x2f8f5b));
  torso.position.y = h * 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 10, 8), flat(0xe8c39a));
  head.position.y = h * 0.93;
  addFace(head, headR, 1, 0xe8c39a);
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(w * 0.72, h * 0.3, 3, 8), flat(0x14202c));
  legs.position.y = h * 0.22;

  // 팔. 어깨에서 장갑까지 이어주는 막대다. 없으면 장갑이 허공에 떠 있다.
  const armGeo = new THREE.CapsuleGeometry(h * 0.032, w * 0.9 + 0.16, 3, 6);
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, flat(0x2f8f5b));
    arm.position.set(s * (w * 0.62 + 0.12), h * 0.62, 0.04);
    arm.rotation.z = Math.PI / 2;
    arm.name = 'keeper';
    g.add(arm);
    arms.push(arm);
  }

  const glove = new THREE.BoxGeometry(h * 0.11, h * 0.11, h * 0.05);
  const gl = new THREE.Mesh(glove, flat(0xf2d64b));
  const gr = new THREE.Mesh(glove, flat(0xf2d64b));
  gl.position.set(-w - 0.22, h * 0.62, 0.06);
  gr.position.set(w + 0.22, h * 0.62, 0.06);

  g.add(torso, head, legs, gl, gr);
  for (const m of [torso, head, legs, gl, gr]) m.name = 'keeper';
  standOnGround(g);
  g.userData.gloves = [gl, gr];
  g.userData.gloveHome = [gl.position.clone(), gr.position.clone()];
  g.userData.arms = arms;
  g.userData.head = head;
  g.userData.girth = w;
  return g;
}

export function buildKicker() {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.72, 3, 8), flat(0xc9483a));
  torso.position.y = 1.02;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), flat(0xd8a877));
  head.position.y = 1.62;
  // 키커는 골대를 향해 달린다. 카메라는 골대 뒤에 있으니 얼굴이 렌즈를 마주 본다.
  addFace(head, 0.14, -1, 0xd8a877);
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.52, 3, 8), flat(0xf0f0ee));
  legs.position.y = 0.4;
  const armGeo = new THREE.CapsuleGeometry(0.055, 0.42, 3, 6);
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, flat(0xc9483a));
    arm.position.set(s * 0.3, 1.06, 0);
    arm.rotation.z = s * 0.35;
    arm.name = 'kicker';
    g.add(arm);
    arms.push(arm);
  }
  for (const m of [torso, head, legs]) m.name = 'kicker';
  g.add(torso, head, legs);
  standOnGround(g);
  g.userData.arms = arms;
  g.userData.head = head;
  return g;
}
