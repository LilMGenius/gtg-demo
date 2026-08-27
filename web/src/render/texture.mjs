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

// 타일 경계를 넘어가는 개체는 반대편에서 다시 나와야 이음선이 사라진다.
// 한 번만 찍으면 가장자리에서 생기는 짤린 선이 바닥 전체에 격자로 나타난다.
// 같은 그림을 아홉 번 그리면 느리지만 텍스처는 한 번만 만든다.
function tiled(c, S, draw) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      c.save();
      c.translate(dx * S, dy * S);
      draw();
      c.restore();
    }
  }
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
    // 128에 22번 반복이면 6.8m마다 같은 얼룩이 돌아온다. 화면 안에 한 주기가 여러 번 들어가 격자로 읽힌다.
    // 텍셀 밀도는 그대로 둘 채 판을 두 배로 키워 주기를 13.6m로 밀어낸다.
    const S = 256;
    const cv = canvas(S);
    const c = cv.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, S, S);
    const r = rng(0x51d3a1);
    // 큰 얼룩 먼저, 그 위에 작은 얼룩. 한 크기로만 찍으면 물방울무늬가 된다.
    // 주기가 길수록 눈에 띄다. 큰 얼룩은 대비를 낮추고 작은 얼룩만 진하게 찍는다.
    for (let i = 0; i < 104; i += 1) {
      const rad = 6 + r() * 22;
      const t = (rad - 6) / 22;
      const g = 0.78 + r() * (0.16 - t * 0.10);
      const bx = r() * S;
      const by = r() * S;
      const ry = rad * (0.5 + r() * 0.7);
      const rot = r() * 3.14;
      const a = 0.85 - t * 0.55;
      c.fillStyle = 'rgba(' + Math.round(255 * g) + ',' + Math.round(246 * g) + ',' + Math.round(232 * g) + ',' + a.toFixed(3) + ')';
      tiled(c, S, () => {
        c.beginPath();
        c.ellipse(bx, by, rad, ry, rot, 0, 6.283);
        c.fill();
      });
    }
    // 발자국. 짝을 지어 한 방향으로 간다. 흩뿌리면 자국이 아니라 먼지다.
    for (let k = 0; k < 20; k += 1) {
      const x0 = r() * S;
      const y0 = r() * S;
      const dx = (r() - 0.5) * 8;
      c.fillStyle = 'rgba(150,138,118,0.55)';
      tiled(c, S, () => {
        for (let i = 0; i < 4; i += 1) {
          c.fillRect(x0 + dx * i + (i % 2) * 5, y0 + i * 9, 4, 6);
        }
      });
    }
    // 잔모래. 이게 없으면 얼룩이 오려붙인 스티커로 보인다.
    for (let i = 0; i < 3600; i += 1) {
      c.fillStyle = r() > 0.5 ? 'rgba(120,110,92,0.30)' : 'rgba(255,252,240,0.30)';
      c.fillRect(Math.floor(r() * S), Math.floor(r() * S), 1, 1);
    }
    return finish(cv, [11, 11]);
  });
}

// 페널티 박스 안쪽. 밟히는 자리라 흙보다 닳았다. 배율이 다르면 같은 텍스처도 다른 땅이 된다.
export function scuffTex() {
  return memo('scuff', () => {
    const t = dirtTex().clone();
    t.needsUpdate = true;
    t.repeat.set(2.5, 2.5);
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

// 구름. 하늘이 빈 그라디언트면 하늘을 안 그린 것으로 읽힌다.
// 붓으로 그린 뭉게구름이다. 부드러운 알파는 쓰지 않는다. 가장자리가 딱 끊겨야 손그림이다.
// 알파 채널에 밀도를 담는다. 셰이더가 이걸 몇 단으로 끊어 칠한다.
export function cloudTex() {
  return memo('cloud', () => {
    const W = 512;
    const H = 256;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, W, H);
    const r = rng(0x2a91f7);
    c.fillStyle = '#ffffff';
    // 덩어리 스물두 개. 같은 크기로 스물두 번 찍으면 벽지가 된다.
    // 반지름, 납작한 정도, 뭉치는 개수를 덩어리마다 따로 굴린다.
    // 카메라는 하늘의 아래쪽 띠만 본다. 텍스처 위쪽에 찍으면 화면에 한 조각도 안 걸린다.
    for (let i = 0; i < 22; i += 1) {
      const cx = ((i + r() * 0.8) / 22) * W;
      // 지평선 가까이가 빽빽해야 원근이 생긴다. v가 작을수록 지평선이다.
      const cy = H * (1 - (0.06 + Math.pow(r(), 1.25) * 0.30));
      const base = 8 + r() * 13;
      const squash = 0.34 + r() * 0.30;
      const puffs = 4 + Math.floor(r() * 5);
      for (let k = 0; k < puffs; k += 1) {
        const t = k / (puffs - 1) - 0.5;
        const rad = base * (0.5 + Math.pow(1 - Math.abs(t) * 1.6, 2) * 0.9);
        c.beginPath();
        c.ellipse(cx + t * base * 2.4, cy - rad * squash * 0.4 + (r() - 0.5) * base * 0.3,
                  rad, rad * squash * 1.35, 0, 0, Math.PI * 2);
        c.fill();
      }
      // 아랫배는 평평하게 자른다. 둥근 덩어리만 쌓으면 솜뭉치다.
      // 자르는 폭은 덩어리 몸통까지다. 넓게 자르면 옆 덩어리까지 먹어 흰 띠가 생긴다.
      c.save();
      c.globalCompositeOperation = 'destination-out';
      c.fillRect(cx - base * 1.9, cy + base * squash * 1.05, base * 3.8, base * 2);
      c.restore();
    }
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
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

// 건물 창문. 대낮이다. 창은 켜지는 게 아니라 벽보다 어두운 유리로 파인다.
// 흙바닥도 하늘도 행인도 낮인데 건물만 야경이면 배경이 뒤에 세운 딴 그림으로 읽힌다.
// 한 장을 열네 동에 돌려 쓰니 도시가 아니라 같은 스티커를 열네 번 붙인 것으로 읽혔다.
// 변종은 씨앗만 바꾸는 게 아니다. 층 간격과 밀도가 같으면 씨앗이 달라도 같은 리듬이 남는다.
// 흰 바탕에 어두운 칸. 재질 색과 곱해지므로 벽색은 살고 창만 파인다.
// 동네를 두르는 건물은 한 종류가 아니다. 난간 달린 아파트, 창만 박힌 빌라, 차양 친 상가가 섞인다.
// 모두 같은 규칙으로 창을 찍으면 간격만 다른 벽지 열네 장이다. 구조 자체를 갈라야 한다.
// balcony: 층마다 가로로 지나가는 난간. 이것 하나가 상자를 아파트로 바꿔놓는다.
const WIN_KIND = [
  { seed: 0x39f0c2, stepY: 15, stepX: 17, skip: 0.26, balcony: 0.62, wide: 1.9 },
  { seed: 0x7ac41d, stepY: 13, stepX: 20, skip: 0.34, balcony: 0, wide: 1.0 },
  { seed: 0x1de935, stepY: 18, stepX: 15, skip: 0.20, balcony: 0.55, wide: 1.5 },
  { seed: 0xc25a70, stepY: 14, stepX: 22, skip: 0.38, balcony: 0, wide: 1.0 },
  { seed: 0x40b8e1, stepY: 17, stepX: 16, skip: 0.29, balcony: 0.70, wide: 2.2 }
];

export function windowTex(variant = 0) {
  const k = WIN_KIND[variant % WIN_KIND.length];
  return memo('window:' + (variant % WIN_KIND.length), () => {
    const S = 64;
    const cv = canvas(S);
    const c = cv.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, S, S);
    const r = rng(k.seed);
    // 창을 잘게 찍으면 저해상도로 줄어드는 화면에서 한 픽셀도 안 남는다.
    // 크게 찍고 대신 몇 칸을 비운다. 창이 한 칸도 안 빠지면 격자무늬 벽지다.
    // 칸마다 따로 흔들면 창이 줄을 잃고 벽에 뚝뚝 흔어진 얼룩이 된다.
    // 사람은 가로줄을 층으로 읽는다. 흔들림은 층 단위로만 준다.
    const wW = Math.min(Math.round(5 * k.wide), k.stepX - 5);
    for (let y = 5; y < S - 6; y += k.stepY) {
      const oy = Math.round((r() - 0.5) * 3);
      const ox = Math.round((r() - 0.5) * 4);
      for (let x = 5; x < S - 6; x += k.stepX) {
        if (r() < k.skip) continue;
        // 낮의 창은 밝기만 다르다. 전부 같은 농도로 파면 구멍 뚫린 판때기가 된다.
        // 커튼 친 집이 몇 있어야 사람이 사는 건물로 읽힌다.
        const v = r();
        c.fillStyle = v > 0.82 ? '#b9c2c8' : (v > 0.45 ? '#4d5d69' : '#3a4954');
        c.fillRect(x + ox, y + oy, wW, 6);
      }
      // 난간. 창 아래를 가로지르는 선 하나다.
      // 이 선이 있으면 층이 세어지고, 없으면 창이 벌판에 띄운 점으로 남는다.
      if (k.balcony) {
        c.fillStyle = 'rgba(70,76,84,' + k.balcony + ')';
        c.fillRect(3, y + oy + 8, S - 6, 2);
      }
    }
    // 배율은 여기서 정하지 않는다. 박스 UV는 면마다 0~1이라 같은 배율을 주면
    // 넓은 동일수록 창이 옆으로 늘어나 창문이 아니라 포스트잇이 된다.
    // 배율은 건물 실치수를 아는 쪽이 정한다.
    return finish(cv, null);
  });
}

// 건물 한 동의 창문. 층 간격은 실제 층고에서 나온다.
// 박스 UV는 면마다 0~1이라 배율을 고정하면 넓은 동일수록 창이 옆으로 늘어난다.
// 텍스처 자체는 다섯 장뿐이고, 동마다 배율만 다른 사본을 준다.
// 3.1과 3.6은 실제 층고에 맞지만 화면에서는 창 한 칸이 포스트잇만 해졌다.
// 멀리 있는 건물은 실치수가 아니라 보이는 크기로 정해야 한다.
const FLOOR_M = 2.3;
const BAY_M = 2.5;
export function windowTexFor(variant, w, h) {
  const t = windowTex(variant).clone();
  t.needsUpdate = true;
  t.repeat.set(Math.max(1, Math.round(w / BAY_M)), Math.max(1, Math.round(h / FLOOR_M)));
  return t;
}
