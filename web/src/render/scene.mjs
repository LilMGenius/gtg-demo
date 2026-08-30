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
import { pupilMat, buildKeeper, buildKicker, POSES, JOINTS, lerpPose, pushPose, setPose } from './objects/actors.mjs';
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
  // 알파를 전경 마스크로 쓴다. 아무것도 그려지지 않은 화소가 0이면 전경으로 읽힌다.
  renderer.setClearAlpha(1);
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
    // 배경과 인물에 같은 자를 대면 화면이 한 겹 필터로 읽힌다. 배경은 더 잘게 끊어 물러나고,
    // 인물은 굵게 끊어 색면이 남는다. 알파 채널이 둘을 가르는 마스크다.
    uniforms: { tDiffuse: { value: rt.texture }, steps: { value: 9.0 }, stepsFg: { value: 5.0 }, texel: { value: new THREE.Vector2(1 / 683, 1 / RT_H) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float steps; uniform float stepsFg; uniform vec2 texel; varying vec2 vUv;',
      'void main(){',
      // 색수차는 뺀다. 골포스트처럼 밝고 가는 세로선 옆에서는 폭을 아무리 줄여도
      // 채널이 한 텍셀 갈리는 순간 빨강과 청록 테두리가 서고, 그게 렌즈가 아니라
      // 인코딩이 깨진 화면으로 읽혔다. 저해상도와 계단은 이미 포스터라이즈가 말한다.
      '  vec2 d0 = vUv - 0.5;',
      '  vec4 src = texture2D(tDiffuse, vUv);',
      '  vec3 c = src.rgb;',
      // 전경 재질만 알파 0.25로 그린다. 나머지는 1.0이다. 임계 0.6은 그림자(0.62)가 겹친
      // 최악의 경우까지 계산해서 고른 값이다. 배경 위 그림자는 0.76으로 배경에 남고,
      // 전경 위 그림자는 0.48로 전경에 남는다.
      '  float fg = 1.0 - step(0.6, src.a);',
      // 이웃 네 텍셀 중 하나라도 전경이면 배경 쪽 화소에 잉크선이 선다. 인물 바깥에만 서므로
      // 얼굴 안쪽 디테일을 먹지 않는다. 패스를 하나 더 그리지 않고 실루엣을 얻는 방법이다.
      '  float a1 = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).a;',
      '  float a2 = texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).a;',
      '  float a3 = texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).a;',
      '  float a4 = texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).a;',
      '  float nb = 1.0 - step(0.6, min(min(a1, a2), min(a3, a4)));',
      '  float edge = clamp(nb - fg, 0.0, 1.0);',
      '  float st = mix(steps, stepsFg, fg);',
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
      // 디더는 배경에서 질감이고 인물 위에서는 때다. 인물 쪽 세기를 낮춘다.
      '  float qe = (max(floor((e + (n - 0.5) / st * mix(0.34, 0.12, fg)) * st), 0.0) + 0.5) / st;',
      '  float ql = pow(qe, 2.2);',
      // 나누는 밝기는 잡음을 타지 않은 원래 값이다. 잡음 섞인 값으로 나누면 색비가 픽셀마다 흔들린다.
      '  c *= ql / max(l, 0.001);',
      // 잉크선은 양자화 뒤, sRGB 인코딩 전에 곱한다. 인코딩 뒤에 곱하면 선이 회색으로 뜬다.
      '  c *= mix(1.0, 0.22, edge);',
      // 주사선. 한 줄 걸러 살짝 어둡게. 0.02는 안 보였고 0.11은 낮 경기가 밤이 됐다.
      // 인물 위를 같은 세기로 지나가면 얼굴에 줄무늬가 앉는다.
      '  c *= 1.0 - step(0.5, fract(gl_FragCoord.y * 0.5)) * 0.055 * (1.0 - fg * 0.6);',
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
  // drive()는 frame() 밖에 있어 이번 프레임의 dt를 직접 못 본다. 여기에 실어 보낸다.
  let stepDt = 0;
  let realLast = performance.now() / 1000;
  let stopLeft = 0;
  // 사건 선언 시점의 장갑 좌표는 다이빙 전 몸 옆이다. 공이 손에 붙는 것은 그 뒤 꼬리 연출 중이다.
  // 선언 순간에 터뜨리면 폭발이 접점이 아니라 허공에 뜨므로, 예약해 두고 접점에서 발화한다.
  let pendingBurst = null;
  // 계측용 정지. 세계시간만 멈추고 렌더는 계속 돈다.
  // 렌더까지 멈추면 대조군이 화면 갱신 자체를 못 보므로 계기의 잡음 바닥을 재지 못한다.
  let frozen = false;
  // 정지 중 화면이 바뀌면 렌더 프레임 수를 같이 봐야 프레임 단위 누적인지 가려진다.
  let frames = 0;
  // 세계시계 위의 타이머. setTimeout은 정지 중에도 깨어나 DOM을 다시 그리므로
  // 연출과 자막은 실시간이 아니라 이 목록으로 예약한다.
  const timers = new Map();
  let timerSeq = 0;
  function after(sec, fn) {
    const id = ++timerSeq;
    timers.set(id, { at: vnow + sec, fn });
    return id;
  }
  function cancel(id) {
    if (id != null) timers.delete(id);
  }
  function runTimers() {
    if (timers.size === 0) return;
    // 콜백이 다시 예약하므로 만기된 것만 먼저 떼어낸 뒤 부른다.
    let due = null;
    for (const [id, t] of timers) {
      if (t.at <= vnow) (due || (due = [])).push([id, t.fn]);
    }
    if (!due) return;
    for (const [id] of due) timers.delete(id);
    for (const [, fn] of due) fn();
  }
  let kickPop = 0;
  // 키퍼가 사건에 닿는 순간의 눌림. 키커의 kickPop과 같은 장치이고 대상만 다르다.
  let keeperPop = 0;
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

  // 전경 표시는 색이 아니라 알파다. 후처리가 이 값으로 인물과 배경을 갈라 다른 자를 댄다.
  const FG_A = 0.25;
  let fgOutline = null;
  const tagFg = (mat) => {
    if (mat.userData.fg) return mat;
    mat.userData.fg = true;
    mat.onBeforeCompile = (sh) => {
      const src = sh.fragmentShader;
      const i = src.lastIndexOf('}');
      if (i < 0) throw new Error('fg tag: no main close');
      sh.fragmentShader = src.slice(0, i) + '  gl_FragColor.a = ' + FG_A.toFixed(2) + ';' + String.fromCharCode(10) + src.slice(i);
    };
    // 이 키가 없으면 three가 같은 계열의 프로그램을 재사용하고 패치가 통째로 사라진다.
    mat.customProgramCacheKey = () => 'fg';
    mat.needsUpdate = true;
    return mat;
  };
  const markForeground = (root) => {
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      // 외곽선은 씬 전체가 한 벌을 공유한다. 여기서 칠하면 배경 외곽선까지 전경이 된다.
      // clone은 userData는 복사하지만 onBeforeCompile은 복사하지 않으므로 복제 직후 다시 태그한다.
      if (o.material.userData.shared) {
        if (!fgOutline) {
          fgOutline = o.material.clone();
          fgOutline.userData.shared = false;
          tagFg(fgOutline);
        }
        o.material = fgOutline;
        return;
      }
      o.material = tagFg(o.material);
    });
  };
  for (const p of passers) markForeground(p);

  const ball = new THREE.Mesh(ballGeo(BALL_R), flatVertex(0xfdfdf6));
  // 흰 공이 밝은 하늘 앞을 지나면 사라진다. 외곽선 하나가 그걸 끝낸다.
  jitterMesh(ball, 0.006, 5);
  addOutline(ball, 0.012);
  ball.userData.probeIgnore = true;
  scene.add(ball);
  // 카메라가 골대 뒤에 있어서 골라인 너머의 공은 크로스바와 그물과 키커 뒤로 들어간다.
  // 킥 직후가 정확히 그 구간이고, 비행 시작이 화면에서 통째로 사라진다.
  // 실측: 지름 33.9px로 그려진 공이 화소로는 23px만 남았다.
  // 공이 골라인 너머에 있는 동안만 깊이 검사를 끄고 위에 그린다. 그 구간에는 키퍼가 없다.
  // 외곽선 재질은 씬 전체가 한 벌을 공유하므로 공 것만 따로 떼어야 한 개만 끌 수 있다.
  const ballOutline = ball.children.find((c) => c.userData.isOutline);
  if (ballOutline) ballOutline.material = ballOutline.material.clone();
  // 공 외곽선은 깊이 검사를 따로 끄려고 이미 복제해 뒀다. 공유본 표시를 지워야
  // 전경 칠하기가 이것을 공유 외곽선으로 되돌리지 않는다.
  if (ballOutline) ballOutline.material.userData.shared = false;
  markForeground(ball);
  const OVERLAY_Z = 2;
  let overlay = false;
  const setOverlay = (on) => {
    if (on === overlay) return;
    overlay = on;
    ball.material.depthTest = !on;
    ball.renderOrder = on ? 7 : 0;
    if (ballOutline) {
      ballOutline.material.depthTest = !on;
      ballOutline.renderOrder = on ? 6 : -1;
    }
  };

  // 잔상. 공 한 개만 그리면 빠른 공과 느린 공이 같은 그림이 된다.
  // 공이 카메라를 향해 오므로 지나온 자리는 화면에서 공 뒤에 그대로 숨는다.
  // 그래서 원근 축소를 거리비로 되돌리고 거기서 더 키운다. 꼬리가 아니라 공을 감싸는 링으로 남는다.
  // 지오메트리는 한 벌, 재질은 여덟 벌이다. 같은 셰이더를 복제하면 three가 프로그램을 재사용하므로
  // 늘어나는 것은 유니폼뿐이다. 앞뒤 밝기가 같으면 여덟 장이 한 덩어리로 뭉쳐 꼬리가 아니라 얼룩이 된다.
  const GHOSTS = 12;
  // 구슬 여덟 개는 자취 위에 놓아도 구슬 여덟 개로 읽혔다. 만화가 속도를 그리는 형태는 점열이 아니라 한 줄기다.
  // 자취를 따라 좌우로 벌린 띠 하나로 잇고 꼬리로 갈수록 폭과 농도를 함께 줄인다.
  // 흰 띠는 흰 공 뒤에서도 흙 배경 위에서도 안 보였다. 노란색이라야 갈색 흙에서 남는다.
  const ribPos = new Float32Array(GHOSTS * 2 * 3);
  const ribCol = new Float32Array(GHOSTS * 2 * 4);
  const ribIdx = [];
  for (let i = 0; i < GHOSTS - 1; i++) {
    const a = i * 2;
    ribIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  // 머리는 진하고 꼬리로 갈수록 옅다. 만화 속도선이 방향을 말하는 방식이 이것이다.
  const ghostFade = (i) => Math.pow(1 - i / (GHOSTS - 1), 1.4);
  // 꼬리를 뾰족하게 깎을수록 만화 속도선에 가깝지만, 화면에서 공 실루엣 밖으로 나간 폭이 같이 줄어
  // 꼬리가 있다고 잴 근거가 사라진다. 정면 킥은 리본을 거의 끝에서 보므로 그 폭이 곧 뻗은 길이다.
  // 실측 reach: 꼬리 0.14배에서 1.51, 0.30배에서 1.49로 바 1.5에 붙었다. 0.55배로 되돌린다.
  const RIB_W = (i) => 1 - 0.45 * (i / (GHOSTS - 1));
  for (let i = 0; i < GHOSTS; i++) {
    const a = ghostFade(i);
    for (const s of [0, 1]) {
      const o = (i * 2 + s) * 4;
      ribCol[o] = 1; ribCol[o + 1] = 0.882; ribCol[o + 2] = 0.302; ribCol[o + 3] = a;
    }
  }
  const ribGeo = new THREE.BufferGeometry();
  ribGeo.setAttribute('position', new THREE.BufferAttribute(ribPos, 3));
  ribGeo.setAttribute('color', new THREE.BufferAttribute(ribCol, 4));
  ribGeo.setIndex(ribIdx);
  const ribbon = new THREE.Mesh(
    ribGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
  );
  ribbon.visible = false;
  // 정점을 매 프레임 다시 쓰므로 경계 상자는 항상 한 프레임 뒤처진다. 컬링을 맡기면 띠가 깜빡인다.
  ribbon.frustumCulled = false;
  ribbon.userData.probeIgnore = true;
  scene.add(ribbon);
  // 띠는 두께가 없어 마지막 마디에서 그대로 잘린다. 구슬판은 그 자리에 공 부피가 있었고
  // 앞선 reach 1.68은 그 부피까지 재고 나온 값이다. 실측: 띠만 두면 정면 킥에서 1.49로 떨어지고
  // 폭을 0.14배에서 0.55배로 넓혀도 62.6px 그대로다. 폭은 시선에 수직이라 뻗은 길이를 못 바꾼다.
  // 킥 지점은 공이 실제로 있던 자리다. 그 자리에 옅은 공 하나를 남겨 띠 끝을 맺는다.
  const ribCap = new THREE.Mesh(
    ballGeo(BALL_R),
    new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0, depthWrite: false })
  );
  ribCap.visible = false;
  ribCap.frustumCulled = false;
  ribCap.userData.probeIgnore = true;
  scene.add(ribCap);
  // 진단과 게이트가 읽는 머릿값. 정점 알파는 여기에 ghostFade를 곱한 결과다.
  let ghostAlpha = 0;
  let ribTail = null;
  const trail = [];
  // 잔상을 지나온 거리로 놓으므로 자취는 프레임 수가 아니라 길이를 담아야 한다.
  // 느린 킥에서도 꼬리 끝까지 닿으려면 1.5초치가 필요하다.
  const TRAIL_MAX = 90;
  // 자취를 따라 d만큼 뒤로 걸어간 점. 표본 사이는 직선으로 본다.
  // 자취가 그보다 짧으면 가장 오래된 점에 멈춘다. 그때 잔상은 한자리에 겹쳐 공을 감싼 무리로 남는다.
  const trailPoint = (d) => {
    if (trail.length < 2) return null;
    let acc = 0;
    for (let k = 1; k < trail.length; k++) {
      const seg = trail[k - 1].distanceTo(trail[k]);
      if (acc + seg >= d) {
        const t = seg > 1e-6 ? (d - acc) / seg : 0;
        return trail[k - 1].clone().lerp(trail[k], t);
      }
      acc += seg;
    }
    return trail[trail.length - 1].clone();
  };
  // 공이 화면에서 차지하는 높이 비율. 화소가 아니라 비율로 잡아야 해상도가 바뀌어도 같은 그림이 나온다.
  // 0.047은 720p에서 지름 34px이다. 실측으로 비행 중 최소 17.7px까지 내려갔고 그 크기에서는
  // 공이 오는지 서 있는지가 안 읽혔다. 잔상도 그 점 안에 갇혀 같이 죽었다.
  const BALL_MIN_H = 0.047;
  const BALL_GAIN_CAP = 2.4;
  let ballGain = 1;

  // 공 그림자. 공이 어디쯤인지 바닥이 알려주면 궤적을 놓치지 않는다.
  // 흙과 같은 갈색으로 칠한 그늘은 흙 얼룩 하나로 읽혔다. 바닥에는 이만큼 짙은 얼룩이 이미 널려 있다.
  // 그림자만 찬 색으로 빼면 같은 밝기라도 흙에서 떨어져 나온다. 만화가 그늘을 파랗게 칠하는 이유다.
  const SHADOW_INK = 0x171326;
  const shadow = new THREE.Mesh(
    blobGeo(0.16, 0x4411a3),
    new THREE.MeshBasicMaterial({ color: SHADOW_INK, transparent: true, opacity: 0.62 })
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
      new THREE.MeshBasicMaterial({ color: SHADOW_INK, transparent: true, opacity: 0.72 })
    );
    const core = new THREE.Mesh(
      blobGeo(r * 0.56, blobSeed + 0x31),
      new THREE.MeshBasicMaterial({ color: SHADOW_INK, transparent: true, opacity: 0.86 })
    );
    // 정확히 겹치면 두 장인 줄 모른다. 반지름의 5분의 1만 밀어 발밑을 짙게 만든다.
    core.position.set(r * 0.18, -r * 0.14, 0.001);
    m.add(core);
    m.rotation.x = -Math.PI / 2;
    m.userData.probeIgnore = true;
    scene.add(m);
    return m;
  };
  // 발자국만 한 원판은 다리 뒤에 그대로 숨는다. 몸 밖으로 치마처럼 삐져나와야 접지가 보인다.
  const keeperShadow = blob(0.55);
  const kickerShadow = blob(0.36);
  // 골반 높이의 기준선. 서 있을 때 값을 그대로 쓰므로 키를 바꿔 끼워도 따라온다.
  let pelvisRest = 0;
  const hipA = new THREE.Vector3();
  const hipB = new THREE.Vector3();
  // 그림자의 방향과 길이를 정하는 축. 목과 두 무릎이 리그의 실재 점 중 가장 먼 양 끝이다.
  const headW = new THREE.Vector3();
  const footA = new THREE.Vector3();
  const footB = new THREE.Vector3();
  // 행인도 그림자가 있어야 땅을 딘는다. 말걸기 연출은 행인을 앞줄로 데려오므로 더 눈에 띄다.
  const passerShadows = passers.map(() => blob(0.28));

  const kicker = buildKicker();
  scene.add(kicker);
  markForeground(kicker);

  let keeper = buildKeeper(188, 84);
  scene.add(keeper);
  markForeground(keeper);

  function setKeeper(k) {
    // 벗겨진 장갑은 장면에 붙어 있다. 키퍼를 다시 짓기 전에 치워야
    // 새 키퍼의 장갑 목록과 짝이 안 맞는 유령이 남지 않는다.
    if (loose) { scene.remove(loose); loose = null; }
    scene.remove(keeper);
    keeper = buildKeeper(k.height, k.weight);
    scene.add(keeper);
    markForeground(keeper);
  }

  // 화면 흔들림. 카메라 본체를 흔들면 골대 프레이밍과 키퍼 접지 측정이 같이 흔들린다.
  // 그래서 진폭은 게이트가 견디는 크기에서 시작한다. 0.09는 골대가 프레임을 나갔고 0.004는 아무 일도 안 일어났다.
  // 5.1에서는 골 반폭 3.66이 수평 화각과 정확히 같아 여유가 0이었다. 어떤 푸시인도 기둥을 잘랐다.
  const CAM_BASE = new THREE.Vector3(0, 3.3, -6.2);
  const CAM_LOOK = new THREE.Vector3(0, 1.4, 4.5);
  let shakeAmp = 0;
  let shakeLeft = 0;
  let shakeSpan = 1;
  // 사건 하나가 화면을 얼마나 밀었고 공을 얼마나 찌그러뜨렸는지의 최고값.
  // 계측이 폴링으로 잡으면 피크는 프레임 사이로 빠져나간다. 그리는 쪽이 적어야 한다.
  let camOffPeak = 0;
  let squashPeak = 0;
  // 손에 닿은 공이 모양 그대로 튀면 맞은 것이 아니라 스친 것으로 읽힌다.
  // 0.16초는 히트스톱 길이와 같다. 정지가 풀릴 때 공도 같이 원형으로 돌아온다.
  const SQ_DUR = 0.16;
  let sqLeft = 0;
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

  // 사건마다 렌즈가 자리를 옮긴다. 아홉 장이 전부 같은 광각이면 무슨 일이 났는지는
  // 자막만 말하게 되고 그림은 배경이 된다.
  // pos는 CAM_BASE 기준 오프셋, look은 CAM_LOOK 기준 오프셋, fov는 화각 증감이다.
  // 값이 크면 골대가 프레임을 나가 shot 게이트가 죽는다. 골대는 언제나 화면 안이다.
  // dur는 1.2를 넘기지 않는다. decal 게이트가 사건 3.1초 뒤에 찍으므로 그때는 제자리여야
  // 두 프레임의 차분이 흙 자국만 남긴다.
  // 푸시인은 base 대비 화면 배율 1.17을 넘기지 않는다. 그 위에서는 골 기둥이 프레임을 나간다.
  // 그 예산 안에서 화각과 거리를 나눠 쓴다. 화각 변화가 1도 미만이면 렌즈가 안 움직인 것으로 읽힌다.
  const CAM_EV = {
    // 프리셋이 열두 장 중 열한 장을 같은 정면 로우앵글로 만들었다. 차이가 눈에 안 걸리면 프리셋이 없는 것과 같다.
    // 선방은 짧고 세게 당긴다. 오래 끌면 줌이 아니라 그냥 다른 화각으로 읽힌다.
    // 0.5초는 사건 선언 520ms 뒤 프레임에서 이미 끝나 있다. 그 프레임이 선방을 판단하는 유일한 그림인데
    // 렌즈가 기본 자리로 돌아와 있어 선방만 카메라가 없는 사건이 됐다.
    // 정면으로만 당기면 조준 화면과 같은 구도다. 다이빙한 쪽으로 붙어야 옆에서 본 그림이 된다.
    save: { pos: [0.44, -0.3, 0.86], look: [0.2, -0.08, 0], fov: -5, dur: 0.85, mirror: true },
    // 쳐낸 것과 잡은 것이 같은 각도면 둘은 같은 그림이다. 잡은 것은 옆에서 붙어
    // 가슴에 안긴 공을 본다. 정면에서 조금 당기기만 하면 선방과 구별이 안 된다.
    catch: { pos: [-0.6, -0.12, 0.4], look: [-0.22, -0.02, 0], fov: -3, dur: 0.75 },
    // 골라인이 화면을 가로지르게 낮춘다. 위에서 보면 넘었는지 앞인지 판정이 안 선다.
    carriedIn: { pos: [0, -1.45, 0.3], look: [0, -0.5, 0.55], fov: -2, dur: 1.1 },
    // 벗겨진 장갑 쪽으로 붙는다. 장갑이 팔 옆에 그대로 있는 것으로 읽히면 인과가 끊긴다.
    gloveGone: { pos: [0.75, -0.42, 0.4], look: [0.3, -0.16, 0], fov: -3, dur: 0.95 },
    // 깔린 키퍼를 크게 잡는다. 광각에서는 누가 쓰러졌는지가 몇 픽셀 차이다.
    // 낮추고 옆으로 트는 것까지는 되는데 화각까지 좁히면 골대 오른쪽 기둥이 화면 밖으로 나간다.
    // 기울기가 이미 0.15rad 걸려 있어 프레임이 돌면서 모서리를 먼저 잘라먹는다.
    downed: { pos: [0.35, -1.2, 0.3], look: [0.08, -0.65, 0.2], fov: -2, dur: 1.05 },
    // 키퍼가 골라인을 떠나 앞으로 나간다. 렌즈가 따라붙어야 돌진으로 읽힌다.
    // 나머지 프리셋이 전부 낮추고 좁힌다. 돌진만 올리고 넓혀야 같은 렌즈가 아닌 것으로 읽힌다.
    charge: { pos: [0, 0.52, 0.85], look: [0, 0.08, 0.7], fov: 4, dur: 0.9 },
    spill: { pos: [0.35, -0.2, 0.3], look: [0, -0.06, 0], fov: -4, dur: 0.7 }
  };
  let camEv = null;
  // 다이빙한 쪽으로 렌즈를 붙일 때 쓰는 부호. 프리셋은 한 방향만 적어 두고 여기서 뒤집는다.
  let camMx = 1;
  let camEvLeft = 0;
  let camEvSpan = 1;
  function camEvent(kind, sign) {
    const e = CAM_EV[kind];
    if (!e) return;
    camEv = e;
    camMx = e.mirror ? (Math.sign(sign) || 1) : 1;
    camEvLeft = e.dur;
    camEvSpan = e.dur;
  }
  // 부풀었다 꺼지는 곡선은 사건 프레임마다 화각이 달랐다. 같은 사건의 접촉 프레임과 520ms 프레임이
  // 통째로 다른 장면으로 읽힌 원인이다. 렌즈는 한 번 붙고 그 자리를 지키다가 늦게 풀린다.
  // 0.05초는 서너 프레임이라 순간이동이 아니라 컷으로 읽히고, 그 뒤 정지 프레임은 전부 같은 구도다.
  // 끝값이 정확히 0이라 사건이 끝나면 프레이밍이 원래 자리로 돌아온다. decal 게이트가 이걸 본다.
  const CAM_IN = 0.05;
  function camEvAmount() {
    if (camEvLeft <= 0) return 0;
    const gone = camEvSpan - camEvLeft;
    if (gone < CAM_IN) return gone / CAM_IN;
    // 푸는 구간은 사건 길이의 3분의 1이다. 더 짧으면 렌즈가 튕겨 돌아온 것으로 보인다.
    const out = camEvSpan * 0.34;
    if (camEvLeft > out) return 1;
    return Math.sin((Math.PI * 0.5 * camEvLeft) / out);
  }
  const camLook = new THREE.Vector3();

  // 가로가 기준이다. 화면이 그보다 좁으면 수직 화각을 늘려 골대 폭을 지킨다.
  const BASE_ASPECT = 16 / 9;
  const BASE_FOV = 46;
  // resize가 화면 비율마다 화각을 다시 잰다. 이벤트 화각은 그 위에 얹는 증감이라
  // 기준값을 따로 들고 있어야 한다. BASE_FOV로 되돌리면 좁은 화면에서 골대 폭이 잘린다.
  let fovBase = BASE_FOV;
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
    fovBase = camera.fov;
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
  // 프레임당 상수 비율은 세계시간이 멈춰도 목표를 향해 계속 간다.
  // 정지 프레임 두 장을 비교하는 계측이 그 수렴을 잡음 바닥으로 읽는다(계측: 306185화소).
  // 60fps에서의 비율을 dt로 환산하면 dt가 0일 때 0이 되고 프레임률이 흔들려도 도착 속도가 같다.
  const damp = (rate) => 1 - Math.pow(1 - rate, stepDt * 60);
  function drive(key, target, rate) {
    // 프레임당 상수 비율로 당기면 세계시간이 멈춰도 포즈가 목표를 향해 계속 간다.
    // 정지 프레임 두 장을 비교하는 계측이 그 수렴을 잡음 바닥으로 읽었다.
    // 감쇠를 dt로 환산하면 dt가 0일 때 0이 되고, 프레임률이 흔들려도 같은 속도로 도착한다.
    poseNow[key] = lerpPose(poseNow[key], target, 1 - Math.pow(1 - rate, stepDt * 60));
    setPose(actor[key], poseNow[key], vnow);
  }

  let cue = null;
  // 체인의 반전은 자막이 아니라 화면에서 일어나야 한다.
  // 여기서 결과를 바꾸지 않는다. 이미 확정된 사건 이름 하나를 받아 그것만 연기한다.
  let tail = null;
  // 고개가 돌아가는 속도. 사건과 함께 즉시 최대로 돌면 목이 끊긴 것으로 보인다.
  let tailRamp = 0;
  // 손으로 잡는 사건만 램프를 즉발로 돌린다. 접촉이 순간이라 반응 포즈가 늦으면
  // 충돌 정지 프레임에서 공이 장갑이 아니라 얼굴에 붙어 보인다.
  const INSTANT = new Set(['catch', 'save']);
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
    // 손이 안 닿은 사건. 장갑 좌표에 띄우면 닿지도 않은 자리에서 흙이 뜬다.
    // 흙 없이 공 옆에 단어만 얹는다. charge 프레임은 화면에 글자가 하나도 없었다.
    const CALL = { charge: '나간다!', beat: '제꼈다', lost: '뺏겼다', skied: '넘겼다', rebound: '튕김', reboundMiss: '흘렀다' };
    // 첫 소리는 충돌 프레임의 것이고, 반 초 뒤 프레임에는 이미 다 꺼져 있다.
    // 소리가 하나면 사건이 끝난 뒤를 찍은 정지 화면은 아무 말도 안 한다. 뒤따르는 소리를 하나 더 둔다.
    const FOLLOW = {
      save: '텅', catch: '착', gloveGone: '어어', carriedIn: '쑥', spill: '데굴', downed: '털썩',
      charge: '두두두', beat: '휘익', lost: '아앗', skied: '휘잉', rebound: '통통', reboundMiss: '데구르'
    };
    // 자막이 말한 사건인데 화면에 글자가 없으면 정지 화면 한 장은 아무 말도 안 한다.
    // 한 사건만 고치면 같은 구멍이 다섯 개 남는다. 표에서 빠진 이름이 스스로 드러나야 한다.
    const SILENT = new Set(['miss', 'contact', 'dived', 'emptyGoal']);
    if (!SILENT.has(kind) && !STAMP[kind] && !WORD[kind] && !CALL[kind]) {
      console.error('label missing: ' + kind);
    }
    // 손이 닿은 사건만 터진다. 다만 선언 순간에는 아직 안 닿았으므로 여기서는 예약만 한다.
    if (BURST[kind]) {
      pendingBurst = { power: BURST[kind], word: WORD[kind] || '', word2: FOLLOW[kind] || '', at: 'glove', kind };
    } else if (CALL[kind]) {
      pendingBurst = { power: 0.3, word: CALL[kind], word2: FOLLOW[kind] || '', at: 'ball', kind };
    }
    // 웃겨야 하는 사건에만 렌즈를 기울인다. 선방까지 기울이면 매 구 화면이 비뚤어져 기울기가 안 읽힌다.
    const TILT = { gloveGone: 0.13, carriedIn: -0.14, downed: 0.15, talked: -0.11, distracted: 0.1, beat: -0.12, lost: 0.12 };
    if (TILT[kind]) tilt(TILT[kind], 0.9);
    // 렌즈가 사건 쪽으로 옮겨 간다. 기울기만으로는 무슨 일인지 안 보인다.
    camEvent(kind, tail.kx);
    // 흔들림은 실점이 가장 크다. 골이 들어간 것이 화면에서 제일 큰 사건이어야 한다.
    const SHK = {
      save: [0.045, 0.34], catch: [0.032, 0.28], gloveGone: [0.055, 0.42],
      carriedIn: [0.062, 0.5], downed: [0.058, 0.44], spill: [0.03, 0.26],
      openGoalScored: [0.062, 0.5], talked: [0.02, 0.3], distracted: [0.02, 0.3],
      beat: [0.05, 0.4], lost: [0.05, 0.4]
    };
    if (HIT[kind]) stopLeft = HIT[kind];
    const s = SHK[kind];
    camOffPeak = 0;
    squashPeak = 0;
    sqLeft = HIT[kind] ? SQ_DUR : 0;
    if (s) shake(s[0], s[1]);
    // 실점은 화면이 한 번 하얗게 튄 다음 색이 빠진다. 결과를 글자로만 알리면 글자를 안 읽는다.
    if (CONCEDE.has(kind)) flash(kind);
  }
  function play(shot, input, result, onEnd) {
    tail = null;
    pendingBurst = null;
    cue = { shot, input, result, t0: vnow, ended: false, onEnd, steps: 0, struck: false, framed: false };
    trail.length = 0;
    ribbon.visible = false;
    ribCap.visible = false;
    ball.scale.set(1, 1, 1);
    ballGain = 1;
    kicker.position.set(VIEW_X * shot.aimX * SX * 0.2 + KICKER_OFF, 0, 11.2);
    sqLeft = 0;
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
    if (frozen) dt = 0;
    frames += 1;
    if (stopLeft > 0) {
      stopLeft -= dt;
      dt *= HIT_SCALE;
    }
    vnow += dt;
    stepDt = dt;
    // 구름은 세계시계로만 흐른다. 실시간을 쓰면 정지 프레임에서 하늘만 계속 움직인다.
    // 0.004는 한 바퀴에 4분이 조금 넘는다. 눈에 띄면 배경이 주인공을 뺏는다.
    pitch.drift.value = vnow * 0.004;
    runTimers();
    actor.keeper = keeper;
    actor.kicker = kicker;
    // 이번 프레임에 무엇을 연기할지. 결과는 이미 확정됐고 여기서는 각도만 고른다.
    let kp = POSES.ready;
    // 예비와 잔여를 섞으면 kp는 매 프레임 새 객체다. 표에 담긴 포즈와 같은 것인지 묻는 자리가
    // 셋 있는데, 섞인 객체는 어느 집합에도 안 들어가 자국도 안 남고 잡히는 속도도 안 갈렸다.
    // 섞기 전의 표준 포즈를 따로 들고 다닌다. 여기서 신원을 묻고, 몸에는 섞인 각도를 준다.
    let kpId = POSES.ready;
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
      kpId = kp;
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
        // 프레임당 곱으로 줄이면 세계시간이 멈춰도 상체가 계속 펴진다.
        // 정지 프레임 두 장을 비교하는 계측이 그 변화를 잡음 바닥으로 읽는다.
        kicker.rotation.z *= Math.pow(0.86, dt * 60);
        const p = Math.min(1, (t - runup) / flight);
        // 공은 골라인에서 멈추지 않는다. 실점이면 골망까지 가고 거기서 선다.
        // 카메라가 골대 뒤에 있으니 그 뒤로 더 보내면 공이 렌즈를 뚫고 사라진다.
        const past = result.conceded ? BALL_PAST : 1.0;
        const q = Math.min(p * past, past);
        ball.position.x = lerp(0, VIEW_X * shot.aimX * SX, Math.min(q, 1));
        ball.position.z = lerp(11, 0.1, q);
        ball.position.y = lerp(BALL_R, shot.aimY * SY, Math.min(q, 1)) + Math.sin(Math.min(p, 1) * Math.PI) * cue.arc;
        // 공은 조준점에 닿은 뒤 그 자리에 박혀 있었다. 다음 구까지 1.7초를 허공에 선 채로 버틴다.
        // 골이 아니라 정지 화면으로 읽히고, 하필 뒷골대 세로 기둥과 겹치면 아예 사라진다.
        // 실측: 기둥 하나가 103프레임 연속으로 공을 통째로 먹었다.
        // 그물은 공을 세우지 못한다. 힘을 잃고 떨어져 골대 안쪽으로 굴러 들어간다.
        if (p >= 1) {
          const s = ease(Math.min(1, (t - runup - flight) / 0.8));
          // 안쪽으로 0.24는 기둥을 피하려고 고른 값이 아니라 그물이 공을 되밀어 주는 만큼이다.
          // x=2 근처에 멈춰 선 공이 이 폭이면 기둥의 시선 그림자 밖으로 나온다.
          const y0 = ball.position.y;
          ball.position.x *= 1 - 0.24 * s;
          // 한 번 튀고 눕는다. 그냥 내리면 공이 아니라 엘리베이터로 읽힌다.
          ball.position.y = BALL_R + (y0 - BALL_R) * (1 - s) * Math.abs(Math.cos(s * Math.PI * 1.2));
          // 골망 바닥은 화면 아래 끝 밖이다. 거기 눕히면 공이 떨어지자마자 프레임을 나간다.
          // 실측: 501프레임이 offscreen이었다. 되튄 공은 골라인 앞으로 굴러 나와 선다.
          ball.position.z = lerp(ball.position.z, 0.55, s);
        }
        // 프레임당 상수로 돌리면 세계시간이 멈춰도 공만 계속 구른다.
        // 60fps에서 재던 값을 초당으로 환산한다. 0.4/프레임 = 24/초, 0.22/프레임 = 13.2/초.
        ball.rotation.x -= 24 * stepDt;
        ball.rotation.y -= 13.2 * stepDt;
        // 진행축 스트레치는 여기서 안 쓴다. 공은 카메라를 향해 오므로 진행축이 시선축과 거의 나란하고,
        // 그 방향으로 늘려봐야 화면에는 크기 변화로만 나타난다. 속도는 잔상이 대신 말한다.
        // 대신 발에 맞은 직후에만 짜부라진다. 이건 시선축과 무관해서 화면에 그대로 보인다.
        // 0.5초는 공이 계속 찌그러진 채로 날았다. 0.13초가 맞은 순간으로만 읽힌다.
        const sq = Math.max(0, 1 - (t - runup) / 0.13);
        // 실측으로 비행 중 공 지름이 17.7px까지 내려갔다. 720p 화면 폭의 1.4%다.
        // 그 크기에서는 공이 오는지 서 있는지가 안 읽히고 잔상도 그 점 안에 갇혀 같이 죽는다.
        // 만화는 이럴 때 원근을 포기하고 공을 키운다. 화면 높이 비율로 하한을 두고 모자란 만큼만 곱한다.
        const dist = Math.max(0.01, ball.position.distanceTo(CAM_BASE));
        const angular = (2 * BALL_R / dist) / (2 * Math.tan(BASE_FOV * Math.PI / 360));
        // 0.12초에 걸쳐 올려봤더니 그 구간이 최소 크기를 만들어 25px에서 걸렸다.
        // 발에 맞는 순간 커지는 것은 오류가 아니라 임팩트다. 같은 프레임의 짜부라짐과 한 사건으로 읽힌다.
        ballGain = Math.max(1, Math.min(BALL_GAIN_CAP, BALL_MIN_H / angular));
        ball.scale.set((1 + sq * 0.5) * ballGain, (1 - sq * 0.34) * ballGain, (1 + sq * 0.5) * ballGain);
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
      // 잡는 사건은 접촉이 순간이다. 정지 프레임은 충돌 직후 22ms에서 잡히는데
      // 0.32초 램프로는 그때 포즈가 아직 대기 자세라 손이 아니라 얼굴에 공이 붙어 보인다.
      tailRamp = ease(Math.min(1, u * (INSTANT.has(tail.kind) ? 40 : 2.5)));
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
        lost: POSES.faceplant, skied: POSES.skyward,
        talked: POSES.swoon, distracted: POSES.swoon, openGoalScored: POSES.faceplant
      };
      kp = TAIL_POSE[tail.kind] ?? kp;
      kpId = kp;
      // 사건이 최종 포즈 한 장으로 스냅된다. 예비도 잔여도 없어서 정지 프레임의 몸은
      // 사건을 겪은 것이 아니라 그 자세로 놓여 있는 것으로 읽힌다. pose-gate는 최종 포즈끼리의
      // 거리만 재므로 이 결함을 못 잡는다. 포즈 표를 사건 수만큼 늘리지 않고,
      // 사건 직전 포즈와 최종 포즈를 잇는 선을 양쪽으로 늘려 세 키를 유도한다.
      if (!tail.base) tail.base = poseNow.keeper;
      // 손으로 잡는 사건은 접촉이 이미 지나 있어 예비를 넣을 자리가 없다. 넣으면 공이 늦게 붙는다.
      const ANT = INSTANT.has(tail.kind) ? 0 : 0.075;
      const tt = vnow - tail.t0;
      if (tt < ANT) {
        // 예비. 최종의 반대쪽으로 밀면 몸이 반동을 먹고 나서 넘어간 것으로 읽힌다.
        kp = pushPose(kp, tail.base, 1.22);
      } else {
        // 잔여. 최종을 넘겼다가 감쇠 진동으로 되돌아온다. 진동이 빨리 죽으면
        // 크리틱이 보는 520ms 프레임이 다시 마네킹이라 주기를 0.84초로 늘려 잡았다.
        const ft = tt - ANT;
        const w = Math.cos(ft * 7.5) * Math.exp(-ft * 1.3);
        kp = pushPose(tail.base, kp, 1 + 0.34 * w);
        // 닿는 순간 몸이 눌린다. 없으면 충돌이 포즈 교체로만 나타난다.
        if (!tail.squashed) { tail.squashed = true; keeperPop = 0.09; }
      }
      // 몸이 바닥에 닿는 순간 한 번만 흙을 판다. 매 프레임 칠하면 자국이 아니라 진흙탕이 된다.
      // 자국은 몸통이 아니라 뻗은 팔이 닿는 자리에 남는다. 장갑의 실제 좌표로 찍어야
      // 왼쪽으로 뛴 구와 오른쪽으로 뛴 구가 땅에서 다른 자리로 갈린다.
      if (!tail.scuffed && u > 0.45 && SCUFF_POSES.has(kpId)) {
        tail.scuffed = true;
        const hit = gloveWorld(Math.sign(tail.kx || 1));
        pitch.box.userData.mark(hit.x, hit.z, Math.sign(tail.kx || 1) * 0.4, 0.62,
          WRECK_POSES.has(kpId) ? 1 : 0.7);
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
            // 6배는 130ms다. 충돌 정지 프레임은 22ms에서 잡히므로 그 프레임에서 공이 아직
            // 비행 종료점, 즉 얼굴 높이에 있다. 포즈 램프와 같은 속도로 붙여야 손이 접촉점이 된다.
            const grab = ease(Math.min(1, u * 30));
            // 장갑 중심에 공 중심을 맞추면 공이 손 안으로 파묻힌다. 공 반경만큼 카메라 쪽으로 내놓는다.
            ball.position.set(lerp(tail.from.x, gw.x, grab), lerp(tail.from.y, gw.y, grab), lerp(tail.from.z, gw.z - BALL_R, grab));
          }
          keeper.rotation.z = lerp(keeper.rotation.z, 0, damp(0.08));
          break;
        case 'carriedIn': {
          // 막았는데 같이 넘어간다. 공과 몸이 한 덩어리로 골망까지 간다.
          // -0.35에서 멈추면 몸이 골문 안에 서 있기만 하고 그물에는 닿지 않는다.
          // 그물 트리거는 좌표 하나를 읽으므로 닿지 않은 몸은 그물을 못 울린다.
          // 그물면이 -1.5이니 몸통 반경만큼 앞에서 멈춰야 처박힌 그림이 된다.
          // 더 밀면 가슴에 안긴 공이 그물면을 뚫고 뒤로 나간다.
          // 0.8초를 다 써서 밀면 그물에 닿는 순간이 꼬리 끝이라 출렁임이 화면 밖에서 끝난다.
          // 밀려 들어가는 것은 앞쪽 순간이고 남은 시간은 처박힌 채로 흐른다.
          keeper.position.z = lerp(KEEPER_Z, -1.05, ease(Math.min(1, u * 1.9)));
          keeper.rotation.z = lerp(keeper.rotation.z, Math.sign(keeper.rotation.z || 1) * 1.35, damp(0.08));
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
            // 골라인을 넘는 것은 이 사건의 결론이고, 그 결론이 늦게 오면 자막만 먼저 뜬다.
            // 공은 장갑을 벗기자마자 골망까지 가고, 늘어지는 것은 키퍼의 몸과 카메라뿐이다.
            const f = ease(Math.min(1, Math.max(0, (u - 0.12) / 0.45)));
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
            // 장갑이 공 위로 겹치면 공이 사라지고 노란 덩어리만 남는다.
            // 다시 붙은 뒤에도 공 반지름만큼은 옆으로 비켜 서 있어야 둘 다 보인다.
            const sx = Math.sign(ball.position.x || tail.kx || 1);
            loose.position.set(
              lerp(tail.from.x, ball.position.x, lag) + sx * (0.3 + 0.1 * off),
              lerp(tail.from.y, ball.position.y, lag) + (0.14 + Math.sin(u * Math.PI) * 0.22) * off,
              lerp(tail.from.z, ball.position.z, lag) + 0.12 * off
            );
            // 회전만 프레임당 상수로 쌓으면 세계시간이 멈춰도 장갑이 계속 돈다.
            // 정지 프레임 두 장을 비교하는 계측이 그 회전을 잡음 바닥으로 읽는다.
            const spin = dt * 60;
            loose.rotation.z += 0.62 * (1 - cling * 0.6) * spin;
            loose.rotation.x += 0.41 * (1 - cling * 0.6) * spin;
          }
          break;
        }
        case 'spill':
          // 흘렸다. 공이 옆으로 튀어나가 아직 살아 있다.
          ball.position.set(lerp(tail.from.x, tail.from.x + (tail.kx >= 0 ? 1.5 : -1.5), e), 0.14 + Math.abs(Math.sin(u * 9)) * 0.5 * (1 - u), lerp(tail.from.z, 3.2, e));
          break;
        case 'downed': {
          keeper.rotation.z = lerp(keeper.rotation.z, Math.sign(keeper.rotation.z || 1) * 1.5, damp(0.06));
          hover = 0.04;
          // 공이 몸과 상관없는 자리로 혼자 굴러갔다. 자막은 깔렸다는데 공은 반대편 허공을 지나갔다.
          // 경로의 중간 지점을 쓰러진 몸에 묶는다. 몸 위를 타고 넘어가야 한 사건으로 읽힌다.
          const bx = keeper.position.x;
          const bz = keeper.position.z;
          // 몸을 타고 넘는 구간이 절반을 먹으면 자막이 뜬 뒤에도 공은 아직 골 앞에 있다.
          // 넘는 것은 앞당기고, 깔린 키퍼가 못 일어나는 시간은 그대로 둔다.
          const over = ease(Math.min(1, u / 0.28));
          const past = ease(Math.min(1, Math.max(0, (u - 0.28) / 0.32)));
          const crossed = u > 0.28;
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
          keeper.rotation.z = lerp(keeper.rotation.z, 0, damp(0.62));
          // z=6.5까지 보내면 키퍼가 골대 그물 너머 원경에 파묻히고 공이 몇 픽셀로 줄어든다.
          // 나갔다는 사실은 페널티 박스를 벗어나는 것으로 이미 읽힌다. 근경에 세운다.
          keeper.position.z = lerp(KEEPER_Z, CHARGE_Z, e);
          // 카메라가 골대 뒤에 있으므로 키퍼보다 먼 자리에 둔 공은 무조건 등에 가려진다.
          // 드리블하는 공은 카메라 쪽 발 옆으로 온다. 그래야 몸과 안 겹치고 발 옆으로 읽힌다.
          ball.position.set(keeper.position.x + 0.78, 0.14 + Math.abs(Math.sin(u * 12)) * 0.42, keeper.position.z - 0.34);
          break;
        case 'beat':
          keeper.position.z = lerp(CHARGE_Z, CHARGE_Z + 5.2, e);
          keeper.rotation.z = lerp(keeper.rotation.z, Math.sin(u * 16) * 0.12, damp(0.34));
          ball.position.set(keeper.position.x, 0.14, keeper.position.z + 0.7);
          kicker.rotation.z = lerp(0, 1.3, e);
          break;
        case 'lost':
          // 뺏겼다. 키퍼는 저기 나가 있고 골대가 비어 있다.
          ball.position.set(lerp(tail.from.x, kicker.position.x, e), 0.14, lerp(tail.from.z, kicker.position.z + 0.5, e));
          keeper.rotation.z = lerp(keeper.rotation.z, 1.2, damp(0.06));
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
          // 키퍼가 걸어 나가는 속도로 공까지 굴리면 공이 골대 앞에 멈춰 선 채로 촬영된다.
          // 공은 아무도 안 막았으니 원래 속도로 들어가고, 느린 것은 홀린 사람 쪽이다.
          {
            const be = ease(Math.min(1, u * 1.9));
            ball.position.set(lerp(tail.from.x, 0, be), lerp(tail.from.y, REST_Y, be), lerp(tail.from.z, REST_Z, be));
          }
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
      // 공과 장갑이 실제로 만난 프레임에서 한 번만 터진다. 좌표는 둘의 중점이다.
      // u 상한은 접촉이 끝내 안 나는 사건의 안전판이다. 없으면 폭발이 아예 사라진다.
      if (pendingBurst) {
        // 손이 안 닿는 사건은 장갑을 기다리면 영영 안 터진다. 공 바로 위에 단어만 얹는다.
        if (pendingBurst.at === 'ball') {
          if (u > 0.28) {
            // 공 바로 위에 얹었더니 글자가 키퍼 얼굴을 덮었다. 표정이 사라지면 사건의 절반이 없다.
            // 카메라는 +z를 보므로 +x가 화면 바깥쪽이다. 공보다 한 뼘 바깥, 머리 위로 올린다.
            impact.burst(new THREE.Vector3(ball.position.x + 0.62, ball.position.y + 0.95, ball.position.z), pendingBurst.power, pendingBurst.word, pendingBurst.kind, pendingBurst.word2);
            pendingBurst = null;
          }
        } else {
          const gw = gloveWorld(Math.sign(tail.kx || 1));
          const met = ball.position.distanceTo(gw) < 0.55;
          // 중점은 둘이 실제로 만났을 때만 접촉점이다. 시간 폴백이 먼저 걸린 프레임에서는
          // 공이 이미 저 멀리 있어서, 중점이 아무것도 없는 허공이 된다. 그때는 손에서 터뜨린다.
          if (met || u > 0.3) {
            impact.burst(met ? gw.clone().lerp(ball.position, 0.5) : gw.clone(), pendingBurst.power, pendingBurst.word, pendingBurst.kind, pendingBurst.word2);
            pendingBurst = null;
          }
        }
      }
      // 공이 그물에 닿는 순간. 판정이 아니라 좌표 하나를 읽는 것뿐이다.
      if (!tail.netDone && ball.position.z <= pitch.netZ + 0.5 && CONCEDE.has(tail.kind)) {
        tail.netDone = true;
        // 그물은 울리지 않는다. 마른 마찰 한 겹과 짧은 저역이 전부다.
        sfx.place();
        netAmp = 0.55;
        netT = 0;
        netX = ball.position.x;
        netY = ball.position.y - R_H / 2;
        impact.burst(ball.position, 0.9, '출렁', 'net', '펄럭');
        shake(0.03, 0.22);
      }
      shadow.position.set(ball.position.x, 0.02, ball.position.z);
      const lift2 = Math.max(0, ball.position.y - BALL_R);
      shadow.scale.setScalar(1 + lift2 * 0.55);
      shadow.material.opacity = Math.max(0.06, 0.42 - lift2 * 0.14);
    }
    // 잡히는 속도는 사건마다 다르다. 자빠짐은 빠르고 회복은 느리다.
    drive('keeper', kp, WRECK_POSES.has(kpId) ? 0.22 : (SCRAMBLE_POSES.has(kpId) ? 0.26 : 0.12));
    // 예비는 느리게 잡혀야 버틴 것으로 보이고, 임팩트는 한 프레임에 가까워야 터진 것으로 보인다.
    drive('kicker', kk, kk === POSES.strike ? 0.62 : (kk === POSES.follow ? 0.24 : (kk === POSES.plant ? 0.16 : (kk === POSES.cheer ? 0.30 : 0.10))));
    // 닿는 순간에만 몸이 부풀어야 힘이 들어간 것으로 읽힌다. 길게 주면 몸집이 변한 것으로 보인다.
    kickPop = Math.max(0, kickPop - dt);
    const kpop = 1 + (kickPop > 0 ? Math.sin((kickPop / 0.07) * Math.PI) * 0.15 : 0);
    kicker.scale.setScalar(kpop);
    // 눌림은 부피를 유지해야 몸집이 변한 것으로 보이지 않는다. 눌린 만큼 옆으로 퍼진다.
    keeperPop = Math.max(0, keeperPop - dt);
    const kep = keeperPop > 0 ? Math.sin((keeperPop / 0.09) * Math.PI) : 0;
    keeper.scale.set(1 + kep * 0.22, 1 - kep * 0.16, 1 + kep * 0.22);
    // 접지는 선언이 아니라 측정이다. 몸의 실제 최저점을 재서 원하는 높이에 맞춘다.
    keeper.position.y += hover - footY(keeper);
    // drive()가 목을 덮어쓰고, 위치 보정 전 월드행렬은 낡았다. 둘이 끝난 뒤에 고개를 돌린다.
    if (tail) applyFace(FACE_TURN[tail.kind] ?? 0.6, FACE_MOOD[tail.kind] ?? 'shock', tailRamp);
    else if (titleMode) applyFace(0.92, 'grin', 1);
    else applyFace(0, 'rest', 1);
    kicker.position.y += -footY(kicker);
    // 루트 피벗은 발밑이라 몸이 누우면 몸통만 옆으로 나간다. 사인 근사는 그 자리를 눈대중으로 옮겼다.
    // 골반은 리그에 실재하는 점이다. 양 고관절의 월드 중점을 재면 눕든 뜨든 몸의 중심이 그대로 나온다.
    keeper.updateMatrixWorld(true);
    keeper.userData.joints.hipL.getWorldPosition(hipA);
    keeper.userData.joints.hipR.getWorldPosition(hipB);
    const pelvisY = (hipA.y + hipB.y) * 0.5;
    // 서 있는 프레임의 값을 그대로 기준선으로 쓴다. 프레임당 수렴은 정지 프레임 두 장을 갈라놓는다.
    if (!tail && !cue) pelvisRest = pelvisY;
    // 몸이 누우면 그늘도 누워야 한다. 골반 한 점만 쓰면 원판이 몸에서 떨어져 나와
    // 흙에 따로 찍힌 얼룩으로 읽힌다. 목과 무릎을 바닥에 내리꽂아 축을 얻는다.
    keeper.userData.joints.neck.getWorldPosition(headW);
    keeper.userData.joints.knL.getWorldPosition(footA);
    keeper.userData.joints.knR.getWorldPosition(footB);
    const footX = (footA.x + footB.x) * 0.5;
    const footZ = (footA.z + footB.z) * 0.5;
    const axX = headW.x - footX;
    const axZ = headW.z - footZ;
    // 서 있으면 이 값이 0에 가깝고 완전히 누우면 몸길이만큼 나온다. 1.1m를 완전히 누운 것으로 본다.
    const span = Math.hypot(axX, axZ);
    keeperShadow.position.set((headW.x + footX) * 0.5, 0.03, (headW.z + footZ) * 0.5);
    // 로컬 x는 rotation.x=-PI/2를 거쳐 월드 x로, 로컬 y는 월드 -z로 간다. 각도는 그 평면에서 잰다.
    // 5cm 미만은 서 있는 것이다. 그 각을 믿으면 잡음이 원판을 제자리에서 돌린다.
    keeperShadow.rotation.z = span > 0.05 ? Math.atan2(-axZ, axX) : 0;
    // 뜬 높이만큼 그늘이 작고 옅어져야 몸이 공중에 있는 것으로 읽힌다.
    // 눕는 각만 보던 이전 식은 다이빙으로 몸이 떠도 농도가 그대로라 바닥에 붙어 보였다.
    const rise = Math.max(0, pelvisY - pelvisRest);
    const shrink = Math.max(0.45, 1 - rise * 0.30);
    // 누울수록 길고 좁아진다. 균일 배율은 몸이 어떤 자세든 같은 동전을 바닥에 놓는다.
    const tilt = Math.min(1, span / 1.1);
    keeperShadow.scale.set(shrink * (1 + tilt * 1.15), shrink * (1 - tilt * 0.4), shrink);
    keeperShadow.material.opacity = 0.72 * shrink;
    keeperShadow.children[0].material.opacity = 0.86 * shrink;
    // 행인은 판정과 무관하게 계속 걷는다. 멈춘 배경은 그림이고 움직이는 배경은 장소다.
    for (const [i, p] of passers.entries()) {
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
      } else {
        // 프레임당 상수로 걸으면 세계시간이 멈춰도 행인만 계속 간다.
        // 정지 프레임을 두 장 찍어 비교하는 계측이 그 걸음을 전부 잡음으로 읽는다.
        p.position.x += p.userData.speed * dt;
        // 되돌리는 자리가 화면 안이면 순간이동이 그대로 보인다.
        // 행인을 깊이로 흩은 뒤 가장 먼 줄(z≈39)의 화면 반폭이 33.4m가 됐다. 34는 그 턱밑이다.
        if (p.position.x > 42) {
          p.position.x = -42;
          // 같은 줄로 돌아오면 다섯이 영원히 같은 순서로 지나간다.
          p.position.z = p.userData.homeZ + (p.userData.phase % 1) * 3.2 - 1.6;
        }
        p.rotation.z = Math.sin(vnow * 6 * p.userData.speed + p.userData.phase) * 0.06;
      }
      // 걸음보다 먼저 놓으면 그림자는 한 프레임 뒤처진 자리에 선다.
      // 세계시간이 멈춘 첫 프레임이 그 한 걸음을 따라잡아 정지 프레임 두 장이 갈린다.
      passerShadows[i].position.set(p.position.x, 0.03, p.position.z);
    }
    kickerShadow.position.set(kicker.position.x, 0.03, kicker.position.z);
    // 잔상은 지나온 자리를 따라간다. 매 프레임 전부 옮기면 공이 여덟 개인 것으로 읽힌다.
    // 세계시간이 멈추면 잔상도 그 프레임의 모습 그대로 서 있어야 한다.
    // 갱신을 계속 돌리면 같은 자리가 거듭 쌓여 step이 0이 되고 링이 스스로 꺼진다.
    if (cue && !tail && dt > 0) {
      trail.unshift(ball.position.clone());
      if (trail.length > TRAIL_MAX) trail.length = TRAIL_MAX;
      // 간격을 공 반지름에 고정하면 자취가 그보다 짧을 때 남는 마디가 가장 오래된 점에 쌓인다.
      // 실측: 잔상 전체가 공 지름 41px 안에 들어와 꼬리가 아니라 공에 낀 후광으로 읽혔다.
      // 그래서 지금까지 날아온 길이를 마디 수로 등분해 놓는다. 자취가 자라면 꼬리도 같이 자란다.
      // 바닥은 공 반지름이다. 킥 직후 자취가 한 뼘일 때 마디가 다시 한 점에 겹치는 것을 막는다.
      let flown = 0;
      for (let k = 1; k < trail.length; k++) flown += trail[k - 1].distanceTo(trail[k]);
      const SP = Math.max(BALL_R * ballGain * 0.85, flown / (GHOSTS - 1));
      const pts = [];
      for (let i = 0; i < GHOSTS; i++) pts.push(trailPoint(i * SP) || trail[0].clone());
      ribTail = pts[GHOSTS - 1];
      // 띠를 벌리는 방향은 자취의 접선과 시선의 외적이다. 월드 축으로 벌리면
      // 공이 카메라로 곧장 올 때 띠가 종잇장처럼 서서 한 줄로 사라진다.
      const tan = new THREE.Vector3();
      const view = new THREE.Vector3();
      const side = new THREE.Vector3();
      for (let i = 0; i < GHOSTS; i++) {
        const prev = pts[Math.max(0, i - 1)];
        const next = pts[Math.min(GHOSTS - 1, i + 1)];
        tan.subVectors(next, prev);
        if (tan.lengthSq() < 1e-8) tan.set(0, 0, 1);
        view.subVectors(camera.position, pts[i]);
        side.crossVectors(tan, view);
        if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
        // 공에 만화 배율이 걸리면 띠도 같이 걸어야 꼬리가 공과 같은 굵기에서 시작한다.
        side.normalize().multiplyScalar(BALL_R * ballGain * RIB_W(i));
        for (const s of [0, 1]) {
          const o = (i * 2 + s) * 3;
          const sg = s === 0 ? 1 : -1;
          ribPos[o] = pts[i].x + side.x * sg;
          ribPos[o + 1] = pts[i].y + side.y * sg;
          ribPos[o + 2] = pts[i].z + side.z * sg;
        }
      }
      ribGeo.attributes.position.needsUpdate = true;
      ribbon.visible = true;
      ribbon.userData.lit = true;
      ribCap.position.copy(ribTail);
      ribCap.scale.setScalar(ballGain * RIB_W(GHOSTS - 1));
      ribCap.visible = true;
      // 0.2는 흙 위에서 사라졌다. 그렇다고 상수로 올리면 굴러오는 공에도 속도선이 붙어 늘 빠른 것으로 읽힌다.
      // 이번 프레임에 공이 간 거리로 정한다. 느리면 띠가 없고 빠르면 진해진다.
      const step = trail.length > 1 ? trail[0].distanceTo(trail[1]) : 0;
      // 킥 직후에는 꼬리가 없다. 그런데도 띠를 그리면 마디가 전부 한 점에 겹쳐
      // 발치에 노란 덩어리가 붙는다. 꼬리가 길어진 다음에만 켜다.
      const grown = trail.length >= GHOSTS;
      // 0.42로는 3배 확대해야 꼬리가 보였다. 머리를 0.72까지 올리고 뒤로 갈수록 정점 알파로 뺀다.
      ghostAlpha = grown ? Math.min(0.72, Math.max(0, (step - 0.04) * 4.2)) : 0;
      ribbon.material.opacity = ghostAlpha;
      // 띠 끝 정점 알파는 0이다. 맺음 공까지 0이면 띠가 허공에서 끊긴다. 머리의 3할로 남긴다.
      ribCap.material.opacity = ghostAlpha * 0.3;
    } else if ((!cue || tail) && ribbon.visible) {
      ribbon.visible = false;
      ribbon.userData.lit = false;
      ribCap.visible = false;
    }
    // 정지 프레임에서도 상태가 유지되어야 하므로 잔상 갱신 조건 바깥에서 정한다.
    setOverlay(Boolean(cue) && !tail && ball.position.z > OVERLAY_Z);

    // 흔들림을 먼저 얹고 그 카메라로 잰다. 흔들리기 전 카메라로 재면 게이트는 흔들림을 못 본다.
    // 측정 프레임만 빼는 것은 우회다. 게이트가 견딜 때까지 진폭을 줄이는 쪽이 맞다.
    camera.position.copy(CAM_BASE);
    camLook.copy(CAM_LOOK);
    if (camEvLeft > 0) {
      const amt = camEvAmount();
      camEvLeft -= dt;
      // 타이틀은 자기 궤도를 돈다. 사건 오프셋을 얹으면 그 궤도가 튄다.
      if (!titleMode) {
        camera.position.x += camEv.pos[0] * amt * camMx;
        camera.position.y += camEv.pos[1] * amt;
        camera.position.z += camEv.pos[2] * amt;
        camLook.x += camEv.look[0] * amt * camMx;
        camLook.y += camEv.look[1] * amt;
        camLook.z += camEv.look[2] * amt;
        camera.fov = fovBase + camEv.fov * amt;
        camera.updateProjectionMatrix();
      }
      if (camEvLeft <= 0) {
        camEv = null;
        // 화각은 매 프레임 덮어쓰이지 않는다. 끝날 때 기준값으로 되돌리지 않으면 좁아진 채로 굳는다.
        camera.fov = fovBase;
        camera.updateProjectionMatrix();
      }
    }
    if (shakeLeft > 0) {
      shakeLeft -= dt;
      // 감쇠 없이 흔들면 끝날 때 뚝 끊긴다. 남은 시간에 비례해 잦아든다.
      const k = shakeAmp * Math.max(0, shakeLeft / shakeSpan);
      // 사인 두 개를 정수비로 겹치면 규칙적인 원운동이 되고 카메라가 도는 것으로 읽힌다.
      const sx = Math.sin(vnow * 61) * k;
      const sy = Math.sin(vnow * 47 + 1.7) * k * 0.8;
      camera.position.x += sx;
      camera.position.y += sy;
      camOffPeak = Math.max(camOffPeak, Math.hypot(sx, sy));
      if (shakeLeft <= 0) shakeAmp = 0;
    }
    camera.lookAt(camLook);
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
    if (netAmp > 0.012) {
      netT += dt;
      // 천은 두 시계로 움직인다. 떨림은 빨리 죽고, 밀린 배는 천천히 돌아온다.
      // 하나로 묶어 순수 사인만 쓰면 반주기마다 정확히 원위치를 지나가고,
      // 그 순간을 찍은 정지 프레임에서는 그물이 아예 안 밀린 것으로 읽힌다.
      // 실측: talked가 320ms에 27px였다가 크리틱이 보는 520ms에 0.30px였다.
      netAmp *= Math.exp(-dt * 1.5);
      const ring = Math.cos(netT * 13) * Math.exp(-netT * 4.4);
      pitch.net.userData.punch(netX, netY, -netAmp * (0.7 + 0.3 * ring));
    } else if (netAmp !== 0) {
      netAmp = 0;
      pitch.net.userData.punch(0, 0, 0);
    }
    impact.update(dt, camera);
    // 세계시계로 줄인다. 히트스톱이 걸린 사건에서는 짜부라짐도 같이 늘어져 보인다.
    // 진행축이 아니라 화면축으로 눌린다. 공은 카메라를 향해 오므로 진행축 변형은 크기 변화로만 보인다.
    if (sqLeft > 0) {
      sqLeft = Math.max(0, sqLeft - stepDt);
      const e = Math.pow(sqLeft / SQ_DUR, 2);
      ball.scale.set(ballGain * (1 + e * 0.34), ballGain * (1 - e * 0.26), ballGain * (1 + e * 0.34));
    }
    squashPeak = Math.max(squashPeak, Math.abs(ball.scale.x / Math.max(0.001, ball.scale.y) - 1));
    if (cue) { ballProbe.sample(tail ? tail.kind : 'flight'); stageProbe.sample(); }
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

  // 사건이 없을 때 화면이 정말 멈추는지를 계측이 확인할 수 있어야 한다.
  // 게임은 사건 사이에도 계속 진행하므로, 대기 시간만으로는 정지 상태를 만들 수 없다.
  window.__freeze = (on) => {
    frozen = Boolean(on);
    document.body.classList.toggle('frozen', frozen);
    return frozen;
  };

  // 프리즈 중에 카메라가 움직이면 세계시계가 새는 것인지 카메라 경로만 새는 것인지
  // 화면으로는 구분이 안 된다. 렌더 쪽 시간 변수를 그대로 내보낸다.
  window.__camDbg = () => ({ vnow, camEvLeft, shakeLeft, dutchLeft, stopLeft, fovBase, fov: camera.fov, frozen, frames });

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

  // 잔상이 코드에 있다는 것과 날아오는 동안 화면에 남는다는 것은 다른 주장이다.
  // 켜짐 조건, 진하기, 화면상 공 크기를 비행 중에 되물어야 어디가 안 켜지는지 말할 수 있다.
  window.__flightVis = () => {
    const h = renderer.domElement.clientHeight || 1;
    const d = Math.max(0.01, ball.position.distanceTo(camera.position));
    const px = (2 * BALL_R / d) / (2 * Math.tan(camera.fov * Math.PI / 360)) * h;
    // 잔상이 켜졌다는 것과 공 바깥에 무언가를 남겼다는 것은 다른 주장이다.
    // 카메라가 공의 진행축 위에 있으면 잔상은 전부 공 뒤에 겹쳐 한 덩어리가 된다.
    // 그래서 화면에서 공 실루엣 밖으로 얼마나 나갔는지를 재야 꼬리가 보인다고 말할 수 있다.
    const w = renderer.domElement.clientWidth || 1;
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const toScreen = (v) => { const n = v.clone().project(camera); return [(n.x * 0.5 + 0.5) * w, (-n.y * 0.5 + 0.5) * h]; };
    const screenR = (v, r) => {
      const a = toScreen(v);
      const b = toScreen(v.clone().addScaledVector(right, r));
      return Math.hypot(b[0] - a[0], b[1] - a[1]);
    };
    const bc = toScreen(ball.position);
    const br = screenR(ball.position, BALL_R * ball.scale.x);
    let ringPx = 0;
    if (ribbon.visible && ribbon.material.opacity > 0 && ribTail) {
      const gc = toScreen(ribTail);
      const gr = screenR(ribTail, BALL_R * ballGain * RIB_W(GHOSTS - 1));
      ringPx = Math.hypot(gc[0] - bc[0], gc[1] - bc[1]) + gr;
    }
    return {
      cue: Boolean(cue && !tail),
      z: ball.position.z,
      trail: trail.length,
      step: trail.length > 1 ? trail[0].distanceTo(trail[1]) : 0,
      opacity: ghostAlpha,
      shown: ribbon.visible ? GHOSTS : 0,
      px,
      ballPx: br * 2,
      ringPx
    };
  };

  // 선언된 잔상과 화면에 남은 잔상은 다른 주장이다. 화소로 재려면 같은 프레임을
  // 공만 뺀 것, 공과 잔상을 뺀 것으로도 그려야 차분이 무엇의 화소인지 말할 수 있다.
  window.__flightHide = (mode) => {
    ball.visible = mode !== 'both';
    const off = mode === 'ghosts' || mode === 'both';
    if (ribbon.userData.lit) {
      ribbon.visible = !off;
      ribCap.visible = !off;
    }
    return { ball: ball.visible, ghosts: mode };
  };

  // 차분이 갈렸다는 것과 무엇이 갈렸는지는 다른 주장이다.
  // 네 장을 찍는 사이에 선언 상태가 어떻게 움직였는지 같이 적어야
  // 잔상이 남은 것인지 복원이 원본과 다른 것인지 화소를 보기 전에 갈린다.
  window.__flightState = () => ({
    ball: ball.visible,
    shown: ribbon.visible ? GHOSTS : 0,
    lit: ribbon.userData.lit ? GHOSTS : 0,
    opacity: ghostAlpha
  });

  // 임팩트 프레임은 선언으로 증명되지 않는다. 세계시계가 실제로 늦었는지,
  // 그물이 밀렸다는 것과 화면에서 출렁여 보인다는 것은 다른 주장이다.
  // 카메라가 골대 뒤에서 +z를 보므로 뒷그물의 z 변위는 시선축과 거의 나란하다.
  // 월드 변위가 아무리 커도 화면에서는 원근 축소로만 남을 수 있어 화소로 같이 잰다.
  window.__netVis = () => {
    const n = pitch.net;
    const rest = n.userData.restPos;
    const arr = n.geometry.attributes.position.array;
    const w = renderer.domElement.clientWidth || 1;
    const h = renderer.domElement.clientHeight || 1;
    camera.updateMatrixWorld();
    n.updateMatrixWorld();
    const a = new THREE.Vector3();
    const c = new THREE.Vector3();
    let maxDz = 0;
    let maxPx = 0;
    let moved = 0;
    for (let i = 0; i < arr.length; i += 3) {
      const dz = arr[i + 2] - rest[i + 2];
      if (Math.abs(dz) > maxDz) maxDz = Math.abs(dz);
      if (Math.abs(dz) < 1e-5) continue;
      moved += 1;
      a.set(rest[i], rest[i + 1], rest[i + 2]).applyMatrix4(n.matrixWorld).project(camera);
      c.set(arr[i], arr[i + 1], arr[i + 2]).applyMatrix4(n.matrixWorld).project(camera);
      const px = Math.hypot((c.x - a.x) * w * 0.5, (c.y - a.y) * h * 0.5);
      if (px > maxPx) maxPx = px;
    }
    return { amp: netAmp, maxDz, maxPx, moved };
  };

  // 임팩트 프레임은 선언으로 증명되지 않는다. 세계시계가 실제로 늦었는지,
  // 렌즈가 밀렸는지, 공이 찌그러졌는지를 사건마다 최고값으로 적는다.
  window.__impactVis = () => ({
    stop: stopLeft,
    shake: shakeLeft,
    camOff: camOffPeak,
    squash: squashPeak,
    ...impact.state()
  });

  // 임팩트를 뺀 같은 프레임. 차분이 임팩트의 화소다.
  window.__impactHide = (on) => impact.hide(on);

  renderer.setAnimationLoop(frame);

  function reset() {
    cue = null;
    tail = null;
    pendingBurst = null;
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
    ballGain = 1;
    sqLeft = 0;
    ball.rotation.set(0, 0, 0);
    trail.length = 0;
    ribbon.visible = false;
    ribbon.userData.lit = false;
    ribCap.visible = false;
    stopLeft = 0;
    kickPop = 0;
    kicker.scale.setScalar(1);
    keeperPop = 0;
    keeper.scale.setScalar(1);
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
  const rectV = new THREE.Vector3();
  // 로컬 판의 네 귀퉁이를 그대로 투영한다. 월드 축정렬 상자를 쓰면 그림자가 누운 각만큼
  // 상자가 부풀어 같은 그늘이 더 작아 보인다. 면적을 재는 쪽에서는 그게 곧 오판이다.
  const rectCorner = [[0, 0], [1, 0], [1, 1], [0, 1]];
  function shadowRect(w = 1280, h = 720) {
    keeperShadow.updateMatrixWorld(true);
    if (!keeperShadow.geometry.boundingBox) keeperShadow.geometry.computeBoundingBox();
    const bb = keeperShadow.geometry.boundingBox;
    const quad = [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [cx, cy] of rectCorner) {
      rectV.set(cx ? bb.max.x : bb.min.x, cy ? bb.max.y : bb.min.y, 0);
      rectV.applyMatrix4(keeperShadow.matrixWorld).project(camera);
      const px = (rectV.x * 0.5 + 0.5) * w;
      const py = (1 - (rectV.y * 0.5 + 0.5)) * h;
      quad.push([px, py]);
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    return {
      x: Math.round(minX), y: Math.round(minY),
      w: Math.round(maxX - minX), h: Math.round(maxY - minY), quad
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
    // 세계시계. 히트스톱과 정지가 여기서 멈추므로, 화면에 숫자를 쓰는 쪽은 실시간 대신 이걸 읽는다.
    now: () => vnow,
    after,
    cancel,
    leaveTitle() { titleMode = false; },
    set diving(v) { divingStat = v; } };
}
