import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// gamewiki (MIT), https://github.com/DaedalGames/gamewiki: the site output of the same source that
// wikisrc-gate proves for the embed output. One source has two outputs, and a lap that rebuilds one
// and forgets the other ships half a wiki; this gate reddens when the tracked site drifts from a fresh
// build, or when the site stops carrying the sub-path base the Pages deploy serves it under.
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CLI = join(ROOT, 'node_modules/gamewiki/dist/cli.js');
const SOURCE = join(ROOT, 'web/wiki/src');
const SITE = join(ROOT, 'web/wiki/site');
const DIST = join(ROOT, 'web/wiki/dist');
const FACTS = join(ROOT, 'web/wiki/facts.json');
const BASE = '/gtg-demo/web/wiki/site';
const fails = [];
const check = (name, ok, detail) => { console.log((ok ? 'GREEN ' : 'RED ') + name + ' ' + JSON.stringify(detail)); if (!ok) fails.push(name); };
const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]).sort();
const hashes = dir => Object.fromEntries(files(dir).map(f => [relative(dir, f).replaceAll('\\', '/'), createHash('sha256').update(readFileSync(f)).digest('hex')]));
const watchdog = setTimeout(() => { console.error('wikisite WATCHDOG'); process.exit(1); }, 120000);
watchdog.unref();
const temp = mkdtempSync(join(ROOT, 'tools/wikisite.local-'));
try {
  check('wikisite:the-tracked-site-exists', existsSync(join(SITE, 'index.html')), { site: relative(ROOT, SITE) });
  execFileSync(process.execPath, [join(ROOT, 'tools/wiki-facts.mjs')], { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 20000 });
  execFileSync(process.execPath, [CLI, 'build', SOURCE, '--out', join(temp, 'fresh'), '--base', BASE, '--home', '../../index.html', '--facts', FACTS], { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 90000 });
  const tracked = existsSync(SITE) ? hashes(SITE) : {};
  const fresh = hashes(join(temp, 'fresh'));
  const drift = Object.keys({ ...tracked, ...fresh }).filter(k => tracked[k] !== fresh[k]);
  check('wikisite:the-tracked-site-matches-a-fresh-build', drift.length === 0 && Object.keys(tracked).length > 20, { files: Object.keys(tracked).length, drift: drift.slice(0, 8) });
  const entities = JSON.parse(readFileSync(join(DIST, 'entities.json'), 'utf8'));
  const missing = entities.map(e => e.id + '.html').filter(n => !existsSync(join(SITE, n)));
  check('wikisite:every-entity-has-a-page', missing.length === 0 && existsSync(join(SITE, 'index.html')), { entities: entities.length, missing });
  const html = readFileSync(join(SITE, 'coin-save.html'), 'utf8');
  const bare = html.match(/(href|src)="\/(_astro|pagefind|favicon)/g) || [];
  const based = html.match(new RegExp('(href|src)="' + BASE + '/_astro/', 'g')) || [];
  check('wikisite:assets-resolve-under-the-pages-base', bare.length === 0 && based.length > 0, { base: BASE, bare: bare.length, based: based.length });
  const game = readFileSync(join(SITE, 'game.html'), 'utf8');
  check('wikisite:the-site-header-links-back-to-the-game', /<a href="\.\.\/\.\.\/index\.html" rel="me"/.test(game), { page: 'game.html' });
  const sourceLinks = files(SOURCE).filter(f => f.endsWith('.md')).flatMap(f => [...readFileSync(f, 'utf8').matchAll(/\]\(([^)]+)\)/g)].map(m => ({ file: relative(ROOT, f), href: m[1] }))).filter(l => /^(\.|\/|https?:)/.test(l.href));
  check('wikisite:no-source-link-resolves-differently-per-consumer', sourceLinks.length === 0, { links: sourceLinks });
  const pagesDist = readFileSync(join(DIST, 'pages.json'), 'utf8');
  const pagesSite = readFileSync(join(SITE, 'pages.json'), 'utf8');
  const tables = JSON.parse(pagesDist).map(p => ({ id: p.id, tables: (p.bodyHtml.match(/<table/g) || []).length }));
  check('wikisite:both-outputs-carry-the-same-body-bytes', pagesDist === pagesSite && tables.filter(t => t.tables > 0).length >= 9, { identical: pagesDist === pagesSite, tables });
  const panel = readFileSync(join(ROOT, 'web/src/ui/wiki.mjs'), 'utf8');
  check('wikisite:the-panel-links-to-the-site', panel.includes("wiki/site/index.html") && panel.includes('class="site"'), { file: 'web/src/ui/wiki.mjs' });
} finally {
  rmSync(temp, { recursive: true, force: true });
  clearTimeout(watchdog);
}
if (fails.length) { console.log('FAIL wikisite ' + fails.length); process.exit(1); }
console.log('PASS wikisite 8');
