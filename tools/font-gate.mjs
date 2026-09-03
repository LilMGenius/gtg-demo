import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// 폰트 게이트. Black Han Sans는 한글 2733자만 담고 있다. 완성형 11172자가 아니다.
// 담기지 않은 음절은 다른 서체로 대체 렌더되어 그 글자만 굵기와 자폭이 달라진다.
// 이 검사가 없을 때 로스터에 담기지 않은 이름 하나가 들어가 그대로 나갔다.
const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "");
const TTF = join(ROOT, "web/assets/fonts/black-han-sans.ttf");
const SKIP = [".git", "node_modules", "vendor", "video.local", "critic.local", "renders"];

function coverage(path) {
  const d = readFileSync(path);
  const num = d.readUInt16BE(4);
  let cmap = null;
  for (let i = 0; i < num; i++) {
    const o = 12 + 16 * i;
    if (d.toString("latin1", o, o + 4) === "cmap") cmap = d.readUInt32BE(o + 8);
  }
  if (cmap === null) throw new Error("cmap table missing");
  const n = d.readUInt16BE(cmap + 2);
  let sub = null;
  for (let i = 0; i < n; i++) {
    const off = d.readUInt32BE(cmap + 8 + 8 * i);
    if (d.readUInt16BE(cmap + off) === 4) sub = cmap + off;
  }
  if (sub === null) throw new Error("format 4 subtable missing");
  const segX2 = d.readUInt16BE(sub + 6);
  const seg = segX2 / 2;
  const endO = sub + 14;
  const startO = endO + segX2 + 2;
  const deltaO = startO + segX2;
  const rangeO = deltaO + segX2;
  const set = new Set();
  for (let i = 0; i < seg; i++) {
    const s = d.readUInt16BE(startO + 2 * i);
    const e = d.readUInt16BE(endO + 2 * i);
    if (s === 0xffff) continue;
    const delta = d.readInt16BE(deltaO + 2 * i);
    const ro = d.readUInt16BE(rangeO + 2 * i);
    for (let c = s; c <= e; c++) {
      let g;
      if (ro === 0) g = (c + delta) & 0xffff;
      else {
        const gi = rangeO + 2 * i + ro + 2 * (c - s);
        if (gi + 2 > d.length) continue;
        g = d.readUInt16BE(gi);
        if (g) g = (g + delta) & 0xffff;
      }
      if (g) set.add(c);
    }
  }
  return set;
}

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (SKIP.includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(mjs|js|html)$/.test(name)) out.push(p);
  }
  return out;
}

const cov = coverage(TTF);
// 대조군. 폰트가 담고 있다고 아는 글자와 담지 않는다고 아는 글자를 먼저 확인한다.
// 둘이 기대대로 안 나오면 이 게이트는 cmap을 잘못 읽고 있는 것이다.
const ctlIn = cov.has(0xac00) && cov.has(0xd0a5);
const ctlOut = !cov.has(0xb389) && !cov.has(0xacf9);
const miss = new Map();
for (const f of walk(ROOT, [])) {
  const s = readFileSync(f, "utf8");
  for (const ch of new Set(s)) {
    const c = ch.codePointAt(0);
    if (c >= 0xac00 && c <= 0xd7a3 && !cov.has(c)) {
      if (!miss.has(ch)) miss.set(ch, []);
      miss.get(ch).push(relative(ROOT, f));
    }
  }
}
console.log("  " + (ctlIn ? "ok  " : "FAIL") + " control:known-covered-syllables-present " + ctlIn);
console.log("  " + (ctlOut ? "ok  " : "FAIL") + " control:known-absent-syllables-absent " + ctlOut);
for (const [ch, files] of miss) console.log("  FAIL glyph:" + ch + " U+" + ch.codePointAt(0).toString(16) + " " + files.slice(0, 3).join(" "));

// 본문 서체는 이 코퍼스에서 깎아 만든 부분집합이라 cmap을 읽는 대신 지문을 맞춘다.
// woff2는 압축이라 여기서 못 읽고, 읽더라도 물어볼 것은 같다. 소스가 움직였는데
// 글꼴을 다시 안 깎았는가다. 지문이 어긋나면 새로 들어온 글자가 다른 서체로 떨어진다.
const META = join(ROOT, "web/assets/fonts/pretendard-subset.json");
let bodyOk = false;
let bodyWhy = "manifest missing";
try {
  const meta = JSON.parse(readFileSync(META, "utf8"));
  const seen = new Set();
  for (const f of walk(ROOT, [])) for (const ch of readFileSync(f, "utf8")) seen.add(ch);
  for (let c = 0x20; c < 0x7f; c += 1) seen.add(String.fromCharCode(c));
  const text = [...seen].filter((c) => c.trim() !== "" || c === " ").sort().join("");
  const sig = createHash("sha256").update(text, "utf8").digest("hex");
  bodyOk = sig === meta.sha256;
  bodyWhy = bodyOk ? meta.chars + " glyphs, corpus " + sig.slice(0, 16) : "corpus " + sig.slice(0, 16) + " but font built for " + String(meta.sha256).slice(0, 16) + ", rerun tools/subset-font.py";
} catch (e) {
  bodyWhy = String(e.message);
}
console.log("  " + (bodyOk ? "ok  " : "FAIL") + " body:subset-matches-the-source-corpus " + bodyWhy);
const ok = ctlIn && ctlOut && miss.size === 0 && bodyOk;
console.log("font " + (ok ? "PASS " + cov.size : "FAIL " + (miss.size + (bodyOk ? 0 : 1))));
process.exit(ok ? 0 : 1);

