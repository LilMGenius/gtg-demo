// Language. The game was written in Korean and every surface paints Korean strings, so English is a layer
// over the painted DOM: each text node and label is looked up in i18n-en.json with its numbers lifted out
// as {0},{1}, and the original is kept so switching back restores the exact bytes.
// The dictionary is one flat file so tools/i18n-gate.mjs can prove coverage without running the game.
import EN from './i18n-en.json' with { type: 'json' };

const KEY = 'gtg.lang';
const HANGUL = /[\uac00-\ud7a3]/;
const NUM = /\d+(?:[.,]\d+)*/g;
const ATTRS = ['aria-label', 'title', 'placeholder', 'alt'];

export const LANGS = ['ko', 'en'];

export function pickLang(search = location.search, stored = localStorage.getItem(KEY)) {
  const q = new URLSearchParams(search).get('lang');
  if (LANGS.includes(q)) return q;
  if (LANGS.includes(stored)) return stored;
  return 'en';
}

// Key of a painted string: whitespace collapsed, each number run replaced by its position.
export function keyOf(text) {
  const nums = [];
  const key = text.replace(/\s+/g, ' ').trim().replace(NUM, (m) => '{' + (nums.push(m) - 1) + '}');
  return { key, nums };
}

// Keys written with {n} hold a slot the game fills with anything (a name, a count); they match as patterns.
const escRe = (s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
const patterns = new Map();
function patternsOf(dict) {
  if (!patterns.has(dict)) {
    const list = [];
    for (const [k, v] of Object.entries(dict)) {
      if (!/\{(n|\d+)\}/.test(k) || !HANGUL.test(k)) continue;
      const slots = [];
      const src = k.split(/(\{(?:n|\d+)\})/).map((p, i) => (i % 2 ? (slots.push(p), '(.+?)') : escRe(p))).join('');
      list.push({ re: new RegExp('^' + src + '$'), slots, v, weight: k.replace(/\{(?:n|\d+)\}/g, '').length });
    }
    list.sort((a, b) => b.weight - a.weight);
    patterns.set(dict, list);
  }
  return patterns.get(dict);
}

function fill(v, slots, caps, dict, depth) {
  let out = v;
  slots.forEach((s, i) => { out = out.split(s).join(translate(caps[i], dict, depth + 1)); });
  return out;
}

export function translate(text, dict = EN, depth = 0) {
  if (!text || !HANGUL.test(text) || depth > 6) return text;
  const lead = text.match(/^\s*/)[0];
  const tail = text.match(/\s*$/)[0];
  const core = text.slice(lead.length, text.length - tail.length).replace(/\s+/g, ' ');
  const { key, nums } = keyOf(core);
  const hit = dict[key];
  if (hit !== undefined) return lead + hit.replace(/\{(\d+)\}/g, (_, i) => nums[i] ?? '') + tail;
  if (dict[core] !== undefined) return lead + dict[core] + tail;
  for (const p of patternsOf(dict)) {
    const m = core.match(p.re);
    if (m) return lead + fill(p.v, p.slots, m.slice(1), dict, depth) + tail;
  }
  // A line built from parts (a name, a colon, a stock phrase) has no whole entry; translate the parts.
  const parts = core.split(/(\s*[,:·|/()\[\]<>!?]\s*|\.\s+|\s+-\s+)/);
  if (parts.length > 1) {
    const joined = parts.map((s, i) => (i % 2 ? s : translate(s, dict, depth + 1))).join('');
    if (!HANGUL.test(joined)) return lead + joined + tail;
  }
  // A name in front of or behind a stock phrase: the longest known word-run wins, the rest is translated alone.
  const words = core.split(' ');
  for (let n = words.length - 1; n >= 1; n--) {
    const head = words.slice(0, n).join(' ');
    const rest = words.slice(n).join(' ');
    for (const [a, b, nameFirst] of [[head, rest, false], [rest, head, true]]) {
      const ka = keyOf(a);
      if (dict[ka.key] === undefined || !HANGUL.test(a)) continue;
      const va = dict[ka.key].replace(/\{(\d+)\}/g, (_, i) => ka.nums[i] ?? '');
      const vb = translate(b, dict, depth + 1);
      if (HANGUL.test(vb)) continue;
      const low = (s) => (/^[A-Z][a-z]+ [a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
      const out = nameFirst ? vb + ' ' + low(va) : va + ' ' + low(vb);
      return lead + out.trim() + tail;
    }
  }
  return text;
}

let lang = 'ko';
export const getLang = () => lang;
export function t(text) { return lang === 'en' ? translate(text) : text; }

const origText = new WeakMap();
const origAttr = new WeakMap();
const misses = new Set();
let observer = null;

function skip(node) {
  const p = node.nodeType === 1 ? node : node.parentElement;
  return !p || p.closest('script,style,[data-i18n-skip]');
}

function doText(node) {
  if (skip(node)) return;
  const now = node.nodeValue;
  const rec = origText.get(node);
  const base = rec && rec.out === now ? rec.src : now;
  if (!HANGUL.test(base)) return;
  const out = translate(base);
  if (out === base) { misses.add(keyOf(base).key); return; }
  origText.set(node, { src: base, out });
  if (now !== out) node.nodeValue = out;
}

function doAttrs(node) {
  if (skip(node)) return;
  for (const a of ATTRS) {
    const now = node.getAttribute(a);
    if (now == null) continue;
    const rec = origAttr.get(node) || {};
    const base = rec[a] && rec[a].out === now ? rec[a].src : now;
    if (!HANGUL.test(base)) continue;
    const out = translate(base);
    if (out === base) { misses.add(keyOf(base).key); continue; }
    rec[a] = { src: base, out };
    origAttr.set(node, rec);
    if (now !== out) node.setAttribute(a, out);
  }
}

function sweep(root) {
  if (root.nodeType === 3) return doText(root);
  if (root.nodeType !== 1) return;
  doAttrs(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? doText(n) : doAttrs(n);
}

function restore(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.nodeType === 3) { const r = origText.get(n); if (r && n.nodeValue === r.out) n.nodeValue = r.src; continue; }
    const rec = origAttr.get(n);
    if (rec) for (const a in rec) if (n.getAttribute(a) === rec[a].out) n.setAttribute(a, rec[a].src);
  }
}

const HEAD = typeof document === 'undefined' ? {} : {
  ko: { title: document.title, desc: document.querySelector('meta[name=description]')?.content },
  en: { title: 'Grow The Goalkeeper 3D', desc: 'Not a football game. A goalkeeper game. Every shot flips its outcome several times before it lands. A low-poly slapstick goalkeeper idle RPG on a dirt neighbourhood pitch.' }
};

export function setLang(next) {
  lang = LANGS.includes(next) ? next : 'ko';
  localStorage.setItem(KEY, lang);
  document.documentElement.lang = lang;
  document.title = HEAD[lang].title;
  const meta = document.querySelector('meta[name=description]');
  if (meta && HEAD[lang].desc) meta.content = HEAD[lang].desc;
  if (lang === 'en') {
    sweep(document.body);
    observer ||= new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doAttrs(m.target);
        else for (const n of m.addedNodes) sweep(n);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  } else {
    observer?.disconnect();
    restore(document.body);
  }
  const btn = document.getElementById('lang');
  if (btn) {
    btn.querySelector('.code').textContent = lang === 'en' ? 'EN' : 'KO';
    btn.setAttribute('aria-label', lang === 'en' ? 'Language: English. Switch to Korean' : '언어: 한국어. 영어로 바꾸기');
    btn.setAttribute('aria-pressed', String(lang === 'en'));
  }
  window.dispatchEvent(new CustomEvent('lang-change', { detail: lang }));
}

// Strings the dictionary missed in this session. The i18n gate fails on any.
if (typeof window !== 'undefined') {
  window.__i18nMisses = () => [...misses];
  window.__lang = (l) => (l ? setLang(l) : lang);
}

