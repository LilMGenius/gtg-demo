/* 굴릴 것이 남았다는 자국. 칸은 굴러가지만 화면에는 그 사실이 하나도 안 적혀 있었다.
   실측으로 위키 본문은 740x360에서 여덟 칸이 전부 넘쳤고, 내 정보의 전적 칸은 1280x720에서
   243px 자리에 700px을 담아 상대 전적 표가 통째로 접힘 아래 있었다. 아래끝 그늘이 남은 것이
   있다는 말이고, 끝까지 굴리면 그 그늘이 꺼지고 위끝으로 옮겨 간다. 1px은 굴림값이 소수로
   남는 자리를 넘기는 폭이다. 두 창이 한 함수를 쓴다. 따로 적으면 한쪽만 고친 날 둘이 갈린다.
   구르는 것은 감싼 상자가 아니라 그 안의 칸이라, 신호 둘이 아닌 첫 자식이 그 칸이다.
   다만 늘 그렇지는 않다. 세로가 짧으면 칸의 상한이 걷혀 칸이 안 구르고 창이 스스로 구른다.
   그때는 구르는 것을 밖에서 받는다. 안 받으면 첫 자식인 제목 줄을 재게 되어 넘침이 늘 0이고
   신호가 영영 안 켜진다. 신호는 감싼 상자의 자식에서만 찾는다. 창을 상자로 넘기면 그 안에
   칸의 신호가 같이 들어 있어, 안 좁히면 창의 신호 대신 칸의 것을 두 번 켠다.
   그늘은 감춘 것보다 더 많이 가리지 않는다. 감춘 것이 그늘의 높이보다 얇으면 그 높이를 감춘
   만큼으로 줄여서 켠다. 26px을 그대로 켜면 그 겹이 감춘 것보다 두꺼워 버튼만 흐려지고, 그렇다고
   안 켜면 아래에 더 있다는 말이 화면에 한 군데도 안 남는다. 실측으로 740x400의 훈련장은 14px을
   감춘 채 닫기 버튼을 접힘 밖 2.45px에 세우고, 1280x720의 내 정보는 16px을 감춘다. 둘 다 신호가
   꺼져 있었다. 높이를 여기 상수로 안 적고 그려진 값을 읽는 것은 그 수가 CSS 한 곳에만 있어야
   하기 때문이다. 읽기 전에 붙여 둔 높이를 먼저 걷는다. 안 걷으면 줄여 둔 값을 상한으로 되읽어
   한 번 줄어든 그늘이 다시 안 큰다. */
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
