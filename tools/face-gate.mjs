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
     것만 재서 초록이었다. 그것을 고친 뒤에도 파운더가 헤어 선반 썸네일과 선수단 얼굴에서
     양볼에 어두운 조각이 붙어 있다고 짚었다. 그 조각은 수염 껍데기의 턱선 고리다.
     자는 반사실이다. 같은 얼굴을 제 수염으로 한 번, 민 채로 한 번 굽고 두 장의 화소를 뺀다.
     수염이 없는 얼굴은 2등급을 심어서 견준다. 절대값으로 어두운 화소를 세는 갈래는 버렸다.
     수염이 머리색을 쓰므로 머리카락과 색이 같고, 툰 재질이라 열쇠광 반대쪽 볼이 통째로
     한 단 어두운 띠가 되어 그 안에서 살색과 수염색이 안 갈린다.
     자리는 계기가 준다. headBox가 머리 상자와 눈과 입을 화면 몫으로 돌려주므로,
     볼은 눈높이에서 입 윗선까지의 띠 안에서 상자 좌우 바깥 사분의 일이고,
     턱 띠는 입 아랫선 아래로 반지름의 절반이다. 입이 렌즈에 가장 가까워서 같은 높이의
     옆 얼굴보다 아래에 맺히므로, 볼 띠의 아래를 입 가운데가 아니라 윗선으로 끊는다.
     얼굴 하나가 아니라 등급마다 여덟씩, 헤어 선반은 민 얼굴과 덥수룩한 얼굴로 네 칸씩 잰다. */
  // 볼에 허용되는 화소. 수염이 볼에 한 점이라도 서면 그 자리는 살색이 아니다.
  const CHEEK = 0;
  // 턱 띠에 수염이 섰다는 하한. 띠가 4000화소쯤이라 120은 그 3퍼센트다.
  const CHIN = 120;
  const withBeard = KEEPERS.find((k) => faceOf(k.name).beard === 2);
  const shaven = KEEPERS.find((k) => faceOf(k.name).beard === 0);
  const grade = (b, n) => all.filter((k) => faceOf(k.name).beard === b).slice(0, n).map((k) => k.name);
  const sample = [withBeard.name, shaven.name].concat(grade(0, 8), grade(1, 8), grade(2, 8))
    .filter((n, i, a) => a.indexOf(n) === i);
  const reads = await p.evaluate(async (arg) => {
    const m = await import("/web/src/render/thumb.mjs");
    const r = await import("/src/roster.mjs");
    const g = await import("/web/src/state/gear.mjs");
    // 몸은 하나로 고정한다. 키가 바뀌면 머리 반지름이 바뀌어 자의 눈금이 얼굴마다 달라진다.
    const body = r.KEEPERS[0];
    const read = (url) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = im.width; cv.height = im.height;
        const c = cv.getContext("2d");
        c.drawImage(im, 0, 0);
        res({ w: cv.width, h: cv.height, d: c.getImageData(0, 0, cv.width, cv.height).data });
      };
      im.src = url;
    });
    const lum = (d, i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    const wear = (name, beard, rank) => {
      const lk = g.lookOf(rank === undefined ? {} : { hair: rank }, name);
      return beard === undefined ? lk
        : Object.assign({}, lk, { face: Object.assign({}, lk.face, { beard }) });
    };
    const one = async (kind, name, rank) => {
      const own = r.faceOf(name).beard;
      // 민 얼굴이 기준 틀이다. 수염이 실루엣을 바꾸므로 눈과 입 자리는 수염 없는 쪽에서 읽는다.
      const hb = m.headBox(kind, body, wear(name, 0, rank));
      const off = await read(hb.url);
      const on = await read(m.thumbURL(kind, body, wear(name, own ? undefined : 2, rank)));
      const w = off.w;
      const h = off.h;
      const R = hb.ry * h;
      const two = hb.eyes.length === 2 && Boolean(hb.mouth);
      const eyeY = two ? (hb.eyes[0].y + hb.eyes[1].y) / 2 * h : 0;
      const eyeX = two ? (hb.eyes[0].x + hb.eyes[1].x) / 2 * w : 0;
      /* 얼굴 상자의 가로는 머리 상자가 아니라 눈이 준다. 카메라가 정면에서 틀어져 있어서
         얼굴 앞면이 머리 중심에서 옆으로 밀려 맺힌다. 실측으로 초상은 19화소, 헤어 칸은
         52화소 밀렸고, 머리 상자의 바깥 사분의 일을 그대로 쓰면 그 칸이 볼이 아니라
         얼굴 한가운데에 얹힌다. 눈동자는 얼굴 반지름의 0.36 자리라 둘 사이가 곧 그 얼굴의 자다. */
      const fw = two ? Math.abs(hb.eyes[0].x - hb.eyes[1].x) * w / 0.72 : 0;
      const mx = two ? hb.mouth.x * w : 0;
      const lip = two ? hb.mouth.top * h : 0;
      const jaw = two ? hb.mouth.bot * h : 0;
      const count = (a, b, x0, x1, y0, y1) => {
        let n = 0;
        for (let y = Math.max(0, Math.round(y0)); y <= Math.min(h - 1, Math.round(y1)); y += 1) {
          for (let x = Math.max(0, Math.round(x0)); x <= Math.min(w - 1, Math.round(x1)); x += 1) {
            const i = (y * w + x) * 4;
            if (Math.abs(a[i + 3] - b[i + 3]) > 8 || Math.abs(lum(a, i) - lum(b, i)) > 6) n += 1;
          }
        }
        return n;
      };
      const cheeks = (a, b) => count(a, b, eyeX - 1.15 * fw, eyeX - 0.5 * fw, eyeY, lip)
        + count(a, b, eyeX + 0.5 * fw, eyeX + 1.15 * fw, eyeY, lip);
      /* 대조군. 민 얼굴의 볼에 넓은 수염 상자를 심고 같은 자로 읽는다.
         심은 것이 0으로 읽히면 이 자는 볼을 못 보는 것이고, 위의 0들은 전부 공짜로 얻은 초록이다. */
      const plant = new Uint8ClampedArray(off.d);
      for (let y = Math.round(eyeY + (lip - eyeY) * 0.3); y <= Math.round(eyeY + (lip - eyeY) * 0.7); y += 1) {
        for (let x = Math.round(eyeX + 0.55 * fw); x <= Math.round(eyeX + 0.85 * fw); x += 1) {
          const i = (y * w + x) * 4;
          plant[i] = 28; plant[i + 1] = 23; plant[i + 2] = 20; plant[i + 3] = 255;
        }
      }
      const at = (d, x, y) => Math.round(lum(d, (Math.round(y) * w + Math.round(x)) * 4));
      const pair = (d) => Math.round((at(d, mx - 0.22 * R, jaw + 0.18 * R) + at(d, mx + 0.22 * R, jaw + 0.18 * R)) / 2);
      return { name, kind, rank: rank === undefined ? -1 : rank, beard: own, two: two ? 1 : 0,
        worn: wear(name, undefined, rank).face.beard,
        cheek: two ? cheeks(off.d, on.d) : -1,
        chin: two ? count(off.d, on.d, mx - 0.5 * R, mx + 0.5 * R, jaw, jaw + 0.5 * R) : -1,
        plant: two ? cheeks(off.d, plant) : -1,
        between: [at(on.d, eyeX, eyeY), at(off.d, eyeX, eyeY)],
        jaw: [pair(on.d), pair(off.d)] };
    };
    const out = [];
    for (const n of arg.sample) out.push(await one("face", n));
    for (const n of arg.shelf) for (const k of [0, 1, 2, 3]) out.push(await one("hair", n, k));
    return out;
  }, { sample, shelf: [shaven.name, withBeard.name] });

  const front = reads.filter((f) => f.kind === "face");
  const cards = reads.filter((f) => f.kind === "hair");
  const bare = front.filter((f) => f.beard === 0);
  const bushy = front.filter((f) => f.beard > 0);
  const worst = (list, k) => list.reduce((s, f) => Math.max(s, f[k]), -1);
  const lean = (list, k) => list.reduce((s, f) => Math.min(s, f[k]), 1e9);
  check("instrument:both-portraits-show-two-eyes", reads.every((f) => f.two === 1),
    reads.filter((f) => f.two === 1).length + " of " + reads.length + " bakes give two eyes and a mouth");
  // 같은 자리 같은 빛이라 수염이 안 닿으면 화소가 그대로다. 조명 잡음은 실측으로 0이다.
  const brow = bushy.reduce((s, f) => Math.max(s, Math.abs(f.between[0] - f.between[1])), 0);
  check("beard:starts-below-the-eyes", brow <= 4,
    "between the eyes moves " + brow + " at most over " + bushy.length + " bearded faces");
  /* 방향은 안 묻는다. 쿠폰은 금발 수염에 어두운 피부라 수염 쪽이 밝다. 수염이 닿았다는 것은
     화소가 피부와 갈렸다는 것이고, 어느 쪽으로 갈렸는지는 머리색이 정한다. 15는 조명 잡음 0 위에
     가장 가까운 머리색과 피부색 쌍이 남기는 차다. 재는 자리는 입 옆에서 입 아래로 내렸다.
     입 옆 볼은 이제 살색이어야 하는 자리라, 거기서 수염을 찾는 축은 결함을 지키는 축이 된다. */
  const cut = front.find((f) => f.name === withBeard.name);
  const bite = Math.abs(cut.jaw[0] - cut.jaw[1]);
  check("beard:covers-the-chin-under-the-mouth", bite >= 15,
    "chin " + cut.jaw[0] + " bearded vs " + cut.jaw[1] + " shaved on " + withBeard.name);
  check("face:a-clean-shaven-face-has-nothing-on-the-cheeks",
    bare.length >= 6 && worst(bare, "cheek") <= CHEEK && lean(bare, "chin") >= CHIN,
    bare.length + " shaven faces, worst cheek " + worst(bare, "cheek") + " px, planted chin " + lean(bare, "chin") + " px");
  check("face:a-beard-sits-on-the-chin-not-the-cheeks",
    bushy.length >= 6 && worst(bushy, "cheek") <= CHEEK && lean(bushy, "chin") >= CHIN,
    bushy.length + " bearded faces, worst cheek " + worst(bushy, "cheek") + " px, thinnest chin " + lean(bushy, "chin") + " px");
  check("face:the-hair-shelf-shows-the-wearers-own-beard",
    cards.length === 8 && cards.every((f) => f.worn === f.beard)
      && worst(cards, "cheek") <= CHEEK && lean(cards, "chin") >= CHIN,
    cards.length + " cards, own beard " + cards.every((f) => f.worn === f.beard)
      + ", worst cheek " + worst(cards, "cheek") + " px, thinnest chin " + lean(cards, "chin") + " px");
  check("control:a-planted-cheek-patch-reds", lean(reads, "plant") > CHEEK,
    "a planted cheek box reads " + lean(reads, "plant") + " px on the thinnest of " + reads.length + " bakes");

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
