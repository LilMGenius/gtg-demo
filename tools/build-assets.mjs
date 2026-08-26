// 정적 장식을 GLB로 굽는다. 코드가 매 프레임 세우던 형상을 데이터로 옮기는 파이프라인이다.
// 굽는 대상은 판정식과 무관한 것만이다. 골대와 배우는 코드에 남는다.
// 골대 치수는 chain.mjs의 숫자를 그대로 쓰므로 데이터로 떼면 그림과 숫자가 갈라진다.
// 배우는 키와 몸무게로 형상이 바뀌고 physique 게이트가 그 축을 잰다. 구우면 그 축이 죽는다.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, weld, flatten, join } from '@gltf-transform/functions';
import * as fs from 'node:fs';
import * as path from 'node:path';

// GLTFExporter는 브라우저 FileReader를 쓴다. Node에는 없다.
globalThis.FileReader = class {
  readAsArrayBuffer(b) { b.arrayBuffer().then((a) => { this.result = a; if (this.onloadend) this.onloadend(); }); }
};

const OUT = 'web/assets/models';
fs.mkdirSync(OUT, { recursive: true });

// exporter가 Lambert에 경고를 낸다. 굽는 동안만 Standard로 세운다.
// 런타임 재질은 로더가 다시 Lambert로 갈아 끼운다. units.mjs의 flat()이 소유권을 유지한다.
const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });

// 건물 실루엣. pitch.mjs가 세우던 것과 같은 수식이다.
function skyline() {
  const g = new THREE.Group();
  g.name = 'skyline';
  const m = mat(0x5b6f7d);
  for (let i = 0; i < 14; i += 1) {
    const w = 3.4 + ((i * 37) % 5);
    const h = 5 + ((i * 53) % 11);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), m);
    b.position.set(-30 + i * 4.6 + ((i * 17) % 3), h / 2, 38 + ((i * 29) % 7));
    g.add(b);
  }
  return g;
}

// 라인 마킹. 흙바닥만 있으면 거리가 안 읽힌다.
function markings() {
  const g = new THREE.Group();
  g.name = 'markings';
  const m = mat(0xf2f0e4);
  const stripe = (w, d, x, z) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
    s.rotation.x = -Math.PI / 2;
    s.position.set(x, 0.02, z);
    g.add(s);
  };
  const BOX_W = 16.5; const BOX_D = 16.5; const GA_W = 9.16; const GA_D = 5.5;
  stripe(40, 0.12, 0, 0);
  stripe(0.12, BOX_D, -BOX_W / 2, BOX_D / 2);
  stripe(0.12, BOX_D, BOX_W / 2, BOX_D / 2);
  stripe(BOX_W, 0.12, 0, BOX_D);
  stripe(0.12, GA_D, -GA_W / 2, GA_D / 2);
  stripe(0.12, GA_D, GA_W / 2, GA_D / 2);
  stripe(GA_W, 0.12, 0, GA_D);
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), m);
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(0, 0.02, 11);
  g.add(spot);
  return g;
}

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);
const exporter = new GLTFExporter();

async function bake(name, group) {
  const scene = new THREE.Scene();
  scene.add(group);
  const raw = await exporter.parseAsync(scene, { binary: true });
  const doc = await io.readBinary(new Uint8Array(raw));
  // 굽기 전 실측치. 최적화가 실제로 뭘 줄였는지 숫자로 남긴다.
  const before = count(doc);
  await doc.transform(dedup(), flatten(), join(), weld(), prune());
  const after = count(doc);
  const glb = await io.writeBinary(doc);
  const file = path.join(OUT, name + '.glb');
  fs.writeFileSync(file, glb);
  return { name, file, bytes: glb.byteLength, before, after };
}

function count(doc) {
  const root = doc.getRoot();
  let prims = 0; let tris = 0; let verts = 0;
  for (const mesh of root.listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      prims += 1;
      const pos = p.getAttribute('POSITION');
      verts += pos ? pos.getCount() : 0;
      const idx = p.getIndices();
      tris += idx ? idx.getCount() / 3 : (pos ? pos.getCount() / 3 : 0);
    }
  }
  return { prims, tris, verts, meshes: root.listMeshes().length, mats: root.listMaterials().length };
}

const results = [];
results.push(await bake('skyline', skyline()));
results.push(await bake('markings', markings()));

for (const r of results) {
  console.log(r.name.padEnd(10),
    String(r.bytes).padStart(7) + 'B',
    'prims ' + r.before.prims + '->' + r.after.prims,
    'tris ' + r.before.tris + '->' + r.after.tris,
    'mats ' + r.before.mats + '->' + r.after.mats);
}
