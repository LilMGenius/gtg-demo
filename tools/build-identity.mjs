// Writes web/build.json, the identity the game's wiki panel shows as v<version>+g<short> (web/src/build.mjs).
// Vercel's build names the commit it checked out in VERCEL_GIT_COMMIT_SHA (https://vercel.com/docs/environment-variables/system-environment-variables);
// a local run reads git. A build that cannot name a full commit fails instead of shipping the dev placeholder.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const commit = process.env.VERCEL_GIT_COMMIT_SHA
  || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('build-identity: no full commit sha, got ' + JSON.stringify(commit));
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
writeFileSync(new URL('web/build.json', root), JSON.stringify({ version, commit, short: commit.slice(0, 7), builtAt: new Date().toISOString() }) + '\n');
console.log('build-identity ' + version + '+g' + commit.slice(0, 7));
