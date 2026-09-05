import { chromium } from "playwright";
import { HAIRS, TATTOOS, GLOVES, BOOTS, KITS, SOCKS } from "../web/src/state/gear.mjs";

// 머리와 타투는 판정에 한 칸도 안 닿는다. 오직 화면으로만 존재하는 상품이라,
// 사고 나서 그림이 안 바뀌면 그 선반은 아무것도 팔지 않은 것이 된다.
// 지금까지 선반 게이트는 줄이 서는지만 봤고 산 뒤의 그림은 아무도 안 봤다.
// 세계를 얼려 놓고 스킨만 갈아 끼우면 두 장의 차이는 그 상품 하나뿐이다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran";
const LINE = String.fromCharCode(10);
const STEP = 1 / 60;
// 판이 자리를 잡고 키퍼가 화면에 설 때까지. 그 뒤로는 세계를 멈춘다.
const LEAD = 120;
// 한 화소라도 다르면 다르다고 할 수는 없다. 1280x720의 0.03퍼센트인 300화소를 바닥으로 둔다.
// 머리 모양 하나가 이 화면에서 차지하는 넓이가 그보다 넓다.
const SEEN = 300;
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 240000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

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
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.evaluate((s) => window.__fixedStep(s), STEP);
  await p.click("#go", { force: true });
  const from = await p.evaluate(() => window.__frames());
  await p.waitForFunction((n) => window.__frames() >= n, from + LEAD, { timeout: 20000 });
  // 세계를 멈춘다. 이 뒤의 두 장이 다르면 그 차이는 시간이 아니라 스킨이다.
  await p.evaluate(() => window.__plan(0, null, window.__frames()));
  await p.waitForTimeout(200);

  const shot = async () => (await p.screenshot({ type: "png" })).toString("base64");
  const diff = async (x, y) => p.evaluate(async (pair) => {
    const load = async (s) => {
      const im = new Image();
      im.src = "data:image/png;base64," + s;
      await im.decode();
      const cv = document.createElement("canvas");
      cv.width = im.width;
      cv.height = im.height;
      cv.getContext("2d").drawImage(im, 0, 0);
      return cv.getContext("2d").getImageData(0, 0, im.width, im.height).data;
    };
    const a = await load(pair[0]);
    const c = await load(pair[1]);
    let n = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.max(Math.abs(a[i] - c[i]), Math.abs(a[i + 1] - c[i + 1]), Math.abs(a[i + 2] - c[i + 2]));
      if (d > 12) n += 1;
    }
    return n;
  }, [x, y]);

  // 스킨을 산다. 선반은 상점 탭 하나이고 줄마다 등급이 붙어 있다.
  const buy = async (tab, rank) => {
    // 여섯 선반을 끝까지 사면 rich 프리셋의 8000 땅으로는 모자란다.
    // 이 계기가 재는 것은 그림이지 감당할 수 있는가가 아니다. 살 때마다 지갑을 채운다.
    await p.evaluate(() => { window.__wallet().coin = 999999; });
    await p.evaluate(() => window.__shop(true));
    await p.waitForTimeout(160);
    await p.evaluate((k) => document.querySelector(".tab[data-tab=" + JSON.stringify(k) + "]").click(), tab);
    await p.waitForTimeout(160);
    const ok = await p.evaluate((r) => {
      const el = document.querySelector(".buy[data-rank=" + JSON.stringify(String(r)) + "]");
      if (!el || el.disabled) return false;
      el.click();
      return true;
    }, rank);
    await p.evaluate(() => window.__shop(false));
    await p.waitForTimeout(220);
    return ok;
  };

  const base = await shot();
  // 대조군. 아무것도 안 바꾸고 두 장을 찍는다. 여기서 벌어지면 아래 수는 전부 시간이다.
  const still = await diff(base, await shot());
  check("control:the-same-skin-twice-is-the-same-picture", still === 0, still + " pixels moved with nothing changed");

  const shots = { hair: {}, ink: {}, glove: {}, boot: {}, kit: {}, sock: {} };
  for (const [tab, list] of [["hair", HAIRS], ["ink", TATTOOS], ["glove", GLOVES], ["boot", BOOTS], ["kit", KITS], ["sock", SOCKS]]) {
    // 기준 컷은 탭마다 다시 잡는다. 처음 한 장을 계속 쓰면 앞 탭에서 산 것까지 차이에 섞인다.
    const tabBase = await shot();
    for (let r = 1; r < list.length; r += 1) {
      const bought = await buy(tab, r);
      if (!bought) { check("shop:" + tab + "-" + r + "-is-buyable", false, "button missing or disabled"); continue; }
      shots[tab][r] = await shot();
      const moved = await diff(tabBase, shots[tab][r]);
      console.log("  " + tab + " " + r + " moved " + moved);
      check("skin:" + tab + "-" + r + "-changes-the-picture", moved >= SEEN, moved + " pixels vs floor " + SEEN);
    }
  }

  // 등급끼리도 갈려야 한다. 전부 사고 나서 그림이 같으면 위 칸은 값만 다른 같은 상품이다.
  for (const tab of ["hair", "ink", "glove", "boot", "kit", "sock"]) {
    const ranks = Object.keys(shots[tab]);
    for (let i = 0; i < ranks.length; i += 1) {
      for (let j = i + 1; j < ranks.length; j += 1) {
        const d = await diff(shots[tab][ranks[i]], shots[tab][ranks[j]]);
        check("skin:" + tab + "-" + ranks[i] + "-and-" + ranks[j] + "-are-not-the-same", d >= SEEN, d + " pixels");
      }
    }
  }

  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "skin FAIL " + fails.length : "skin PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
