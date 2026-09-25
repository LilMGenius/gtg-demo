import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

// 기존 브라우저 게이트와 같은 설치본을 사용한다. 렌더된 텍스트 노드를 DOM TreeWalker로 검사한다.
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const BASE = 'http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran';
// 선반과 위키 전체 순회가 멎으면 기존 venue-browser와 같은 4분 예산에서 실패한다.
const watchdog = setTimeout(() => process.exit(2), 240000);
const browser = await chromium.launch({ executablePath: EXE });
const rows = [];
try {
  // 요청된 데스크톱과 두 가로 휴대폰 크기로 실제 줄 배치를 검사한다.
  for (const [width, height] of [[1280,720], [844,390], [740,360]]) {
    const page = await browser.newPage({ viewport:{width,height} });
    await page.goto(BASE);
    await page.locator('#go').click({force:true});
    await page.evaluate(() => { window.__lockRound(); window.__shop(true); });
    const scan = () => page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const hits = [];
      let node;
      while ((node = walker.nextNode())) {
        const el = node.parentElement;
        if (!el || el.closest('script,style,.wiki-prose')) continue;
        if (!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})) continue;
        const text = node.textContent.trim();
        if (!/\S\s*(?:·| \/ | \| )\s*\S/u.test(text)) continue;
        // 주전 정원과 뽑기 순번의 분수는 두 메타데이터를 잇는 구분자가 아니다.
        if (/^(?:주전\s+)?[\d,]+\s*\/\s*[\d,]+(?:명)?$/u.test(text)) continue;
        // 조작키 대안과 이동 안내 문장은 조작 설명이다. 이름·장소·조건 같은 UI 메타데이터와 구분한다.
        if (el.closest('#keys,#moveHint')) continue;
        const range = document.createRange();range.selectNodeContents(node);
        const rects = [...range.getClientRects()];
        if (!rects.some(r => r.width > 0 && r.height > 0)) continue;
        hits.push({text,tag:el.tagName,class:el.className});
      }
      return hits;
    });
    const tabs = await page.locator('#shop .tab').evaluateAll(els => els.map(el => el.dataset.tab));
    for (const tab of tabs) {
      await page.locator('#shop .tab[data-tab="'+tab+'"]').click();
      // 선반의 HTML은 클릭 핸들러 안에서 동기적으로 갱신된다.
      rows.push({width,height,surface:tab,hits:await scan()});
      if (tab === 'city') {
        for (const mode of await page.locator('[data-preview]').all()) {
          await mode.click();
          rows.push({width,height,surface:'mode-preview',hits:await scan()});
        }
      }
    }
    await page.evaluate(() => { document.querySelector('#shop .close').click(); document.querySelector('#wikiBtn').click(); });
    rows.push({width,height,surface:'wiki-chrome',hits:await scan()});
    // 각 구분자로 심은 텍스트 노드가 실제 화면에 서고 모두 검출돼야 0건이라는 관측이 유효하다.
    for (const separator of [' · ', ' / ', ' | ']) {
      await page.evaluate(separator => {
        const el = document.createElement('div');el.id='separator-control';
        el.style.cssText='position:fixed;inset:0 auto auto 0;z-index:99999;background:white;color:black';
        el.textContent='시설 이름'+separator+'개최 도시';document.body.append(el);
      },separator);
      const hits = await scan();
      rows.push({width,height,surface:'control',separator,rejected:hits.some(hit => hit.text === '시설 이름'+separator+'개최 도시')});
      await page.locator('#separator-control').evaluate(el => el.remove());
    }
    await page.close();
  }
  const fail = rows.filter(row => row.surface === 'control' ? !row.rejected : row.hits.length > 0);
  mkdirSync('.omo/evidence/separator',{recursive:true});
  writeFileSync('.omo/evidence/separator/result.json',JSON.stringify({rows,fail},null,2));
  console.log(JSON.stringify(fail));
  console.log('separator '+(fail.length ? 'FAIL' : 'PASS')+' '+rows.length);
  if (fail.length) process.exitCode=1;
} finally {
  clearTimeout(watchdog);
  await browser.close();
}
