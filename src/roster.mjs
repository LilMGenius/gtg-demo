// GTG 로스터. 이름은 발음만 닮은 다른 단어다.
// 원본 이름은 이 파일에 없다. 적어두는 순간 회피가 아니라 대조표가 된다.
// 게임 용어로 비틀 수 있으면 그쪽을 쓴다. 매쉬, 픽셀로, 셰이더첸코, 렌더슨, 지버퍼.
// 다만 소리내어 읽고 원본이 안 떠오르면 용어를 버린다. 아는 사람만 웃는 농담은 농담이 아니다.
// fame과 실력은 다른 축이다. 못 막는데 유명한 키퍼가 이 게임에서 제일 웃긴다.

// 키커. role은 연출이 쓰고, 판정은 여섯 칸만 읽는다.
export const KICKERS = [
  { name: '매쉬',        role: '공격수',   finishing: 10, power: 6,  composure: 9, curve: 10, flair: 10, fame: 10, height: 170, weight: 67 },
  { name: '혹난두',      role: '공격수',   finishing: 10, power: 10, composure: 7, curve: 7,  flair: 9,  fame: 10, height: 187, weight: 84 },
  { name: '아니이마르',  role: '공격수',   finishing: 8,  power: 6,  composure: 4, curve: 8,  flair: 10, fame: 10, height: 175, weight: 68 },
  { name: '음빼빼로',    role: '공격수',   finishing: 9,  power: 8,  composure: 7, curve: 5,  flair: 8,  fame: 10, height: 178, weight: 73 },
  { name: '쌀라',        role: '공격수',   finishing: 9,  power: 7,  composure: 7, curve: 8,  flair: 7,  fame: 9,  height: 175, weight: 71 },
  { name: '손흔든',      role: '공격수',   finishing: 9,  power: 10, composure: 8, curve: 7,  flair: 7,  fame: 9,  height: 183, weight: 78 },
  { name: '드래그바',    role: '공격수',   finishing: 8,  power: 10, composure: 5, curve: 4,  flair: 6,  fame: 8,  height: 189, weight: 91 },
  { name: '홀라당',      role: '공격수',   finishing: 10, power: 10, composure: 6, curve: 3,  flair: 4,  fame: 9,  height: 195, weight: 88 },
  { name: '즐라탄탄한이보라', role: '공격수', finishing: 9,  power: 10, composure: 6, curve: 6,  flair: 10, fame: 9,  height: 195, weight: 95 },
  { name: '벤치마',      role: '공격수',   finishing: 9,  power: 7,  composure: 8, curve: 6,  flair: 8,  fame: 8,  height: 185, weight: 81 },
  { name: '수지',    role: '공격수',   finishing: 9,  power: 7,  composure: 6, curve: 6,  flair: 7,  fame: 8,  height: 182, weight: 85 },
  { name: '아구찜해요',    role: '공격수',   finishing: 9,  power: 8,  composure: 7, curve: 5,  flair: 7,  fame: 8,  height: 173, weight: 74 },
  { name: '케잌',        role: '공격수',   finishing: 9,  power: 8,  composure: 8, curve: 6,  flair: 6,  fame: 8,  height: 188, weight: 86 },
  { name: '호랑나우두',    role: '공격수',   finishing: 10, power: 9,  composure: 8, curve: 6,  flair: 9,  fame: 10, height: 183, weight: 82 },
  { name: '호나우진흙',  role: '공격수',   finishing: 8,  power: 7,  composure: 6, curve: 8,  flair: 10, fame: 10, height: 181, weight: 80 },
  { name: '앙리단',      role: '공격수',   finishing: 9,  power: 8,  composure: 8, curve: 7,  flair: 8,  fame: 9,  height: 188, weight: 83 },
  { name: '반페르시안',  role: '공격수',   finishing: 9,  power: 8,  composure: 7, curve: 7,  flair: 7,  fame: 8,  height: 183, weight: 71 },
  { name: '토마토레스',  role: '공격수',   finishing: 8,  power: 7,  composure: 5, curve: 4,  flair: 5,  fame: 8,  height: 186, weight: 80 },
  { name: '비아냥',      role: '공격수',   finishing: 9,  power: 6,  composure: 8, curve: 5,  flair: 5,  fame: 7,  height: 175, weight: 69 },
  { name: '레이울',    role: '공격수',   finishing: 9,  power: 6,  composure: 8, curve: 5,  flair: 6,  fame: 8,  height: 180, weight: 73 },
  { name: '셰이더첸코',    role: '공격수',   finishing: 9,  power: 9,  composure: 7, curve: 5,  flair: 6,  fame: 8,  height: 183, weight: 79 },
  { name: '델삐에로',    role: '공격수',   finishing: 8,  power: 7,  composure: 8, curve: 9,  flair: 8,  fame: 8,  height: 170, weight: 73 },
  { name: '토띠',        role: '공격수',   finishing: 8,  power: 8,  composure: 7, curve: 8,  flair: 8,  fame: 8,  height: 180, weight: 78 },
  { name: '인정기',      role: '공격수',   finishing: 9,  power: 5,  composure: 7, curve: 3,  flair: 4,  fame: 7,  height: 182, weight: 74 },
  { name: '에또오',        role: '공격수',   finishing: 9,  power: 7,  composure: 6, curve: 4,  flair: 6,  fame: 8,  height: 180, weight: 75 },
  { name: '발로찼니',    role: '공격수',   finishing: 8,  power: 10, composure: 2, curve: 5,  flair: 8,  fame: 8,  height: 189, weight: 88 },
  { name: '슈털링',      role: '공격수',   finishing: 7,  power: 5,  composure: 5, curve: 4,  flair: 7,  fame: 7,  height: 170, weight: 69 },
  { name: '트레제껴',    role: '공격수',   finishing: 8,  power: 7,  composure: 7, curve: 4,  flair: 5,  fame: 6,  height: 178, weight: 74 },
  { name: '마라토나',    role: '공격수',   finishing: 9,  power: 7,  composure: 8, curve: 8,  flair: 10, fame: 10, height: 165, weight: 70 },
  { name: '베르캠핑',    role: '공격수',   finishing: 8,  power: 6,  composure: 8, curve: 7,  flair: 9,  fame: 8,  height: 183, weight: 78 },
  { name: '짱붐',      role: '공격수',   finishing: 8,  power: 10, composure: 7, curve: 4,  flair: 5,  fame: 8,  height: 180, weight: 78 },
  { name: '지버퍼',        role: '미드필더', finishing: 7,  power: 7,  composure: 9, curve: 7,  flair: 10, fame: 10, height: 185, weight: 80 },
  { name: '이래스타',    role: '미드필더', finishing: 6,  power: 4,  composure: 8, curve: 6,  flair: 9,  fame: 8,  height: 171, weight: 68 },
  { name: '싸비스',        role: '미드필더', finishing: 5,  power: 4,  composure: 9, curve: 6,  flair: 8,  fame: 8,  height: 170, weight: 68 },
  { name: '픽셀로',    role: '미드필더', finishing: 6,  power: 9,  composure: 9, curve: 10, flair: 8,  fame: 8,  height: 177, weight: 68 },
  { name: '긱스나',      role: '미드필더', finishing: 6,  power: 5,  composure: 6, curve: 7,  flair: 8,  fame: 8,  height: 180, weight: 67 },
  { name: '스껄스',      role: '미드필더', finishing: 8,  power: 8,  composure: 9, curve: 8,  flair: 7,  fame: 8,  height: 170, weight: 70 },
  { name: '벡컴',        role: '미드필더', finishing: 6,  power: 7,  composure: 7, curve: 10, flair: 7,  fame: 10, height: 183, weight: 75 },
  { name: '제라드뮤지엄',      role: '미드필더', finishing: 8,  power: 9,  composure: 6, curve: 7,  flair: 7,  fame: 8,  height: 185, weight: 83 },
  { name: '램프',        role: '미드필더', finishing: 8,  power: 8,  composure: 7, curve: 6,  flair: 6,  fame: 7,  height: 183, weight: 88 },
  { name: '박제승',      role: '미드필더', finishing: 6,  power: 6,  composure: 7, curve: 4,  flair: 5,  fame: 8,  height: 178, weight: 70 },
  { name: '칸진리',      role: '미드필더', finishing: 7,  power: 7,  composure: 8, curve: 10, flair: 9,  fame: 8,  height: 173, weight: 68 },
  { name: '기성품',      role: '미드필더', finishing: 6,  power: 8,  composure: 7, curve: 7,  flair: 5,  fame: 6,  height: 189, weight: 84 },
  { name: '제주철',      role: '미드필더', finishing: 7,  power: 7,  composure: 7, curve: 6,  flair: 6,  fame: 6,  height: 183, weight: 75 },
  { name: '파추호',      role: '수비수',   finishing: 4,  power: 7,  composure: 6, curve: 6,  flair: 5,  fame: 5,  height: 175, weight: 72 },
  { name: '카푸치노',    role: '수비수',   finishing: 4,  power: 6,  composure: 5, curve: 5,  flair: 6,  fame: 6,  height: 176, weight: 74 },
  { name: '칼로쓰',      role: '수비수',   finishing: 5,  power: 10, composure: 5, curve: 10, flair: 7,  fame: 9,  height: 168, weight: 70 },
  { name: '라면스',      role: '수비수',   finishing: 4,  power: 8,  composure: 5, curve: 4,  flair: 5,  fame: 9,  height: 184, weight: 82 },
  { name: '맞대라치',    role: '수비수',   finishing: 3,  power: 7,  composure: 3, curve: 2,  flair: 3,  fame: 6,  height: 193, weight: 85 },
  { name: '퍼드난도',    role: '수비수',   finishing: 3,  power: 6,  composure: 5, curve: 3,  flair: 4,  fame: 6,  height: 188, weight: 84 },
  { name: '홀란더',      role: '공격수',   finishing: 10, power: 10, composure: 8, curve: 4,  flair: 4,  fame: 10, height: 195, weight: 88 },
  { name: '벨링검',      role: '미드필더', finishing: 8,  power: 8,  composure: 8, curve: 6,  flair: 7,  fame: 10, height: 186, weight: 75 },
  { name: '비니시우쓰',  role: '공격수',   finishing: 8,  power: 6,  composure: 5, curve: 6,  flair: 10, fame: 10, height: 176, weight: 73 },
  { name: '야말리',      role: '공격수',   finishing: 8,  power: 6,  composure: 8, curve: 9,  flair: 10, fame: 10, height: 180, weight: 72 },
  { name: '케인즈',      role: '공격수',   finishing: 10, power: 9,  composure: 9, curve: 7,  flair: 6,  fame: 9,  height: 188, weight: 86 },
  { name: '백일',        role: '공격수',   finishing: 8,  power: 9,  composure: 7, curve: 8,  flair: 8,  fame: 9,  height: 183, weight: 82 },
  { name: '삭카',        role: '공격수',   finishing: 8,  power: 6,  composure: 7, curve: 8,  flair: 8,  fame: 9,  height: 178, weight: 70 },
  { name: '포든',        role: '미드필더', finishing: 8,  power: 7,  composure: 8, curve: 7,  flair: 9,  fame: 9,  height: 171, weight: 69 },
  { name: '케데부',  role: '미드필더', finishing: 8,  power: 10, composure: 9, curve: 10, flair: 8,  fame: 10, height: 181, weight: 76 },
  { name: '무시알라야',  role: '미드필더', finishing: 7,  power: 6,  composure: 7, curve: 6,  flair: 10, fame: 9,  height: 184, weight: 70 },
  { name: '뷔르츠',      role: '미드필더', finishing: 8,  power: 7,  composure: 8, curve: 8,  flair: 9,  fame: 9,  height: 177, weight: 70 },
  { name: '펫데리',      role: '미드필더', finishing: 6,  power: 6,  composure: 8, curve: 6,  flair: 8,  fame: 8,  height: 172, weight: 65 },
  { name: '권도영',      role: '미드필더', finishing: 6,  power: 7,  composure: 8, curve: 7,  flair: 6,  fame: 7,  height: 179, weight: 80 },
  { name: '가비온',      role: '미드필더', finishing: 6,  power: 7,  composure: 5, curve: 5,  flair: 7,  fame: 8,  height: 173, weight: 70 },
  { name: '오시멘라',    role: '공격수',   finishing: 9,  power: 8,  composure: 6, curve: 4,  flair: 6,  fame: 8,  height: 186, weight: 78 },
  { name: '라웃아우로',  role: '공격수',   finishing: 9,  power: 8,  composure: 7, curve: 5,  flair: 7,  fame: 8,  height: 174, weight: 72 },
  { name: '크바라짜',    role: '공격수',   finishing: 7,  power: 7,  composure: 6, curve: 7,  flair: 10, fame: 8,  height: 183, weight: 78 },
  { name: '레바노프스키', role: '공격수',  finishing: 10, power: 8,  composure: 8, curve: 5,  flair: 6,  fame: 9,  height: 185, weight: 81 },
  { name: '그릴리쉬',    role: '미드필더', finishing: 6,  power: 6,  composure: 6, curve: 6,  flair: 9,  fame: 8,  height: 175, weight: 68 },
  { name: '누뇨쓰',      role: '공격수',   finishing: 6,  power: 9,  composure: 2, curve: 3,  flair: 6,  fame: 8,  height: 187, weight: 81 },
  { name: '해봤어츠',    role: '공격수',   finishing: 7,  power: 7,  composure: 5, curve: 5,  flair: 6,  fame: 7,  height: 178, weight: 75 },
  { name: '가르나쵸',    role: '공격수',   finishing: 7,  power: 6,  composure: 5, curve: 6,  flair: 9,  fame: 8,  height: 180, weight: 72 },
  { name: '황소탕',      role: '공격수',   finishing: 7,  power: 8,  composure: 6, curve: 5,  flair: 6,  fame: 7,  height: 177, weight: 77 },
  { name: '민짜이',      role: '수비수',   finishing: 4,  power: 9,  composure: 6, curve: 3,  flair: 4,  fame: 8,  height: 190, weight: 88 },
  { name: '오한겨',      role: '공격수',   finishing: 7,  power: 7,  composure: 6, curve: 6,  flair: 6,  fame: 7,  height: 177, weight: 74 },
  { name: '김덕배',      role: '미드필더', finishing: 6,  power: 8,  composure: 7, curve: 6,  flair: 6,  fame: 7,  height: 187, weight: 82 },
  { name: '아이쇼페이스', role: '공격수',  finishing: 3,  power: 8,  composure: 2, curve: 2,  flair: 10, fame: 10, height: 180, weight: 78 }
];

// 골키퍼 명단. 도감이자 상대 키퍼 풀이다.
// 실력과 fame이 어긋나는 칸이 일부러 있다. 못 막는데 유명한 키퍼가 이 게임의 웃음 담당이다.
// 특성은 파츠다. 전설 키퍼에는 이미 달려 나오고, 나머지는 만렙이나 이벤트로만 붙는다.
export const KEEPERS = [
  { name: '올리브영',   diving: 9,  handling: 9,  reflex: 9,  offball: 8, judgement: 8, agility: 8, balance: 8, strength: 9, mischief: 6, height: 188, weight: 91, fame: 10, traits: ['슈퍼스타', '크로스인터셉터'] },
  { name: '쿠폰',       diving: 9,  handling: 10, reflex: 9,  offball: 9, judgement: 9, agility: 8, balance: 9, strength: 8, mischief: 3, height: 191, weight: 92, fame: 10, traits: ['슈퍼스타'] },
  { name: '체해',       diving: 9,  handling: 8,  reflex: 10, offball: 8, judgement: 8, agility: 9, balance: 8, strength: 7, mischief: 2, height: 196, weight: 90, fame: 9,  traits: ['더블다이빙'] },
  { name: '노어이',   diving: 8,  handling: 9,  reflex: 9,  offball: 9, judgement: 9, agility: 8, balance: 8, strength: 8, mischief: 8, height: 193, weight: 93, fame: 10, traits: ['스위퍼키퍼', '발빠른재간'] },
  { name: '가시예스',   diving: 9,  handling: 7,  reflex: 10, offball: 7, judgement: 7, agility: 9, balance: 8, strength: 6, mischief: 4, height: 185, weight: 84, fame: 10, traits: ['더블다이빙'] },
  { name: '나빴으',     diving: 9,  handling: 8,  reflex: 9,  offball: 8, judgement: 8, agility: 9, balance: 8, strength: 6, mischief: 3, height: 185, weight: 80, fame: 9,  traits: ['더블다이빙'] },
  { name: '오좋아',     diving: 9,  handling: 7,  reflex: 9,  offball: 7, judgement: 7, agility: 9, balance: 7, strength: 6, mischief: 7, height: 185, weight: 78, fame: 9,  traits: ['슈퍼스타'] },
  { name: '데헤아리',   diving: 9,  handling: 6,  reflex: 10, offball: 7, judgement: 7, agility: 9, balance: 7, strength: 6, mischief: 4, height: 192, weight: 82, fame: 9,  traits: ['더블다이빙'] },
  { name: '렌더슨',   diving: 7,  handling: 8,  reflex: 8,  offball: 8, judgement: 8, agility: 7, balance: 8, strength: 7, mischief: 7, height: 188, weight: 86, fame: 9,  traits: ['슈퍼스로잉', '발빠른재간'] },
  { name: '알리쏭달쏭', diving: 9,  handling: 9,  reflex: 9,  offball: 8, judgement: 8, agility: 8, balance: 8, strength: 8, mischief: 3, height: 193, weight: 91, fame: 9,  traits: ['크로스인터셉터'] },
  { name: '쿠르투아네', diving: 8,  handling: 9,  reflex: 9,  offball: 8, judgement: 8, agility: 6, balance: 8, strength: 9, mischief: 3, height: 200, weight: 96, fame: 9,  traits: ['크로스인터셉터'] },
  { name: '떼슈테겐', diving: 9,  handling: 8,  reflex: 9,  offball: 8, judgement: 8, agility: 8, balance: 8, strength: 7, mischief: 4, height: 187, weight: 85, fame: 8,  traits: [] },
  { name: '노란무슬레', diving: 8,  handling: 8,  reflex: 8,  offball: 8, judgement: 8, agility: 7, balance: 8, strength: 8, mischief: 3, height: 189, weight: 82, fame: 8,  traits: [] },
  { name: '돈나룸마',   diving: 9,  handling: 7,  reflex: 9,  offball: 7, judgement: 7, agility: 7, balance: 7, strength: 9, mischief: 3, height: 196, weight: 93, fame: 9,  traits: [] },
  { name: '이기타',     diving: 6,  handling: 5,  reflex: 6,  offball: 4, judgement: 2, agility: 8, balance: 7, strength: 6, mischief: 10, height: 175, weight: 75, fame: 10, traits: ['스콜피온킥', '스위퍼키퍼'] },
  { name: '슈마이켈딸', diving: 8,  handling: 8,  reflex: 9,  offball: 8, judgement: 8, agility: 7, balance: 8, strength: 9, mischief: 8, height: 191, weight: 95, fame: 9,  traits: ['갓핸드'] },
  { name: '디따',       diving: 8,  handling: 8,  reflex: 9,  offball: 7, judgement: 7, agility: 8, balance: 8, strength: 7, mischief: 3, height: 185, weight: 80, fame: 8,  traits: [] },
  { name: '판대르싸', diving: 7,  handling: 9,  reflex: 8,  offball: 9, judgement: 9, agility: 6, balance: 8, strength: 8, mischief: 3, height: 197, weight: 90, fame: 9,  traits: ['크로스인터셉터'] },
  { name: '시먼가',     diving: 7,  handling: 8,  reflex: 7,  offball: 7, judgement: 7, agility: 6, balance: 7, strength: 8, mischief: 5, height: 191, weight: 90, fame: 7,  traits: [] },
  { name: '바르떼즈',   diving: 8,  handling: 5,  reflex: 8,  offball: 6, judgement: 5, agility: 8, balance: 7, strength: 6, mischief: 10, height: 178, weight: 76, fame: 8,  traits: ['발빠른재간'] },
  { name: '따파렐',   diving: 8,  handling: 7,  reflex: 8,  offball: 7, judgement: 7, agility: 8, balance: 7, strength: 6, mischief: 4, height: 176, weight: 73, fame: 7,  traits: [] },
  { name: '조하트가',   diving: 7,  handling: 6,  reflex: 8,  offball: 6, judgement: 6, agility: 7, balance: 7, strength: 7, mischief: 6, height: 196, weight: 91, fame: 8,  traits: [] },
  { name: '로버트그린', diving: 6,  handling: 3,  reflex: 6,  offball: 5, judgement: 5, agility: 6, balance: 5, strength: 6, mischief: 4, height: 191, weight: 89, fame: 7,  traits: [] },
  { name: '카리우쓰',   diving: 6,  handling: 3,  reflex: 6,  offball: 5, judgement: 3, agility: 7, balance: 5, strength: 6, mischief: 5, height: 187, weight: 84, fame: 8,  traits: [] },
  { name: '팔롭',       diving: 5,  handling: 3,  reflex: 5,  offball: 4, judgement: 3, agility: 5, balance: 4, strength: 5, mischief: 7, height: 190, weight: 88, fame: 6,  traits: [] },
  { name: '캄포스',     diving: 8,  handling: 6,  reflex: 8,  offball: 6, judgement: 4, agility: 9, balance: 7, strength: 5, mischief: 10, height: 168, weight: 74, fame: 8,  traits: ['스위퍼키퍼', '발빠른재간'] },
  { name: '칠라베르떼', diving: 7,  handling: 7,  reflex: 7,  offball: 7, judgement: 6, agility: 6, balance: 7, strength: 8, mischief: 9, height: 188, weight: 92, fame: 8,  traits: ['슈퍼스타'] },
  { name: '루시우스',     diving: 8,  handling: 7,  reflex: 8,  offball: 7, judgement: 6, agility: 8, balance: 7, strength: 7, mischief: 8, height: 176, weight: 78, fame: 7,  traits: ['스위퍼키퍼'] },
  { name: '레만두',       diving: 7,  handling: 6,  reflex: 8,  offball: 7, judgement: 5, agility: 7, balance: 7, strength: 7, mischief: 8, height: 191, weight: 89, fame: 7,  traits: [] },
  { name: '슈바저',     diving: 8,  handling: 8,  reflex: 8,  offball: 8, judgement: 8, agility: 7, balance: 8, strength: 8, mischief: 2, height: 196, weight: 90, fame: 8,  traits: [] },
  { name: '레이나요',     diving: 7,  handling: 7,  reflex: 8,  offball: 7, judgement: 7, agility: 7, balance: 7, strength: 7, mischief: 4, height: 185, weight: 82, fame: 7,  traits: [] },
  { name: '하와도',     diving: 8,  handling: 7,  reflex: 9,  offball: 7, judgement: 7, agility: 8, balance: 7, strength: 8, mischief: 5, height: 191, weight: 95, fame: 8,  traits: ['더블다이빙'] },
  { name: '수박시치',   diving: 8,  handling: 7,  reflex: 8,  offball: 7, judgement: 7, agility: 7, balance: 8, strength: 7, mischief: 4, height: 195, weight: 87, fame: 7,  traits: [] },
  { name: '오블록',     diving: 8,  handling: 8,  reflex: 9,  offball: 8, judgement: 8, agility: 8, balance: 8, strength: 8, mischief: 2, height: 188, weight: 87, fame: 8,  traits: [] },
  { name: '이운제',     diving: 8,  handling: 7,  reflex: 8,  offball: 7, judgement: 7, agility: 7, balance: 7, strength: 7, mischief: 3, height: 182, weight: 78, fame: 8,  traits: [] },
  { name: '정성뇽',     diving: 8,  handling: 7,  reflex: 8,  offball: 7, judgement: 7, agility: 7, balance: 7, strength: 8, mischief: 4, height: 187, weight: 84, fame: 7,  traits: [] },
  { name: '조현웃',     diving: 8,  handling: 7,  reflex: 8,  offball: 7, judgement: 7, agility: 7, balance: 7, strength: 7, mischief: 4, height: 189, weight: 84, fame: 6,  traits: [] },
  { name: '김승큐',     diving: 8,  handling: 7,  reflex: 8,  offball: 7, judgement: 6, agility: 8, balance: 7, strength: 7, mischief: 5, height: 187, weight: 82, fame: 6,  traits: [] },
  { name: '마르띠네쓰',   diving: 8,  handling: 7,  reflex: 9,  offball: 7, judgement: 7, agility: 8, balance: 8, strength: 8, mischief: 10, height: 195, weight: 88, fame: 10, traits: ['슈퍼스타'] },
  { name: '라야야',       diving: 8,  handling: 8,  reflex: 8,  offball: 8, judgement: 8, agility: 8, balance: 8, strength: 7, mischief: 4, height: 183, weight: 80, fame: 8,  traits: ['스위퍼키퍼'] },
  { name: '온따나',       diving: 8,  handling: 7,  reflex: 9,  offball: 7, judgement: 7, agility: 8, balance: 7, strength: 7, mischief: 3, height: 189, weight: 82, fame: 7,  traits: [] },
  { name: '삼머',         diving: 7,  handling: 7,  reflex: 8,  offball: 7, judgement: 7, agility: 7, balance: 7, strength: 8, mischief: 4, height: 194, weight: 89, fame: 7,  traits: [] },
  { name: '픽퍼드',       diving: 8,  handling: 6,  reflex: 8,  offball: 6, judgement: 6, agility: 8, balance: 7, strength: 6, mischief: 8, height: 185, weight: 77, fame: 8,  traits: ['슈퍼스로잉'] },
  { name: '메이뇽',       diving: 8,  handling: 7,  reflex: 9,  offball: 7, judgement: 6, agility: 8, balance: 7, strength: 7, mischief: 5, height: 191, weight: 84, fame: 7,  traits: [] },
  { name: '베르뜨',       diving: 7,  handling: 8,  reflex: 8,  offball: 8, judgement: 8, agility: 7, balance: 8, strength: 8, mischief: 3, height: 196, weight: 90, fame: 7,  traits: ['크로스인터셉터'] },
  { name: '동네형',     diving: 4,  handling: 4,  reflex: 4,  offball: 3, judgement: 3, agility: 4, balance: 4, strength: 5, mischief: 9, height: 174, weight: 88, fame: 1,  traits: [] }
];

// 영입가. 실력 합과 유명세를 따로 센다.
// 27은 아홉 칸이 전부 3일 때의 합이다. 바닥을 0원으로 두어야 최하위권이 초반에 손에 닿는다.
// 18은 칸 하나의 값, 25는 fame 한 칸의 값이다. fame을 더 비싸게 둔 이유는
// 못 막는데 유명한 키퍼가 이 게임의 웃음 담당이라 값이 실력만 따라가면 안 되기 때문이다.
// 결과: 동네형 약 79, 쿠폰 약 1150. 세이브 한 번이 12땀이라 초반에는 최하위권만 산다.
const COST_BASE = 27;
const COST_PER_STAT = 18;
const COST_PER_FAME = 25;
const COST_STATS = ['diving', 'handling', 'reflex', 'offball', 'judgement', 'agility', 'balance', 'strength', 'mischief'];

export function keeperCost(k) {
  let sum = 0;
  for (const s of COST_STATS) sum += Number(k[s]) || 0;
  return Math.max(0, Math.round((sum - COST_BASE) * COST_PER_STAT + (Number(k.fame) || 0) * COST_PER_FAME));
}

// 이적시장 한 장 값. 명단에서 가장 싼 지목 구매가 402 땀이라 그보다 낮게 둔다.
// 무작위 한 장이 이름을 찍는 것보다 비싸면 뽑을 이유가 사라진다.
export const PULL_COST = 380;

// 한 번에 뽑는 묶음. 한 장과 열 장 두 자리를 둔다. 값은 정확히 열 배라 묶음이 할인은 아니다.
// 묶음이 싸면 한 장 자리가 죽고, 뽑기가 값을 고르는 일이 아니라 한 번에 지르는 일이 된다.
export const PULL_BULK = 10;

// 완봉 한 판이 주는 이용권. 다섯 슛을 다 막아야 나오므로 방치로는 잘 안 쌓이고,
// 훈련 포인트가 시간에 붙는 것과 달리 이쪽은 실력에 붙는다. 두 축이 같은 자원을 주면 하나가 죽는다.
export const TICKET_PER_CLEAN = 1;

// 이용권 천장. 봇 크레딧과 버프에 천장을 둔 것과 같은 이유로 무한 적립을 막는다.
// 40이면 열 장 뽑기 네 번 몫이라, 모아서 크게 지르는 재미는 남고 영구 적립은 안 된다.
export const TICKET_CAP = 40;

// 이용권이 있으면 그것부터 쓴다. 값은 모자란 만큼만 땀으로 치른다.
// 이용권을 남겨 두고 땀을 먼저 쓰면 받은 보상이 쌓이기만 하고 영영 안 열린다.
export function pullBill(want, tickets, coin, unit) {
  const n = Math.max(0, Math.floor(Number(want) || 0));
  const free = Math.min(n, Math.max(0, Math.floor(Number(tickets) || 0)));
  const paid = n - free;
  // 값은 갈래가 정한다. 안 주면 동네 갈래 값으로 읽어, 옛 호출부가 조용히 다른 값을 쓰지 않는다.
  const cost = paid * (Number(unit) > 0 ? Number(unit) : PULL_COST);
  return { n, free, paid, cost, afford: cost <= (Number(coin) || 0) };
}

// 한 판이 끝났을 때 받는 이용권. 다섯 슛을 다 막았을 때만 나오고 천장을 넘지 않는다.
// 화면에 인라인으로 두면 브라우저를 띄워야만 이 규칙을 잴 수 있다.
export function ticketGain(results, held) {
  const now = Math.max(0, Math.floor(Number(held) || 0));
  if (!Array.isArray(results) || !results.length) return now;
  if (results.some((r) => r !== false)) return now;
  return Math.min(TICKET_CAP, now + TICKET_PER_CLEAN);
}

/* 뽑기 갈래. 명성 하한이 다르면 다른 뽑기다. 하한 7은 마흔여섯 중 마흔둘이라 갈래가 못 되고,
   9는 열여섯이라 갈래가 된다. 이용권은 동네에만 쓴다. 완봉 한 장으로 상위 풀이 열리면
   그 보상이 너무 세지고, 이용권의 값어치가 고르는 갈래에 따라 달라진다. */
export const PULL_KINDS = [
  { id: 'town', name: '동네 이적시장', floor: 0, ticketable: true, note: '아직 없는 키퍼 중 한 장이 나온다' },
  { id: 'legend', name: '전설 이적시장', floor: 9, ticketable: false, note: '명성 9 이상만 나온다. 이용권은 안 받는다' }
];

export function pullKindOf(id) {
  return PULL_KINDS.find((k) => k.id === id) || PULL_KINDS[0];
}

// 그 갈래가 뽑을 수 있는 카드. 하한 미만은 아예 안 들어간다.
export function poolFor(pool, id) {
  const floor = pullKindOf(id).floor;
  return (pool || []).filter((k) => (Number(k.fame) || 0) >= floor);
}

// 가중 평균 지목가. 그 풀에서 한 장이 나올 때 이름을 찍어 사면 얼마인가의 기댓값이다.
function namingEV(list) {
  let w = 0, wc = 0;
  for (const k of list) { const q = pullWeight(k); w += q; wc += q * keeperCost(k); }
  return w > 0 ? wc / w : 0;
}

/* 갈래별 한 장 값. 새 수를 지어내지 않고 동네 갈래가 이미 선 비율을 그대로 쓴다.
   동네는 기댓 지목가 706에 380이라 0.538이고, 상위 풀도 같은 비율에 선다.
   비율을 옮겨 적지 않고 명단에서 매번 되뽑으므로, 명단이 바뀌면 두 갈래가 같이 움직인다. */
export function pullCostOf(id, roster) {
  const all = Array.isArray(roster) && roster.length ? roster : KEEPERS;
  const base = namingEV(all);
  const here = namingEV(poolFor(all, id));
  if (!(base > 0) || !(here > 0)) return PULL_COST;
  return Math.round(here * (PULL_COST / base));
}

// fame 역가중. 유명한 키퍼일수록 드물게 나온다.
// (11 - fame)^2이면 fame 10은 fame 6보다 25배 귀하고, 실제 명단 기준 fame 10이 뽑힐 확률은 1.4%다.
// 선형 역가중은 6과 10의 차이가 1.7배에 그쳐 뽑기라는 느낌이 서지 않는다.
export function pullWeight(k) {
  const f = Number(k.fame) || 0;
  return Math.pow(11 - f, 2);
}

// 미보유 풀에서 한 장. 풀이 비면 null을 돌려주고, 부르는 쪽이 값을 깎기 전에 그것을 본다.
// 값만 깎고 아무것도 주지 않는 경로는 만렙 훈련 데드락과 같은 결함이다.
export function pullFrom(pool, rand) {
  if (!pool.length) return null;
  let total = 0;
  for (const k of pool) total += pullWeight(k);
  let roll = rand() * total;
  for (const k of pool) {
    roll -= pullWeight(k);
    if (roll <= 0) return k;
  }
  return pool[pool.length - 1];
}

// 특성은 파츠다. 쿨타임마다 확정 발동하고, 발동 순간 해당 칸을 최대치로 끌어올린다.
// 확률을 높이는 것이 아니라 확률을 건너뛴다. 그래서 얻기가 어렵다.
export const TRAITS = {
  스위퍼키퍼:     { owner: 'charge',   note: '쿨타임마다 나간다. 일대일마크와 펀칭이 보정된 상태로 나간다' },
  발빠른재간:     { owner: 'mischief', note: '드리블 돌파 성공률이 오른다' },
  더블다이빙:     { owner: 'reflex',   note: '쿨타임마다 두 번째 손이 나간다' },
  트리플다이빙:   { owner: 'reflex',   note: '세 번째 손까지 나간다. 가장 얻기 어렵다' },
  크로스인터셉터: { owner: 'offball',  note: '공중볼 판정에서 수비범위가 최대치가 된다' },
  슈퍼스로잉:     { owner: 'offball',  note: '쿨타임마다 던지기가 최대치가 된다' },
  스콜피온킥:     { owner: 'diving',   note: '쿨타임마다 뒤꿈치로 막는다' },
  슈퍼스타:       { owner: 'mischief', note: '쿨타임마다 아웃문그램 팔로워와 경기 수당이 오른다' },
  장풍:           { owner: 'handling', note: '핸들링이 일시적으로 최대치가 된다' },
  갓핸드:         { owner: 'handling', note: '핸들링이 일시적으로 최대치가 된다' },
  자쿰:           { owner: 'handling', note: '팔이 늘어난다. 핸들링이 일시적으로 최대치가 된다' }
};

/* 얼굴. 선수 마흔여섯과 키커 쉰여덟이 전부 같은 머리와 같은 피부로 서 있었다.
   이름이 다른 사람 백 명이 한 얼굴이면 로스터는 이름표 목록이지 사람 목록이 아니다.
   손으로 백 줄을 적는 대신 이름에서 뽑는다. 이름이 정본이므로 어느 화면에서 구워도 같은 얼굴이고
   저장에 실을 것도 없다. 생김새가 농담의 일부인 몇은 아래 FACE_OVERRIDE가 못 박는다. */
const SKINS = [0xf0cdb0, 0xdcae8a, 0xc08a5f, 0x8d5a34, 0x5d3a20];
/* 고르게 뽑으면 다섯 중 둘이 가장 어두운 두 칸으로 가서, 어느 이름에 어느 피부가 붙는지가
   무작위라는 것이 화면에서 주장처럼 읽힌다. 가운데를 두껍게 두고 양 끝을 얇게 둔다.
   특정 선수를 가리키는 이름은 아래 FACE_OVERRIDE가 직접 정한다. */
const SKIN_W = [24, 30, 22, 14, 10];
// 검정, 진갈, 갈, 탈색금, 백발, 붉은. 뒤의 셋은 흔치 않아 가중치를 낮게 준다.
const HAIRS = [0x1c1712, 0x2b1d14, 0x4a3320, 0xc7a75a, 0xbfc0bb, 0x7a3520];
const HAIR_W = [26, 24, 18, 14, 10, 8];

// 이름 한 줄에서 뽑는 난수. 같은 이름은 언제나 같은 흐름을 준다.
function nameRng(name) {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
}

function pickWeighted(list, weights, r) {
  let total = 0;
  for (const w of weights) total += w;
  let x = r * total;
  for (let i = 0; i < list.length; i += 1) {
    x -= weights[i];
    if (x < 0) return list[i];
  }
  return list[list.length - 1];
}

/* 이름을 비틀어 만든 선수라 원본이 떠오르는 한 가지가 있어야 하는 몇. 전부 적지 않는다.
   백 명을 손으로 적으면 다음에 로스터가 늘 때 그 줄이 같이 안 는다. */
const FACE_OVERRIDE = {
  '올리브영': { skin: 0xf0cdb0, hair: 0xc7a75a, beard: 0 },
  '노어이': { skin: 0xf0cdb0, hair: 0x4a3320, beard: 1 },
  '즐라탄탄한이보라': { skin: 0xdcae8a, hair: 0x1c1712, beard: 2, tail: 1 },
  '혹난두': { hair: 0x1c1712, beard: 0, skin: 0xdcae8a },
  '쌀라': { skin: 0xc08a5f, hair: 0x1c1712, beard: 2 },
  '아니이마르': { skin: 0xdcae8a, hair: 0xc7a75a, beard: 1 },
  '음빼빼로': { hair: 0x1c1712, beard: 0, skin: 0x8d5a34 },
  '김덕배': { skin: 0xf0cdb0, hair: 0xc7a75a, beard: 1 },
  '체해': { skin: 0xf0cdb0, hair: 0x4a3320, beard: 0 },
  '손흔든': { hair: 0x1c1712, beard: 0, skin: 0xf0cdb0 }
};

/* 한 사람의 얼굴. skin과 hair는 색, cut은 머리 껍데기의 모양,
   beard는 수염 단계(0 없음, 1 짧음, 2 덥수룩), tail은 뒤로 묶은 머리다. */
export function faceOf(name) {
  const r = nameRng(String(name || ''));
  const base = {
    skin: pickWeighted(SKINS, SKIN_W, r()),
    hair: pickWeighted(HAIRS, HAIR_W, r()),
    cut: {
      wide: 0.88 + r() * 0.3,
      tall: 0.82 + r() * 0.46,
      // 0.3은 바짝 민 머리, 0.62는 귀를 덮는 머리다. 그 밖은 모자나 헬멧으로 읽힌다.
      phi: 0.3 + r() * 0.32,
      tilt: (r() - 0.5) * 0.14
    },
    // 다섯에 둘꼴로 수염이 있고 그중 셋에 하나가 덥수룩하다.
    beard: r() < 0.4 ? (r() < 0.33 ? 2 : 1) : 0,
    tail: r() < 0.14 ? 1 : 0
  };
  return Object.assign(base, FACE_OVERRIDE[name] || {});
}
