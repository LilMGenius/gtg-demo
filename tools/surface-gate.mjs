import { readFileSync, existsSync, statSync } from "node:fs";

// 공개 표면 게이트. 스토어 제목과 페이지 title과 description과 OG가 서로 같은 말을 하는가.
// 실측으로 title은 3D가 빠져 있었고 OG는 셋 다 없었다. 링크를 공유하면 미리보기가 페이지와
// 다른 이름을 보여 주는 상태였다. 브라우저를 안 띄운다. 이 표면은 HTML 텍스트 그 자체다.

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);

const html = readFileSync("web/index.html", "utf8");
// 큰따옴표 속성만 본다. 이 파일은 속성을 전부 큰따옴표로 쓴다.
const attr = (re) => { const m = html.match(re); return m ? m[1] : ""; };
const title = attr(/<title>([^<]*)<\/title>/);
const desc = attr(/<meta name="description" content="([^"]*)"/);
const ogTitle = attr(/<meta property="og:title" content="([^"]*)"/);
const ogDesc = attr(/<meta property="og:description" content="([^"]*)"/);
const ogUrl = attr(/<meta property="og:url" content="([^"]*)"/);
const ogImage = attr(/<meta property="og:image" content="([^"]*)"/);
const ogW = attr(/<meta property="og:image:width" content="([^"]*)"/);
const ogH = attr(/<meta property="og:image:height" content="([^"]*)"/);

// 스토어 제목은 문서가 소유한다. 여기 옮겨 적으면 문서가 바뀐 날 자가 낡는다.
// 대신 title이 게임 이름 꼴인지만 본다. 한글 이름 뒤에 차원 표기가 붙은 꼴이다.
check("surface:the-page-has-a-title", title.length > 0, JSON.stringify(title));
check("surface:the-title-carries-the-dimension", /3D$/.test(title), JSON.stringify(title));
check("surface:og-title-equals-the-page-title", ogTitle === title, JSON.stringify(ogTitle) + " vs " + JSON.stringify(title));
check("surface:og-description-equals-the-meta-description", ogDesc === desc && desc.length > 0, ogDesc === desc ? desc.length + " chars" : "differ");
// 검색 결과와 미리보기가 자르는 자리다. 160자를 넘기면 뒷말이 잘린 채 나간다.
check("surface:the-description-fits-a-preview", desc.length > 40 && desc.length <= 160, desc.length + " chars");
check("surface:og-url-points-at-the-live-build", /^https:\/\/lilmgenius\.github\.io\/gtg-demo\//.test(ogUrl), JSON.stringify(ogUrl));
// 그림은 절대 주소여야 미리보기 크롤러가 읽는다. 그 주소가 가리키는 파일이 배포 트리에 실제로 있어야 하고,
// 선언한 크기가 OG 권장 1200x630이어야 한다. PNG 헤더의 IHDR에서 실제 크기를 읽어 선언과 맞댄다.
const local = ogImage.replace(/^https:\/\/lilmgenius\.github\.io\/gtg-demo\//, "");
const imgOk = local && existsSync(local);
check("surface:og-image-is-an-absolute-url-into-the-build", /^https:\/\/lilmgenius\.github\.io\/gtg-demo\/web\//.test(ogImage), JSON.stringify(ogImage));
check("surface:og-image-file-exists-in-the-tree", Boolean(imgOk), local || "(none)");
let real = { w: 0, h: 0 };
if (imgOk) {
  const head = readFileSync(local).subarray(0, 24);
  real = { w: head.readUInt32BE(16), h: head.readUInt32BE(20) };
}
check("surface:og-image-declares-its-real-size", imgOk && String(real.w) === ogW && String(real.h) === ogH, real.w + "x" + real.h + " declared " + ogW + "x" + ogH);
check("surface:og-image-is-the-recommended-1200x630", real.w === 1200 && real.h === 630, real.w + "x" + real.h);
// 미리보기 크롤러는 8MB를 넘는 그림을 버린다. 그 훨씬 아래에서 선을 긋는다.
check("surface:og-image-is-light-enough-to-fetch", imgOk && statSync(local).size < 1_000_000, imgOk ? statSync(local).size + " bytes" : "none");

// 대조군. 정규식이 실제로 잡는지. 없는 속성을 물으면 빈 문자열이어야 한다.
check("control:an-absent-tag-reads-as-empty", attr(/<meta property="og:nothing" content="([^"]*)"/) === "", "empty");
// 문서 쪽 200자 소개와 같은 문장인지. 문서를 파싱하지 않고 앞 열 자만 맞댄다.
// 문서가 바뀌면 이 열 자도 같이 바뀌어야 하므로 옮겨 적기가 아니라 앵커다.
check("surface:the-description-opens-like-the-store-blurb", desc.startsWith("축구를 하는 게임이 아니라"), desc.slice(0, 20));

console.log(notes.map((s) => "  ok   " + s).join("\n"));
if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
console.log(fails.length ? "surface FAIL " + fails.length : "surface PASS " + notes.length);
if (fails.length) process.exitCode = 1;
