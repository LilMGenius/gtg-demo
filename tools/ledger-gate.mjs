import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 에셋 원장 게이트. 배포 파일의 출처와 권리, 서체 옆의 라이선스 전문을 센다.
// OFL은 서브셋과 재배포를 허용하지만 전문을 같이 실을 것을 요구한다. 실측으로 Pretendard는
// 지키고 Black Han Sans는 안 지키고 있었고, 그 한 줄이 F3 에셋 원장을 미확인으로 잡아 두고 있었다.
// 문서가 아니라 파일을 센다. 문서는 사람이 갱신을 잊고 파일은 없으면 없다.

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const ASSETS = resolve(ROOT, "web/assets");
const DIR = resolve(ASSETS, "fonts");
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

// Node의 readdirSync recursive API로 배포 파일을 센다. 별도 순회기 없이 확장자만 고른다.
const shipped = readdirSync(ASSETS, { recursive: true }).map((p) => p.replaceAll("\\", "/"))
  .filter((p) => /\.(png|jpe?g|gif|webp|svg|glb|gltf|mp3|ogg|m4a|wav|ttf|otf|woff2?)$/i.test(p)
    && statSync(resolve(ASSETS, p)).isFile()).sort();
const rows = JSON.parse(readFileSync(resolve(ASSETS, "ledger.json"), "utf8"));
const validRows = Array.isArray(rows) && rows.every((r) => r && typeof r.path === "string"
  && typeof r.origin === "string" && r.origin.trim().length > 0
  && ["self", "OFL-1.1", "unconfirmed", "commercial-free"].includes(r.rights)
  && typeof r.form === "string" && r.form.trim().length > 0);
check("ledger:rows-have-the-required-fields", validRows, "path, origin, rights, form");
if (validRows) {
  const missingRows = (paths, entries) => paths.filter((p) => !entries.some((r) => r.path === p));
  const missing = missingRows(shipped, rows);
  const stale = rows.filter((r) => !shipped.includes(r.path)).map((r) => r.path);
  check("ledger:every-shipped-asset-has-a-row", missing.length === 0, missing.join(", ") || shipped.length + " files");
  check("ledger:every-row-points-at-a-shipped-file", stale.length === 0, stale.join(", ") || rows.length + " rows");
  check("ledger:each-asset-has-one-row", new Set(rows.map((r) => r.path)).size === rows.length, rows.length + " rows");
  for (const row of rows) {
    const name = basename(row.path);
    if (row.rights === "self") {
      const generator = resolve(ROOT, row.origin);
      const local = relative(ROOT, generator);
      check("ledger:" + name + ":generator-exists", !isAbsolute(row.origin) && !isAbsolute(local)
        && local !== ".." && !local.startsWith("../") && !local.startsWith("..\\")
        && existsSync(generator) && statSync(generator).isFile(), row.origin);
    }
    if (row.rights === "OFL-1.1") {
      const beside = resolve(ASSETS, dirname(row.path));
      const lic = shipped.includes(row.path) && /\.(ttf|otf|woff2?)$/i.test(extname(row.path))
        && readdirSync(beside).find((f) => f.toLowerCase().startsWith(family(name).toLowerCase()) && /ofl\.txt$/i.test(f));
      check("ledger:" + name + ":carries-its-licence", Boolean(lic), lic || "no *OFL.txt beside " + row.path);
    }
    if (row.rights === "commercial-free") {
      // 출처 이름이 있어야 상업용 무료 확인을 특정 원작자에게 연결할 수 있다.
      const sourceName = /(?:^|[,;]\s*)(?:ID3 artist|source)\s+[^,;\s][^,;]*/i;
      // 이용 조건과 확인 날짜가 한 절에 있어야 권리 판단의 근거를 다시 읽을 수 있다.
      const licenceClause = /(?:상업용 무료|commercial-free)[^;]*\b\d{4}-\d{2}-\d{2}\b/i;
      check("ledger:" + name + ":origin-names-a-source", sourceName.test(row.origin), row.origin);
      check("ledger:" + name + ":origin-carries-a-dated-licence", licenceClause.test(row.origin), row.origin);
    }
    check("ledger:" + name + ":rights-are-confirmed", row.rights !== "unconfirmed", row.origin);
  }
  // 같은 누락 판정에 원장에 없는 가상 파일을 넣어 빨간불이 켜지는지 잰다. 디스크에는 쓰지 않는다.
  const probe = "control/lg-unlisted.local.png";
  const controlMissing = missingRows([probe], []);
  check("control:an-unlisted-shipped-asset-fails-the-row-check", controlMissing.length === 1 && controlMissing[0] === probe,
    "ledger:every-shipped-asset-has-a-row predicate=false missing=" + controlMissing.join(", "));
}

console.log(notes.map((s) => "  ok   " + s).join("\n"));
if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
console.log(fails.length ? "ledger FAIL " + fails.length : "ledger PASS " + notes.length);
if (fails.length) process.exitCode = 1;
