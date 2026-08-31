// 임팩트. 사건이 일어난 자리에 한 번 터지고 사라진다.
// 파티클 시스템은 없다. 도형 몇 개를 키우고 지우는 것이 전부다.
import * as THREE from '../../../vendor/three.module.min.js';

// 한 번의 충돌은 수명 하나가 아니다. 순간 플래시, 본체, 남아 떠 있는 잔막 셋이 겹쳐야 한 발로 읽힌다.
// 수명이 하나면 사건 직후 프레임에 아무것도 없다. 별과 흙은 시간이 지나야 커지기 때문이다.
const D_FLASH = 0.07;
const D_BODY = 0.55;
const D_VEIL = 1.05;
// 만화 효과음은 한 번 쓰고 사라지지 않는다. 때리는 소리 뒤에 따라붙는 소리가 있다.
// 520ms는 정지 프레임이 사건을 찍는 시각이다. 그때 글자가 비면 사건이 없던 것으로 읽힌다.
const D_WORD2 = 0.52;
// 별과 잔막은 접촉점을 지나는 카메라 정면 판이다. 접촉점 z에 그대로 세우면
// 판이 몸통 한가운데를 갈라 절반이 몸 앞에 그려지고, 사건의 주체가 잉크에 덮인다.
// 주체 뒤로 물리면 깊이 검사가 몸을 살려 두고 잉크는 몸 둘레로만 뻗는다.
// 0.42는 선 키퍼의 몸통 두께다. 못 잰 경우의 바닥값으로만 쓴다.
const BEHIND = 0.42;
// 넘어지거나 손을 뻗는 포즈는 몸이 카메라 시선축으로 키만큼 눕는다. 고정값 0.42는 그 몸
// 한가운데를 갈라서 별이 머리와 팔을 덮고 개그가 안 읽힌다. 부르는 쪽이 실제 깊이를 재서 넘긴다.
// 1.2는 상한이다. 이보다 밀면 판이 키커 쪽으로 넘어가 사건이 남의 발치에서 터진다.
const BEHIND_MAX = 1.2;
// 글자는 월드 크기로 정해 놓으면 카메라가 가까울 때 화면 폭의 사분의 일을 먹고 주체를 밀어낸다.
// 그러면 정지 프레임에서 무슨 일이 났는지는 글자로만 읽히고 그림은 사라진다. 화면에 대고 재서 깎는다.
const MAX_WORD_FRAC = 0.25;
// 글자판 원본 폭. PlaneGeometry(1.4, 0.7)과 같이 움직여야 계산이 맞는다.
const WORD_W = 1.4;
// 키퍼 몸통 반폭. 글자 반폭에 이만큼을 더해야 글자 사각형이 몸에 안 걸린다.
const SUBJ_HALF = 0.62;
// 글자 중심이 이보다 가장자리에 붙으면 화면 밖으로 잘린다. 넘으면 반대쪽으로 뒤집는다.
const EDGE_NDC = 0.78;

// 파편이 튀는 방향. 균등한 각으로 놓으면 부채가 되므로 미리 흩어 고정한 각 여덟 개를 쓴다.
const SPOKES = [0.14, 0.92, 1.68, 2.51, 3.29, 4.05, 4.61, 5.55];
// 완전한 원 셋이 같은 중심에 겹치면 폭발이 아니라 과녁으로 읽힌다. 손그림 잉크는 원을 못 그린다.
// 반지름을 각도마다 두 주기로 흔들어 테두리를 삐뚤게 만든다. seed가 층마다 다른 얼룩을 준다.
function blobGeo(seed, seg, wob, inner) {
  const rAt = (i) => {
    const a = (i / seg) * Math.PI * 2;
    return 1 + Math.sin(a * 3 + seed) * wob + Math.sin(a * 7 + seed * 2.7) * wob * 0.45;
  };
  const pos = [];
  for (let i = 0; i < seg; i += 1) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const r0 = rAt(i);
    const r1 = rAt(i + 1);
    const x0 = Math.cos(a0) * r0;
    const y0 = Math.sin(a0) * r0;
    const x1 = Math.cos(a1) * r1;
    const y1 = Math.sin(a1) * r1;
    if (inner > 0) {
      const ix0 = Math.cos(a0) * r0 * inner;
      const iy0 = Math.sin(a0) * r0 * inner;
      const ix1 = Math.cos(a1) * r1 * inner;
      const iy1 = Math.sin(a1) * r1 * inner;
      pos.push(ix0, iy0, 0, x0, y0, 0, x1, y1, 0);
      pos.push(ix0, iy0, 0, x1, y1, 0, ix1, iy1, 0);
    } else {
      pos.push(0, 0, 0, x0, y0, 0, x1, y1, 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}
// 값은 좌표에서만 나온다. 프레임마다 다시 뽑으면 정지 프레임이 매번 달라져 계측이 못 쓴다.
function rnd(i, k) {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
// 뻗는 별. 길이 편차를 두 배 넘게 벌려야 자로 그린 바퀴살에서 벗어난다.
function spikeGeo(n, seed, grow = 0) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + (rnd(i, seed) - 0.5) * 0.62;
    const len = 0.58 + rnd(i, seed + 3) * 1.02 + grow;
    // 1픽셀 선은 흙 운동장 위에서 사라진다. 안쪽이 두껍고 끝이 뾰족한 삼각형이라야 잉크로 읽힌다.
    const w = 0.046 + rnd(i, seed + 7) * 0.042 + grow;
    const px = -Math.sin(a) * w;
    const py = Math.cos(a) * w;
    const bx = Math.cos(a) * 0.32;
    const by = Math.sin(a) * 0.32;
    pts.push(bx + px, by + py, 0, bx - px, by - py, 0, Math.cos(a) * len, Math.sin(a) * len, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}
// 톱니 왕관. 안쪽이 닫힌 띠라서 뻗는 별과 실루엣이 겹치지 않는다. 무언가에 먹힌 사건 쪽에 쓴다.
function zigGeo(n, seed, grow = 0) {
  const pts = [];
  // 톱니는 면이라 같은 반지름에서도 뻗는 별보다 화면을 몇 배 더 덮는다.
  // 중심까지 채우면 터지는 지점의 공이 100프레임 넘게 가려지므로, 가운데를 비운 띠로 만든다.
  // 구멍 반지름 0.4는 배율 1.2를 곱해도 공 반지름 0.14보다 크니 공이 항상 뚫고 보인다.
  const inner = 0.4 - grow;
  const band = 0.6 + grow;
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) * 0.5;
    const tip = 0.86 + rnd(i, seed) * 0.34 + grow;
    const i0 = inner * (0.82 + rnd(i, seed + 5) * 0.36);
    const i1 = inner * (0.82 + rnd(i + 1, seed + 5) * 0.36);
    const x0 = Math.cos(a0) * i0;
    const y0 = Math.sin(a0) * i0;
    const x1 = Math.cos(a1) * i1;
    const y1 = Math.sin(a1) * i1;
    const bx0 = Math.cos(a0) * band;
    const by0 = Math.sin(a0) * band;
    const bx1 = Math.cos(a1) * band;
    const by1 = Math.sin(a1) * band;
    pts.push(bx0, by0, 0, bx1, by1, 0, Math.cos(am) * tip, Math.sin(am) * tip, 0);
    // 띠가 끊기면 톱니가 낱개로 흩어진다. 안쪽 테두리와 바깥 테두리를 이어야 한 덩어리 링이 된다.
    pts.push(x0, y0, 0, bx0, by0, 0, bx1, by1, 0);
    pts.push(x0, y0, 0, bx1, by1, 0, x1, y1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}
// 흩어진 쐐기. 중심이 비어 있어 무언가가 떨어져 나간 사건에 붙는다.
function shardGeo(n, seed, grow = 0) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + (rnd(i, seed + 1) - 0.5) * 0.8;
    const d = 0.42 + rnd(i, seed + 2) * 0.52;
    const len = 0.3 + rnd(i, seed + 4) * 0.36 + grow * 2;
    const w = 0.09 + rnd(i, seed + 6) * 0.08 + grow;
    const cx = Math.cos(a) * d;
    const cy = Math.sin(a) * d;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const px = -uy * w;
    const py = ux * w;
    pts.push(cx - ux * len * 0.5 + px, cy - uy * len * 0.5 + py, 0, cx - ux * len * 0.5 - px, cy - uy * len * 0.5 - py, 0, cx + ux * len * 0.5, cy + uy * len * 0.5, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}
// 형태를 매 사건마다 새로 만들면 GPU 버퍼가 계속 늘어난다. 형태와 갈래 수 조합은 유한하니 캐시한다.
const SHAPES = new Map();
function shapeGeo(kindShape, n, grow = 0) {
  const key = [kindShape, n, grow].join();
  if (!SHAPES.has(key)) {
    const seed = n * 1.7 + kindShape.length;
    const g = kindShape === 'zig' ? zigGeo(n, seed, grow) : kindShape === 'shard' ? shardGeo(n, seed, grow) : spikeGeo(n, seed, grow);
    SHAPES.set(key, g);
  }
  return SHAPES.get(key);
}

// 선방과 실점과 장갑 이탈이 같은 흰 얼룩으로 터지면, 크기만 다른 같은 스티커 세 장이 된다.
// 색과 바퀴살 개수를 사건마다 갈라 두면 정지 프레임 한 장으로도 무슨 일이 났는지 갈린다.
// 색만 갈라 두면 정지 프레임에서 같은 스티커의 색 변주로 읽힌다. 실루엣까지 갈라야 사건이 구분된다.
// 막아낸 사건은 뻗는 별, 먹힌 사건은 톱니, 무언가 떨어져 나간 사건은 흩어진 쐐기다.
const TONE = {
  save: { c: 0xdff1ff, ring: 0xbfe4ff, spokes: 8, shape: 'spike' },
  catch: { c: 0xffffff, ring: 0xdfe8ff, spokes: 6, shape: 'spike' },
  gloveGone: { c: 0xffef9a, ring: 0xffd23f, spokes: 7, shape: 'shard' },
  carriedIn: { c: 0xffd7c4, ring: 0xff8f5a, spokes: 5, shape: 'zig' },
  spill: { c: 0xf2ffe0, ring: 0xc4e77a, spokes: 5, shape: 'shard' },
  downed: { c: 0xffd0d0, ring: 0xff5f52, spokes: 7, shape: 'zig' },
  net: { c: 0xf6f1ff, ring: 0xb59cff, spokes: 6, shape: 'zig' },
  // 골대는 그물과 정반대의 재질이다. 그물은 먹고 늘어지고 철봉은 튕기고 운다.
  // 바퀴살 4개는 표 전체에서 가장 적다. 성기고 딱딱한 불꽃이 금속 접촉으로 읽힌다.
  // 낡은 철봉의 녹슨 놋쇠색을 테두리로 쓰면 하얀 선방 얼룩과 정지 프레임에서 갈린다.
  frame: { c: 0xfff6d8, ring: 0xf2b23a, spokes: 4, shape: 'shard' },
  // 이 넷은 표에 없어서 흰 기본값으로 떨어졌다. 앵커가 키퍼 머리 위라 흰 크로스바와 겹쳐 화면에서 사라졌다.
  // 청록은 갈색 흙의 보색이면서 흰 철봉과도 명도가 갈린다. 돌진은 성공도 실패도 아닌 능동이라 뻗는 별을 쓴다.
  charge: { c: 0xd9fff2, ring: 0x2ec4a6, spokes: 6, shape: 'spike' },
  // 제껴진 사건이라 먹힌 계열의 톱니를 쓴다. 바퀴살 9개는 표 전체에서 최다라 흐트러진 실루엣으로 읽힌다.
  beat: { c: 0xffe2cf, ring: 0xff7a3d, spokes: 9, shape: 'zig' },
  // 공이 떨어져 나간 사건이라 쐐기다. 보라는 남은 쐐기 셋(노랑 둘, 연두 하나)과 색으로 갈린다.
  lost: { c: 0xefe0ff, ring: 0x8a5cff, spokes: 6, shape: 'shard' },
  // 한눈팔다 먹힌 사건이라 톱니다. 분홍은 하트 연출과 같은 계열이라 원인이 색으로 읽힌다.
  talked: { c: 0xffe0f4, ring: 0xff5fbf, spokes: 5, shape: 'zig' },
};
const TONE_DEFAULT = { c: 0xfffdf0, ring: 0xffffff, spokes: 8, shape: 'spike' };


// 만화 효과음. 캔버스에 글자를 그려 텍스처로 쓴다.
// 사건이 뭐였는지를 그림만으로 읽히게 하는 가장 싸고 확실한 방법이 이것이다.
// 외곽선을 안 그리면 흙 배경에서 글자가 사라진다. 검은 테두리를 먼저 칠한다.
function wordTex(word) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const c = cv.getContext('2d');
  c.font = "bold 84px Jua, sans-serif";
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = 16;
  c.strokeStyle = '#141414';
  c.strokeText(word, 128, 68);
  c.fillStyle = '#ffe14d';
  c.fillText(word, 128, 68);
  const t = new THREE.CanvasTexture(cv);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function createImpact(scene) {
  // 플래시. 두 프레임짜리다. 사건 직후 프레임에서 화면을 덮는 층은 이것 하나뿐이다.
  // 깊이 검사를 끄고 맨 위에 그린다. 접점이 키퍼 몸에 묻히면 층이 통째로 안 보인다.
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xfffdf0, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const flash = new THREE.Mesh(blobGeo(1.7, 15, 0.2, 0), flashMat);
  flash.visible = false;
  flash.renderOrder = 8;
  flash.userData.probeIgnore = true;
  scene.add(flash);

  // 충격파 고리. 바깥으로만 밀린다. 고리가 완전히 닫히면 도넛으로 읽히므로 두께를 얇게 둔다.
  // 가산 합성은 갈색 흙 위에서 색을 잃고 회색 얼룩이 된다. 흙 명도가 높아 더할 여지가 없기 때문이다.
  // 일반 합성에 0.95면 사건 색이 그대로 남는다. 배경 명도와 무관해지는 값이 이것이다.
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
  // 색이 사건마다 갈리고 나니 두꺼운 띠가 가산 합성으로 키퍼를 통째로 물들였다. 띠를 테두리까지 좁힌다.
  const ring = new THREE.Mesh(blobGeo(4.2, 20, 0.24, 0.87), ringMat);
  ring.visible = false;
  ring.renderOrder = 8;
  ring.userData.probeIgnore = true;
  scene.add(ring);

  // 고리 뒤에 까는 검정 테두리. 글자에 쓰던 lead/leadEdge와 같은 수법이다.
  // 1.06 배율에 안쪽 0.79를 물리면 고리 안팎으로 반지름의 3~4%씩 검정이 남는다. 흙 명도와 무관하게 형태가 선다.
  const ringEdgeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
  const ringEdge = new THREE.Mesh(blobGeo(4.2, 20, 0.24, 0.79), ringEdgeMat);
  ringEdge.visible = false;
  ringEdge.renderOrder = 7.9;
  ringEdge.userData.probeIgnore = true;
  scene.add(ringEdge);

  // 별은 뻗은 길이가 키퍼 몸통을 넘는다. 깊이 검사를 끄면 몸 앞을 그대로 지나가서
  // 접점이 아니라 화면에 얹힌 스티커로 읽혔다. 깊이는 읽고 쓰지만 않는다.
  const starMat = new THREE.MeshBasicMaterial({ color: 0xfffbe8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const star = new THREE.Mesh(shapeGeo('spike', 8), starMat);
  star.renderOrder = 8;
  star.visible = false;
  star.userData.probeIgnore = true;
  scene.add(star);

  // 별도 고리와 같은 병을 앓았다. 연한 사건색 뾰족선이 픽셀화를 거치면 흙과 섞여 회색 실이 된다.
  // 균일 배율은 이미 실패했다. 12퍼센트를 키워도 폭 4화소짜리 뾰족선에 반 화소가 붙어 화면에 아무것도 안 남았다.
  // EDGE_GROW 0.06은 도형 좌표계에서 뾰족선 반폭 0.046~0.088에 맞먹는 값이라, 검정 테가 선 자체만큼 두꺼워진다.
  const EDGE_GROW = 0.06;
  const starEdgeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const starEdge = new THREE.Mesh(shapeGeo(TONE_DEFAULT.shape, TONE_DEFAULT.spokes, EDGE_GROW), starEdgeMat);
  starEdge.renderOrder = 7.95;
  starEdge.visible = false;
  starEdge.userData.probeIgnore = true;
  scene.add(starEdge);

  // 흙먼지. 흙 운동장이라 부딪히면 흙이 뜬다. 잔디였으면 이걸 안 넣었다.
  const dustMat = new THREE.MeshBasicMaterial({ color: 0xbf9a63, transparent: true, opacity: 0, depthWrite: false });
  const dustGeo = new THREE.CircleGeometry(0.16, 7);
  const dust = [];
  for (let i = 0; i < 6; i += 1) {
    const m = new THREE.Mesh(dustGeo, dustMat);
    m.visible = false;
    m.userData.probeIgnore = true;
    // 여섯 개가 같은 각으로 날면 부채가 된다. 각도와 속도를 미리 흩어 고정한다.
    const a = (i / 6) * Math.PI * 2 + 0.7;
    m.userData.dir = new THREE.Vector3(Math.cos(a) * (0.7 + (i % 3) * 0.3), 0.5 + (i % 2) * 0.55, Math.sin(a) * 0.4);
    scene.add(m);
    dust.push(m);
  }

  // 파편. 흙덩이는 증발하지 않고 한 번 튀고 구른다. 그 한 번의 바운스가 흙바닥을 흙바닥으로 만든다.
  const chipMat = new THREE.MeshBasicMaterial({ color: 0x6b5334, transparent: true, opacity: 0, depthWrite: false });
  const chipGeo = new THREE.CircleGeometry(0.055, 5);
  const chips = [];
  for (let i = 0; i < 5; i += 1) {
    const m = new THREE.Mesh(chipGeo, chipMat);
    m.visible = false;
    m.userData.probeIgnore = true;
    const a = SPOKES[i] * 1.19 + 0.4;
    m.userData.dir = new THREE.Vector3(Math.cos(a) * (1.1 + (i % 4) * 0.42), 1.5 + (i % 3) * 0.7, Math.sin(a) * (0.6 + (i % 2) * 0.3));
    scene.add(m);
    chips.push(m);
  }

  // 잔막. 본체와 별개의 훨씬 크고 구조 없는 먼지 워시다. 이것이 사건 뒤의 여운을 만든다.
  const veilMat = new THREE.MeshBasicMaterial({ color: 0xcbb28c, transparent: true, opacity: 0, depthWrite: false });
  const veil = new THREE.Mesh(blobGeo(2.9, 13, 0.3, 0), veilMat);
  veil.visible = false;
  veil.userData.probeIgnore = true;
  scene.add(veil);


  // 글자 판. 도형 하나를 돌려세우고 텍스처만 갈아 끼운다.
  // 단어마다 메시를 따로 두면 드로콜이 늘고 게이트가 죽는다.
  const texCache = new Map();
  const wordMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false });
  const wordMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), wordMat);
  wordMesh.visible = false;
  wordMesh.renderOrder = 9;
  wordMesh.userData.probeIgnore = true;
  scene.add(wordMesh);

  // 소리를 몸 밖으로 밀어내면 화면에서 글자가 사건과 211화소 떨어진다(실측). 그 거리만큼
  // 글자는 사건의 소리가 아니라 화면 위의 자막으로 읽힌다. 충돌점까지 꼬리를 그어 붙인다.
  // 삼각형 하나면 충분하다. 만화의 소리 꼬리는 밑변이 글자, 꼭짓점이 사건이다.
  // 밑변 반폭. 0.19는 화면에서 130화소가 되어 꼬리가 아니라 판때기로 읽혔다(실측 i-save).
  // 만화 꼬리는 글자 높이의 3분의 1 안쪽이라야 소리로 읽힌다.
  const LEAD_W = 0.11;
  const LEAD_FAR = 0.8;
  // 꼭짓점은 주체 바로 옆에서 시작한다. 앵커 자체가 이미 머리나 공에서 밀려 나와 있으므로,
  // 여기서 몸 반폭을 한 번 더 빼면 두 번 밀린다(실측: 꼭짓점이 머리에서 1.17 월드 떨어져
  // 꼬리가 글자와 키퍼 어느 쪽에도 안 닿는 덩어리로 떴다). 짧게 띄우기만 한다.
  // 0.18은 몸 반폭(SUBJ_HALF 0.62)의 3분의 1도 안 되어 꼭짓점이 머리 위에 그대로 얹혔다.
  // 몸 반폭 바로 안쪽까지 띄우면 머리를 비우면서도 꼬리가 몸에서 떨어져 뜨지 않는다.
  const LEAD_NEAR = 0.52;
  // 밑변까지 최소 이만큼은 남아야 삼각형이 선으로 뭉개지지 않는다.
  const LEAD_MIN_RUN = 0.12;
  // 외곽선은 글자와 같은 굵기로 읽혀야 한 세트가 된다. 무게중심에서 균일 확대한다.
  const LEAD_EDGE = 1.42;
  const leadMat = new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  const leadEdgeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  const leadGeo = new THREE.BufferGeometry();
  leadGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const leadEdgeGeo = new THREE.BufferGeometry();
  leadEdgeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const lead = new THREE.Mesh(leadGeo, leadMat);
  const leadEdge = new THREE.Mesh(leadEdgeGeo, leadEdgeMat);
  lead.renderOrder = 8.7;
  leadEdge.renderOrder = 8.6;
  lead.frustumCulled = false;
  leadEdge.frustumCulled = false;
  lead.visible = false;
  leadEdge.visible = false;
  lead.userData.probeIgnore = true;
  leadEdge.userData.probeIgnore = true;
  scene.add(leadEdge);
  scene.add(lead);
  const leadR = new THREE.Vector3();
  const leadU = new THREE.Vector3();
  const leadD = new THREE.Vector3();
  const leadP = new THREE.Vector3();

  let t = 0;
  let wordSpin = 0;
  // 얼룩을 매번 같은 각으로 띄우면 삐뚤어도 도장으로 읽힌다. 구마다 통째로 돌린다.
  let blobSpin = 0;
  let wordSide = 0;
  // 글자가 피해야 할 주체의 세계 좌표. 없으면 중앙 바깥밀기 규칙만 쓴다.
  const avoid = new THREE.Vector3();
  let hasAvoid = false;
  // 뒤따르는 소리와 지금 몇 단째인지. 단이 바뀌면 글자만이 아니라 기울기와 자리도 바뀐다.
  let follow = '';
  let stage = 0;
  let life = 0;
  let power = 1;
  // 이 발이 몸에서 얼마나 물러서야 하는지. 사건마다 몸의 깊이가 다르므로 발마다 다시 잡힌다.
  let behind = BEHIND;
  const at = new THREE.Vector3();
  // 잔해는 사건이 일어난 자리에 남고, 글자는 사건을 저지른 몸을 따라간다.
  // 하나로 묶었더니 돌진하는 키퍼가 발화 좌표를 2.08m 떠났고(실측 charge) 말풍선만 허공에 남았다.
  const atWord = new THREE.Vector3();
  // 주체를 매 프레임 다시 읽는 함수. 움직이지 않는 사건은 null이고 그때 글자는 at에 고정된다.
  let track = null;
  // 계측이 임팩트를 뺀 같은 프레임을 찍을 수 있어야 한다.
  // 안 그러면 화면에 남은 화소가 임팩트인지 뒤의 골대인지 말할 수 없다.
  let hidden = false;

  // 사건이 일어난 좌표를 받는다. 세기는 사건의 무게다.
  // 0.34초는 사람 눈에 번짝이고 정지 프레임에는 거의 안 잡힌다. 0.55가 읽힌다.
  // 0.9를 써 보니 다음 구의 배치까지 글자가 남아 화면이 지저분해졌다.
  // 수명 셋 중 가장 긴 잔막이 전체 수명을 정한다.
  function burst(pos, strength = 1, word = '', kind = '', word2 = '', depth = 0, follow3d = null, avoidPos = null) {
    // 발은 하나뿐이다. 공이 골망에 닿는 순간의 출렁임이 뒤늦게 터지면서, 아직 살아 있는
    // 사건의 발을 통째로 덮어썼다. 그러면 정지 프레임에 남는 그림은 개그가 아니라 그물이다.
    // 본체가 살아 있는 동안에는 더 가벼운 발이 끼어들지 못한다. 같은 무게면 나중 것이 이긴다.
    if (life > 0 && t < D_BODY && power > strength) return false;
    at.copy(pos);
    atWord.copy(pos);
    track = follow3d;
    power = strength;
    behind = Math.min(BEHIND_MAX, Math.max(BEHIND, depth));
    life = D_VEIL;
    t = 0;
    // 색은 사건이 정한다. 이름이 표에 없으면 예전 흰 얼룩 그대로다.
    const tone = TONE[kind] || TONE_DEFAULT;
    flashMat.color.setHex(tone.c);
    ringMat.color.setHex(tone.ring);
    starMat.color.setHex(tone.c);
    star.geometry = shapeGeo(tone.shape, tone.spokes);
    starEdge.geometry = shapeGeo(tone.shape, tone.spokes, EDGE_GROW);
    flash.visible = !hidden;
    ring.visible = !hidden;
    ringEdge.visible = !hidden;
    veil.visible = !hidden;
    star.visible = !hidden;
    starEdge.visible = !hidden;
    star.position.set(at.x, at.y, at.z + behind);
    starEdge.position.copy(star.position);
    blobSpin = Math.random() * Math.PI * 2;
    for (const m of dust) { m.visible = !hidden; m.position.copy(at); }
    for (const m of chips) { m.visible = !hidden; m.position.copy(at); }
    wordMesh.visible = Boolean(word) && !hidden;
    follow = word2;
    stage = 0;
    if (word) {
      if (!texCache.has(word)) texCache.set(word, wordTex(word));
      wordMat.map = texCache.get(word);
      wordMat.needsUpdate = true;
      // 같은 각도로 매번 뜨면 도장찍기로 읽힌다. 매번 달리 기울인다.
      wordSpin = (Math.random() - 0.5) * 0.52;
      // 글자를 머리 위로 피하면 접촉점과 100px 넘게 벌어져 자막으로 읽힌다.
      // 얼굴은 옆으로 비켜서 피한다. 어느 쪽인지만 여기서 정하고, 얼마나 미는지는 화면을 보고 정한다.
      // 난수로 정하면 같은 사건이 실행마다 다른 쪽에 뜬다. 운이 나쁘면 글자가 주체를 덮고(실측 downed 12px)
      // 운이 나쁘면 주체 반대편으로 밀려 거리가 두 배가 된다(실측 gloveGone 338px).
      // 골대 중앙이 x=0이고 주체는 늘 그 근처에 있으므로, 중앙에서 바깥으로 밀면 어느 경우에도 몸을 안 덮는다.
      wordSide = at.x >= 0 ? 1 : -1;
      // 그 전제는 주체가 중앙에 머물 때만 참이다. talked는 키퍼가 골대를 떠나 행인 쪽으로 걸어 나간다.
      // 피할 주체를 받으면 어느 쪽으로 미는지는 화면을 보고 정한다. 그 판정은 update가 한다.
      hasAvoid = !!avoidPos;
      if (avoidPos) avoid.copy(avoidPos);
    }
  }

  // 화면 폭 한 개가 이 깊이에서 월드로 몇인지. 월드 변위가 아니라 화면 화소가 기준이다.
  const camPos = new THREE.Vector3();
  const probe = new THREE.Vector3();
  function worldSpanAt(camera, p) {
    const dist = Math.max(0.5, camera.getWorldPosition(camPos).distanceTo(p));
    return 2 * Math.tan((camera.fov * Math.PI) / 360) * dist * camera.aspect;
  }

  function update(dt, camera) {
    if (life <= 0) return;
    t += dt;
    // 주체가 움직이는 사건은 여기서 앵커를 다시 읽는다. 발화 프레임에 못 박으면
    // 돌진이 끝날 무렵 말풍선이 주체를 놓치고 자막으로 읽힌다.
    if (track) track(atWord);
    const uf = t / D_FLASH;
    const u = Math.min(1, t / D_BODY);
    const uv = t / D_VEIL;
    if (uv >= 1) {
      hideAll();
      life = 0;
      return;
    }
    // 플래시는 첫 프레임이 최대다. 커지면서 나타나는 층은 사건 직후 프레임에 아무것도 남기지 못한다.
    if (uf < 1) {
      const f = 1 - uf;
      flash.position.copy(at);
      flash.quaternion.copy(camera.quaternion);
      flash.rotateZ(blobSpin);
      flash.scale.setScalar((0.3 + uf * 0.12) * power);
      // 0.7은 포스터라이즈를 거치면 키퍼 얼굴까지 한 색으로 뭉갠다. 접점이 밝되 몸이 남는 값이 이것이다.
      flashMat.opacity = Math.pow(f, 0.55) * 0.44;
      ring.position.copy(at);
      ring.quaternion.copy(camera.quaternion);
      // 층마다 각을 어긋내지 않으면 삐뚠 테두리끼리 겹쳐 다시 매끈한 원이 된다.
      ring.rotateZ(blobSpin + 1.9);
      ring.scale.setScalar((0.46 + uf * 0.72) * power);
      ringMat.opacity = Math.pow(f, 1.5) * 0.95;
      ringEdge.position.copy(ring.position);
      ringEdge.quaternion.copy(ring.quaternion);
      ringEdge.scale.copy(ring.scale).multiplyScalar(1.06);
      ringEdgeMat.opacity = ringMat.opacity;
    } else if (flash.visible) {
      flash.visible = false;
      ring.visible = false;
      ringEdge.visible = false;
      flashMat.opacity = 0;
      ringMat.opacity = 0;
      ringEdgeMat.opacity = 0;
    }
    if (u >= 1) {
      star.visible = false;
      starEdge.visible = false;
      wordMesh.visible = false;
      lead.visible = false;
      leadEdge.visible = false;
      for (const m of dust) m.visible = false;
      for (const m of chips) m.visible = false;
      starMat.opacity = 0;
      starEdgeMat.opacity = 0;
      wordMat.opacity = 0;
      leadMat.opacity = 0;
      leadEdgeMat.opacity = 0;
      dustMat.opacity = 0;
      chipMat.opacity = 0;
    } else {
    // 별은 빠르게 커지고 빠르게 빠진다. 천천히 사라지면 충격이 아니라 후광이 된다.
    // 크기를 연속으로 키우면 풍선처럼 부푼다. 손으로 그린 잉크는 프레임마다 튄다. 세 칸으로 끊는다.
    // 1.44는 화면 폭의 사분의 일을 먹어 사건이 아니라 화면 가림으로 읽혔다.
    // 잉크는 접촉점에 붙는 주석이지 배경을 대신하는 판이 아니다. 폭을 절반으로 접는다.
    const step = u < 0.2 ? 0.78 : u < 0.46 ? 0.52 : 0.65;
    star.scale.setScalar(step * power);
    star.quaternion.copy(camera.quaternion);
    // 같은 각으로 뜨면 형태를 갈라도 도장으로 읽힌다. 구마다 통째로 돌린다.
    star.rotateZ(blobSpin * 1.7);
    // 선형 감쇠는 전 구간을 흐린 회색으로 만든다. 계측상 크리틱이 보는 520ms에 0.27까지 빠졌다.
    // 제곱 감쇠는 본체 구간을 진하게 유지하다 끝에서 한 번에 사라진다. 같은 시각에 0.78이 남는다.
    starMat.opacity = (1 - u * u) * 0.9;
    // 외곽선은 별과 같은 자세, 같은 배율이다. 굵기 차이는 도형 자체가 이미 가지고 있다.
    starEdge.position.copy(star.position);
    starEdge.quaternion.copy(star.quaternion);
    starEdge.scale.copy(star.scale);
    // 테가 채움보다 옅으면 외곽선이 아니라 그림자로 읽힌다. 1.6은 채움 0.6에서 테를 불투명으로 만드는 배수다.
    starEdgeMat.opacity = Math.min(1, starMat.opacity * 1.6);
    // 먼지는 흩어지면서 가라앉는다. 위로만 보내면 연기가 된다.
    for (const m of dust) {
      const d = m.userData.dir;
      m.position.set(at.x + d.x * u * 1.1 * power, Math.max(0.04, at.y + (d.y * u - u * u * 1.6) * power), at.z + d.z * u * 1.1 * power);
      m.quaternion.copy(camera.quaternion);
      m.scale.setScalar((0.85 + u * 1.4) * power);
    }
    dustMat.opacity = (1 - u) * 0.55;
    // 파편은 반사 방향으로 날아가 한 번 튄다. 음수 높이를 감쇠해 되접으면 바운스가 된다.
    for (const m of chips) {
      const d = m.userData.dir;
      let h = (d.y * u * 2.1 - u * u * 4.6) * power;
      if (h < 0) h = -h * 0.3 * (1 - u);
      m.position.set(at.x + d.x * u * 1.9 * power, Math.max(0.03, at.y + h), at.z + d.z * u * 1.9 * power);
      m.quaternion.copy(camera.quaternion);
      m.scale.setScalar((0.8 + u * 0.5) * power);
    }
    chipMat.opacity = (1 - u) * 0.8;
    }
    // 잔막은 본체가 다 꺼진 뒤까지 남는다. 커지면서 옅어져야 가라앉는 먼지로 읽힌다.
    veil.position.set(at.x, at.y + uv * 0.3, at.z + behind);
    veil.quaternion.copy(camera.quaternion);
    veil.rotateZ(blobSpin - 2.4);
    // 잔막이 키퍼를 통째로 덮으면 사건이 아니라 화면 가림으로 읽힌다. 몸보다 작게 둔다.
    veil.scale.setScalar((0.5 + uv * 0.95) * power);
    veilMat.opacity = Math.pow(1 - uv, 1.6) * 0.24;
    if (wordMesh.visible) {
      // 뒤따르는 소리로 갈아 끼운다. 반대쪽으로 밀고 반대로 기울여야 잔상이 아니라 다음 소리로 읽힌다.
      if (stage === 0 && follow && t >= D_WORD2) {
        stage = 1;
        if (!texCache.has(follow)) texCache.set(follow, wordTex(follow));
        wordMat.map = texCache.get(follow);
        wordMat.needsUpdate = true;
        wordSpin = -wordSpin * 0.8 + 0.18;
        // 반대쪽으로 넘어가되 밀어내는 양은 줄이지 않는다. 줄이면 두 번째 소리가 몸 위로 돌아온다.
        wordSide = -wordSide;
      }
      // 0에서 키우면 충돌 프레임에 글자가 점만 하다. 만화 글자는 첫 칸에 이미 다 그려져 있다.
      // 연속으로 줄이면 바람 빠지는 풍선이 된다. 세 칸으로 끊어 튀었다가 주저앉힌다.
      const w = stage === 0 ? t / D_WORD2 : (t - D_WORD2) / (D_VEIL - D_WORD2);
      const base = stage === 0 ? 1.34 : 0.92;
      const pop = base * (w < 0.16 ? 1 : w < 0.36 ? 0.82 : 0.9);
      // 글자 크기는 화면이 정한다. 화면 폭의 사분의 일을 넘기면 글자가 장면이 되고 주체가 배경이 된다.
      const span = worldSpanAt(camera, atWord);
      const fit = Math.min(pop * (0.7 + power * 0.35), (span * MAX_WORD_FRAC) / WORD_W);
      // 미는 양은 취향이 아니라 계산이다. 글자 반폭에 몸통 반폭을 더해야 두 사각형이 안 겹친다.
      const push = WORD_W * fit * 0.5 + SUBJ_HALF;
      let side = Math.sign(wordSide) || 1;
      // 밀어낸 자리가 화면 밖이면 사건 대신 잘린 글자가 남는다. 그때만 반대쪽으로 넘긴다.
      probe.set(atWord.x + side * push, atWord.y, atWord.z).project(camera);
      if (Math.abs(probe.x) > EDGE_NDC) side = -side;
      // 주체가 글자 쪽에 서 있는지는 월드 거리로 못 잰다. 깊이가 다르면 월드로 2.4 떨어져도
      // 화면에서는 겹친다(실측: talked 키퍼 z 3.1, 글자 z -1). 그래서 화면 좌표로 잰다.
      if (hasAvoid) {
        probe.copy(avoid).project(camera);
        const avoidNdc = probe.x;
        probe.set(atWord.x + side * push, atWord.y, atWord.z).project(camera);
        const wordNdc = probe.x;
        // 글자 반폭을 화면에서 잰다. 세계 반폭을 그대로 쓰면 깊이에 따라 값이 어긋난다.
        probe.set(atWord.x + side * push + WORD_W * fit * 0.5, atWord.y, atWord.z).project(camera);
        const halfNdc = Math.abs(probe.x - wordNdc);
        // 0.06은 실측한 키퍼의 화면 반폭이다. talked 시점에 몸이 가로 70px을 차지했고
        // 1280 폭에서 반폭 35px, NDC로 0.055다. 여기에 여유를 얹었다.
        probe.set(atWord.x - side * push, atWord.y, atWord.z).project(camera);
        const flipOk = Math.abs(probe.x) <= EDGE_NDC && Math.abs(probe.x - avoidNdc) > Math.abs(wordNdc - avoidNdc);
        if (Math.abs(wordNdc - avoidNdc) < halfNdc + 0.06 && flipOk) side = -side;
      }
      wordMesh.position.set(atWord.x + side * push, atWord.y + 0.28 + w * 0.24 + stage * 0.2, atWord.z);
      wordMesh.quaternion.copy(camera.quaternion);
      wordMesh.rotateZ(wordSpin);
      wordMesh.scale.setScalar(fit);
      wordMat.opacity = w > 0.78 ? Math.max(0, (1 - w) / 0.22) : 1;
      // 꼬리는 글자를 따라간다. 단이 바뀌어 글자가 반대쪽으로 넘어가도 다시 계산되므로 따로 뒤집지 않는다.
      leadR.setFromMatrixColumn(camera.matrixWorld, 0);
      leadU.setFromMatrixColumn(camera.matrixWorld, 1);
      leadD.copy(wordMesh.position).sub(atWord);
      const ldx = leadD.dot(leadR);
      const ldy = leadD.dot(leadU);
      const llen = Math.hypot(ldx, ldy);
      // 글자가 이미 접점 위에 있으면 꼬리는 얼룩일 뿐이다. 붙일 거리가 있을 때만 그린다.
      const drawLead = llen > 0.5;
      lead.visible = drawLead;
      leadEdge.visible = drawLead;
      if (drawLead) {
        leadP.copy(leadR).multiplyScalar(-ldy / llen).addScaledVector(leadU, ldx / llen);
        const hw = LEAD_W * fit;
        // 띄우는 양은 화면 거리가 아니라 월드 고정값이다. 비율로 잡으면 글자가 멀수록 꼭짓점도
        // 같이 멀어져 꼬리가 주체를 놓친다.
        const near = Math.min(LEAD_FAR - LEAD_MIN_RUN, LEAD_NEAR / llen);
        // 밑변을 고정 비율로 두면 글자판 안으로 파고들어 검은 외곽선이 끝 글자를 덮는다.
        // 글자 상자 앞에서 끊어야 꼬리가 주체와 글자 사이 빈 자리에만 놓인다.
        const far = Math.min(LEAD_FAR, Math.max(near + LEAD_MIN_RUN, 1 - (WORD_W * fit * 0.42) / llen));
        const ax = atWord.x + leadD.x * near;
        const ay = atWord.y + leadD.y * near;
        const az = atWord.z + leadD.z * near;
        const bx = atWord.x + leadD.x * far;
        const by = atWord.y + leadD.y * far;
        const bz = atWord.z + leadD.z * far;
        const v = [ax, ay, az, bx + leadP.x * hw, by + leadP.y * hw, bz + leadP.z * hw, bx - leadP.x * hw, by - leadP.y * hw, bz - leadP.z * hw];
        const pa = leadGeo.attributes.position;
        const pe = leadEdgeGeo.attributes.position;
        const cx = (v[0] + v[3] + v[6]) / 3;
        const cy = (v[1] + v[4] + v[7]) / 3;
        const cz = (v[2] + v[5] + v[8]) / 3;
        for (let i = 0; i < 9; i += 3) {
          pa.array[i] = v[i];
          pa.array[i + 1] = v[i + 1];
          pa.array[i + 2] = v[i + 2];
          pe.array[i] = cx + (v[i] - cx) * LEAD_EDGE;
          pe.array[i + 1] = cy + (v[i + 1] - cy) * LEAD_EDGE;
          pe.array[i + 2] = cz + (v[i + 2] - cz) * LEAD_EDGE;
        }
        pa.needsUpdate = true;
        pe.needsUpdate = true;
        leadMat.opacity = wordMat.opacity;
        leadEdgeMat.opacity = wordMat.opacity;
      }
    }
  }

  function hideAll() {
    // 끝난 발의 추적기를 남겨 두면 다음 발이 앞 사건의 몸을 따라간다.
    track = null;
    flash.visible = false;
    ring.visible = false;
    ringEdge.visible = false;
    veil.visible = false;
    star.visible = false;
    starEdge.visible = false;
    wordMesh.visible = false;
    lead.visible = false;
    leadEdge.visible = false;
    for (const m of dust) m.visible = false;
    for (const m of chips) m.visible = false;
    flashMat.opacity = 0;
    ringMat.opacity = 0;
    ringEdgeMat.opacity = 0;
    veilMat.opacity = 0;
    starMat.opacity = 0;
    starEdgeMat.opacity = 0;
    wordMat.opacity = 0;
    leadMat.opacity = 0;
    leadEdgeMat.opacity = 0;
    dustMat.opacity = 0;
    chipMat.opacity = 0;
  }

  // 층마다 수명이 다르므로 되켤 때 일괄로 켜면 죽은 층이 되살아난다.
  // 그 한 층이 차분에 섞이면 잡음 바닥이 임팩트 화소로 계산된다.
  function hide(on) {
    hidden = Boolean(on);
    const live = !hidden && life > 0;
    const bodyLive = live && t < D_BODY;
    flash.visible = live && t < D_FLASH;
    ring.visible = flash.visible;
    ringEdge.visible = flash.visible;
    veil.visible = live;
    star.visible = bodyLive;
    starEdge.visible = bodyLive;
    // 글자는 본체보다 오래 산다. 뒤따르는 소리가 본체가 꺼진 뒤에 뜨기 때문이다.
    wordMesh.visible = live && Boolean(wordMat.map);
    // 꼬리는 글자에 딸린 층이다. 글자가 꺼진 프레임에 꼬리만 남으면 차분이 거짓말을 한다.
    lead.visible = wordMesh.visible && leadMat.opacity > 0;
    leadEdge.visible = lead.visible;
    for (const m of dust) m.visible = bodyLive;
    for (const m of chips) m.visible = bodyLive;
    return hidden;
  }

  // 선언된 수명과 화면에 남은 밝기는 다른 주장이다. 둘 다 적어야 캡처 순간이 피크였는지 갈린다.
  function state() {
    return {
      life,
      u: life > 0 ? Math.min(1, t / life) : 1,
      flash: flashMat.opacity,
      veil: veilMat.opacity,
      chip: chipMat.opacity,
      star: starMat.opacity,
      dust: dustMat.opacity,
      word: wordMat.opacity,
      atZ: at.z,
      behind,
      starZ: star.position.z,
      atX: at.x,
      atY: at.y,
      wordX: wordMesh.position.x,
      wordY: wordMesh.position.y,
      wordZ: wordMesh.position.z,
      shown: dust.filter((m) => m.visible).length + chips.filter((m) => m.visible).length
        + (star.visible ? 1 : 0) + (flash.visible ? 1 : 0) + (ring.visible ? 1 : 0) + (veil.visible ? 1 : 0),
      hidden
    };
  }

  return { burst, update, hide, state };
}
