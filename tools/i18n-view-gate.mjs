import { chromium } from 'playwright';

// The English game, opened panel by panel. A Korean word left on screen under ?lang=en is a string the
// dictionary missed; the language button must flip both ways and survive a reload. Control: the same
// walk under ?lang=ko must find Korean, so a page that paints nothing cannot pass as translated.
const BASE = 'http://127.0.0.1:10310/web/index.html';
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const timer = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 180000);
timer.unref();
const failures = [];
const check = (name, ok, detail) => { console.log((ok ? 'GREEN ' : 'RED ') + name + ' ' + JSON.stringify(detail)); if (!ok) failures.push(name); };
const visibleHangul = (p) => p.evaluate(() => {
  const out = new Set();
  const w = document.createTreeWalker(document.getElementById('hud'), NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const e = n.parentElement;
    if (!/[\uac00-\ud7a3]/.test(n.nodeValue) || e.closest('[hidden],[data-i18n-skip]')) continue;
    const r = e.getBoundingClientRect();
    if (r.width && r.height && getComputedStyle(e).visibility !== 'hidden') out.add(n.nodeValue.trim());
  }
  return [...out];
});
let browser;
try {
  browser = await chromium.launch({ executablePath: EXE });
  const walk = async (lang) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await context.newPage();
    await p.goto(BASE + '?seed=20&preset=rich,famous,veteran&lang=' + lang);
    await p.waitForSelector('#go');
    for (let i = 0; i < 30 && !(await p.locator('#go').evaluate((b) => b === document.activeElement)); i++) await p.keyboard.press('Tab');
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => document.getElementById('title').hidden);
    await p.waitForTimeout(1500);
    const seen = new Set(await visibleHangul(p));
    for (const id of ['gym', 'roster', 'gram', 'me', 'shop', 'wiki']) {
      await p.click('#' + id + 'Btn');
      await p.waitForTimeout(400);
      const tabs = await p.locator('#' + id + ' :is(.tab[data-tab],.kind[data-pos],.cats [data-cat])').count();
      for (let i = 0; i < Math.max(tabs, 1); i++) {
        if (tabs) { await p.locator('#' + id + ' :is(.tab[data-tab],.kind[data-pos],.cats [data-cat])').nth(i).click(); await p.waitForTimeout(250); }
        for (const s of await visibleHangul(p)) seen.add(id + ': ' + s);
      }
      await p.keyboard.press('Escape');
      await p.waitForTimeout(300);
    }
    return { p, context, seen: [...seen] };
  };
  const en = await walk('en');
  check('i18n:english-screens-carry-no-korean', en.seen.length === 0, { count: en.seen.length, first: en.seen.slice(0, 25) });
  // Captions, toasts and cause labels only exist mid-play, and their names are filled in at run time.
  // Let the bot play in English and collect every painted line the dictionary could not turn.
  await en.p.evaluate(() => document.getElementById('auto').click());
  const heard = new Set();
  for (let i = 0; i < 60; i++) {
    await en.p.waitForTimeout(1000);
    for (const s of await en.p.evaluate(() => window.__i18nMisses())) heard.add(s);
    for (const s of await visibleHangul(en.p)) heard.add('live: ' + s);
  }
  check('i18n:sixty-seconds-of-english-play-paint-no-korean', heard.size === 0, { count: heard.size, first: [...heard].slice(0, 25) });
  const lang = await en.p.evaluate(() => [document.documentElement.lang, document.getElementById('lang').getAttribute('aria-pressed')]);
  check('i18n:english-is-declared', lang[0] === 'en' && lang[1] === 'true', lang);
  await en.p.click('#lang');
  const back = await en.p.evaluate(() => [document.documentElement.lang, localStorage.getItem('gtg.lang'), document.getElementById('lang').getAttribute('aria-label')]);
  check('i18n:button-flips-to-korean', back[0] === 'ko' && back[1] === 'ko' && /[\uac00-\ud7a3]/.test(back[2]), back);
  await en.p.click('#lang');
  await en.p.goto(BASE + '?seed=20');
  await en.p.waitForSelector('#go');
  const kept = await en.p.evaluate(() => document.documentElement.lang);
  check('i18n:choice-survives-reload', kept === 'en', { kept });
  await en.context.close();
  const ko = await walk('ko');
  check('i18n:control-korean-walk-finds-korean', ko.seen.length > 20, { count: ko.seen.length });
  await ko.context.close();
} catch (e) {
  check('i18n:run', false, String(e).slice(0, 300));
} finally {
  await browser?.close();
}
console.log(failures.length ? 'i18n-view FAIL ' + failures.length : 'i18n-view PASS');
process.exit(failures.length ? 1 : 0);

