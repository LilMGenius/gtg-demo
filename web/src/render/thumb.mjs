// 상품 썸네일. 선반이 글자만 있으면 그것은 목록이지 진열이 아니다.
// 파는 것이 겉모습이므로 파는 물건을 그려서 보여 준다.
//
// 렌더러는 하나만 연다. 카드마다 WebGL 맥락을 열면 열 몇 장에서 브라우저 상한에 걸리고,
// 상한에 걸린 맥락은 조용히 검은 사각형이 된다. 한 대를 돌려 쓰고 결과만 이미지로 굽는다.
import * as THREE from "../../vendor/three.module.min.js";
import { buildKeeper } from "./objects/actors.mjs";

// 굽는 크기. 화면에는 절반으로 눕히므로 고밀도 화면에서도 계단이 안 보인다.
const BAKE = 256;

// 상품마다 봐야 할 곳이 다르다. 장갑을 온몸 썸네일로 보여 주면 손은 여덟 화소가 된다.
// part는 무엇을 겨냥하는지, dist는 그 부위가 칸을 채우는 거리, lift는 시선 높이 보정이다.
const AIM = {
  grip: { part: "glove", dist: 0.86, lift: -0.07 },
  studs: { part: "boot", dist: 1.05, lift: 0.06 },
  pads: { part: "torso", dist: 1.5, lift: 0 },
  socks: { part: "shin", dist: 1.05, lift: 0.02 },
  hair: { part: "head", dist: 0.8, lift: 0 },
  ink: { part: "arm", dist: 1.1, lift: 0 },
  // 탈의실의 온몸. 부위가 아니라 사람을 보여 준다. 무엇을 걸쳤는지가 아니라
  // 걸친 뒤의 내가 어떻게 보이는지가 이 칸이 답하는 질문이다.
  body: { part: "torso", dist: 2.7, lift: 0.02 }
};

let R = null;
let scene = null;
let cam = null;
let rig = null;

function boot() {
  if (R) return;
  const cv = document.createElement("canvas");
  cv.width = BAKE;
  cv.height = BAKE;
  R = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: true, preserveDrawingBuffer: true });
  R.setSize(BAKE, BAKE, false);
  scene = new THREE.Scene();
  // 경기장과 같은 빛을 쓴다. 상점에서 본 색과 화면에서 신은 색이 다르면 산 것이 다른 물건이 된다.
  scene.add(new THREE.HemisphereLight(0xdfe8ef, 0x2b2a24, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(-1.4, 2.2, 1.8);
  scene.add(key);
  cam = new THREE.PerspectiveCamera(32, 1, 0.01, 40);
}

function partPoint(k, part) {
  const v = new THREE.Vector3();
  const j = k.userData.joints;
  if (part === "glove" && k.userData.gloves && k.userData.gloves[0]) k.userData.gloves[0].getWorldPosition(v);
  else if (part === "head") k.userData.head.getWorldPosition(v);
  else if (part === "torso") k.userData.torso.getWorldPosition(v);
  else if (part === "arm" && k.userData.arms && k.userData.arms[0]) k.userData.arms[0].getWorldPosition(v);
  else if (part === "shin" && j && j.knL) { j.knL.getWorldPosition(v); v.y -= 0.16; }
  else if (part === "boot" && j && j.knL) { j.knL.getWorldPosition(v); v.y -= 0.32; }
  else k.userData.torso.getWorldPosition(v);
  return v;
}

// 한 장을 굽는다. 같은 자세와 같은 각도로 구워야 등급끼리의 차이가 색과 모양에서만 나온다.
function frame(kind, keeper, look, yaw) {
  boot();
  if (rig) scene.remove(rig);
  rig = buildKeeper(keeper.height, keeper.weight, look);
  rig.updateMatrixWorld(true);
  scene.add(rig);
  const aim = AIM[kind] || { part: "torso", dist: 1.3, lift: 0 };
  const at = partPoint(rig, aim.part);
  at.y += aim.lift;
  const a = yaw === undefined ? -0.7 : yaw;
  cam.position.set(at.x + Math.sin(a) * aim.dist, at.y + aim.dist * 0.22, at.z + Math.cos(a) * aim.dist);
  cam.lookAt(at);
  R.render(scene, cam);
}

export function thumbURL(kind, keeper, look) {
  if (!AIM[kind]) return "";
  frame(kind, keeper, look);
  return R.domElement.toDataURL("image/png");
}

let spinning = null;

// 호버에서 천천히 돈다. 정지한 그림은 무엇을 샀는지 한 면만 보여 준다.
export function startSpin(host, kind, keeper, look) {
  if (!AIM[kind]) return;
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
