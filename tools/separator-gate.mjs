import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

// 기존 브라우저 게이트와 같은 설치본과 DOM Range를 사용한다. 새 렌더러나 텍스트 분할기는 두지 않는다.
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const BASE = 'http://127.0.0.1:10310/web/index.html?seed=20&preset=rich,veteran';
// 선반과 위키 전체 순회의 기존 4분 예산이다.
const watchdog = setTimeout(() => process.exit(2), 240000);
// G6 수락 기준은 제목의 가장 짧은 줄이 가장 긴 줄의 40% 이상인 것이다.
const MIN_LINE_RATIO = 0.4;
const browser = await chromium.launch({ executablePath: EXE });
const rows = [];
const out = process.env.GTG_EVIDENCE_DIR || '.omo/evidence/separator';
mkdirSync(out, { recursive: true });

async function scan(page) {
  return page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const hits = [];
    let node;
    while ((node = walker.nextNode())) {
      const el = node.parentElement;
      if (!el || el.closest('script,style,.wiki-prose,svg')) continue;
      if (!el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})) continue;
      const text = node.textContent.trim();
      const range = document.createRange(); range.selectNodeContents(node);
      if (![...range.getClientRects()].some(r => r.width > 0 && r.height > 0)) continue;
      const axes = [];
      // 주전 정원·뽑기 순번과 조작키 안내는 메타데이터 구분자가 아니다.
      if (/\S\s*(?:·| \/ | \| )\s*\S/u.test(text)
        && !/^(?:주전\s+)?[\d,]+\s*\/\s*[\d,]+(?:명)?$/u.test(text)
        && !el.closest('#keys,#moveHint')) axes.push('separator');
      // 콜론이 별도 인라인 노드여도 같은 라벨로 읽는다. innerText는 숨은 자식 문구를 제외한다.
      const colonText = text.includes(':') ? (el.parentElement?.innerText || text) : '';
      // 콜론 양쪽의 토큰 중 글자가 있으면 라벨이다. 숫자끼리의 시간과 비율은 통과한다.
      if (/(?:[\p{L}\p{N}]*\p{L}[\p{L}\p{N}]*\s*:\s*[\p{L}\p{N}]|[\p{L}\p{N}]+\s*:\s*[\p{L}\p{N}]*\p{L})/u.test(colonText)) axes.push('colon');
      if (/\p{Extended_Pictographic}/u.test(text)) axes.push('emoji');
      if (axes.length) hits.push({text,tag:el.tagName,class:el.className,axes});
    }
    return hits;
  });
}

async function titles(page) {
  return page.evaluate(minRatio => {
    // 회전된 카드의 글자별 y좌표는 기울어진다. 측정하는 순간에만 회전을 풀고 원래 값을 복원한다.
    const cards = [...document.querySelectorAll('#shop .card')];
    const saved = cards.map(card => card.style.cssText);
    cards.forEach(card => { card.style.setProperty('transform','none','important'); card.style.setProperty('transition','none','important'); });
    try {
      return [...document.querySelectorAll('#shop .card > b,#shop .venue-subtitle,#shop .pack-card h3,#shop .legend-showcase h3')].filter(el => el.checkVisibility()).map(el => {
        const lines = new Map();
        // 개최 도시 부제는 별도 제목이다. 상품 이름의 직접 텍스트만 먼저 재고 부제는 따로 읽는다.
        const nodes = [...el.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
        for (const node of nodes) {
          for (let index = 0; index < node.length; index++) {
            if (!node.textContent[index].trim()) continue;
            const range = document.createRange(); range.setStart(node,index); range.setEnd(node,index + 1);
            const rect = range.getBoundingClientRect();
            const y = Math.round(rect.top);
            const line = lines.get(y) || {left:rect.left,right:rect.right,text:''};
            line.left = Math.min(line.left,rect.left); line.right = Math.max(line.right,rect.right); line.text += node.textContent[index];
            lines.set(y,line);
          }
        }
        const widths = [...lines.values()].map(line => line.right-line.left);
        const ratio = widths.length ? Math.min(...widths)/Math.max(...widths) : 0;
        return {text:nodes.map(node=>node.textContent).join(''),lines:[...lines.values()],ratio,wrapped:lines.size>1,pass:widths.length>0&&ratio>=minRatio};
      });
    } finally { cards.forEach((card,index) => {card.style.cssText=saved[index];}); }
  },MIN_LINE_RATIO);
}

try {
  console.log('browser '+browser.version());
  const response = await fetch(BASE);
  if (response.status !== 200) throw new Error('server '+response.status);
  // 요청된 데스크톱과 두 가로 휴대폰 크기로 실제 줄 배치를 검사한다.
  for (const [width,height] of [[1280,720],[844,390],[740,360]]) {
    const page = await browser.newPage({viewport:{width,height}});
    const errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(BASE);
    await page.locator('#go').click({force:true});
    await page.evaluate(() => {window.__lockRound();window.__shop(true);});
    await page.evaluate(() => document.fonts.ready);
    const tabs = await page.locator('#shop .tab').evaluateAll(els=>els.map(el=>el.dataset.tab));
    for (const tab of tabs) {
      await page.locator('#shop .tab[data-tab="'+tab+'"]').click();
      rows.push({width,height,surface:tab,hits:await scan(page),titles:await titles(page)});
      if (tab === 'city') {
        for (const mode of await page.locator('[data-preview]').all()) {
          await mode.click();
          rows.push({width,height,surface:'mode-preview',hits:await scan(page)});
        }
      }
    }
    // 옛 CSS를 같은 실제 타투 카드에 심는다. 적어도 한 화면에서 옛 음절 고립이 검출돼야 한다.
    await page.locator('#shop .tab[data-tab="ink"]').click();
    const oldStyle = await page.addStyleTag({content:'#shop .card > b{text-wrap:wrap!important}'});
    const oldTitles = await titles(page);
    rows.push({width,height,surface:'old-css-control',titles:oldTitles,rejected:oldTitles.some(title=>title.wrapped&&!title.pass)});
    await oldStyle.evaluate(el=>el.remove());
    await page.evaluate(() => {document.querySelector('#shop .close').click();document.querySelector('#wikiBtn').click();});
    rows.push({width,height,surface:'wiki-chrome',hits:await scan(page)});
    await page.evaluate(() => window.__wiki(false));
    for (const panel of ['gym','roster','gram','me']) {
      await page.evaluate(panel => window['__'+panel](true),panel);
      rows.push({width,height,surface:panel,hits:await scan(page)});
      await page.evaluate(panel => window['__'+panel](false),panel);
    }
    // 화면에 심은 각 금지 문법을 같은 스캐너가 잡고, 숫자 시간과 비율은 놓아줘야 한다.
    for (const [axis,text] of [['separator','시설 이름 · 개최 도시'],['separator','시설 이름 / 개최 도시'],['separator','시설 이름 | 개최 도시'],['colon','구매 조건: 팔로워'],['emoji','🔒 구매 조건'],['valid','12:34  4:3  1/2']]) {
      await page.evaluate(text=>{
        const el=document.createElement('div');el.id='separator-control';
        el.style.cssText='position:fixed;inset:0 auto auto 0;z-index:99999;background:white;color:black';
        el.textContent=text;document.body.append(el);
      },text);
      const hits=await scan(page);
      rows.push({width,height,surface:'control',axis,text,pass:axis==='valid'?!hits.some(hit=>hit.text===text):hits.some(hit=>hit.text===text&&hit.axes.includes(axis))});
      await page.locator('#separator-control').evaluate(el=>el.remove());
    }
    // 이름과 값이 다른 인라인 요소여도 콜론 라벨이 살아 있으므로 같은 자가 거절해야 한다.
    await page.evaluate(() => {
      const el=document.createElement('div');el.id='separator-control';
      el.style.cssText='position:fixed;inset:0 auto auto 0;z-index:99999';
      el.innerHTML='<span>구매 조건</span>: <span>팔로워</span>';document.body.append(el);
    });
    rows.push({width,height,surface:'control',axis:'split-colon',pass:(await scan(page)).some(hit=>hit.axes.includes('colon'))});
    await page.locator('#separator-control').evaluate(el=>el.remove());
    rows.push({width,height,surface:'runtime',pass:errors.length===0,errors});
    await page.close();
  }
  const actual=rows.filter(row=>row.hits);
  const titleRows=actual.flatMap(row=>row.titles||[]);
  const checks={
    separator:actual.every(row=>row.hits.every(hit=>!hit.axes.includes('separator'))),
    colon:actual.every(row=>row.hits.every(hit=>!hit.axes.includes('colon'))),
    emoji:actual.every(row=>row.hits.every(hit=>!hit.axes.includes('emoji'))),
    'title-balance':titleRows.some(title=>title.wrapped)&&titleRows.every(title=>title.pass),
    'old-css-control':rows.some(row=>row.surface==='old-css-control'&&row.rejected),
    controls:rows.filter(row=>row.surface==='control').every(row=>row.pass),
    runtime:rows.filter(row=>row.surface==='runtime').every(row=>row.pass)
  };
  const fail=rows.filter(row=>row.hits?.length||row.hits&&row.titles?.some(title=>!title.pass)||row.pass===false);
  writeFileSync(out+'/result.json',JSON.stringify({checks,rows,fail},null,2));
  const wrapped=titleRows.filter(title=>title.wrapped);
  console.log('title-balance wrapped '+wrapped.length+' minimum '+Math.min(...wrapped.map(title=>title.ratio)));
  for (const [name,pass] of Object.entries(checks)) console.log((pass?'PASS ':'FAIL ')+name);
  console.log(JSON.stringify(fail));
  const pass=Object.values(checks).every(Boolean);
  console.log('separator '+(pass?'PASS':'FAIL')+' '+rows.length);
  if (!pass) process.exitCode=1;
} finally {
  clearTimeout(watchdog);
  await browser.close();
}
