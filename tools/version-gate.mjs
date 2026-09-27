import { VERSION } from '../web/src/build.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// 태그가 트리에 매니페스트를 담기 전에 붙었다. 그 태그는 대조할 값 자체가 없다.
const NO_MANIFEST = new Set(['v0.1.0']);

// stderr를 삼킨다. 없는 경로를 묻는 것이 이 게이트의 정상 동작이라 fatal 한 줄이 결과처럼 보인다.
const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function manifestVersionAt(ref) {
  try {
    return JSON.parse(git('show', ref + ':package.json')).version;
  } catch {
    return null;
  }
}

// 0.10.0이 0.9.0보다 크다. 문자열 비교로는 뒤집힌다.
const rank = (v) => v.split('.').map(Number).reduce((a, n) => a * 1000 + n, 0);

const tags = git('tag', '-l', 'v*').split('\n').filter(Boolean);
const fails = [];
const rows = [];

for (const tag of tags) {
  const commit = git('rev-list', '-n', '1', tag);
  const declared = tag.slice(1);
  const inTree = manifestVersionAt(tag);
  if (NO_MANIFEST.has(tag)) {
    rows.push(tag + ' ' + commit.slice(0, 7) + ' exempt (no manifest in tree)');
    if (inTree !== null) fails.push(tag + ' now carries a manifest so the exemption is stale');
    continue;
  }
  if (inTree === null) fails.push(tag + ' has no package.json in its tree');
  else if (inTree !== declared) fails.push(tag + ' tree says ' + inTree);
  rows.push(tag + ' ' + commit.slice(0, 7) + ' tree=' + inTree);

  // 태그가 현재 줄기에서 떨어져 나가면 그 버전은 배포 이력에서 사라진다.
  try {
    git('merge-base', '--is-ancestor', commit, 'HEAD');
  } catch {
    fails.push(tag + ' is not an ancestor of HEAD');
  }
}

const head = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
// 화면 모듈과 배포 매니페스트가 다른 릴리스를 말하면 좌표를 믿을 수 없다.
if (VERSION !== head) fails.push('version:the-screen-label-matches-the-manifest ' + VERSION + ' != ' + head);
else console.log('  ok version:the-screen-label-matches-the-manifest ' + VERSION);
const tagged = tags.filter((t) => !NO_MANIFEST.has(t)).map((t) => t.slice(1));
const top = tagged.sort((a, b) => rank(b) - rank(a))[0];

// 배포된 바이트가 말하는 버전은 마지막 태그와 같아야 한다. 매니페스트는 태그가 붙는 커밋에서 오른다.
if (top && rank(head) !== rank(top)) fails.push('manifest ' + head + ' is not the highest tag v' + top);

// 버전 범프는 그 시점 gamewiki 최신 릴리스로 다시 지은 위키를 싣는다. 출력의 gamewiki.json이 자기를 쓴 릴리스를 적으므로
// 범프 커밋의 트리만 읽으면 된다. 기준은 범프 커밋 시각에 나와 있던 가장 높은 gamewiki 태그라 뒤에 gamewiki가 올라도 옛 릴리스는 빨개지지 않는다.
// 도장이 생기기 전의 릴리스(0.8.1까지)는 대조할 값이 없다.
const STAMPED_FROM = '0.9.0';
const GAMEWIKI = process.env.GAMEWIKI_DIR || new URL('../../gamewiki', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const stampAt = (ref, dir) => {
  try {
    return JSON.parse(git('show', ref + ':web/wiki/' + dir + '/gamewiki.json')).version ?? null;
  } catch {
    return null;
  }
};
const dist = stampAt('HEAD', 'dist');
const site = stampAt('HEAD', 'site');
if (dist && dist === site) console.log('  ok version:the-wiki-names-its-gamewiki ' + dist);
else if (rank(head) >= rank(STAMPED_FROM)) fails.push('version:the-wiki-names-its-gamewiki dist=' + dist + ' site=' + site);

let releases = null;
try {
  if (!process.env.CI) execFileSync('git', ['-C', GAMEWIKI, 'fetch', '--tags', '-q'], { stdio: 'ignore', timeout: 20000 });
  releases = execFileSync('git', ['-C', GAMEWIKI, 'for-each-ref', 'refs/tags/v*', '--format=%(refname:short) %(creatordate:unix)'], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean).map((line) => { const [t, at] = line.split(' '); return { version: t.slice(1), at: Number(at) }; });
} catch {
  releases = null;
}
const latestAt = (at) => releases.filter((r) => r.at <= at).map((r) => r.version).sort((a, b) => rank(b) - rank(a))[0] ?? null;
// 범프 커밋은 매니페스트 버전이 부모와 달라지는 커밋이다. 가장 높은 태그의 커밋과, 아직 태그가 없는 HEAD의 범프를 잰다.
const bumps = new Set();
if (top && rank(top) >= rank(STAMPED_FROM)) bumps.add(git('rev-list', '-n', '1', 'v' + top));
if (rank(head) >= rank(STAMPED_FROM) && manifestVersionAt('HEAD') !== manifestVersionAt('HEAD^')) bumps.add(git('rev-parse', 'HEAD'));
for (const commit of bumps) {
  if (!releases) {
    fails.push('version:a-bump-ships-the-latest-gamewiki cannot read gamewiki tags at ' + GAMEWIKI);
    continue;
  }
  const want = latestAt(Number(git('show', '-s', '--format=%ct', commit)));
  const got = stampAt(commit, 'site');
  if (got !== want) fails.push('version:a-bump-ships-the-latest-gamewiki ' + commit.slice(0, 7) + ' wiki=' + got + ' latest=' + want);
  else console.log('  ok version:a-bump-ships-the-latest-gamewiki ' + commit.slice(0, 7) + ' ' + got);
}

for (const row of rows) console.log('  ' + row);
console.log('  manifest ' + head + ' vs highest tag v' + (top || 'none'));

if (fails.length) {
  console.log('FAIL version ' + fails.length);
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log('PASS version ' + tags.length + ' tags');
