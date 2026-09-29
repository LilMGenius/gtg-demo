// 모듈 경계의 자. 화면 코드를 main에서 컴포넌트로 떼어 내면 main의 top-level 변수를 읽거나 쓰던 줄이 그대로 따라가,
// 새 파일에서는 선언도 import도 없는 이름이 된다. 문법 검사는 이것을 못 잡고 실행 중 그 줄이 돌 때만 ReferenceError로 드러난다.
// 실측: 선수단 창을 떼어 낸 날 fitting = {} 한 줄이 따라가 교체 버튼을 누를 때만 죽었고, 게이트 셋이 콘솔 오류로 그것을 잡았다.
// 묻는 것은 하나다. web/src의 모든 모듈에서 읽거나 쓰는 이름이 그 파일 안의 선언, import, 브라우저 전역 중 하나로 풀리는가.
// 대조군은 선언 없는 이름을 한 줄 심은 사본이다. 그 사본은 빨개져야 한다.
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Babel (MIT) parser and traverse ship inside Playwright; entry-gate uses the same bundle.
const { babelParse, traverse } = createRequire(require.resolve("playwright/package.json"))("./lib/transform/babelBundle.js");

const GLOBALS = new Set(Object.getOwnPropertyNames(globalThis).concat(["window", "document", "localStorage", "sessionStorage", "navigator", "location", "history",
  "ResizeObserver", "MutationObserver", "IntersectionObserver", "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle", "matchMedia", "screen",
  "devicePixelRatio", "innerWidth", "innerHeight", "scrollTo", "addEventListener", "removeEventListener", "alert", "CSS", "Image", "Audio", "AudioContext", "OfflineAudioContext",
  "HTMLElement", "HTMLCanvasElement", "OffscreenCanvas", "Node", "Event", "CustomEvent", "KeyboardEvent", "PointerEvent", "FontFace", "Blob", "FileReader",
  "createImageBitmap", "ImageData", "WebGL2RenderingContext", "caches", "indexedDB"]));

// import했지만 한 번도 안 읽는 이름. 떼어 낸 뒤 쓰는 쪽이 옮겨 간 import가 남으면 모듈이 무엇에 기대는지가 거짓말을 한다.
function unusedImports(src, name) {
  const out = [];
  traverse(babelParse(src, name, true), { ImportDeclaration(p) { for (const s of p.node.specifiers) { const b = p.scope.getBinding(s.local.name); if (b && !b.referenced) out.push(s.local.name); } } });
  return out;
}

function freeNames(src, name) {
  const free = new Set();
  const ast = babelParse(src, name, true);
  traverse(ast, { Identifier(p) {
    const used = p.isReferencedIdentifier() || p.parentPath.isAssignmentExpression({ left: p.node }) || p.parentPath.isUpdateExpression();
    if (used && !p.scope.hasBinding(p.node.name, true) && !GLOBALS.has(p.node.name)) free.add(p.node.name);
  } });
  return [...free];
}

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push("modules:" + n + " " + d);
const ROOT = new URL("../web/src/", import.meta.url);
const files = readdirSync(ROOT, { recursive: true }).map(String).filter((p) => p.endsWith(".mjs")).map((p) => p.split("\\").join("/"));
const bad = [];
for (const f of files) { const free = freeNames(readFileSync(new URL(f, ROOT), "utf8"), f); if (free.length) bad.push(f + ": " + free.join(",")); }
check("every-name-resolves-in-its-module", bad.length === 0, bad.join(" | ") || files.length + " modules");
const idle = [];
for (const f of files) { const u = unusedImports(readFileSync(new URL(f, ROOT), "utf8"), f); if (u.length) idle.push(f + ": " + u.join(",")); }
check("every-import-is-read", idle.length === 0, idle.join(" | ") || files.length + " modules");
check("control:a-planted-unused-import-is-caught", unusedImports("import { a, b } from './x.mjs';\nconsole.log(a);\n", "planted.mjs").join() === "b", "b");
check("instrument:the-extracted-panels-are-scanned", ["ui/gram-panel.mjs", "ui/roster-panel.mjs", "main.mjs"].every((f) => files.includes(f)), files.length + " modules");
const planted = readFileSync(new URL("ui/roster-panel.mjs", ROOT), "utf8").replace("export function createRosterPanel", "function plantedLeak() { fitting = {}; }\nexport function createRosterPanel");
check("control:a-planted-outer-assignment-is-caught", freeNames(planted, "planted.mjs").includes("fitting"), "fitting");

for (const n of notes) console.log("  ok   " + n);
for (const f of fails) console.log("  FAIL " + f);
console.log(fails.length ? "modules FAIL " + fails.length : "modules PASS " + notes.length);
process.exitCode = fails.length ? 1 : 0;
