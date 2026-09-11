// 개봉 판을 걷는 하나의 손. 이 모양의 임자는 여기다. 계기 여섯이 각자 사본을 들고 있었고 아무것도
// 그 사본들이 서로 같은지 재지 않아서, 개봉 약속이 한 번 바뀌면 여섯 파일을 손으로 찾아야 했다.
//
// 누름 수로는 이 판을 못 걷는다. 짧은 누름은 한 단을 올릴 뿐이고, 단은 다섯이라(web/src/main.mjs의
// STAGE_MS) 열한 장을 그것으로 끝내려면 쉰다섯 번을 눌러야 한다. 실측으로 0.7초 간격 여섯 번은 열한 장
// 가운데 셋째 장 둘째 단에서, 0.5초 간격 여덟 번은 셋째 장 첫 단에서 끝났고 판은 그대로 서 있었다.
// 그래서 이것은 두드림이 아니라 붙듦이다. 문턱 LONG_MS 450보다 오래 붙들면 남은 것이 그 자리에서 전부
// 열리고, 뗀 뒤 한 번 누르는 것이 닫는다. 뗄 때 브라우저가 만드는 click은 제 일을 한 긴 누름의 것이라
// 제품이 삼키므로(main.mjs longDone) 닫는 누름은 따로 간다.
//
// 이 파일이 선언 꼴을 안 쓰고 const로 내보내는 것은 취향이 아니다. tools 안에서 그 꼴로 선언된
// clearDraw와 clearPull이 0인 것이 사본이 되살아났는지 묻는 한 줄짜리 계기다. 임자가 그 꼴을 쓰면
// 그 0이 1이 되고, 다음 사본은 2로만 읽힌다. 임자가 비켜 서 있어야 그 수가 사본의 수 그대로다.

// 카드가 지나는 다섯 단의 마지막 번호. 길이는 제품의 STAGE_MS가 정하고 계기는 그 수를 마주 든다.
export const STAGE_LAST = 4;
/* 긴 누름이 남은 것을 여는 것을 기다리는 상한. 제품 문턱이 0.45초라 여섯 배가 넘고,
   문턱이 아니라 상한이므로 초록 회차에서는 0.5초 언저리에 풀린다. */
const PRESS_MS = 3000;
// 마디 수의 상한. 첫 진입은 키퍼 한 장과 키커 열한 장 두 마디가 끝이고 상점 뽑기 한 번은 한 마디가
// 끝이다. 남는 자리는 손이 한 번 헛나갔을 때의 것이다.
const BEATS = 4;

// 닫힌 판은 누를 자리가 없다. 그 자리에서 한 번 더 누르면 오류로 끝나 결과 줄이 아예 안 남는다.
const standing = (page) => page.evaluate(() => { const e = document.getElementById("pull"); return Boolean(e) && !e.hidden; });

/* 붙들어 남은 것을 전부 연다. 손가락이 내려가 있는 동안 열리는 물건이라 누름과 뗌을 따로 보내고,
   열린 것을 보고 뗀다. */
export const pressOpen = async (page) => {
  if (!(await standing(page))) return false;
  const spot = await page.locator("#pull .tap").boundingBox();
  if (!spot) return false;
  await page.mouse.move(spot.x + spot.width / 2, spot.y + spot.height / 2);
  await page.mouse.down();
  await page.waitForFunction((last) => {
    const r = window.__reveal();
    return r.drawn > 0 && r.shown === r.drawn && r.stage === last;
  }, STAGE_LAST, { timeout: PRESS_MS, polling: "raf" }).catch(() => {});
  await page.mouse.up();
  return true;
};

// 열린 판을 한 번 눌러 닫는다.
export const tapClose = async (page) => {
  if (!(await standing(page))) return false;
  await page.click("#pull", { force: true });
  return true;
};

/* 판이 걷힐 때까지 마디를 되풀이한다. 첫 진입은 키퍼 한 장과 키커 열한 장이 두 마디로 이어 열리므로
   한 마디로는 안 끝난다. */
export const clearDraw = async (page) => {
  for (let beat = 0; beat < BEATS; beat += 1) {
    if (!(await standing(page))) return true;
    if (!(await pressOpen(page))) return false;
    await page.waitForTimeout(300);
    await tapClose(page);
    /* 닫히거나, 닫혀서 다음 마디가 이어 열리거나. 둘 중 하나가 설 때까지가 이 마디의 끝이다. */
    await page.waitForFunction(() => {
      const e = document.getElementById("pull");
      if (!e || e.hidden) return true;
      const r = window.__reveal();
      return r.drawn > 0 && r.shown < r.drawn;
    }, null, { timeout: PRESS_MS, polling: "raf" }).catch(() => {});
  }
  return !(await standing(page));
};
