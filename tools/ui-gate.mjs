import { chromium } from "playwright";

// UI 게이트. 화면을 픽셀로 재는 칸이다. 기능 게이트는 프레임을 안 센다.
// 대조군 둘이 붙어 있다. 세로 회전 안내와 조작법 패널 초기 접힘.
// 둘이 기대대로 나오지 않으면 이 게이트가 무엇을 보고 있는지 모르는 것이다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const URL = "http://127.0.0.1:10310/web/index.html?seed=" + (process.argv[2] || 7) + "&preset=veteran";
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 80000);
t.unref();

const fails = [];
const notes = [];
function check(name, ok, detail) {
  (ok ? notes : fails).push(name + " " + detail);
}

// 버튼 두 장을 페이지 안 캔버스로 풀어 아이콘을 끈 프레임과의 휘도차를 센다.
// 화소차 6 미만은 안티에일리어싱 잔파동과 구분되지 않으므로 세지 않는다.
function inkDiff([a, b]) {
  const load = (s) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const cv = document.createElement("canvas");
      cv.width = im.width; cv.height = im.height;
      const g = cv.getContext("2d");
      g.drawImage(im, 0, 0);
      res(g.getImageData(0, 0, im.width, im.height));
    };
    im.src = "data:image/png;base64," + s;
  });
  return Promise.all([load(a), load(b)]).then(([A, Bb]) => {
    const n = Math.min(A.data.length, Bb.data.length) >> 2;
    const L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    let hit = 0;
    for (let i = 0; i < n; i += 1) {
      if (Math.abs(L(A.data, i * 4) - L(Bb.data, i * 4)) >= 6) hit += 1;
    }
    return hit / n;
  });
}

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  await p.goto(URL, { waitUntil: "load" });
  await p.waitForTimeout(1200);

  // 대조군 1. 조작법 패널은 처음에 접혀 있어야 한다.
  const panelClosed = await p.evaluate(() => document.getElementById("helpPanel").hidden);
  check("control:helpPanel-initially-folded", panelClosed === true, String(panelClosed));

  // 대조군 2. 가로에서는 회전 안내가 안 보이고 세로에서는 보여야 한다.
  const rotLand = await p.evaluate(() => getComputedStyle(document.getElementById("rotate")).display);
  await p.setViewportSize({ width: 720, height: 1280 });
  await p.waitForTimeout(400);
  const rotPort = await p.evaluate(() => getComputedStyle(document.getElementById("rotate")).display);
  await p.setViewportSize({ width: 1280, height: 720 });
  await p.waitForTimeout(400);
  check("control:rotate-notice-only-in-portrait", rotLand === "none" && rotPort !== "none", rotLand + "/" + rotPort);

  await p.click("#go", { force: true });
  await p.waitForTimeout(1400);

  // 지속 크롬. HUD 요소가 덮는 화면 비율.
  const chrome = await p.evaluate(() => {
    const W = innerWidth, H = innerHeight;
    let area = 0;
    for (const id of ["top", "out", "auto", "caption"]) {
      const el = document.getElementById(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      area += Math.max(0, r.width) * Math.max(0, r.height);
    }
    return area / (W * H);
  });
  check("chrome:persistent-under-25pct", chrome <= 0.25, (chrome * 100).toFixed(1) + "%");

  // 화면 중앙. 판정이 일어나는 자리를 UI가 덮으면 안 된다.
  const center = await p.evaluate(() => {
    const W = innerWidth, H = innerHeight;
    const box = { x0: W * 0.3, x1: W * 0.7, y0: H * 0.3, y1: H * 0.7 };
    let area = 0;
    for (const id of ["top", "out", "auto", "caption"]) {
      const el = document.getElementById(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, box.x1) - Math.max(r.left, box.x0));
      const h = Math.max(0, Math.min(r.bottom, box.y1) - Math.max(r.top, box.y0));
      area += w * h;
    }
    return area / ((box.x1 - box.x0) * (box.y1 - box.y0));
  });
  check("chrome:center-band-under-2pct", center <= 0.02, (center * 100).toFixed(2) + "%");

  // 겹침. 좁은 가로에서 HUD 요소끼리 부딪히면 안 된다.
  await p.setViewportSize({ width: 740, height: 360 });
  await p.waitForTimeout(500);
  const overlaps = await p.evaluate(() => {
    const ids = ["top", "out", "auto", "caption"];
    const rs = ids.map((id) => [id, document.getElementById(id).getBoundingClientRect()]);
    const hit = [];
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const [ai, a] = rs[i], [bj, c] = rs[j];
      if (a.width === 0 || c.width === 0) continue;
      const w = Math.min(a.right, c.right) - Math.max(a.left, c.left);
      const h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
      if (w > 2 && h > 2) hit.push(ai + "x" + bj);
    }
    return hit;
  });
  check("layout:no-overlap-at-740x360", overlaps.length === 0, overlaps.join(",") || "none");
  await p.setViewportSize({ width: 1280, height: 720 });
  await p.waitForTimeout(400);

  // 훈련장. 축의 출처는 파운더 요구 변경이다. 레벨업 즉시 선택을 버리고 포인트를 적립해
  // 훈련장에서 쓰기로 했으니, 재는 것은 카드 세 장이 한 줄인지가 아니라 실제 버튼으로 열었을 때
  // 성장 가능한 열다섯 칸과 닫기가 전부 화면 안에 겹침 없이 놓이는지다.
  await p.click("#gymBtn");
  await p.waitForTimeout(300);
  const gym = await p.evaluate(() => {
    const fits = (r) => r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth;
    const bs = [...document.querySelectorAll("#gym .row button")];
    const rs = bs.map((b) => b.getBoundingClientRect());
    const hit = [];
    for (let i = 0; i < rs.length; i += 1) {
      for (let j = i + 1; j < rs.length; j += 1) {
        const w = Math.min(rs[i].right, rs[j].right) - Math.max(rs[i].left, rs[j].left);
        const h = Math.min(rs[i].bottom, rs[j].bottom) - Math.max(rs[i].top, rs[j].top);
        // 2px는 손그림 테두리 반올림 여유다. 그 아래는 겹침이 아니라 렌더 오차다.
        if (w > 2 && h > 2) hit.push(i + "x" + j);
      }
    }
    const close = document.querySelector("#gym .close");
    return { n: bs.length, inside: rs.every(fits), hit: hit.length,
      closeIn: Boolean(close) && fits(close.getBoundingClientRect()) };
  });
  check("gym:fifteen-stats-and-close-inside-viewport-without-overlap",
    gym.n === 15 && gym.inside && gym.hit === 0 && gym.closeIn,
    JSON.stringify(gym));
  // 아이콘 축은 훈련장 뒤 화면을 찍는다. 덮개를 걷지 않으면 그 축이 훈련장을 잰다.
  await p.click("#gym .close");
  await p.waitForTimeout(250);

  // 아이콘 축. 출처는 파운더 요구다. 나가기 글자가 게임 종료로 읽혀 아이콘으로 바꿨고,
  // 아이콘은 DOM에 있는 것으로는 부족하고 화면에 찍혀 있어야 요구가 충족된다.
  const ink = async (id) => {
    const el = p.locator("#" + id);
    const on = (await el.screenshot()).toString("base64");
    await p.evaluate((q) => { document.querySelector(q).style.visibility = "hidden"; }, "#" + id + " svg");
    const off = (await el.screenshot()).toString("base64");
    await p.evaluate((q) => { document.querySelector(q).style.visibility = ""; }, "#" + id + " svg");
    return p.evaluate(inkDiff, [on, off]);
  };
  // 8%. 66px 판때기에 3px 격자로 그린 두툼한 픽셀 아이콘은 15~25%대가 나온다.
  // 8%는 그 아래 절반이라, 아이콘이 한 조각만 남아도 잡히는 자리다.
  for (const id of ["out", "auto"]) {
    const cover = await ink(id);
    check("icon:" + id + "-drawn-over-8pct", cover >= 0.08, (cover * 100).toFixed(1) + "%");
  }

  // 글자가 남아 있으면 아이콘과 겹쳐 읽힌다. 이름은 aria-label이 맡는다.
  // 재는 것은 화면에 그려지는 글자다. textContent는 display:none인 자식까지 세므로,
  // 버튼이 품은 접힌 배지(#autoDot)가 켜져 있지도 않은데 글자로 잡혔다.
  const seen = await p.evaluate(() => {
    const vis = (node) => {
      let t = "";
      for (const c of node.childNodes) {
        if (c.nodeType === 3) { t += c.nodeValue; continue; }
        if (c.nodeType !== 1) continue;
        if (getComputedStyle(c).display === "none") continue;
        t += vis(c);
      }
      return t;
    };
    return ["out", "auto"].map((id) => {
      const el = document.getElementById(id);
      return { id, text: vis(el).trim(), label: el.getAttribute("aria-label") || "" };
    });
  });
  const labels = seen.map((v) => v.id + ":" + JSON.stringify(v.text) + "/" + JSON.stringify(v.label));
  const labelOk = seen.every((v) => v.text === "" && v.label.length > 0);
  check("icon:no-text-face-but-aria-label", labelOk, labels.join(" "));

  check("console:no-errors", errs.length === 0, errs.slice(0, 3).join(" | ") || "clean");

  console.log(notes.map((s) => "  ok   " + s).join("\n"));
  if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
  console.log(fails.length ? "ui FAIL " + fails.length : "ui PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
