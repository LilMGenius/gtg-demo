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

// 골키퍼. 원시 도형뿐이다. 관절은 없고 몸통이 통째로 기울어진다.
// 그 뻣뻣함이 병맛의 절반이다.
function buildKeeper(height, weight) {
  const g = new THREE.Group();
  const h = height / 100;
  const w = 0.30 + (weight - 84) * 0.0035;

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(w, h * 0.42, 3, 8), flat(0x2f8f5b));
  torso.position.y = h * 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.075, 10, 8), flat(0xe8c39a));
  head.position.y = h * 0.93;
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(w * 0.72, h * 0.3, 3, 8), flat(0x14202c));
  legs.position.y = h * 0.22;

  const glove = new THREE.BoxGeometry(h * 0.11, h * 0.11, h * 0.05);
  const gl = new THREE.Mesh(glove, flat(0xf2d64b));
  const gr = new THREE.Mesh(glove, flat(0xf2d64b));
  gl.position.set(-w - 0.22, h * 0.62, 0.06);
  gr.position.set(w + 0.22, h * 0.62, 0.06);

  g.add(torso, head, legs, gl, gr);
  for (const m of [torso, head, legs, gl, gr]) m.name = 'keeper';
  standOnGround(g);
  g.userData.gloves = [gl, gr];
  g.userData.girth = w;
  return g;
}

function buildKicker() {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.72, 3, 8), flat(0xc9483a));
  torso.position.y = 1.02;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), flat(0xd8a877));
  head.position.y = 1.62;
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.52, 3, 8), flat(0xf0f0ee));
  legs.position.y = 0.4;
  for (const m of [torso, head, legs]) m.name = 'kicker';
  g.add(torso, head, legs);
  standOnGround(g);
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

  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(R_HALF_W * 2, R_H, 11, 7),
    new THREE.MeshBasicMaterial({ color: 0xdfe6da, wireframe: true, transparent: true, opacity: 0.28 })
  );
  net.position.set(0, R_H / 2, -0.75);
  scene.add(net);

  // 하늘. 안쪽을 보는 반구 하나면 검은 벽이 사라진다.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(90, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x86aecb, side: THREE.BackSide, fog: false })
  );
  scene.add(dome);

  // 펜스. 동네 운동장을 두르는 초록 그물이다.
  const fence = new THREE.Mesh(
    new THREE.PlaneGeometry(58, 3.4, 30, 3),
    new THREE.MeshBasicMaterial({ color: 0x3f6b4a, wireframe: true, transparent: true, opacity: 0.55 })
  );
  fence.position.set(0, 1.7, 30);
  fence.rotation.y = Math.PI;
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
    keeperShadow.position.set(keeper.position.x, 0.03, keeper.position.z);
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

  return { play, reset, setKeeper, sfx, ballProbe, stageProbe, goalFrame, set diving(v) { divingStat = v; } };
}
