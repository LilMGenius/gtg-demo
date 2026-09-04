// 경기장 선의 규격. 화면에 세우는 쪽과 GLB로 굽는 쪽이 이 표 하나를 읽는다.
// 두 곳에 같은 수를 적어 두었더니 굽는 쪽이 옛 값에 남아, 코드를 고쳐도 화면은 안 바뀌었다.
//
// 이 판의 눈금은 1 단위 = 1 m이고 골대도 실물 7.32 x 2.44로 서 있다. 선만 축소판을 쓰면
// 한 화면이 두 경기장을 그린 것이 된다. 그래서 전부 실제 규격이다.
export const BOX_W = 40.32;
export const BOX_D = 16.5;
export const AREA_W = 18.32;
export const AREA_D = 5.5;
export const SPOT_Z = 11;
export const ARC_R = 9.15;
// 골라인은 화면 밖까지 이어져야 땅이 끊긴 것으로 안 읽힌다. 60은 페널티 에어리어보다 넉넉하다.
export const GOAL_LINE_W = 60;
// 선 굵기. 실물 12 cm를 그대로 쓰면 20 m 밖에서 한 화소 아래로 내려가 아크가 화면에서 사라진다.
// 이 게임은 골대 뒤에서 땅을 스치듯 보므로 먼 선일수록 두껍게 그어야 같은 굵기로 읽힌다.
export const NEAR_W = 0.12;
export const FAR_W = 0.34;

// 아크가 박스 밖으로 나온 몫. 스팟에서 박스 앞선까지 5.5 m이므로 그 바깥만 반달로 남는다.
export const ARC_HALF = Math.acos((BOX_D - SPOT_Z) / ARC_R);

// 그리는 순서대로. 이름은 계기가 어느 선인지 묻는 자리에 쓴다.
export const MARK_LINES = [
  { mark: 'goalLine', w: GOAL_LINE_W, d: NEAR_W, x: 0, z: 0 },
  { mark: 'boxLeft', w: FAR_W, d: BOX_D, x: -BOX_W / 2, z: BOX_D / 2 },
  { mark: 'boxRight', w: FAR_W, d: BOX_D, x: BOX_W / 2, z: BOX_D / 2 },
  { mark: 'boxFront', w: BOX_W, d: FAR_W, x: 0, z: BOX_D },
  { mark: 'areaLeft', w: NEAR_W, d: AREA_D, x: -AREA_W / 2, z: AREA_D / 2 },
  { mark: 'areaRight', w: NEAR_W, d: AREA_D, x: AREA_W / 2, z: AREA_D / 2 },
  { mark: 'areaFront', w: AREA_W, d: NEAR_W, x: 0, z: AREA_D }
];
