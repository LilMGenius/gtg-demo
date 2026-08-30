// 무대. 흙 운동장 하나와 그 너머를 채우는 것들이다.
import * as THREE from '../../../vendor/three.module.min.js';
import { flat, flatMap, flatVertex, mergeGeos, R_HALF_W, R_H } from '../units.mjs';
import { dirtTex, scuffTex, paintScuffBase, clothTex, chippedTex, cloudTex, windowTex, windowTexFor } from '../texture.mjs';
import { loadDecor } from '../decor.mjs';
import { jitterMesh, seeded, addOutline } from '../handmade.mjs';
import { addFace } from './actors.mjs';

// 사각 그물 한 장. wireframe 평면은 삼각형 대각선이 남아 그물이 아니라 격자무늬로 읽힌다.
// 팽팽한 격자는 그물이 아니라 방충망이다. 가운데를 배가 부르게 늘어뜨려야 천으로 읽힌다.
// sag는 선을 조각내야 휜다. 세로선 한 줄을 두 점으로 그으면 직선밖에 안 나온다.
export function meshPanel(w, h, cell, color, opacity, sag = 0, fadeFloor = false) {
  const pts = [];
  const nx = Math.max(1, Math.round(w / cell));
  const ny = Math.max(1, Math.round(h / cell));
  // 늘어짐은 가장자리 0, 중앙 최대. 사인 곱이 그 모양이다.
  const drop = (u, vv) => -sag * Math.sin(Math.PI * u) * Math.sin(Math.PI * vv);
  const seg = sag > 0 ? 6 : 1;
  // 한 칸도 어긋나지 않는 격자는 손으로 엮은 그물이 아니라 공장 방충망이다.
  // 실마다 매듭 위치가 조금씩 다르다. 0.4칸을 넘기면 실끼리 붙어 구멍이 사라진다.
  const rnd = seeded(0x2b7f41 + Math.round(w * 13) + Math.round(h * 7));
  const jx = [];
  for (let i = 0; i <= nx; i += 1) jx.push((rnd() - 0.5) * cell * 0.3);
  const jy = [];
  for (let j = 0; j <= ny; j += 1) jy.push((rnd() - 0.5) * cell * 0.3);
  for (let i = 0; i <= nx; i += 1) {
    const x = -w / 2 + (w * i) / nx + (i === 0 || i === nx ? 0 : jx[i]);
    const u = i / nx;
    for (let k = 0; k < seg; k += 1) {
      const y0 = -h / 2 + (h * k) / seg;
      const y1 = -h / 2 + (h * (k + 1)) / seg;
      pts.push(x, y0, drop(u, k / seg), x, y1, drop(u, (k + 1) / seg));
    }
  }
  for (let j = 0; j <= ny; j += 1) {
    const y = -h / 2 + (h * j) / ny + (j === 0 || j === ny ? 0 : jy[j]);
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
  // 아래쪽 실을 높이에 따라 지운다. 재질 하나의 opacity로는 그물 전체가 같이 흐려진다.
  // 카메라가 골대 뒤 3.6m에 있어 그물 아랫단은 화면에서 흙바닥 위에 겹쳐 깔린다.
  // 골대 안이 아니라 땅에 격자가 그려진 것으로 읽혔다. 뷰포트 그리드의 정체가 이것이다.
  // 정점색을 색으로 섞으면 재질색과 곱해질 뿐이라 흙색을 넣어도 실이 어두워지기만 한다.
  // 지우려면 알파여야 한다. 네 채널 정점색이 그 알파를 싣는다.
  // 실제 동네 골대도 아랫단은 흙이 튀어 배경에 묻는다. 물리적으로도 이쪽이 맞다.
  // 그물 실이 깊이를 쓰면 뒤에 오는 반투명이 실 격자 모양으로 잘려나간다. 실은 깊이를 읽기만 한다.
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  let colAttr = null;
  let baseA = null;
  if (fadeFloor) {
    // 평상시 투명도를 재질이 쥐고 있으면 국소로 켤 수 있는 상한도 그 값이다.
    // 재질을 불투명으로 두고 평상시 값을 정점 알파에 곱해 넣으면 곱은 그대로고 상한만 1로 열린다.
    mat.opacity = 1;
    const cols = new Float32Array((pts.length / 3) * 4);
    baseA = new Float32Array(pts.length / 3);
    for (let i = 0, k = 0; i < pts.length; i += 3, k += 4) {
      const u = Math.min(1, Math.max(0, (pts[i + 1] + h / 2) / h));
      // 위 3분의 1만 온전히 남긴다. 선형이면 중간 높이가 어중간하게 남아 격자가 그대로 읽힌다.
      const t = Math.min(1, Math.max(0, (u - 0.42) / 0.58));
      cols[k] = 1; cols[k + 1] = 1; cols[k + 2] = 1; cols[k + 3] = t * t * opacity;
      baseA[i / 3] = t * t * opacity;
    }
    colAttr = new THREE.BufferAttribute(cols, 4);
    geo.setAttribute('color', colAttr);
    mat.vertexColors = true;
  }
  const m = new THREE.LineSegments(geo, mat);
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
      const f = Math.exp(-(dx * dx + dy * dy) / r2);
      a[i + 2] = base[i + 2] + amp * f;
      // z 밀림은 카메라 시선축이다. 화면에서는 그 자리가 조금 커지는 것으로만 나타나고,
      // 정지 프레임에서는 밀린 적 없는 그물과 구별되지 않는다. 실은 늘어나지 않으니
      // 뒤로 밀린 만큼 주변 실이 중심으로 빨려들어야 격자 자체가 일그러진다.
      const pull = Math.abs(amp) * 0.8 * f;
      a[i] = base[i] - dx * pull;
      a[i + 1] = base[i + 1] - dy * pull;
    }
    attr.needsUpdate = true;
    // 밀린 실이 안 보이면 밀린 적 없는 것과 같다. 공이 정착하는 높이는 바닥 페이드가
    // 알파를 0.05까지 지워둔 구간이라, 골 순간의 처짐이 투명한 실 위에서 일어났다.
    // 전역 알파를 올리면 화면 전체가 방안지가 된다. 그래서 맞은 자리만 켠다.
    if (!colAttr) return;
    const c = colAttr.array;
    // 진폭 0.3이면 이미 눈에 띄는 처짐이다. 그 위는 더 밝힐 것이 없어 1로 잘린다.
    const glow = Math.min(1, Math.abs(amp) / 0.3);
    // 밝아지는 원이 밀리는 원과 같으면 테두리가 딱 끊겨 스포트라이트로 읽힌다. 더 넓게 번진다.
    const gr2 = r2 * 2.6;
    for (let i = 0, k = 0; i < a.length; i += 3, k += 4) {
      const dx = base[i] - px;
      const dy = base[i + 1] - py;
      const w = glow * Math.exp(-(dx * dx + dy * dy) / gr2);
      const b = baseA[i / 3];
      c[k + 3] = b + w * (1 - b);
    }
    colAttr.needsUpdate = true;
  };
  // 밀렸다는 주장은 원본과의 차분으로만 증명된다. 계측이 원본을 못 읽으면 변위는 선언으로 남는다.
  m.userData.restPos = base;
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
  const scuff = scuffTex();
  const box = new THREE.Mesh(new THREE.PlaneGeometry(16.5, 16.5), flatMap(0xb08e58, scuff));
  box.rotation.x = -Math.PI / 2;
  box.position.set(0, 0.01, 8.2);
  box.name = 'box';
  scene.add(box);

  // 몸이 흙에 닿으면 흙이 파인다. 다음 구에 그 자리가 새 땅이면 방금 넘어진 일은 없던 일이 된다.
  // 새 메시를 만들지 않는다. 박스가 이미 들고 있는 캔버스에 직접 칠한다.
  const scv = scuff.image;
  const sctx = scv.getContext('2d');
  box.userData.mark = (wx, wz, ang, len, strength) => {
    // 오래된 자국은 밟혀서 옅어진다. 칠하기 전에 바탕을 조금 덮어 쌓임을 스스로 제한한다.
    sctx.globalAlpha = 0.05;
    paintScuffBase(sctx);
    sctx.globalAlpha = 1;
    const px = ((wx + 8.25) / 16.5) * scv.width;
    const py = ((wz + 0.05) / 16.5) * scv.height;
    const L = (len / 16.5) * scv.width;
    sctx.save();
    sctx.translate(px, py);
    sctx.rotate(ang);
    sctx.fillStyle = 'rgba(96,84,66,' + (0.34 * strength).toFixed(3) + ')';
    sctx.beginPath();
    sctx.ellipse(0, 0, L, L * 0.34, 0, 0, Math.PI * 2);
    sctx.fill();
    // 가장자리가 매끈하면 그림자로 읽힌다. 파인 흙은 알갱이가 튄다.
    const g = seeded(Math.floor(px) * 131 + Math.floor(py) * 7 + 1);
    for (let i = 0; i < 14; i += 1) {
      const a = g() * Math.PI * 2;
      const rr = L * (0.6 + g() * 0.8);
      sctx.fillStyle = g() > 0.45 ? 'rgba(78,66,50,0.55)' : 'rgba(196,176,142,0.45)';
      sctx.fillRect(Math.cos(a) * rr, Math.sin(a) * rr * 0.34, 3, 3);
    }
    sctx.restore();
    scuff.needsUpdate = true;
  };

  // 라인. 흙바닥만 있으면 거리가 안 읽힌다. 공이 어디쯤 왔는지는 선이 알려준다.
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f0e4, transparent: true, opacity: 0.7 });
  const marks = new THREE.Group();
  marks.name = 'markings';
  // 일곱 줄이 같은 흰색으로 같은 굵기면 인쇄물이다. 석회는 줄마다 다르게 닳는다.
  // 자리와 방향은 건드리지 않는다. 선이 움직이면 거리를 못 읽는다. 진하기와 굵기만 흔든다.
  const lrnd = seeded(0x4d21a9);
  const stripe = (w, d, x, z) => {
    const thin = 1 + (lrnd() - 0.5) * 0.5;
    const mat = lineMat.clone();
    mat.opacity = 0.52 + lrnd() * 0.26;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w < d ? w * thin : w, d < w ? d * thin : d), mat);
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
    // 좌우를 같은 각도로 반대로 눕히면 그것도 대칭이다. 거울을 대면 겹친다.
    // 한쪽은 거의 서 있고 한쪽만 눈에 띄게 눕는다. 누가 한 번 들이받은 골대다.
    p.rotation.z = pi === 0 ? 0.005 : 0.021;
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
  // 그물 상단을 정확히 R_H에 두면 크로스바 원기둥의 축을 그대로 지난다.
  // 실과 기둥 표면이 같은 깊이를 다투어 프레임마다 어느 쪽이 이길지 바뀐다.
  // 기둥 반지름 0.06보다 살짝 위로 올려 실이 크로스바 등 위에 얹히게 한다.
  const NET_LIFT = 0.07;
  const NET_C = 0xe6ede0;
  // 카메라 쪽 한 장은 다른 색을 쓴다. 실은 빛을 등지면 어두워진다.
  // 뒷그물이 겹치는 배경은 흙이 아니라 빌딩과 하늘이다. 골대가 높아 윗단은 전부 밝은 하늘 위에 온다.
  // 밝은 회녹색 실을 그 위에 올리면 알파를 얼마로 하든 배경에 녹아 사라진다.
  // 실측: 그물이 밀리는 320ms 정지 프레임에서 뒷그물이 화면에 아예 없었고, 게이트만 통과했다.
  const NET_NEAR = 0x36423a;
  // 카메라가 골대 뒤에 있어 그물은 화면에서 가장 앞에 온다. 그래서 처음엔 겨우 보일 만큼만 켰다.
  // 그 결과 골이 들어가도 무엇에 박혔는지 안 보였다. 0.34는 화면에서 안 읽혔고 0.8은 화면 전체가 방충망이 됐다.
  // 밝은 실을 촘촘히 치니 화면 앞 전체가 방안지가 됐다. 흙바닥과 키퍼가 격자에 갇혀
  // 병맛이 아니라 와이어프레임 디버그 화면으로 읽혔다.
  // 답은 더 지우는 게 아니라 뒤집는 것이다. 밝은 흙 위에 어두운 실을 성기게 친다.
  // 대비는 오히려 올라가서 골이 어디 박혔는지는 더 잘 읽히고, 격자는 시야를 덮지 않는다.
  const back = meshPanel(R_HALF_W * 2, R_H, 0.36, NET_NEAR, 0.34, 0.22, true);
  back.position.set(0, R_H / 2 + NET_LIFT, -NET_D);
  scene.add(back);
  for (const sgn of [-1, 1]) {
    // 좌우 그물을 같은 밀도로 치면 골대가 공장에서 나온 물건이 된다. 한쪽이 더 삭았다.
    const side = meshPanel(NET_D, R_H, 0.24, NET_C, sgn < 0 ? 0.48 : 0.44, 0.06);
    side.rotation.y = Math.PI / 2;
    side.position.set(sgn * R_HALF_W, R_H / 2 + NET_LIFT, -NET_D / 2);
    scene.add(side);
  }
  const roof = meshPanel(R_HALF_W * 2, NET_D, 0.24, NET_C, 0.4, 0.10);
  roof.rotation.x = -Math.PI / 2;
  roof.position.set(0, R_H + NET_LIFT, -NET_D / 2);
  scene.add(roof);

  // 뒷그물은 서 있는 평면인데 실 격자만 있으면 어느 쪽이 위인지 알려주는 것이 하나도 없다.
  // 그물을 받치는 틀이 그 일을 한다. 뒷기둥 둘이 세로선을 긋고 빗대가 앞뒤 거리를 만든다.
  // 흰 골대와 같은 색으로 칠하면 앞 골대와 겹쳐 한 덩어리로 읽힌다. 뒷틀은 녹슨 쇠다.
  // 틀을 여러 메시로 두면 드로우콜이 예산을 넘는다. 한 장으로 붙여 하나만 부른다.
  //
  // 뒷기둥을 그물 폭과 같은 자리에 세우면 화면에 남지 않는다. 카메라가 앞 골대에서 5.1m,
  // 뒷면에서 3.6m라 같은 폭이 1.42배로 퍼진다. 앞 골대가 이미 화면 폭을 다 쓰므로
  // 폭을 그대로 옮긴 기둥은 좌우 밖으로 나가고 가로대만 화면을 가로지르는 띠로 남는다.
  // 접이식 골대처럼 뒤로 갈수록 좁혀 세운다. 기둥이 화면 안에 들어와 세로선을 긋고,
  // 앞 기둥 머리에서 뒤 기둥 머리로 물러나는 빗대가 깊이를 그린다.
  const BACK_HW = 2;
  // 뒷틀 상단은 앞 골대보다 1.5m 가까워 화면에서 1.4배로 퍼진다. 크로스바와 같은 높이 대에 두면
  // 안쪽 기둥 둘과 그 띠가 흰 골대 안에 두 번째 사각형을 그리고, 눈은 그물 없는 골대 하나가
  // 더 서 있다고 읽는다. 실점 연출이 전부 빈 공간에서 벌어지는 것처럼 보인 원인이다.
  // 크로스바에서 확실히 떼어 올리면 좁아지며 물러나는 틀이 되어 깊이만 남는다.
  const BACK_H = 3.2;
  const railGeo = (len, axis) => {
    const g = new THREE.CylinderGeometry(0.05, 0.05, len, 6);
    if (axis === 'x') g.rotateZ(Math.PI / 2);
    return g;
  };
  // 빗대는 축에 나란하지 않다. 두 끝점을 받아 그 방향으로 눕힌다.
  const stayGeo = (a, b) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const g = new THREE.CylinderGeometry(0.05, 0.05, dir.length(), 6);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize()
    );
    g.applyQuaternion(q);
    return g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  };
  const rails = [];
  for (const sgn of [-1, 1]) {
    rails.push(railGeo(BACK_H, 'y').translate(sgn * BACK_HW, BACK_H / 2, -NET_D));
    rails.push(
      stayGeo(
        new THREE.Vector3(sgn * R_HALF_W, R_H, 0),
        new THREE.Vector3(sgn * BACK_HW, BACK_H, -NET_D)
      )
    );
  }
  rails.push(railGeo(BACK_HW * 2, 'x').translate(0, BACK_H, -NET_D));
  const rear = new THREE.Mesh(mergeGeos(rails), flatMap(0x5f6a5c, chippedTex()));
  // 앞 골대는 한 번 들이받혀 기울었다. 뒷틀만 정확히 서 있으면 둘이 다른 날 세운 물건으로 보인다.
  rear.rotation.z = 0.012;
  jitterMesh(rear, 0.018, 5);
  scene.add(rear);

  // 하늘. 안쪽을 보는 반구 하나면 검은 벽이 사라진다.
  // 한 색으로 칠하면 하늘이 아니라 뒤에 세운 파란 벽이다. 지평선이 밝고 천정이 어두워야 하늘이 된다.
  // 포스터라이즈가 이 그라데이션을 몇 단으로 끊는다. 매끈한 하늘보다 끊긴 하늘이 우리 톤이다.
  // 구름은 메시를 더 얹지 않고 같은 셰이더 안에서 칠한다. 드로우콜 여유가 없다.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(90, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: {
        lo: { value: new THREE.Color(0xbcd4e2) },
        hi: { value: new THREE.Color(0x5c86ad) },
        cloud: { value: cloudTex() },
        drift: { value: 0 }
      },
      vertexShader: [
        'varying float vH; varying vec3 vD;',
        'void main(){',
        '  vD = normalize(position);',
        '  vH = vD.y;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join(String.fromCharCode(10)),
      fragmentShader: [
        'uniform vec3 lo; uniform vec3 hi; uniform sampler2D cloud; uniform float drift;',
        'varying float vH; varying vec3 vD;',
        'void main(){',
        // 선형으로 섞으면 위쪽 절반이 거의 같은 색이다. 제곱근이면 지평선 가까이에서 빨리 갈린다.
        '  vec3 sky = mix(lo, hi, sqrt(clamp(vH, 0.0, 1.0)));',
        // 방위각으로 감고 고도로 편다. 반구 UV를 그대로 쓰면 천정에서 텍스처가 한 점으로 빨려든다.
        '  vec2 uv = vec2((atan(vD.z, vD.x) * 0.15915494 + drift) * 3.0, pow(clamp(vH, 0.0, 1.0), 0.62));',
        '  float a = texture2D(cloud, uv).a;',
        // 알파를 두 단으로 끊는다. 몸통은 흰색, 아랫배는 회색. 부드러운 경계는 손그림이 아니다.
        // 여기 리터럴은 선형값이라 sRGB 인코딩을 한 번 더 받는다. 화면에서 흰 판으로 날지 않게 낮춰 적는다.
        '  vec3 body = mix(vec3(0.60, 0.62, 0.66), vec3(0.85), step(0.62, a));',
        '  float on = step(0.38, a);',
        // 지평선 바로 위는 구름을 걷는다. 건물 실루엣과 겹치면 스티커로 읽힌다.
        '  on *= smoothstep(0.005, 0.045, vH);',
        '  gl_FragColor = vec4(mix(sky, body, on), 1.0);',
        '}'
      ].join(String.fromCharCode(10)),
      side: THREE.BackSide, fog: false, depthWrite: false
    })
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
  // 한 재질을 열네 동이 나눠 쓰면 같은 스티커를 열네 번 붙인 것으로 읽힌다.
  // 동마다 창 무늬와 층수와 벽색을 어긋낸다. 창 배율은 그 동의 실치수에서 나온다.
  // 다섯 색이 전부 채도 0에 가까워 열네 동이 한 덩어리 회색으로 붙었다.
  // 동네 아파트는 베이지와 연분홍과 연하늘을 칠한다. 도색이 갈려야 동이 세어진다.
  // 채도를 더 올리면 장난감 블록이 된다. 하늘과 안개에 묻힐 만큼만 넣는다.
  const WALL = [0xd8c6a4, 0xc9a9a4, 0xa8bcc6, 0xcfc8b2, 0x9fae9c];
  // 열네 동을 다섯 색으로 돌리면 세 번째 동부터 색이 되돌아온다.
  // 지평선 전체가 한 프레임에 들어오므로 그 주기가 줄 지어 읽힌다.
  // 동마다 명도와 색조를 따로 굴려 같은 팔레트 칸이어도 같은 벽이 안 되게 한다.
  const wallColor = (nth) => {
    const c = new THREE.Color(WALL[nth % WALL.length]);
    const h = {};
    c.getHSL(h);
    const j = seeded(0x7a3c00 + nth * 977);
    c.setHSL((h.h + (j() - 0.5) * 0.06 + 1) % 1, h.s * (0.72 + j() * 0.62), h.l * (0.84 + j() * 0.3));
    return c;
  };
  const rnd = seeded(0x5c17e0);
  let cursor = -32;
  for (let i = 0; i < 14; i += 1) {
    const w = 3.4 + rnd() * 3.6;
    // 지평선 위만 채운다. 더 높이면 도시가 하늘을 다 먹어 동네 운동장이 아니라 도심 한복판이 된다.
    const h = 4.5 + rnd() * 7.5;
    const kind = Math.floor(rnd() * 5);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), new THREE.MeshLambertMaterial({
      color: wallColor(kind + i), map: windowTexFor(kind, w, h, i)
    }));
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
  // 구운 GLB가 서면 위에서 세운 fallback은 버려진다. 화면에 실제로 서는 건 이쪽이다.
  // 창 무늬도 벽색도 동마다 갈라야 열네 동이 열네 동으로 읽힌다.
  loadDecor(scene, 'skyline', skyline, 0.18, (c, nth) => new THREE.MeshLambertMaterial({
    color: wallColor(nth), map: windowTex(nth, nth)
  }));

  return { ground, box, bar, net: back, netZ: -NET_D, drift: dome.material.uniforms.drift };
}

// 행인. 펜스 너머를 지나간다. 아무도 없는 운동장은 연습장이지 경기장이 아니다.
// 집중력 스탯이 여기에 걸린다. 지금은 걷기만 한다.
export function buildPassers(scene) {
  // 전원 같은 캡슐에 색만 다르면 색칠한 볼링핀 다섯 개다.
  // 키와 폭을 흩고, 다리를 따로 달고, 0번만 실루엣을 다르게 준다.
  // 집중력 판정이 지목하는 미인 행인이 0번이고, 그 하나는 멀리서도 구분돼야 한다.
  const passers = [];
  // 0번은 키커와 나란히 서는 유일한 행인이다. 붉은 계열을 주면 키커 셔츠(0xc9483a)와
  // 같은 빨간 캡슐 둘이 되고, 화면에서 사람이 바뀐 것 자체가 안 읽힌다.
  // 키커에도 다른 행인에도 없는 색을 준다.
  const shirt = [0xf2e9ff, 0x4a72c4, 0xe0a23c, 0x7a4fb0, 0x3fa37a];
  const rnd = seeded(0x9a55e7);
  for (let i = 0; i < 5; i += 1) {
    const g = new THREE.Group();
    // 0.85~1.20은 원경에서 화소 몇 개 차이라 다섯이 같은 키로 읽혔다. 폭을 넓힌다.
    const tall = 0.76 + rnd() * 0.54;
    const wide = 0.85 + rnd() * 0.35;
    // 머리만 사람이고 아래는 페인트 통이었다. 팔이 없으면 서 있는 것인지 꽂혀 있는 것인지가 안 갈린다.
    // 별도 메시로 달면 다섯 명에게 10번의 드로우콜이 붙는다. 몸통 지오메트리에 미리 붙여 버린다.
    const torsoR = 0.22 * wide;
    const torsoGeo = new THREE.CapsuleGeometry(torsoR, 0.62 * tall, 3, 6);
    // 0.42는 몸통 윗반에서 끝나 어깨 봉으로 보였다. 팔은 허리를 지나야 팔로 읽힌다.
    const armLen = 0.62 * tall;
    const armParts = [torsoGeo];
    // 팔이 셔츠와 같은 색이면 흰 몸통에 흰 팔이 묻혀 사각형 한 장으로 읽힌다.
    // 메시를 나누면 드로우콜이 열 개 붙으므로 정점색으로만 가른다.
    const armColors = [shirt[i]];
    for (const s of [-1, 1]) {
      const a = new THREE.CapsuleGeometry(0.072, armLen, 3, 5);
      // 캡슐은 중앙이 원점이다. 그대로 돌리면 어깨가 아니라 팔 한가운데가 축이 된다.
      a.translate(0, -armLen / 2, 0);
      // 0.13은 팔이 몸에 붙어 실루엣에서 옷 옆선과 구분이 안 됐다. 공간을 벌려 띄운다.
      a.rotateZ(-s * 0.34);
      // 어깨는 몸통 꼭대기가 아니라 그 한 칸 아래다. 꼭대기에 달면 목에서 팔이 난다.
      a.translate(s * (torsoR + 0.05), 0.22 * tall, 0);
      armParts.push(a);
      armColors.push(0xe0b48c);
    }
    const bodyMat = flatVertex(0xffffff);
    bodyMat.map = clothTex();
    const body = new THREE.Mesh(mergeGeos(armParts, armColors), bodyMat);
    body.position.y = 0.86 * tall;
    // 다리 한 덩어리는 옆에 선 키퍼의 두 다리와 나란히 놓이면 통짜 기둥으로 읽힌다.
    // 같은 재질이라 지오메트리만 둘로 갈라도 드로우콜은 그대로다.
    const legGeos = [];
    for (const s of [-1, 1]) {
      // 0.082 반경에 0.08 간격은 두 캡슐이 서로 파묻혀 다시 한 기둥으로 읽혔다.
      // 사이로 흙이 보여야 다리가 둘로 갈린다.
      const l = new THREE.CapsuleGeometry(0.068 * wide, 0.46 * tall, 3, 5);
      l.translate(s * 0.115 * wide, 0, 0);
      legGeos.push(l);
    }
    const legs = new THREE.Mesh(mergeGeos(legGeos), flat(0x30384a));
    legs.position.y = 0.38 * tall;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), flat(0xe0b48c));
    head.position.y = 1.36 * tall;
    const parts = [body, legs, head];
    // 실루엣 세 종. 색만 다른 다섯은 멀리서 한 사람이 다섯 번 지나가는 것으로 읽힌다.
    // 머리 윗마리만 바꿔도 멀리서 구분된다. 몸통 비율을 건드리면 모두 땅만해진다.
    if (i === 0) {
      // 긴 머리 한 덩이. 이 하나로 멀리서도 다른 사람으로 읽힌다.
      // 반경 0.17은 머리(0.15)보다 커서 얼굴을 통째로 삼켰다. 뒤통수 쪽으로 물린다.
      const hair = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.34, 3, 6), flat(0x2b1d14));
      hair.position.set(0, 1.44 * tall, -0.13);
      // 머리 하나만으로는 멀리서 남녀가 안 갈린다. 치마가 실루엣 밑변을 벌려 준다.
      // 몸통 비율은 안 건드린다. 건드리면 다섯이 전부 땅딸해진다.
      // 상의도 치마도 흰 계열이면 근경에서 원통 하나로 뭉친다. 치마에 색과 천 무늬를 준다.
      const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.27 * wide, 0.42 * tall, 8, 1, true), flatMap(0xb98ad6, clothTex()));
      skirt.position.y = 0.62 * tall;
      skirt.material.side = THREE.DoubleSide;
      // 눈에 띄는 사람은 화면에서도 눈에 띄어야 한다. 머리 위 반짝임 하나가 시선을 잡는다.
      const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({ color: 0xffe98a }));
      spark.position.y = 1.88 * tall;
      g.userData.spark = spark;
      // 이 행인은 한눈팔기 연출에서 골대 앞까지 걸어온다. 화면 한복판에 서는데
      // 얼굴이 없으면 키퍼만 눈이 있고 옆에는 달걀이 서 있다. 하트가 떠도 왜 한눈파는지가 픽셀에 없다.
      // 다른 넷은 펜스 너머에만 있으므로 얼굴을 안 준다. 드로우콜은 이 하나만 늘린다.
      // 머리 반경 0.15는 치마와 몸통 옆에서 전구만 해졌다. 얼굴을 붙여도 얼굴이 안 읽힌다.
      // 몸통은 그대로 두고 머리만 키운다. 병맛 2등신 쪽으로 가는 편이 이 게임에 맞다.
      head.scale.setScalar(1.3);
      // 몸통 캡슐 꼭대기가 1.39*tall이다. 머리 중심을 1.4에 두면 목까지 몸에 묻혀
      // 눈만 어깨 위에 뜬 것처럼 보인다. 목 한 칸만큼 올린다.
      head.position.y = 1.54 * tall;
      addFace(head, 0.15, 1, 0xe0b48c);
      // 눈만으로는 행인 넷과 안 갈린다. 볼 두 점이 멀리서도 이 하나를 다르게 만든다.
      const blushMat = new THREE.MeshBasicMaterial({ color: 0xff8fa3 });
      for (const s of [-1, 1]) {
        const bl = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), blushMat);
        bl.position.set(s * 0.088, -0.022, 0.126);
        bl.scale.set(1.1, 0.7, 0.4);
        head.add(bl);
      }
      parts.push(hair, skirt, spark);
    } else if (i % 2 === 1) {
      // 학생. 등에 가방 한 덩어리. 실루엣이 뒤로 불룩해져 머리 없이도 구분된다.
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
    // 9.5씩 끊어 놓으면 다섯이 같은 간격으로 지나간다. 행렬이지 행인이 아니다.
    // 시작 위치를 흩고 걸음 위상을 따로 준다. 같은 순간에 같은 쪽으로 기우는 것이 가장 티가 났다.
    // 깊이까지 흩어야 원근이 크기를 갈라 준다. 한 줄에 세우면 키만 다른 같은 인형이다.
    // 0번은 한눈팔기 연출에서 골대 앞까지 걸어오므로 거리 밴드를 그대로 둔다.
    const z = i === 0 ? 31.6 + rnd() * 1.8 : 26.8 + rnd() * 12.4;
    g.position.set(-25 + i * 9.5 + (rnd() - 0.5) * 9.8, 0, z);
    g.userData.speed = 1.15 + rnd() * 1.3;
    g.userData.phase = rnd() * Math.PI * 2;
    g.userData.homeZ = g.position.z;
    scene.add(g);
    passers.push(g);
  }
  return passers;
}
