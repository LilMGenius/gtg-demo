// 임팩트. 사건이 일어난 자리에 한 번 터지고 사라진다.
// 파티클 시스템은 없다. 도형 몇 개를 키우고 지우는 것이 전부다.
import * as THREE from '../../../vendor/three.module.min.js';

// 한 번의 충돌은 수명 하나가 아니다. 순간 플래시, 본체, 남아 떠 있는 잔막 셋이 겹쳐야 한 발로 읽힌다.
// 수명이 하나면 사건 직후 프레임에 아무것도 없다. 별과 흙은 시간이 지나야 커지기 때문이다.
const D_FLASH = 0.07;
const D_BODY = 0.55;
const D_VEIL = 1.05;

// 방사형 흰 선. 만화가 충격을 그리는 방법이 이것이다.
// 셰이더가 필요 없다. 원점에서 뻗은 선분을 카메라 쪽으로 돌려세우면 된다.
// 선을 원점에서 시작하면 가운데가 뭉쳐 별이 아니라 점이 된다. 안쪽 반경을 띄운다.
// 각도를 균등하게 놓으면 바퀴살이 되어 가짜로 읽힌다. 각도와 길이를 둘 다 흩는다.
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
function starGeo(list) {
  const pts = [];
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    const len = 0.78 + ((i * 0.37 + a * 0.21) % 1) * 0.46;
    pts.push(Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0, Math.cos(a) * len, Math.sin(a) * len, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}


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
  const ring = new THREE.Mesh(blobGeo(4.2, 20, 0.24, 0.74), ringMat);
  ring.visible = false;
  ring.renderOrder = 8;
  ring.userData.probeIgnore = true;
  scene.add(ring);

  const starMat = new THREE.LineBasicMaterial({ color: 0xfffbe8, transparent: true, opacity: 0 });
  const star = new THREE.LineSegments(starGeo(SPOKES), starMat);
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
  function burst(pos, strength = 1, word = '') {
    at.copy(pos);
    power = strength;
    life = D_VEIL;
    t = 0;
    flash.visible = !hidden;
    ring.visible = !hidden;
    veil.visible = !hidden;
    star.visible = !hidden;
    star.position.copy(at);
    blobSpin = Math.random() * Math.PI * 2;
    for (const m of dust) { m.visible = !hidden; m.position.copy(at); }
    for (const m of chips) { m.visible = !hidden; m.position.copy(at); }
    wordMesh.visible = Boolean(word) && !hidden;
    if (word) {
      if (!texCache.has(word)) texCache.set(word, wordTex(word));
      wordMat.map = texCache.get(word);
      wordMat.needsUpdate = true;
      // 같은 각도로 매번 뜨면 도장찍기로 읽힌다. 매번 달리 기울인다.
      wordSpin = (Math.random() - 0.5) * 0.52;
      wordSide = (Math.random() - 0.5) * 0.7;
    }
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
      flashMat.opacity = Math.pow(f, 0.55) * 0.7;
      ring.position.copy(at);
      ring.quaternion.copy(camera.quaternion);
      // 층마다 각을 어긋내지 않으면 삐뚠 테두리끼리 겹쳐 다시 매끈한 원이 된다.
      ring.rotateZ(blobSpin + 1.9);
      ring.scale.setScalar((0.46 + uf * 0.72) * power);
      ringMat.opacity = Math.pow(f, 1.5) * 0.85;
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
    star.scale.setScalar((0.9 + u * 1.15) * power);
    star.quaternion.copy(camera.quaternion);
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
    veil.position.set(at.x, at.y + uv * 0.3, at.z);
    veil.quaternion.copy(camera.quaternion);
    veil.rotateZ(blobSpin - 2.4);
    // 잔막이 키퍼를 통째로 덮으면 사건이 아니라 화면 가림으로 읽힌다. 몸보다 작게 둔다.
    veil.scale.setScalar((0.5 + uv * 0.95) * power);
    veilMat.opacity = Math.pow(1 - uv, 1.6) * 0.24;
    // 튀어나왔다가 제자리로 주저앉는다. 선형으로 키우면 풍선처럼 보인다.
    if (wordMesh.visible) {
      const pop = u < 0.24 ? (u / 0.24) * 1.3 : 1.3 - (u - 0.24) / 0.76 * 0.3;
      wordMesh.position.set(at.x + wordSide, at.y + 0.75 + u * 0.42, at.z);
      wordMesh.quaternion.copy(camera.quaternion);
      wordMesh.rotateZ(wordSpin);
      wordMesh.scale.setScalar(pop * (0.7 + power * 0.35));
      wordMat.opacity = u > 0.7 ? (1 - u) / 0.3 : 1;
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
    wordMesh.visible = bodyLive && Boolean(wordMat.map);
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
