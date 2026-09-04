// 상품 썸네일. 선반이 글자만 있으면 그것은 목록이지 진열이 아니다.
// 파는 것이 겉모습이므로 파는 물건을 그려서 보여 준다.
//
// 렌더러는 하나만 연다. 카드마다 WebGL 맥락을 열면 열 몇 장에서 브라우저 상한에 걸리고,
// 상한에 걸린 맥락은 조용히 검은 사각형이 된다. 한 대를 돌려 쓰고 결과만 이미지로 굽는다.
import * as THREE from "../../vendor/three.module.min.js";
import { buildKeeper } from "./objects/actors.mjs";
import { meshPanel, buildPassers } from "./objects/pitch.mjs";
import { frameAt, cityAt } from "../state/gear.mjs";

// 행인 수는 경기장이 쓰는 그 규칙이다. 다섯에서 시작해 등급마다 둘이 는다.
const PASSER_BASE = 5;
const PASSER_STEP = 2;

// 굽는 크기. 화면에는 절반으로 눕히므로 고밀도 화면에서도 계단이 안 보인다.
// 정사각으로 구우면 210x96 썸네일 칸에서 contain이 96x96으로 줄여 넣고 좌우 114px이 빈다.
// 칸의 비율로 구우면 같은 물건이 같은 자리에서 두 배 넓게 선다.
const BAKE_W = 448;
const BAKE_H = 205;

// 상품마다 봐야 할 곳이 다르다. 장갑을 온몸 썸네일로 보여 주면 손은 여덟 화소가 된다.
// part는 무엇을 겨냥하는지, dist는 그 부위가 칸을 채우는 거리, lift는 시선 높이 보정,
// high는 눈높이 배율이다. 파는 면이 위에 있으면 내려다보고 밑에 있으면 올려다본다.
const AIM = {
  grip: { part: "glove", dist: 0.86, lift: -0.07 },
  // 축구화가 파는 것은 밑창이다. 위에서 내려다보면 돌기가 갑피에 가려 여덟 개나 셋이나 같다.
  studs: { part: "boot", dist: 0.72, lift: -0.02, high: -0.34 },
  pads: { part: "torso", dist: 1.5, lift: 0 },
  socks: { part: "shin", dist: 1.05, lift: 0.02 },
  // 겨냥점은 머리 한가운데인데 파는 것은 그 위에 얹힌 껍데기다. 보정 없이 잡으면
  // 모히칸의 무게중심이 칸 위에서 13퍼센트 지점에 걸려 볏이 잘린다.
  hair: { part: "head", dist: 0.78, lift: 0.1, high: 0.1 },
  ink: { part: "arm", dist: 1.1, lift: 0 },
  // 탈의실의 온몸. 부위가 아니라 사람을 보여 준다. 무엇을 걸쳤는지가 아니라
  // 걸친 뒤의 내가 어떻게 보이는지가 이 칸이 답하는 질문이다.
  body: { part: "torso", dist: 2.7, lift: 0.02 }
};

/* 골대와 동네는 몸에 안 걸친다. 사람을 겨냥하는 AIM으로는 못 찍으므로 장면 조각을 따로 세운다.
   두 칸 다 등급이 화면을 바꾸는 물건이라, 파는 것이 곧 그 장면의 모습이다. */
let sceneRig = null;

function clearScene() {
  if (!sceneRig) return;
  scene.remove(sceneRig);
  sceneRig.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  sceneRig = null;
}

// 골대 한 짝. 흰 기둥 둘과 크로스바, 그 뒤에 그 등급의 그물 한 장.
function goalRig(rank) {
  const g = frameAt(rank);
  const grp = new THREE.Group();
  // 실제 골대 폭 7.32에 높이 2.44를 4로 나눈 축소판이다. 칸 안에서 비율이 실물과 같아야
  // 상점에서 본 것과 경기장에 선 것이 같은 물건으로 읽힌다.
  const W = 7.32 / 4;
  const H = 2.44 / 4;
  const bar = new THREE.MeshLambertMaterial({ color: 0xf2f4f0 });
  const post = new THREE.BoxGeometry(0.055, H, 0.055);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(post, bar);
    m.position.set(s * W / 2, H / 2, 0);
    grp.add(m);
  }
  const cross = new THREE.Mesh(new THREE.BoxGeometry(W + 0.055, 0.055, 0.055), bar);
  cross.position.set(0, H, 0);
  grp.add(cross);
  // 그물은 경기장이 쓰는 그 함수로 짠다. 여기서 따로 그리면 등급 차이가 두 곳에서 갈린다.
  // 실 색만 다르다. 경기장의 뒷그물은 흙을 배경으로 서기 때문에 어둡고, 칸 안에서 그 색을 쓰면
  // 어두운 판때기에 묻혀 크로스바 하나만 남는다. 하늘을 등지므로 흰 실이 맞다.
  const net = meshPanel(W, H, g.cell / 4, 0xe6ede0, g.dim, g.sag / 4);
  net.position.set(0, H / 2, -0.34);
  grp.add(net);
  // 바닥과 하늘을 준다. 골대만 떠 있으면 무엇 앞에 선 물건인지가 안 읽힌다.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 12),
    new THREE.MeshLambertMaterial({ color: 0x8d6a41 }));
  ground.rotation.x = -Math.PI / 2;
  grp.add(ground);
  grp.userData.sky = cityAt(0).sky;
  // 골대는 0.13으로 거의 정면에서 본다. 높이가 0.61m뿐이라 행인과 같은 0.26으로 내려다보면
  // 화면 가운데가 땅이 되고 크로스바만 남는다. 3.6은 문틀 좌우가 칸에 다 들어가는 거리다.
  return { grp, at: new THREE.Vector3(0, H * 0.52, -0.2), dist: 3.6, high: 0.13 };
}

// 동네 한 조각. 그 등급의 하늘 아래 그 등급만큼의 행인이 선다.
function cityRig(rank) {
  const c = cityAt(rank);
  const grp = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30),
    new THREE.MeshLambertMaterial({ color: 0x8d6a41 }));
  ground.rotation.x = -Math.PI / 2;
  grp.add(ground);
  // 행인 수는 경기장과 같은 식으로 센다. 다섯에서 시작해 등급마다 둘씩 는다.
  const n = PASSER_BASE + PASSER_STEP * rank;
  const who = buildPassers(grp, n);
  // 경기장은 행인을 84미터 걷는 구간에 흩어 놓는다. 그 좌표 그대로 칸에 담으면
  // 다섯이든 열하나든 전부 프레임 밖이라 등급 차이가 하늘색뿐인 그림이 나온다.
  // 칸 안에서는 한 줄로 세워, 몇 명인지가 그림 자체로 읽히게 한다.
  const span = 5.6;
  who.forEach((g, i) => {
    const u = n === 1 ? 0.5 : i / (n - 1);
    g.position.set(-span / 2 + span * u, 0, -1.2 + ((i % 3) - 1) * 0.55);
    g.rotation.y = 0;
  });
  grp.userData.sky = c.sky;
  // 폭은 등급과 무관하게 고정한다. 인원만 늘어야 같은 자리에 사람이 빽빽해지는 것으로 읽힌다.
  // 9.5는 열한 명 전신이 잘리지 않고 다 들어가는 거리이고, 그보다 가까우면 다섯과 열하나가
  // 둘 다 화면을 꽉 채워 등급 차이가 사라진다.
  return { grp, at: new THREE.Vector3(0, 0.85, -1), dist: 9.5, high: 0.26 };
}

let R = null;
let scene = null;
let cam = null;
let rig = null;

function boot() {
  if (R) return;
  const cv = document.createElement("canvas");
    cv.width = BAKE_W;
    cv.height = BAKE_H;
  R = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: true, preserveDrawingBuffer: true });
    R.setSize(BAKE_W, BAKE_H, false);
  scene = new THREE.Scene();
  // 경기장과 같은 빛을 쓴다. 상점에서 본 색과 화면에서 신은 색이 다르면 산 것이 다른 물건이 된다.
  scene.add(new THREE.HemisphereLight(0xdfe8ef, 0x2b2a24, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(-1.4, 2.2, 1.8);
  scene.add(key);
    // 세로 화각이 프레임을 정한다. 가로로 넓히면 담기는 폭만 늘고 물건 높이는 그대로다.
    cam = new THREE.PerspectiveCamera(32, BAKE_W / BAKE_H, 0.01, 40);
}

function partPoint(k, part) {
  const v = new THREE.Vector3();
  const j = k.userData.joints;
  if (part === "glove" && k.userData.gloves && k.userData.gloves[0]) k.userData.gloves[0].getWorldPosition(v);
  else if (part === "head") k.userData.head.getWorldPosition(v);
  else if (part === "torso") k.userData.torso.getWorldPosition(v);
  else if (part === "arm" && k.userData.arms && k.userData.arms[0]) k.userData.arms[0].getWorldPosition(v);
  else if (part === "shin" && j && j.knL) { j.knL.getWorldPosition(v); v.y -= 0.16; }
  else if (part === "boot" && k.userData.boots && k.userData.boots[0]) k.userData.boots[0].getWorldPosition(v);
  else if (part === "boot" && j && j.knL) { j.knL.getWorldPosition(v); v.y -= 0.32; }
  else k.userData.torso.getWorldPosition(v);
  return v;
}

// 한 장을 굽는다. 같은 자세와 같은 각도로 구워야 등급끼리의 차이가 색과 모양에서만 나온다.
function frame(kind, keeper, look, yaw) {
  boot();
  // 장면 칸은 사람을 안 세운다. 골대와 동네는 등급이 곧 그 장면이라 조각을 통째로 갈아 끼운다.
  if (kind === "frame" || kind === "city") {
    if (rig) { scene.remove(rig); rig = null; }
    clearScene();
    const made = kind === "frame" ? goalRig(look) : cityRig(look);
    sceneRig = made.grp;
    scene.add(sceneRig);
    // 동네는 하늘이 상품의 절반이다. 골대 칸은 배경을 비워 그물이 칸을 채우게 둔다.
    scene.background = sceneRig.userData.sky === undefined ? null : new THREE.Color(sceneRig.userData.sky);
    const a = yaw === undefined ? -0.35 : yaw;
    // 눈높이는 칸이 정한다. 골대와 행인은 크기가 여섯 배 차이라 같은 각으로 보면 한쪽이 늘 잘린다.
    cam.position.set(made.at.x + Math.sin(a) * made.dist, made.at.y + made.dist * made.high, made.at.z + Math.cos(a) * made.dist);
    cam.lookAt(made.at);
    R.render(scene, cam);
    return;
  }
  clearScene();
  scene.background = null;
  if (rig) scene.remove(rig);
  rig = buildKeeper(keeper.height, keeper.weight, look);
  rig.updateMatrixWorld(true);
  scene.add(rig);
  const aim = AIM[kind] || { part: "torso", dist: 1.3, lift: 0 };
  const at = partPoint(rig, aim.part);
  at.y += aim.lift;
  const a = yaw === undefined ? -0.7 : yaw;
  const high = aim.high === undefined ? 0.22 : aim.high;
  cam.position.set(at.x + Math.sin(a) * aim.dist, at.y + aim.dist * high, at.z + Math.cos(a) * aim.dist);
  cam.lookAt(at);
  R.render(scene, cam);
}

export function thumbURL(kind, keeper, look) {
  if (!AIM[kind] && kind !== "frame" && kind !== "city") return "";
  frame(kind, keeper, look);
  return R.domElement.toDataURL("image/png");
}

let spinning = null;

// 호버에서 천천히 돈다. 정지한 그림은 무엇을 샀는지 한 면만 보여 준다.
export function startSpin(host, kind, keeper, look) {
  if (!AIM[kind] && kind !== "frame" && kind !== "city") return;
  boot();
  stopSpin();
  const cv = R.domElement;
  cv.style.cssText = "width:100%;height:100%;display:block";
  host.appendChild(cv);
  const t0 = performance.now();
  const tick = () => {
    if (!spinning) return;
    // 한 바퀴에 8초. 더 빠르면 물건을 보는 것이 아니라 돌아가는 것을 보게 된다.
    frame(kind, keeper, look, -0.7 + ((performance.now() - t0) / 8000) * Math.PI * 2);
    spinning = requestAnimationFrame(tick);
  };
  spinning = requestAnimationFrame(tick);
}

export function stopSpin() {
  if (spinning) cancelAnimationFrame(spinning);
  spinning = null;
  if (R && R.domElement.parentNode) R.domElement.parentNode.removeChild(R.domElement);
}
