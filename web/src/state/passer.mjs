// 행인 이름표와 페르소나. 라포는 도시와 번호로만 붙어서 화면에 행인 3처럼 떴고,
// 몸은 전원 같은 캡슐이라 다섯이 색칠한 볼링핀이었다. 이름이 없으면 미연시가 붙을 자리도 없고,
// 몸이 같으면 이름을 붙여도 같은 사람이 다섯 번 지나간다. 판정에는 안 들어가고 호칭과 실루엣만 바꾼다.

// 도시별 인원은 chain.mjs의 passerCount와 같은 식이다. 두 곳이 어긋나면
// 라포 목록에 이름 없는 번호가 뜬다. 게이트가 이 일치를 잰다.
export function passerCountAt(city) {
  const c = Math.max(0, Math.min(3, Math.floor(Number(city) || 0)));
  return 5 + 2 * c;
}

/* 페르소나 넷. 이름이 말하는 사람이 화면에서도 그 사람이어야 한다.
   tall과 wide는 그 사람의 몸 비율이고, 회차 흔들림은 크기 하나만 흔든다. 비율까지 흔들면
   실루엣 비를 재는 자가 재는 것이 페르소나가 아니라 그날 굴린 난수가 된다.
   stride는 보폭이다. 앞뒤로 벌린 발 간격이고, 걷는 속도와 흔들림 주기가 같이 여기서 나온다.
   scene.mjs가 userData.speed를 읽어 둘 다 돌리므로 노인은 느리게 걷고 느리게 흔들린다.
   bob은 그 몸이 골반을 이고 있는 높이다. 걸음마다 뜨는 양이 아니라 서 있는 자세의 높이 보정이고,
   프레임마다 흔드는 값이 아닌 이유는 세계시계가 멈춘 정지 프레임 두 장이 같아야 하기 때문이다.
   arm은 팔이 몸에서 벌어지는 각, leg는 다리 길이 배율이다. 실루엣 폭은 팔 각이,
   실루엣 높이는 다리 길이가 정하므로 원경에서 페르소나를 가르는 것이 그 둘이다.
   실측(정사 투영 실루엣 높이/폭): 미인 2.0대, 직장인 1.6대, 노인 1.3대, 학생 1.0대. */
export const PERSONAS = {
  // 미인. 굽 있는 신에 긴 머리라 제일 높고 좁다. 한눈팔기 연출이 지목하는 그 사람이다.
  beauty: { tall: 1.10, wide: 0.92, stride: 0.42, bob: 0.030, arm: 0.30, leg: 1 },
  // 학생. 가방을 메고 다리가 짧다. 팔을 크게 흔들고 제일 빨리 걷는다.
  student: { tall: 0.94, wide: 1.02, stride: 0.82, bob: 0.075, arm: 0.52, leg: 0.78 },
  // 직장인. 무릎까지 오는 코트에 팔은 몸에 붙는다. 넷 중 제일 곧게 선다.
  worker: { tall: 1.06, wide: 1.00, stride: 0.58, bob: 0.040, arm: 0.24, leg: 1 },
  // 노인. 등이 굽고 막대를 짚는다. 보폭이 제일 좁아 제일 느리다.
  elder: { tall: 0.86, wide: 1.18, stride: 0.22, bob: 0.014, arm: 0.12, leg: 0.92 }
};

// 0번은 어느 등급에서도 안 숨는 미인이라 도시마다 첫 줄에 둔다.
// face는 이름을 알기 전 호칭이다. 사람은 이름보다 차림새를 먼저 기억한다.
// kind는 그 차림새의 몸이다. 경기장은 최대 인원으로 한 번만 짓고 등급으로 보이기만 끄므로,
// 같은 번호는 어느 동네에서도 같은 몸이어야 한다. 그래서 네 줄의 같은 자리가 같은 kind다.
const FACES = [
  [
    { name: "차유리", face: "약수 뜨러 온 사람", kind: "beauty" },
    { name: "고라켓", face: "배드민턴 채 든 사람", kind: "student" },
    { name: "정약수", face: "물통 여섯 개 든 사람", kind: "worker" },
    { name: "박등산", face: "스틱 두 개 짚은 아저씨", kind: "elder" },
    { name: "윤말티", face: "말티즈에 끌려가는 사람", kind: "student" }
  ],
  [
    { name: "한소연", face: "교문 앞에 서 있는 사람", kind: "beauty" },
    { name: "나주번", face: "쓰레기봉투 든 학생", kind: "student" },
    { name: "이호루", face: "호루라기 문 체육 선생", kind: "worker" },
    { name: "김문방", face: "문방구 앞 아저씨", kind: "elder" },
    { name: "오지각", face: "교문으로 뛰어가는 학생", kind: "student" },
    { name: "최떡순", face: "분식집 아주머니", kind: "worker" },
    { name: "표셔틀", face: "학원 차 기다리는 학생", kind: "student" }
  ],
  [
    { name: "서다인", face: "퇴근길에 지나가는 사람", kind: "beauty" },
    { name: "배달수", face: "헬멧 벗은 배달기사", kind: "student" },
    { name: "강대리", face: "넥타이 푼 직장인", kind: "worker" },
    { name: "한리트", face: "리트리버에 끌려가는 사람", kind: "elder" },
    { name: "노보드", face: "보드 세워 든 사람", kind: "student" },
    { name: "민유모", face: "유모차 미는 사람", kind: "worker" },
    { name: "전동킥", face: "킥보드 대는 사람", kind: "student" },
    { name: "피자왕", face: "피자 상자 쌓아 든 사람", kind: "worker" },
    { name: "구편의", face: "편의점 조끼 입은 알바", kind: "student" }
  ],
  [
    { name: "유세라", face: "사진 찍히고 있는 사람", kind: "beauty" },
    { name: "조회수", face: "셀카봉 든 사람", kind: "student" },
    { name: "홍전단", face: "전단지 돌리는 사람", kind: "worker" },
    { name: "알콩달", face: "팔짱 낀 사람", kind: "elder" },
    { name: "기타손", face: "기타 멘 버스커", kind: "student" },
    { name: "주말취", face: "비틀거리는 사람", kind: "worker" },
    { name: "박풍선", face: "풍선 나눠주는 사람", kind: "student" },
    { name: "순찰이", face: "순찰 도는 사람", kind: "worker" },
    { name: "길묻수", face: "지도 든 여행자", kind: "student" },
    { name: "붕어빵", face: "붕어빵 굽는 사람", kind: "elder" },
    { name: "고삼각", face: "삼각대 세운 사람", kind: "worker" }
  ]
];

export function passerAt(city, passer) {
  const c = Math.max(0, Math.min(3, Math.floor(Number(city) || 0)));
  const p = Math.floor(Number(passer));
  const list = FACES[c];
  if (!Number.isFinite(p) || p < 0 || p >= list.length) return null;
  return list[p];
}

/* 번호 하나가 어떤 몸인지. 경기장은 도시를 모르는 채로 최대 인원을 한 번에 짓는다.
   그래서 몸을 정하는 것은 번호이고, 가장 긴 줄(마지막 도시)이 그 번호 순서를 소유한다.
   짧은 줄들이 같은 순서를 지키는지는 게이트가 네 줄을 맞대어 잰다. */
export function personaKindAt(passer) {
  const last = FACES[FACES.length - 1];
  const p = Math.max(0, Math.min(last.length - 1, Math.floor(Number(passer) || 0)));
  return last[p].kind;
}

export function personaAt(passer) {
  return PERSONAS[personaKindAt(passer)];
}

/* 얼굴표 판번호. 위 표에서 자리가 한 번이라도 움직이면 이 수가 오르고 아래 이동표에 그 줄이 선다.
   라포는 (도시, 번호)로 붙으므로, 자리가 움직인 표를 모르는 저장은 익힌 얼굴을 옆 사람에게 붙여 놓는다. */
export const FACES_V = 1;

/* 판 0에서 판 1로 가는 자리 이동. 칸의 자리가 옛 번호이고 칸의 값이 지금 번호다.
   판 0은 도시마다 제 순서를 따로 썼고, 판 1은 네 줄의 같은 자리를 같은 kind로 맞췄다.
   네 줄 다 순열이라 두 사람이 한 자리로 들어오는 일은 없다. */
const FACE_MOVES = [
  [0, 3, 1, 4, 2],
  [0, 3, 2, 5, 1, 4, 6],
  [0, 1, 2, 5, 4, 6, 8, 7, 3],
  [0, 2, 1, 4, 6, 5, 7, 3, 8, 9, 10]
];

/* 옛 번호가 지금 앉아 있는 자리. 줄이 없는 도시나 줄 밖의 번호는 제자리다.
   제자리로 두는 것이 맞다. 새 도시가 붙어도 그 도시의 저장이 안 흔들린다. */
export function movedFace(city, passer) {
  const c = Math.max(0, Math.min(FACE_MOVES.length - 1, Math.floor(Number(city) || 0)));
  const p = Math.floor(Number(passer));
  const row = FACE_MOVES[c];
  if (!row || !Number.isFinite(p) || p < 0 || p >= row.length) return p;
  return row[p];
}

// 이름은 라포 1단계부터 열린다. 세 번 말을 섞기 전까지는 차림새로만 기억한다.
// 처음부터 이름을 주면 얼굴을 트는 과정 자체가 화면에서 사라진다.
export function passerName(city, passer, tier) {
  const who = passerAt(city, passer);
  if (!who) return "행인 " + passer;
  return (Number(tier) || 0) >= 1 ? who.name : who.face;
}
