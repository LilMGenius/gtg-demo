import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { GROWABLE, HIDDEN } from "../src/ledger.mjs";

// AGENTS.md는 코드가 어떤 경계로 나뉘는지를 말한다. 문서가 코드보다 뒤처지면
// 다음 세션이 없는 경계를 믿고 움직인다. 문서의 주장을 코드에 직접 물어서 잰다.

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const doc = readFileSync("AGENTS.md", "utf8");
const NL2 = String.fromCharCode(10);

// 백틱 안에 적힌 경로는 전부 실재해야 한다. 문서가 죽은 경로를 가리키면
// 읽는 쪽은 그 경계가 아직 있다고 믿는다. 홀수 조각이 백틱 안이다.
const inTicks = doc.split("`").filter((_, i) => i % 2 === 1);
// 이름 규칙 표기는 파일명이 아니다. 그것까지 실재를 물으면 규칙 자체를 문서에 못 적는다.
const looksPath = (s) => s.indexOf(String.fromCharCode(60)) < 0 && s.endsWith(".mjs") || s.endsWith(".css") || s.endsWith(".json") || (s.endsWith("/") && s.indexOf(" ") < 0);
const uniq = [...new Set(inTicks.filter(looksPath))];
const missing = uniq.filter((p) => !existsSync(p));
check("paths:all-exist", missing.length === 0, uniq.length + " cited, missing [" + missing.join(", ") + "]");

// 판정은 브라우저를 모른다. 이 성질이 깨지면 시드 재현 게이트가 전부 브라우저 의존이 된다.
const browserHits = [];
for (const f of readdirSync("src")) {
  const t = readFileSync("src/" + f, "utf8");
  if (t.includes("document.") || t.includes("window.") || t.includes("localStorage")) browserHits.push(f);
}
check("judgement:headless", browserHits.length === 0, "browser refs in [" + browserHits.join(", ") + "]");

// 브라우저를 모른다는 것과 밖을 모른다는 것은 다른 축이다. 판정이 헤드리스인 채로도
// 상태 파일 하나를 끌고 들어오면 시드 재현이 저장된 값에 매인다. 화살표는 상태에서 판정으로
// 한 방향뿐이고, 그 반대가 하나 생기는 순간 판정과 상태를 가른 이유가 사라진다.
// 살펴본 화살표 수를 같이 인쇄한다. 0을 세고 통과하면 그 초록은 규칙이 아니라 눈감음이다.
const outward = [];
let edges = 0;
for (const f of readdirSync("src")) {
  const t = readFileSync("src/" + f, "utf8");
  const parts = t.split("from ");
  for (let i = 1; i < parts.length; i += 1) {
    const s = parts[i].trim();
    const q = s[0];
    if (q !== '"' && q !== "'") continue;
    const end = s.indexOf(q, 1);
    if (end < 1) continue;
    const spec = s.slice(1, end);
    edges += 1;
    if (!spec.startsWith("./")) outward.push(f + " -> " + spec);
  }
}
check("judgement:imports-nothing-outward", edges > 0 && outward.length === 0, edges + " edges read, outward [" + outward.join(", ") + "]");

// 계기는 한 폴더에 산다. 판정을 부르는 실행 스크립트가 다른 곳에 생기면 게이트를 셀 때
// 그쪽이 빠지고, 빠진 쪽은 아무도 안 돌리며, 없는 게이트는 빨간불도 파란불도 내지 않는다.
let strays = "";
try {
  const hit = execSync("git grep -l src/chain.mjs -- *.mjs", { encoding: "utf8" }).trim();
  const ok = ["tools/", "test/", "web/", "src/"];
  strays = hit.split(NL2).filter((f) => f && !ok.some((d) => f.startsWith(d))).join(" ");
} catch { strays = ""; }
check("instruments:one-folder", strays === "", "outside [" + strays + "]");

// 원장 칸 수. 문서가 열다섯과 둘이라고 적었고 두 화면이 그 순서로 그린다.
check("ledger:growable-15", GROWABLE.length === 15, String(GROWABLE.length));
check("ledger:hidden-2", HIDDEN.length === 2, String(HIDDEN.length));

// 선반은 한 덩어리다. 여덟이 아니면 문서의 그 문장이 낡은 것이다.
const gear = readFileSync("web/src/state/gear.mjs", "utf8");
const names = ["GLOVES", "BOOTS", "KITS", "SOCKS", "GOALS", "CITIES", "HAIRS", "TATTOOS"];
const shelves = names.filter((n) => gear.includes("export const " + n)).length;
check("gear:eight-shelves", shelves === 8, shelves + " of " + names.length);

// 게이트 이름 규칙. 규칙 밖 파일이 tools에 섞이면 게이트 목록을 셀 수 없다.
const tools = readdirSync("tools").filter((f) => f.endsWith(".mjs") && !f.includes(".local."));
const gates = tools.filter((f) => f.endsWith("-gate.mjs"));
const helpers = tools.filter((f) => !f.endsWith("-gate.mjs"));
check("tools:gate-naming", gates.length >= 30, gates.length + " gates, helpers [" + helpers.join(", ") + "]");

// 판정을 부르는 게이트는 어느 키퍼로 쟀는지가 결론을 바꾼다. 이 세션에서만 세 번,
// 표본을 내부에 못 박은 게이트가 만렙 축을 붙이는 순간 거짓 초록을 냈다.
// 만렙 표본을 쓰거나, 안 쓰는 이유를 소스에 적거나 둘 중 하나는 해야 한다.
const SCOPE = "표본 범위:";
const mute = [];
for (const f of gates) {
  const src = readFileSync("tools/" + f, "utf8");
  if (!src.includes("src/chain.mjs")) continue;
  // 단순한 숫자 대입은 클램프에도 나온다. 실제로 성장 칸 전체를 순회하는 신호만 인정한다.
  const spans = src.includes("keeperAtLevel") || src.includes("GROWABLE");
  if (!spans && !src.includes(SCOPE)) mute.push(f.replace("-gate.mjs", ""));
}
check("instruments:sample-scope-stated", mute.length === 0, mute.join(", ") || "every judgement gate spans or declares");

// 한글 주석이 이스케이프 리터럴로 박히면 파일은 돌아가지만 사람이 못 읽는다.
// 게이트를 셸 히어독으로 써 넣을 때 매번 그렇게 되고, 그렇게 박힌 주석은
// 다음 세션에게 없는 주석과 같다. 다섯 파일에 1369자가 그 상태로 남아 있었다.
const BS = String.fromCharCode(92);
const escaped = [];
const walk = (d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const f = d + "/" + e.name;
    if (e.isDirectory()) { walk(f); continue; }
    if (!f.endsWith(".mjs") && !f.endsWith(".css")) continue;
    // 이웃 세션의 스크래치까지 세면 이 축은 산출물이 아니라 그날 폴더에 뭐가 놓였는지를 재다.
    if (f.includes(".local.")) continue;
    if (readFileSync(f, "utf8").includes(BS + "u")) escaped.push(f);
  }
};
for (const d of ["tools", "src", "web/src"]) walk(d);
check("source:no-escaped-text", escaped.length === 0, escaped.join(", ") || "every file reads as itself");

if (notes.length) console.log(notes.map((s) => "  ok   " + s).join(NL2));
if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join(NL2));
console.log(fails.length ? "agents FAIL " + fails.length : "agents PASS");
if (fails.length) process.exitCode = 1;
