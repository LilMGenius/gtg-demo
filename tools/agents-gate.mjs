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
// 꼺쇠표가 들어간 것은 파일명이 아니라 이름 규칙이다. 그것까지 실재를 물으면 규칙을 문서에 못 적는다.
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

if (notes.length) console.log(notes.map((s) => "  ok   " + s).join(NL2));
if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join(NL2));
console.log(fails.length ? "agents FAIL " + fails.length : "agents PASS");
if (fails.length) process.exitCode = 1;
