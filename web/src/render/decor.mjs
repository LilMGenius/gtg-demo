// GLB 적재. 구운 정적 장식을 씬에 얹는다.
// 로더가 실패하면 화면이 비는 게 아니라 코드가 세우던 것이 그대로 선다.
// 에셋 하나가 404여도 게임은 돌아야 한다.
import { GLTFLoader } from '../../vendor/loaders/GLTFLoader.js';
import { flat } from './units.mjs';

const loader = new GLTFLoader();

// 구울 때는 MeshStandardMaterial이었다. exporter가 Lambert를 안 받기 때문이다.
// 화면에 설 때는 Lambert로 돌린다. 재질 소유권은 units.mjs의 flat()에 있다.
function relight(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const src = o.material;
    o.material = flat(src && src.color ? src.color.getHex() : 0xffffff);
    // 장식은 판정에 안 쓰인다. 프로브가 이걸 세면 가림 판정이 거짓말을 한다.
    o.userData.probeIgnore = true;
  });
}

export function loadDecor(scene, name, fallback) {
  loader.load(
    'assets/models/' + name + '.glb',
    (gltf) => {
      const root = gltf.scene;
      root.name = name;
      relight(root);
      if (fallback && fallback.parent) fallback.parent.remove(fallback);
      scene.add(root);
    },
    undefined,
    () => { /* 코드가 세운 것이 남는다 */ }
  );
}
