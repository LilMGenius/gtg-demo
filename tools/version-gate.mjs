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
const tagged = tags.filter((t) => !NO_MANIFEST.has(t)).map((t) => t.slice(1));
const top = tagged.sort((a, b) => rank(b) - rank(a))[0];

// 열려 있는 칸은 마지막으로 닫은 칸보다 높아야 한다. 같으면 범프를 빠뜨린 것이다.
if (top && rank(head) <= rank(top)) fails.push('manifest ' + head + ' did not rise above tag v' + top);

for (const row of rows) console.log('  ' + row);
console.log('  manifest ' + head + ' vs highest tag v' + (top || 'none'));

if (fails.length) {
  console.log('FAIL version ' + fails.length);
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
console.log('PASS version ' + tags.length + ' tags');
