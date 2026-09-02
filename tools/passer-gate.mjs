import { chromium } from "playwright";
import { makeRng, buildSet } from "../src/chain.mjs";
import { passerAt, passerName, passerCountAt } from "../web/src/state/passer.mjs";

// 행인이 번호가 아니라 사람으로 서는지를 잰다. 이름표가 판정 쪽 인원과 어긋나면
// 라포 목록에 이름 없는 번호가 뜨고, 단계에 따라 호칭이 안 갈리면 얼굴을 트는 과정이 사라진다.

// 표본 범위: 키퍼 스탯을 안 쓴다. 행인 이름표는 도시와 번호와 라포 단계만 읽으므로 어떤 키퍼로 재도 같은 결과가 나온다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html";
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
t.unref();

// 도시마다 행인이 최대 열하나다. 세트당 다섯 구이고 행인이 뜨는 구는 일부라
// 전원을 관측하려면 수백 판이 필요하다. 400판이면 가장 드문 번호도 여러 번 나온다.
const SETS = 400;

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 판정이 실제로 내는 번호 집합. 이름표가 이 집합을 정확히 덮어야 한다.
for (let city = 0; city <= 3; city += 1) {
  const seen = new Set();
  for (let s = 0; s < SETS; s += 1) {
    const rng = makeRng(s + 1);
    for (const shot of buildSet(rng, 5, city)) if (shot.gaze) seen.add(shot.passer);
  }
  const want = passerCountAt(city);
  const max = Math.max(...seen);
  const missing = [];
  for (let i = 0; i < want; i += 1) if (!seen.has(i)) missing.push(i);
  check("city" + city + ":count-covers-chain", max === want - 1 && missing.length === 0,
    "seen 0.." + max + " want 0.." + (want - 1) + " missing [" + missing.join(",") + "]");
  const named = [];
  for (let i = 0; i < want; i += 1) named.push(passerAt(city, i));
  check("city" + city + ":every-index-named", named.every((x) => x && x.name && x.face), "named " + named.filter(Boolean).length + "/" + want);
  const names = new Set(named.filter(Boolean).map((x) => x.name));
  const faces = new Set(named.filter(Boolean).map((x) => x.face));
  check("city" + city + ":no-duplicate", names.size === want && faces.size === want, "names " + names.size + " faces " + faces.size + " of " + want);
  check("city" + city + ":over-range-null", passerAt(city, want) === null, "index " + want);
}

// 단계가 호칭을 가른다. 0단계는 차림새, 1단계부터 이름이다.
const a0 = passerName(0, 1, 0), a1 = passerName(0, 1, 1);
check("tier0-is-face", a0 === passerAt(0, 1).face, a0);
check("tier1-is-name", a1 === passerAt(0, 1).name, a1);
check("tier-splits", a0 !== a1, a0 + " vs " + a1);
check("unknown-falls-back", passerName(0, 99, 3) === "행인 99", passerName(0, 99, 3));

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: "load" });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: "load" });
  await p.waitForTimeout(1200);
  await p.click("#go", { force: true });
  await p.waitForTimeout(1400);
  // 한 번 말 섞은 사람과 세 번 섞은 사람을 같이 세운다. 한쪽만 두면 갈림을 못 본다.
  await p.evaluate(() => { const r = window.__rapport(); r["0:1"] = 1; r["0:2"] = 3; });
  await p.evaluate(() => window.__me(true));
  await p.waitForTimeout(500);
  const txt = await p.textContent("#me");
  const one = passerAt(0, 1), three = passerAt(0, 2);
  check("screen:tier0-shows-face", txt.includes(one.face) && !txt.includes(one.name), one.face);
  check("screen:tier1-shows-name", txt.includes(three.name) && !txt.includes(three.face), three.name);
  check("screen:no-bare-index", !/행인 d/.test(txt), "bare index absent");
  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");
  const LINE = String.fromCharCode(10);
  if (notes.length) console.log(notes.map((s) => "  ok   " + s).join(LINE));
  if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join(LINE));
  console.log(fails.length ? "passer FAIL " + fails.length : "passer PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
