/* 랭킹 서버. 이름 하나에 계정 하나를 묶고 계정마다 마지막 줄 하나를 든다.
   이것은 모의 서버다. 호스팅과 과금은 사람이 정할 일이고, 그 앞까지 클라이언트와 약속과 게이트가
   이 모양으로 선다. 실제 서버가 서면 같은 세 길(/nick, /line, /lines)을 받으면 된다.
   저장은 파일 하나다. 경로를 안 주면 메모리에만 산다(게이트가 그렇게 쓴다). */
import { readFileSync, writeFileSync } from 'node:fs';
import { nickKey } from '../web/src/state/rank.mjs';

const NICK_MAX = 12;

export function createRankStore(file) {
  let db = { nicks: {}, lines: {} };
  if (file) {
    try { db = Object.assign(db, JSON.parse(readFileSync(file, 'utf8'))); } catch { /* 첫 실행 */ }
  }
  const flush = () => { if (file) writeFileSync(file, JSON.stringify(db)); };
  return {
    // 이름을 건다. 같은 계정이 이름을 바꾸면 옛 이름을 놓는다.
    claim(id, nick) {
      const key = nickKey(nick);
      if (!id || !key || key.length > NICK_MAX) return 400;
      const owner = db.nicks[key];
      if (owner && owner !== id) return 409;
      for (const k of Object.keys(db.nicks)) if (db.nicks[k] === id && k !== key) delete db.nicks[k];
      db.nicks[key] = id;
      flush();
      return 200;
    },
    // 줄은 이름을 건 계정만 올린다. 이름이 판의 얼굴이라 이름 없는 줄은 판에 설 자리가 없다.
    post(id, line) {
      const nick = Object.keys(db.nicks).find((k) => db.nicks[k] === id);
      if (!nick || !line || typeof line !== 'object') return 403;
      const pick = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      db.lines[id] = { nick: String(line.nick || nick).slice(0, NICK_MAX), shots: pick(line.shots), save: Math.min(1, Math.max(0, pick(line.save))),
        fans: pick(line.fans), charm: pick(line.charm), level: pick(line.level), stat: pick(line.stat) };
      flush();
      return 200;
    },
    lines() {
      return Object.values(db.lines);
    }
  };
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 4096) break; }
  try { return JSON.parse(raw); } catch { return null; }
}

// /api/로 끝나는 길을 받는다. 게임 페이지가 어느 깊이에 서든 같은 출처의 api를 부르기 때문이다.
export async function handleRank(store, req, res) {
  const at = req.url.split('?')[0].indexOf('/api/');
  if (at < 0) return false;
  const path = req.url.split('?')[0].slice(at + 4);
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'GET' && path === '/lines') { send(200, { lines: store.lines() }); return true; }
  if (req.method === 'POST' && (path === '/nick' || path === '/line')) {
    const body = await readBody(req);
    if (!body) { send(400, {}); return true; }
    const status = path === '/nick' ? store.claim(String(body.id || ''), body.nick) : store.post(String(body.id || ''), body.line);
    send(status, {});
    return true;
  }
  send(404, {});
  return true;
}

