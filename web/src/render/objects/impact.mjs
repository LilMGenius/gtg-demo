// 임팩트. 사건이 일어난 자리에 한 번 터지고 사라진다.
// 파티클 시스템은 없다. 도형 몇 개를 키우고 지우는 것이 전부다.
import * as THREE from '../../../vendor/three.module.min.js';

// 방사형 흰 선. 만화가 충격을 그리는 방법이 이것이다.
// 셰이더가 필요 없다. 원점에서 뻗은 선분 여섯 개를 카메라 쪽으로 돌려세우면 된다.
// 선을 원점에서 시작하면 가운데가 뭉쳐 별이 아니라 점이 된다. 안쪽 반경을 띄운다.
function starGeo(n) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + 0.31;
    pts.push(Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0, Math.cos(a), Math.sin(a), 0);
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
  const starMat = new THREE.LineBasicMaterial({ color: 0xfffbe8, transparent: true, opacity: 0 });
  const star = new THREE.LineSegments(starGeo(7), starMat);
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
  function burst(pos, strength = 1, word = '') {
    at.copy(pos);
    power = strength;
    life = 0.55;
    t = 0;
    star.visible = !hidden;
    star.position.copy(at);
    for (const m of dust) { m.visible = !hidden; m.position.copy(at); }
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
    const u = Math.min(1, t / life);
    if (u >= 1) {
      star.visible = false;
      wordMesh.visible = false;
      for (const m of dust) m.visible = false;
      life = 0;
      return;
    }
    // 별은 빠르게 커지고 빠르게 빠진다. 천천히 사라지면 충격이 아니라 후광이 된다.
    star.scale.setScalar((0.35 + u * 1.5) * power);
    star.quaternion.copy(camera.quaternion);
    starMat.opacity = (1 - u) * 0.9;
    // 먼지는 흩어지면서 가라앉는다. 위로만 보내면 연기가 된다.
    for (const m of dust) {
      const d = m.userData.dir;
      m.position.set(at.x + d.x * u * 1.1 * power, Math.max(0.04, at.y + (d.y * u - u * u * 1.6) * power), at.z + d.z * u * 1.1 * power);
      m.quaternion.copy(camera.quaternion);
      m.scale.setScalar((0.5 + u * 1.4) * power);
    }
    dustMat.opacity = (1 - u) * 0.55;
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

  function hide(on) {
    hidden = Boolean(on);
    const live = !hidden && life > 0;
    star.visible = live;
    wordMesh.visible = live && Boolean(wordMat.map);
    for (const m of dust) m.visible = live;
    return hidden;
  }

  // 선언된 수명과 화면에 남은 밝기는 다른 주장이다. 둘 다 적어야 캡처 순간이 피크였는지 갈린다.
  function state() {
    return {
      life,
      u: life > 0 ? Math.min(1, t / life) : 1,
      star: starMat.opacity,
      dust: dustMat.opacity,
      word: wordMat.opacity,
      shown: dust.filter((m) => m.visible).length + (star.visible ? 1 : 0),
      hidden
    };
  }

  return { burst, update, hide, state };
}
