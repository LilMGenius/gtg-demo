// 손맛. 완벽히 정렬된 수학적 프리미티브가 이 게임의 가장 큰 결함이었다.
// 저폴리는 저예산으로 읽히지만, 정확히 직각인 상자는 미완성으로 읽힌다.
// 플래시게임 감성은 폴리곤 수가 아니라 삐뚤게 그린 선에서 나온다.
import * as THREE from '../../vendor/three.module.min.js';

// 좌표를 넣으면 항상 같은 값이 나오는 잡음. 프레임마다 흔들리면 지직거림이 된다.
// 정점 인덱스가 아니라 위치를 해싱한다. 상자 모서리에는 면마다 겹친 정점이 세 개씩 있고,
// 인덱스로 흔들면 그 셋이 각자 다른 곳으로 가서 모서리가 찢어진다.
function hashNoise(x, y, z, salt) {
  let h = Math.imul(Math.round(x * 997) ^ 0x27d4eb2d, 0x85ebca6b);
  h ^= Math.imul(Math.round(y * 997) + 0x165667b1, 0xc2b2ae35);
  h ^= Math.imul(Math.round(z * 997) - 0x9e3779b9, 0x27d4eb2f);
  h ^= Math.imul(salt + 0x6d2b79f5, 0x85ebca77);
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 4294967295 - 0.5;
}

// 정점을 흔든다. 0.01은 렌더 오차로 읽혀 아무 일도 안 일어난 것 같았다.
// 0.09는 상자가 녹은 것으로 읽혔다. 0.035에서 손으로 그은 선이 된다.
// 우그러진 원판. 각도마다 반지름이 다르다.
// 완벽한 원은 소프트웨어가 찍은 도장이다. 그늘은 몸 모양을 따라 찌그러진다.
export function blobGeo(r, seed) {
  const N = 16;
  const pos = [0, 0, 0];
  const idx = [];
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967295; };
  for (let i = 0; i <= N; i += 1) {
    const a = (i / N) * Math.PI * 2;
    // 0.06은 원과 구분이 안 갔고 0.4는 별 모양이 됐다.
    const rr = r * (1 + (rnd() - 0.5) * 0.34);
    pos.push(Math.cos(a) * rr, Math.sin(a) * rr, 0);
  }
  for (let i = 1; i <= N; i += 1) idx.push(0, i, i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export function jitterMesh(mesh, amp = 0.035, salt = 1) {
  if (!mesh.isMesh || mesh.userData.jittered) return mesh;
  const geo = mesh.geometry.clone();
  const p = geo.attributes.position;
  const a = p.array;
  for (let i = 0; i < a.length; i += 3) {
    const x = a[i]; const y = a[i + 1]; const z = a[i + 2];
    a[i] += hashNoise(x, y, z, salt) * amp * 2;
    a[i + 1] += hashNoise(y, z, x, salt + 7) * amp * 2;
    a[i + 2] += hashNoise(z, x, y, salt + 13) * amp * 2;
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  mesh.geometry = geo;
  mesh.userData.jittered = true;
  return mesh;
}

// 시드 고정 난수. 배치 간격을 손으로 놓은 것처럼 어긋내는 데 쓴다.
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 검정 외곽선. 뒤집힌 복제본을 살짝 키워 실루엣만 남긴다.
// 타이틀 로고에는 외곽선이 있고 씬에는 없어서 둘이 다른 게임처럼 보였다.
// 배율로 주면 굵기가 물체 크기에 비례한다. 1.04는 골대 기둥에서 3mm였고 화면에 아무것도 안 나왔다.
// 굵기를 미터로 받아 바운딩 반경으로 나눈다. 큰 물체든 작은 물체든 같은 펜으로 그은 선이 된다.
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x14100c, side: THREE.BackSide, fog: false });

export function addOutline(mesh, width = 0.035) {
  if (mesh.userData.outlined) return null;
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox;
  const o = new THREE.Mesh(g, OUTLINE_MAT);
  // 축마다 따로 잰다. 균일 배율이면 긴 기둥이 세로로만 자라 크로스바를 뚫는다.
  o.scale.set(
    1 + (width * 2) / Math.max(0.04, b.max.x - b.min.x),
    1 + (width * 2) / Math.max(0.04, b.max.y - b.min.y),
    1 + (width * 2) / Math.max(0.04, b.max.z - b.min.z)
  );
  // 스케일은 지오메트리 원점 기준이다. 사지 캡슐은 끝단으로 옮겨져 있어서
  // 그대로 키우면 외곽선이 한쪽으로만 밀려 나가고 반대쪽에는 아무것도 안 남는다.
  // 바운딩 중심이 제자리에 있도록 되민다.
  const cx = (b.max.x + b.min.x) / 2;
  const cy = (b.max.y + b.min.y) / 2;
  const cz = (b.max.z + b.min.z) / 2;
  o.position.set(cx * (1 - o.scale.x), cy * (1 - o.scale.y), cz * (1 - o.scale.z));
  o.userData.probeIgnore = true;
  o.userData.isOutline = true;
  o.renderOrder = -1;
  mesh.add(o);
  mesh.userData.outlined = true;
  return o;
}
