// 고정 폭 시계를 손잡이가 생기는 즉시 켠다. 계기가 소유하지 않고 여기가 소유한다.
// 페이지가 뜬 뒤 evaluate로 켜면 그 전까지 흐른 실시간이 세계시각에 쌓이고, 대기 자세의
// 흔들림이 그 시각을 읽으므로 같은 코드로 두 번 돌려도 회차가 갈린다. gaze에서 실측으로
// 자세 거리가 세계시각 차이에 0.17 비례했고 대조군이 0.006에서 0.031까지 움직였다.
// 그 갈림은 기계가 바쁠수록 커져서, 조용한 기계에서 두 번 초록인 것은 안정의 증거가 아니다.
// 컨텍스트에 init 스크립트로 걸면 문서가 서기 전에 폴링이 시작되고 손잡이가 생기는 그 틱에 켜진다.
// 폴링 간격 0은 이벤트 루프 한 바퀴라, main.mjs가 손잡이를 다는 것과 같은 프레임 안이다.

export async function pinClock(ctx, step = 1 / 60) {
  await ctx.addInitScript((s) => {
    const t = setInterval(() => {
      if (window.__fixedStep) { window.__fixedStep(s); clearInterval(t); }
    }, 0);
  }, step);
}

