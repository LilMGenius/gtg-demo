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
    if (!o.geometry.attributes.uv) {
      const p = o.geometry.attributes.position;
      const uv = new Float32Array(p.count * 2);
      // 배율 하나를 전 동에 쓰면 창 간격이 전부 같아서 도시가 아니라 같은 벽지 열네 장이 된다.
      // 층고와 칸 폭은 동마다 다르다. 그 차이가 실루엣보다 먼저 눈에 읽힌다.
      // 가로가 성기면 창 한 칸이 옆으로 늘어나 창문이 아니라 만국기가 된다.
      const sx = 0.30 + (nth % 5) * 0.035;
      // 세로는 가로보다 배는 촘촘해야 한다. 층이 한 줄만 보이면 건물이 아니라 간판이다.
      const sy = 0.27 + (nth % 3) * 0.05;
      for (let i = 0; i < p.count; i += 1) {
        uv[i * 2] = p.getX(i) * sx;
        uv[i * 2 + 1] = p.getY(i) * sy;
      }
      o.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    o.material = mat ? mat(src && src.color ? src.color.getHex() : 0xffffff, nth) : flat(src && src.color ? src.color.getHex() : 0xffffff);
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
