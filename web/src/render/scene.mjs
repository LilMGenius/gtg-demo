// 연출. 판정은 이 파일에 없다.
// 롤은 이미 굴렀고 여기서는 확정된 결과를 연기할 뿐이다.
import * as THREE from '../../vendor/three.module.min.js';
import { GOAL_HALF_W, GOAL_H } from '../../../src/chain.mjs';
import { mountSfx } from '../audio/sfx.mjs';
import { createBallProbe } from '../diagnostics/ball-probe.mjs';
import { createStageProbe, goalFraming } from '../diagnostics/stage-probe.mjs';

const flat = (c) => new THREE.MeshLambertMaterial({ color: c });
const BALL_R = 0.14;
// 화면 좌우와 판정 좌우를 맞추는 부호. 판정식은 건드리지 않는다.
const VIEW_X = -1;
// 키커가 공 바로 뒤에 서면 대기 내내 공을 가린다. 측정값: 23프레임 연속 사라짐.
const KICKER_OFF = 1.15;
// 골망은 z = -0.75에 있다. q가 1.09면 공이 딱 그 자리에서 선다.
const BALL_PAST = 1.09;
// 판정 단위와 렌더 미터는 같지 않다.
// 판정의 골대는 4.4 x 1.9이고 사람은 1.9이라 키퍼 머리가 크로스바에 닿는다.
// 실제 골대는 7.32 x 2.44다. 그 비율로 그려야 사람이 골대 안에 들어간다.
// 판정식은 건들지 않는다. 여기서 단위만 바꾼다.
const R_HALF_W = 3.66;
const R_H = 2.44;
const SX = R_HALF_W / GOAL_HALF_W;
const SY = R_H / GOAL_H;
const lerp = (a, b, t) => a + (b - a) * t;
// 캐프슐은 중심 기준이라 반경만큼 더 내려간다. 눈대중으로 놓으면 발이 흔 속에 묻힌다.
const standOnGround = (g) => {
  const b = new THREE.Box3().setFromObject(g);
  for (const c of g.children) c.position.y -= b.min.y;
};
const ease = (t) => t * t * (3 - 2 * t);

// 사각 그물 한 장. wireframe 평면은 삼각형 대각선이 남아 그물이 아니라 격자무늬로 읽힌다.
function meshPanel(w, h, cell, color, opacity) {
  const pts = [];
  const nx = Math.max(1, Math.round(w / cell));
  const ny = Math.max(1, Math.round(h / cell));
  for (let i = 0; i <= nx; i += 1) {
    const x = -w / 2 + (w * i) / nx;
    pts.push(x, -h / 2, 0, x, h / 2, 0);
  }
  for (let j = 0; j <= ny; j += 1) {
    const y = -h / 2 + (h * j) / ny;
    pts.push(-w / 2, y, 0, w / 2, y, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const m = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  m.userData.probeIgnore = true;
  return m;
}

// 얼굴. 흰자 위에 검은 동공을 얹는다. 눈이 없으면 사람이 아니라 캡슐이다.
// dir은 얼굴이 보는 쪽이다. 키퍼는 키커를 보고, 키커는 렌즈 쪽을 본다.
function addFace(head, r, dir, skin) {
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xfbfbf5 });
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x18140f });
  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.34, 10, 8), whiteMat);
    eye.position.set(s * r * 0.42, r * 0.16, dir * r * 0.7);
    eye.scale.set(1, 1.15, 0.42);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.17, 8, 6), darkMat);
    pupil.position.set(s * r * 0.42, r * 0.14, dir * r * 0.95);
    pupil.scale.set(1, 1.1, 0.5);
    head.add(eye, pupil);
    eyes.push(pupil);
  }
  // 입은 벌어진 채로 둔다. 다물면 표정이 죽고, 벌리면 뭘 봐도 얼빠져 보인다.
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(r * 0.26, 8, 6), darkMat);
  mouth.position.set(0, -r * 0.42, dir * r * 0.84);
  mouth.scale.set(1.1, 0.7, 0.4);
  head.add(mouth);
  // 머리카락. 뒤통수가 민머리면 카메라 뒤에서 본 키퍼가 달걀이 된다.
  // 정수리만 덮는다. 더 내리면 앞머리가 얼굴을 삼켜 검은 헬멧이 된다.
  const hair = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), flat(0x2b1d14));
  hair.position.set(0, r * 0.08, -dir * r * 0.1);
  head.add(hair);
  head.userData.eyes = eyes;
  head.userData.mouth = mouth;
  head.userData.skin = skin;
  return head;
}

// 골키퍼. 원시 도형뿐이다. 관절은 없고 몸통이 통째로 기울어진다.
// 그 뻣뻣함이 병맛의 절반이다.
function buildKeeper(height, weight) {
  const g = new THREE.Group();
  const h = height / 100;
  const w = 0.30 + (weight - 84) * 0.0035;
  const headR = h * 0.075;

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(w, h * 0.42, 3, 8), flat(0x2f8f5b));
  torso.position.y = h * 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 10, 8), flat(0xe8c39a));
  head.position.y = h * 0.93;
  addFace(head, headR, 1, 0xe8c39a);
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(w * 0.72, h * 0.3, 3, 8), flat(0x14202c));
  legs.position.y = h * 0.22;

  // 팔. 어깨에서 장갑까지 이어주는 막대다. 없으면 장갑이 허공에 떠 있다.
  const armGeo = new THREE.CapsuleGeometry(h * 0.032, w * 0.9 + 0.16, 3, 6);
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, flat(0x2f8f5b));
    arm.position.set(s * (w * 0.62 + 0.12), h * 0.62, 0.04);
    arm.rotation.z = Math.PI / 2;
    arm.name = 'keeper';
    g.add(arm);
    arms.push(arm);
  }

  const glove = new THREE.BoxGeometry(h * 0.11, h * 0.11, h * 0.05);
  const gl = new THREE.Mesh(glove, flat(0xf2d64b));
  const gr = new THREE.Mesh(glove, flat(0xf2d64b));
  gl.position.set(-w - 0.22, h * 0.62, 0.06);
  gr.position.set(w + 0.22, h * 0.62, 0.06);

  g.add(torso, head, legs, gl, gr);
  for (const m of [torso, head, legs, gl, gr]) m.name = 'keeper';
  standOnGround(g);
  g.userData.gloves = [gl, gr];
  g.userData.arms = arms;
  g.userData.head = head;
  g.userData.girth = w;
  return g;
}

function buildKicker() {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.72, 3, 8), flat(0xc9483a));
  torso.position.y = 1.02;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), flat(0xd8a877));
  head.position.y = 1.62;
  // 키커는 골대를 향해 달린다. 카메라는 골대 뒤에 있으니 얼굴이 렌즈를 마주 본다.
  addFace(head, 0.14, -1, 0xd8a877);
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.52, 3, 8), flat(0xf0f0ee));
  legs.position.y = 0.4;
  const armGeo = new THREE.CapsuleGeometry(0.055, 0.42, 3, 6);
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, flat(0xc9483a));
    arm.position.set(s * 0.3, 1.06, 0);
    arm.rotation.z = s * 0.35;
    arm.name = 'kicker';
    g.add(arm);
    arms.push(arm);
  }
  for (const m of [torso, head, legs]) m.name = 'kicker';
  g.add(torso, head, legs);
  standOnGround(g);
  g.userData.arms = arms;
  g.userData.head = head;
  return g;
}

export function createScene(canvas) {
  const sfx = mountSfx();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x86aecb);
  scene.fog = new THREE.Fog(0x9dbdd4, 34, 96);

  // 가로 화면 전제. 골대는 좌우로 긴 물건이라 세로로는 판정이 안 보인다.
  // 카메라는 골대 뒤 위쪽. 골대 폭 전체와 키커까지 한 화면에 넣는다.
  // 망원으로 당긴다. 화각을 넓히면 골대가 화면 중앙의 작은 사각형으로 줄고 나머지는 하늘이 된다.
  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 200);
  camera.position.set(0, 3.3, -5.1);
  camera.lookAt(0, 1.4, 4.5);

  scene.add(new THREE.AmbientLight(0xd8e6dc, 2.4));
  const sun = new THREE.DirectionalLight(0xfff6e0, 2.6);
  sun.position.set(-5, 9, 7);
  scene.add(sun);

  // 흙바닥. 잔디가 아니다. 동네 운동장이 이 게임의 무대다.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), flat(0x9c7a4a));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 24;
  ground.name = 'ground';
  scene.add(ground);

  const box = new THREE.Mesh(new THREE.PlaneGeometry(16.5, 16.5), flat(0xb08e58));
  box.rotation.x = -Math.PI / 2;
  box.position.set(0, 0.01, 8.2);
  box.name = 'box';
  scene.add(box);

  // 라인. 흙바닥만 있으면 거리가 안 읽힌다. 공이 어디쯤 왔는지는 선이 알려준다.
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf2f0e4, transparent: true, opacity: 0.7 });
  const stripe = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.02, z);
    m.userData.probeIgnore = true;
    scene.add(m);
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
  scene.add(spot);

  // 골대. 판정식이 쓰는 폭과 높이를 그대로 쓴다. 그림과 숫자가 어긋나면 화면이 거짓말을 한다.
  const post = new THREE.CylinderGeometry(0.06, 0.06, R_H, 8);
  const white = flat(0xf4f6f2);
  for (const x of [-R_HALF_W, R_HALF_W]) {
    const p = new THREE.Mesh(post, white);
    p.position.set(x, R_H / 2, 0);
    p.name = 'post';
    scene.add(p);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, R_HALF_W * 2, 8), white);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, R_H, 0);
  bar.name = 'bar';
  scene.add(bar);

  // 골망. 뒷면 한 장이 아니라 상자다. 평면 하나면 골대에 깊이가 없다.
  const NET_D = 1.5;
  const NET_C = 0xe6ede0;
  const back = meshPanel(R_HALF_W * 2, R_H, 0.24, NET_C, 0.34);
  back.position.set(0, R_H / 2, -NET_D);
  scene.add(back);
  for (const sgn of [-1, 1]) {
    const side = meshPanel(NET_D, R_H, 0.24, NET_C, 0.28);
    side.rotation.y = Math.PI / 2;
    side.position.set(sgn * R_HALF_W, R_H / 2, -NET_D / 2);
    scene.add(side);
  }
  const roof = meshPanel(R_HALF_W * 2, NET_D, 0.24, NET_C, 0.24);
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
  const fence = meshPanel(58, 3.4, 0.55, 0x3f6b4a, 0.5);
  fence.position.set(0, 1.7, 30);
  scene.add(fence);

  // 건물 실루엣. 지평선 위가 비지 않게만 세운다. 디테일은 없다.
  const skyline = new THREE.Group();
  const blockMat = flat(0x5b6f7d);
  for (let i = 0; i < 14; i += 1) {
    const w = 3.4 + ((i * 37) % 5);
    const h = 5 + ((i * 53) % 11);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), blockMat);
    b.position.set(-30 + i * 4.6 + ((i * 17) % 3), h / 2, 38 + ((i * 29) % 7));
    skyline.add(b);
  }
  scene.add(skyline);

  // 행인. 펜스 너머를 지나간다. 아무도 없는 운동장은 연습장이지 경기장이 아니다.
  // 집중력 스탯이 여기에 걸린다. 지금은 걷기만 한다.
  const passers = [];
  const shirt = [0xd8556a, 0x4a72c4, 0xe0a23c, 0x7a4fb0, 0x3fa37a];
  for (let i = 0; i < 5; i += 1) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.62, 3, 6), flat(shirt[i]));
    body.position.y = 0.86;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), flat(0xe0b48c));
    head.position.y = 1.38;
    g.add(body, head);
    for (const m of [body, head]) m.userData.probeIgnore = true;
    g.position.set(-24 + i * 9.5, 0, 32.5 + (i % 3) * 1.4);
    g.userData.speed = 1.4 + (i % 4) * 0.5;
    scene.add(g);
    passers.push(g);
  }

  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), flat(0xfdfdf6));
  ball.userData.probeIgnore = true;
  scene.add(ball);

  // 공 그림자. 공이 어디쯤인지 바닥이 알려주면 궤적을 놓치지 않는다.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.16, 12),
    new THREE.MeshBasicMaterial({ color: 0x1c1508, transparent: true, opacity: 0.42 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.userData.probeIgnore = true;
  scene.add(shadow);

  // 배우 그림자. 공에만 그림자가 있으면 사람은 떠 보인다. 수치상 접지여도 화면은 그렇게 안 읽힌다.
  const blob = (r) => {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(r, 14),
      new THREE.MeshBasicMaterial({ color: 0x1c1508, transparent: true, opacity: 0.3 })
    );
    m.rotation.x = -Math.PI / 2;
    m.userData.probeIgnore = true;
    scene.add(m);
    return m;
  };
  const keeperShadow = blob(0.42);
  const kickerShadow = blob(0.3);

  const kicker = buildKicker();
  scene.add(kicker);

  let keeper = buildKeeper(188, 84);
  scene.add(keeper);

  function setKeeper(k) {
    scene.remove(keeper);
    keeper = buildKeeper(k.height, k.weight);
    scene.add(keeper);
  }

  // 가로가 기준이다. 화면이 그보다 좁으면 수직 화각을 늘려 골대 폭을 지킨다.
  const BASE_ASPECT = 16 / 9;
  const BASE_FOV = 46;
  // 키퍼가 골라인에 붙으면 카메라에 가까워 발이 프레임 아래로 내려간다.
  const KEEPER_Z = 0.9;
  function resize() {
    const w = canvas.clientWidth || innerWidth;
    const h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (camera.aspect >= BASE_ASPECT) {
      camera.fov = BASE_FOV;
    } else {
      const halfH = Math.tan((BASE_FOV * Math.PI) / 360) * (BASE_ASPECT / camera.aspect);
      camera.fov = (Math.atan(halfH) * 360) / Math.PI;
    }
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // 공이 화면에 있는지는 재야 알 수 있다. 보이게 만들었다는 말은 증거가 아니다.
  const ballProbe = createBallProbe(camera, scene, ball, BALL_R);
  const stageProbe = createStageProbe(camera, { kicker: () => kicker, keeper: () => keeper });
  const goalFrame = () => goalFraming(camera, R_HALF_W, R_H);

  // 한 구의 연출. 시작 시각과 확정된 결과만 받는다.
  let cue = null;
  // 체인의 반전은 자막이 아니라 화면에서 일어나야 한다.
  // 여기서 결과를 바꾸지 않는다. 이미 확정된 사건 이름 하나를 받아 그것만 연기한다.
  let tail = null;
  function act(kind) {
    tail = { kind, t0: performance.now() / 1000, from: ball.position.clone(), kx: keeper.position.x };
  }
  function play(shot, input, result, onEnd) {
    cue = { shot, input, result, t0: performance.now() / 1000, ended: false, onEnd, steps: 0, struck: false, framed: false };
    kicker.position.set(VIEW_X * shot.aimX * SX * 0.2 + KICKER_OFF, 0, 11.2);
    kicker.userData.startX = kicker.position.x;
    ball.position.set(0, BALL_R, 11);
    sfx.place();
  }

  function frame() {
    if (cue) {
      const t = performance.now() / 1000 - cue.t0;
      const { shot, input, result } = cue;
      const runup = 0.55;
      const flight = shot.flight;

      if (t < runup) {
        const p = t / runup;
        kicker.position.z = lerp(11.2, 10.55, ease(p));
        kicker.position.x = lerp(kicker.userData.startX ?? KICKER_OFF, VIEW_X * shot.aimX * SX * 0.2 + KICKER_OFF * 0.45, ease(p));
        kicker.rotation.z = Math.sin(p * 14) * 0.14;
        // 발이 땅에 닿는 순간에만 소리를 낸다. 균등 간격으로 뿌리면 기계 소리가 된다.
        const beat = Math.floor(p / 0.34) + 1;
        if (beat > cue.steps && beat <= 2) {
          cue.steps = beat;
          sfx.step(false);
        }
      } else {
        if (!cue.struck) {
          cue.struck = true;
          sfx.step(true);
          // 슛파워가 임팩트의 세기다. 화면이 쓰는 값과 소리가 쓰는 값이 같아야 한 사건으로 들린다.
          sfx.kick(shot.strong ? 0.95 : 0.4 + shot.kicker.power * 0.06);
        }
        kicker.rotation.z *= 0.86;
        const p = Math.min(1, (t - runup) / flight);
        // 공은 골라인에서 멈추지 않는다. 실점이면 골망까지 가고 거기서 선다.
        // 카메라가 골대 뒤에 있으니 그 뒤로 더 보내면 공이 렌즈를 뚫고 사라진다.
        const past = result.conceded ? BALL_PAST : 1.0;
        const q = Math.min(p * past, past);
        ball.position.x = lerp(0, VIEW_X * shot.aimX * SX, Math.min(q, 1));
        ball.position.z = lerp(11, 0.1, q);
        ball.position.y = lerp(BALL_R, shot.aimY * SY, Math.min(q, 1)) + Math.sin(Math.min(p, 1) * Math.PI) * 0.3;
        ball.rotation.x -= 0.4;
        ball.rotation.y -= 0.22;
        // 골포스트와 크로스바를 스치는 코스만 금속음이 난다.
        // 판정은 이미 끝났고 여기서 읽는 것은 확정된 조준점의 기하뿐이다.
        if (!cue.framed && q >= 0.97) {
          cue.framed = true;
          const nearPost = Math.abs(GOAL_HALF_W - Math.abs(shot.aimX)) < 0.16;
          const nearBar = Math.abs(GOAL_H - shot.aimY) < 0.16;
          if (nearPost || nearBar) sfx.post();
        }
        shadow.position.set(ball.position.x, 0.02, ball.position.z);
        const lift = Math.max(0, ball.position.y - BALL_R);
        shadow.scale.setScalar(1 + lift * 0.55);
        shadow.material.opacity = Math.max(0.08, 0.42 - lift * 0.14);

        // 키퍼는 판정된 방향으로 몸을 던진다. 늦게 출발하면 늦게 보인다.
        // 뻗는 거리는 골포스트 안쪽까지다. 화면 밖으로 나가면 결과가 안 보인다.
        const dp = Math.min(1, Math.max(0, (t - runup - flight * 0.28) / (flight * 0.7)));
        const span = Math.min(R_HALF_W - 0.5, 1.05 + 0.06 * cueKeeperDiving());
        keeper.position.x = lerp(0, VIEW_X * input.dive * span, ease(dp));
        keeper.position.z = lerp(KEEPER_Z, KEEPER_Z + input.advance, ease(Math.min(1, dp * 1.4)));
        keeper.rotation.z = lerp(0, VIEW_X * -input.dive * 1.15, ease(dp));
        // 몸이 누우면 어깨가 지면 아래로 내려간다. 기울인 만큼 들어야 흔을 안 파고 든다.
        const tilt = Math.abs(Math.sin(keeper.rotation.z)) * keeper.userData.girth;
        keeper.position.y = Math.sin(ease(dp) * Math.PI) * (input.dive === 0 ? 0.05 : 0.42) + tilt;

        if (p >= 1 && !cue.ended && t - runup > flight + 0.9) {
          cue.ended = true;
          cue.onEnd();
        }
      }
    }
    if (tail) {
      const u = Math.min(1, (performance.now() / 1000 - tail.t0) / 0.8);
      const e = ease(u);
      const gx = keeper.position.x + Math.sign(tail.kx || 1) * 0.1;
      switch (tail.kind) {
        case 'catch':
        case 'save':
          // 잡았으면 공이 장갑에 붙는다. 몸은 일어선다.
          ball.position.set(gx, lerp(tail.from.y, 0.95, e), lerp(tail.from.z, KEEPER_Z + 0.25, e));
          keeper.rotation.z = lerp(keeper.rotation.z, 0, 0.08);
          keeper.position.y = lerp(keeper.position.y, 0, 0.08);
          break;
        case 'carriedIn':
          // 막았는데 같이 넘어간다. 공과 몸이 한 덩어리로 골망까지 간다.
          keeper.position.z = lerp(KEEPER_Z, -1.1, e);
          keeper.rotation.z += 0.05;
          ball.position.set(keeper.position.x, 0.5, keeper.position.z - 0.2);
          break;
        case 'gloveGone': {
          // 장갑이 공에 딸려 간다. 손이 하나 없는 채로 남는다.
          const gl = keeper.userData.gloves[tail.kx > 0 ? 1 : 0];
          ball.position.set(lerp(tail.from.x, tail.from.x * 1.1, e), lerp(tail.from.y, 0.6, e), lerp(tail.from.z, -1.2, e));
          gl.getWorldPosition(new THREE.Vector3());
          gl.position.z = lerp(0.06, -2.4, e);
          gl.rotation.z += 0.4;
          break;
        }
        case 'spill':
          // 흘렸다. 공이 옆으로 튀어나가 아직 살아 있다.
          ball.position.set(lerp(tail.from.x, tail.from.x + (tail.kx >= 0 ? 1.5 : -1.5), e), 0.14 + Math.abs(Math.sin(u * 9)) * 0.5 * (1 - u), lerp(tail.from.z, 3.2, e));
          break;
        case 'downed':
          keeper.rotation.z = lerp(keeper.rotation.z, Math.sign(keeper.rotation.z || 1) * 1.5, 0.06);
          keeper.position.y = keeper.userData.girth;
          break;
        case 'rebound':
          ball.position.set(lerp(tail.from.x, 0.6, e), 0.6, lerp(tail.from.z, -1.1, e));
          break;
        case 'reboundMiss':
          ball.position.set(lerp(tail.from.x, -6.5, e), 0.5, lerp(tail.from.z, -1, e));
          break;
        case 'charge':
          // 잡고 나서 드리블하러 나간다. 공이 발 앞에서 튄다.
          keeper.rotation.z = lerp(keeper.rotation.z, 0, 0.12);
          keeper.position.y = 0;
          keeper.position.z = lerp(KEEPER_Z, 6.5, e);
          ball.position.set(keeper.position.x, 0.14 + Math.abs(Math.sin(u * 12)) * 0.28, keeper.position.z + 0.7);
          break;
        case 'beat':
          keeper.position.z = lerp(6.5, 13, e);
          keeper.rotation.z = Math.sin(u * 16) * 0.12;
          ball.position.set(keeper.position.x, 0.14, keeper.position.z + 0.7);
          kicker.rotation.z = lerp(0, 1.3, e);
          break;
        case 'lost':
          // 뺏겼다. 키퍼는 저기 나가 있고 골대가 비어 있다.
          ball.position.set(lerp(tail.from.x, kicker.position.x, e), 0.14, lerp(tail.from.z, kicker.position.z + 0.5, e));
          keeper.rotation.z = lerp(keeper.rotation.z, 1.2, 0.06);
          break;
        case 'skied':
          // 올라갔다가 다시 내려온다. 프레임을 나가면 하늘로 넘겼다는 결과가 안 보인다.
          ball.position.set(lerp(tail.from.x, 1.6, e), 0.14 + Math.sin(e * Math.PI) * 3.4, lerp(tail.from.z, 6.5, e));
          break;
        case 'openGoalScored':
          ball.position.set(lerp(tail.from.x, 0, e), 0.14, lerp(tail.from.z, -1.2, e));
          break;
        default:
          break;
      }
      shadow.position.set(ball.position.x, 0.02, ball.position.z);
      const lift2 = Math.max(0, ball.position.y - BALL_R);
      shadow.scale.setScalar(1 + lift2 * 0.55);
      shadow.material.opacity = Math.max(0.06, 0.42 - lift2 * 0.14);
    }
    keeperShadow.position.set(keeper.position.x, 0.03, keeper.position.z);
    // 행인은 판정과 무관하게 계속 걷는다. 멈춘 배경은 그림이고 움직이는 배경은 장소다.
    for (const p of passers) {
      p.position.x += p.userData.speed * 0.016;
      if (p.position.x > 26) p.position.x = -26;
      p.rotation.z = Math.sin(performance.now() * 0.006 * p.userData.speed) * 0.06;
    }
    keeperShadow.scale.setScalar(1 + Math.abs(Math.sin(keeper.rotation.z)) * 0.8);
    kickerShadow.position.set(kicker.position.x, 0.03, kicker.position.z);
    if (cue) { ballProbe.sample(); stageProbe.sample(); }
    renderer.render(scene, camera);
  }
  let divingStat = 5;
  const cueKeeperDiving = () => divingStat;

  renderer.setAnimationLoop(frame);

  function reset() {
    cue = null;
    tail = null;
    for (const g of keeper.userData.gloves) { g.position.z = 0.06; g.rotation.z = 0; }
    keeper.position.set(0, 0, KEEPER_Z);
    keeper.rotation.z = 0;
    ball.position.set(0, BALL_R, 11);
    shadow.position.set(0, 0.02, 11);
    shadow.scale.setScalar(1);
    shadow.material.opacity = 0.42;
    kicker.position.set(KICKER_OFF, 0, 11.2);
    kicker.rotation.z = 0;
  }
  reset();

  return { play, act, reset, setKeeper, sfx, ballProbe, stageProbe, goalFrame, set diving(v) { divingStat = v; } };
}
