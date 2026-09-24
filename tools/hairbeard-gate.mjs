import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

// 기존 thumb의 headBox와 실제 상품 굽기를 재사용한다. 색 표식은 thumb-gate와 같은 자홍색이다.
const out = new URL("../.omo/evidence/p20-p21a/", import.meta.url);
mkdirSync(out, { recursive: true });
const phase = process.argv.includes("--before") ? "before" : "after";
// 전체 로스터와 변형을 굽는 동안에도 멈춘 브라우저는 3분 뒤 종료한다.
const timer = setTimeout(() => process.exit(1), 180000);
timer.unref();
const browser = await chromium.launch({ executablePath: process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe" });
try {
  // 데스크톱 기준 창이며 캡처는 원래부터 1600 이하의 JPEG다.
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route("**/web/src/render/objects/actors.mjs", async route => {
    const response = await route.fetch();
    let body = await response.text();
    const pattern = /shellColors.push\((?:hairTone === undefined \? 0x1c1712 : hairTone|0x1c1712|face\.beardTone \?\? 0x1c1712)\);/g;
    if ([...body.matchAll(pattern)].length !== 1) throw new Error("beard control anchor");
    body = body.replace(pattern, match => "if (face.forceHairChin) shellColors.push(hairTone); else " + match);
    await route.fulfill({ response, body });
  });
  await page.goto("http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran");
  await page.click("#go", { force: true });
  await page.evaluate(() => window.__shop(true));
  await page.locator('#shop .tab[data-tab="hair"]').click();
  await page.screenshot({ path: new URL("hair-" + phase + ".jpg", out).pathname.slice(1), type: "jpeg" });
  const rows = await page.evaluate(async () => {
    const m = await import("/web/src/render/thumb.mjs");
    const g = await import("/web/src/state/gear.mjs");
    const r = await import("/src/roster.mjs");
    const read = box => new Promise(resolve => {
      const im = new Image();
      im.onload = () => {
        const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height;
        const ctx = cv.getContext("2d"); ctx.drawImage(im, 0, 0);
        const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
        let count = 0;
        // 입 아래 얼굴 전면만 센다. 머리 반지름의 절반 폭은 뒷머리와 귀를 배제한다.
        for (let y = Math.ceil(box.mouth.bot * cv.height); y < Math.min(cv.height, (box.y + box.ry) * cv.height); y++) {
          for (let x = Math.ceil((box.mouth.x - box.rx * 0.5) * cv.width); x < (box.mouth.x + box.rx * 0.5) * cv.width; x++) {
            const i = (y * cv.width + x) * 4;
            // thumb-gate의 색조 문턱: 보라색 장갑과 저조도 잡음을 표식으로 세지 않는다.
            if (d[i] > d[i + 1] * 1.9 && d[i + 2] > d[i + 1] * 1.9 && d[i] > 40 && d[i + 2] > 40 && d[i + 3] > 16) count++;
          }
        }
        resolve(count);
      }; im.src = box.url;
    });
    const rows = [];
    for (const keeper of r.KEEPERS) for (const [rank] of g.HAIRS.entries()) for (const [variant] of g.skinsAt("hair", rank).entries()) {
      const look = g.lookOf({ hair: rank, hairSkin: variant }, keeper.name);
      // 실제 머리에 표식을 칠해 수염으로 새는 색을 읽는다.
      look.hair = 0xff00ff;
      const box = m.headBox("hair", keeper, look);
      rows.push({ name: keeper.name, rank, variant, pixels: await read(box) });
    }
    const keeper = r.KEEPERS[0];
    const look = g.lookOf({}, keeper.name);
    // 기존 턱 덮개를 수염 최상 등급으로 강제해 양성 대조군을 만든다.
    look.hair = 0xff00ff; look.face = { ...look.face, beard: 2, forceHairChin: true };
    const control = await read(m.headBox("hair", keeper, look));
    return { rows, control };
  });
  writeFileSync(new URL("hair-pixels-" + phase + ".json", out), JSON.stringify(rows, null, 2));
  const bad = rows.rows.filter(row => row.pixels !== 0);
  const pass = rows.rows.length > 0 && bad.length === 0 && rows.control > 0;
  console.log("hairbeard:every-keeper-hair-thumbnail-below-mouth samples=" + rows.rows.length + " failures=" + bad.length + " max=" + Math.max(...rows.rows.map(row => row.pixels)));
  console.log("control:forced-hair-tone-chin pixels=" + rows.control);
  console.log("hairbeard " + (pass ? "PASS" : "FAIL"));
  if (!pass) process.exitCode = 1;
} finally { clearTimeout(timer); await browser.close(); }
