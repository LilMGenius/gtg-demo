import { chromium } from "playwright";
import { KEEPERS, KICKERS, faceOf } from "../src/roster.mjs";

// 얼굴의 자. 선수 마흔여섯과 키커 쉰여덟이 전부 같은 머리와 같은 피부로 서 있었다.
// 이름이 다른 사람 백 명이 한 얼굴이면 로스터는 이름표 목록이지 사람 목록이 아니고,
// 그 목록에서 누구를 뽑든 화면에서 달라지는 것이 이름 글자뿐이다.
//
// 축은 둘로 갈린다. 데이터에서 얼굴이 실제로 갈리는가, 그리고 그 얼굴이 화면에 서는가.
// 앞은 노드에서, 뒤는 구운 화소에서 잰다. 데이터만 재면 갈린 값이 렌더에 안 닿아도 초록이다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=veteran";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

const sig = (f) => [f.skin, f.hair, f.beard, f.tail,
  f.cut.wide.toFixed(2), f.cut.tall.toFixed(2), f.cut.phi.toFixed(2), f.cut.tilt.toFixed(2)].join("/");
const all = KEEPERS.concat(KICKERS);
const faces = all.map((k) => faceOf(k.name));

// 같은 이름이 같은 얼굴을 주는가. 이것이 없으면 아래의 다름이 매번 다시 굴린 잡음일 수 있다.
check("control:the-same-name-gives-the-same-face",
  all.every((k) => sig(faceOf(k.name)) === sig(faceOf(k.name))),
  all.length + " names re-rolled");
const uniq = new Set(faces.map(sig)).size;
// 백네 명이 서로 다른 얼굴일 필요는 없다. 한 화면에 다섯이 서면 그 다섯이 갈리면 된다.
check("face:the-roster-does-not-share-one-face", uniq >= all.length * 0.9,
  uniq + " distinct of " + all.length);
const skins = new Set(faces.map((f) => f.skin)).size;
const hairs = new Set(faces.map((f) => f.hair)).size;
const beards = new Set(faces.map((f) => f.beard)).size;
check("face:every-axis-of-the-face-actually-varies", skins > 1 && hairs > 2 && beards > 1,
  skins + " skins, " + hairs + " hairs, " + beards + " beard steps");
// 이름을 비틀어 만든 선수는 원본이 떠오르는 한 가지가 못 박혀 있어야 한다.
const fixed = faceOf("올리브영");
check("face:a-named-parody-keeps-its-fixed-look", fixed.hair === 0xc7a75a && fixed.beard === 0,
  "hair " + fixed.hair.toString(16) + ", beard " + fixed.beard);

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1200);

  // 초상을 페이지 안에서 직접 굽는다. 상점을 안 열어도 같은 그림이다.
  const bake = (names) => p.evaluate(async (list) => {
    const m = await import("/web/src/render/thumb.mjs");
    const r = await import("/src/roster.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const byName = {};
    for (const k of r.KEEPERS) byName[k.name] = k;
    return list.map((n) => m.thumbURL("face", byName[n], g.lookOf({}, n)));
  }, names);

  const names = KEEPERS.slice(0, 8).map((k) => k.name);
  const urls = await bake(names);
  check("instrument:every-portrait-baked", urls.every((u) => u && u.length > 2000),
    urls.map((u) => (u || "").length).join("/"));
  const shots = new Set(urls).size;
  check("face:eight-players-bake-eight-different-portraits", shots === names.length,
    shots + " distinct of " + names.length);
  const again = await bake([names[0]]);
  check("control:the-same-player-bakes-the-same-portrait", again[0] === urls[0],
    again[0] === urls[0] ? "identical" : "drifted");

  /* 화면. 좌상단 칩과 선수단과 아웃문그램이 같은 얼굴을 쓴다.
     구웠다는 것과 그 칸에 서 있다는 것은 다른 명제라 셋을 각각 연다. */
  const chip = await p.evaluate(() => {
    const img = document.querySelector("#meBtn img");
    return { has: Boolean(img), nat: img ? img.naturalWidth : 0, svg: document.querySelectorAll("#meBtn svg").length };
  });
  check("face:the-status-chip-shows-the-keeper-not-a-generic-icon",
    chip.has && chip.nat > 0 && chip.svg === 0,
    "img " + chip.has + ", natural " + chip.nat + ", leftover icons " + chip.svg);

  await p.evaluate(() => window.__roster(true));
  await p.waitForSelector("#roster .row button", { timeout: 8000 });
  await p.waitForTimeout(500);
  const rows = await p.evaluate(() => {
    const im = [...document.querySelectorAll("#roster .row button img")];
    return { n: im.length, drawn: im.filter((e) => e.naturalWidth > 0).length,
      distinct: new Set(im.map((e) => e.src)).size };
  });
  check("face:every-squad-row-carries-that-player-s-face",
    rows.n > 0 && rows.drawn === rows.n && rows.distinct === rows.n,
    rows.n + " rows, " + rows.drawn + " drawn, " + rows.distinct + " distinct");
  await p.evaluate(() => window.__roster(false));

  await p.evaluate(() => window.__gram(true));
  await p.waitForSelector("#gram h4", { timeout: 8000 });
  await p.waitForTimeout(400);
  const pfp = await p.evaluate(() => {
    const img = document.querySelector("#gram h4 .pfp");
    return { has: Boolean(img), nat: img ? img.naturalWidth : 0 };
  });
  check("face:the-social-account-has-a-profile-picture", pfp.has && pfp.nat > 0,
    "img " + pfp.has + ", natural " + pfp.nat);
  await p.evaluate(() => window.__gram(false));

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();
} finally {
  clearTimeout(t);
  if (b) await b.close();
}

if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
console.log(fails.length ? "face FAIL " + fails.length : "face PASS " + notes.length);
if (fails.length) process.exitCode = 1;
