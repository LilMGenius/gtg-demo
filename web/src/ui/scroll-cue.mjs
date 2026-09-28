/* 굴러가는 창의 그늘 신호. 넘침이 있고 끝에 안 닿았으면 아래 그늘을, 굴렸으면 위 그늘을 켠다.
   살아 있는 값만 읽어 몇 번 불러도 같은 답이다. 창마다 같은 함수를 쓴다. */
export function scrollCue(wrap, roll) {
  if (!wrap) return;
  const body = roll || wrap.querySelector(':scope > :not(.cue)');
  if (!body) return;
  const over = body.scrollHeight - body.clientHeight;
  const at = body.scrollTop;
  const down = wrap.querySelector(':scope > .cue.down');
  const up = wrap.querySelector(':scope > .cue.up');
  if (down) down.style.height = '';
  if (up) up.style.height = '';
  const lip = Math.max(down ? down.offsetHeight : 0, up ? up.offsetHeight : 0);
  const fit = over > 0 && over <= lip ? over + 'px' : '';
  if (down) { down.style.height = fit; down.style.opacity = at < over - 1 ? '1' : '0'; }
  if (up) { up.style.height = fit; up.style.opacity = over > 0 && at > 1 ? '1' : '0'; }
}
