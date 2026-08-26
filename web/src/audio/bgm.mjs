// BGM. 무한 루프, 기본 50%.
// 브라우저는 사용자 입력 전 재생을 막는다. 그래서 첫 입력을 기다렸다가 튼다.
const SRC = [
  ['audio/ogg; codecs=opus', 'assets/audio/bgm.ogg'],
  ['audio/mp4; codecs=mp4a.40.2', 'assets/audio/bgm.m4a'],
];
const KEY = 'gtg.bgm.volume';

export function mountBgm(base = '') {
  const el = new Audio();
  el.loop = true;
  el.preload = 'auto';
  const pick = SRC.find(([type]) => el.canPlayType(type)) ?? SRC[1];
  el.src = base + pick[1];

  const saved = Number(localStorage.getItem(KEY));
  el.volume = Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 0.5;

  // 탭 전환이나 잠깐의 끊김으로 죽지 않는다. 끄는 건 volume 0뿐이다.
  const resume = () => { if (el.paused) el.play().catch(() => {}); };
  el.addEventListener('pause', resume);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });

  const kick = () => {
    resume();
    if (!el.paused) {
      for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.removeEventListener(ev, kick);
    }
  };
  kick();
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(ev, kick);

  return {
    get volume() { return el.volume; },
    set volume(v) {
      el.volume = Math.min(1, Math.max(0, v));
      localStorage.setItem(KEY, String(el.volume));
    },
  };
}
