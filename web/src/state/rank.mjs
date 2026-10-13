/* 랭킹. 키운 골키퍼끼리 줄을 세운다. 판마다 다른 방치 게임에서 남과 겨루는 자리는 이것 하나라,
   값은 판정이 이미 가진 장부에서 그 자리에서 뽑고 따로 세지 않는다. 화면이 제 수를 세면 장부가
   움직인 날 둘이 갈린다.
   판은 파운더가 부른 순서다. 세이브율, 팔로워, 꼬신 행인, 레벨, 능력치. */
export { nickKey } from '../../../server/rank-shared.mjs';
import { GROWABLE } from '../../../src/ledger.mjs';
import { RAPPORT_CAP } from './rapport.mjs';

/* 세이브율 판에 오르는 문턱. 야구의 규정 타석과 같은 자리다. 다섯 구 중 다섯을 막은 신인이
   1.000으로 맨 위에 서면 판이 운을 센다. 쉰 구는 열 세트, 방치로 한 시간이 안 걸리는 양이다. */
export const RANK_MIN_SHOTS = 50;

export const RANK_BOARDS = [
  { id: 'save', label: '세이브율' },
  { id: 'fans', label: '팔로워' },
  { id: 'charm', label: '꼬신 행인' },
  { id: 'level', label: '레벨' },
  { id: 'stat', label: '능력치' }
];

// 한 사람의 줄. 저장 하나에서 뽑는다. 저장 모양이 틀어져 있으면 0으로 선다.
export function rankLine(nick, saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const record = s.record && typeof s.record === 'object' ? s.record : {};
  let saves = 0;
  let shots = 0;
  for (const n of Object.keys(record)) {
    const row = record[n] || {};
    const a = Number(row.saved) || 0;
    saves += a;
    shots += a + (Number(row.conceded) || 0);
  }
  const k = s.keeper && typeof s.keeper === 'object' ? s.keeper : {};
  const rapport = s.rapport && typeof s.rapport === 'object' ? s.rapport : {};
  // 꼬신 행인은 라포를 끝까지 채운 사람이다. 만남에 이기면 그 자리에서 끝까지 찬다.
  const charm = Object.values(rapport).filter((n) => Number(n) >= RAPPORT_CAP).length;
  const stats = GROWABLE.map((g) => Number(k[g]) || 0);
  return {
    nick: String(nick || ''),
    shots,
    save: shots ? saves / shots : 0,
    fans: Math.max(0, Math.floor(Number(s.fans) || 0)),
    charm,
    level: Math.max(1, Math.floor(Number(k.level) || 1)),
    stat: stats.reduce((a, b) => a + b, 0) / stats.length
  };
}

// 판에 오를 수 있는가. 세이브율만 문턱이 있다.
export function qualifies(line, board) {
  return board !== 'save' || line.shots >= RANK_MIN_SHOTS;
}

/* 줄 세우기. 값이 같으면 같은 등수를 준다(1, 2, 2, 4). 같은 값의 사람들 사이 순서는 표본이
   많은 쪽이 먼저고, 그 다음 이름순이다. 이름순은 등수를 안 바꾸고 줄의 자리만 고정한다. */
export function sortBoard(lines, board) {
  const rows = (lines || []).filter((l) => l && qualifies(l, board));
  rows.sort((a, b) => (b[board] - a[board]) || (b.shots - a.shots) || a.nick.localeCompare(b.nick));
  let rank = 0;
  return rows.map((l, i) => {
    if (i === 0 || rows[i - 1][board] !== l[board]) rank = i + 1;
    return Object.assign({ rank }, l);
  });
}

/* 판의 값 글자. 세이브율은 야구의 타율처럼 세 자리 소수로 앞의 0을 뗀다(.723, 1.000).
   능력치는 열다섯 칸의 평균이라 소수 둘까지 적는다. 소수 한 자리면 한 칸 올린 것이 안 보인다. */
export function rankValue(board, v) {
  const n = Number(v) || 0;
  if (board === 'save') return n >= 1 ? '1.000' : n.toFixed(3).replace(/^0/, '');
  if (board === 'stat') return n.toFixed(2);
  return Math.floor(n).toLocaleString('ko-KR');
}

const API = (typeof document === 'undefined' ? '' : document.querySelector('meta[name="gtg-api"]')?.content.trim())?.replace(/[/]+$/, '') || 'api';

// 사람이 적는 로그인 ID는 비밀이 아니다. 계정별 비밀값은 한 번만 만들어 기기에 보관한다.
function rankId(id) {
  const key = 'gtg.rank.secret.v1:' + String(id).trim().toLowerCase();
  let secret = localStorage.getItem(key);
  if (!secret) {
    secret = crypto.randomUUID();
    localStorage.setItem(key, secret);
  }
  return secret;
}
async function call(path, body) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const stop = ctl ? setTimeout(() => ctl.abort(), API === 'api' ? 1500 : 10000) : 0;
  try {
    const res = await fetch(API + path, body
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctl && ctl.signal }
      : { signal: ctl && ctl.signal });
    const type = res.headers.get('content-type') || '';
    if (!type.includes('json')) return null;
    return { status: res.status, body: await res.json() };
  } catch {
    return null;
  } finally {
    if (stop) clearTimeout(stop);
  }
}

// 이름을 서버에 건다. 서버가 없으면 null, 남이 쓰면 { ok: false }.
export async function claimNick(id, nick) {
  const r = await call('/nick', { id: rankId(id), nick });
  if (!r) return API === 'api' ? null : { ok: false, why: '랭킹 서버에 연결할 수 없다' };
  if (r.status !== 200 && r.status !== 409) return { ok: false, why: '랭킹 서버에 연결할 수 없다' };
  return r.status === 200 ? { ok: true } : { ok: false, why: '이미 쓰는 닉네임이다' };
}

export async function sendRankLine(id, line) {
  const r = await call('/line', { id: rankId(id), line });
  return Boolean(r && r.status === 200);
}

// 서버의 판. 없으면 null이고 부르는 쪽이 이 기기의 판으로 선다.
export async function fetchLines() {
  const r = await call('/lines');
  return r && r.status === 200 && Array.isArray(r.body.lines) ? r.body.lines : null;
}

