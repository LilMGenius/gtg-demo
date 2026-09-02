import { readdirSync, readFileSync, existsSync, writeFileSync, appendFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";

// 게이트를 한 번에 돌리고 결과를 모은다. 지금까지는 사람이 하나씩 불렀고,
// 그래서 어느 게이트가 마지막으로 언제 돌았는지 아무도 몰랐다.
// 기계가 읽는 계약은 마지막 줄 문장이 아니라 종료 코드다. 문장은 사람이 읽는다.

// 브라우저를 여는 게이트는 코어를 하나씩 먹고 수십 초가 든다. 소스가 스스로 말하게 두면
// 새 게이트를 넣을 때 이 목록을 고칠 일이 없다.
const isSlow = (src) => src.includes("playwright");

// 동시에 돌리면 시간을 재는 게이트가 자기 측정 창 안에서 죽어 거짓 빨간불을 낸다.
// 그래서 순차다. 대신 한 게이트가 매달리면 전체가 멈추므로 각자에게 사망 시각을 준다.
// 부하가 높은 날 한 게이트가 자기 상한을 다 쓰는다. 가장 긴 게이트의 상한보다 넣어야
// 러너가 멀지도 않은 게이트를 죽이고 그것을 실패로 읽지 않는다.
const CAP_MS = 240000;

const mode = process.argv[2] || "fast";
const all = readdirSync("tools").filter((f) => f.endsWith("-gate.mjs")).sort();
const picked = all.filter((f) => {
  const slow = isSlow(readFileSync("tools/" + f, "utf8"));
  return mode === "all" || (mode === "slow" ? slow : !slow);
});

// 느린 쓸기는 십 분이 넘어 커밋마다 겹칠 수 있다. 락은 이 파일이 소유한다.
// 훅이 락을 만들고 지우면 두 곳이 같은 상태를 들고 있다가 갈라진다.
const LOCK = "sweep.local.lock";
if (mode === "slow") {
  if (existsSync(LOCK)) {
    console.log("slow sweep already running");
    process.exit(0);
  }
  writeFileSync(LOCK, String(process.pid));
  const drop = () => { try { unlinkSync(LOCK); } catch {} };
  process.on("exit", drop);
  process.on("SIGINT", () => { drop(); process.exit(130); });
}
const NL2 = String.fromCharCode(10);
// 결과 파일도 러너가 소유한다. 훅이 리다이렉트하면 락에 막혀 즉시 죽는
// 둘째 러너가 그 파일을 먼저 비워 놓는다. 락을 통과한 뒤에만 열린다.
const OUT = mode === "slow" ? "sweep.local.txt" : null;
if (OUT) writeFileSync(OUT, "");
const say = (s) => { console.log(s); if (OUT) appendFileSync(OUT, s + NL2); };
say(mode + ": " + picked.length + " of " + all.length + " gates");

const red = [];
for (const f of picked) {
  const name = f.replace("-gate.mjs", "");
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ["tools/" + f], { encoding: "utf8", timeout: CAP_MS });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const code = r.status;
  // 타임아웃은 status가 null로 온다. 통과와 구분되지 않으면 매달린 게이트가 초록으로 읽힌다.
  const verdict = r.error && r.error.code === "ETIMEDOUT" ? "TIMEOUT" : code === 0 ? "pass" : "FAIL";
  if (verdict !== "pass") red.push(name + " " + verdict);
  // 마지막 비어 있지 않은 줄이 그 게이트가 사람에게 하는 말이다. 없으면 종료 코드만 남는다.
  const lines = (r.stdout || "").trim().split(NL2).filter((x) => x.trim());
  const spoken = lines.length ? lines[lines.length - 1].trim() : "(silent)";
  say("  " + verdict.padEnd(7) + name.padEnd(14) + secs.padStart(6) + "s  " + spoken.slice(0, 60));
  // 빨간불만 알리고 이유를 버리면 다음 사람이 그 게이트를 처음부터 다시 돌려야 한다.
  // 실패를 표시하는 말은 게이트마다 갈려 있고 통일하려면 마흔둘을 건드려야 한다.
  // 판정은 종료 코드가 하므로 여기서는 둘 다 받고, 어느 쪽도 없으면 끝부분을 그냥 옮긴다.
  if (verdict !== "pass") {
    const body = lines.slice(0, -1);
    const flagged = body.filter((x) => x.includes("FAIL") || x.includes("BAD"));
    const quote = flagged.length ? flagged.slice(0, 6) : body.slice(-4);
    for (const l of quote) say("           " + l.trim().slice(0, 96));
    const err = (r.stderr || "").trim();
    if (err) say("           stderr " + err.split(NL2)[0].slice(0, 90));
  }
}

say(red.length ? "gates FAIL " + red.length + ": " + red.join(", ") : "gates PASS " + picked.length);
if (red.length) process.exitCode = 1;
