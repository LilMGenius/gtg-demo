// 타이틀. 판을 열기 전에 누구인지부터 묻는다. 게임은 시작 버튼을 눌러야 돌고,
// 브라우저 자동재생 정책도 그 한 번의 입력으로 같이 풀린다.
import { signUp, logIn, currentId, setCurrent, nickOf, guestUp } from '../state/account.mjs';
import { useAccount, hasLegacy, adoptLegacy } from '../state/save.mjs';

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

  const gate = document.getElementById('gate');
  const go = document.getElementById('go');
  const who = gate.querySelector('.who');
  const say = document.getElementById('asay');
  const id = document.getElementById('aid');
  const pw = document.getElementById('apw');
  const nick = document.getElementById('anick');
  const inBtn = document.getElementById('ain');
  const upBtn = document.getElementById('aup');

  /* 가입 칸과 로그인 칸은 같은 자리를 쓴다. 폼 둘을 나란히 세우면 처음 온 사람이
     어느 쪽에 적어야 하는지를 먼저 골라야 한다. 닉네임 칸이 열려 있으면 가입이다. */
  let mode = 'in';
  const tell = (t) => { say.textContent = t || ''; say.hidden = !t; };
  const setMode = (m) => {
    mode = m;
    nick.hidden = m !== 'up';
    inBtn.textContent = m === 'up' ? '가입하고 시작' : '로그인';
    upBtn.textContent = m === 'up' ? '로그인으로' : '가입';
    tell('');
  };

  /* 로그인한 사람이 있으면 계정 칸이 이름만 세우고 시작은 원래 버튼이 맡는다.
     시작 버튼은 어떤 상태에서도 이 화면의 유일한 문이다. 로그인 폼이 그 앞을 막으면
     계기 아흔 곳이 사람과 다른 문으로 들어가게 되고, 그때부터 계기가 재는 것은 사람이 겪는 판이 아니다.
     계정 없이 누르면 그 자리에서 손님 계정이 서고, 이름은 나중에 이 화면에서 정한다. */
  const paint = () => {
    const cur = currentId();
    if (cur) {
      useAccount(cur);
      who.textContent = nickOf(cur) + ' 님';
      who.hidden = false;
      gate.hidden = false;
      id.hidden = true;
      pw.hidden = true;
      nick.hidden = true;
      inBtn.textContent = '이름 바꾸기';
      upBtn.textContent = '로그아웃';
      mode = 'ready';
    } else {
      who.hidden = true;
      gate.hidden = false;
      id.hidden = false;
      pw.hidden = false;
      setMode('in');
    }
  };

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    title.hidden = true;
    document.body.classList.add('playing');
    onStart();
  };

  /* 계정이 바뀌면 판을 새로 연다. main은 맨 위에서 저장을 한 번 읽고 그 값으로 상태를 세우므로,
     이미 선 상태 위에 다른 사람을 얹으면 앞 사람의 키퍼가 그대로 남는다. */
  const reopen = () => { location.reload(); };

  gate.onsubmit = (e) => {
    e.preventDefault();
    // 이미 들어와 있는 사람이 이름을 바꾸려면 가입 칸을 다시 연다. 새 아이디로 갈아타는 길이다.
    if (mode === 'ready') { who.hidden = true; id.hidden = false; pw.hidden = false; return setMode('up'); }
    if (mode === 'up') {
      const made = signUp(id.value, pw.value, nick.value);
      if (!made.ok) return tell(made.why);
      /* 이름 없던 자리에 판이 남아 있으면 첫 가입이 그것을 물려받는다. 계정이 생기기 전에
         시작한 사람의 판이 가입했다고 사라지면 안 된다. 두 번째 계정부터는 새 판이다. */
      if (hasLegacy()) adoptLegacy(made.id);
      setCurrent(made.id);
      return reopen();
    }
    const got = logIn(id.value, pw.value);
    if (!got.ok) return tell(got.why);
    setCurrent(got.id);
    reopen();
  };

  upBtn.onclick = () => {
    if (mode === 'ready') {
      setCurrent(null);
      return reopen();
    }
    setMode(mode === 'up' ? 'in' : 'up');
  };

  /* 계정이 없으면 손님으로 연다. 첫 화면이 로그인 폼이면 방치형에서 그 자리가 이탈 지점이 되고,
     계정의 목적인 판 구분은 손님 계정으로도 그대로 선다. 이름은 언제든 위 칸에서 붙인다. */
  go.onclick = () => {
    if (!currentId()) {
      const made = guestUp();
      if (made.ok) {
        if (hasLegacy()) adoptLegacy(made.id);
        setCurrent(made.id);
        useAccount(made.id);
      }
    }
    start();
  };
  paint();
}
