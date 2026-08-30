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
// 0.42는 키퍼 몸통 두께보다 크고 골대 그물 간격보다 작다.
const BEHIND = 0.42;
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
function spikeGeo(n, seed) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + (rnd(i, seed) - 0.5) * 0.62;
    const len = 0.58 + rnd(i, seed + 3) * 1.02;
    // 1픽셀 선은 흙 운동장 위에서 사라진다. 안쪽이 두껍고 끝이 뾰족한 삼각형이라야 잉크로 읽힌다.
    const w = 0.046 + rnd(i, seed + 7) * 0.042;
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
function zigGeo(n, seed) {
  const pts = [];
  // 톱니는 면이라 같은 반지름에서도 뻗는 별보다 화면을 몇 배 더 덮는다.
  // 중심까지 채우면 터지는 지점의 공이 100프레임 넘게 가려지므로, 가운데를 비운 띠로 만든다.
  // 구멍 반지름 0.4는 배율 1.2를 곱해도 공 반지름 0.14보다 크니 공이 항상 뚫고 보인다.
  const inner = 0.4;
  const band = 0.6;
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) * 0.5;
    const tip = 0.86 + rnd(i, seed) * 0.34;
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
function shardGeo(n, seed) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + (rnd(i, seed + 1) - 0.5) * 0.8;
    const d = 0.42 + rnd(i, seed + 2) * 0.52;
    const len = 0.3 + rnd(i, seed + 4) * 0.36;
    const w = 0.09 + rnd(i, seed + 6) * 0.08;
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
function shapeGeo(kindShape, n) {
  const key = kindShape + n;
  if (!SHAPES.has(key)) {
    const seed = n * 1.7 + kindShape.length;
    const g = kindShape === 'zig' ? zigGeo(n, seed) : kindShape === 'shard' ? shardGeo(n, seed) : spikeGeo(n, seed);
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
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  // 색이 사건마다 갈리고 나니 두꺼운 띠가 가산 합성으로 키퍼를 통째로 물들였다. 띠를 테두리까지 좁힌다.
  const ring = new THREE.Mesh(blobGeo(4.2, 20, 0.24, 0.87), ringMat);
  ring.visible = false;
  ring.renderOrder = 8;
  ring.userData.probeIgnore = true;
  scene.add(ring);

  // 별은 뻗은 길이가 키퍼 몸통을 넘는다. 깊이 검사를 끄면 몸 앞을 그대로 지나가서
  // 접점이 아니라 화면에 얹힌 스티커로 읽혔다. 깊이는 읽고 쓰지만 않는다.
  const starMat = new THREE.MeshBasicMaterial({ color: 0xfffbe8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const star = new THREE.Mesh(shapeGeo('spike', 8), starMat);
  star.renderOrder = 8;
  star.visible = false;
  star.userData.probeIgnore = true;
  scene.add(star);

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

  let t = 0;
  let wordSpin = 0;
  // 얼룩을 매번 같은 각으로 띄우면 삐뚤어도 도장으로 읽힌다. 구마다 통째로 돌린다.
  let blobSpin = 0;
  let wordSide = 0;
  // 뒤따르는 소리와 지금 몇 단째인지. 단이 바뀌면 글자만이 아니라 기울기와 자리도 바뀐다.
  let follow = '';
  let stage = 0;
  let life = 0;
  let power = 1;
  const at = new THREE.Vector3();
  // 계측이 임팩트를 뺀 같은 프레임을 찍을 수 있어야 한다.
  // 안 그러면 화면에 남은 화소가 임팩트인지 뒤의 골대인지 말할 수 없다.
  let hidden = false;

  // 사건이 일어난 좌표를 받는다. 세기는 사건의 무게다.
  // 0.34초는 사람 눈에 번짝이고 정지 프레임에는 거의 안 잡힌다. 0.55가 읽힌다.
  // 0.9를 써 보니 다음 구의 배치까지 글자가 남아 화면이 지저분해졌다.
  // 수명 셋 중 가장 긴 잔막이 전체 수명을 정한다.
  function burst(pos, strength = 1, word = '', kind = '', word2 = '') {
    at.copy(pos);
    power = strength;
    life = D_VEIL;
    t = 0;
    // 색은 사건이 정한다. 이름이 표에 없으면 예전 흰 얼룩 그대로다.
    const tone = TONE[kind] || TONE_DEFAULT;
    flashMat.color.setHex(tone.c);
    ringMat.color.setHex(tone.ring);
    starMat.color.setHex(tone.c);
    star.geometry = shapeGeo(tone.shape, tone.spokes);
    flash.visible = !hidden;
    ring.visible = !hidden;
    veil.visible = !hidden;
    star.visible = !hidden;
    star.position.set(at.x, at.y, at.z + BEHIND);
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
      wordSide = Math.random() < 0.5 ? -1 : 1;
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
      ringMat.opacity = Math.pow(f, 1.5) * 0.62;
    } else if (flash.visible) {
      flash.visible = false;
      ring.visible = false;
      flashMat.opacity = 0;
      ringMat.opacity = 0;
    }
    if (u >= 1) {
      star.visible = false;
      wordMesh.visible = false;
      for (const m of dust) m.visible = false;
      for (const m of chips) m.visible = false;
      starMat.opacity = 0;
      wordMat.opacity = 0;
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
    starMat.opacity = (1 - u) * 0.9;
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
    veil.position.set(at.x, at.y + uv * 0.3, at.z + BEHIND);
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
      const span = worldSpanAt(camera, at);
      const fit = Math.min(pop * (0.7 + power * 0.35), (span * MAX_WORD_FRAC) / WORD_W);
      // 미는 양은 취향이 아니라 계산이다. 글자 반폭에 몸통 반폭을 더해야 두 사각형이 안 겹친다.
      const push = WORD_W * fit * 0.5 + SUBJ_HALF;
      let side = Math.sign(wordSide) || 1;
      // 밀어낸 자리가 화면 밖이면 사건 대신 잘린 글자가 남는다. 그때만 반대쪽으로 넘긴다.
      probe.set(at.x + side * push, at.y, at.z).project(camera);
      if (Math.abs(probe.x) > EDGE_NDC) side = -side;
      wordMesh.position.set(at.x + side * push, at.y + 0.28 + w * 0.24 + stage * 0.2, at.z);
      wordMesh.quaternion.copy(camera.quaternion);
      wordMesh.rotateZ(wordSpin);
      wordMesh.scale.setScalar(fit);
      wordMat.opacity = w > 0.78 ? Math.max(0, (1 - w) / 0.22) : 1;
    }
  }

  function hideAll() {
    flash.visible = false;
    ring.visible = false;
    veil.visible = false;
    star.visible = false;
    wordMesh.visible = false;
    for (const m of dust) m.visible = false;
    for (const m of chips) m.visible = false;
    flashMat.opacity = 0;
    ringMat.opacity = 0;
    veilMat.opacity = 0;
    starMat.opacity = 0;
    wordMat.opacity = 0;
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
    veil.visible = live;
    star.visible = bodyLive;
    // 글자는 본체보다 오래 산다. 뒤따르는 소리가 본체가 꺼진 뒤에 뜨기 때문이다.
    wordMesh.visible = live && Boolean(wordMat.map);
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
      shown: dust.filter((m) => m.visible).length + chips.filter((m) => m.visible).length
        + (star.visible ? 1 : 0) + (flash.visible ? 1 : 0) + (ring.visible ? 1 : 0) + (veil.visible ? 1 : 0),
      hidden
    };
  }

  return { burst, update, hide, state };
}
