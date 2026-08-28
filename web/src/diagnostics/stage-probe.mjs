// 배우가 땅을 딛고 있는지, 화면 안에 있는지 재는 자.
// "공중부양처럼 보인다"는 판단이고, 발밑 Y와 NDC는 측정이다.
import * as THREE from '../../vendor/three.module.min.js';

const box = new THREE.Box3();
const v = new THREE.Vector3();

// 그룹의 월드 바운딩 박스 밑면. 발이 땅에 닿으면 0에 붙는다.
export function footY(group) {
  box.setFromObject(group);
  return box.min.y;
}

// 그룹의 여덟 꼭짓점이 전부 화면 안에 있는지. 하나라도 나가면 잘린 것이다.
export function framing(group, camera) {
  box.setFromObject(group);
  camera.updateMatrixWorld();
  let inside = 0;
  let maxAbsX = 0;
  let maxAbsY = 0;
  for (let i = 0; i < 8; i += 1) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    v.project(camera);
    maxAbsX = Math.max(maxAbsX, Math.abs(v.x));
    maxAbsY = Math.max(maxAbsY, Math.abs(v.y));
    if (Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z <= 1) inside += 1;
  }
  return { inside, whole: inside === 8, maxAbsX, maxAbsY };
}

// 구도. 공이 보이는 것과 판정이 보이는 것은 다른 주장이다.
// 공이 어느 쪽으로 들어갔는지를 보려면 골대가 화면을 채워야 한다.
// 수배우가 화면을 얼마나 먹는가. 키퍼가 화면을 덮으면 공도 골대도 안 보인다.
// 골대 폭만 재면 카메라를 당길수록 점수가 오르고, 당길수록 배우가 커진다.
export function actorFrac(group, camera) {
  box.setFromObject(group);
  camera.updateMatrixWorld();
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (let i = 0; i < 8; i += 1) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    v.project(camera);
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  return { widthFrac: (maxX - minX) / 2, heightFrac: (maxY - minY) / 2 };
}

export function goalFraming(camera, halfW, height) {
  camera.updateMatrixWorld();
  const pts = [[-halfW, 0], [halfW, 0], [-halfW, height], [halfW, height]];
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  for (const [x, y] of pts) {
    v.set(x, y, 0).project(camera);
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  // NDC 폭 2가 화면 전체다. 1이면 절반을 차지한다.
  return { widthFrac: (maxX - minX) / 2, heightFrac: (maxY - minY) / 2, minX, maxX, minY, maxY };
}

// 한 구 동안의 최악값만 남긴다. 평균은 한 프레임짜리 이탈을 지운다.
// 배우는 교체된다. 객체를 붙들면 낡은 것을 재게 되므로 접근자를 받는다.
export function createStageProbe(camera, actors) {
  const worst = {};
  function reset() {
    for (const k of Object.keys(actors)) worst[k] = { minFootY: Infinity, maxFootY: -Infinity, minInside: 8, maxAbsX: 0, maxAbsY: 0, maxWidthFrac: 0, maxHeightFrac: 0, frames: 0 };
  }
  function sample() {
    for (const [k, get] of Object.entries(actors)) {
      const g = get();
      const w = worst[k];
      const y = footY(g);
      const f = framing(g, camera);
      w.frames += 1;
      w.minFootY = Math.min(w.minFootY, y);
      w.maxFootY = Math.max(w.maxFootY, y);
      w.minInside = Math.min(w.minInside, f.inside);
      w.maxAbsX = Math.max(w.maxAbsX, f.maxAbsX);
      if (f.maxAbsY > w.maxAbsY) w.peak = { maxAbsY: +f.maxAbsY.toFixed(3), maxAbsX: +f.maxAbsX.toFixed(3), inside: f.inside, footY: +y.toFixed(2), pos: [+g.position.x.toFixed(2), +g.position.y.toFixed(2), +g.position.z.toFixed(2)], rz: +g.rotation.z.toFixed(2), tail: (typeof window !== 'undefined' ? window.__tailKind : null) };
      w.maxAbsY = Math.max(w.maxAbsY, f.maxAbsY);
      const a = actorFrac(g, camera);
      w.maxWidthFrac = Math.max(w.maxWidthFrac || 0, a.widthFrac);
      w.maxHeightFrac = Math.max(w.maxHeightFrac || 0, a.heightFrac);
    }
  }
  reset();
  return { sample, reset, worst, footY, framing };
}
