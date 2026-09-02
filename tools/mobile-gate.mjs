import { chromium } from "playwright";

// 표본 범위: 키퍼 스탯을 안 쓴다. 화면 배치와 방향만 보므로 어떤 키퍼로 재도 같다.
//
// 모바일 가로로 하고 싶다는 요구가 있었는데 게이트 마흔여덟이 전부 1280x720 하나로 재고 있었다.
// hud.css에는 미디어 쿼리가 없다. 지금 서 있는 것은 레이아웃이 비율에 유연해서지 모바일을 겨냥해서가 아니고,
// 그래서 HUD를 건드리는 랩이 데스크톱만 보고 커밋하면 모바일이 조용히 깨진다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html";
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
t.unref();

// 손가락이 닿는 최소 크기. 애플과 구글이 각각 44와 48을 말하므로 둘 중 낮은 쪽을 바닥으로 둔다.
const TOUCH = 44;
// 작은 폰 가로와 큰 폰 가로. 둘 다 서야 기종 폭에 안 묶인다.
const SIZES = [[667, 375, "se"], [844, 390, "modern"]];

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const overlap = (a, b) => a && b && a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

let br;
try {
  br = await chromium.launch({ executablePath: EXE });
  const errs = [];

  const open = async (w, h) => {
    const ctx = await br.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errs.push(String(e)));
    p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    await p.goto(BASE, { waitUntil: "load" });
    await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: "load" });
    await p.waitForTimeout(1100);
    return { ctx, p };
  };

  // 세로. 골대는 좌우로 길어서 세로 화면에서는 좌우가 잘린다. 그래서 판을 열지 않고 돌리라고 말한다.
  const port = await open(390, 844);
  const rot = await port.p.evaluate(() => {
    const e = document.getElementById("rotate");
    const s = getComputedStyle(e);
    return { display: s.display, z: Number(s.zIndex) || 0, text: e.textContent.trim().length };
  });
  check("portrait:asks-for-landscape", rot.display !== "none", "display " + rot.display);
  check("portrait:notice-sits-above-play", rot.z >= 50, "z-index " + rot.z);
  check("portrait:notice-says-why", rot.text > 10, rot.text + " chars");
  await port.ctx.close();

  for (const [w, h, tag] of SIZES) {
    const { ctx, p } = await open(w, h);
    const hidden = await p.evaluate(() => getComputedStyle(document.getElementById("rotate")).display === "none");
    check(tag + ":landscape-plays", hidden, "rotate hidden " + hidden);
    if (!hidden) { await ctx.close(); continue; }

    await p.click("#go", { force: true });
    await p.waitForTimeout(1300);

    const box = await p.evaluate(() => {
      const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
      return {
        top: r("#top"), auto: r("#auto"), out: r("#out"), mute: r("#mute"),
        zones: [...document.querySelectorAll(".zone")].map((e) => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; }),
        w: innerWidth, h: innerHeight
      };
    });

    // 조작 세 칸이 손가락보다 작으면 화면이 아니라 바늘이다.
    const small = box.zones.filter((z) => z[2] < TOUCH || z[3] < TOUCH);
    check(tag + ":zones-take-a-finger", box.zones.length === 3 && small.length === 0,
      box.zones.map((z) => z[2] + "x" + z[3]).join(" "));

    // 버튼이 화면 밖으로 나가면 그 기능은 없는 것과 같다.
    const outside = ["top", "auto", "out", "mute"].filter((k) => {
      const b = box[k];
      return !b || b[0] < 0 || b[1] < 0 || b[0] + b[2] > box.w + 1 || b[1] + b[3] > box.h + 1;
    });
    check(tag + ":controls-stay-on-screen", outside.length === 0, outside.join(",") || "all inside " + box.w + "x" + box.h);

    // 좁은 화면에서 가장 먼저 부딪히는 것은 좌상단 정보와 우측 버튼 줄이다.
    check(tag + ":hud-does-not-collide", !overlap(box.top, box.auto) && !overlap(box.top, box.out) && !overlap(box.mute, box.auto),
      "top " + JSON.stringify(box.top) + " auto " + JSON.stringify(box.auto));

    // 요구는 골대가 좌우로 길어서 가로여야 한다는 것이었다. 그 입구가 프레임 안에 있어야 그 요구가 지켜진다.
    // goalFraming은 네 꼭짓점을 NDC로 투영해 그 범위를 낸다. 한 변이 1이면 화면 끝이다.
    const frame = await p.evaluate(() => window.__goalFrame());
    if (!frame || typeof frame.minX !== "number") throw new Error("goalFrame shape changed: " + JSON.stringify(frame));
    const fits = frame.minX >= -1 && frame.maxX <= 1 && frame.minY >= -1 && frame.maxY <= 1;
    check(tag + ":goal-mouth-fits", fits,
      "x " + frame.minX.toFixed(2) + ".." + frame.maxX.toFixed(2) + " y " + frame.minY.toFixed(2) + ".." + frame.maxY.toFixed(2));
    // 좁은 화면에서 골대가 너무 작아지면 좌우로 길다는 이유 자체가 사라진다.
    check(tag + ":goal-mouth-is-wide-enough", frame.widthFrac >= 0.5, frame.widthFrac.toFixed(3) + " of the screen");

    await ctx.close();
  }

  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");
  const LINE = String.fromCharCode(10);
  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "mobile FAIL " + fails.length : "mobile PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (br) await br.close();
}
