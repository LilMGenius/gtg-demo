import { chromium } from 'playwright';
// 3분 이내 제출 영상. 사람이 키보드 앞에 앉지 않고 스토리보드대로 스스로 찍는다.
// 자막은 ffmpeg 필터가 아니라 페이지 안에 넣는다. 화면에 이미 있는 한글 폰트를 그대로 쓴다.
const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const DIR = process.env.OUT || 'video.local';
const t = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 360000); t.unref();

const CARD = [
  '#vo{position:fixed;left:0;right:0;bottom:6%;z-index:99;text-align:center;pointer-events:none;',
  " font:800 34px/1.35 'Pretendard','Malgun Gothic',sans-serif;color:#fff;",
  ' text-shadow:0 3px 0 #000,0 0 18px #000a;opacity:0;transition:opacity .35s}',
  '#vo.on{opacity:1}',
  '#vo small{display:block;font-size:21px;font-weight:700;color:#ffe07a;margin-top:6px}',
  '#vt{position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;align-items:center;',
  ' justify-content:center;background:#000;color:#fff;pointer-events:none;opacity:0;transition:opacity .5s;',
  " font:900 74px/1.2 'Pretendard','Malgun Gothic',sans-serif;text-align:center}",
  '#vt.on{opacity:1}',
  "#vt em{font:800 27px/1.5 'Pretendard','Malgun Gothic',sans-serif;font-style:normal;color:#9be8b4;margin-top:18px}"
].join('\n');

let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: DIR, size: { width: 1280, height: 720 } }
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('ERR', String(e)));
  await p.goto('http://127.0.0.1:10310/web/index.html?seed=20', { waitUntil: 'load' });
  await p.waitForTimeout(700);
  await p.evaluate((css) => {
    const s = document.createElement('style'); s.textContent = css; document.head.append(s);
    const o = document.createElement('div'); o.id = 'vo'; document.body.append(o);
    const c = document.createElement('div'); c.id = 'vt'; document.body.append(c);
  }, CARD);

  const wait = (ms) => p.waitForTimeout(ms);
  // 자막 한 줄. 켜고, 읽을 시간을 주고, 끈다.
  const vo = async (head, sub, ms) => {
    await p.evaluate(([h, s]) => {
      const o = document.getElementById('vo');
      o.innerHTML = h + (s ? '<small>' + s + '</small>' : '');
      o.classList.add('on');
    }, [head, sub || '']);
    await wait(ms);
    await p.evaluate(() => document.getElementById('vo').classList.remove('on'));
    await wait(340);
  };
  // 검은 카드. 장이 바뀌는 자리에만 쓴다.
  const card = async (head, sub, ms) => {
    await p.evaluate(([h, s]) => {
      const c = document.getElementById('vt');
      c.innerHTML = h + (s ? '<em>' + s + '</em>' : '');
      c.classList.add('on');
    }, [head, sub || '']);
    await wait(ms);
    await p.evaluate(() => document.getElementById('vt').classList.remove('on'));
    await wait(520);
  };

  // 성장 오버레이는 모달이다. 열리면 눌러주기 전까지 게임이 멈춘다.
  // 기본은 곧바로 비우고, 4장에서만 붙잡아 둔다.
  await p.evaluate(() => {
    window.__offerHold = 700;
    let shownAt = 0;
    setInterval(() => {
      const box = document.getElementById('offer');
      if (!box || box.hidden) { shownAt = 0; return; }
      if (!shownAt) shownAt = Date.now();
      if (Date.now() - shownAt < window.__offerHold) return;
      const btn = box.querySelector('button');
      if (btn) { btn.click(); shownAt = 0; }
    }, 220);
  });
  const offerUp = () => p.evaluate(() => {
    const box = document.getElementById('offer');
    return Boolean(box) && !box.hidden;
  });
  const holdOffer = (ms) => p.evaluate((v) => { window.__offerHold = v; }, ms);
  const awaitOffer = async (limit) => {
    for (let i = 0; i < limit / 250; i++) { if (await offerUp()) return true; await wait(250); }
    return false;
  };

  // 1장. 타이틀
  await wait(1500);
  await vo('골키퍼 키우기 3D', '2014년 8만 다운로드, 12년 만의 재출격', 5200);
  await vo('막는 것도 실력, 못 막는 것도 캐릭터', '골키퍼 한 명을 키우는 방치형 RPG', 4600);
  await p.click('#go', { force: true });
  await wait(1500);

  // 2장. 직접 막는다. 한 판은 슛 다섯 개다.
  await vo('직접 막는다', '좌 · 정면 · 우. 방향과 타이밍, 손가락 셋이 전부다', 4600);
  const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowRight'];
  for (let i = 0; i < 3; i++) { await wait(2100); await p.keyboard.press(KEYS[i]); await wait(2500); }
  await vo('실점에는 반드시 이름이 붙는다', '반응속도가 늦었다 · 집중력이 샜다 · 각을 못 좁혔다', 4800);
  for (let i = 3; i < 5; i++) { await wait(1900); await p.keyboard.press(KEYS[i]); await wait(2400); }

  // 3장. 키운다. 다섯 개가 끝나면 성장 선택이 저절로 열린다.
  await holdOffer(999999);
  await awaitOffer(24000);
  await vo('키운다', '실점 원인이 그대로 다음 훈련 항목이 된다', 4600);
  await vo('스탯은 FM과 FC에서 가져왔다', '다이빙 · 핸들링 · 반응속도 · 수비범위 · 의사소통 · 악동', 5000);
  await holdOffer(700);
  await wait(1600);

  // 4장. 병맛 사건
  await card('막아도 안 끝난다', '슛 하나가 끝날 때까지 결과가 몇 번이나 뒤집힌다', 2600);
  const SHOW = [
    ['gloveGone', '장갑째 골', '핸들링이 낮으면 공이 장갑을 뜯어간다'],
    ['carriedIn', '같이 들어감', '막긴 막았는데 몸째로 골망까지 밀려 들어간다'],
    ['downed', '깔려서 골', '맷집이 낮으면 공보다 사람이 먼저 눕는다'],
    ['talked', '한눈팔기', '집중력이 낮으면 지나가던 행인에게 눈이 간다'],
    ['charge', '스위퍼 키퍼', '잡고 나가서 드리블을 시도한다'],
    ['beat', '뺏겼다', '실패하면 골대는 비어 있다']
  ];
  for (const s of SHOW) {
    await p.evaluate((kk) => window.__act(kk), s[0]);
    await wait(300);
    await vo(s[1], s[2], 4600);
    await wait(1100);
  }

  // 5장. 맡긴다. 자동이 실제로 막는 장면이 들어가야 한다.
  await vo('맡긴다', '자동 방어. 입력만 대신하고 기다리는 시간은 줄지 않는다', 4000);
  const on = await p.evaluate(() => document.getElementById('auto').classList.contains('on'));
  if (!on) await p.click('#auto', { force: true });
  await wait(15000);
  await vo('아웃문그램', '유명한 키커를 막으면 팔로워가 붙는다', 4400);

  // 6장. 아웃트로
  await card('골키퍼 키우기 3D', 'lilmgenius.github.io/gtg-demo · 다이달게임즈 · K축구게임혁신위원회', 4200);

  await ctx.close();
  console.log('video', await p.video().path());
} finally { clearTimeout(t); if (b) await b.close(); }
