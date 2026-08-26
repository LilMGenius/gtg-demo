// 연출. 판정은 이 파일에 없다.
// 롤은 이미 굴렀고 여기서는 확정된 결과를 연기할 뿐이다.
import * as THREE from '../../vendor/three.module.min.js';
import { GOAL_HALF_W, GOAL_H } from '../../../src/chain.mjs';

const flat = (c) => new THREE.MeshLambertMaterial({ color: c });
const BALL_R = 0.14;
// 화면 좌우와 판정 좌우를 맞추는 부호. 판정식은 건드리지 않는다.
const VIEW_X = -1;
// 골망은 z = -0.75에 있다. q가 1.09면 공이 딱 그 자리에서 선다.
const BALL_PAST = 1.09;
const lerp = (a, b, t) => a + (b - a) * t;
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
  g.userData.gloves = [gl, gr];
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
  g.add(torso, head, legs);
  return g;
}

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b3a4a);
  scene.fog = new THREE.Fog(0x3d4a52, 26, 76);

  // 가로 화면 전제. 골대는 좌우로 긴 물건이라 세로로는 판정이 안 보인다.
  // 카메라는 골대 뒤 위쪽. 골대 폭 전체와 키커까지 한 화면에 넣는다.
  const camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 200);
  camera.position.set(0, 3.4, -7.4);
  camera.lookAt(0, 1.5, 5.5);

  scene.add(new THREE.AmbientLight(0xbcd0c0, 1.5));
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.5);
  sun.position.set(-5, 9, 7);
  scene.add(sun);

  // 흙바닥. 잔디가 아니다. 동네 운동장이 이 게임의 무대다.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), flat(0x6b5433));
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 24;
  scene.add(ground);

  const box = new THREE.Mesh(new THREE.PlaneGeometry(16.5, 16.5), flat(0x7a6440));
  box.rotation.x = -Math.PI / 2;
  box.position.set(0, 0.01, 8.2);
  scene.add(box);

  // 골대. 판정식이 쓰는 폭과 높이를 그대로 쓴다. 그림과 숫자가 어긋나면 화면이 거짓말을 한다.
  const post = new THREE.CylinderGeometry(0.06, 0.06, GOAL_H, 8);
  const white = flat(0xf4f6f2);
  for (const x of [-GOAL_HALF_W, GOAL_HALF_W]) {
    const p = new THREE.Mesh(post, white);
    p.position.set(x, GOAL_H / 2, 0);
    scene.add(p);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, GOAL_HALF_W * 2, 8), white);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, GOAL_H, 0);
  scene.add(bar);

  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(GOAL_HALF_W * 2, GOAL_H, 9, 7),
    new THREE.MeshBasicMaterial({ color: 0xdfe6da, wireframe: true, transparent: true, opacity: 0.28 })
  );
  net.position.set(0, GOAL_H / 2, -0.75);
  scene.add(net);

  // 하늘. 안쪽을 보는 반구 하나면 검은 벽이 사라진다.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(90, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x5f7f9c, side: THREE.BackSide, fog: false })
  );
  scene.add(dome);

  // 펜스. 동네 운동장을 두르는 초록 그물이다.
  const fence = new THREE.Mesh(
    new THREE.PlaneGeometry(58, 3.4, 30, 3),
    new THREE.MeshBasicMaterial({ color: 0x2c4a34, wireframe: true, transparent: true, opacity: 0.55 })
  );
  fence.position.set(0, 1.7, 30);
  fence.rotation.y = Math.PI;
  scene.add(fence);

  // 건물 실루엣. 지평선 위가 비지 않게만 세운다. 디테일은 없다.
  const skyline = new THREE.Group();
  const blockMat = flat(0x33404a);
  for (let i = 0; i < 14; i += 1) {
    const w = 3.4 + ((i * 37) % 5);
    const h = 5 + ((i * 53) % 11);
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 3), blockMat);
    b.position.set(-30 + i * 4.6 + ((i * 17) % 3), h / 2, 38 + ((i * 29) % 7));
    skyline.add(b);
  }
  scene.add(skyline);

  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), flat(0xfdfdf6));
  scene.add(ball);

  // 공 그림자. 공이 어디쯤인지 바닥이 알려주면 궤적을 놓치지 않는다.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.16, 12),
    new THREE.MeshBasicMaterial({ color: 0x1c1508, transparent: true, opacity: 0.42 })
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);

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

  // 한 구의 연출. 시작 시각과 확정된 결과만 받는다.
  let cue = null;
  function play(shot, input, result, onEnd) {
    cue = { shot, input, result, t0: performance.now() / 1000, ended: false, onEnd };
    kicker.position.set(VIEW_X * shot.aimX * 0.2, 0, 11.2);
    ball.position.set(0, BALL_R, 11);
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
        kicker.rotation.z = Math.sin(p * 14) * 0.14;
      } else {
        kicker.rotation.z *= 0.86;
        const p = Math.min(1, (t - runup) / flight);
        // 공은 골라인에서 멈추지 않는다. 실점이면 골망까지 가고 거기서 선다.
        // 카메라가 골대 뒤에 있으니 그 뒤로 더 보내면 공이 렌즈를 뚫고 사라진다.
        const past = result.conceded ? BALL_PAST : 1.0;
        const q = Math.min(p * past, past);
        ball.position.x = lerp(0, VIEW_X * shot.aimX, Math.min(q, 1));
        ball.position.z = lerp(11, 0.1, q);
        ball.position.y = lerp(BALL_R, shot.aimY, Math.min(q, 1)) + Math.sin(Math.min(p, 1) * Math.PI) * 0.3;
        ball.rotation.x -= 0.4;
        ball.rotation.y -= 0.22;
        shadow.position.set(ball.position.x, 0.02, ball.position.z);
        const lift = Math.max(0, ball.position.y - BALL_R);
        shadow.scale.setScalar(1 + lift * 0.55);
        shadow.material.opacity = Math.max(0.08, 0.42 - lift * 0.14);

        // 키퍼는 판정된 방향으로 몸을 던진다. 늦게 출발하면 늦게 보인다.
        // 뻗는 거리는 골포스트 안쪽까지다. 화면 밖으로 나가면 결과가 안 보인다.
        const dp = Math.min(1, Math.max(0, (t - runup - flight * 0.28) / (flight * 0.7)));
        const span = Math.min(GOAL_HALF_W - 0.4, 1.05 + 0.06 * cueKeeperDiving());
        keeper.position.x = lerp(0, VIEW_X * input.dive * span, ease(dp));
        keeper.position.z = lerp(0.35, 0.35 + input.advance, ease(Math.min(1, dp * 1.4)));
        keeper.rotation.z = lerp(0, VIEW_X * -input.dive * 1.15, ease(dp));
        keeper.position.y = Math.sin(ease(dp) * Math.PI) * (input.dive === 0 ? 0.05 : 0.42);

        if (p >= 1 && !cue.ended && t - runup > flight + 0.9) {
          cue.ended = true;
          cue.onEnd();
        }
      }
    }
    renderer.render(scene, camera);
  }
  let divingStat = 5;
  const cueKeeperDiving = () => divingStat;

  renderer.setAnimationLoop(frame);

  function reset() {
    cue = null;
    keeper.position.set(0, 0, 0.35);
    keeper.rotation.z = 0;
    ball.position.set(0, BALL_R, 11);
    shadow.position.set(0, 0.02, 11);
    shadow.scale.setScalar(1);
    shadow.material.opacity = 0.42;
    kicker.position.set(0, 0, 11.2);
    kicker.rotation.z = 0;
  }
  reset();

  return { play, reset, setKeeper, set diving(v) { divingStat = v; } };
}
