// 퇴역한 내보내기. 게이트가 얼린 부모의 main.mjs를 지금 모듈 위에 띄우는 대조군이 여럿이다.
// 지금 모듈이 무언가를 지우면 그 부모가 import에서 죽어 대조군이 통째로 사라지고, 게이트는 그 사실 없이 타임아웃으로 빨개진다.
// 지운 것은 여기 한 곳에만 적는다. 게이트는 부모를 띄울 때 serveRetired로 지금 모듈에 그 줄을 덧붙여 준다.
// 제품은 이 줄을 안 읽는다. 대조군을 살리는 자리일 뿐이다.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// 파일마다 지운 이름과 그 값을 읽어 올 커밋. 값은 그 커밋의 원문에서 뽑아 옮겨 적지 않는다.
const RETIRED = {
  "web/src/state/wallet.mjs": [{ name: "COIN_DRILL", rev: "9566a7e" }]
};

export function retiredLines(file) {
  return (RETIRED[file] || []).map(({ name, rev }) => {
    const src = execFileSync("git", ["show", rev + ":" + file], { cwd: ROOT, encoding: "utf8" });
    const m = src.match(new RegExp("export const " + name + " = [^;\\n]+;"));
    if (!m) throw new Error(name + " not found in " + rev + ":" + file);
    return m[0];
  });
}

// 지금 파일에 퇴역한 줄을 덧붙인 본문. 부모 대조군만 이것을 받는다.
export function withRetired(file) {
  return readFileSync(ROOT + file, "utf8") + "\n" + retiredLines(file).join("\n") + "\n";
}

export async function serveRetired(page) {
  for (const file of Object.keys(RETIRED)) {
    const body = withRetired(file);
    await page.route("**/" + file, (r) => r.fulfill({ contentType: "text/javascript; charset=utf-8", body }));
  }
}
