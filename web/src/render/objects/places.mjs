// 동네가 소유한 땅 위의 물건. 원시 도형과 정점색만 쓰고 텍스처는 안 쓴다.
// 등급이 바꾸던 것은 밟는 면 색과 지평선 높이뿐이라, 공터와 번화가가 같은 빈 벌판이었다.
//
// 한 동네가 지오메트리 한 장이다. 조각마다 메시를 세우면 동네 하나가 드로우콜 수십 개를 먹는다.
// 리마스터 뒤 예산이 118/120이라 남은 자리가 둘이고, 메시 하나로 그중 하나만 쓴다.
// 재질은 밖에서 units.mjs의 flatVertex 한 장을 물려 준다. 색은 전부 정점에 실린다.
import * as THREE from '../../../vendor/three.module.min.js';
import { mergeGeos } from '../units.mjs';
import { GOAL } from '../../../../src/reality.mjs';

/* 물건이 설 수 있는 자리. 페널티 박스 판은 밟는 면이라 그 위에는 아무것도 안 세운다.
   reality의 규칙이 아닌 연출용 흙판은 16.5 x 16.5이고 중심이 z 8.2라 x는 8.25까지, z는 16.45까지가 그 판이다.
   카메라는 (0, 4.35, -8)에서 세로 화각 38도로 보므로 화면에 남는 반폭이 대략 0.6 * (z + 8)이다.
   그 밖에 세운 것은 예산만 먹고 한 화소도 안 나온다.
   한눈팔기 연출은 행인 0번을 z 18까지 끌고 온다. 넓은 구조물을 그보다 앞에 세우면
   그 연출이 구조물 뒤에서 일어나고, 얼굴을 재는 자들이 빈 화면을 읽는다. 그래서 z 21보다 뒤다.
   행인은 z 26.8에서 39.2 사이를 걷고 화면에서 y 179에서 232행을 쓴다. 넓은 구조물의 키를
   1.3m 아래로 묶는 이유가 이것이다. 그 위로 올라가는 것은 나무와 기둥처럼 사이가 뚫린 것뿐이라
   사람이 그 틈으로 계속 보인다. */
function pen() {
  const geos = [];
  const cols = [];
  const push = (g, c) => { geos.push(g); cols.push(c); };
  return {
    geos,
    cols,
    // 상자는 중심이 원점이라 그대로 놓으면 절반이 땅에 묻힌다. 밑면을 y0에 맞춘다.
    box: (w, h, d, x, z, c, y0) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(x, (y0 || 0) + h / 2, z);
      push(g, c);
    },
    // 선 기둥. 여섯 각이면 원경에서 원통으로 읽히고 정점은 열두 각의 절반이다.
    post: (r, h, x, z, c, y0) => {
      const g = new THREE.CylinderGeometry(r, r, h, 6);
      g.translate(x, (y0 || 0) + h / 2, z);
      push(g, c);
    },
    // 누운 봉. 철봉 가로대와 정류장 처마가 쓴다.
    bar: (r, len, x, y, z, c) => {
      const g = new THREE.CylinderGeometry(r, r, len, 6);
      g.rotateZ(Math.PI / 2);
      g.translate(x, y, z);
      push(g, c);
    },
    // 가지 한 층. 일곱 각이면 실루엣이 원뿔로 읽히면서 정점이 스물넷이다.
    // 각을 더 줄이면 원뿔이 아니라 엎은 그릇으로 읽혀 나무가 안 된다.
    cone: (r, h, x, y0, z, c) => {
      // 기존 수관 봉투 안에 매끈한 타원체를 넣어 삼각 고깔 외곽선을 없앤다.
      const g = new THREE.SphereGeometry(1, 20, 12); // 원경에서도 둥근 윤곽을 유지할 최소 분할이다.
      g.scale(r, h / 2, r);
      g.translate(x, y0 + h / 2, z);
      push(g, c);
    }
  };
}

// 나무 한 그루. 줄기 하나에 가지 두 층이다. 한 층이면 원뿔 하나라 나무가 아니라 고깔이다.
function tree(p, x, z, s) {
  p.post(0.24 * s, 2.3 * s, x, z, 0x6b4b33);
  p.cone(2.1 * s, 2.6 * s, x, 1.9 * s, z, 0x4e7a3f);
  p.cone(1.5 * s, 2.0 * s, x, 3.3 * s, z, 0x3f6533);
}

// 골문은 인용된 실물 규격을 쓰고 위치·봉 두께는 연출 값이다. 뒤쪽 본 골문이 연습 골문과 분리되어 보인다.
function mainGoal(p, x, z) {
  const {width:w,height:h}=GOAL.values;
  // 0.09 반지름은 원경에서도 보이는 봉 두께, 1.5 깊이는 뒤 지지대의 제품 모형이다.
  for(const side of [-1,1]){p.post(0.09,h,x+side*w/2,z,0xe2e4da);p.post(0.07,h,x+side*w/2,z+1.5,0xa4aaa0);}
  p.bar(0.09,w,x,h,z,0xe2e4da);
  // 여덟 가닥은 원경에서 골망임을 읽는 최소한의 수직 실이다.
  for(let i=0;i<=8;i++)p.box(0.025,h,0.025,x-w/2+w*i/8,z+1.5,0xa4aaa0);
}

// 운동장 뒤편의 학교와 담은 골문보다 뒤에 두어 슈터와 행인을 가리지 않는다.
function neighborhood(p){
  // 46미터 뒤의 낮은 교사동과 세 창 띠는 기존 학교 모형을 축소한 배경이다.
  p.box(30,6,5,-5,46,0xc8c5ad);
  for(let i=0;i<3;i++)p.box(28,0.7,0.16,-5,43.4,0x75888a,1+i*1.6);
  p.box(32,0.35,5.5,-5,46,0x858c7c,6);
  // 행인 띠 뒤의 42미터 담과 열린 골문 사이로 몸을 계속 볼 수 있다.
  p.box(56,0.7,0.3,0,42,0xb4b19c);
  mainGoal(p,0,23);
  tree(p,-17,29,0.9);tree(p,18,33,1.1);
}

// 풋살장은 낮은 킥보드와 성긴 펜스로 둘러싸인 인조잔디 시설이다.
function futsal(p){
  // 기존 배치 22.5미터를 유지하고 펜스 높이 2.6미터는 행인 사이가 보이는 연출 크기다.
  p.box(60,0.7,0.16,0,22.5,0x3d6856);
  for(let i=0;i<31;i++)p.post(0.055,2.6,-30+i*2,22.5,0x899b91);
  for(const y of [1.5,2.6])p.bar(0.045,60,0,y,22.5,0x899b91);
  lights(p,7);
}

// 단은 뒤로 갈수록 높아지는 같은 모듈이다. 한 메시로 합쳐 규모만 바꾼다.
function stands(p,rows,width,z){
  // 단차 0.75·깊이 1.5와 등받이 0.35는 원경에서도 계단을 읽게 하는 제품 모형이다.
  for(let row=0;row<rows;row++){
    const y=row*0.75;
    p.box(width,0.75,1.5,0,z+row*1.5,0xa5ada8,y);
    p.box(width,0.35,0.3,0,z+row*1.5+0.5,row%2?0x638a83:0x8c9baf,y+0.75);
  }
}
function lights(p,height){
  // 골문 밖 ±18미터의 네 기둥은 화면 중앙을 비우고 경기장 양끝을 표시한다.
  for(const x of [-18,18])for(const z of [24,44]){
    p.post(0.15,height,x,z,0x80908d);
    p.box(2.6,0.8,0.45,x,z,0x6a7775,height);
    p.box(2.3,0.55,0.08,x,z-0.26,0xe3e2c9,height+0.12);
  }
}
function grass(p){
  // 아마추어 구장은 폭 26미터의 세 단 관람석과 작은 지붕으로 프로 시설과 규모를 가른다.
  stands(p,3,26,42);
  p.box(28,0.25,6,0,45,0x7c9690,4.8);
  for(const x of [-13,13])p.post(0.12,4.8,x,43,0x879a92);
  tree(p,-20,42,1);tree(p,20,44,1);
}
function stadium(p){
  // 프로 구장은 여덟 단과 폭 76미터의 관람석으로 시야 양쪽까지 감싼다. 행인 뒤 43미터부터 시작한다.
  stands(p,8,76,43);
  // 측면 단은 골대 바깥 ±25미터부터 넓어져 중앙 판정 공간을 비운다.
  for(const side of [-1,1])for(let row=0;row<5;row++)p.box(1.8,0.8,27,side*(25+row*1.8),30,0x9aa9a4,row*0.8);
  lights(p,14);
  p.box(80,0.35,8,0,52,0x748b8d,10);
}

const BUILD=[neighborhood,futsal,grass,stadium];
const cache = [];

/* 동네 하나의 물건 전부를 한 지오메트리로 굽는다. 등급이 바뀔 때마다 다시 구우면
   상점에서 네 칸을 넘기는 동안 같은 것을 열 번 굽는다. 한 번 구워 들고 있는다. */
export function placeGeo(city) {
  const c = Math.max(0, Math.min(BUILD.length - 1, Math.floor(Number(city) || 0)));
  if (!cache[c]) {
    const p = pen();
    BUILD[c](p);
    cache[c] = mergeGeos(p.geos, p.cols);
  }
  return cache[c];
}

// 카드에서도 같은 시설 모형을 쓴다. 폭 45%·높이 70%·깊이 30%는 작은 카드의 정사각 구도에 맞춘 연출 배율이다.
const cardCache=[];
export function placeCardGeo(city){
  if(!cardCache[city])cardCache[city]=placeGeo(city).clone().scale(0.45,0.7,0.3).rotateY(Math.PI).translate(0,0,3);
  return cardCache[city];
}

// THREE.InstancedMesh와 기존 mergeGeos를 재사용해 둥근 머리·상의 관중을 한 드로우콜로 만든다.
export function venueCrowd(){
  // 여덟 단에 36명씩 배치한다. 머리 0.18·몸 0.23은 먼 관중을 행인보다 작은 실루엣으로 읽게 한다.
  const body=new THREE.CapsuleGeometry(0.23,0.35,4,8);body.translate(0,0.4,0);
  const head=new THREE.SphereGeometry(0.18,8,6);head.translate(0,0.88,0);
  const geo=mergeGeos([body,head],[0xffffff,0xd7b79a]);
  const crowd=new THREE.InstancedMesh(geo,new THREE.MeshLambertMaterial({vertexColors:true}),8*36);
  const matrix=new THREE.Matrix4(),color=new THREE.Color();
  // 차분한 네 색은 팀이나 국가의 실측이 아니라 관중석의 제품 팔레트다.
  const colors=[0x9eb6b1,0xb8877c,0xbca86b,0x8393ae];
  for(let row=0;row<8;row++)for(let seat=0;seat<36;seat++){
    const i=row*36+seat;
    matrix.makeTranslation(-35+seat*2,0.8+row*0.75,43+row*1.5);
    crowd.setMatrixAt(i,matrix);crowd.setColorAt(i,color.setHex(colors[i%colors.length]));
  }
  crowd.name='venue-crowd';crowd.userData.probeIgnore=true;
  return crowd;
}
