import { readFileSync, readdirSync, existsSync } from "node:fs";

// 에셋 원장 게이트. 배포 트리의 서체마다 라이선스 전문이 옆에 있는가.
// OFL은 서브셋과 재배포를 허용하지만 전문을 같이 실을 것을 요구한다. 실측으로 Pretendard는
// 지키고 Black Han Sans는 안 지키고 있었고, 그 한 줄이 F3 에셋 원장을 미확인으로 잡아 두고 있었다.
// 문서가 아니라 파일을 센다. 문서는 사람이 갱신을 잊고 파일은 없으면 없다.

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

const DIR = "web/assets/fonts";
const files = readdirSync(DIR);
const faces = files.filter((f) => /\.(ttf|otf|woff2?)$/i.test(f));
// 서체 이름은 파일명 첫 마디다. pretendard-regular.subset.woff2와 pretendard-bold.subset.woff2는 한 가족이다.
const family = (f) => f.split(/[-.]/)[0];
const families = [...new Set(faces.map(family))];

check("ledger:the-tree-carries-at-least-one-face", faces.length > 0, faces.length + " faces");
for (const fam of families) {
  // 라이선스 파일 이름은 가족명으로 시작하고 OFL로 끝난다. 그 규칙이 이 자가 세는 유일한 계약이다.
  const lic = files.find((f) => f.toLowerCase().startsWith(fam.toLowerCase()) && /ofl\.txt$/i.test(f));
  check("ledger:" + fam + ":carries-its-licence", Boolean(lic), lic || "no *OFL.txt beside " + fam);
  if (!lic) continue;
  const text = readFileSync(DIR + "/" + lic, "utf8");
  // 전문인지. OFL 1.1 본문의 첫 문장과 마지막 조항이 둘 다 있어야 잘린 사본이 아니다.
  const whole = text.includes("SIL Open Font License, Version 1.1") && text.includes("TERMINATION");
  check("ledger:" + fam + ":licence-is-the-whole-text", whole, text.length + " chars");
  // 머리말에 저작권 줄이 있어야 어느 서체의 사본인지가 파일 안에 남는다.
  check("ledger:" + fam + ":licence-names-a-copyright-holder", /^Copyright/m.test(text), (text.match(/^Copyright[^\n]*/m) || ["none"])[0].slice(0, 60));
}

// 대조군. 가족명이 다른 파일은 서로의 라이선스로 안 읽혀야 한다.
const cross = families.filter((a) => families.some((b) => a !== b && a.toLowerCase().startsWith(b.toLowerCase())));
check("control:no-family-name-is-a-prefix-of-another", cross.length === 0, cross.join(",") || "distinct");

console.log(notes.map((s) => "  ok   " + s).join("\n"));
if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
console.log(fails.length ? "ledger FAIL " + fails.length : "ledger PASS " + notes.length);
if (fails.length) process.exitCode = 1;

