// 세계의 사실은 여기 한 곳에만 살고 조문 인용을 같이 든다; 코드가 기억으로 적은 규칙을 코드 자신의 상수로 재면 틀려도 초록이다.
export const TEAM_RULE = {
  // IFAB 경기 규칙 3.1: 최대 열한 명 중 한 명은 골키퍼다.
  values: { maximum: 11, goalkeepers: 1 },
  source: {
    name: 'IFAB Laws of the Game 2026/27, Law 3.1',
    url: 'https://www.theifab.com/laws/latest/the-players/',
    clause: 'A match is played by two teams, each with a maximum of eleven players; one must be the goalkeeper.',
    checked: '2026-09-25'
  }
};
