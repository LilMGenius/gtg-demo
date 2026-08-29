// 연출. 판정은 이 파일에 없다.
// 롤은 이미 굴렀고 여기서는 확정된 결과를 연기할 뿐이다.
import * as THREE from '../../vendor/three.module.min.js';
import { GOAL_HALF_W, GOAL_H } from '../../../src/chain.mjs';
import { mountSfx } from '../audio/sfx.mjs';
import { createBallProbe } from '../diagnostics/ball-probe.mjs';
import { createStageProbe, goalFraming, footY, faceToCamera } from '../diagnostics/stage-probe.mjs';
import {
  flat, flatVertex, BALL_R, VIEW_X, KICKER_OFF, BALL_PAST, REST_Z, REST_Y,
  R_HALF_W, R_H, SX, SY, lerp, ease
} from './units.mjs';
import { pupilMat, buildKeeper, buildKicker, POSES, JOINTS, lerpPose, setPose } from './objects/actors.mjs';
import { buildPitch, buildPassers } from './objects/pitch.mjs';
import { createImpact } from './objects/impact.mjs';
import { jitterMesh, addOutline, blobGeo, ballGeo } from './handmade.mjs';

// 몸이 무너지는 포즈는 빨리 잡히고, 발이 살아 있는 포즈는 그 중간이다.
const WRECK_POSES = new Set([POSES.faceplant, POSES.sprawlR, POSES.sprawlL, POSES.hugfall]);
const SCRAMBLE_POSES = new Set([POSES.dribble, POSES.stumble]);

// 몸이 흙에 닿는 포즈. 서서 끝나는 연출은 땅에 아무것도 안 남긴다.
const SCUFF_POSES = new Set([POSES.faceplant, POSES.sprawlR, POSES.sprawlL, POSES.hugfall,
  POSES.snatch, POSES.swatR, POSES.swatL, POSES.shoveR, POSES.shoveL,
  POSES.reachR, POSES.reachL, POSES.diveR, POSES.diveL]);

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

  // 화면을 한 번 작게 그린 다음 늘린다. 플래시 게임의 뭉개짐은 실력 부족이 아니라 그 시대의 해상도다.
  // 풀해상도로 깨끗하게 그린 로우폴리는 에셋스토어 템플릿으로 읽힌다. 여기서 그 지문을 지운다.
  // 세로 288은 골키퍼 얼굴이 뭉개져 사라졌고 540은 원본과 구분이 안 갔다. 384가 계단이 보이면서 형태가 남는 높이다.
  const RT_H = 384;
  const rt = new THREE.WebGLRenderTarget(683, RT_H, {
    // 선형 보간으로 늘리면 뿌옇기만 하고 픽셀이 안 보인다. 계단이 보여야 저해상도로 읽힌다.
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter
  });
  const postScene = new THREE.Scene();
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // 색을 몇 단으로 끊는다. 그라데이션이 남아 있으면 3D 렌더링이고, 끊기면 그림이다.
  // 10단은 원본과 같았고 4단은 얼굴과 유니폼이 한 색이 됐다.
  const postMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, steps: { value: 7.0 }, texel: { value: new THREE.Vector2(1 / 683, 1 / RT_H) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float steps; uniform vec2 texel; varying vec2 vUv;',
      'void main(){',
      // 색수차는 뺀다. 골포스트처럼 밝고 가는 세로선 옆에서는 폭을 아무리 줄여도
      // 채널이 한 텍셀 갈리는 순간 빨강과 청록 테두리가 서고, 그게 렌즈가 아니라
      // 인코딩이 깨진 화면으로 읽혔다. 저해상도와 계단은 이미 포스터라이즈가 말한다.
      '  vec2 d0 = vUv - 0.5;',
      '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
      // 색을 끊기 전에 잡음을 섞는다. 끊고 나서 섞으면 계단 위에 모래를 뿌린 것으로 보인다.
      // 잡음의 좌표는 화면 픽셀이 아니라 렌더타깃 텍셀이다. gl_FragCoord로 뽑으면 덩어리
      // 픽셀 하나 안에서 값이 서너 번 갈려 저해상도 질감이 깨지고 벽이 반짝인다.
      // 난수 대신 4x4 베이어다. 흰잡음은 평평한 벽에 소금후추를 뿌리고 프레임마다 자리를 옮긴다.
      // 베이어는 화면에 고정된 무늬라 벽이 가만히 있고, 규칙적인 그물눈이 저해상도와 같은 편이다.
      '  vec2 q = floor(vUv / texel);',
      '  vec2 q1 = mod(q, 2.0);',
      '  vec2 q2 = mod(floor(q * 0.5), 2.0);',
      '  float n = fract(q1.x * 0.5 + q1.y * q1.y * 0.75) + fract(q2.x * 0.5 + q2.y * q2.y * 0.75) * 0.25;',
      // 색을 채널마다 따로 끊으면 안 된다. 하늘처럼 평탄한 면은 세 채널이 각자 다른 거리에서
      // 경계를 만나고, 잡음이 경계에 가까운 채널 하나만 넘긴다. 그 결과가 알록달록한 점이었다.
      // 인코딩 깨짐으로 읽혔던 것이 이것이다. 밝기만 끊고 색비를 그대로 곱하면 원리상 색이 갈릴 수 없다.
      '  vec3 W = vec3(0.299, 0.587, 0.114);',
      '  float l = dot(c, W);',
      // 밴드를 선형 휘도에서 자르면 어두운 쪽에 칸이 하나도 안 남는다. 흙의 선형 휘도가
      // 이미 최하 칸이라, 그림자처럼 그보다 어두운 값은 floor가 음수 칸을 내고 순검정으로 클램프됐다.
      // 그래서 접지 그림자가 그늘이 아니라 바닥에 뚫린 구멍으로 읽혔다.
      // 지각 공간에서 자르면 같은 7칸이 어두운 쪽에 절반쯤 배분된다.
      '  float e = pow(max(l, 0.0), 0.4545);',
      // floor만 쓰면 화면 전체가 어두워진다. 반 칸 올려 원래 밝기를 지킨다.
      // 음수 칸은 막는다. 한 칸 아래는 어두운 색이 아니라 색이 뒤집힌 값이다.
      '  float qe = (max(floor((e + (n - 0.5) / steps * 0.34) * steps), 0.0) + 0.5) / steps;',
      '  float ql = pow(qe, 2.2);',
      // 나누는 밝기는 잡음을 타지 않은 원래 값이다. 잡음 섞인 값으로 나누면 색비가 픽셀마다 흔들린다.
      '  c *= ql / max(l, 0.001);',
      // 주사선. 한 줄 걸러 살짝 어둡게. 0.02는 안 보였고 0.11은 낮 경기가 밤이 됐다.
      '  c *= 1.0 - step(0.5, fract(gl_FragCoord.y * 0.5)) * 0.055;',
      // 비네트. 가장자리만 살짝. 0.5는 경기장 절반이 그늘로 들어갔다.
      '  c *= 1.0 - dot(d0, d0) * 0.22;',
      // 마지막에 sRGB로 인코딩한다. 커스텀 ShaderMaterial에는 three가 출력 변환을 붙여주지 않는다.
      // 이게 빠지면 선형 값이 그대로 화면 바이트가 되고, 중간톤만 감마 한 번만큼 눌린다.
      // 흰색과 순색은 1.0이라 그대로 나오므로 그 두 색으로는 원리상 이 결함이 안 보인다.
      '  vec3 lo = c * 12.92;',
      '  vec3 hi = 1.055 * pow(max(c, vec3(0.0031308)), vec3(0.41666)) - 0.055;',
      '  c = mix(lo, hi, step(vec3(0.0031308), c));',
      '  gl_FragColor = vec4(c, 1.0);',
      '}'
    ].join(String.fromCharCode(10)),
    depthTest: false, depthWrite: false
  });
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));

  // 세계의 시계. performance.now()를 직접 읽으면 시간을 늦출 자리가 없다.

  // 히트스톱은 프레임을 건너뛰는 것이 아니라 시간의 배율을 낮추는 것이다.
  let sceneCalls = 0;
  let sceneTris = 0;
  let vnow = 0;
  let realLast = performance.now() / 1000;
  let stopLeft = 0;
  let kickPop = 0;
  // 0.30은 슬로모션으로 읽혔고 0.02는 프레임이 멈춘 것으로 읽혔다. 0.08이 걸리는 느낌이다.
  const HIT_SCALE = 0.08;

  // 암빛을 한 덩어리로 뿌리면 모든 면이 같은 밝기로 서고, 입체는 색칠한 오려붙이기가 된다.
  // 키·필·림을 나누고 바닥 반사를 따로 준다. 전체 노출은 그대로 두고 방향만 쪼갠다.
  scene.add(new THREE.AmbientLight(0xd8e6dc, 0.62));
  // 하늘은 차갑게, 흙바닥은 따뜻하게. 이 한 줄이 바운스 광 역할을 한다.
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x8a7048, 1.05));
  // 키. 카메라 쪽 왼쪽 위에서 얼굴과 장갑을 친다.
  const key = new THREE.DirectionalLight(0xfff4dc, 2.05);
  key.position.set(-6, 8, -4);
  scene.add(key);
  // 필. 반대편에서 약하고 차게. 그림자 안이 검게 먹히는 것만 막는다.
  const fill = new THREE.DirectionalLight(0x9fc0e8, 0.55);
  fill.position.set(7, 3.5, -2);
  scene.add(fill);
  // 림. 뒤에서 치면 어깨와 머리 윤곽에 선이 생기고, 인물이 배경에서 떨어진다.
  const rim = new THREE.DirectionalLight(0xffd9a0, 1.9);
  rim.position.set(2, 6, 12);
  scene.add(rim);

  const pitch = buildPitch(scene);
  const passers = buildPassers(scene);
  const impact = createImpact(scene);

  const ball = new THREE.Mesh(ballGeo(BALL_R), flatVertex(0xfdfdf6));
  // 흰 공이 밝은 하늘 앞을 지나면 사라진다. 외곽선 하나가 그걸 끝낸다.
  jitterMesh(ball, 0.006, 5);
  addOutline(ball, 0.012);
  ball.userData.probeIgnore = true;
  scene.add(ball);

  // 잔상. 공 한 개만 그리면 빠른 공과 느린 공이 같은 그림이 된다.
  // 공이 카메라를 향해 오므로 지나온 자리는 화면에서 공 뒤에 그대로 숨는다.
  // 그래서 원근 축소를 거리비로 되돌리고 거기서 더 키운다. 꼬리가 아니라 공을 감싸는 링으로 남는다.
  // 지오메트리와 재질은 한 벌만 쓴다. 잔상이 프로그램을 하나 더 만들면 드로우콜 예산이 먼저 죽는다.
  const GHOSTS = 8;
  const ghostGeo = new THREE.IcosahedronGeometry(BALL_R, 0);
  // 흰 잔상은 흰 공 뒤에서도 흙 배경 위에서도 안 보였다. 정지 화면에서 공이 서 있는지 날아오는지 안 읽혔다.
  // 만화가 속도를 그리는 색은 흰색이 아니다. 노란 링이라야 갈색 흙 위에서 남는다.
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.2, depthWrite: false });
  const ghosts = [];
  for (let i = 0; i < GHOSTS; i++) {
    const g = new THREE.Mesh(ghostGeo, ghostMat);
    g.visible = false;
    g.userData.probeIgnore = true;
    scene.add(g);
    ghosts.push(g);
  }
  const trail = [];

  // 공 그림자. 공이 어디쯤인지 바닥이 알려주면 궤적을 놓치지 않는다.
  const shadow = new THREE.Mesh(
    blobGeo(0.16, 0x4411a3),
    new THREE.MeshBasicMaterial({ color: 0x1c1508, transparent: true, opacity: 0.42 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.userData.probeIgnore = true;
  scene.add(shadow);

  // 배우 그림자. 공에만 그림자가 있으면 사람은 떠 보인다. 수치상 접지여도 화면은 그렇게 안 읽힌다.
  // 그늘 한 장은 균일하다. 실제로는 몸에 가까운 쪽이 더 짙고 가장자리로 갈수록 옅다.
  // 원판 두 장을 어긋나게 겹치면 그 농도 차이가 생긴다.
  let blobSeed = 0x1f0b77;
  const blob = (r) => {
    blobSeed += 0x9e37;
    const m = new THREE.Mesh(
      blobGeo(r, blobSeed),
      new THREE.MeshBasicMaterial({ color: 0x1c1508, transparent: true, opacity: 0.55 })
    );
    const core = new THREE.Mesh(
      blobGeo(r * 0.56, blobSeed + 0x31),
      new THREE.MeshBasicMaterial({ color: 0x1c1508, transparent: true, opacity: 0.60 })
    );
    // 정확히 겹치면 두 장인 줄 모른다. 반지름의 5분의 1만 밀어 발밑을 짙게 만든다.
    core.position.set(r * 0.18, -r * 0.14, 0.001);
    m.add(core);
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
    // 벗겨진 장갑은 장면에 붙어 있다. 키퍼를 다시 짓기 전에 치워야
    // 새 키퍼의 장갑 목록과 짝이 안 맞는 유령이 남지 않는다.
    if (loose) { scene.remove(loose); loose = null; }
    scene.remove(keeper);
    keeper = buildKeeper(k.height, k.weight);
    scene.add(keeper);
  }

  // 화면 흔들림. 카메라 본체를 흔들면 골대 프레이밍과 키퍼 접지 측정이 같이 흔들린다.
  // 그래서 진폭은 게이트가 견디는 크기에서 시작한다. 0.09는 골대가 프레임을 나갔고 0.004는 아무 일도 안 일어났다.
  const CAM_BASE = new THREE.Vector3(0, 3.3, -5.1);
  const CAM_LOOK = new THREE.Vector3(0, 1.4, 4.5);
  let shakeAmp = 0;
  let shakeLeft = 0;
  let shakeSpan = 1;
  // 더치 앵글. 카메라 위치를 옮기면 골대 프레이밍 측정이 통째로 흔들린다.
  // 렌즈만 기울이면 프레임 안의 것들은 그대로 있고 화면만 비뚤어진다. 게이트가 재는 축을 안 건드린다.
  // 0.04는 모니터가 삐뚤어진 줄 알았고 0.28은 골대 모서리가 프레임을 나갔다.
  // 타이틀은 인게임 카메라를 안 쓴다. 같은 각도면 시작 버튼을 눌러도 화면이 그대로라 게임이 안 도는 것으로 보인다.
  // CAM_BASE 고정 규칙은 게이트가 재는 인게임에만 걸린다. 타이틀은 그 밖이다.
  let titleMode = true;
  let dutch = 0;
  let dutchLeft = 0;
  let dutchSpan = 1;
  function tilt(rad, dur) {
    if (Math.abs(rad) <= Math.abs(dutch)) return;
    dutch = rad;
    dutchLeft = dur;
    dutchSpan = dur;
  }
  // 골망 출렁임. 감쇠 진동 한 번. 한 번만 밀면 그물이 밀린 채로 굳는다.
  let netAmp = 0;
  let netT = 0;
  let netX = 0;
  let netY = 0;
  function shake(amp, dur) {
    // 겹쳐 오면 큰 쪽이 이긴다. 더하면 실점 한 번에 화면이 뒤집힌다.
    shakeAmp = Math.max(shakeAmp, amp);
    shakeLeft = Math.max(shakeLeft, dur);
    shakeSpan = Math.max(shakeLeft, 0.001);
  }

  // 가로가 기준이다. 화면이 그보다 좁으면 수직 화각을 늘려 골대 폭을 지킨다.
  const BASE_ASPECT = 16 / 9;
  const BASE_FOV = 46;
  // 키퍼가 골라인에 붙으면 카메라에 가까워 발이 프레임 아래로 내려간다.
  const KEEPER_Z = 0.9;
  // 드리블하러 나갔을 때 서는 자리. 뺏기는 연출도 여기서 출발한다.
  const CHARGE_Z = 4.2;
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
    // 저해상도 버퍼도 화면 비율을 따라간다. 고정 폭이면 화면이 넓어질 때 가로로 늘어난다.
    rt.setSize(Math.max(2, Math.round(RT_H * (w / Math.max(1, h)))), RT_H);
    // 색수차 폭은 텍셀 단위다. 여기서 안 갱신하면 창을 넓힐수록 색이 벌어진다.
    postMat.uniforms.texel.value.set(1 / rt.width, 1 / rt.height);
  }
  addEventListener('resize', resize);
  resize();

  // 공이 화면에 있는지는 재야 알 수 있다. 보이게 만들었다는 말은 증거가 아니다.
  const ballProbe = createBallProbe(camera, scene, ball, BALL_R);
  const stageProbe = createStageProbe(camera, { kicker: () => kicker, keeper: () => keeper });
  const goalFrame = () => goalFraming(camera, R_HALF_W, R_H);

  // 한 구의 연출. 시작 시각과 확정된 결과만 받는다.
  // 포즈는 상태다. 목표 포즈로 매 프레임 조금씩 끌고 간다.
  // 순간 전환은 사람이 아니라 슬라이드로 읽힌다.
  const poseNow = { keeper: POSES.ready, kicker: POSES.windup };
  const actor = { keeper: null, kicker: null };
  function drive(key, target, rate) {
    poseNow[key] = lerpPose(poseNow[key], target, rate);
    setPose(actor[key], poseNow[key], vnow);
  }

  let cue = null;
  // 체인의 반전은 자막이 아니라 화면에서 일어나야 한다.
  // 여기서 결과를 바꾸지 않는다. 이미 확정된 사건 이름 하나를 받아 그것만 연기한다.
  let tail = null;
  // 고개가 돌아가는 속도. 사건과 함께 즉시 최대로 돌면 목이 끊긴 것으로 보인다.
  let tailRamp = 0;
  // 떨어져 나간 장갑. 키퍼 그룹에 달린 채로 카메라 쪽으로 날아가면 키퍼가 프레임을 나간 것으로 측정된다.
  let loose = null;
  const heartMat = new THREE.MeshBasicMaterial({ color: 0xff3f6d });
  // 사건마다 얼굴이 달라야 자막을 지워도 무엇이 일어났는지 읽힌다.
  // 입 배율은 addFace가 넘긴 기준값에 곱한다. 절대값을 여기 적으면 두 파일이 갈라진다.
  const MOOD = {
    rest: { pupil: [1, 1.1, 0.5], mouth: [1, 1, 1], heart: false },
    grin: { pupil: [1.15, 0.5, 0.5], mouth: [1.7, 1.4, 1.5], heart: false },
    // 놀람은 입을 더 키울수록 얼굴 아래 절반이 검게 차서 턱이 사라지고 머리가 몸통에 붙는다.
    // 입은 턱을 남기는 선에서 멈추고, 동공은 점으로 줄이지 않는다. 흰자만 남으면 눈이 공으로 읽힌다.
    shock: { pupil: [0.8, 0.8, 0.5], mouth: [1.5, 1.9, 1.5], heart: false },
    heart: { pupil: [2.1, 2.1, 0.5], mouth: [1.4, 1.6, 1.2], heart: true }
  };
  function setMood(head, name) {
    const m = MOOD[name] ?? MOOD.rest;
    for (const pu of head.userData.eyes) {
      pu.material = m.heart ? heartMat : pupilMat;
      pu.scale.set(m.pupil[0], m.pupil[1], m.pupil[2]);
    }
    const mr = head.userData.mouthRest;
    head.userData.mouth.scale.set(mr.x * m.mouth[0], mr.y * m.mouth[1], mr.z * m.mouth[2]);
  }
  // 얼굴은 +z를 보고 렌즈는 -z에 있다. 그대로 두면 관객이 보는 것은 뒤통수뿐이다.
  // 몸이 굴러 누우면 오일러 각으로는 목을 어디로 돌려야 할지 예측할 수 없다.
  // lookAt이 로컬 +z를 렌즈로 보내므로 그 자세와 안식 자세를 섞어 노출량만 정한다.
  const faceRest = new THREE.Quaternion();
  const faceLensQ = new THREE.Quaternion();
  function applyFace(amount, mood, ramp) {
    const head = keeper.userData.head;
    const a = Math.min(1, Math.max(0, amount * ramp));
    head.quaternion.identity();
    keeper.updateMatrixWorld(true);
    faceRest.copy(head.quaternion);
    head.lookAt(camera.position);
    faceLensQ.copy(head.quaternion);
    head.quaternion.copy(faceRest).slerp(faceLensQ, a);
    setMood(head, a > 0.25 ? mood : 'rest');
  }
  // 평상시 0을 지키지 않으면 경기가 안 읽힌다. 고개는 사건이 터진 동안에만 돈다.
  const FACE_TURN = {
    catch: 0.72, save: 0.78, carriedIn: 0.88, gloveGone: 0.74, spill: 0.6,
    downed: 0.88, rebound: 0.6, reboundMiss: 0.62, charge: 0.52, beat: 0.5,
    lost: 0.66, skied: 0.58, talked: 0.9, distracted: 0.8, openGoalScored: 0.8
  };
  const FACE_MOOD = {
    catch: 'grin', save: 'grin', carriedIn: 'shock', gloveGone: 'shock',
    spill: 'shock', downed: 'shock', rebound: 'shock', reboundMiss: 'shock',
    charge: 'grin', beat: 'shock', lost: 'shock', skied: 'shock',
    talked: 'heart', distracted: 'heart', openGoalScored: 'shock'
  };
  // 머리 위로 떠오르는 하트 셋. 눈동자만 하트로 바꾸면 고개가 돌아간 순간 얼굴이 뒤를 보고 있어 안 읽힌다.
  // 정지 화면 한 장에서 한눈팔림을 알리는 픽셀은 이것뿐이다.
  const heartShape = new THREE.Shape();
  heartShape.moveTo(0, -0.5);
  heartShape.bezierCurveTo(0.9, 0.35, 0.45, 1.05, 0, 0.5);
  heartShape.bezierCurveTo(-0.45, 1.05, -0.9, 0.35, 0, -0.5);
  // 6분할은 로브를 각진 조각으로 잘라 하트가 아니라 미해결 폴리곤으로 읽혔다.
  const heartGeo = new THREE.ShapeGeometry(heartShape, 24);
  // 셋이 같은 색 같은 평면에 겹쳐 한 덩어리로 뭉쳤다. 어두운 테두리가 있어야 셋으로 세어진다.
  const heartEdgeMat = new THREE.MeshBasicMaterial({ color: 0x3a0d1c });
  const hearts = [];
  for (let i = 0; i < 3; i += 1) {
    const h = new THREE.Mesh(heartGeo, heartMat);
    const edge = new THREE.Mesh(heartGeo, heartEdgeMat);
    edge.scale.setScalar(1.24);
    edge.position.z = -0.004;
    edge.userData.probeIgnore = true;
    h.add(edge);
    h.visible = false;
    h.userData.probeIgnore = true;
    scene.add(h);
    hearts.push(h);
  }
  // 하트를 띄우는 사건 두 종. 이 밖에서는 항상 꺼져 있어야 한다.
  function showHearts(on, at, e) {
    for (const [i, h] of hearts.entries()) {
      h.visible = on;
      if (!on) continue;
      const u = (e * 1.6 + i * 0.33) % 1;
      // 0.26 간격은 하트 폭보다 좁아 셋이 한 덩어리로 붙었다.
      // 깊이까지 같으면 테두리와 몸이 z-파이팅으로 대각선 이음매를 낸다. 렌즈 쪽으로 층을 벌린다.
      h.position.set(at.x + (i - 1) * 0.4 + Math.sin(u * 6 + i) * 0.07, at.y + 0.38 + u * 0.22, at.z - 0.1 - i * 0.05);
      h.scale.setScalar((0.24 + i * 0.04) * (1 - u * 0.3));
      h.quaternion.copy(camera.quaternion);
    }
  }
  // 공이 들어간 사건들. 자막이 아니라 화면이 먼저 알려야 한다.
  const CONCEDE = new Set(['carriedIn', 'gloveGone', 'downed', 'openGoalScored', 'talked', 'distracted']);
  // 흰 플래시 한 장 다음 색이 빠진다. 캔버스 필터로 걸면 GPU 한 패스가 더 붙고 프로그램 수가 는다.
  // DOM 한 겹이 더 싸고, 프레이밍 측정에도 손을 안 댄다.
  const flashEl = document.getElementById('flash');
  const stampEl = document.getElementById('stamp');
  // 흰 장은 0.42초 만에 끝난다. 그 뒤 화면에는 골이 들어갔다는 표시가 하나도 남지 않았다.
  // 자막은 크로스바 위에 작게 뜨고 아무도 안 읽는다. 가운데에 크게 한 번 찍는다.
  const STAMP = {
    carriedIn: '같이 들어감', gloveGone: '장갑째 골', downed: '깔려서 골',
    openGoalScored: '빈 골대에 골', talked: '수다 떨다 골', distracted: '한눈팔다 골'
  };
  function flash(kind) {
    if (flashEl) {
      flashEl.classList.remove('hit');
      // 리플로우를 한 번 강제하지 않으면 연속 실점에서 두 번째가 안 보인다.
      void flashEl.offsetWidth;
      flashEl.classList.add('hit');
    }
    if (!stampEl) return;
    stampEl.textContent = STAMP[kind] || '먹혔다';
    stampEl.classList.remove('hit');
    void stampEl.offsetWidth;
    stampEl.classList.add('hit');
  }
  // 공이 손에 박히는 사건과 몸이 땅에 떨어지는 사건.
  // 슛 소리 다음 결과 연출 5초가 통째로 무음이었다. 효과음이 안 난다는 신고의 정체는 그것이다.
  const GRAB = new Set(['catch', 'save', 'spill', 'gloveGone', 'charge']);
  const SHOT = new Set(['rebound', 'reboundMiss', 'skied', 'openGoalScored']);
  const THUD = new Set(['carriedIn', 'downed', 'lost']);
  const DRIB = new Set(['charge', 'beat']);
  // 손을 안 대고 그냥 들어간 공. 가장 흔한 결과인데 여기가 통째로 무음이었다.
  // 손끝을 스치는 사건이라 박히는 소리는 안 난다. 그물이 받는 소리 하나다.
  const NET = new Set(['miss']);
  function act(kind) {
    // 장갑에 박히는 것은 가죽이 눌리는 소리다. 슛이 발에 맞는 것과 같은 재질이고 세기만 다르다.
    if (GRAB.has(kind)) sfx.kick(0.12);
    // 다시 차는 사건은 새 슛이다. 리바운드도 빈 골대로 미는 것도 발에 맞는 순간이 있다.
    else if (SHOT.has(kind)) sfx.kick(0.5);
    // 몸이 흙바닥에 떨어진다. 발이 세게 디디는 소리와 같은 마른 충격음이다.
    else if (THUD.has(kind)) sfx.step(true);
    // 드리블은 잡는 순간과 겹친다. 잡자마자 바닥에 튀기며 나가는 것이다.
    if (DRIB.has(kind)) sfx.dribble();
    if (NET.has(kind)) sfx.place();
    if (kind === 'gloveGone') {
      const gi = keeper.position.x > 0 ? 1 : 0;
      const gl = keeper.userData.gloves[gi];
      scene.attach(gl);
      loose = gl;
      keeper.userData.bareHands[gi].visible = true;
    }
    tail = { kind, t0: vnow, from: ball.position.clone(), kx: keeper.position.x };
    // 장갑이 벗겨진 자리가 접촉점이다. 이 좌표를 여기서 잡아 두지 않으면
    // 뒤에서 장갑은 이미 공을 따라 움직이고 있어 손이 어디였는지 알 길이 없다.
    if (kind === 'gloveGone' && loose) tail.gw = loose.getWorldPosition(new THREE.Vector3());
    // 앞 사건에서 뜬 하트가 다음 사건까지 남으면 선방하면서 반한 것으로 읽힌다.
    for (const h of hearts) h.visible = false;
    // 사건이 난 뒤에는 연출이 행인을 몰고 간다. 걸어오던 보간을 끄지 않으면 둘이 서로 당긴다.
    if (passers[0]) passers[0].userData.gaze = 0;
    // 사건마다 무게가 다르다. 선방과 실점이 같은 톤으로 지나가면 둘 다 아무 일도 아니게 된다.
    // 히트스톱은 손이 닿은 순간에만 준다. 공이 그냥 지나간 사건에 걸면 정지가 이유 없이 읽힌다.
    const HIT = { save: 0.13, catch: 0.13, gloveGone: 0.16, carriedIn: 0.14, spill: 0.10, downed: 0.12 };
    // 손이 닿은 사건은 그 자리에서 흙이 뜨고 흰 선이 터진다. 공이 그냥 지나간 사건에는 아무것도 없다.
    const BURST = { save: 1.0, catch: 0.8, gloveGone: 1.15, carriedIn: 1.1, spill: 0.85, downed: 1.0 };
    // 사건 이름을 모르면 화면만 보고는 무슨 일이 난 건지 모른다. 한 단어로 적어준다.
    // 문장을 넣으면 자막과 같은 것이 두 개가 되어 둘 다 안 읽힌다.
    const WORD = { save: '퍽!', catch: '꽉!', gloveGone: '어?', carriedIn: '으어', spill: '툭', downed: '으악' };
    // 사건이 선언되는 순간 공은 아직 킥 지점 근처에 있다. 거기서 터뜨리면 글자가 키커 머리 위에 뜬다.
    // 손이 닿은 사건은 닿은 자리, 즉 장갑에서 터진다. 나머지는 골라인 앞 키퍼 자리다.
    if (BURST[kind]) {
      const gi = keeper.userData.gloves[keeper.position.x >= 0 ? 1 : 0];
      const at = gi ? gi.getWorldPosition(new THREE.Vector3()) : keeper.position.clone().setY(1.2);
      impact.burst(at, BURST[kind], WORD[kind] || '');
    }
    // 웃겨야 하는 사건에만 렌즈를 기울인다. 선방까지 기울이면 매 구 화면이 비뚤어져 기울기가 안 읽힌다.
    const TILT = { gloveGone: 0.13, carriedIn: -0.14, downed: 0.15, talked: -0.11, distracted: 0.1, beat: -0.12, lost: 0.12 };
    if (TILT[kind]) tilt(TILT[kind], 0.9);
    // 흔들림은 실점이 가장 크다. 골이 들어간 것이 화면에서 제일 큰 사건이어야 한다.
    const SHK = {
      save: [0.045, 0.34], catch: [0.032, 0.28], gloveGone: [0.055, 0.42],
      carriedIn: [0.062, 0.5], downed: [0.058, 0.44], spill: [0.03, 0.26],
      openGoalScored: [0.062, 0.5], talked: [0.02, 0.3], distracted: [0.02, 0.3],
      beat: [0.05, 0.4], lost: [0.05, 0.4]
    };
    if (HIT[kind]) stopLeft = HIT[kind];
    const s = SHK[kind];
    if (s) shake(s[0], s[1]);
    // 실점은 화면이 한 번 하얗게 튄 다음 색이 빠진다. 결과를 글자로만 알리면 글자를 안 읽는다.
    if (CONCEDE.has(kind)) flash(kind);
  }
  function play(shot, input, result, onEnd) {
    tail = null;
    cue = { shot, input, result, t0: vnow, ended: false, onEnd, steps: 0, struck: false, framed: false };
    trail.length = 0;
    for (const g of ghosts) g.visible = false;
    ball.scale.set(1, 1, 1);
    kicker.position.set(VIEW_X * shot.aimX * SX * 0.2 + KICKER_OFF, 0, 11.2);
    kicker.userData.startX = kicker.position.x;
    ball.position.set(0, BALL_R, 11);
    // 카메라는 골대 뒤 위에 있고 크로스바는 골대 전체 폭을 가로지르는 봉이다.
    // 그래서 바에 가린 공은 옆으로 밀어도 그대로 가려 있다. 떨어지는 것은 높이뿐이다.
    // 상단 코스는 비행 선이 시선과 거의 나란해져 바 뒤를 계속 따라간다.
    // 포물선을 키워 시선을 가로지르게 만든다.
    cue.arc = 0.3 + (shot.aimY > 1.0 ? 0.85 : 0);

    // 눈에 띄는 행인은 매 구 있지 않다. 그 구에만 앞줄로 걸어온다.
    for (const p of passers) { p.position.z = p.userData.homeZ; p.userData.gaze = 0; }
    // 눈에 띄는 행인은 매 구 있지 않다. 그 구에만 앞줄로 걸어온다.
    // 좌표를 바로 박으면 순간이동이다. 펜스 쪽에서 걸어서 들어와야 키퍼가 본 것이 된다.
    if (shot.gaze) { passers[0].position.set(-17, 0, 29); passers[0].userData.gaze = 0.001; }
    sfx.place();
  }

  function frame() {
    // 실시간과 세계시간을 나눈다. 히트스톱은 세계시간만 늦춘다.
    // 렌더 루프까지 멈추면 브라우저가 프레임을 놓친 것과 구분되지 않는다.
    const real = performance.now() / 1000;
    // 탭이 백그라운드로 갔다 오면 dt가 몇 초로 들어와 연출이 한 프레임에 끝난다.
    let dt = Math.min(0.05, Math.max(0, real - realLast));
    realLast = real;
    if (stopLeft > 0) {
      stopLeft -= dt;
      dt *= HIT_SCALE;
    }
    vnow += dt;
    actor.keeper = keeper;
    actor.kicker = kicker;
    // 이번 프레임에 무엇을 연기할지. 결과는 이미 확정됐고 여기서는 각도만 고른다.
    let kp = POSES.ready;
    let kk = POSES.windup;
    // 발밑 높이는 상수로 못 낸다. 관절이 돌면 몸의 최저점이 매 프레임 바뀐다.
    // 원하는 높이를 여기 적고, 실제 접지는 프레임 끝에서 실측해서 맞춘다.
    let hover = 0;
    if (cue) {
      const t = vnow - cue.t0;
      const { shot, input, result } = cue;
      const runup = 0.55;
      const flight = shot.flight;

      const diveSide = Math.sign(VIEW_X * input.dive);
      const divePose = diveSide > 0 ? POSES.diveR : POSES.diveL;
      kp = t < runup ? POSES.brace : (input.dive === 0 ? POSES.brace : divePose);
      // 차는 동작은 네 구간이다. 달리기, 반대로 접는 예비, 임팩트, 끝까지 넘어가는 팔로스루.
      // 예비와 팔로스루를 뺀 발은 공을 차는 게 아니라 공 옆에 서 있는 것으로 읽힌다.
      const swing = t - runup;
      kk = swing < -0.13 ? POSES.windup
        : (swing < 0 ? POSES.plant : (swing < 0.1 ? POSES.strike : POSES.follow));
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
          kickPop = 0.07;
          shake(0.05 + shot.kicker.power * 0.004, 0.12);
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
        // 진행축 스트레치는 여기서 안 쓴다. 공은 카메라를 향해 오므로 진행축이 시선축과 거의 나란하고,
        // 그 방향으로 늘려봐야 화면에는 크기 변화로만 나타난다. 속도는 잔상이 대신 말한다.
        // 대신 발에 맞은 직후에만 짜부라진다. 이건 시선축과 무관해서 화면에 그대로 보인다.
        // 0.5초는 공이 계속 찌그러진 채로 날았다. 0.13초가 맞은 순간으로만 읽힌다.
        const sq = Math.max(0, 1 - (t - runup) / 0.13);
        ball.scale.set(1 + sq * 0.5, 1 - sq * 0.34, 1 + sq * 0.5);
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
        // 꼬리가 시작되면 키퍼의 몸은 꼬리 것이다. 큐가 계속 밀면 일어서라는 코드가 있어도 그 자리에 눌려 있는다.
        if (!tail) {
          const dp = Math.min(1, Math.max(0, (t - runup - flight * 0.28) / (flight * 0.7)));
          const span = Math.min(R_HALF_W - 0.5, 1.05 + 0.06 * cueKeeperDiving());
          keeper.position.x = lerp(0, VIEW_X * input.dive * span, ease(dp));
          keeper.position.z = lerp(KEEPER_Z, KEEPER_Z + input.advance, ease(Math.min(1, dp * 1.4)));
          // 관절이 뻗는 방향을 이미 보여주므로 몸통 회전은 거들기만 한다.
          keeper.rotation.z = lerp(0, VIEW_X * -input.dive * 0.86, ease(dp));
          hover = Math.sin(ease(dp) * Math.PI) * (input.dive === 0 ? 0.05 : 0.40);
        }

        if (p >= 1 && !cue.ended && t - runup > flight + 0.9) {
          cue.ended = true;
          cue.onEnd();
        }
      }
    }
    if (tail) {
      const u = Math.min(1, (vnow - tail.t0) / 0.8);
      const e = ease(u);
      tailRamp = ease(Math.min(1, u * 2.5));
      // 공이 붙는 자리는 선언이 아니라 장갑의 실제 월드 좌표다.
      // 키퍼 좌표에 상수를 더하면 몸이 기울어 있을 때 공이 장갑 옆 허공에 뜬다.
      const gloveWorld = (sgn) => {
        const gl = keeper.userData.gloves[sgn > 0 ? 1 : 0];
        return gl ? gl.getWorldPosition(new THREE.Vector3()) : keeper.position.clone();
      };
      const gx = keeper.position.x + Math.sign(tail.kx || 1) * 0.1;
      const bySide = (r, l) => Math.sign(tail.kx || 1) > 0 ? r : l;
      // 꼬리 연출의 포즈. 사건마다 몸이 다르게 망가져야 사건이 구분된다.
      // 같은 포즈를 두 사건이 나눠 쓰면 자막을 지웠을 때 두 컷이 같은 그림이 된다.
      const TAIL_POSE = {
        catch: POSES.clutch, save: POSES.snatch, carriedIn: POSES.hugfall,
        gloveGone: bySide(POSES.reachR, POSES.reachL),
        spill: bySide(POSES.swatR, POSES.swatL),
        downed: POSES.faceplant,
        rebound: bySide(POSES.shoveR, POSES.shoveL),
        reboundMiss: bySide(POSES.sprawlR, POSES.sprawlL),
        charge: POSES.dribble, beat: POSES.stumble,
        lost: POSES.faceplant, skied: POSES.brace,
        talked: POSES.swoon, distracted: POSES.swoon, openGoalScored: POSES.faceplant
      };
      kp = TAIL_POSE[tail.kind] ?? kp;
      // 몸이 바닥에 닿는 순간 한 번만 흙을 판다. 매 프레임 칠하면 자국이 아니라 진흙탕이 된다.
      // 자국은 몸통이 아니라 뻗은 팔이 닿는 자리에 남는다. 장갑의 실제 좌표로 찍어야
      // 왼쪽으로 뛴 구와 오른쪽으로 뛴 구가 땅에서 다른 자리로 갈린다.
      if (!tail.scuffed && u > 0.45 && SCUFF_POSES.has(kp)) {
        tail.scuffed = true;
        const hit = gloveWorld(Math.sign(tail.kx || 1));
        pitch.box.userData.mark(hit.x, hit.z, Math.sign(tail.kx || 1) * 0.4, 0.62,
          WRECK_POSES.has(kp) ? 1 : 0.7);
      }
      // 키퍼만 사건마다 다르게 망가지고 키커는 매번 같은 준비 자세로 돌아갔다.
      // 정지 프레임 넷을 나란히 놓으면 키커가 복사 붙여넣기로 읽힌다. 결과를 키커도 안다.
      const KICKER_TAIL = {
        catch: POSES.despair, save: POSES.despair, skied: POSES.despair,
        rebound: POSES.despair, lost: POSES.dribble, beat: POSES.dribble,
        carriedIn: POSES.cheer, gloveGone: POSES.cheer, spill: POSES.cheer,
        downed: POSES.cheer, reboundMiss: POSES.cheer,
        talked: POSES.cheer, distracted: POSES.cheer, openGoalScored: POSES.cheer
      };
      kk = KICKER_TAIL[tail.kind] ?? kk;
      switch (tail.kind) {
        case 'catch':
        case 'save':
          // 잡았으면 공이 장갑에 붙는다. 몸은 일어선다.
          // 손이 어디 있든 공은 거기 있어야 한다. 그래야 잡았다는 말이 화면에서 사실이 된다.
          {
            const gw = gloveWorld(Math.sign(tail.kx || 1));
            // 0.8초에 걸쳐 붙이면 대부분의 프레임에서 공이 장갑에서 떨어져 있다.
            // 잡는 것은 순간이다. 손이 닿는 구간은 130ms 안에 끝나고 나머지 시간은 붙은 채로 간다.
            const grab = ease(Math.min(1, u * 6));
            // 장갑 중심에 공 중심을 맞추면 공이 손 안으로 파묻힌다. 공 반경만큼 카메라 쪽으로 내놓는다.
            ball.position.set(lerp(tail.from.x, gw.x, grab), lerp(tail.from.y, gw.y, grab), lerp(tail.from.z, gw.z - BALL_R, grab));
          }
          keeper.rotation.z = lerp(keeper.rotation.z, 0, 0.08);
          break;
        case 'carriedIn': {
          // 막았는데 같이 넘어간다. 공과 몸이 한 덩어리로 골망까지 간다.
          keeper.position.z = lerp(KEEPER_Z, -0.35, e);
          keeper.rotation.z = lerp(keeper.rotation.z, Math.sign(keeper.rotation.z || 1) * 1.35, 0.08);
          hover = 0.06;
          // 공을 키퍼 좌표에서 띄우면 엎드린 몸 밖, 하필이면 부츠 옆 땅에 놓인다.
          // 그러면 안고 넘어간 것이 아니라 발치에 공이 굴러온 것으로 읽힌다.
          // 장갑에 붙이는 것도 틀렸다. hugfall은 팔뚝을 키커 쪽으로 접는 포즈라
          // 장갑이 머리 옆에 온다. 깊이만 몸통 앞으로 당겨도 x와 y가 두개골 안이라
          // 공이 머리 구에 통째로 박힌다. 실측: 공 화소 일곱 개의 임자가 전부 keeper였다.
          // 안은 자리는 손이 아니라 가슴이다. 골반과 목의 실제 월드 좌표 사이를 잡고
          // 거기서 몸통 반경과 공 반경만큼 카메라 쪽으로 내놓는다.
          {
            const j = keeper.userData.joints;
            const hipW = j.spine.getWorldPosition(new THREE.Vector3());
            const neckW = j.neck.getWorldPosition(new THREE.Vector3());
            // 0.55는 목 바로 아래다. 옆으로 누운 몸에서 그 점은 화면상 머리와 붙어버려
            // 공과 머리가 같은 크기의 검은 테두리 원 두 개로 읽혔다. 명치까지 내리면 갈린다.
            const chest = hipW.lerp(neckW, 0.28);
            const hug = ease(Math.min(1, u * 6));
            ball.position.set(
              lerp(tail.from.x, chest.x, hug),
              lerp(tail.from.y, Math.max(chest.y, BALL_R + 0.02), hug),
              lerp(tail.from.z, chest.z - (keeper.userData.girth * 0.55 + BALL_R), hug)
            );
          }
          break;
        }
        case 'gloveGone': {
          // 장갑이 공에 딸려 간다. 손이 하나 없는 채로 남는다.
          // 손을 거치지 않고 골로 흘러가면 장갑이 왜 벗겨졌는지가 화면에 없다.
          // 먼저 공을 장갑 자리로 당겨 붙이고, 그 자리에서 골망으로 보낸다.
          {
            const P = tail.gw ?? tail.from;
            const c = ease(Math.min(1, u * 5));
            const f = ease(Math.max(0, (u - 0.2) / 0.8));
            const cx = lerp(tail.from.x, P.x, c);
            const cy = lerp(tail.from.y, P.y, c);
            const cz = lerp(tail.from.z, P.z, c);
            ball.position.set(lerp(cx, P.x * 1.15, f), lerp(cy, REST_Y, f), lerp(cz, REST_Z, f));
          }
          if (loose) {
            // 장갑은 공에 딸려 간다. 0.3만큼 띄웠더니 장갑과 공이 따로 날아가는 것으로 읽혔다.
            // 공에 닿을 만큼 붙이고 회전만 따로 준다.
            // 공에 딱 붙어 같이 가면 공에 노란 스티커를 붙인 것으로 읽힌다.
            // 반 박자 뒤처지게 끌리고 크게 돌아야 딸려 가는 중인 것이 보인다.
            // 0.12 지연은 장갑이 손 자리에 남아 공만 날아간 것으로 보였다. 한 뼘만 뒤처지게 한다.
            // 처음 한 박자만 뒤처지고 다시 공에 붙는다. 끝까지 떨어져 있으면 공과 상관없는 노란 카드로 읽힌다.
            const lag = ease(Math.min(1, u * 2.2));
            const cling = ease(Math.min(1, Math.max(0, (u - 0.3) / 0.4)));
            const off = 1 - cling * 0.78;
            loose.position.set(
              lerp(tail.from.x, ball.position.x, lag) + 0.1 * off,
              lerp(tail.from.y, ball.position.y, lag) + (0.14 + Math.sin(u * Math.PI) * 0.22) * off,
              lerp(tail.from.z, ball.position.z, lag) + 0.12 * off
            );
            loose.rotation.z += 0.62 * (1 - cling * 0.6);
            loose.rotation.x += 0.41 * (1 - cling * 0.6);
          }
          break;
        }
        case 'spill':
          // 흘렸다. 공이 옆으로 튀어나가 아직 살아 있다.
          ball.position.set(lerp(tail.from.x, tail.from.x + (tail.kx >= 0 ? 1.5 : -1.5), e), 0.14 + Math.abs(Math.sin(u * 9)) * 0.5 * (1 - u), lerp(tail.from.z, 3.2, e));
          break;
        case 'downed': {
          keeper.rotation.z = lerp(keeper.rotation.z, Math.sign(keeper.rotation.z || 1) * 1.5, 0.06);
          hover = 0.04;
          // 공이 몸과 상관없는 자리로 혼자 굴러갔다. 자막은 깔렸다는데 공은 반대편 허공을 지나갔다.
          // 경로의 중간 지점을 쓰러진 몸에 묶는다. 몸 위를 타고 넘어가야 한 사건으로 읽힌다.
          const bx = keeper.position.x;
          const bz = keeper.position.z;
          const over = ease(Math.min(1, u / 0.45));
          const past = ease(Math.max(0, (u - 0.45) / 0.55));
          const crossed = u > 0.45;
          ball.position.set(
            crossed ? lerp(bx, bx * 0.35, past) : lerp(tail.from.x, bx, over),
            (crossed ? lerp(0.44, REST_Y, past) : lerp(tail.from.y, 0.44, over)) + Math.sin(Math.min(1, u / 0.9) * Math.PI) * 0.15,
            crossed ? lerp(bz, REST_Z, past) : lerp(tail.from.z, bz, over)
          );
          break;
        }
        case 'rebound':
          ball.position.set(lerp(tail.from.x, 0.6, e), lerp(tail.from.y, REST_Y, e), lerp(tail.from.z, REST_Z, e));
          break;
        case 'reboundMiss':
          // 튀어나간 공이 골대 옆으로 흘러난다. 프레임 밖으로 보내면 어디로 갔는지 안 보인다.
          ball.position.set(lerp(tail.from.x, tail.kx >= 0 ? 2.9 : -2.9, e), 0.14 + Math.abs(Math.sin(u * 8)) * 0.45 * (1 - u), lerp(tail.from.z, 3.2, e));
          break;
        case 'charge':
          // 잡고 나서 드리블하러 나간다. 공이 발 앞에서 튄다.
          // 다이빙에서 넘어온 기울기가 남으면 달려 나가는 게 아니라 자빠지는 것으로 읽힌다.
          keeper.rotation.z = lerp(keeper.rotation.z, 0, 0.62);
          // z=6.5까지 보내면 키퍼가 골대 그물 너머 원경에 파묻히고 공이 몇 픽셀로 줄어든다.
          // 나갔다는 사실은 페널티 박스를 벗어나는 것으로 이미 읽힌다. 근경에 세운다.
          keeper.position.z = lerp(KEEPER_Z, CHARGE_Z, e);
          // 카메라가 골대 뒤에 있으므로 키퍼보다 먼 자리에 둔 공은 무조건 등에 가려진다.
          // 드리블하는 공은 카메라 쪽 발 옆으로 온다. 그래야 몸과 안 겹치고 발 옆으로 읽힌다.
          ball.position.set(keeper.position.x + 0.78, 0.14 + Math.abs(Math.sin(u * 12)) * 0.42, keeper.position.z - 0.34);
          break;
        case 'beat':
          keeper.position.z = lerp(CHARGE_Z, CHARGE_Z + 5.2, e);
          keeper.rotation.z = lerp(keeper.rotation.z, Math.sin(u * 16) * 0.12, 0.34);
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
          const walk = Math.min(1, e * 1.5);
          keeper.position.x = lerp(tail.kx, -2.4, walk);
          keeper.position.z = lerp(KEEPER_Z, 3.1, walk);
          keeper.rotation.z = Math.sin(e * 12) * 0.09;
          {
            // 하트가 키퍼 머리 위로만 뜨니 크로스바를 넘어 하늘에 떠다니는 점 두 개로 보였다.
            // 두 사람 사이에 두어야 누구에게 반한 것인지가 화면에 남는다.
            const hk = keeper.userData.head.getWorldPosition(new THREE.Vector3());
            const hp = passers[0] ? passers[0].getWorldPosition(new THREE.Vector3()) : null;
            // 중점을 그대로 쓰니 하트 세 개가 키퍼 얼굴을 덮었다. 반한 얼굴이 안 보이면
            // 한눈팔기라는 사건 자체가 화면에 안 남는다. 두 머리 바로 위로 올린다.
            // 0.42를 올렸더니 하트가 화면 위로 잘렸다. 잘린 하트는 붉은 얼룩이다.
            // 더 올리면 크로스바가 하트를 가로지른다.
            // 두 머리의 눈높이로 내리면 가로대에 걸리지 않는다.
            if (hp) hk.set((hk.x + hp.x) / 2, Math.min(hk.y, hp.y + 1.5) - 0.1, (hk.z + hp.z) / 2 - 0.2);
            showHearts(true, hk, e);
          }
          if (passers[0]) {
            // 1.2만큼 떨어뜨렸더니 두 캡슐이 화면에서 한 덩어리로 붙었다. 사람이 둘이라는 것부터 안 읽혔다.
            // 한 걸음 더 벌리고, 서로 마주 보게 돌린다. 등을 돌린 채 하트만 뜨면 누구에게 반한 것인지 모른다.
            // z 4.9는 크로스바 선 위였다. 머리가 골대 가로대에 잘려 얼굴이 반만 남았다.
            // 카메라 쪽으로 당기면 가로대 아래로 내려오고 얼굴도 커진다. 키퍼(0.9)보다는 멀리 둔다.
            passers[0].position.set(lerp(-11.5, -1.15, walk), 0, lerp(18, 3.3, walk));
            // 카메라는 골대 뒤에서 +z를 본다. 이 각도가 음수면 행인은 렌즈에 등을 진다.
            // 얼굴을 붙여놓고도 화면에는 뒤통수만 남았다. 걸어오는 방향(2.44)에서
            // 키퍼 쪽(3.02)으로 틀어야 눈과 볼이 렌즈에 들어온다.
            passers[0].rotation.y = lerp(2.44, 3.02, walk);
            passers[0].rotation.z = Math.sin(e * 9) * 0.18;
          }
          // 카메라는 골대 뒤에서 +z를 본다. 키퍼가 그대로 서 있으면 뒤통수가 하트 눈을 가린다.
          // 한눈판 얼굴이 안 보이면 그 사건 자체가 화면에 없다.
          keeper.rotation.y = lerp(0, 2.48, walk);
          ball.position.set(lerp(tail.from.x, 0, e), lerp(tail.from.y, REST_Y, e), lerp(tail.from.z, REST_Z, e));
          break;
        }
        case 'distracted': {
          // 카메라가 아니라 고개가 돌아간다. 머리가 돌아가 있는 동안 공은 그대로 지나간다.
          const head = keeper.userData.head;
          showHearts(true, head.getWorldPosition(new THREE.Vector3()), e);
          ball.position.set(lerp(tail.from.x, tail.from.x * 1.3, e), lerp(tail.from.y, REST_Y, e), lerp(tail.from.z, REST_Z, e));
          break;
        }
        case 'openGoalScored':
          ball.position.set(lerp(tail.from.x, 0, e), lerp(tail.from.y, REST_Y, e), lerp(tail.from.z, REST_Z, e));
          break;
        default:
          break;
      }
      // 공이 그물에 닿는 순간. 판정이 아니라 좌표 하나를 읽는 것뿐이다.
      if (!tail.netDone && ball.position.z <= pitch.netZ + 0.5 && CONCEDE.has(tail.kind)) {
        tail.netDone = true;
        // 그물은 울리지 않는다. 마른 마찰 한 겹과 짧은 저역이 전부다.
        sfx.place();
        netAmp = 0.4;
        netT = 0;
        netX = ball.position.x;
        netY = ball.position.y - R_H / 2;
        impact.burst(ball.position, 0.9, '출렁');
        shake(0.03, 0.22);
      }
      shadow.position.set(ball.position.x, 0.02, ball.position.z);
      const lift2 = Math.max(0, ball.position.y - BALL_R);
      shadow.scale.setScalar(1 + lift2 * 0.55);
      shadow.material.opacity = Math.max(0.06, 0.42 - lift2 * 0.14);
    }
    // 잡히는 속도는 사건마다 다르다. 자빠짐은 빠르고 회복은 느리다.
    drive('keeper', kp, WRECK_POSES.has(kp) ? 0.22 : (SCRAMBLE_POSES.has(kp) ? 0.26 : 0.12));
    // 예비는 느리게 잡혀야 버틴 것으로 보이고, 임팩트는 한 프레임에 가까워야 터진 것으로 보인다.
    drive('kicker', kk, kk === POSES.strike ? 0.62 : (kk === POSES.follow ? 0.24 : (kk === POSES.plant ? 0.16 : (kk === POSES.cheer ? 0.30 : 0.10))));
    // 닿는 순간에만 몸이 부풀어야 힘이 들어간 것으로 읽힌다. 길게 주면 몸집이 변한 것으로 보인다.
    kickPop = Math.max(0, kickPop - dt);
    const kpop = 1 + (kickPop > 0 ? Math.sin((kickPop / 0.07) * Math.PI) * 0.15 : 0);
    kicker.scale.setScalar(kpop);
    // 접지는 선언이 아니라 측정이다. 몸의 실제 최저점을 재서 원하는 높이에 맞춘다.
    keeper.position.y += hover - footY(keeper);
    // drive()가 목을 덮어쓰고, 위치 보정 전 월드행렬은 낡았다. 둘이 끝난 뒤에 고개를 돌린다.
    if (tail) applyFace(FACE_TURN[tail.kind] ?? 0.6, FACE_MOOD[tail.kind] ?? 'shock', tailRamp);
    else if (titleMode) applyFace(0.92, 'grin', 1);
    else applyFace(0, 'rest', 1);
    kicker.position.y += -footY(kicker);
    // 루트 피벗이 발밑이라 몸이 누우면 몸통은 옆으로 나가는데 그림자는 발밑에 남았다.
    // 회전으로 옮겨간 몸통 중심만큼 그림자를 같이 끌고 간다. 0.72는 화면에서 잰 중심 높이다.
    const leanX = -Math.sin(keeper.rotation.z) * 0.72;
    keeperShadow.position.set(keeper.position.x + leanX, 0.03, keeper.position.z);
    // 행인은 판정과 무관하게 계속 걷는다. 멈춘 배경은 그림이고 움직이는 배경은 장소다.
    for (const [i, p] of passers.entries()) {
      passerShadows[i].position.set(p.position.x, 0.03, p.position.z);
      // 반짝임은 돌면서 커졌다 작아진다. 고정된 마름모는 머리에 박힌 장식으로 읽힌다.
      if (p.userData.spark) {
        p.userData.spark.rotation.y = vnow * 2.4;
        p.userData.spark.scale.setScalar(0.8 + Math.sin(vnow * 6) * 0.25);
      }
      if (p.userData.gaze) {
        // 1.6초. 0.6초는 달려들어오는 것으로 보였고 3초는 슈팅이 끝나도 펜스 밖이었다.
        p.userData.gaze = Math.min(1, p.userData.gaze + dt / 1.6);
        const w = ease(p.userData.gaze);
        p.position.set(lerp(-17, -11.5, w), 0, lerp(29, 18, w));
        p.rotation.z = Math.sin(vnow * 9) * 0.13;
        continue;
      }
      p.position.x += p.userData.speed * 0.016;
      // 되돌리는 자리가 화면 안이면 순간이동이 그대로 보인다.
      // 행인이 서는 z에서 화면 반폭은 27.7m다. 26은 그 안이었다.
      if (p.position.x > 34) {
        p.position.x = -34;
        // 같은 줄로 돌아오면 다섯이 영원히 같은 순서로 지나간다.
        p.position.z = p.userData.homeZ + (p.userData.phase % 1) * 3.2 - 1.6;
      }
      p.rotation.z = Math.sin(performance.now() * 0.006 * p.userData.speed + p.userData.phase) * 0.06;
    }
    keeperShadow.scale.setScalar(1 + Math.abs(Math.sin(keeper.rotation.z)) * 0.8);
    kickerShadow.position.set(kicker.position.x, 0.03, kicker.position.z);
    // 잔상은 지나온 자리를 따라간다. 매 프레임 전부 옮기면 공이 여덟 개인 것으로 읽힌다.
    // 간격을 두 프레임으로 벌려 꼬리가 길어지게 한다.
    if (cue && !tail) {
      trail.unshift(ball.position.clone());
      if (trail.length > GHOSTS * 2) trail.length = GHOSTS * 2;
      for (let i = 0; i < GHOSTS; i++) {
        const p = trail[i * 2 + 2];
        const g = ghosts[i];
        g.visible = Boolean(p);
        if (p) {
          g.position.copy(p);
          // 화면상 크기 = 실제 크기 / 카메라 거리. 거리비를 곱하면 뒤 잔상도 공과 같은 크기로 보인다.
          const dg = g.position.distanceTo(CAM_BASE);
          const db = Math.max(0.01, ball.position.distanceTo(CAM_BASE));
          // 뒤로 갈수록 키우면 공보다 큰 노란 덩어리가 공 옆에 붙는다. 관객은 그것을 두 번째 공으로 읽는다.
          // 만화의 속도 꼬리는 뒤로 갈수록 가늘어진다. 앞머리만 공만 하고 끝은 점이다.
          g.scale.setScalar((dg / db) * (1 - i * 0.095));
        }
      }
      // 재질이 한 벌이라 투명도는 한 번만 정한다. 개별로 주려면 재질이 여덟 벌 필요하고 그건 예산 밖이다.
      // 0.2는 흙 위에서 사라졌다. 그렇다고 상수로 올리면 굴러오는 공에도 속도선이 붙어 늘 빠른 것으로 읽힌다.
      // 이번 프레임에 공이 간 거리로 정한다. 느리면 링이 없고 빠르면 진해진다.
      const step = trail.length > 1 ? trail[0].distanceTo(trail[1]) : 0;
      // 킥 직후에는 꼬리가 없다. 그런데도 링을 그리면 같은 자리에 여덟 장이 겹쳐
      // 발치에 노란 덩어리가 붙는다. 꼬리가 길어진 다음에만 켜다.
      const grown = trail.length >= GHOSTS * 2;
      ghostMat.opacity = grown ? Math.min(0.42, Math.max(0, (step - 0.04) * 4.2)) : 0;
    } else if (ghosts[0].visible) {
      for (const g of ghosts) g.visible = false;
    }

    // 흔들림을 먼저 얹고 그 카메라로 잰다. 흔들리기 전 카메라로 재면 게이트는 흔들림을 못 본다.
    // 측정 프레임만 빼는 것은 우회다. 게이트가 견딜 때까지 진폭을 줄이는 쪽이 맞다.
    camera.position.copy(CAM_BASE);
    if (shakeLeft > 0) {
      shakeLeft -= dt;
      // 감쇠 없이 흔들면 끝날 때 뚝 끊긴다. 남은 시간에 비례해 잦아든다.
      const k = shakeAmp * Math.max(0, shakeLeft / shakeSpan);
      // 사인 두 개를 정수비로 겹치면 규칙적인 원운동이 되고 카메라가 도는 것으로 읽힌다.
      camera.position.x += Math.sin(vnow * 61) * k;
      camera.position.y += Math.sin(vnow * 47 + 1.7) * k * 0.8;
      if (shakeLeft <= 0) shakeAmp = 0;
    }
    camera.lookAt(CAM_LOOK);
    if (titleMode) {
      // 골대 옆 낮은 곳에서 천천히 돌린다. 정면 고정 샷은 스크린샷이지 타이틀이 아니다.
      // 반경 9.5에 높이 2.0. 반경 5는 골대를 벗어나고 15는 선수가 점으로 작아졌다.
      const a = vnow * 0.16 + 0.5;
      camera.position.set(Math.sin(a) * 9.5, 2.0 + Math.sin(vnow * 0.4) * 0.35, 4.5 - Math.cos(a) * 9.5);
      camera.lookAt(0, 1.5, 5.5);
    }
    if (dutchLeft > 0) {
      dutchLeft -= dt;
      // 기울었다가 제자리로 돌아온다. 끝까지 기운 채로 두면 다음 구가 비뚤어진 채 시작한다.
      const k = dutch * Math.max(0, dutchLeft / dutchSpan);
      camera.rotateZ(k);
      if (dutchLeft <= 0) dutch = 0;
    }
    if (netAmp > 0.002) {
      netT += dt;
      netAmp *= Math.exp(-dt * 5.2);
      // 밀렸다가 되튄다. 진동수가 낮으면 천이 아니라 젤리다.
      pitch.net.userData.punch(netX, netY, -netAmp * Math.cos(netT * 19));
    } else if (netAmp !== 0) {
      netAmp = 0;
      pitch.net.userData.punch(0, 0, 0);
    }
    impact.update(dt, camera);
    if (cue) { ballProbe.sample(); stageProbe.sample(); }
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    // 두 번째 render 호출이 카운터를 0으로 되돌린다. 세계를 그린 값은 여기서 걷어야 한다.
    // 안 걷으면 예산 게이트가 전체 화면 사각형 한 장만 보고 통과시킨다.
    sceneCalls = renderer.info.render.calls;
    sceneTris = renderer.info.render.triangles;
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
  }
  let divingStat = 5;
  const cueKeeperDiving = () => divingStat;

  // 렌더러가 실제로 무엇을 그렸는지. 선언이 아니라 카운터다.
  // 포스트 패스 한 장이 아니라 세계 패스를 보고한다. 예산은 세계가 쓴다.
  // 화면에 실제로 선 것을 이름으로 세는 진단구. 코드를 읽어 추측하면 없는 GridHelper를 찾게 된다.
  window.__sceneRoot = () => scene;

  // 표정을 바꾸는 코드가 돌았다는 것과 표정이 화면에 있다는 것은 다른 주장이다.
  // 뒤통수를 향한 머리에 하트 눈을 넣어도 관객이 보는 것은 검은 반구다.
  window.__faceVis = () => faceToCamera(keeper.userData.head, camera, 1);

  // 사건이 다른데 실루엣이 같으면 관객은 같은 장면을 두 번 본다.
  // 선언된 오일러각이 아니라 캡처 순간의 관절 월드 좌표를 뽑는다.
  // 기울기와 위치까지 합쳐진 최종 몸이 화면에서 갈리는 것이고, 딕셔너리 비교로는 그게 안 잡힌다.
  window.__poseVis = () => {
    const j = keeper.userData.joints;
    keeper.updateMatrixWorld(true);
    const root = keeper.position;
    const w = new THREE.Vector3();
    j.spine.getWorldPosition(w);
    const scale = Math.max(0.2, w.distanceTo(root));
    const v = [];
    for (const n of JOINTS) {
      j[n].getWorldPosition(w);
      v.push((w.x - root.x) / scale, (w.y - root.y) / scale, (w.z - root.z) / scale);
    }
    return { v, rz: keeper.rotation.z, pos: [root.x, root.y, root.z] };
  };

  window.__renderInfo = () => ({
    calls: sceneCalls + 1,
    triangles: sceneTris + 2,
    programs: renderer.info.programs ? renderer.info.programs.length : 0
  });

  renderer.setAnimationLoop(frame);

  function reset() {
    cue = null;
    tail = null;
    if (loose) {
      const gi = keeper.userData.gloves.indexOf(loose);
      if (gi >= 0) keeper.userData.gloveParent[gi].add(loose);
      else scene.remove(loose);
      loose = null;
    }
    for (const b of keeper.userData.bareHands) b.visible = false;
    for (const h of hearts) h.visible = false;
    if (stampEl) stampEl.classList.remove('hit');
    for (const p of passers) { p.rotation.z = 0; p.rotation.y = 0; }
    keeper.userData.gloves.forEach((g, i) => { g.position.copy(keeper.userData.gloveHome[i]); g.rotation.set(0, 0, 0); });
    const head = keeper.userData.head;
    head.quaternion.identity();
    // 입 배율까지 되돌리지 않으면 다음 구가 벌어진 입으로 시작한다.
    setMood(head, 'rest');
    keeper.position.set(0, 0, KEEPER_Z);
    keeper.rotation.z = 0;
    keeper.rotation.y = 0;
    ball.position.set(0, BALL_R, 11);
    ball.scale.set(1, 1, 1);
    ball.rotation.set(0, 0, 0);
    trail.length = 0;
    for (const g of ghosts) g.visible = false;
    stopLeft = 0;
    kickPop = 0;
    kicker.scale.setScalar(1);
    shakeLeft = 0;
    shakeAmp = 0;
    dutchLeft = 0;
    dutch = 0;
    if (netAmp !== 0) { netAmp = 0; pitch.net.userData.punch(0, 0, 0); }
    shadow.position.set(0, 0.02, 11);
    shadow.scale.setScalar(1);
    shadow.material.opacity = 0.42;
    kicker.position.set(KICKER_OFF, 0, 11.2);
    kicker.rotation.z = 0;
    poseNow.keeper = POSES.ready;
    poseNow.kicker = POSES.windup;
    setPose(keeper, POSES.ready, 0);
    setPose(kicker, POSES.windup, 0);
  }
  reset();

  // 그림자가 화면 어디에 찍혔는지 눈으로 찍으면 틀린다. 카메라로 투영해서 받는다.
  const rectBox = new THREE.Box3();
  const rectV = new THREE.Vector3();
  function shadowRect(w = 1280, h = 720) {
    rectBox.setFromObject(keeperShadow);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < 8; i++) {
      rectV.set(
        (i & 1) ? rectBox.max.x : rectBox.min.x,
        (i & 2) ? rectBox.max.y : rectBox.min.y,
        (i & 4) ? rectBox.max.z : rectBox.min.z
      );
      rectV.project(camera);
      const px = (rectV.x * 0.5 + 0.5) * w;
      const py = (1 - (rectV.y * 0.5 + 0.5)) * h;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    return {
      x: Math.round(minX), y: Math.round(minY),
      w: Math.round(maxX - minX), h: Math.round(maxY - minY)
    };
  }


  // 그림자를 껐다 켠 두 프레임을 시간 진행 없이 같은 픽셀로 잰다.
  // 흰 라인도 비네트도 디더도 두 프레임에 똑같이 들어간다. 남는 차이가 그림자다.
  const pairRT = new THREE.WebGLRenderTarget(1280, 720);
  const pairBuf = new Uint8Array(1280 * 720 * 4);
  function shadowPair(boxes) {
    const read = () => {
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(pairRT);
      renderer.render(postScene, postCam);
      renderer.readRenderTargetPixels(pairRT, 0, 0, 1280, 720, pairBuf);
      return boxes.map((b) => {
        // 통계는 여기서 내지 않는다. 두 프레임을 화소 단위로 맞대여야
        // 그림자가 실제로 닿은 화소만 골라낼 수 있다.
        const px = [];
        for (let y = b.y; y < b.y + b.h; y++) {
          for (let x = b.x; x < b.x + b.w; x++) {
            const i = ((719 - y) * 1280 + x) * 4;
            px.push(0.299 * pairBuf[i] + 0.587 * pairBuf[i + 1] + 0.114 * pairBuf[i + 2]);
          }
        }
        return px;
      });
    };
    keeperShadow.visible = false;
    const off = read();
    keeperShadow.visible = true;
    const on = read();
    renderer.setRenderTarget(null);
    return { off, on };
  }
  return { play, act, reset, setKeeper, sfx, ballProbe, stageProbe, goalFrame, shadowRect, shadowPair,
    ballPos: () => ({ x: ball.position.x, y: ball.position.y, z: ball.position.z }),
    leaveTitle() { titleMode = false; },
    set diving(v) { divingStat = v; } };
}
