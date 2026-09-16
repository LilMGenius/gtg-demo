import { chromium } from "playwright";
import { VERSION } from '../web/src/build.mjs';

// 타이틀은 이 게임을 처음 여는 화면인데 계기가 하나도 없었다. 만렙 화면을 훑는 자도
// 시작 버튼을 누른 뒤부터 보므로 이 화면은 한 번도 안 훑렸다.
// 여기서 무너지면 뒤의 모든 것이 안 보인다. 접히는 조작법과 시작 한 번이 이 화면의 전부다.

const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20";
const LINE = String.fromCharCode(10);
// 가로 두 폭. 넓은 쪽은 심사 화면이고 좁은 쪽은 손에 든 폰이다.
const SIZES = [[1280, 720], [844, 390]];
const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 120000);
t.unref();

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 잎 노드만 본다. 자식을 품은 상자는 자식이 넘치면 같이 넘친 것으로 잡혀 원인을 못 가린다.
const SCAN = function () {
  const out = [];
  for (const el of document.querySelectorAll("#title *")) {
    if (el.childElementCount > 0) continue;
    const txt = (el.textContent || "").trim();
    if (!txt) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const st = getComputedStyle(el);
    if (st.overflowX === "auto" || st.overflowX === "scroll") continue;
    if (el.scrollWidth - el.clientWidth > 1) out.push(el.tagName.toLowerCase() + "#" + el.id + " [" + txt.slice(0, 18) + "]");
  }
  return out;
};

// 줄이 단어 한가운데에서 끊기는지 본다. 상자를 넘지 않으므로 잘림 축은 이것을 통과시킨다.
// 글자를 하나씩 재서 윗변이 바뀌는 자리가 줄이 넘어간 자리이고,
// 그 앞 글자가 띄어쓰기가 아니면 단어를 자른 것이다.
const WRAP = function () {
  const bad = [];
  const walk = document.createTreeWalker(document.getElementById("title"), NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walk.nextNode())) {
    const s = n.nodeValue;
    if (!s || !s.trim()) continue;
    const r = document.createRange();
    let prevTop = null;
    for (let i = 0; i < s.length; i += 1) {
      r.setStart(n, i);
      r.setEnd(n, i + 1);
      const box = r.getBoundingClientRect();
      if (!box.width && !box.height) continue;
      if (prevTop !== null && box.top - prevTop > 1 && s[i - 1] !== " ") {
        bad.push(s.slice(Math.max(0, i - 7), i) + "|" + s.slice(i, i + 4));
      }
      prevTop = box.top;
    }
  }
  return bad;
};

// 두 화면의 차이를 픽셀로 센다. png를 푸는 일은 브라우저에게 맡긴다.
// 채널 하나라도 8을 넘게 벌어지면 그 자리에 다른 것이 칠해진 것이다.
async function inkDiff([A, B, thr]) {
  const read = async (b64) => {
    const im = new Image();
    im.src = "data:image/png;base64," + b64;
    await im.decode();
    const cv = document.createElement("canvas");
    cv.width = im.width; cv.height = im.height;
    cv.getContext("2d").drawImage(im, 0, 0);
    return cv.getContext("2d").getImageData(0, 0, im.width, im.height);
  };
  const a = await read(A);
  const b = await read(B);
  let hits = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    if (d > thr) hits += 1;
  }
  return { hits, px: a.width * a.height };
}

// 픽셀 축이 쓰는 눈금. 8은 채널 하나가 눈에 띄게 벌어진 정도다.
// 바닥 1퍼센트는 고치기 전과 고친 뒤 사이에서 잡았다. 줄간격 .85와 vw 그림자일 때 첫 줄은
// 둘째 줄 줄상자를 1280에서 4.98퍼센트, 844에서 9.45퍼센트 칠했고, 1.12와 em 그림자로
// 바꾼 뒤에는 양쪽 다 0.00퍼센트다. 1퍼센트는 1280에서 20픽셀, 844에서 12픽셀이라
// 글자 가장자리 한 줄은 통과시키고 유령의 획 하나는 못 통과한다.
// 0.3은 둘째 줄이 제 상자를 이만큼은 칠해야 상자를 제대로 물었다고 보는 하한이다. 실측은 0.90 언저리였다.
const INK_THR = 8;
const INK_FLOOR = 0.01;
const OWN_MIN = 0.3;

let b;
try {
  b = await chromium.launch({ executablePath: EXE });

  // 타이틀 기존 잉크 표본은 그대로 두고 좌표의 두 필수 폭을 따로 잰다.
  for (const [width, height] of [[740, 360], [1280, 720]]) {
    // 배율을 고정해 CSS 상자와 화면 화소가 같은 좌표를 쓰게 한다.
    const context = await b.newContext({ viewport: { width, height } });
    // 실제 첫 화면에서 시작 버튼을 누르기 전에 좌표를 읽는다.
    const page = await context.newPage();
    await page.goto(BASE);
    await page.waitForSelector('#go');
    await page.evaluate(() => document.fonts.ready);
    // 토큰의 계산값을 직접 재서 고정 px로 흉내 낸 글자를 통과시키지 않는다.
    const label = await page.evaluate(() => {
      // 없는 라벨은 측정할 상자가 없으므로 바로 실패 표본이다.
      const element = document.getElementById('build');
      if (!element) return { ok: false, reason: 'no #build' };
      // 타이틀과 이웃의 실제 상자가 회전된 마크까지 포함한다.
      const box = element.getBoundingClientRect(), title = document.getElementById('title').getBoundingClientRect();
      // 모든 기존 글자 토큰의 계산값 중 최솟값을 기준으로 쓴다.
      const probe = document.createElement('span');
      document.getElementById('title').append(probe);
      // 토큰 목록은 스타일시트에서 읽어 새 토큰이 생겨도 빠뜨리지 않는다.
      const tokens = [...new Set([...document.styleSheets].flatMap(sheet => [...sheet.cssRules].flatMap(rule => rule.style ? [...rule.style].filter(name => name.startsWith('--fs-')) : [])))];
      // 단위 환산은 브라우저가 수행한다.
      const sizes = tokens.map(token => { probe.style.fontSize = 'var(' + token + ')'; return parseFloat(getComputedStyle(probe).fontSize); });
      probe.remove();
      // 글자 크기뿐 아니라 보임과 비조작성도 좌표의 계약이다.
      const style = getComputedStyle(element);
      // 겹침은 두 축 모두 만나는 경우만 센다.
      const overlaps = ['mark', 'go'].some(id => { const r = document.getElementById(id).getBoundingClientRect(); return box.left < r.right && box.right > r.left && box.top < r.bottom && box.bottom > r.top; });
      return { text: element.textContent, size: style.fontSize, smallest: Math.min(...sizes), tokens,
        ok: tokens.length > 0 && box.width > 0 && box.height > 0 && style.visibility === 'visible' && Number(style.opacity) > 0
          && parseFloat(style.fontSize) === Math.min(...sizes) && style.pointerEvents === 'none'
          && box.left >= title.left && box.right <= title.right && box.top >= title.top && box.bottom <= title.bottom && !overlaps,
        box: box.toJSON(), title: title.toJSON(), overlaps };
    });
    check('title:the-corner-carries-the-release-label', label.ok && label.text === 'v' + VERSION, width + 'x' + height + ' ' + JSON.stringify(label));
    await context.close();
  }

  for (const [w, h] of SIZES) {
    const tag = w + "x" + h;
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(String(e)));
    p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    await p.goto(BASE, { waitUntil: "load" });
    await p.waitForSelector("#go", { timeout: 15000 });

    const up = await p.evaluate(() => !document.getElementById("title").hidden);
    check("title:" + tag + ":is-up-before-start", up, String(up));
    // 이름과 한 줄이 화면에 있어야 이 게임이 무엇인지가 첫 화면에서 읽힌다.
    const words = await p.evaluate(() => ({
      word: (document.getElementById("word").textContent || "").trim(),
      tag: (document.getElementById("tag").textContent || "").trim(),
      go: (document.getElementById("go").textContent || "").trim()
    }));
    check("title:" + tag + ":says-its-name-and-a-line", words.word.length >= 4 && words.tag.length >= 8 && words.go.length >= 1, words.word + " / " + words.tag.slice(0, 14) + " / " + words.go);
    const clipped = await p.evaluate(SCAN);
    check("title:" + tag + ":no-text-is-clipped", clipped.length === 0, clipped.join(", ") || "nothing overruns its box");

    /* 워드마크는 두 줄이다. 첫 줄의 잉크와 그림자가 둘째 줄 줄상자에 들어오면
       골키퍼의 그림자가 유령 사본으로 읽히고 그 위에 키우기가 얹힌다.
       둘째 줄만 숨긴 화면과 둘 다 숨긴 화면의 차이가 그 자리에 들어온 첫 줄의 양이다.
       재는 동안만 장면 캔버스를 세우고 타이틀에 단색을 깐다. 움직이는 배경 위에서는
       같은 화면을 두 번 찍어도 8064픽셀 중 2460이 달라져 잉크와 배경을 못 가르고,
       검정 그림자는 어두운 배경과 채널차가 7이라 회색을 깔지 않으면 아예 안 잡힌다. */
    await p.evaluate(() => {
      document.getElementById("stage").style.visibility = "hidden";
      document.getElementById("title").style.background = "#7f7f7f";
    });
    await p.waitForTimeout(150);
    // R은 둘째 줄의 줄상자다. 스팬의 상자는 블록이라 마크의 폭을 다 차지해서,
    // 1280에서 252px 중 글자가 쓰는 자리는 65px뿐이고 겹침이 네 배로 묽어진다.
    const R = await p.evaluate(() => {
      const rng = document.createRange();
      rng.selectNodeContents(document.querySelectorAll("#word span")[1]);
      const r = rng.getBoundingClientRect();
      const x = Math.max(0, Math.floor(r.x));
      const y = Math.max(0, Math.floor(r.y));
      return { x, y, width: Math.ceil(r.x + r.width) - x, height: Math.ceil(r.y + r.height) - y };
    });
    const clipAt = async (one, two) => {
      await p.evaluate((v) => {
        const s = document.querySelectorAll("#word span");
        s[0].style.visibility = v[0] ? "visible" : "hidden";
        s[1].style.visibility = v[1] ? "visible" : "hidden";
      }, [one, two]);
      return (await p.screenshot({ clip: R })).toString("base64");
    };
    const shotBoth = await clipAt(true, true);
    const shotFirst = await clipAt(true, false);
    const shotNone = await clipAt(false, false);
    const shotNone2 = await clipAt(false, false);
    await p.evaluate(() => {
      for (const s of document.querySelectorAll("#word span")) s.style.visibility = "";
      document.getElementById("stage").style.visibility = "";
      document.getElementById("title").style.background = "";
    });
    const still = await p.evaluate(inkDiff, [shotNone, shotNone2, INK_THR]);
    const wear = await p.evaluate(inkDiff, [shotFirst, shotNone, INK_THR]);
    const own = await p.evaluate(inkDiff, [shotBoth, shotFirst, INK_THR]);
    const area = R.width * R.height;
    const share = wear.hits / area;
    // 빈 자리를 찍고도 0은 나온다. 둘째 줄이 제 상자를 칠하는지와 화면이 멎었는지를
    // 같이 물어야 이 0이 잘 잰 0이다.
    check("title:" + tag + ":the-second-line-does-not-wear-the-first",
      share <= INK_FLOOR && still.hits === 0 && own.hits >= area * OWN_MIN,
      wear.hits + "px of " + area + " = " + (100 * share).toFixed(2) + "% against floor "
      + (100 * INK_FLOOR).toFixed(2) + "%, second line fills " + (100 * own.hits / area).toFixed(2)
      + "%, a still frame moves " + still.hits + "px");

    /* 같은 주장의 DOM 쪽 반쪽이고 값이 싸다. 마크가 -2.2도 기울어 있어 화면 좌표의
       AABB는 두 줄이 12.28px 겹친 것으로 읽히는데, 줄간격을 무엇으로 바꿔도 같은 수다.
       기울기는 두 줄을 함께 돌리므로 서 있는지는 기울기를 뺀 자리에서 묻는다.
       스팬의 상자끼리는 블록이라 언제나 맞닿아 아무것도 못 묻는다. 줄상자를 잰다. */
    const apart = await p.evaluate(() => {
      const s = document.querySelectorAll("#word span");
      const mark = document.getElementById("mark");
      const keep = mark.style.transform;
      mark.style.transform = "none";
      const rng = document.createRange();
      rng.selectNodeContents(s[0]);
      const one = rng.getBoundingClientRect();
      rng.selectNodeContents(s[1]);
      const two = rng.getBoundingClientRect();
      mark.style.transform = keep;
      return { bottom: +one.bottom.toFixed(2), top: +two.top.toFixed(2), gap: +(two.top - one.bottom).toFixed(2) };
    });
    check("title:" + tag + ":the-lines-stand-apart", apart.gap >= -1,
      "line one ends at " + apart.bottom + ", line two starts at " + apart.top + ", gap " + apart.gap + "px");

    /* 조작법 패널은 이 화면을 떠나 판 안의 위키로 옮겼다. 접힘과 여닫이를 재던 다섯 축은
       그 표면을 따라가 wiki 게이트가 갖는다. 여기서는 타이틀이 이름과 문 하나만 세우는지를 본다. */
    // 시작하면 타이틀이 사라지고 몸통에 표시가 붙는다. 두 번 눌러도 한 번만 시작한다.
    await p.click("#go", { force: true });
    await p.waitForTimeout(400);
    const started = await p.evaluate(() => ({ hidden: document.getElementById("title").hidden, playing: document.body.classList.contains("playing") }));
    check("title:" + tag + ":hides-on-start", started.hidden === true && started.playing === true, "hidden " + started.hidden + " playing " + started.playing);
    await p.evaluate(() => document.getElementById("go").click());
    await p.waitForTimeout(200);
    const again = await p.evaluate(() => ({ hidden: document.getElementById("title").hidden, playing: document.body.classList.contains("playing") }));
    check("title:" + tag + ":starting-twice-changes-nothing", again.hidden === true && again.playing === true, "hidden " + again.hidden + " playing " + again.playing);

    check("console:" + tag + ":no-errors", errs.length === 0, errs.slice(0, 2).join(" | ") || "clean");
    await ctx.close();
  }

  if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(LINE));
  if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(LINE));
  console.log(fails.length ? "title FAIL " + fails.length : "title PASS");
  if (fails.length) process.exitCode = 1;
} finally {
  clearTimeout(t);
  if (b) await b.close();
}
