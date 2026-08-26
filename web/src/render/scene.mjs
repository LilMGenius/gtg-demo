// 연출. 판정은 이 파일에 없다.
// 롤은 이미 굴렀고 여기서는 확정된 결과를 연기할 뿐이다.
import * as THREE from '../../vendor/three.module.min.js';
import { GOAL_HALF_W, GOAL_H } from '../../../src/chain.mjs';
import { mountSfx } from '../audio/sfx.mjs';
import { createBallProbe } from '../diagnostics/ball-probe.mjs';
import { createStageProbe, goalFraming } from '../diagnostics/stage-probe.mjs';
import {
  flat, BALL_R, VIEW_X, KICKER_OFF, BALL_PAST, REST_Z, REST_Y,
  R_HALF_W, R_H, SX, SY, lerp, ease
} from './units.mjs';
import { pupilMat, buildKeeper, buildKicker } from './objects/actors.mjs';
import { buildPitch, buildPassers } from './objects/pitch.mjs';

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
  // 카메라가 크로스바와 같은 높이에 서면 상단으로 오는 공이 비행 내내 바에 가려 안 보인다.
  // 바 아래로 내려서 공과 바를 화면에서 분리한다.
  camera.position.set(0, 3.3, -5.1);
  camera.lookAt(0, 1.4, 4.5);

  scene.add(new THREE.AmbientLight(0xd8e6dc, 2.4));
  const sun = new THREE.DirectionalLight(0xfff6e0, 2.6);
  sun.position.set(-5, 9, 7);
  scene.add(sun);

  buildPitch(scene);
  const passers = buildPassers(scene);

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
  // 행인도 그림자가 있어야 땅을 딘는다. 말걸기 연출은 행인을 앞줄로 데려오므로 더 눈에 띄다.
  const passerShadows = passers.map(() => blob(0.24));

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
  // 떨어져 나간 장갑. 키퍼 그룹에 달린 채로 카메라 쪽으로 날아가면 키퍼가 프레임을 나간 것으로 측정된다.
  let loose = null;
  const heartMat = new THREE.MeshBasicMaterial({ color: 0xff3f6d });
  function act(kind) {
    if (kind === 'gloveGone') {
      const gl = keeper.userData.gloves[keeper.position.x > 0 ? 1 : 0];
      scene.attach(gl);
      loose = gl;
    }
    tail = { kind, t0: performance.now() / 1000, from: ball.position.clone(), kx: keeper.position.x };
  }
  function play(shot, input, result, onEnd) {
    tail = null;
    cue = { shot, input, result, t0: performance.now() / 1000, ended: false, onEnd, steps: 0, struck: false, framed: false };
    kicker.position.set(VIEW_X * shot.aimX * SX * 0.2 + KICKER_OFF, 0, 11.2);
    kicker.userData.startX = kicker.position.x;
    ball.position.set(0, BALL_R, 11);
    // 카메라는 골대 뒤 위에 있고 크로스바는 골대 전체 폭을 가로지르는 봉이다.
    // 그래서 바에 가린 공은 옆으로 밀어도 그대로 가려 있다. 떨어지는 것은 높이뿐이다.
    // 상단 코스는 비행 선이 시선과 거의 나란해져 바 뒤를 계속 따라간다.
    // 포물선을 키워 시선을 가로지르게 만든다.
    cue.arc = 0.3 + (shot.aimY > 1.0 ? 0.85 : 0);

    // 눈에 띄는 행인은 매 구 있지 않다. 그 구에만 앞줄로 걸어온다.
    for (const p of passers) p.position.z = p.userData.homeZ;
    if (shot.gaze) { passers[0].position.set(-14, 0, 18); }
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
        ball.position.y = lerp(BALL_R, shot.aimY * SY, Math.min(q, 1)) + Math.sin(Math.min(p, 1) * Math.PI) * cue.arc;
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
          keeper.position.z = lerp(KEEPER_Z, -0.35, e);
          keeper.rotation.z = lerp(keeper.rotation.z, Math.sign(keeper.rotation.z || 1) * 1.35, 0.08);
          keeper.position.y = keeper.userData.girth;
          ball.position.set(keeper.position.x, 0.55, keeper.position.z - 0.2);
          break;
        case 'gloveGone': {
          // 장갑이 공에 딸려 간다. 손이 하나 없는 채로 남는다.
          ball.position.x = lerp(tail.from.x, tail.from.x * 1.1, e);
          ball.position.y = lerp(tail.from.y, REST_Y, e);
          ball.position.z = lerp(tail.from.z, REST_Z, e);
          if (loose) {
            loose.position.set(ball.position.x + 0.3, ball.position.y + 0.2, ball.position.z + 0.25);
            loose.rotation.z += 0.4;
          }
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
          ball.position.set(lerp(tail.from.x, 0.6, e), lerp(tail.from.y, REST_Y, e), lerp(tail.from.z, REST_Z, e));
          break;
        case 'reboundMiss':
          // 튀어나간 공이 골대 옆으로 흘러난다. 프레임 밖으로 보내면 어디로 갔는지 안 보인다.
          ball.position.set(lerp(tail.from.x, tail.kx >= 0 ? 2.9 : -2.9, e), 0.14 + Math.abs(Math.sin(u * 8)) * 0.45 * (1 - u), lerp(tail.from.z, 3.2, e));
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
          // 바 위로 넘어 골대 옆으로 떨어진다.
          // 카메라가 골대 뒤에서 내려다보므로 그대로 올리면 크로스바가 공을 가린다.
          // 올라가기 전에 먼저 포스트 밖으로 빼낸다.
          ball.position.set(lerp(tail.from.x, 2.45, Math.min(1, e * 2.4)), lerp(tail.from.y, REST_Y, Math.min(1, e * 1.6)) + Math.sin(e * Math.PI) * 1.5, lerp(tail.from.z, -1.2, Math.min(1, e * 3.2)));
          break;
        case 'talked': {
          // 입을 열었고 몸이 따라갔다. 공은 그대로 빈 골대로 들어간다.
          const head2 = keeper.userData.head;
          head2.rotation.y = lerp(0, 2.6, Math.min(1, e * 2));
          for (const pu of head2.userData.eyes) {
            pu.material = heartMat;
            pu.scale.set(2.1, 2.1, 0.5);
          }
          const walk = Math.min(1, e * 1.5);
          keeper.position.x = lerp(tail.kx, -2.4, walk);
          keeper.position.z = lerp(KEEPER_Z, 4.2, walk);
          keeper.rotation.z = Math.sin(e * 12) * 0.09;
          if (passers[0]) {
            passers[0].position.set(lerp(-14, -3.6, walk), 0, lerp(18, 4.6, walk));
            passers[0].rotation.z = Math.sin(e * 9) * 0.18;
          }
          ball.position.set(lerp(tail.from.x, 0, e), lerp(tail.from.y, REST_Y, e), lerp(tail.from.z, REST_Z, e));
          break;
        }
        case 'distracted': {
          // 카메라가 아니라 고개가 돌아간다. 머리가 돌아가 있는 동안 공은 그대로 지나간다.
          const head = keeper.userData.head;
          head.rotation.y = lerp(0, -1.15, e);
          for (const pu of head.userData.eyes) {
            pu.material = heartMat;
            pu.scale.set(1.9, 1.9, 0.5);
          }
          ball.position.set(lerp(tail.from.x, tail.from.x * 1.3, e), lerp(tail.from.y, REST_Y, e), lerp(tail.from.z, REST_Z, e));
          break;
        }
        case 'openGoalScored':
          ball.position.set(lerp(tail.from.x, 0, e), lerp(tail.from.y, REST_Y, e), lerp(tail.from.z, REST_Z, e));
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
    for (const [i, p] of passers.entries()) {
      passerShadows[i].position.set(p.position.x, 0.03, p.position.z);
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
    if (loose) { keeper.add(loose); loose = null; }
    for (const p of passers) p.rotation.z = 0;
    keeper.userData.gloves.forEach((g, i) => { g.position.copy(keeper.userData.gloveHome[i]); g.rotation.set(0, 0, 0); });
    const head = keeper.userData.head;
    head.rotation.y = 0;
    for (const pu of head.userData.eyes) { pu.material = pupilMat; pu.scale.set(1, 1.1, 0.5); }
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
