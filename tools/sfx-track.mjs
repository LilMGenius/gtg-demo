// 캐프처 중 발화한 효과음을 그대로 다시 읍으로 찍어낸다.
// 생성 함수가 t0를 받으므로 한 OfflineAudioContext에 전부 예약하면 한 번에 섞인다.
import { chromium } from 'playwright';
import fs from 'node:fs';

const EXE = process.env.LOCALAPPDATA + '/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const DIR = process.env.OUT || 'video.local';
const SRC = JSON.parse(fs.readFileSync(DIR + '/sfx.json', 'utf8'));
const PAD = 1.5;
const SECONDS = Math.max(...SRC.events.map((e) => e[2])) + PAD;

const t = setTimeout(() => { console.log('WATCHDOG'); process.exit(1); }, 180000); t.unref();
let b;
try {
  b = await chromium.launch({ executablePath: EXE });
  const p = await (await b.newContext()).newPage();
  p.on('pageerror', (e) => console.log('ERR', String(e && e.stack || e)));
  await p.goto('http://127.0.0.1:10310/web/index.html', { waitUntil: 'load' });

  const b64 = await p.evaluate(async ({ events, seconds }) => {
    const mod = await import('/web/src/audio/sfx.mjs');
    const SR = 48000;
    const ac = new OfflineAudioContext(1, Math.ceil(SR * seconds), SR);
    const g = ac.createGain();
    g.gain.value = 1;
    g.connect(ac.destination);
    const noise = mod.makeNoise(ac, 1.2);
    for (const [name, arg, at] of events) mod.buildSfx(name, ac, g, noise, at, arg ?? undefined);
    const d = (await ac.startRendering()).getChannelData(0);

    // 16bit PCM WAV. 바이트를 직접 썬다. 이 페이지에는 인코더가 없다.
    const n = d.length;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const tag = (o, s) => { for (let i = 0; i < s.length; i += 1) v.setUint8(o + i, s.charCodeAt(i)); };
    tag(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); tag(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    tag(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i += 1) {
      const x = Math.max(-1, Math.min(1, d[i]));
      v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    }
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, { events: SRC.events, seconds: SECONDS });

  fs.writeFileSync(DIR + '/sfx.wav', Buffer.from(b64, 'base64'));
  console.log('sfx.wav', SRC.events.length, 'events', SECONDS.toFixed(2), 's');
} finally { clearTimeout(t); if (b) await b.close(); }
