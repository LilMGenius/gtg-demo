// 행인 이름표. 라포는 도시와 번호로만 붙어서 화면에 행인 3처럼 떴다.
// 이름이 없으면 미연시가 붙을 자리도 없다. 판정에는 들어가지 않고 호칭만 바꾼다.

// 도시별 인원은 chain.mjs의 passerCount와 같은 식이다. 두 곳이 어긋나면
// 라포 목록에 이름 없는 번호가 뜬다. 게이트가 이 일치를 잰다.
export function passerCountAt(city) {
  const c = Math.max(0, Math.min(3, Math.floor(Number(city) || 0)));
  return 5 + 2 * c;
}

// 0번은 어느 등급에서도 안 숨는 미인이라 도시마다 첫 줄에 둔다.
// face는 이름을 알기 전 호칭이다. 사람은 이름보다 차림새를 먼저 기억한다.
const FACES = [
  [
    { name: "차유리", face: "약수 뜨러 온 사람" },
    { name: "박등산", face: "스틱 두 개 짚은 아저씨" },
    { name: "고라켓", face: "배드민턴 채 든 사람" },
    { name: "윤말티", face: "말티즈에 끌려가는 사람" },
    { name: "정약수", face: "물통 여섯 개 든 사람" }
  ],
  [
    { name: "한소연", face: "교문 앞에 서 있는 사람" },
    { name: "김문방", face: "문방구 앞 아저씨" },
    { name: "이호루", face: "호루라기 문 체육 선생" },
    { name: "최떡순", face: "분식집 아주머니" },
    { name: "나주번", face: "쓰레기봉투 든 학생" },
    { name: "오지각", face: "교문으로 뛰어가는 학생" },
    { name: "표셔틀", face: "학원 차 기다리는 학생" }
  ],
  [
    { name: "서다인", face: "퇴근길에 지나가는 사람" },
    { name: "배달수", face: "헬멧 벗은 배달기사" },
    { name: "강대리", face: "넥타이 푼 직장인" },
    { name: "민유모", face: "유모차 미는 사람" },
    { name: "노보드", face: "보드 세워 든 사람" },
    { name: "전동킥", face: "킥보드 대는 사람" },
    { name: "구편의", face: "편의점 조끼 입은 알바" },
    { name: "피자왕", face: "피자 상자 쌓아 든 사람" },
    { name: "한리트", face: "리트리버에 끌려가는 사람" }
  ],
  [
    { name: "유세라", face: "사진 찍히고 있는 사람" },
    { name: "홍전단", face: "전단지 돌리는 사람" },
    { name: "조회수", face: "셀카봉 든 사람" },
    { name: "기타손", face: "기타 멘 버스커" },
    { name: "박풍선", face: "풍선 나눠주는 사람" },
    { name: "주말취", face: "비틀거리는 사람" },
    { name: "순찰이", face: "순찰 도는 사람" },
    { name: "알콩달", face: "팔짱 낀 사람" },
    { name: "길묻수", face: "지도 든 여행자" },
    { name: "붕어빵", face: "붕어빵 굽는 사람" },
    { name: "고삼각", face: "삼각대 세운 사람" }
  ]
];

export function passerAt(city, passer) {
  const c = Math.max(0, Math.min(3, Math.floor(Number(city) || 0)));
  const p = Math.floor(Number(passer));
  const list = FACES[c];
  if (!Number.isFinite(p) || p < 0 || p >= list.length) return null;
  return list[p];
}

// 이름은 라포 1단계부터 열린다. 세 번 말을 섞기 전까지는 차림새로만 기억한다.
// 처음부터 이름을 주면 얼굴을 트는 과정 자체가 화면에서 사라진다.
export function passerName(city, passer, tier) {
  const who = passerAt(city, passer);
  if (!who) return "행인 " + passer;
  return (Number(tier) || 0) >= 1 ? who.name : who.face;
}
