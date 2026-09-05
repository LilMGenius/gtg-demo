// 저장. 탭을 닫으면 키퍼가 사라지는 게임은 방치형이 아니다.
// 자동은 손가락만 대신한다. 대기시간은 줄이지 않는다.
/* 저장 자리가 브라우저 하나에 하나였다. 같은 기기를 쓰는 두 사람이 한 판을 나눠 썼다는 뜻이다.
   이제 계정마다 갈린다. 계정이 없던 시절의 저장은 이름 없는 자리에 남아 있고, 첫 가입이
   그 자리를 물려받는다. 처음 시작한 사람의 판이 가입했다고 사라지면 안 되기 때문이다. */
const BASE = 'gtg.save.v1';
let who = null;
const KEY = () => (who ? BASE + ':' + who : BASE);

export function useAccount(id) {
  who = id || null;
}

/* 저장이 실제로 사는 자리. 계정이 생기면서 그 자리가 브라우저에서 계정으로 내려갔고,
   그 이동을 못 읽은 계기 넷이 브라우저 키를 그대로 읽어 null을 받았다. 자리를 아는 곳은
   여기 하나이므로 여기서 말한다. 계기가 키를 다시 적으면 다음 이동에서 또 갈린다. */
export function saveKey() {
  return KEY();
}

// 이름 없던 자리에 판이 남아 있는가. 첫 가입이 그것을 가져갈지 정하는 데 쓴다.
export function hasLegacy() {
  try { return Boolean(localStorage.getItem(BASE)); } catch { return false; }
}

// 이름 없던 판을 이 계정으로 옮긴다. 옮긴 뒤 원래 자리를 비워 두 번 물려받지 않게 한다.
export function adoptLegacy(id) {
  try {
    const raw = localStorage.getItem(BASE);
    if (!raw || !id) return false;
    localStorage.setItem(BASE + ':' + id, raw);
    localStorage.removeItem(BASE);
    return true;
  } catch {
    return false;
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY());
    if (!raw) return null;
    const s = JSON.parse(raw);
    // 구버전은 키퍼 하나만 저장했다. 보유 목록이 없어도 살려서 읽는다.
    const head = s && (Array.isArray(s.squad) ? s.squad[Number(s.pick) || 0] : s.keeper);
    if (!head || typeof head !== 'object' || !Number.isFinite(head.level)) return null;
    return s;
  } catch {
    return null;
  }
}

// 적립한 훈련 횟수도 같이 저장한다. 쓰지 않고 나간 포인트가 탭을 닫을 때
// 사라지면 방치형이 아니라 자리를 지키는 게임이 된다.
// 지갑은 두 갈래가 한 덩어리로 나가고 들어온다. 한 갈래만 쓰면 나머지가 다음 저장에서 지워진다.
// 보유 목록과 지금 뛰는 자리를 같이 넘긴다. keeper 칸은 구버전 저장을 읽는 쪽을 위해 남긴다.
// 게시물도 같이 내보낸다. 저장에 안 실으면 다음 방문에 계정이 빈 채로 열린다.
// 상대 전적도 같이 나간다. 탭을 닫을 때마다 지워지면 누구한테 약한지가 영영 안 쌓인다.
// 장비도 같이 나간다. 산 장갑이 탭을 닫을 때 벗겨지면 상점에서 쓴 육수가 사라진다.
// 봇 크레딧도 같이 나간다. 산 분이 탭을 닫을 때 사라지면 자동이 공짜로 돌아간 것과 같아진다.
// 버프도 같이 나간다. 남은 구가 탭을 닫을 때 사라지면 상점에서 산 소모품이 통째로 증발한다.
// 라포도 같이 나간다. 얼굴을 익힌 행인이 탭을 닫을 때 지워지면 반복해서 마주친 보람이 사라진다.
// 이적시장 이용권도 같이 나간다. 완봉으로 받은 장이 탭을 닫을 때 사라지면 그 판을 다시 이겨야 한다.
// 팔로우도 같이 나간다. 선팔과 맞팔이 탭을 닫을 때 지워지면 사람을 다시 처음부터 따라가야 한다.
// 키커 보유와 주전 열하나도 같이 나간다. 영입한 사람이 탭을 닫을 때 사라지면 그 육수가 증발한다.
export function save(squad, pick, auto, fans, points, wallet, posts, record, gear, bot, buff, rapport, tickets, social, kickers, eleven, onboard, pref) {
  try {
    const i = Number(pick) || 0;
    // 저장 호출자가 옛 형태여도 가운데를 써야 선호가 손상된 값으로 남지 않는다.
    const savedPref = [-1, 0, 1].includes(Number(pref)) ? Number(pref) : 0;
    localStorage.setItem(KEY(), JSON.stringify({ squad, pick: i, keeper: squad[i], auto, fans, points, wallet, posts: Array.isArray(posts) ? posts : [], record: record || {}, gear: gear || {}, bot: bot || {}, buff: buff || {}, rapport: rapport || {}, tickets: Number(tickets) || 0, social: social || {}, kickers: Array.isArray(kickers) ? kickers : [], eleven: Array.isArray(eleven) ? eleven : [], onboard: Number(onboard) || 0, pref: savedPref, at: Date.now() }));
  } catch {
    // 사파리 프라이빗 모드는 쓰기를 막는다. 저장이 안 되는 것과 게임이 죽는 것은 다른 일이다.
  }
}

// 저장에서 상대 전적을 꺼낸다. 이전 배포본 저장에는 이 칸이 없고, 그때는 빈 장부에서 시작한다.
// 두 수치만 받는다. 저장에 들어온 다른 모양은 장부를 오염시키므로 버린다.
export function readRecord(saved) {
  const src = saved && saved.record;
  if (!src || typeof src !== 'object') return {};
  const out = {};
  for (const name of Object.keys(src)) {
    const row = src[name];
    if (!row || typeof row !== 'object') continue;
    const saves = Number(row.saved) || 0;
    const conceded = Number(row.conceded) || 0;
    if (saves > 0 || conceded > 0) out[name] = { saved: saves, conceded };
  }
  return out;
}

// 저장에서 보유 목록을 꺼낸다. 구버전은 키퍼 하나를 한 명짜리 목록으로 승격한다.
export function readSquad(saved) {
  const list = Array.isArray(saved?.squad) ? saved.squad.filter((k) => k && Number.isFinite(k.level)) : [];
  if (list.length) {
    const i = Number(saved.pick);
    return { squad: list, pick: Number.isFinite(i) && i >= 0 && i < list.length ? i : 0 };
  }
  if (saved?.keeper && Number.isFinite(saved.keeper.level)) return { squad: [saved.keeper], pick: 0 };
  return { squad: [], pick: 0 };
}

// 자리를 비운 시간은 훈련 기회로만 쌓인다. 경기를 대신 뛰어주지는 않는다.
// 시계를 되돌린 사람과 몇 달 만에 돌아온 사람은 같은 상한을 받는다.
export const OFFLINE_MS = 20 * 60 * 1000;

/* 저장에서 키커 보유와 주전을 꺼낸다. 이전 배포본 저장에는 이 칸이 없고, 그때는 시작 주전으로 연다.
   명단에 없는 이름은 버린다. 로스터가 바뀐 뒤에도 저장이 유령을 판에 세우면 안 된다.
   주전이 정원을 안 채우면 보유에서 채워 넣는다. 열 명으로 도는 판은 없다. */
export function readSquadKickers(saved, all, fallback, cap) {
  const own = new Set(fallback);
  if (Array.isArray(saved?.kickers)) for (const n of saved.kickers) if (all.includes(n)) own.add(n);
  const kickers = [...own];
  const seen = [];
  if (Array.isArray(saved?.eleven)) {
    for (const n of saved.eleven) if (own.has(n) && seen.indexOf(n) < 0 && seen.length < cap) seen.push(n);
  }
  for (const n of fallback) { if (seen.length >= cap) break; if (seen.indexOf(n) < 0) seen.push(n); }
  for (const n of kickers) { if (seen.length >= cap) break; if (seen.indexOf(n) < 0) seen.push(n); }
  return { kickers, eleven: seen };
}
export const OFFLINE_CAP = 12;

export function offlineGain(at, now) {
  if (!Number.isFinite(at) || !Number.isFinite(now)) return 0;
  const away = now - at;
  if (!(away > 0)) return 0;
  return Math.min(OFFLINE_CAP, Math.floor(away / OFFLINE_MS));
}

export function wipe() {
  try { localStorage.removeItem(KEY()); } catch { /* 위와 같다 */ }
}
