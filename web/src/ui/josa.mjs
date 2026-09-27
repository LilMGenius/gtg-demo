// 수 뒤의 조사. 숫자는 읽는 소리의 끝 받침이 조사를 고른다. 3은 삼이라 '으로', 2는 이라 '로'다.
// ㄹ 받침(1 일, 7 칠, 8 팔)은 받침이 있어도 '로'를 받는다. 끝자리가 0이면 영, 십, 백, 천, 만의 끝 받침을 본다.
const LAST = { 0: 'ㅇ', 1: 'ㄹ', 2: '', 3: 'ㅁ', 4: '', 5: '', 6: 'ㄱ', 7: 'ㄹ', 8: 'ㄹ', 9: '' };
// 끝자리가 0인 수는 가장 작은 0 아닌 자리의 단위가 소리를 끝낸다. 십 ㅂ, 백 ㄱ, 천 ㄴ, 만 ㄴ.
const UNIT = ['ㅂ', 'ㄱ', 'ㄴ', 'ㄴ'];
const coda = (n) => {
  const s = String(Math.abs(Math.trunc(Number(n))));
  if (s === '0') return 'ㅇ';
  let zeros = 0;
  while (s[s.length - 1 - zeros] === '0') zeros += 1;
  return zeros ? UNIT[Math.min(zeros, 4) - 1] : LAST[s[s.length - 1]];
};
export const withRo = (n) => { const c = coda(n); return n + (c && c !== 'ㄹ' ? '으로' : '로'); };
