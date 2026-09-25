import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/(\w):/, "$1:");
const CSS_FILES = ["web/src/ui/hud.css", "web/src/ui/title.css"];
const CSS_PATHS = CSS_FILES.map((file) => ROOT + file);
const PAGE_URL = "http://127.0.0.1:10310/web/index.html?seed=20&preset=veteran";
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
// 180초는 다섯 패널을 순서대로 여는 실브라우저 검사에 필요한 상한이다.
const WATCHDOG_MS = 180000;
// 브라우저 글자 크기는 렌더링 반올림을 고려해 토큰에서 0.5px까지만 허용한다.
const TOLERANCE_PX = 0.5;
// 페이지는 기존 UI 게이트와 같은 데스크톱 기준에서 측정한다.
const VIEWPORT = { width: 1280, height: 720 };
// 정적 서버의 시작 화면과 패널 렌더링을 기다리는 상한이다.
const PAGE_TIMEOUT_MS = 15000;
// 시작 버튼 뒤 상태 배선이 패널 훅을 받을 때까지 기다리는 시간이다.
const STARTUP_WAIT_MS = 1200;
const ALLOWED = new Set(["var(--fs-title)", "var(--fs-body)", "var(--fs-num)"]);
const LINE = String.fromCharCode(10);

const watchdog = setTimeout(() => {
  console.log("WATCHDOG");
  process.exit(1);
}, WATCHDOG_MS);
watchdog.unref();

const fails = [];
const notes = [];
const check = (name, ok, detail) => (ok ? notes : fails).push((ok ? "  ok   " : "  FAIL ") + name + " " + detail);

// CSS 선언은 주석을 제외하고 읽는다. 축약형도 크기 토큰을 직접 써야 하며
// 별칭의 선언을 함께 보고 숨은 원시 크기를 진단한다. 상속은 새 크기를 만들지 않는다.
function cssScaleViolations(input) {
  const css = input.replace(/\/\*[\s\S]*?\*\//g, "");
  const aliases = new Map();
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) {
    const values = aliases.get(match[1]) || [];
    values.push(match[2].trim());
    aliases.set(match[1], values);
  }
  const bad = [];
  for (const match of css.matchAll(/(?:^|[;{])\s*(font-size|font)\s*:\s*([^;}]+)/g)) {
    const [, property, raw] = match;
    const value = raw.trim();
    if (property === "font-size" ? ALLOWED.has(value) : value === "inherit") continue;
    if (property === "font") {
      // 굵기와 기울기는 크기 앞에 올 수 있다. 크기 뒤에는 선택 줄높이와 글꼴이 따른다.
      const size = value.match(/^(?:(?:normal|italic|oblique|small-caps|bold|bolder|lighter|[1-9]00)\s+)*(var\(--fs-(?:title|body|num)\))(?=\s|\/)/);
      if (size) continue;
    }
    const trace = [...value.matchAll(/var\((--[\w-]+)\)/g)]
      .filter(m => aliases.has(m[1])).map(m => m[1] + "=" + aliases.get(m[1]).join("|"));
    bad.push(property + ":" + value + (trace.length ? " [" + trace.join(", ") + "]" : ""));
  }
  return bad;
}

function inspectCss() {
  for (const [index, path] of CSS_PATHS.entries()) {
    const css = readFileSync(path, "utf8");
    const declarations = [...css.matchAll(/font(?:-size)?\s*:/g)];
    const bad = cssScaleViolations(css);
    check("css:font-size-declarations-use-scale-tokens:" + CSS_FILES[index], bad.length === 0,
      bad.length ? bad.join(", ") : declarations.length + " declarations");
  }
  // 17px는 토큰을 우회하는 임의의 원시 크기이며 각각 독립적으로 빨개져야 한다.
  for (const [name, planted] of [
    ["raw-size", ".control{font-size:17px}"],
    ["raw-shorthand", ".control{font:700 17px var(--body)}"],
    ["alias-shorthand", ".control{--hidden:17px;font:var(--hidden) var(--body)}"],
    ["alias-size", ".control{--hidden:17px;font-size:var(--hidden)}"]
  ]) {
    const observed = cssScaleViolations(planted);
    check("control:" + name, observed.length > 0, observed.join(", "));
  }
  check("control:valid-tokens", cssScaleViolations(".control{font:700 var(--fs-body) var(--body);font-size:var(--fs-title)}").length === 0, "직접 토큰 허용");
}

const surfaces = [
  { name: "gym", title: "#gym h4", body: "#gym .row button", num: "#gym .row button em" },
  { name: "roster", title: "#roster h4", body: "#roster .row button", num: "#roster .row button em" },
  { name: "gram", title: "#gram h4", body: "#gram .post", num: "#gram h4 small" },
  { name: "me", title: "#me h4", body: "#me .grid span .who", num: "#me .grid span > b" },
  { name: "shop", title: "#shop h4", body: "#shop .card em", num: "#shop .buy" }
];

async function readSurface(page, surface) {
  await page.evaluate((name) => {
    if (name === "gym" && typeof window.__gym === "function") window.__gym(true);
    else if (name === "roster") window.__roster(true);
    else if (name === "gram") window.__gram(true);
    else if (name === "me") {
      document.getElementById("meBtn").click();
      if (document.getElementById("me").hidden) window.__me(true);
    } else if (name === "shop") window.__shop(true);
  }, surface.name);
  // 바쁜 sweep 중 차가운 페이지도 표면을 마운트할 수 있게 선택자 대기에 15초를 둔다.
  await page.waitForSelector(surface.title, { state: "visible", timeout: 15000 });
  return page.evaluate((s) => {
    const root = getComputedStyle(document.documentElement);
    const readToken = (name) => {
      const probe = document.createElement("span");
      probe.style.cssText = "position:fixed;visibility:hidden;font-size:var(" + name + ")";
      document.body.append(probe);
      const value = Number.parseFloat(getComputedStyle(probe).fontSize);
      probe.remove();
      return { raw: root.getPropertyValue(name).trim(), px: value };
    };
    const tokens = {
      title: readToken("--fs-title"),
      body: readToken("--fs-body"),
      num: readToken("--fs-num")
    };
    const read = (selector) => {
      const node = document.querySelector(selector);
      return node ? Number.parseFloat(getComputedStyle(node).fontSize) : null;
    };
    return { tokens, values: { title: read(s.title), body: read(s.body), num: read(s.num) } };
  }, surface);
}

inspectCss();
let browser;
try {
  browser = await chromium.launch({ executablePath: EXE });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(PAGE_URL, { waitUntil: "load" });
  await page.waitForSelector("#go", { timeout: PAGE_TIMEOUT_MS });
  await page.click("#go", { force: true });
  await page.waitForTimeout(STARTUP_WAIT_MS);

  let tokenSet;
  let sampleCount = 0;
  for (const surface of surfaces) {
    const result = await readSurface(page, surface);
    tokenSet = result.tokens;
    const values = Object.entries(result.values);
    sampleCount += values.length;
    for (const [kind, value] of values) {
      const token = result.tokens[kind];
      const ok = Number.isFinite(value) && Number.isFinite(token.px)
        && Math.abs(value - token.px) <= TOLERANCE_PX;
      check("render:" + surface.name + ":" + kind, ok,
        "computed=" + value + "px token=" + token.raw + " (" + token.px + "px)");
    }
  }
  // 오류가 많아도 실패 진단 출력은 앞의 두 건으로 제한해 원인을 읽을 수 있게 한다.
  check("render:console-clean", errors.length === 0, errors.slice(0, 2).join(" | ") || "clean");
  console.log("표본 범위: " + surfaces.length + " 표면 × 제목/본문/수치 셋 = " + sampleCount + " 표본");
  console.log("토큰 실측: " + JSON.stringify(tokenSet));
  await context.close();
} catch (error) {
  check("render:live-page", false, String(error));
} finally {
  clearTimeout(watchdog);
  if (browser) await browser.close();
}

if (notes.length) console.log(notes.join(LINE));
if (fails.length) console.log(fails.join(LINE));
console.log(fails.length ? "scale FAIL " + fails.length : "scale PASS " + notes.length);
if (fails.length) process.exitCode = 1;
