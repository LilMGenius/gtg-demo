// 무대. 흙 운동장 하나와 그 너머를 채우는 것들이다.
import * as THREE from '../../../vendor/three.module.min.js';
import { flat, flatMap, R_HALF_W, R_H } from '../units.mjs';
import { dirtTex, scuffTex, clothTex, chippedTex, windowTex } from '../texture.mjs';
import { loadDecor } from '../decor.mjs';
import { jitterMesh, seeded, addOutline } from '../handmade.mjs';

// 사각 그물 한 장. wireframe 평면은 삼각형 대각선이 남아 그물이 아니라 격자무늬로 읽힌다.
// 팽팽한 격자는 그물이 아니라 방충망이다. 가운데를 배가 부르게 늘어뜨려야 천으로 읽힌다.
// sag는 선을 조각내야 휜다. 세로선 한 줄을 두 점으로 그으면 직선밖에 안 나온다.
export function meshPanel(w, h, cell, color, opacity, sag = 0) {
  const pts = [];
  const nx = Math.max(1, Math.round(w / cell));
  const ny = Math.max(1, Math.round(h / cell));
  // 늘어짐은 가장자리 0, 중앙 최대. 사인 곱이 그 모양이다.
  const drop = (u, vv) => -sag * Math.sin(Math.PI * u) * Math.sin(Math.PI * vv);
  const seg = sag > 0 ? 6 : 1;
  for (let i = 0; i <= nx; i += 1) {
    const x = -w / 2 + (w * i) / nx;
    const u = i / nx;
    for (let k = 0; k < seg; k += 1) {
      const y0 = -h / 2 + (h * k) / seg;
      const y1 = -h / 2 + (h * (k + 1)) / seg;
      pts.push(x, y0, drop(u, k / seg), x, y1, drop(u, (k + 1) / seg));
    }
  }
  for (let j = 0; j <= ny; j += 1) {
    const y = -h / 2 + (h * j) / ny;
    const vv = j / ny;
    for (let k = 0; k < seg; k += 1) {
      const x0 = -w / 2 + (w * k) / seg;
      const x1 = -w / 2 + (w * (k + 1)) / seg;
      pts.push(x0, y, drop(k / seg, vv), x1, y, drop((k + 1) / seg, vv));
    }
  }
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.Float32BufferAttribute(pts, 3);
  geo.setAttribute('position', attr);
  const m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  m.userData.probeIgnore = true;
  // 공이 그물에 박히면 그물이 밀린다. 밀리지 않으면 공이 그림 앞을 지나간 것으로 읽힌다.
  // 원본 좌표를 따로 들고 있어야 밀었다 돌아온다. 매 프레임 누적하면 그물이 영영 늘어난다.
  const base = Float32Array.from(pts);
  // 반경 0.35는 실이 한 가닥만 튀어 구멍이 뚫린 것으로 읽혔다. 1.1은 그물 전체가 평행이동했다.
  m.userData.punch = (px, py, amp, radius = 0.62) => {
    const a = attr.array;
    const r2 = radius * radius;
    for (let i = 0; i < a.length; i += 3) {
      const dx = base[i] - px;
      const dy = base[i + 1] - py;
      a[i + 2] = base[i + 2] + amp * Math.exp(-(dx * dx + dy * dy) / r2);
    }
    attr.needsUpdate = true;
  };
  return m;
}

export function buildPitch(scene) {
  // 흙바닥. 잔디가 아니다. 동네 운동장이 이 게임의 무대다.
  // 단색 흙은 카펫으로 읽힌다. 얼룩과 발자국과 잔모래가 있어야 밟은 땅이 된다.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), flatMap(0x9c7a4a, dirtTex()));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 24;
  ground.name = 'ground';
  scene.add(ground);

  // 박스 안은 더 밟힌다. 같은 잡티를 다른 배율로 물려야 한 장이 두 땅으로 읽힌다.
  const box = new THREE.Mesh(new THREE.PlaneGeometry(16.5, 16.5), flatMap(0xb08e58, scuffTex()));
  box.rotation.x = -Math.PI / 2;
  box.position.set(0, 0.01, 8.2);
  box.name = 'box';
  scene.add(box);

  // 라인. 흙바닥만 있으면 거리가 안 읽힌다. 공이 어디쯤 왔는지는 선이 알려준다.
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f0e4, transparent: true, opacity: 0.7 });
  const marks = new THREE.Group();
  marks.name = 'markings';
  const stripe = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    m.userData.probeIgnore = true;
    marks.add(m);
  };
  const BOX_W = 16.5;
  const BOX_D = 16.5;
  const GA_W = 9.16;
  const GA_D = 5.5;
  stripe(40, 0.12, 0, 0);
  stripe(0.12, BOX_D, -BOX_W / 2, BOX_D / 2);
  stripe(0.12, BOX_D, BOX_W / 2, BOX_D / 2);
  stripe(BOX_W, 0.12, 0, BOX_D);
  stripe(0.12, GA_D, -GA_W / 2, GA_D / 2);
  stripe(0.12, GA_D, GA_W / 2, GA_D / 2);
  stripe(GA_W, 0.12, 0, GA_D);
  // 페널티 스팟. 키커가 공을 놓는 자리다.
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 12), lineMat);
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(0, 0.02, 11);
  spot.userData.probeIgnore = true;
  marks.add(spot);
  scene.add(marks);
  loadDecor(scene, 'markings', marks);

  // 골대. 판정식이 쓰는 폭과 높이를 그대로 쓴다. 그림과 숫자가 어긋나면 화면이 거짓말을 한다.
  const post = new THREE.CylinderGeometry(0.06, 0.06, R_H, 8);
  // 새로 칠한 골대는 규격 경기장의 물건이다. 아래에서 녹이 올라와야 동네 골대다.
  const white = flatMap(0xf4f6f2, chippedTex());
  for (const [pi, x] of [-R_HALF_W, R_HALF_W].entries()) {
    const p = new THREE.Mesh(post, white);
    p.position.set(x, R_H / 2, 0);
    p.name = 'post';
    // 골대는 판정 경계다. 굵기를 흔들면 어디까지가 골인지 눈이 헷갈린다. 선만 얹는다.
    addOutline(p, 0.02);
    // 완전한 수직은 새로 세운 규격 골대다. 동네 골대는 조금 기울어 있다.
    p.rotation.z = (pi === 0 ? 1 : -1) * 0.012;
    scene.add(p);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, R_HALF_W * 2, 8), white);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, R_H, 0);
  bar.name = 'bar';
  addOutline(bar, 0.02);
  scene.add(bar);

  // 골망. 뒷면 한 장이 아니라 상자다. 평면 하나면 골대에 깊이가 없다.
  const NET_D = 1.5;
  const NET_C = 0xe6ede0;
  // 카메라가 골대 뒤에 있어 그물은 화면에서 가장 앞에 온다. 그래서 처음엔 겨우 보일 만큼만 켰다.
  // 그 결과 골이 들어가도 무엇에 박혔는지 안 보였다. 0.34는 화면에서 안 읽혔고 0.8은 화면 전체가 방충망이 됐다.
  const back = meshPanel(R_HALF_W * 2, R_H, 0.24, NET_C, 0.56, 0.22);
  back.position.set(0, R_H / 2, -NET_D);
  scene.add(back);
  for (const sgn of [-1, 1]) {
    const side = meshPanel(NET_D, R_H, 0.24, NET_C, 0.44, 0.06);
    side.rotation.y = Math.PI / 2;
    side.position.set(sgn * R_HALF_W, R_H / 2, -NET_D / 2);
    scene.add(side);
  }
  const roof = meshPanel(R_HALF_W * 2, NET_D, 0.24, NET_C, 0.4, 0.10);
  roof.rotation.x = -Math.PI / 2;
  roof.position.set(0, R_H, -NET_D / 2);
  scene.add(roof);

  // 하늘. 안쪽을 보는 반구 하나면 검은 벽이 사라진다.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(90, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x86aecb, side: THREE.BackSide, fog: false })
  );
  scene.add(dome);

  // 펜스. 동네 운동장을 두르는 초록 그물이다.
  const fence = meshPanel(58, 3.4, 0.55, 0x3f6b4a, 0.5, 0.18);
  fence.position.set(0, 1.7, 30);
  scene.add(fence);

  // 건물 실루엣. 지평선 위가 비지 않게만 세운다. 디테일은 없다.
  // 구운 GLB가 오면 이걸 치우고 그 자리에 선다. 14개 드로우콜이 1개가 된다.
  // 로드가 실패하면 이게 남는다. 에셋 하나로 화면이 비지는 않는다.
  // 등간격으로 세우면 도시가 아니라 막대그래프다. 간격과 각도를 손으로 놓은 것처럼 어긋낸다.
  const skyline = new THREE.Group();
  // 순수한 검정 실루엣은 오려붙인 종이다. 창문 몇 칸이 켜지면 사람이 사는 도시가 된다.
  const blockMat = new THREE.MeshLambertMaterial({ color: 0x5b6f7d, emissive: 0xffffff, emissiveMap: windowTex() });
  const rnd = seeded(0x5c17e0);
  let cursor = -32;
  for (let i = 0; i < 14; i += 1) {
    const w = 3.4 + rnd() * 3.6;
    const h = 5 + rnd() * 11;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), blockMat);
    b.position.set(cursor + w / 2, h / 2, 38 + rnd() * 7);
    // 0.02는 정렬된 것과 구분이 안 됐고 0.14는 건물이 쓰러지는 것으로 읽혔다.
    b.rotation.y = (rnd() - 0.5) * 0.06;
    b.rotation.z = (rnd() - 0.5) * 0.03;
    jitterMesh(b, 0.18, 40 + i);
    b.userData.probeIgnore = true;
    skyline.add(b);
    cursor += w + 0.4 + rnd() * 1.6;
  }
  scene.add(skyline);
  // 라인은 흔들지 않는다. 바닥 선이 물결치면 거리를 못 읽는다. 건물만 흔든다.
  loadDecor(scene, 'skyline', skyline, 0.18, (c) => new THREE.MeshLambertMaterial({ color: c, emissive: 0xffffff, emissiveMap: windowTex() }));

  return { ground, box, bar, net: back, netZ: -NET_D };
}

// 행인. 펜스 너머를 지나간다. 아무도 없는 운동장은 연습장이지 경기장이 아니다.
// 집중력 스탯이 여기에 걸린다. 지금은 걷기만 한다.
export function buildPassers(scene) {
  // 전원 같은 캡슐에 색만 다르면 색칠한 볼링핀 다섯 개다.
  // 키와 폭을 흩고, 다리를 따로 달고, 0번만 실루엣을 다르게 준다.
  // 집중력 판정이 지목하는 미인 행인이 0번이고, 그 하나는 멀리서도 구분돼야 한다.
  const passers = [];
  const shirt = [0xd8556a, 0x4a72c4, 0xe0a23c, 0x7a4fb0, 0x3fa37a];
  const rnd = seeded(0x9a55e7);
  for (let i = 0; i < 5; i += 1) {
    const g = new THREE.Group();
    const tall = 0.85 + rnd() * 0.35;
    const wide = 0.85 + rnd() * 0.35;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22 * wide, 0.62 * tall, 3, 6), flatMap(shirt[i], clothTex()));
    body.position.y = 0.86 * tall;
    const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.15 * wide, 0.46 * tall, 3, 6), flat(0x30384a));
    legs.position.y = 0.38 * tall;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), flat(0xe0b48c));
    head.position.y = 1.36 * tall;
    const parts = [body, legs, head];
    // 실루엓 세 종. 색만 다른 다섯은 멀리서 한 사람이 다섯 번 지나가는 것으로 읽힐다.
    // 머리 윗마리만 바꿔도 멀리서 구분된다. 몸통 비율을 건드리면 모두 땅만해진다.
    if (i === 0) {
      // 긴 머리 한 덩이. 이 하나로 멀리서도 다른 사람으로 읽힌다.
      // 반경 0.17은 머리(0.15)보다 커서 얼굴을 통째로 삼켰다. 뒤통수 쪽으로 물린다.
      const hair = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.34, 3, 6), flat(0x2b1d14));
      hair.position.set(0, 1.28 * tall, -0.09);
      parts.push(hair);
    } else if (i % 2 === 1) {
      // 학생. 등에 가방 한 덩어리. 실루엓이 뒤로 불룩해져 머리 없이도 구분된다.
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.2), flat(0x2f4f43));
      bag.position.set(0, 0.92 * tall, -0.24);
      parts.push(bag);
    } else {
      // 아저씨. 챙 달린 모자. 챙을 안 달면 머리에 그릇을 엎은 것으로 보인다.
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.09, 8), flat(0x8d3f3f));
      cap.position.y = 1.47 * tall;
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.18), flat(0x8d3f3f));
      brim.position.set(0, 1.44 * tall, 0.16);
      parts.push(cap, brim);
    }
    for (const [pi, m] of parts.entries()) { jitterMesh(m, 0.02, 70 + i * 5 + pi); m.userData.probeIgnore = true; }
    addOutline(body, 0.03);
    g.add(...parts);
    g.position.set(-24 + i * 9.5, 0, 32.5 + (i % 3) * 1.4);
    g.userData.speed = 1.4 + (i % 4) * 0.5;
    g.userData.homeZ = g.position.z;
    scene.add(g);
    passers.push(g);
  }
  return passers;
}
