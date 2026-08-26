// 캔버스로 만드는 표면 잡티. 파일 애셋이 아니라 코드가 그리는 텍스처다.
// 플랫 컬러만 있는 화면은 저예산이 아니라 기본값으로 읽힌다.
// 2000년대 플래시는 싸서 더러웠지 매끈하지 않았다. 만졌을 때의 촉감이 그 시대의 지문이다.
import * as THREE from '../../vendor/three.module.min.js';

// 흰 바탕에 얼룩을 찍는다. 재질의 색은 그대로 두고 밝기만 흔들기 위해서다.
// 색을 직접 그리면 텍스처마다 팔레트를 다시 정해야 하고, 한 곳만 고쳐도 화면이 갈라진다.
function canvas(size) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  return cv;
}

function finish(cv, repeat) {
  const t = new THREE.CanvasTexture(cv);
  // 보간하면 잡티가 뿌옇게 번져 저해상도 화면에서 아예 안 읽힌다.
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  return t;
}

// 씨앗 하나에 같은 그림. 새로고침마다 얼룩이 옮겨다니면 배경이 아니라 노이즈다.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967295;
  };
}

const cache = new Map();
function memo(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// 흙바닥. 얼룩과 발자국이다. 균일한 그라데이션 한 장은 카펫으로 읽힌다.
export function dirtTex() {
  return memo('dirt', () => {
    const S = 128;
    const cv = canvas(S);
    const c = cv.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, S, S);
    const r = rng(0x51d3a1);
    // 큰 얼룩 먼저, 그 위에 작은 얼룩. 한 크기로만 찍으면 물방울무늬가 된다.
    for (let i = 0; i < 26; i += 1) {
      const rad = 6 + r() * 22;
      const g = 0.72 + r() * 0.22;
      c.fillStyle = 'rgba(' + Math.round(255 * g) + ',' + Math.round(246 * g) + ',' + Math.round(232 * g) + ',0.85)';
      c.beginPath();
      c.ellipse(r() * S, r() * S, rad, rad * (0.5 + r() * 0.7), r() * 3.14, 0, 6.283);
      c.fill();
    }
    // 발자국. 짝을 지어 한 방향으로 간다. 흩뿌리면 자국이 아니라 먼지다.
    for (let k = 0; k < 5; k += 1) {
      const x0 = r() * S;
      const y0 = r() * S;
      const dx = (r() - 0.5) * 8;
      c.fillStyle = 'rgba(150,138,118,0.55)';
      for (let i = 0; i < 4; i += 1) {
        c.fillRect(x0 + dx * i + (i % 2) * 5, y0 + i * 9, 4, 6);
      }
    }
    // 잔모래. 이게 없으면 얼룩이 오려붙인 스티커로 보인다.
    for (let i = 0; i < 900; i += 1) {
      c.fillStyle = r() > 0.5 ? 'rgba(120,110,92,0.30)' : 'rgba(255,252,240,0.30)';
      c.fillRect(Math.floor(r() * S), Math.floor(r() * S), 1, 1);
    }
    return finish(cv, [22, 22]);
  });
}

// 페널티 박스 안쪽. 밟히는 자리라 흙보다 닳았다. 배율이 다르면 같은 텍스처도 다른 땅이 된다.
export function scuffTex() {
  return memo('scuff', () => {
    const t = dirtTex().clone();
    t.needsUpdate = true;
    t.repeat.set(5, 5);
    t.offset.set(0.37, 0.11);
    return t;
  });
}

// 천. 구겨진 명암이다. 세로로 흐르는 주름 위에 접힌 자국을 얹는다.
export function clothTex() {
  return memo('cloth', () => {
    const S = 64;
    const cv = canvas(S);
    const c = cv.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, S, S);
    const r = rng(0x2ea77c);
    for (let i = 0; i < 14; i += 1) {
      const x = r() * S;
      const w = 1 + r() * 3;
      c.fillStyle = r() > 0.45 ? 'rgba(96,92,86,0.22)' : 'rgba(255,255,255,0.5)';
      c.fillRect(x, 0, w, S);
    }
    for (let i = 0; i < 9; i += 1) {
      c.fillStyle = 'rgba(80,76,70,0.20)';
      c.fillRect(0, r() * S, S, 1 + r() * 2);
    }
    for (let i = 0; i < 260; i += 1) {
      c.fillStyle = 'rgba(70,66,60,0.14)';
      c.fillRect(Math.floor(r() * S), Math.floor(r() * S), 1, 1);
    }
    return finish(cv, [3, 2]);
  });
}

// 칠이 벗겨진 쇠. 골대 폴에 쓴다. 새로 세운 규격 골대는 이 게임의 무대가 아니다.
export function chippedTex() {
  return memo('chipped', () => {
    const S = 64;
    const cv = canvas(S);
    const c = cv.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, S, S);
    const r = rng(0x7c1b45);
    // 녹은 아래에서 올라온다. 위아래 균등하게 뿌리면 얼룩덜룩한 페인트일 뿐이다.
    for (let i = 0; i < 34; i += 1) {
      const y = S - Math.pow(r(), 1.7) * S;
      const w = 2 + r() * 7;
      const h = 2 + r() * 5;
      c.fillStyle = r() > 0.4 ? 'rgba(148,96,52,0.55)' : 'rgba(110,104,96,0.45)';
      c.fillRect(r() * S, y, w, h);
    }
    for (let i = 0; i < 180; i += 1) {
      c.fillStyle = 'rgba(120,112,100,0.25)';
      c.fillRect(Math.floor(r() * S), Math.floor(r() * S), 1, 1);
    }
    return finish(cv, [1, 6]);
  });
}

// 건물 창문. 밤이 아니라 저녁이라 몇 칸만 켜져 있다. 전부 켜면 격자무늬 벽지가 된다.
export function windowTex() {
  return memo('window', () => {
    const S = 64;
    const cv = canvas(S);
    const c = cv.getContext('2d');
    c.fillStyle = '#000000';
    c.fillRect(0, 0, S, S);
    const r = rng(0x39f0c2);
    // 창을 잘게 찍으면 저해상도로 줄어드는 화면에서 한 픽셀도 안 남는다.
    // 크게 찍고 대신 켜진 칸을 줄인다. 저녁이라 몇 집만 불이 들어와 있다.
    for (let y = 5; y < S - 6; y += 13) {
      for (let x = 5; x < S - 6; x += 14) {
        if (r() > 0.2) continue;
        // 색을 섞으니 창문이 아니라 만국기가 됐다. 색수차가 작은 사각형을 세 색으로 갈라놓기 때문이다.
        // 저녁 불빛은 한 가지 색이다. 밝기만 흔든다.
        c.fillStyle = r() > 0.5 ? '#e8b45c' : '#c4903f';
        c.fillRect(x, y, 6, 7);
      }
    }
    // 배율 1은 64칸 창문이 30미터 건물에 늘어나 창이 아니라 벽지 무늬가 됐다.
    return finish(cv, [1, 2]);
  });
}
