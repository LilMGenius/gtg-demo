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
// 결과: 동네형 약 79, 쿠폰 약 1150. 세이브 한 번이 12코인이라 초반에는 최하위권만 산다.
const COST_BASE = 27;
const COST_PER_STAT = 18;
const COST_PER_FAME = 25;
const COST_STATS = ['diving', 'handling', 'reflex', 'offball', 'judgement', 'agility', 'balance', 'strength', 'mischief'];

export function keeperCost(k) {
  let sum = 0;
  for (const s of COST_STATS) sum += Number(k[s]) || 0;
  return Math.max(0, Math.round((sum - COST_BASE) * COST_PER_STAT + (Number(k.fame) || 0) * COST_PER_FAME));
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
