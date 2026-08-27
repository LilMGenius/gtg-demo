// GLB 적재. 구운 정적 장식을 씬에 얹는다.
// 로더가 실패하면 화면이 비는 게 아니라 코드가 세우던 것이 그대로 선다.
// 에셋 하나가 404여도 게임은 돌아야 한다.
import * as THREE from '../../vendor/three.module.min.js';
import { GLTFLoader } from '../../vendor/loaders/GLTFLoader.js';
import { flat } from './units.mjs';
import { jitterMesh } from './handmade.mjs';

const loader = new GLTFLoader();

// 구울 때는 MeshStandardMaterial이었다. exporter가 Lambert를 안 받기 때문이다.
// 화면에 설 때는 Lambert로 돌린다. 재질 소유권은 units.mjs의 flat()에 있다.
// 구운 것에도 손을 댄다. 코드가 세운 것만 삐뚤고 GLB만 반듯하면 한 화면에 두 화풍이 선다.
// 합친 박스는 24정점 단위로 붙는다. 나누어떨어지지 않으면 합친 것이 아니므로 통째로 한 블록이다.
// 추측으로 자르면 창문이 건물 중간에서 끊긴다.
function blocksOf(geo) {
  const n = geo.attributes.position.count;
  if (n < 48 || n % 24 !== 0) return [[0, n]];
  const out = [];
  for (let i = 0; i < n; i += 24) out.push([i, i + 24]);
  return out;
}

function relight(root, jitter, mat) {
  let salt = 200;
  let idx = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.material;
    const nth = idx;
    idx += 1;
    // 구운 GLB에는 UV가 없다. 텍스처를 물려도 아무것도 안 나오고 조용히 단색으로 선다.
    // 정면을 보는 건물이라 x와 y만으로 좌표를 만들면 창문이 벽을 따라 붙는다.
    // 굽는 쪽이 열네 동을 한 메시로 합친다. 메시마다 재질을 갈아 끼우는 방식은 여기서 죽는다.
    // 재질이 하나면 벽색도 하나다. 화면에는 같은 베이지 벽지 한 장이 지평선을 덮는다.
    // 합쳐진 박스는 정점 24개씩 순서대로 들어온다. 그 블록이 곧 한 동이다.
    const blocks = blocksOf(o.geometry);
    if (!o.geometry.attributes.uv) {
      const p = o.geometry.attributes.position;
      const uv = new Float32Array(p.count * 2);
      for (const [s, e] of blocks) {
        let x0 = Infinity;
        let y0 = Infinity;
        for (let i = s; i < e; i += 1) { x0 = Math.min(x0, p.getX(i)); y0 = Math.min(y0, p.getY(i)); }
        // 월드 x를 그대로 쓰면 창 격자가 동 경계를 넘어 이어져 한 장짜리 벽지가 된다.
        // 동의 왼쪽 아래를 원점으로 잡아야 각 동이 자기 창을 갖는다.
        const v = (s / 24) | 0;
        // 배율 하나를 전 동에 쓰면 창 간격이 전부 같다. 층고와 칸 폭은 동마다 다르다.
        // 가로가 성기면 창 한 칸이 옆으로 늘어나 창문이 아니라 만국기가 된다.
        const sx = 0.30 + (v % 5) * 0.035;
        // 세로는 가로보다 배는 촘촘해야 한다. 층이 한 줄만 보이면 건물이 아니라 간판이다.
        const sy = 0.27 + (v % 3) * 0.05;
        for (let i = s; i < e; i += 1) {
          uv[i * 2] = (p.getX(i) - x0) * sx;
          uv[i * 2 + 1] = (p.getY(i) - y0) * sy;
        }
      }
      o.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    o.material = mat ? mat(src && src.color ? src.color.getHex() : 0xffffff, nth) : flat(src && src.color ? src.color.getHex() : 0xffffff);
    // 한 메시 안에서 동마다 도색을 가르는 길은 정점색뿐이다. Lambert는 재질색과 곱하므로
    // 재질을 흰색으로 눕히고 팔레트를 정점색이 전부 들고 간다.
    if (mat && blocks.length > 1) {
      const p = o.geometry.attributes.position;
      const cols = new Float32Array(p.count * 3);
      const c = new THREE.Color();
      for (const [s, e] of blocks) {
        c.copy(mat(0xffffff, (s / 24) | 0).color);
        for (let i = s; i < e; i += 1) { cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b; }
      }
      o.geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      o.material.color.setHex(0xffffff);
      o.material.vertexColors = true;
    }
    if (jitter) { jitterMesh(o, jitter, salt); salt += 1; }
    // 장식은 판정에 안 쓰인다. 프로브가 이걸 세면 가림 판정이 거짓말을 한다.
    o.userData.probeIgnore = true;
  });
}

export function loadDecor(scene, name, fallback, jitter = 0, mat = null) {
  loader.load(
    'assets/models/' + name + '.glb',
    (gltf) => {
      const root = gltf.scene;
      root.name = name;
      relight(root, jitter, mat);
      if (fallback && fallback.parent) fallback.parent.remove(fallback);
      scene.add(root);
    },
    undefined,
    () => { /* 코드가 세운 것이 남는다 */ }
  );
}
