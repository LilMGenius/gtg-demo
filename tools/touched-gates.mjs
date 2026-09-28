// 지운 것을 읽는 게이트. 화면에서 요소나 문구를 지우거나 바꾼 커밋은 그것을 읽던 게이트를 같은 랩에서 돌려야 한다.
// 손으로 고른 재실행 목록은 고른 사람이 기억하는 게이트만 돈다. 실측: 중복 머리를 지운 ddb7dcf가 머리를 읽는 게이트
// 여섯을 고쳤는데 gear는 목록에 없어 여덟 선반이 0/8로 두 랩을 지나갔다.
// 쓰임: node tools/touched-gates.mjs [--staged | <rev-range>]. 인자가 없으면 작업 트리와 HEAD의 차다.
// 사라진 줄에서 선택자와 화면 문구를 뽑고, 게이트가 그것을 선택자나 따옴표 문자열로 읽는 자리만 센다.
// 맨 낱말로 찾으면 주석과 변수 이름이 걸려 게이트 백 개가 다 걸리고, 그 목록은 아무도 안 돌린다.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const arg = process.argv[2];
const range = !arg ? [] : arg === "--staged" ? ["--cached"] : [arg];
const diffOf = (glob) => execFileSync("git", ["diff", "-U0", ...range, "--", glob], { encoding: "utf8", maxBuffer: 64 << 20 }).split(/\r?\n/);
const minus = (lines) => lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).map((l) => l.slice(1));
const plus = (lines) => lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)).join("\n");
const js = diffOf("web/src/*.mjs"), css = diffOf("web/src/*.css");
const kept = plus(js) + "\n" + plus(css);

const sel = new Set(), text = new Set(), tags = new Set();
// 태그는 머리와 표처럼 화면의 한 역할을 맡는 것만 센다. div나 span은 어디에나 있어 걸리는 게이트가 뜻이 없다.
const ROLE_TAGS = /<(h[1-6]|table|thead|th|small|label)[\s>]/g;
const comment = (l) => /^\s*(\/\/|\/\*|\*)/.test(l);
for (const line of minus(js)) {
  if (comment(line)) continue;
  for (const m of line.matchAll(/(?:id|class)="([^"]+)"/g)) for (const t of m[1].split(/\s+/)) if (/^[a-zA-Z][\w-]{2,}$/.test(t)) sel.add(t);
  for (const m of line.matchAll(/el\('([\w-]+)'\)/g)) sel.add(m[1]);
  for (const m of line.matchAll(ROLE_TAGS)) tags.add(m[1]);
  for (const m of line.matchAll(/querySelector(?:All)?\('([^']+)'\)/g)) for (const s of m[1].matchAll(/[#.]([a-zA-Z][\w-]{2,})/g)) sel.add(s[1]);
  for (const m of line.matchAll(/'([^'\n]{0,30})'/g)) if (/[가-힣]{2,}/.test(m[1])) text.add(m[1].trim());
  for (const m of line.matchAll(/>([^<>]*[가-힣]{2,}[^<>]*)</g)) text.add(m[1].trim());
}
for (const line of minus(css)) {
  if (comment(line) || !line.includes("{")) continue;
  for (const s of line.slice(0, line.indexOf("{")).matchAll(/[#.]([a-zA-Z][\w-]{2,})/g)) sel.add(s[1]);
}
// 같은 커밋이 다시 쓴 것은 지운 것이 아니다. 선택자는 낱말 경계로, 문구는 그대로 찾는다.
const keptWords = new Set(kept.match(/[\w-]+/g) || []);
for (const t of [...sel]) if (keptWords.has(t)) sel.delete(t);
for (const t of [...text]) if (!t || kept.includes(t)) text.delete(t);
// 다시 쓴 태그 수가 지운 수보다 적지 않으면 태그는 남았다.
const count = (src, t) => (src.match(new RegExp('<' + t + '[\\s>]', 'g')) || []).length;
for (const t of [...tags]) if (count(kept, t) >= count(minus(js).join('\n'), t)) tags.delete(t);

const dir = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const esc = (t) => t.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
const hits = {};
for (const f of readdirSync(dir).filter((f) => f.endsWith("-gate.mjs"))) {
  const src = readFileSync(join(dir, f), "utf8");
  const found = [];
  for (const t of sel) if (new RegExp("[#.\"'\x60]" + esc(t) + "(?![\\w-])").test(src)) found.push(t);
  for (const t of tags) if (new RegExp("[\"'\x60 >]" + t + "(?![\\w-])[\"'\x60 .:#\\[]").test(src)) found.push('<' + t + '>');
  for (const t of text) if (new RegExp("[\"'\x60/>]" + esc(t)).test(src)) found.push(t);
  if (found.length) hits[f.replace(/-gate\.mjs$/, "")] = found.slice(0, 4);
}
const names = Object.keys(hits);
console.log("touched-gates: " + (names.length ? names.join(",") : "none") + " (removed " + sel.size + " selectors, " + tags.size + " tags, " + text.size + " strings)");
for (const n of names) console.log("  " + n + " reads " + hits[n].map((t) => JSON.stringify(t)).join(" "));
