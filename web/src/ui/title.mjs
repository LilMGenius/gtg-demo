// 타이틀. 게임은 시작 버튼을 눌러야 돈다.
// 브라우저 자동재생 정책도 이 한 번의 입력으로 같이 풀린다.
export function mountTitle(onStart) {
  const title = document.getElementById('title');
  const btn = document.getElementById('helpBtn');
  const panel = document.getElementById('helpPanel');

  const setOpen = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  };
  btn.onclick = (e) => { e.stopPropagation(); setOpen(panel.hidden); };
  document.addEventListener('pointerdown', (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) setOpen(false);
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    title.hidden = true;
    document.body.classList.add('playing');
    onStart();
  };
  document.getElementById('go').onclick = start;
}
