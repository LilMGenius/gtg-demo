/* 계정. 지금까지 저장은 브라우저 하나에 하나뿐이라 같은 기기를 쓰는 두 사람이 한 판을 나눠 썼고,
   화면 어디에도 누가 하는 판인지가 없었다. 스토어에 올릴 물건에는 그 칸이 있어야 한다.
   구글과 애플 연동은 그 위에 얹는 것이고, 먼저 서야 하는 것은 계정이라는 개념 자체다.

   비밀번호는 평문으로 안 둔다. 로컬 저장이라 훔칠 사람이 이미 기기 앞에 있지만, 사람들은
   비밀번호를 재사용하므로 여기서 새는 것은 이 게임의 계정만이 아니다. 되돌릴 수 없는 값만 남긴다.
   이 해시는 서버가 쓸 물건이 아니다. 연동 로그인이 서면 이 파일이 통째로 그 뒤로 물러난다. */
const DIR = 'gtg.accounts.v1';
const NOW = 'gtg.session.v1';

// 아이디는 사람이 외우는 값이라 대소문자를 안 가린다. 앞뒤 공백은 오타지 이름이 아니다.
export function normalId(id) {
  return String(id || '').trim().toLowerCase();
}

/* 되돌릴 수 없는 값 하나. 같은 비밀번호가 두 계정에서 같은 값이 되지 않게 아이디를 섞는다.
   반복은 느리게 만들려는 것이다. 로컬이라 공격자가 시간을 다 쓸 수 있으므로 한 번 도는 해시는
   사전 대입을 못 막는다. 2003은 브라우저에서 한 번에 몇 밀리초라 로그인이 안 느려진다. */
export function hashPw(id, pw) {
  let h = 0x811c9dc5;
  // 아이디와 비밀번호 사이를 가르는 글자. 안 가르면 ab/c와 a/bc가 같은 씨앗이 된다.
  // 화면에 안 나오는 글자라 코드포인트로 만든다. 이스케이프로 적으면 파일이 안 읽힌다.
  const seed = normalId(id) + String.fromCharCode(0) + String(pw || '');
  for (let round = 0; round < 2003; round += 1) {
    for (let i = 0; i < seed.length; i += 1) {
      h ^= seed.charCodeAt(i) + round;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= h >>> 15;
  }
  return h.toString(16);
}

function readDir() {
  try {
    const raw = localStorage.getItem(DIR);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((a) => a && a.id && a.pw) : [];
  } catch {
    return [];
  }
}

function writeDir(list) {
  try { localStorage.setItem(DIR, JSON.stringify(list)); } catch { /* 사파리 프라이빗 모드 */ }
}

export function accountAt(id) {
  const key = normalId(id);
  return readDir().find((a) => a.id === key) || null;
}

/* 가입. 아이디가 이미 있으면 거절한다. 덮어쓰면 남의 판이 사라진다.
   닉네임은 화면에 서는 이름이라 아이디와 따로 받는다. 비면 아이디를 그대로 쓴다. */
export function signUp(id, pw, nick) {
  const key = normalId(id);
  if (key.length < 2) return { ok: false, why: '아이디는 두 글자 이상이다' };
  if (String(pw || '').length < 4) return { ok: false, why: '비밀번호는 네 글자 이상이다' };
  if (accountAt(key)) return { ok: false, why: '이미 있는 아이디다' };
  const list = readDir();
  list.push({ id: key, pw: hashPw(key, pw), nick: String(nick || '').trim() || key, at: Date.now() });
  writeDir(list);
  return { ok: true, id: key };
}

export function logIn(id, pw) {
  const acc = accountAt(id);
  if (!acc) return { ok: false, why: '없는 아이디다' };
  if (acc.pw !== hashPw(acc.id, pw)) return { ok: false, why: '비밀번호가 다르다' };
  return { ok: true, id: acc.id };
}

// 지금 로그인한 사람. 디렉터리에서 사라진 아이디는 안 돌려준다.
export function currentId() {
  try {
    const id = localStorage.getItem(NOW) || '';
    return accountAt(id) ? normalId(id) : null;
  } catch {
    return null;
  }
}

export function setCurrent(id) {
  try {
    if (id) localStorage.setItem(NOW, normalId(id));
    else localStorage.removeItem(NOW);
  } catch { /* 위와 같다 */ }
}

export function nickOf(id) {
  const acc = accountAt(id);
  return acc ? acc.nick : null;
}

/* 손님. 계정 없이 시작 버튼을 누른 사람에게 그 자리에서 붙는 계정이다.
   판 구분과 저장 분리는 이것으로도 그대로 서고, 이름은 나중에 타이틀에서 정한다.
   비밀번호는 사람이 모르는 값이라 이 계정으로는 다른 기기에서 못 들어온다.
   그것이 이름을 정하라는 이유이고, 정하는 순간 제대로 된 계정으로 갈아탄다. */
export function guestUp() {
  const id = 'guest-' + Math.random().toString(36).slice(2, 8);
  const list = readDir();
  list.push({ id, pw: hashPw(id, String(Math.random())), nick: '손님', guest: true, at: Date.now() });
  writeDir(list);
  return { ok: true, id };
}

export function isGuest(id) {
  const acc = accountAt(id);
  return Boolean(acc && acc.guest);
}
