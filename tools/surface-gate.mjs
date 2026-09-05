import { readFileSync } from "node:fs";

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

// 스토어 제목은 문서가 소유한다. 여기 옮겨 적으면 문서가 바뀐 날 자가 낡는다.
// 대신 title이 게임 이름 꼴인지만 본다. 한글 이름 뒤에 차원 표기가 붙은 꼴이다.
check("surface:the-page-has-a-title", title.length > 0, JSON.stringify(title));
check("surface:the-title-carries-the-dimension", /3D$/.test(title), JSON.stringify(title));
check("surface:og-title-equals-the-page-title", ogTitle === title, JSON.stringify(ogTitle) + " vs " + JSON.stringify(title));
check("surface:og-description-equals-the-meta-description", ogDesc === desc && desc.length > 0, ogDesc === desc ? desc.length + " chars" : "differ");
// 검색 결과와 미리보기가 자르는 자리다. 160자를 넘기면 뒷말이 잘린 채 나간다.
check("surface:the-description-fits-a-preview", desc.length > 40 && desc.length <= 160, desc.length + " chars");
check("surface:og-url-points-at-the-live-build", /^https:\/\/lilmgenius\.github\.io\/gtg-demo\//.test(ogUrl), JSON.stringify(ogUrl));

// 대조군. 정규식이 실제로 잡는지. 없는 속성을 물으면 빈 문자열이어야 한다.
check("control:an-absent-tag-reads-as-empty", attr(/<meta property="og:nothing" content="([^"]*)"/) === "", "empty");
// 문서 쪽 200자 소개와 같은 문장인지. 문서를 파싱하지 않고 앞 열 자만 맞댄다.
// 문서가 바뀌면 이 열 자도 같이 바뀌어야 하므로 옮겨 적기가 아니라 앵커다.
check("surface:the-description-opens-like-the-store-blurb", desc.startsWith("축구를 하는 게임이 아니라"), desc.slice(0, 20));

console.log(notes.map((s) => "  ok   " + s).join("\n"));
if (fails.length) console.log(fails.map((s) => "  FAIL " + s).join("\n"));
console.log(fails.length ? "surface FAIL " + fails.length : "surface PASS " + notes.length);
if (fails.length) process.exitCode = 1;

