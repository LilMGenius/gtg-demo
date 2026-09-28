// 개발용 정적 서버. 데모 배포에는 쓰지 않는다.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize, join } from 'node:path';
import { createRankStore, handleRank } from '../server/rank.mjs';

const ROOT = process.cwd();
const PORT = Number(process.argv[2] || 10310);
// 랭킹 모의 서버가 같은 출처에 선다. 판은 이 파일 하나에 남고 지우면 빈 판에서 다시 선다.
const RANK = createRankStore(join(ROOT, 'server', 'rank.local.json'));
const TYPE = {
  '.html': 'text/html; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

createServer(async (req, res) => {
  if (await handleRank(RANK, req, res)) return;
  const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([/\\.]+)/, '');
  const path = join(ROOT, rel || 'index.html');
  try {
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPE[extname(path)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('404');
  }
}).listen(PORT, '127.0.0.1');
