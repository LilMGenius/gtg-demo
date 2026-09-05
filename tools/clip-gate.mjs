import { chromium } from "playwright";

// 창의 내용이 손에 닿는지 재는 자. 창 여섯을 전부 순회한다.
//
// 재는 것은 셋이다. 긁을 수 없는 글자가 뷰포트 밖에 있지 않은가,
// 긁어야 나오는 상자 자체가 화면 밖으로 잘리지 않았는가,
// 그리고 그 상자가 스크롤바 모양을 선언하는가.
//
// 마지막 축은 선언까지만 잰다. 헤드리스 크로미움은 겹쳐 그리는 스크롤바를 쓰므로
// 자리를 차지하는 폭이 늘 0이고, 그 수로 문턱을 세우면 사람 화면과 다른 것을 지키게 된다.
// 화소로 확인하는 일은 이 하네스 밖에 있으므로 여기서는 미측정으로 둔다.
//
// 갈래를 나누는 것이 이 자의 전부다. 스크롤 상자 안에서 접힘 아래에 있는 것은 결함이 아니고,
// 스크롤 상자 밖에서 화면을 벗어난 것은 손이 닿지 않으므로 결함이다.
// 그 둘을 안 가르면 정상적인 목록이 전부 빨간불이 된다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,famous,veteran";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 180000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const WINS = ["shop", "gym", "roster", "gram", "me", "earn"];

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto(BASE, { waitUntil: "load" });
  await p.waitForSelector("#go", { timeout: 15000 });
  await p.click("#go", { force: true });
  await p.waitForTimeout(1400);

  const loose = [], cutBox = [], noBar = [], counted = [];
  for (const w of WINS) {
    await p.evaluate((x) => window["__" + x](true), w);
    await p.waitForTimeout(600);
    const r = await p.evaluate((id) => {
      const box = document.getElementById(id);
      const scroller = (e) => {
        for (let n = e.parentElement; n && n !== box.parentElement; n = n.parentElement) {
          if (n.scrollHeight > n.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(n).overflowY)) return n;
        }
        return null;
      };
      const out = (q) => q.bottom > innerHeight + 1 || q.top < -1 || q.right > innerWidth + 1 || q.left < -1;
      const leaves = [...box.querySelectorAll("*")].filter((e) => e.children.length === 0 && (e.textContent || "").trim());
      const free = leaves.filter((e) => !scroller(e));
      const away = free.filter((e) => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 && out(q); });
      const sc = [...box.querySelectorAll("*")].filter((e) => e.scrollHeight > e.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(e).overflowY));
      return {
        free: free.length,
        away: away.slice(0, 3).map((e) => (e.textContent || "").trim().slice(0, 12) + " at " + Math.round(e.getBoundingClientRect().bottom)),
        awayCount: away.length,
        cut: sc.filter((e) => out(e.getBoundingClientRect())).map((e) => String(e.className || e.tagName)),
        // 기본 스크롤바는 손을 올리기 전에는 안 보인다. 긁을 수 있다는 사실이 화면에 없으면
        // 접힘 아래에 있는 것은 없는 것과 같고, 실제로 능력치 여섯이 그렇게 여러 랩을 숨어 있었다.
        bars: sc.map((e) => {
          const s = getComputedStyle(e);
          return { who: String(e.className || e.tagName), width: s.scrollbarWidth, colour: s.scrollbarColor,
            gap: e.offsetWidth - e.clientWidth, styled: s.scrollbarWidth === "thin" && s.scrollbarColor !== "auto" };
        })
      };
    }, w);
    counted.push(w + " " + r.free);
    if (r.awayCount) loose.push(w + ": " + r.away.join(", "));
    for (const c of r.cut) cutBox.push(w + "/" + c);
    for (const bar of r.bars) if (!bar.styled) noBar.push(w + "/" + bar.who + " " + bar.width + "/" + bar.colour);
    await p.evaluate((x) => window["__" + x](false), w);
    await p.waitForTimeout(220);
  }

  check("instrument:every-window-was-read", counted.length === WINS.length, counted.join(", "));
  check("clip:nothing-outside-a-scroller-leaves-the-screen", loose.length === 0, loose.join(" | ") || WINS.length + " windows clean");
  check("clip:no-scrolling-box-is-cut-by-the-screen", cutBox.length === 0, cutBox.join(", ") || "none cut");
  check("clip:a-scrolling-box-declares-its-bar", noBar.length === 0,
    noBar.join(", ") || "thin bar declared on every scroller (drawn width unmeasured in headless)");

  // 대조군. 화면 밖으로 글자를 하나 심으면 첫 축이 그것을 잡아야 한다.
  await p.evaluate(() => window.__me(true));
  await p.waitForTimeout(400);
  const caught = await p.evaluate(() => {
    const e = document.createElement("span");
    e.textContent = "control";
    e.style.cssText = "position:absolute;left:20px;top:" + (innerHeight + 40) + "px";
    document.getElementById("me").appendChild(e);
    const q = e.getBoundingClientRect();
    const seen = q.bottom > innerHeight + 1;
    e.remove();
    return seen;
  });
  check("control:a-planted-offscreen-line-is-caught", caught, String(caught));
  await p.evaluate(() => window.__me(false));

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "clip FAIL " + fails.length : "clip PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}

