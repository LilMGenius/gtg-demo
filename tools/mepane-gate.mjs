import { chromium } from "playwright";

// 내 정보 칸의 자. 한 창이 성격이 다른 넷을 한 두루마리에 쌓으면, 무엇을 보러 들어왔든
// 나머지 셋을 지나가야 답이 나온다. 칸을 갈랐다는 주장은 갈린 뒤에도 셋이 다 보이면 거짓이다.
//
// 재는 것은 셋이다. 칸이 셋이고 한 번에 하나만 서는가, 각 칸이 자기 것만 그리는가,
// 초상화와 걸친 것은 어느 칸에서도 남는가. 마지막은 칸의 내용이 아니라 누구를 보고 있는지다.
// 대조군으로 칸을 옮겨 다니며 같은 것을 다시 잰다. 한 칸만 재면 나머지 둘은 아무도 안 본다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
// famous는 라포 줄을, seed 20은 전적 줄을 만든다. 빈 칸만 재면 갈렸는지를 알 수 없다.
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=famous,rich,veteran";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const TABS = ["stat", "face", "log"];

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
  await p.waitForTimeout(1300);
  // 전적 한 줄과 아는 얼굴 한 줄을 만든다. 빈 칸만 재면 갈렸는지를 알 수 없다.
  // 라포는 판을 여러 번 돌려야 쌓이므로 저장에 직접 심는다. 심는 값은 판정이 읽는 그 자리다.
  await p.evaluate(() => window.__act && window.__act("save"));
  await p.evaluate(() => { window.__rapport()["0:0"] = 4; });
  await p.evaluate(() => window.__me(true));
  await p.waitForTimeout(500);

  const read = () => p.evaluate(() => {
    const box = document.getElementById("me");
    const tabs = [...box.querySelectorAll(".tab")].map((e) => e.dataset.tab);
    return {
      tabs,
      current: [...box.querySelectorAll('.tab[aria-current="true"]')].map((e) => e.dataset.tab),
      stats: box.querySelectorAll(".grid span").length,
      logs: box.querySelectorAll(".log span").length,
      // 라포 줄은 사람에게 붙은 버튼을 들고 있다. 그 버튼이 곧 그 칸의 표식이다.
      faces: box.querySelectorAll(".note .go").length,
      wear: box.querySelectorAll(".wear .on i").length,
      shot: box.querySelector(".wear .shot img") ? 1 : 0,
      // 긁지 않고 보이는 능력치. 창을 연 이유가 능력치인데 절반이 접힘 아래면 그 창은 답을 반만 한다.
      inView: (() => {
        const pane = box.querySelector(".pane");
        if (!pane) return 0;
        const r = pane.getBoundingClientRect();
        return [...box.querySelectorAll(".grid span")].filter((e) => {
          const q = e.getBoundingClientRect();
          return q.top >= r.top - 1 && q.bottom <= r.bottom + 1;
        }).length;
      })(),
      chars: box.textContent.trim().length
    };
  });

  const seen = {};
  for (const id of TABS) {
    await p.click('#me .tab[data-tab="' + id + '"]', { force: true });
    await p.waitForTimeout(220);
    seen[id] = await read();
  }

  check("instrument:the-three-panes-were-found", TABS.every((id) => seen[id].tabs.join(",") === TABS.join(",")),
    seen.stat.tabs.join(", ") || "no tabs");
  check("mepane:one-pane-stands-at-a-time", TABS.every((id) => seen[id].current.length === 1 && seen[id].current[0] === id),
    TABS.map((id) => id + " -> " + seen[id].current.join("/")).join(", "));
  check("mepane:the-stat-pane-holds-the-growth-slots", seen.stat.stats > 0 && seen.face.stats === 0 && seen.log.stats === 0,
    "stat " + seen.stat.stats + ", face " + seen.face.stats + ", log " + seen.log.stats);
  check("mepane:the-record-pane-holds-the-record", seen.log.logs > 0 && seen.stat.logs === 0 && seen.face.logs === 0,
    "stat " + seen.stat.logs + ", face " + seen.face.logs + ", log " + seen.log.logs);
  check("mepane:the-people-pane-holds-the-people", seen.face.faces > 0 && seen.stat.faces === 0 && seen.log.faces === 0,
    "stat " + seen.stat.faces + ", face " + seen.face.faces + ", log " + seen.log.faces);
  check("mepane:the-wardrobe-stays-in-every-pane", TABS.every((id) => seen[id].wear === 8 && seen[id].shot === 1),
    TABS.map((id) => id + " " + seen[id].wear + " lines, shot " + seen[id].shot).join(", "));
  // 720p에서 능력치가 하나도 접힘 아래로 안 내려가야 한다. 실측으로 열다섯 중 아홉만 보이던 자리다.
  // 이 축은 능력치가 늘어나는 날에도 운다. 칸이 늘면 격자나 창 높이가 같이 움직여야 한다는 뜻이다.
  check("mepane:every-stat-is-visible-without-scrolling", seen.stat.inView === seen.stat.stats,
    seen.stat.inView + " of " + seen.stat.stats + " in view");
  // 갈랐다면 한 칸의 글자 수가 셋을 합친 것보다 적다. 같으면 탭만 그리고 내용은 그대로 쌓인 것이다.
  const widest = Math.max(seen.stat.chars, seen.face.chars, seen.log.chars);
  const total = seen.stat.chars + seen.face.chars + seen.log.chars;
  check("mepane:no-pane-carries-the-whole-scroll", widest < total * 0.8,
    widest + " chars against " + total + " over three panes");

  // 대조군. 닫고 다시 열면 능력치 칸으로 돌아온다. 안 돌아오면 다음에 연 사람이 탭을 눌러야 한다.
  await p.evaluate(() => { window.__me(false); window.__me(true); });
  await p.waitForTimeout(350);
  const again = await read();
  check("control:reopening-lands-on-the-stat-pane", again.current.join("") === "stat", again.current.join("/") || "none");

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "mepane FAIL " + fails.length : "mepane PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
