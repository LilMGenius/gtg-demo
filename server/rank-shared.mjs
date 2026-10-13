// 두 서버와 클라이언트가 같은 이름 비교를 쓴다. 가입 화면의 열두 글자 계약이다.
export const NICK_MAX = 12;
export function nickKey(nick) {
  return String(nick || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function sanitizeLine(line, nick) {
  const pick = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { nick: String(nick).slice(0, NICK_MAX), shots: pick(line.shots),
    save: Math.min(1, Math.max(0, pick(line.save))), fans: pick(line.fans),
    charm: pick(line.charm), level: pick(line.level), stat: pick(line.stat) };
}
