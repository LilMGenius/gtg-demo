import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

// U4b가 지정한 데스크톱과 가로 폰의 수용 폭이다.
const SIZES = [[1280, 720], [844, 390], [740, 360]];
// 제목과 원인 배지는 hud.css의 제목 서체 하한보다 작아지면 안 된다.
const FONT_FLOOR = 16;
// JPEG는 화면 판정에 필요한 윤곽을 남기면서 증거 이미지 용량을 줄인다.
const QUALITY = 80;
// 원소 수와 교차 면적을 세는 영점이다.
const ZERO = 0;
// 참거짓 실패 종료 코드와 표본 하나의 증가량이다.
const ONE = 1;
// 보고서 들여쓰기는 다른 게이트의 JSON 증거와 맞춘다.
const INDENT = 2;
// HTTP 성공을 먼저 증명해야 서버 부재를 화면 결함으로 오독하지 않는다.
const HTTP_OK = 200;
const base = 'http://127.0.0.1:10310/web/index.html?seed=20&preset=veteran';
const executablePath = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const out = fileURLToPath(new URL('../.omo/evidence/u4b/caption/', import.meta.url));
mkdirSync(out, { recursive: true });
const invocation = 'node tools/caption-gate.mjs';
const results = [];
const scene = readFileSync(new URL('../web/src/render/scene.mjs', import.meta.url), 'utf8');
// 도장이 있는 결과 종류는 렌더의 선언에서 읽고 실제 act 경로가 낸 글자를 다시 대조한다.
const stampBody = scene.match(/const STAMP = \{([\s\S]*?)\};/)[ONE];
const stamps = Object.fromEntries([...stampBody.matchAll(/(\w+):\s*'([^']+)'/g)].map(match => match.slice(ONE)));
assert.ok(Object.keys(stamps).length > ZERO);
// 수정 전 규칙의 고정 표본이다. 이 숫자는 옛 배치를 재현할 뿐 제품의 문턱이 아니다.
const oldLayout = `
#resultHud{display:contents}
#caption{position:absolute;left:50%;transform:translateX(-50%);
 top:calc(var(--strip-b) + var(--lift) + var(--gap-1) + env(safe-area-inset-top));
 width:min(660px,calc(100vw - 2*(var(--pad-r) + 84px)))}
#stamp{position:fixed;left:50%;top:30%;translate:-50% -50%}
@keyframes stampHit{
 0%{opacity:0;rotate:-13deg;scale:2.4}
 9%{opacity:1;rotate:-7deg;scale:.92}
 16%{rotate:-9deg;scale:1.04}
 74%{opacity:1;rotate:-9deg;scale:1.04}
 100%{opacity:0;rotate:-9deg;scale:1.1}}
@keyframes capPop{
 0%{opacity:0;transform:scale(.72) rotate(-4deg)}
 62%{opacity:1;transform:scale(1.15) rotate(-4deg)}
 100%{opacity:1;transform:scale(1) rotate(-2deg)}}`;
let browser;
let browserVersion;
try {
  assert.equal((await fetch(base)).status, HTTP_OK);
  browser = await chromium.launch({ executablePath });
  browserVersion = browser.version();
  for (const [width, height] of SIZES) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(base);
      await page.locator('#go').click({ force: true });
      await page.evaluate(async () => { window.__lockRound(); window.__freeze(true); await document.fonts.ready; });
      const measure = async planted => page.evaluate(async ({ stamps, planted, floor }) => {
        const { POOLS } = await import('/web/src/ui/lines.mjs');
        const { CAUSE_LABEL } = await import('/src/ledger.mjs');
        const samples = [], collisions = [], floors = [];
        // 모든 대사 변형에 가장 긴 원인 이름을 붙여 짧은 표본만 재는 빈틈을 없앤다.
        const longestCause = Object.keys(CAUSE_LABEL).sort((a, b) => CAUSE_LABEL[b].length - CAUSE_LABEL[a].length)[0];
        const lines = Object.entries(POOLS).flatMap(([kind, pool]) => pool.map(line => ({ kind, line, cause: longestCause })));
        // 결과 두 갈래는 모든 원인과 원인 없음까지 직접 조립한다.
        for (const line of ['실점', '세이브']) for (const cause of [null, ...Object.keys(CAUSE_LABEL)]) lines.push({ kind: 'result', line, cause });
        const rect = element => {
          const r = element.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
        };
        const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        for (const [outcome, text] of Object.entries(stamps)) {
          window.__act(outcome);
          const stamp = document.getElementById('stamp');
          if (stamp.textContent !== text) throw new Error('도장 경로 불일치: ' + outcome);
          for (const sample of lines) {
            window.__caption(sample.line, sample.cause);
            const caption = document.getElementById('caption');
            const prose = caption.querySelector('span');
            const badge = caption.querySelector('b');
            const animations = [...stamp.getAnimations(), ...prose.getAnimations()];
            // 실제 키프레임 경계를 모두 재고, 수정본은 공간 변환 자체가 없어 사이 프레임도 같은 사각형이다.
            const times = [...new Set(animations.flatMap(animation => animation.effect.getKeyframes()
              .map(frame => frame.offset * animation.effect.getTiming().duration)))];
            animations.forEach(animation => animation.pause());
            if (!planted && animations.some(animation => animation.effect.getKeyframes()
              .some(frame => ['transform', 'rotate', 'scale', 'translate'].some(key => frame[key] && frame[key] !== 'none')))) {
              throw new Error('도장 또는 문장이 예약한 칸 밖으로 변형된다');
            }
            let minimumGap = Infinity, worst;
            for (const time of times) {
              animations.forEach(animation => { animation.currentTime = time; });
              const a = rect(stamp), b = rect(caption), c = rect(prose), d = badge && rect(badge);
              const visible = Number(getComputedStyle(stamp).opacity) > 0 && Number(getComputedStyle(prose).opacity) > 0;
              const collision = overlaps(a, b) || Boolean(d && overlaps(c, d));
              const gap = Math.max(b.left - a.right, a.left - b.right, b.top - a.bottom, a.top - b.bottom);
              if (gap < minimumGap) { minimumGap = gap; worst = { time, stamp: a, caption: b, prose: c, badge: d }; }
              if (visible && collision) collisions.push({ outcome, ...sample, ...worst });
              for (const element of [stamp, prose, badge].filter(Boolean)) {
                const size = parseFloat(getComputedStyle(element).fontSize);
                if (size < floor) floors.push({ outcome, size });
              }
            }
            samples.push({ outcome, ...sample, minimumGap, worst });
            // 끝난 애니메이션이 다음 표본의 getAnimations에서 빠지지 않게 시작 경계로 되돌린다.
            animations.forEach(animation => { animation.currentTime = 0; });
          }
        }
        return { samples, collisions, floors, outcomeCount: Object.keys(stamps).length, lineCount: lines.length };
      }, { stamps, planted, floor: FONT_FLOOR });
      const measured = await measure(false);
      const pass = measured.samples.length > ZERO && !measured.collisions.length && !measured.floors.length && !errors.length;
      results.push({ name: 'caption-' + width + 'x' + height, scenario: '모든 도장 결과와 모든 대사 및 원인, 전체 키프레임 경계', invocation, pass, ...measured, errors: [...errors] });
      console.log((pass ? 'PASS ' : 'FAIL ') + 'caption-' + width + 'x' + height + ' samples=' + measured.samples.length + ' intersections=' + measured.collisions.length + ' belowFloor=' + measured.floors.length);
      // 실제 보고된 집중력 사건을 같은 조립 경로로 다시 찍는다. 전체 표본은 JSON에 남긴다.
      const pose = async () => page.evaluate(() => {
        window.__act('distracted');
        window.__caption('무릎을 꿇었습니다. 반지는 없었고 공은 들어갔습니다.', 'focus');
        for (const element of [document.getElementById('stamp'), document.querySelector('#caption>span')]) {
          for (const animation of element.getAnimations()) {
            animation.pause();
            // 절반 지점은 양쪽 애니메이션의 가시 구간 안이다.
            animation.currentTime = animation.effect.getTiming().duration / 2;
          }
        }
        document.getElementById('flash').classList.remove('hit');
      });
      await pose();
      const screenshot = out + 'caption-' + width + 'x' + height + '.jpg';
      await page.screenshot({ path: screenshot, type: 'jpeg', quality: QUALITY });
      results.at(-ONE).screenshot = screenshot;
      const style = await page.addStyleTag({ content: oldLayout });
      const control = await measure(true);
      const controlPass = control.samples.length > ZERO && control.collisions.length > ZERO;
      results.push({ name: 'old-layout-control-' + width, scenario: '옛 독립 좌표와 확대 회전 도장을 심으면 교차가 양수', invocation, pass: controlPass,
        sampleCount: control.samples.length, intersections: control.collisions.length, firstCollision: control.collisions[ZERO] });
      console.log((controlPass ? 'PASS ' : 'FAIL ') + 'old-layout-control-' + width + ' intersections=' + control.collisions.length);
      await pose();
      const controlScreenshot = out + 'old-layout-' + width + 'x' + height + '.jpg';
      await page.screenshot({ path: controlScreenshot, type: 'jpeg', quality: QUALITY });
      results.at(-ONE).screenshot = controlScreenshot;
      await style.evaluate(element => element.remove());
      // 바를 낮추지 않고 바보다 작은 글자를 심어 가독성 검출기가 실제로 빨개지는지 잰다.
      const smallText = await page.addStyleTag({ content: '#stamp,#caption>span,#caption>b{font-size:' + (FONT_FLOOR - ONE) + 'px!important}' });
      const fontControl = await measure(false);
      await smallText.evaluate(element => element.remove());
      // 콘솔 오류 영점도 실제 예외 하나가 같은 수집 경로에서 양수가 되는지 증명한다.
      const expectedError = page.waitForEvent('pageerror');
      await page.evaluate(() => { setTimeout(() => { throw new Error('caption-control'); }); });
      await expectedError;
      const instrumentPass = fontControl.floors.length > ZERO && errors.length === ONE && errors[ZERO] === 'caption-control';
      results.push({ name: 'instrument-controls-' + width, scenario: '하한 미달 서체와 런타임 예외를 심으면 두 영점 검출기가 양수', invocation, pass: instrumentPass,
        belowFloor: fontControl.floors.length, plantedFontSize: FONT_FLOOR - ONE, errors: [...errors] });
      console.log((instrumentPass ? 'PASS ' : 'FAIL ') + 'instrument-controls-' + width + ' belowFloor=' + fontControl.floors.length + ' errors=' + errors.length);
      assert.ok(pass && controlPass && instrumentPass);
    } finally { await context.close(); }
  }
} catch (error) {
  results.push({ name: 'execution', scenario: '게이트 전체 실행', invocation, pass: false, error: error.stack });
  console.error(error);
} finally {
  await browser?.close();
  const pass = results.length > ZERO && results.every(result => result.pass);
  writeFileSync(out + 'gate.json', JSON.stringify({ invocation, capturedAt: new Date().toISOString(), pass,
    binary: { path: process.execPath, version: process.version, executablePath, browserVersion,
      playwright: createRequire(import.meta.url)('playwright/package.json').version }, results }, null, INDENT));
  console.log('caption ' + (pass ? 'PASS' : 'FAIL') + ' ' + results.length + ' axes');
  console.log('evidence ' + out + 'gate.json');
  if (!pass) process.exitCode = ONE;
}
