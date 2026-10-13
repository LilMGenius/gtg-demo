// Harvests every Korean UI string the GTG web game renders, plus a static fallback scan of
// web/src/**/*.mjs and web/index.html, into .omo/i18n-harvest.local.json.
// Launch and start sequence follow tools/keys-gate.mjs. Usage: node tools/i18n-harvest.mjs [port] [--static-only]
import { readFileSync, readdirSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../', import.meta.url);
const ROOTP = decodeURIComponent(ROOT.pathname).replace(/^\/([A-Za-z]:)/, '$1');
const PORT = Number(process.argv.find((a) => /^\d+$/.test(a)) || 10312);
const STATIC_ONLY = process.argv.includes('--static-only');
// lang=ko pins the source language; headless Chrome reports an English locale and would otherwise translate.
const BASE = 'http://127.0.0.1:' + PORT + '/web/index.html?seed=20&preset=rich,famous,veteran&lang=ko';
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/;
const OUT = join(ROOTP, '.omo', 'i18n-harvest.local.json');

// ---- static scan -------------------------------------------------------------------------
// Walks JS source char by char so comments are dropped and string/template literals kept.
export function jsStrings(code) {
  const out = [];
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i], d = code[i + 1];
    if (c === '/' && d === '/') { while (i < n && code[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { const e = code.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === "'" || c === '"') {
      let s = ''; i++;
      while (i < n && code[i] !== c && code[i] !== '\n') { if (code[i] === '\\') { s += unesc(code[i + 1]); i += 2; } else s += code[i++]; }
      i++; out.push(s); continue;
    }
    if (c === '\x60') {
      let s = ''; i++;
      while (i < n && code[i] !== '\x60') {
        if (code[i] === '\\') { s += unesc(code[i + 1]); i += 2; continue; }
        if (code[i] === '$' && code[i + 1] === '{') {
          let depth = 1; i += 2;
          while (i < n && depth) { if (code[i] === '{') depth++; else if (code[i] === '}') depth--; i++; }
          out.push(s); s = ''; continue;
        }
        s += code[i++];
      }
      i++; out.push(s); continue;
    }
    i++;
  }
  return out;
}
function unesc(ch) { return ch === 'n' ? '\n' : ch === 't' ? '\t' : ch; }

function walk(dir, acc = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, acc); else if (p.endsWith('.mjs')) acc.push(p);
  }
  return acc;
}

const isCode = (s) => (s.includes('(') && s.includes(';')) || s.includes('=>') || s.includes('function');

// Splits markup into its visible text pieces and attribute values.
function markupPieces(s) {
  const pieces = [];
  for (const m of s.matchAll(/\b(?:aria-label|title|placeholder|alt)\s*=\s*(["'])(.*?)\1/g)) pieces.push(m[2]);
  const bare = s.replace(/\b(?:aria-label|title|placeholder|alt)\s*=\s*(["'])(.*?)\1/g, '');
  for (const t of bare.replace(/<[^>]*>?/g, '\n').split('\n')) {
    // Template fragments such as '" title="x">label' keep only the segments outside quotes and brackets.
    if (/["<>]/.test(t)) { for (const seg of t.split(/["<>]/)) if (!seg.includes('=')) pieces.push(seg); }
    else pieces.push(t);
  }
  return pieces;
}

// Wiki bodies render as HTML in the help panel: one piece per block (paragraph, cell, heading, item).
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
export function htmlBlocks(html) {
  return html
    .replace(/<\/(?:p|h[1-6]|li|td|th|tr|caption|dt|dd|div|blockquote|summary|figcaption)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z#0-9]+;/gi, (e) => ENT[e] ?? e)
    .split('\n');
}
function wikiScan(add) {
  const pages = JSON.parse(readFileSync(join(ROOTP, 'web', 'wiki', 'dist', 'pages.json'), 'utf8'));
  const visit = (v, key) => {
    if (typeof v === 'string') {
      if (!HANGUL.test(v)) return;
      if (/Html$/i.test(key || '') || /<\/?[a-z][^>]*>/i.test(v)) for (const b of htmlBlocks(v)) add('web/wiki/dist/pages.json', b);
      else add('web/wiki/dist/pages.json', v);
    } else if (Array.isArray(v)) v.forEach((x) => visit(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, k);
  };
  visit(pages);
}

export function staticScan() {
  const hits = [];
  const add = (file, s) => {
    for (const piece of markupPieces(s)) {
      const t = piece.trim();
      if (t && HANGUL.test(t) && !isCode(t)) hits.push({ file, text: t });
    }
  };
  for (const f of walk(join(ROOTP, 'web', 'src'))) {
    const rel = f.slice(ROOTP.length).replace(/\\/g, '/');
    for (const s of jsStrings(readFileSync(f, 'utf8'))) if (HANGUL.test(s)) add(rel, s);
  }
  const html = readFileSync(join(ROOTP, 'web', 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const scripts = [];
  const body = html.replace(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, inner) => { if (tag.toLowerCase() === 'script') scripts.push(inner); return ''; });
  add('web/index.html', body);
  for (const sc of scripts) for (const s of jsStrings(sc)) if (HANGUL.test(s)) add('web/index.html', s);
  wikiScan((file, s) => { const t = s.trim(); if (t && HANGUL.test(t)) hits.push({ file, text: t }); });
  return hits;
}

// ---- keys --------------------------------------------------------------------------------
export function toKey(raw) {
  let k = raw.trim().replace(/\s+/g, ' ');
  let idx = 0;
  k = k.replace(/\d+(?:[.,]\d+)*/g, () => '{' + (idx++) + '}');
  const bare = k.replace(/\{\d+\}/g, '').replace(/[\s\p{P}\p{S}]/gu, '');
  return bare ? k : null;
}

// ---- browser drive -----------------------------------------------------------------------
const INIT = () => {
  const H = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7A3]/;
  const seen = (window.__hv = window.__hv || { text: new Set(), attr: new Set() });
  const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];
  const take = (node) => {
    if (!node) return;
    if (node.nodeType === 3) { const t = node.nodeValue.trim(); if (t && H.test(t)) seen.text.add(t); return; }
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
    if (node.nodeType === 1) {
      const tag = node.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE') return;
      for (const a of ATTRS) { const v = node.getAttribute(a); if (v && H.test(v)) seen.attr.add(v.trim()); }
    }
    for (const c of node.childNodes) take(c);
  };
  window.__hvSweep = () => take(document);
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'characterData') take(m.target);
      else if (m.type === 'attributes') take(m.target.nodeType === 1 ? { nodeType: 1, tagName: m.target.tagName, getAttribute: (a) => m.target.getAttribute(a), childNodes: [] } : null);
      else for (const n of m.addedNodes) take(n);
    }
  });
  mo.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  for (const fn of ['alert', 'confirm', 'prompt']) {
    const orig = window[fn];
    window[fn] = (msg) => { if (msg && H.test(String(msg))) seen.text.add(String(msg).trim()); return fn === 'confirm' ? true : fn === 'prompt' ? '' : undefined; };
    void orig;
  }
};

async function drive(log) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ executablePath: EXE });
  log('BINARY chromium=' + browser.version() + ' pid=' + (browser.process?.()?.pid ?? 'n/a'));
  const steps = [];
  const out = { text: new Set(), attr: new Set() };
  try {
    for (const vp of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const ctx = await browser.newContext({ viewport: vp });
      await ctx.addInitScript(INIT);
      const p = await ctx.newPage();
      p.on('dialog', (d) => d.accept().catch(() => {}));
      const sweep = async () => { try { await p.evaluate(() => window.__hvSweep()); } catch {} };
      const step = async (name, fn) => {
        try { await fn(); await sweep(); steps.push(vp.width + ':' + name + ':ok'); }
        catch (e) { steps.push(vp.width + ':' + name + ':fail ' + String(e.message).split('\n')[0]); }
      };
      const clickAll = async (scope, sel) => {
        const n = await p.locator(scope + ' ' + sel).count();
        for (let i = 0; i < n; i++) {
          await p.locator(scope + ' ' + sel).nth(i).click({ force: true, timeout: 2000 }).catch(() => {});
          await p.waitForTimeout(180); await sweep();
        }
      };
      const shut = async (id) => {
        for (let i = 0; i < 4; i++) {
          if (await p.locator('#' + id).evaluate((b) => b.hidden).catch(() => true)) return;
          await p.keyboard.press('Escape'); await p.waitForTimeout(150);
        }
      };
      await step('title', async () => { await p.goto(BASE); await p.waitForSelector('#go'); await p.waitForTimeout(800); });
      await step('start', async () => {
        // keys-gate's start: tab natively onto #go and press Enter; a DOM click is the fallback.
        for (let i = 0; i < 30 && !(await p.locator('#go').evaluate((b) => b === document.activeElement)); i++) await p.keyboard.press('Tab');
        await p.keyboard.press('Enter');
        const ok = await p.waitForFunction(() => document.getElementById('title').hidden, null, { timeout: 8000 }).then(() => true, () => false);
        if (!ok) { await p.evaluate(() => document.getElementById('go').click()); await p.waitForFunction(() => document.getElementById('title').hidden, null, { timeout: 15000 }); }
        await p.waitForTimeout(600);
        await p.evaluate(() => { try { window.__wallet().coin = 100000; } catch {} });
      });
      await step('auto-on', async () => { await p.click('#auto', { force: true }); });
      await step('play-' + (vp.width > 500 ? 60 : 20) + 's', async () => {
        const end = Date.now() + (vp.width > 500 ? 60000 : 20000);
        while (Date.now() < end) { await p.waitForTimeout(2000); await sweep(); }
      });
      for (const id of ['gym', 'roster', 'gram', 'me', 'shop', 'wiki']) {
        await step('panel-' + id, async () => {
          await p.evaluate(() => { try { window.__wallet().coin = 100000; } catch {} });
          await p.click('#' + id + 'Btn', { force: true }); await p.waitForTimeout(400); await sweep();
          for (const sel of ['.tab[data-tab]', '.kind[data-pos]', '.kind[data-kind]', '.cats [data-cat]']) await clickAll('#' + id, sel);
          await p.locator('#' + id + ' details summary').evaluateAll((ss) => ss.forEach((s) => s.click())).catch(() => {});
          await p.waitForTimeout(200);
        });
        if (id === 'shop') {
          await step('shop-buys', async () => {
            const tabs = await p.locator('#shop .tab[data-tab]').count();
            for (let t = 0; t < tabs; t++) {
              await p.locator('#shop .tab[data-tab]').nth(t).click({ force: true }).catch(() => {});
              await p.waitForTimeout(200);
              const buys = p.locator('#shop .buy:not(.pull)');
              const nb = Math.min(await buys.count(), 3);
              for (let b = 0; b < nb; b++) {
                await p.evaluate(() => { try { window.__wallet().coin = 100000; } catch {} });
                await buys.nth(b).click({ force: true, timeout: 1500 }).catch(() => {});
                await p.waitForTimeout(350); await sweep();
              }
            }
          });
          await step('pull-reveal', async () => {
            await p.evaluate(() => { try { window.__wallet().coin = 100000; window.__revealPace && window.__revealPace(3); } catch {} });
            const tabs = await p.locator('#shop .tab[data-tab]').count();
            for (let t = 0; t < tabs && !(await p.locator('#shop .buy.pull').count()); t++) { await p.locator('#shop .tab[data-tab]').nth(t).click({ force: true }); await p.waitForTimeout(200); }
            await p.locator('#shop .buy.pull').nth(0).click({ force: true });
            await p.waitForSelector('#pull .now img', { timeout: 8000 });
            for (let i = 0; i < 30; i++) {
              await sweep();
              if (await p.evaluate(() => document.getElementById('pull').hidden)) break;
              await p.mouse.click(vp.width / 2, vp.height / 2); await p.waitForTimeout(300);
            }
          });
        }
        await shut('pull'); await shut(id);
      }
      await step('date', async () => {
        await p.evaluate(() => { window.__rapport()['0:2'] = 15; window.__wallet().coin = 100000; });
        await p.click('#meBtn', { force: true });
        await p.click('#me .tab[data-tab="face"]', { force: true });
        await p.click('#me .go[data-passer="2"]', { force: true });
        await p.waitForTimeout(600); await sweep();
        await p.locator('#date button').evaluateAll((bs) => bs.slice(0, 6).forEach((b) => { try { b.click(); } catch {} })).catch(() => {});
        await p.waitForTimeout(800);
      });
      await shut('date'); await shut('me');
      await step('tail-play', async () => { await p.waitForTimeout(8000); });
      const got = await p.evaluate(() => ({ text: [...window.__hv.text], attr: [...window.__hv.attr] }));
      got.text.forEach((t) => out.text.add(t)); got.attr.forEach((t) => out.attr.add(t));
      await ctx.close();
    }
  } finally {
    await browser.close();
    log('BROWSER closed');
  }
  return { text: [...out.text], attr: [...out.attr], steps };
}

// ---- main --------------------------------------------------------------------------------
if (import.meta.url === 'file:///' + process.argv[1].replace(/\\/g, '/') || process.argv[1].endsWith('i18n-harvest.mjs')) {
  const log = (s) => console.log(s);
  let runtime = { text: [], attr: [], steps: [], error: null };
  if (!STATIC_ONLY) {
    try { runtime = { ...(await drive(log)), error: null }; }
    catch (e) { runtime.error = String(e.stack || e); log('RUNTIME FAIL ' + e.message); }
  }
  const stat = staticScan();
  const keys = {};
  const addKey = (raw, src) => {
    const k = toKey(raw);
    if (!k) return;
    (keys[k] ||= new Set()).add(src);
  };
  runtime.text.forEach((t) => addKey(t, 'runtime-text'));
  runtime.attr.forEach((t) => addKey(t, 'runtime-attr'));
  stat.forEach((h) => addKey(h.text, 'static:' + h.file));
  const keyList = Object.keys(keys).sort().map((k) => ({ key: k, sources: [...keys[k]] }));
  mkdirSync(join(ROOTP, '.omo'), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ base: BASE, runtime, static: stat, keys: keyList }, null, 1));
  log('runtime text=' + runtime.text.length + ' attr=' + runtime.attr.length + ' static=' + stat.length + ' keys=' + keyList.length
    + ' runtimeKeys=' + keyList.filter((k) => k.sources.some((s) => s.startsWith('runtime'))).length);
  log('steps ' + JSON.stringify(runtime.steps));
  log('wrote ' + OUT);
}

