import { execFileSync } from "child_process";

// 고아 브라우저 게이트. 죽은 게이트가 남긴 헤드리스 크롬을 센다.
// 이 자가 없던 동안 이틀치 열 그루가 쌓여 크롬 프로세스 예순여덟 중 쉰이 그것이었고,
// 시간을 재는 모든 게이트가 그 짐을 진 기계에서 측정됐다. aim의 워치독을 300에서 600으로
// 올린 근거였던 실측 488초도 그 상태의 수다. 결함을 재는 자가 없으면 결함이 문턱이 된다.
// 브라우저를 안 띄운다. 이 자가 느린 판으로 밀리면 커밋마다 못 보고, 못 보는 사이에 쌓인다.

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

// 고아의 정의는 시간이 아니라 혈통이다. 문턱을 쓰면 오래 도는 게이트의 정상 브라우저가 걸린다.
// 크롬의 부모는 그것을 띄운 node이고, 그 node가 죽으면 부모 PID가 산 프로세스를 안 가리킨다.
// 렌더러의 부모는 살아 있는 크롬이라 안 걸린다. 걸리는 것은 띄운 자가 사라진 우두머리뿐이다.
export function orphansIn(rows, livePids) {
  const live = new Set(livePids);
  return rows.filter((r) => r.headless && !live.has(r.ppid));
}

const PS = "Get-CimInstance Win32_Process | ForEach-Object { \"{0},{1},{2},{3}\" -f $_.ProcessId, $_.ParentProcessId, $_.Name, [int]($_.CommandLine -like '*--headless*') }";

function scan() {
  const out = execFileSync("powershell", ["-NoProfile", "-Command", PS], { encoding: "utf8", maxBuffer: 1 << 24 });
  const rows = [], pids = [];
  for (const line of out.split(/\r?\n/)) {
    const p = line.split(",");
    if (p.length < 4) continue;
    const pid = Number(p[0]), ppid = Number(p[1]);
    if (!Number.isFinite(pid)) continue;
    pids.push(pid);
    if (p[2] === "chrome.exe") rows.push({ pid, ppid, headless: p[3].trim() === "1" });
  }
  return { rows, pids };
}

const { rows, pids } = scan();

// 실측. 지금 이 기계에 띄운 자가 사라진 헤드리스 크롬이 있는가.
const found = orphansIn(rows, pids);
check("orphan:none-left-behind", found.length === 0,
  found.length + " orphaned of " + rows.filter((r) => r.headless).length + " headless, pids [" + found.map((r) => r.pid).join(",") + "]");

// 대조군 하나. 0이 없다는 뜻인지 못 잰다는 뜻인지를 가른다.
// 부모가 죽은 헤드리스 한 줄을 넣으면 반드시 하나가 잡혀야 한다.
const dead = orphansIn([{ pid: 1, ppid: 999999, headless: true }], [1]);
check("control:a-dead-parent-is-caught", dead.length === 1, String(dead.length));

// 대조군 둘. 살아 있는 부모를 둔 헤드리스는 안 잡혀야 한다. 돌고 있는 게이트의 브라우저가
// 여기 걸리면 이 자는 쓸기 도중에 매번 빨개져서 아무도 안 보게 된다.
const alive = orphansIn([{ pid: 1, ppid: 2, headless: true }], [1, 2]);
check("control:a-live-parent-is-spared", alive.length === 0, String(alive.length));

// 대조군 셋. 헤드리스가 아닌 크롬은 사람의 브라우저다. 부모가 뭐든 손대지 않는다.
const human = orphansIn([{ pid: 1, ppid: 999999, headless: false }], [1]);
check("control:an-interactive-browser-is-never-counted", human.length === 0, String(human.length));

// 스캐너가 실제로 프로세스를 읽고 있는지. 표가 비면 위의 실측 0은 아무 뜻이 없다.
check("scanner:reads-the-process-table", pids.length > 20, pids.length + " processes seen");

console.log(notes.map((s) => "  ok   " + s).join("\n"));
if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
console.log(fails.length ? "orphan FAIL " + fails.length : "orphan PASS " + notes.length);
if (fails.length) process.exitCode = 1;

