import { chromium } from "playwright";
import { BUFFS } from "../web/src/state/buff.mjs";

// 걸린 것의 자. 지금 무엇이 걸려 있는지가 화면에 없으면, 같은 실력으로 굴린 판이
// 어떤 날은 잘 막히고 어떤 날은 안 막히는 이유가 플레이어에게 운으로 읽힌다.
//
// 재는 것은 셋이다. 걸린 것이 있을 때만 서는가, 그 배지가 걸린 그것을 말하는가,
// 종류마다 다른 그림을 쓰는가. 마지막이 없으면 병 하나가 셋을 대신하고 배지는 개수만 세게 된다.
// 종류는 한 번에 하나만 살 수 있으므로 판을 새로 열어 하나씩 산다.
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran";
const LINE = String.fromCharCode(10);
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 150000);
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

  const open = async () => {
    await p.goto(BASE, { waitUntil: "load" });
    await p.evaluate(() => localStorage.clear());
    await p.goto(BASE, { waitUntil: "load" });
    await p.waitForSelector("#go", { timeout: 15000 });
    await p.click("#go", { force: true });
    await p.waitForTimeout(1300);
  };
  const read = () => p.evaluate(() => {
    const box = document.getElementById("aura");
    const tags = [...box.querySelectorAll(".tag")].map((e) => ({
      kind: e.dataset.kind,
      title: e.querySelector("title") ? e.querySelector("title").textContent : "",
      glyph: e.querySelector("svg") ? e.querySelector("svg").innerHTML : "",
      count: e.querySelector("b") ? Number(e.querySelector("b").textContent) : -1,
      text: e.textContent.trim()
    }));
    const chip = document.querySelector("#purse .cur u");
    const chipGlyph = chip && chip.parentElement.querySelector("svg") ? chip.parentElement.querySelector("svg").innerHTML : "";
    const arrow = document.querySelector("#form .up") ? "up" : document.querySelector("#form .dn") ? "dn" : "";
    // 박자 띠는 구가 굴러야 뜬다. 접힌 상자를 재면 0,0,0,0이 나오고 그 거리는 아무것도 안 말한다.
    // 자리만 재는 것이므로 잠깐 펴서 재고 도로 접는다.
    const lane = document.getElementById("beat");
    const was = lane.hidden;
    lane.hidden = false;
    const beat = lane.getBoundingClientRect();
    lane.hidden = was;
    const r = box.getBoundingClientRect();
    const lift = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--lift")) || 0;
    return { hidden: box.hidden, tags, chipGlyph, arrow, shots: window.__buff().shots, kind: window.__buff().kind,
      gap: beat.top - r.bottom, lift, onScreen: r.top >= 0 && r.bottom <= innerHeight };
  });

  await open();
  const bare = await read();
  // 대조군. 아무것도 안 걸렸으면 배지가 없다. 늘 서 있는 배지는 상태를 말하는 것이 아니라 장식이다.
  check("control:nothing-is-worn-so-no-buff-badge-stands",
    bare.tags.length === 0,
    bare.tags.map((x) => x.kind).join(", ") || "no badge");

  const seen = {};
  for (const spec of BUFFS) {
    await open();
    await p.evaluate(() => window.__shop(true));
    await p.waitForTimeout(280);
    await p.click('#shop .tab[data-tab="buff"]', { force: true });
    await p.waitForTimeout(220);
    await p.click('#shop .buy[data-buff="' + spec.kind + '"]', { force: true });
    await p.waitForTimeout(260);
    await p.evaluate(() => window.__shop(false));
    await p.waitForTimeout(320);
    seen[spec.kind] = await read();
  }

  const kinds = BUFFS.map((s) => s.kind);
  const tagOf = (k) => (seen[k].tags.find((x) => x.kind === k) || { title: "", glyph: "", count: -1, text: "" });
  check("aura:the-badge-stands-for-the-buff-that-is-live",
    kinds.every((k) => seen[k].tags.some((x) => x.kind === k)),
    kinds.map((k) => k + " -> " + seen[k].tags.map((x) => x.kind).join("/")).join(", "));
  check("aura:the-badge-says-the-name-of-that-buff",
    BUFFS.every((s) => tagOf(s.kind).text.indexOf(s.name) >= 0 && tagOf(s.kind).title === s.name),
    BUFFS.map((s) => s.kind + " " + tagOf(s.kind).title).join(", "));
  const glyphs = new Set(kinds.map((k) => tagOf(k).glyph));
  check("aura:every-kind-draws-its-own-glyph", glyphs.size === kinds.length && ![...glyphs].some((g) => g.length === 0),
    glyphs.size + " glyphs over " + kinds.length + " kinds");
  check("aura:the-count-follows-the-save",
    kinds.every((k) => tagOf(k).count === seen[k].shots && seen[k].shots > 0),
    kinds.map((k) => k + " " + tagOf(k).count + " vs " + seen[k].shots).join(", "));
  // 같은 것을 두 자리에서 그리면 그림도 같아야 한다. 다르면 상단 칩과 배지가 다른 물건으로 읽힌다.
  check("aura:the-chip-and-the-badge-draw-the-same-glyph",
    kinds.every((k) => seen[k].chipGlyph === tagOf(k).glyph),
    kinds.map((k) => k + " " + (seen[k].chipGlyph === tagOf(k).glyph)).join(", "));
  /* 컨디션은 이 배지가 말하지 않는다. 상단 칩이 소유자이고, 이 자가 둘의 일치를 요구하던 동안
     한 사실이 화면 두 자리에서 말해지는 상태가 축으로 굳어 있었다. 소유는 dupe 게이트가 잰다.
     여기서는 배지에 컨디션이 섞여 들어오지 않는 것만 본다. */
  check("aura:the-badge-carries-no-condition",
    kinds.every((k) => seen[k].tags.every((x) => String(x.kind).indexOf("form") !== 0)),
    kinds.map((k) => k + " chip " + (seen[k].arrow || "flat")).join(", "));
  check("aura:the-badges-clear-the-beat-lane",
    kinds.every((k) => seen[k].gap >= seen[k].lift && seen[k].onScreen),
    kinds.map((k) => k + " " + seen[k].gap.toFixed(1) + "px").join(", ") + " over " + bare.lift + "px");

  check("console:no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
  await ctx.close();

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "aura FAIL " + fails.length : "aura PASS " + notes.length);
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
