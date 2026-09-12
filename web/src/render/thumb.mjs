// 상품 썸네일. 선반이 글자만 있으면 그것은 목록이지 진열이 아니다.
// 파는 것이 겉모습이므로 파는 물건을 그려서 보여 준다.
//
// 렌더러는 하나만 연다. 카드마다 WebGL 맥락을 열면 열 몇 장에서 브라우저 상한에 걸리고,
// 상한에 걸린 맥락은 조용히 검은 사각형이 된다. 한 대를 돌려 쓰고 결과만 이미지로 굽는다.
import * as THREE from "../../vendor/three.module.min.js";
import { buildKeeper } from "./objects/actors.mjs";
import { meshPanel, buildPassers } from "./objects/pitch.mjs";
import { placeCardGeo } from "./objects/places.mjs";
import { flatVertex, mergeGeos } from "./units.mjs";
import { skinAt, placeAt } from "../state/gear.mjs";

// 행인 수는 경기장이 쓰는 그 규칙이다. 다섯에서 시작해 등급마다 둘이 는다.
const PASSER_BASE = 5;
const PASSER_STEP = 2;

// 굽는 크기. 화면에는 절반으로 눕히므로 고밀도 화면에서도 계단이 안 보인다.
// 정사각으로 구우면 210x96 썸네일 칸에서 contain이 96x96으로 줄여 넣고 좌우 114px이 빈다.
// 칸의 비율로 구우면 같은 물건이 같은 자리에서 두 배 넓게 선다.
const BAKE_W = 448;
const BAKE_H = 205;
/* 온몸만 세로로 굽는다. 사람은 세로로 긴 피사체라 448x205 가로 칸에 세우면 정사각 미리보기에서
   contain이 높이를 205로 줄이고, 그때 사람이 칸 높이의 45%만 써서 막대로 읽힌다.
   긴 변은 그대로 두고 눕힌 것을 세운다. 336폭은 준비 자세로 벌린 팔 1.63m(측정: 키 205)가
   프레임 가로 2.03m 안에 좌우 여백과 함께 들어가는 비율이다. */
const BODY_W = 336;
const BODY_H = 448;
/* 봇과 버프는 선반 카드에만 서는 칸이다. 카드의 썸네일 자리가 카드 폭의 60%라
   448x205로 구우면 위아래로 24%가 빈 띠로 남고 그만큼 상품이 작아진다.
   새로 여는 두 칸은 처음부터 그 자리의 비율로 굽는다. 옛 여덟 칸의 겨냥은 205 높이에 맞춰
   하나씩 실측으로 잡힌 값이라 같이 안 옮긴다. */
const CARD_W = 448;
const CARD_H = 269;
const sizeOf = (kind) => (kind === "body" ? [BODY_W, BODY_H]
  : kind === "bot" || kind === "buff" ? [CARD_W, CARD_H] : [BAKE_W, BAKE_H]);

// 상품마다 봐야 할 곳이 다르다. 장갑을 온몸 썸네일로 보여 주면 손은 여덟 화소가 된다.
// part는 무엇을 겨냥하는지, dist는 그 부위가 칸을 채우는 거리, lift는 시선 높이 보정,
// high는 눈높이 배율이다. 파는 면이 위에 있으면 내려다보고 밑에 있으면 올려다본다.
const AIM = {
  // 겨냥점이 장갑 아래를 보고 있어 손이 칸 위쪽 27퍼센트 지점에 걸려 있었다.
  grip: { part: "glove", dist: 0.94, lift: 0.03, high: 0.12 },
  // 축구화가 파는 것은 밑창이다. 위에서 내려다보면 돌기가 갑피에 가려 여덟 개나 셋이나 같다.
  studs: { part: "boot", dist: 0.72, lift: -0.02, high: -0.34 },
  /* 앞에서 잡는다. 다른 선반과 같은 각이라 쉬는 그림과 도는 그림이 한 자세에서 이어진다.
     준비 자세의 장갑 둘이 가슴을 일부 가리지만 네 등급은 그래도 갈린다. 실측: 최악 쌍의 IoU가
     0.664로 자의 상한 0.75 아래이고, 가장 마른 등급이 칠하는 화소가 5416으로 하한 1000의 다섯 배다.
     겨냥은 목이다. 몸통 메시의 원점은 허리께인데, 상의 등급이 몸통을 세로로 늘리면 그 원점은
     제자리에 남고 목과 머리만 위로 올라간다. 그래서 허리를 잡고 고정 보정을 얹으면 보정이 몸을
     안 따라간다. 실측으로 기장 배율 1.26인 시작 상의에서 머리 중심이 프레임 위 -0.067에 서고
     눈 둘이 통째로 칸 밖이었다. 파운더가 그 칸을 얼굴 없는 그림으로 짚었다.
     목은 그 늘어남을 그대로 타는 자리다. 기장이 0.74에서 1.34로 갈려도 머리 중심이 0.367에
     머물고, 등급 넷과 변형 셋을 체격 넷에서 잰 마흔여덟 장 전부가 머리 상자와 눈을 칸에 들였다.
     어깨는 같이 들어온다. 고정 보정이 지키려던 것이 어깨인데 실측으로 그 보정이 어깨를 이미
     잘랐다. 스펀지를 넣은 저지가 키 188에서 위팔 상자 위끝 -0.131이고 키 205에서는 네 등급이
     전부 칸 밖이었다. 목을 잡으면 그 위끝이 가장 높은 칸에서도 0.145라 어깨가 칸에 남는다. */
  pads: { part: "neck", dist: 1.7, lift: 0, high: 0.1 },
  socks: { part: "shin", dist: 1.05, lift: 0.02 },
  // 겨냥점은 머리 한가운데인데 파는 것은 그 위에 얹힌 껍데기다. 보정 없이 잡으면
  // 모히칸의 무게중심이 칸 위에서 13퍼센트 지점에 걸려 볏이 잘린다.
  /* 머리는 세로로 긴 피사체인데 카드 슬롯은 210x96이라 가로로 눕는다. 축구화 카드가
     좌우로 빈다는 이유로 굽는 비율을 정사각에서 카드비로 바꿀 때 이 선반의 겨냥은
     안 따라갔고, lift와 high가 0.1씩 올라 정수리를 내려다보게 됐다. 위에서 보면
     머리카락 뚜껑만 보이고 얼굴이 눌려서 머리와 머리가 한 덩어리로 읽힌다.
     내려다보게 만드는 것은 high 하나다. lift는 주시점이라 그것까지 0으로 내리면
     머리카락이 프레임 위로 밀려 파는 물건이 작아진다. 실측으로 2등급이 칠하는 화소가
     942까지 떨어져 thumb의 하한 1000을 깼고 무게중심이 위쪽 0.12까지 올라갔다.
     정사각으로 되돌리는 갈래는 버렸다. contain이 96x96으로 줄여 넣어 옛 결함이 돌아온다. */
  hair: { part: "head", dist: 0.8, lift: 0.1, high: 0 },
  /* 파는 것은 팔이 아니라 팔에 새긴 그림이다. 겨냥점이 어깨 관절이라 lift가 그 아래
     위팔 한가운데를 잡고, 0.58에서는 칸의 대부분을 소매와 유니폼이 먹어 무늬가 위쪽
     귀퉁이에 손톱만 하게 걸린다. 실측: 세 유료 등급의 무늬가 칸의 16.6과 18.4와
     18.1퍼센트였고, 카드 크기에서 사람이 본 것은 타투가 아니라 어두운 쐐기였다.
     0.32로 붙고 각을 0.95로 틀어 팔의 바깥면을 카메라 쪽으로 돌리면 같은 셋이 84.2와
     84.4와 85.1퍼센트가 된다. 다섯 배다. 등급은 그대로 갈린다. 최악 쌍의 IoU가 0.394로
     상한 0.75 아래이고, 가장 마른 등급이 칠하는 화소가 19915로 하한 1000의 스무 배다.
     0등급은 무늬가 없어 그 몫이 0이고, 그것이 맨살을 맨살로 읽히게 하는 대조군이다.
     키는 178에서 198까지 갈리는데 그 폭 전부에서 74.9퍼센트 아래로 안 내려간다.
     각을 여기 다는 이유는 도는 그림이 이 각에서 출발하기 때문이다. yawOf가 여기서 읽는다. */
  ink: { part: "arm", dist: 0.32, lift: -0.1, high: 0.06, yaw: -0.95 },
  /* 탈의실의 온몸. 부위가 아니라 사람을 보여 준다. 무엇을 걸쳤는지가 아니라
     걸친 뒤의 내가 어떻게 보이는지가 이 칸이 답하는 질문이다.
     겨냥은 머리다. 몸통을 잡으면 카메라가 허리를 보고 정수리는 프레임 위로 밀린다
     (측정: 키 205에서 머리 중심이 프레임 위 -0.15 지점, 위쪽 8% 행에 잘린 머리 화소 936개).
     머리에 걸면 여백이 체격을 따라간다. 키가 40cm 갈려도 정수리와 프레임 위 사이는 제자리에 남고
     발만 아래로 자란다(측정: 정수리 여백 키 205에서 12%, 165에서 14.5%).
     4.73은 키 205의 정수리부터 발까지 2.25m가 프레임 세로의 83%를 쓰는 거리이고,
     -0.675는 프레임 가운데를 머리 아래 몸통 중간에 놓아 발까지 담는 보정이다.
     내려다보지 않는다. 기본 눈높이 0.22로 잡으면 정수리를 위에서 보게 되어
     온몸 그림이 머리 뚜껑부터 시작한다. */
  body: { part: "head", dist: 4.73, lift: -0.675, high: 0 }
  ,
  /* 개봉 카드의 한 사람. 탈의실 칸은 정사각인데 카드는 세로로 길어서, 같은 그림을 잘라 키우면
     위아래가 남고 좌우가 깎인다. 그러면 머리가 프레임 밖으로 나간다.
     그래서 더 멀리서 잡고 겨냥을 위로 올려, 잘려도 남는 가운데에 머리부터 무릎까지가 들어온다.
     정면이 아니라 살짝 튼 각이라 장갑 둘이 몸통을 안 가린다. */
  card: { part: "torso", dist: 3.6, lift: 0.34, high: 0.06, yaw: -0.4 }
  ,
  /* 프로필 사진. 머리와 어깨만 잡는다. 선수단과 아웃문그램과 좌상단 칩이 같은 칸을 쓰므로
     한 겨냥으로 셋을 다 먹인다. 키퍼의 얼굴은 +z를 보므로 카메라도 +z에 서야 한다.
     yaw 0이 그 자리이고, 0.24만큼 틀어야 코와 귀가 실루엣을 만든다.
     겨냥점은 머리다. 몸통을 잡고 올려 맞추면 키가 다른 선수마다 얼굴이 다른 높이에 걸린다. */
  face: { part: "head", dist: 0.62, lift: 0.02, high: 0.06, yaw: 0.24 }
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

// 골대 한 짝. 기둥 둘과 크로스바, 그 뒤에 그 등급의 그물 한 장.
// 장면 칸은 등급과 변형을 같이 받는다. 등급이 그물의 성김을 정하고 변형이 기둥 색과 늘어짐을 정한다.
function goalRig(pick) {
  const g = skinAt("frame", pick && pick.rank, pick && pick.skin);
  const grp = new THREE.Group();
  // 실제 골대 폭 7.32에 높이 2.44를 4로 나눈 축소판이다. 칸 안에서 비율이 실물과 같아야
  // 상점에서 본 것과 경기장에 선 것이 같은 물건으로 읽힌다.
  const W = 7.32 / 4;
  const H = 2.44 / 4;
  // 기둥 색은 변형이 정한다. 여기 상수로 두면 녹슨 철골대와 은색 겹그물이 같은 기둥으로 선다.
  const bar = new THREE.MeshLambertMaterial({ color: g.post });
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
  grp.userData.sky = skinAt("city", 0, 0).sky;
  // 골대는 0.13으로 거의 정면에서 본다. 높이가 0.61m뿐이라 행인과 같은 0.26으로 내려다보면
  // 화면 가운데가 땅이 되고 크로스바만 남는다. 3.6은 문틀 좌우가 칸에 다 들어가는 거리다.
  return { grp, at: new THREE.Vector3(0, H * 0.52, -0.2), dist: 3.6, high: 0.13 };
}

// 동네 한 조각. 그 등급의 하늘 아래 그 등급만큼의 행인이 선다.
function cityRig(pick) {
  const rank = Math.floor(Number(pick && pick.rank) || 0);
  const c = skinAt("city", rank, pick && pick.skin);
  // 밟는 면과 지평선은 등급이 소유한다. 여기서 색을 다시 적으면 진열과 경기장이 갈린다.
  const place = placeAt(rank);
  const grp = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30),
    new THREE.MeshLambertMaterial({ color: place.ground }));
  ground.rotation.x = -Math.PI / 2;
  grp.add(ground);
  /* 지평선 한 조각. 인원과 하늘만으로는 네 칸이 같은 장소의 다른 시간대로 읽혔다.
     경기장과 같은 규칙으로 등급이 높을수록 건물이 솟는다. 다섯 동이면 칸 폭을 채우고,
     행인 뒤에 서므로 사람을 안 가린다. 다섯을 한 지오메트리로 붙여 칸 하나가 메시 하나다. */
  const far = [];
  for (let i = 0; i < 5; i += 1) {
    const h = (1.6 + (i % 3) * 0.7) * place.rise;
    const b = new THREE.BoxGeometry(1.5, h, 1.2);
    b.translate(-3.2 + i * 1.6, h / 2, -10.4);
    far.push(b);
  }
  grp.add(new THREE.Mesh(mergeGeos(far), new THREE.MeshLambertMaterial({ color: place.fence })));
  /* 그 동네의 물건. 밟는 면과 지평선 높이만 갈리던 동안 네 칸이 색만 다른 같은 벌판이었다.
     경기장 배치를 그대로 담으면 60m짜리 담이 이 칸에서 실 한 오라기가 되므로, 칸의 배치는
     places.mjs가 따로 쥔다. 어느 동네인지는 한 곳이 정하고 어떻게 담을지만 칸마다 다르다.
     굽고 나면 clearScene이 이 리그의 지오메트리를 버린다. 사본을 주지 않으면 같은 칸을
     두 번째로 구울 때 이미 버려진 지오메트리를 그리게 된다. */
  grp.add(new THREE.Mesh(placeCardGeo(rank).clone(), flatVertex(0xffffff)));
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

/* 봇 한 대. 봇은 나를 대신 세우는 클론이라 파는 것이 곧 내 실루엣이다.
   색을 하나로 눕히면 얼굴과 옷이 사라지고 형태만 남아, 사람이 아니라 대역으로 읽힌다.
   재질은 복제한 뒤 칠한다. 눈동자 재질은 경기장이 같이 쓰는 한 장이라, 그것을 그대로 칠하면
   상점에서 구운 한 장이 경기장의 눈까지 같이 물들인다.
   등급은 몸이 아니라 몸에 그은 회로가 말한다. 판단력이 3에서 9로 오르는 만큼 줄이 늘고 밝아진다. */
const BOT_SKIN = 0x5a6672;
const BOT_TRACE = [0x6f8f5a, 0x63d3e8, 0xffd83d];
function botRig(pick, keeper) {
  const tier = Math.min(BOT_TRACE.length, Math.max(1, Math.floor(Number(pick && pick.rank) || 1)));
  const k = keeper && keeper.height ? keeper : { height: 188, weight: 84 };
  const h = k.height / 100;
  const grp = new THREE.Group();
  const body = buildKeeper(k.height, k.weight);
  body.traverse((o) => {
    if (!o.material) return;
    o.material = o.material.clone();
    if (o.material.color) o.material.color.setHex(BOT_SKIN);
  });
  body.updateMatrixWorld(true);
  grp.add(body);
  const mid = new THREE.Vector3();
  body.userData.torso.getWorldPosition(mid);
  // 줄은 가슴 앞에 뜬다. 몸통 반지름은 몸무게를 타므로 상수로 두면 무거운 몸에서 줄이 안으로 잠긴다.
  const front = (body.userData.girth || 0.3) * 0.55 + 0.02;
  const glow = new THREE.MeshBasicMaterial({ color: BOT_TRACE[tier - 1] });
  // 가슴을 가로지르는 줄과 그 끝의 마디. 길이를 번갈아 두어야 회로로 읽히고,
  // 같은 길이로 쌓으면 회로가 아니라 사다리가 된다.
  const n = 3 + (tier - 1) * 2;
  const top = mid.y + 0.40;
  for (let i = 0; i < n; i += 1) {
    const w = 0.13 + (i % 2) * 0.09;
    const x = i % 2 ? 0.04 : -0.04;
    const y = top - i * 0.05;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.016, 0.016), glow);
    bar.position.set(x, y, front);
    grp.add(bar);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), glow);
    dot.position.set(x + w / 2, y, front);
    grp.add(dot);
  }
  // 세로 한 줄. 가로줄만 있으면 회로가 아니라 갈비뼈로 읽힌다.
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.05 * (n - 1), 0.016), glow);
  spine.position.set(0, top - 0.05 * (n - 1) / 2, front);
  grp.add(spine);
  /* 온몸이 아니라 머리부터 허리까지 잡는다. 서 있는 사람을 가로 칸에 통째로 담으면
     사람이 칸 폭의 16퍼센트만 쓰고, 그 크기에서 회로는 점 몇 개가 된다. */
  return { grp, at: new THREE.Vector3(0, h * 0.7, 0), dist: h, high: 0.04 };
}

/* 버프 한 통. 마시고 뿌리고 던지는 물건이라 손에 쥐는 그 하나가 곧 상품이다.
   원시 도형으로 세운다. 캔은 원통, 스프레이는 원통 위의 노즐, 떡밥은 뭉친 덩어리다.
   순서는 buff.mjs 목록의 순서다. 여기서 종류 이름을 다시 적으면 목록이 바뀐 날 두 곳이 갈린다. */
const BUFF_TONE = [
  { body: 0xd8842f, trim: 0xf2d64b },
  { body: 0xd9536b, trim: 0x8f5a2f },
  { body: 0xe4e8ea, trim: 0x3f7fbf }
];
function buffRig(pick) {
  const at = Math.min(BUFF_TONE.length - 1, Math.max(0, Math.floor(Number(pick && pick.rank) || 0)));
  const c = BUFF_TONE[at];
  const grp = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: c.body });
  const trim = new THREE.MeshLambertMaterial({ color: c.trim });
  if (at === 0) {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.2, 14), skin);
    can.position.y = 0.1;
    grp.add(can);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.022, 14), trim);
    lid.position.y = 0.211;
    grp.add(lid);
  } else if (at === 1) {
    // 한 덩이만 두면 공이다. 작은 덩이 셋을 붙여야 뭉친 것으로 읽힌다.
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 9), skin);
    ball.position.y = 0.095;
    grp.add(ball);
    for (let i = 0; i < 3; i += 1) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 9, 7), trim);
      b.position.set(Math.cos(i * 2.1) * 0.074, 0.095 + Math.sin(i * 2.1) * 0.066, 0.05);
      grp.add(b);
    }
  } else {
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.19, 14), skin);
    can.position.y = 0.095;
    grp.add(can);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.038, 0.05, 12), trim);
    cap.position.y = 0.215;
    grp.add(cap);
    const noz = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.018, 0.05), trim);
    noz.position.set(0, 0.238, 0.032);
    grp.add(noz);
  }
  // 0.49는 0.24m짜리 물건이 칸 높이의 85퍼센트를 쓰는 거리다. 더 멀면 칸의 대부분이 빈 자리가 된다.
  return { grp, at: new THREE.Vector3(0, 0.12, 0), dist: 0.49, high: 0.24 };
}

/* 몸에 안 걸치는 칸들. 등급이 곧 그 장면이라 조각을 통째로 갈아 끼운다.
   이 표가 어느 칸이 장면인지의 정본이라, 새 칸은 여기 한 줄만 늘리면 붙는다. */
const SCENE = { frame: goalRig, city: cityRig, bot: botRig, buff: buffRig };

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
  // 목은 상의 기장을 타는 자리다. 허리 원점은 옷이 길어져도 제자리에 남는다.
  else if (part === "neck" && j && j.neck) j.neck.getWorldPosition(v);
  else if (part === "torso") k.userData.torso.getWorldPosition(v);
  else if (part === "arm" && k.userData.arms && k.userData.arms[0]) k.userData.arms[0].getWorldPosition(v);
  else if (part === "shin" && j && j.knL) { j.knL.getWorldPosition(v); v.y -= 0.16; }
  else if (part === "boot" && k.userData.boots && k.userData.boots[0]) k.userData.boots[0].getWorldPosition(v);
  else if (part === "boot" && j && j.knL) { j.knL.getWorldPosition(v); v.y -= 0.32; }
  else k.userData.torso.getWorldPosition(v);
  return v;
}

/* 한 칸이 쉬는 각. 굽는 자리와 도는 자리가 이 한 곳에서 각을 받는다.
   두 곳에서 따로 풀면 겨냥표에 각을 단 칸만 두 값이 갈리고, 그 칸은 호버한 첫 프레임에서
   그 차이만큼 건너뛴다. 실측: 유니폼이 겨냥 2.7에 출발 -0.7이라 3.4라디안을 한 번에 건너뛰어
   칸의 39.0퍼센트가 바뀌었고, 사람은 그것을 뒤집힌 뒤에 도는 그림으로 읽었다.
   장면 칸은 겨냥할 몸이 없어 겨냥표를 안 쓰므로 기본값이 따로다.
   over는 계기가 덮어쓴 겨냥이라 그 각이 있으면 그것이 이 칸의 각이다. */
export function yawOf(kind, aim) {
  const a = aim || AIM[kind];
  if (a && a.yaw !== undefined) return a.yaw;
  return SCENE[kind] ? -0.35 : -0.7;
}

// 한 장을 굽는다. 같은 자세와 같은 각도로 구워야 등급끼리의 차이가 색과 모양에서만 나온다.
// over는 겨냥 한 칸만 덮어쓰는 자리다. 계기가 반사실을 구울 때만 쓰고, 화면은 안 쓴다.
function frame(kind, keeper, look, yaw, over) {
  boot();
  /* 프레임 비율은 칸마다 다르다. 세로로 긴 피사체를 가로 칸에 구우면 담기는 것은 사람이 아니라 여백이다.
     크기가 그대로면 아무것도 안 한다. 매번 다시 잡으면 굽는 한 장마다 그리기 버퍼를 새로 만든다. */
  const [fw, fh] = sizeOf(kind);
  if (R.domElement.width !== fw || R.domElement.height !== fh) {
    R.setSize(fw, fh, false);
    cam.aspect = fw / fh;
    cam.updateProjectionMatrix();
  }
  // 장면 칸은 AIM 겨냥을 안 쓴다. 무엇을 겨냥할 몸이 없거나, 몸 자체가 상품이기 때문이다.
  if (SCENE[kind]) {
    if (rig) { scene.remove(rig); rig = null; }
    clearScene();
    // 옛 호출은 등급 하나만 넘겼다. 숫자로 오면 그 등급의 기본 변형으로 읽는다.
    const pick = typeof look === "number" ? { rank: look, skin: 0 } : look;
    const made = SCENE[kind](pick, keeper);
    sceneRig = made.grp;
    scene.add(sceneRig);
    // 동네는 하늘이 상품의 절반이다. 골대 칸은 배경을 비워 그물이 칸을 채우게 둔다.
    scene.background = sceneRig.userData.sky === undefined ? null : new THREE.Color(sceneRig.userData.sky);
    const a = yaw === undefined ? yawOf(kind, over) : yaw;
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
  const aim = Object.assign({}, AIM[kind] || { part: "torso", dist: 1.3, lift: 0 }, over || {});
  const at = partPoint(rig, aim.part);
  at.y += aim.lift;
  const a = yaw === undefined ? yawOf(kind, aim) : yaw;
  const high = aim.high === undefined ? 0.22 : aim.high;
  cam.position.set(at.x + Math.sin(a) * aim.dist, at.y + aim.dist * high, at.z + Math.cos(a) * aim.dist);
  cam.lookAt(at);
  R.render(scene, cam);
}

// over는 굽는 각을 덮어쓰는 자리다. 계기가 반사실을 구울 때만 쓰고, 화면은 안 쓴다.
// 장면 칸은 겨냥표를 안 써서 이 자리가 그 칸의 하나뿐인 각 손잡이다.
export function thumbURL(kind, keeper, look, over) {
  if (!AIM[kind] && !SCENE[kind]) return "";
  frame(kind, keeper, look, undefined, over);
  return R.domElement.toDataURL("image/png");
}

let spinning = null;
/* 지금 도는 칸. stopSpin은 인자를 안 받으므로 표시를 걸어 둔 칸을 여기 들고 있어야
   떠날 때 그 칸의 표시를 벗길 수 있다. 표시가 남으면 그 칸은 정지 그림 없이 빈 상자가 된다. */
let spinHost = null;

// 호버에서 천천히 돈다. 정지한 그림은 무엇을 샀는지 한 면만 보여 준다.
export function startSpin(host, kind, keeper, look) {
  // 굽는 자가 없는 종류는 여기서 돌아 나간다. 아래의 표시가 이 줄 뒤에 서야 그 칸이
  // 대체할 그림도 없이 비지 않는다.
  if (!AIM[kind] && !SCENE[kind]) return;
  boot();
  stopSpin();
  const cv = R.domElement;
  cv.style.cssText = "width:100%;height:100%;display:block";
  host.appendChild(cv);
  /* 도는 동안 정지 그림은 자리를 비운다는 표시. 칠은 hud.css가 가지고 여기는 표시만 건다.
     캔버스만 넣었을 때 실측: 212.5x128.91 칸의 격자가 94.8px 두 줄로 갈려 정지 그림이
     124.9px에서 97.0px로 줄고, 캔버스는 안쪽 상자에서 124.41px 벗어난 자리에 서서
     overflow에 잘렸다. 0.5초 동안 칸의 화소가 0.0퍼센트 움직였으니, 사람이 본 것은
     회전이 아니라 살짝 올라간 정지 그림이었다. */
  spinHost = host;
  host.classList.add("spinning");
  const t0 = performance.now();
  /* 출발각은 그 칸이 쉬는 각이다. 여기 상수를 박으면 겨냥이 그 상수와 다른 칸마다
     첫 프레임에서 각 차이만큼 한 번에 돌고, 그 도약은 회전이 아니라 다른 물건으로 읽힌다. */
  const y0 = yawOf(kind);
  const tick = () => {
    if (!spinning) return;
    // 한 바퀴에 8초. 더 빠르면 물건을 보는 것이 아니라 돌아가는 것을 보게 된다.
    frame(kind, keeper, look, y0 + ((performance.now() - t0) / 8000) * Math.PI * 2);
    spinning = requestAnimationFrame(tick);
  };
  spinning = requestAnimationFrame(tick);
}

export function stopSpin() {
  if (spinning) cancelAnimationFrame(spinning);
  spinning = null;
  if (spinHost) spinHost.classList.remove("spinning");
  spinHost = null;
  if (R && R.domElement.parentNode) R.domElement.parentNode.removeChild(R.domElement);
}

/* 구운 한 장 안에서 머리가 어디에 얼마나 크게 서 있는지. 시착실 자가 읽는 계기다.
   화소만 세면 머리와 어깨가 안 갈려서, 정수리가 잘렸는지는 화소가 답해도 반지름 상자가
   프레임 안인지는 못 답한다. 그 질문은 투영만 답한다.
   좌표는 그림 몫이다. 왼쪽 위가 0,0이고 오른쪽 아래가 1,1이라 프레임 크기가 바뀌어도 축이 안 흔들린다.
   반지름이 둘인 이유는 프레임이 정사각이 아니기 때문이다. 같은 크기가 가로로 넓은 칸에서는
   x 몫으로 더 작게 선다. url을 같이 돌려주어, 잰 그림과 화면에 걸린 그림이 같은 장인지 대조할 수 있다. */
/* 구운 한 장 안에서 위팔이 어디에 섰는지. 머리는 headBox가 답하고 위팔은 이것이 답한다.
   문신을 재는 자가 온 프레임을 재면 몸통과 장갑과 빈 배경이 같이 들어와, 팔에서 일어난 일이
   그 넓이에 묻힌다. 실측: 온 프레임 화소 분산이 0등급과 2등급 사이에서 1145와 1159로,
   1퍼센트만 움직였다. 팔만 골라 재면 같은 두 등급이 몇 배로 갈린다.
   팔꿈치 아래는 뺀다. 어깨 관절의 자식 중 메시만 보면 삼각근과 위팔이고, 팔꿈치는 관절이라
   그 아래의 아래팔과 장갑이 통째로 빠진다. 좌표 몫은 headBox와 같아 왼쪽 위가 0,0이다. */
export function armBox(kind, keeper, look) {
  if (!AIM[kind]) return null;
  frame(kind, keeper, look);
  const sh = rig && rig.userData.arms && rig.userData.arms[0];
  if (!sh) return null;
  const b = new THREE.Box3();
  let n = 0;
  for (const ch of sh.children) {
    if (!ch.isMesh) continue;
    b.expandByObject(ch);
    n += 1;
  }
  if (!n) return null;
  const v = new THREE.Vector3();
  let x0 = 1;
  let x1 = -1;
  let y0 = 1;
  let y1 = -1;
  for (let i = 0; i < 8; i += 1) {
    v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).project(cam);
    x0 = Math.min(x0, v.x);
    x1 = Math.max(x1, v.x);
    y0 = Math.min(y0, v.y);
    y1 = Math.max(y1, v.y);
  }
  return { parts: n, x0: (x0 + 1) / 2, x1: (x1 + 1) / 2, y0: (1 - y1) / 2, y1: (1 - y0) / 2,
    url: R.domElement.toDataURL("image/png") };
}

export function headBox(kind, keeper, look, over) {
  if (!AIM[kind]) return null;
  frame(kind, keeper, look, undefined, over);
  const head = rig && rig.userData.head;
  if (!head) return null;
  const at = new THREE.Vector3();
  head.getWorldPosition(at);
  const r = head.geometry.parameters.radius;
  const crown = at.clone();
  crown.y += r;
  const to = (v) => ({ x: (v.x + 1) / 2, y: (1 - v.y) / 2 });
  const mid = to(at.clone().project(cam));
  const top = to(crown.clone().project(cam));
  const ry = Math.abs(mid.y - top.y);
  /* 눈과 입이 그 상자 안 어디에 섰는지. 머리 상자만으로는 볼을 못 자른다.
     볼은 눈 아래에서 입 위까지의 띠인데 입은 렌즈에 가장 가까워서 같은 높이의 옆 얼굴보다
     아래에 맺힌다. 그 두 자리를 화소에서 찾으면 눈동자와 외곽선이 거의 같은 색이라 서로 안 갈린다. */
  const spot = new THREE.Vector3();
  const eyes = (head.userData.eyes || []).map((e) => to(e.getWorldPosition(spot).project(cam)));
  const mo = head.userData.mouth;
  let mouth = null;
  if (mo) {
    mo.getWorldPosition(spot);
    const half = mo.geometry.parameters.radius * mo.scale.y;
    const lip = spot.clone();
    lip.y += half;
    const jaw = spot.clone();
    jaw.y -= half;
    const hit = to(spot.clone().project(cam));
    mouth = { x: hit.x, y: hit.y, top: to(lip.project(cam)).y, bot: to(jaw.project(cam)).y };
  }
  // 쓴 거리를 같이 돌려준다. 계기가 반사실을 구울 때 겨냥 상수를 옮겨 적지 않아도 된다.
  return { x: mid.x, y: mid.y, ry, rx: ry * (R.domElement.height / R.domElement.width), eyes, mouth,
    dist: Object.assign({}, AIM[kind], over || {}).dist, url: R.domElement.toDataURL("image/png") };
}
