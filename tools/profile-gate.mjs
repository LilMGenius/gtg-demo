import { chromium } from "playwright";
import { gloveAt, bootAt, kitAt, sockAt, frameAt, cityAt, hairAt, inkAt } from "../web/src/state/gear.mjs";

// 내 정보의 자. 사람은 자기가 무엇을 걸쳤는지를 산 자리가 아니라 자기 창에서 확인한다.
// 상점 탈의실에만 그림이 서 있으면 장비는 사는 동안에만 존재하는 물건이 된다.
//
// 재는 것은 셋이다. 여덟 줄이 다 서는가, 각 줄이 저장이 든 그 등급의 이름을 말하는가,
// 그 차림이 그림으로도 서는가. 이름은 선반 데이터에서 꺼내 맞대므로 화면이 옮겨 적으면 갈린다.
// 대조군은 장비를 갈아입히는 것이다. 줄과 그림이 같이 바뀌지 않으면 위의 초록은 정지 화면을 잰 것이다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
// 화면이 부르는 이름과 저장이 든 등급을 잇는 표. 필드 이름은 상태가 소유하고 이 자는 읽기만 한다.
const AT = { grip: gloveAt, studs: bootAt, pads: kitAt, socks: sockAt, hair: hairAt, ink: inkAt, frame: frameAt, city: cityAt };
const FIELDS = Object.keys(AT);

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
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1300);

  const dress = async (set) => {
    await p.evaluate((s) => { const g = window.__gear(); for (const k of Object.keys(s)) g[k] = s[k]; }, set);
    await p.evaluate(() => { window.__me(false); window.__me(true); });
    await p.waitForTimeout(450);
    return p.evaluate(() => {
      const rows = [...document.querySelectorAll("#me .wear .on i")].map((e) => ({
        field: e.dataset.wear, head: e.querySelector("b") ? e.querySelector("b").textContent.trim() : "",
        text: e.textContent.trim()
      }));
      const img = document.querySelector("#me .wear .shot img");
      const gear = window.__gear();
      const held = {};
      for (const k of ["grip", "studs", "pads", "socks", "hair", "ink", "frame", "city"]) held[k] = gear[k];
      return { rows, src: img ? img.src : "", held };
    });
  };
  // 그림이 실제로 그려졌는지는 화소로 본다. src가 붙어 있다는 것은 그려졌다는 뜻이 아니다.
  const ink = async (src) => p.evaluate((s) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = im.width; cv.height = im.height;
      const g = cv.getContext("2d");
      g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, im.width, im.height).data;
      let on = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 24) on += 1;
      res(100 * on / (d.length / 4));
    };
    im.onerror = () => res(-1);
    im.src = s;
  }), src);

  const bare = { grip: 0, studs: 0, pads: 0, socks: 0, hair: 0, ink: 0, frame: 0, city: 0 };
  const rich = { grip: 3, studs: 2, pads: 3, socks: 1, hair: 2, ink: 3, frame: 3, city: 2 };
  const first = await dress(rich);

  check("instrument:every-worn-line-was-found", first.rows.length === FIELDS.length,
    first.rows.length + " rows want " + FIELDS.length);
  check("instrument:every-line-names-its-field", first.rows.every((r) => FIELDS.includes(r.field)),
    first.rows.map((r) => r.field).join(", "));
  const wrong = first.rows.filter((r) => !AT[r.field] || r.text.indexOf(AT[r.field](first.held[r.field]).name) < 0);
  check("profile:every-line-names-the-item-the-save-holds", wrong.length === 0,
    wrong.map((r) => r.field + " says " + r.text).join(" | ") || FIELDS.length + " lines match the shelves");
  const heads = first.rows.map((r) => r.head).filter((h) => h.length > 0);
  check("profile:every-line-says-which-slot-it-fills", heads.length === first.rows.length, heads.join(", "));
  const shot = await ink(first.src);
  check("profile:the-portrait-is-actually-drawn", shot > 8, shot.toFixed(1) + "% of the plate has ink");

  const then = await dress(bare);
  const stuck = then.rows.filter((r) => !AT[r.field] || r.text.indexOf(AT[r.field](then.held[r.field]).name) < 0);
  check("control:changing-the-gear-changes-the-lines", stuck.length === 0,
    stuck.map((r) => r.field + " says " + r.text).join(" | ") || "all eight followed the save");
  check("control:changing-the-gear-changes-the-portrait", then.src !== first.src && then.src.length > 64,
    then.src === first.src ? "same plate for both looks" : "two plates, " + then.src.length + " chars");

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "profile FAIL " + fails.length : "profile PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
