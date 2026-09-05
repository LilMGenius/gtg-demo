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

  /* 수염의 자리. 얼굴이 갈린다는 것과 그 얼굴이 사람으로 읽힌다는 것은 다른 명제다.
     덥수룩한 수염이 눈 옆까지 올라와 초상에서 두건으로 읽혔는데 위의 축은 여덟이 서로 다르다는
     것만 재서 초록이었다. 같은 사람을 수염 있는 채로와 민 채로 두 번 굽는다. 흰자 두 개 사이의
     눈높이 화소는 두 장이 같아야 하고, 입 아래 턱 화소는 두 장이 갈려야 한다. 살색을 절대값으로
     재면 어두운 피부가 수염으로 읽히므로, 자는 같은 피부의 두 장 사이 차이만 본다. */
  const withBeard = KEEPERS.find((k) => faceOf(k.name).beard === 2);
  const spots = await p.evaluate(async (name) => {
    const m = await import("/web/src/render/thumb.mjs");
    const r = await import("/src/roster.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const byName = {};
    for (const k of r.KEEPERS) byName[k.name] = k;
    const read = (url) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = im.width; cv.height = im.height;
        const c = cv.getContext("2d");
        c.drawImage(im, 0, 0);
        const d = c.getImageData(0, 0, cv.width, cv.height).data;
        // 흰자는 빛을 안 받는 재질이라 화소가 그 색 그대로다. 그 상자가 눈높이와 눈 사이를 준다.
        let n = 0, sx = 0, sy = 0, top = cv.height, bot = -1;
        for (let y = 0; y < cv.height; y += 1) for (let x = 0; x < cv.width; x += 1) {
          const i = (y * cv.width + x) * 4;
          if (d[i] < 236 || d[i + 1] < 236 || d[i + 2] < 226) continue;
          n += 1; sx += x; sy += y;
          if (y < top) top = y; if (y > bot) bot = y;
        }
        const eyeY = Math.round(sy / n), midX = Math.round(sx / n), eyeH = bot - top + 1;
        const lum = (x, y) => { const i = (y * cv.width + x) * 4; return Math.round(0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]); };
        /* 턱 밑은 반구광의 아래쪽이 닿아 민 얼굴도 어둡다. 실측으로 어두운 피부의 턱 밑이 42로
           수염과 같은 수였다. 수염이 닿는지는 옆 턱선에서 잰다. 흰자 높이 0.53r을 자로 써서
           눈에서 그만큼 내려가고 그만큼 옆으로 간 자리가 입 옆 볼이고, 열쇠광이 닿는 쪽이다. */
        const jaw = Math.round((lum(midX - Math.round(eyeH * 0.85), eyeY + Math.round(eyeH * 0.85))
          + lum(midX + Math.round(eyeH * 0.85), eyeY + Math.round(eyeH * 0.85))) / 2);
        res({ whites: n, between: lum(midX, eyeY), jaw });
      };
      im.src = url;
    });
    const look = g.lookOf({}, name);
    const bearded = await read(m.thumbURL("face", byName[name], look));
    const shaved = await read(m.thumbURL("face", byName[name], Object.assign({}, look, { face: Object.assign({}, look.face, { beard: 0 }) })));
    return { bearded, shaved };
  }, withBeard.name);
  const { bearded, shaved } = spots;
  check("instrument:both-portraits-show-two-eyes", bearded.whites > 40 && shaved.whites > 40,
    bearded.whites + " and " + shaved.whites + " white pixels on " + withBeard.name);
  // 같은 자리 같은 빛이라 수염이 안 닿으면 화소가 그대로다. 조명 잡음은 실측으로 0이다.
  check("beard:starts-below-the-eyes", Math.abs(bearded.between - shaved.between) <= 4,
    "between the eyes " + bearded.between + " bearded vs " + shaved.between + " shaved");
  /* 방향은 안 묻는다. 쿠폰은 금발 수염에 어두운 피부라 수염 쪽이 18 밝다. 수염이 닿았다는 것은
     화소가 피부와 갈렸다는 것이고, 어느 쪽으로 갈렸는지는 머리색이 정한다. 15는 조명 잡음 0 위에
     가장 가까운 머리색과 피부색 쌍이 남기는 차다. */
  check("beard:covers-the-jaw-beside-the-mouth", Math.abs(shaved.jaw - bearded.jaw) >= 15,
    "jaw " + bearded.jaw + " bearded vs " + shaved.jaw + " shaved");

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
