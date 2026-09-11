// 카툰 렌더 층을 재는 자. 재질 이름도 조명 개수도 안 읽는다. 찍힌 화소만 읽는다.
// 유니폼 밴드는 키퍼만 남긴 화면에서, 그림자는 캐스터를 뺀 짝 프레임의 차분에서,
// 확대 배율은 같은 자리의 가로 런 길이에서 잰다.
//
// 진행은 벽시계가 아니라 프레임이다. 잠으로 기다리다 얼리면 회차마다 다른 프레임이 얼고,
// 실측으로 같은 사건의 그림자가 854와 1431 화소로 갈려 다섯 번에 두 번 빨간불이 났다.
// 시계를 고정 폭으로 못 박고(clock.mjs pinClock) 사건을 걸 프레임과 세계를 멈출 프레임을
// 페이지에 한 번에 맡기면(window.__plan) 같은 프레임이 언다. 판 안의 편차도 ?vary=0으로 끈다.
//
// 그렇게 못 박고 남는 것이 무엇인지도 재 뒀다. 흔들림을 박고 임팩트 층을 내린 뒤 같은 계획을 두
// 프로세스에서 돌리면 세계는 같은 자리에 선다. vnow와 키퍼와 공의 좌표가 소수 넷째 자리까지 같다.
// 그런데 화면 png의 해시는 여전히 갈린다. 래스터가 프로세스 사이에서 비트까지 같지는 않다는 뜻이다.
// 큰 그늘은 그 잡음보다 두꺼워 세 회차가 같은 수를 내고, 가장 작은 그늘 둘(뛰쳐나간 키퍼, 470에서
// 490 화소대)만 문턱 8 언저리에 걸친 화소 다섯쯤이 회차마다 뒤집힌다. 실측 세 회차: 471/475/471과
// 484/488/483. 바 400에 대해 17퍼센트 여유라 판정은 안 흔들린다.
// 문턱을 옮겨 수를 굳히는 대신 그 폭을 여기 적는다. 어느 문턱에도 경계는 있고, 옮기면 경계만 옮긴다.
//
// 표본 범위: 사건 셋(save, distracted, charge) x 두 모드(384 확대 기본, ?pix=0 풀해상), 1280x720.
// 740x360은 바 없이 판 크기만 적는다. 그 폭에서는 타깃이 캔버스보다 커서 확대가 축소로 뒤집힌다.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pinClock } from "./clock.mjs";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const EXE = process.env.LOCALAPPDATA + "/ms-playwright/chromium-1228/chrome-win64/chrome.exe";
// 편차를 끈 씨드 고정 판. vary는 꼬리 연출의 회차 편차라, 켜 두면 같은 사건이 회차마다 다른 몸이 된다.
const BASE = "http://127.0.0.1:10310/web/index.html?seed=20&vary=0";
const W = 1280;
const H = 720;
// 모바일 하한. 여기서는 판정하지 않고 타깃과 캔버스 크기만 적는다.
const MW = 740;
const MH = 360;
// 사건 셋. 선방과 한눈팔기와 뛰쳐나가기는 자세도 서 있는 자리도 갈린다.
const EVENTS = ["save", "distracted", "charge"];
// 되돌릴 판. HEAD로 걸면 이 게이트를 담은 커밋이 들어오는 순간 대조군이 자기 자신을 자기와 맞대고
// 조용히 초록이 된다. 실측으로 ce34afa가 들어온 뒤 --was가 PASS 31을 냈다. 그래서 판을 못 박는다.
// --was=<rev>로 덮어쓸 수 있고, 어느 rev든 살아 있는 파일과 같으면 아래에서 계측 사망으로 끊는다.
const WAS_REV = (process.argv.find((a) => a.startsWith("--was=")) || "--was=00b06d9").slice(6);
const WAS = process.argv.some((a) => a === "--was" || a.startsWith("--was="));
const LAYER = ["web/src/render/scene.mjs", "web/src/render/units.mjs",
  "web/src/render/handmade.mjs", "web/src/render/objects/pitch.mjs"];

// 고정 폭 시계. 60분의 1이면 프레임 수가 곧 세계시간이다.
const STEP = 1 / 60;
// 사건을 걸기 전에 세계가 도는 프레임. 잠근 판에서 키퍼가 대기 자세로 서는 시간이다.
const LEAD = 30;
// 사건을 걸고 멈추기까지의 프레임. 0.9초이고, 꼬리가 자세를 다 잡은 뒤의 한 컷이다.
const TAIL = 54;
/* 첫 사건을 거는 절대 프레임. 프레임 수가 곧 세계시간이므로 이 수가 첫 정지 프레임의 세계시각을
   못 박는다. 상대(지금 프레임 + LEAD)로 걸면 그 지금이 개봉 카드가 몇 프레임에 눌렸는지를 따라
   회차마다 달라지고, 행인 자리와 대기 자세가 같이 밀린다. 둘째 사건부터는 세계가 멈춰 있는 동안
   프레임만 흐르므로 상대로 걸어도 도는 프레임 수가 LEAD + TAIL로 같다.
   실측: 카드 두 마디를 지나 첫 예약이 걸리는 프레임이 150 언저리라 240은 1.5초 여유다. */
const ANCHOR = 240;

// 상의 초록만 고른다. 살갗과 장갑은 R이, 양말과 소매와 반바지는 B가 최대라 G가 최대인 화소는 상의뿐이다.
// 셰이더가 밝기만 끊고 색비는 그대로 곱하므로 이 부호는 조명과 포스터라이즈를 지나도 남는다.
const GREEN_R = 16;
const GREEN_B = 8;
// 한 면을 재려면 표본이 면이어야 한다. 실측: 키퍼만 남긴 화면에서 상의가 가진 화소가 사건별로 1700에서 4600이었다.
const UNIFORM_MIN = 300;
// 옷감 무늬를 걷는 반경. 상의 텍스처는 흰 바탕에 어두운 줄을 그은 것이라, 국소 최대값을 취하면
// 줄이 걷히고 조명 단만 남는다. 실측: 반경 4는 무늬와 함께 어두운 단까지 지웠고(봉 셋이 둘로),
// 2는 무늬만 걷었다. 줄 폭은 화면에서 두 화소 안쪽이다.
const CLOTH_R = 2;
/* 봉의 개수 범위. 정확히 셋은 렌더러가 보장하는 수가 아니다. 방향광 둘이 같은 램프로 각자 끊기고
   반구광은 three의 toon 경로에서 안 끊긴다. 카메라가 보는 면에서 림의 dotNL은 최대 0.44라
   램프의 두 번째 칸까지만 닿으므로, 한 컷이 가질 수 있는 덩어리는 키 셋 곱하기 림 둘까지다.
   아래는 컷마다 그 상한을 대고, 셋이 다 서는지는 사건 셋을 합친 면에서 묻는다.
   한 컷의 하한이 둘인 이유도 렌더러다. 자세가 등을 한 방향만 보여 주면 그 면은 dotNL이
   경계 둘을 다 넘지 못한다. 실측: 한눈판 컷이 둘, 선방이 셋, 뛰쳐나간 컷이 넷을 냈다.
   부모 판(램버트 + 전경 5단)은 어느 컷에서도 둘이고 합친 면에서도 둘이라, 하한 셋이 그 판을 거른다. */
const MODES_MIN = 3;
const MODES_MAX = 6;
const EVENT_MODES_MIN = 2;
// 봉 하나가 표본의 이만큼은 가져야 한다. 그 아래는 밴드 경계에 걸친 화소 몇 개다.
const PEAK_SHARE = 0.04;
// 봉 사이 최소 거리. 이보다 붙어 있으면 한 봉의 어깨다.
const PEAK_SEP = 10;
// 히스토그램을 이 폭으로 훑어 고른다. 낱값 요철을 봉으로 세지 않기 위한 창이다.
const SMOOTH = 3;
// 그림자 차분 문턱. 이만큼 안 어두워진 화소는 그늘이 아니라 화면 잡음이다.
const SHADOW_DROP = 8;
/* 점점이 끊긴 차분을 잇는 반경. 기본값은 2였고 4로 올렸다. 그늘이 흙을 한 칸 내리는 폭은 휘도 21인데
   한 칸이 28이라, 베이어 무늬가 어느 화소를 경계 너머로 밀었는지에 따라 넷 중 하나쯤은 같은 칸에 남는다.
   그 구멍은 무늬 칸 하나만큼 크고, 384 타깃을 늘린 화면에서 한 칸은 네 텍셀 곱하기 1.87화소다.
   실측: 반경 2로는 뛰쳐나간 키퍼의 그늘 582화소가 400 밑의 조각들로 끊겼다. */
const SHADOW_LINK = 4;
// 키퍼 그림자 최소 면적. 한 덩이가 이만큼은 돼야 발밑 얼룩과 구분이 된다.
const SHADOW_MIN = 400;
/* 가림막을 건너 잇는다. 그늘은 바닥에 한 장으로 이어져 있어도 그 앞에 선 공과 다리가 화면에서
   그것을 자른다. 실측으로 뛰쳐나간 키퍼의 그늘 473화소 가운데 297화소만 한 덩이였고, 끊은 것은
   그늘의 구멍이 아니라 그 위에 놓인 공이었다. 그래서 잇는 것은 가려진 화소이고, 세는 것은
   그늘 화소뿐이다. 면적은 부풀지 않고 이어짐만 통과한다. 사이가 볕 든 바닥이면 안 잇는다.
   훑는 간격 4는 공 지름의 5분의 1이라 원 하나를 놓치지 않는 굵기다. */
const OCC_STEP = 4;
// 공은 probeIgnore라 광선이 통과한다. 화면에서 공이 앉은 원은 따로 그려 가림막에 넣는다.
const BALL_R = 0.14;
// 그 덩이가 바닥인지 되묻는 광선 수와, 그중 바닥이어야 하는 몫. 무게중심 하나로 물으면
// ㄷ자로 휜 그늘의 중심이 키퍼 몸 위에 떨어져 그늘 512화소를 통째로 몸이라고 답한다(실측).
// 그래서 덩이가 실제로 가진 화소에서 고르게 뽑아 묻는다. 실루엣에 닿은 가장자리 몇은 몸을 집는다.
const OWNER_RAYS = 24;
const OWNER_FLOOR = 0.75;
// 확대 모드의 가로 런 길이 하한과 두 모드의 비. 384 타깃을 늘리면 같은 색이 옆으로 이어진다.
const RUN_MIN = 2.0;
const RUN_RATIO = 1.5;
// 조명을 다섯에서 셋으로 줄여도 흙 밝기는 그대로여야 한다. 흙은 재질을 안 바꾼 면이라 조명만 잰다.
// 실측: 리마스터 전 흙 화소 222칸의 휘도 p10/p50/p90이 64/93/148이었다(seed 20, save, 멈춘 프레임).
// 이 상수가 아직 참인지는 --was가 매번 다시 잰다. 부모 판에서 이 축이 초록이면 기준이 그 판의 값이다.
const DIRT_BEFORE = [64, 93, 148];
// 실측: 같은 프레임을 두 번 찍은 차이가 0화소였고 사건 진행에 따라 흙에 자국이 쌓인다. 그 폭만 연다.
const DIRT_TOL = 8;

const t = setTimeout(() => { console.log("WATCHDOG"); process.exit(1); }, 200000);
t.unref();

const rows = [];
const say = (name, pass, detail) => rows.push([pass, name, detail]);
const notes = [];

// 봉 세기. 골짜기까지 내려가며 한 봉의 몸통을 통째로 걷어내고 다음 봉을 찾는다.
function modes(vals) {
  const hist = new Float64Array(256);
  for (const v of vals) hist[Math.max(0, Math.min(255, Math.round(v)))] += 1;
  const sm = new Float64Array(256);
  for (let i = 0; i < 256; i += 1) {
    let s = 0;
    for (let k = -SMOOTH; k <= SMOOTH; k += 1) {
      const j = i + k;
      if (j >= 0 && j <= 255) s += hist[j];
    }
    sm[i] = s;
  }
  const used = new Uint8Array(256);
  const peaks = [];
  for (let pass = 0; pass < 12; pass += 1) {
    let bi = -1;
    let bv = 0;
    for (let i = 0; i < 256; i += 1) if (!used[i] && sm[i] > bv) { bv = sm[i]; bi = i; }
    if (bi < 0) break;
    let lo = bi;
    while (lo > 0 && !used[lo - 1] && sm[lo - 1] <= sm[lo]) lo -= 1;
    let hi = bi;
    while (hi < 255 && !used[hi + 1] && sm[hi + 1] <= sm[hi]) hi += 1;
    let mass = 0;
    for (let i = lo; i <= hi; i += 1) { mass += hist[i]; used[i] = 1; }
    const near = peaks.some((p) => Math.abs(p.at - bi) < PEAK_SEP);
    if (!near && vals.length && mass / vals.length >= PEAK_SHARE) peaks.push({ at: bi, share: mass / vals.length });
  }
  peaks.sort((a, b) => a.at - b.at);
  return peaks;
}

const show = (ps) => ps.length + " modes " + ps.map((p) => p.at + "(" + (p.share * 100).toFixed(0) + "%)").join(" ");
const pct = (a, q) => {
  if (!a.length) return 0;
  const s = a.slice().sort((p, r) => p - r);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};

// 아래 넷은 페이지 안에서 돈다. 화소 접근은 브라우저가, 통계는 노드가 한다.
async function greenLuma([b64, gr, gb, rad]) {
  const im = new Image();
  im.src = "data:image/png;base64," + b64;
  await im.decode();
  const cv = document.createElement("canvas");
  cv.width = im.width; cv.height = im.height;
  const c = cv.getContext("2d");
  c.drawImage(im, 0, 0);
  const g = c.getImageData(0, 0, im.width, im.height);
  const d = g.data;
  const w = g.width;
  const h = g.height;
  const lum = new Float32Array(w * h);
  const on = new Uint8Array(w * h);
  const raw = [];
  for (let s = 0; s < w * h; s += 1) {
    const i = s * 4;
    if (d[i + 1] - d[i] < gr || d[i + 1] - d[i + 2] < gb) continue;
    on[s] = 1;
    lum[s] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    raw.push(Math.round(lum[s]));
  }
  // 무늬를 걷는다. 같은 상의 화소들 안에서만 최대값을 본다. 바깥을 물면 배경 밝기가 딸려 들어온다.
  const out = [];
  for (let s = 0; s < w * h; s += 1) {
    if (!on[s]) continue;
    const cx = s % w;
    const cy = (s / w) | 0;
    let best = lum[s];
    for (let dy = -rad; dy <= rad; dy += 1) {
      const ny = cy + dy;
      if (ny < 0 || ny >= h) continue;
      for (let dx = -rad; dx <= rad; dx += 1) {
        const nx = cx + dx;
        if (nx < 0 || nx >= w) continue;
        const ni = ny * w + nx;
        if (on[ni] && lum[ni] > best) best = lum[ni];
      }
    }
    out.push(Math.round(best));
  }
  return { raw, flat: out };
}

async function darkerBlobs([A, B, drop, link, rays, occStep, ballR]) {
  const read = async (b64) => {
    const im = new Image();
    im.src = "data:image/png;base64," + b64;
    await im.decode();
    const cv = document.createElement("canvas");
    cv.width = im.width; cv.height = im.height;
    cv.getContext("2d").drawImage(im, 0, 0);
    return cv.getContext("2d").getImageData(0, 0, im.width, im.height);
  };
  const a = await read(A);
  const b = await read(B);
  const w = a.width;
  const h = a.height;
  const L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const mask = new Uint8Array(w * h);
  let hits = 0;
  let bx0 = w, bx1 = -1, by0 = h, by1 = -1;
  for (let s = 0; s < w * h; s += 1) {
    const i = s * 4;
    if (L(b.data, i) - L(a.data, i) >= drop) {
      mask[s] = 1;
      hits += 1;
      const x = s % w;
      const y = (s / w) | 0;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
    }
  }
  // 가림막. 차분이 난 자리 둘레만 광선으로 훑어 바닥이 아닌 임자를 표시한다.
  const occ = new Uint8Array(w * h);
  let occCells = 0;
  if (hits) {
    const pad = occStep * 3;
    const x0 = Math.max(0, bx0 - pad), x1 = Math.min(w - 1, bx1 + pad);
    const y0 = Math.max(0, by0 - pad), y1 = Math.min(h - 1, by1 + pad);
    const paint = (px, py) => {
      for (let y = py; y < Math.min(h, py + occStep); y += 1) {
        for (let x = px; x < Math.min(w, px + occStep); x += 1) occ[y * w + x] = 1;
      }
    };
    for (let y = y0; y <= y1; y += occStep) {
      for (let x = x0; x <= x1; x += occStep) {
        const p = window.__pick((x / w) * 2 - 1, -((y / h) * 2 - 1));
        if (!p || (p.name !== "box" && p.name !== "ground")) { paint(x, y); occCells += 1; }
      }
    }
    const c = window.__ballProbe.sample();
    const bp = window.__ballPos();
    if (c && c.ndc) {
      const o = window.__ballProbe.probeAt(bp.x + ballR, bp.y, bp.z);
      const rad = Math.max(4, Math.hypot(o.ndc[0] - c.ndc[0], o.ndc[1] - c.ndc[1]) * 0.5 * w);
      const cx = (c.ndc[0] * 0.5 + 0.5) * w;
      const cy = (-c.ndc[1] * 0.5 + 0.5) * h;
      for (let y = Math.max(0, Math.floor(cy - rad)); y <= Math.min(h - 1, Math.ceil(cy + rad)); y += 1) {
        for (let x = Math.max(0, Math.floor(cx - rad)); x <= Math.min(w - 1, Math.ceil(cx + rad)); x += 1) {
          if (Math.hypot(x - cx, y - cy) <= rad) occ[y * w + x] = 1;
        }
      }
    }
  }
  const seen = new Uint8Array(w * h);
  const out = [];
  for (let s = 0; s < mask.length; s += 1) {
    if (!mask[s] || seen[s]) continue;
    const q = [s];
    seen[s] = 1;
    const cells = [];
    while (q.length) {
      const c = q.pop();
      const cx = c % w;
      const cy = (c / w) | 0;
      // 가려진 화소는 이어짐만 나르고 면적으로는 안 센다.
      if (mask[c]) cells.push(c);
      for (let dy = -link; dy <= link; dy += 1) {
        for (let dx = -link; dx <= link; dx += 1) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if ((mask[ni] || occ[ni]) && !seen[ni]) { seen[ni] = 1; q.push(ni); }
        }
      }
    }
    // 임자를 되묻는 자리는 덩이가 실제로 가진 화소에서 고르게 뽑는다. 무게중심은 덩이 밖일 수 있다.
    const step = Math.max(1, Math.floor(cells.length / rays));
    const pts = [];
    for (let i = 0; i < cells.length && pts.length < rays; i += step) pts.push([cells[i] % w, (cells[i] / w) | 0]);
    if (cells.length >= 24) out.push({ px: cells.length, pts });
  }
  out.sort((p, r) => r.px - p.px);
  return { hits, occCells, blobs: out.slice(0, 6) };
}

async function runLength([b64, y0, y1, x0, x1, vw]) {
  const im = new Image();
  im.src = "data:image/png;base64," + b64;
  await im.decode();
  const cv = document.createElement("canvas");
  cv.width = im.width; cv.height = im.height;
  cv.getContext("2d").drawImage(im, 0, 0);
  const g = cv.getContext("2d").getImageData(0, 0, im.width, im.height);
  const d = g.data;
  const sx = im.width / vw;
  let runs = 0;
  let px = 0;
  for (let y = Math.round(y0 * sx); y < Math.round(y1 * sx); y += 4) {
    let prev = -1;
    for (let x = Math.round(x0 * sx); x < Math.round(x1 * sx); x += 1) {
      const i = (y * g.width + x) * 4;
      const v = d[i] * 65536 + d[i + 1] * 256 + d[i + 2];
      if (v !== prev) runs += 1;
      prev = v;
      px += 1;
    }
  }
  return runs ? px / runs : 0;
}

async function lumaAt([b64, cells, half]) {
  const im = new Image();
  im.src = "data:image/png;base64," + b64;
  await im.decode();
  const cv = document.createElement("canvas");
  cv.width = im.width; cv.height = im.height;
  cv.getContext("2d").drawImage(im, 0, 0);
  const g = cv.getContext("2d").getImageData(0, 0, im.width, im.height);
  const d = g.data;
  const out = [];
  for (const [px, py] of cells) {
    for (let y = py - half; y < py + half; y += 2) {
      for (let x = px - half; x < px + half; x += 2) {
        if (x < 0 || y < 0 || x >= g.width || y >= g.height) continue;
        const i = (y * g.width + x) * 4;
        out.push(Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]));
      }
    }
  }
  return out;
}

// 흙이 차지한 화면 칸을 광선으로 되묻는다. 화소의 임자를 모르면 밝기 비교는 다른 면끼리의 비교다.
function dirtCells([w, h]) {
  const out = [];
  for (let y = 470; y < 700; y += 26) {
    for (let x = 120; x < 1160; x += 40) {
      const p = window.__pick((x / w) * 2 - 1, -((y / h) * 2 - 1));
      if (p && (p.name === "box" || p.name === "ground")) out.push([x, y]);
    }
  }
  return out;
}

// 화면 점 여럿의 임자를 한 번에 되묻는다.
function ownerOf([pts, w, h]) {
  return pts.map(([x, y]) => {
    const p = window.__pick((x / w) * 2 - 1, -((y / h) * 2 - 1));
    return p ? { name: p.name, z: p.world[2] } : { name: "sky", z: 0 };
  });
}

const routed = new Map();
if (WAS) {
  for (const f of LAYER) {
    const was = execFileSync("git", ["show", WAS_REV + ":" + f], { encoding: "utf8", maxBuffer: 16000000, cwd: ROOT });
    const live = readFileSync(ROOT + f, "utf8");
    // 되돌린 판이 살아 있는 판과 같으면 이 대조군은 자기 자신을 자기와 맞대는 no-op이다.
    // 조용히 초록을 내는 대신 여기서 끊는다.
    if (was.replace(/\r/g, "") === live.replace(/\r/g, "")) {
      console.log("판정 중단. " + f + "이 " + WAS_REV + "와 같아 대조군이 no-op이다. INSTRUMENT DEAD");
      process.exit(2);
    }
    routed.set(f, was);
  }
}

/* 첫 진입 개봉을 걷는 손. 이 모양의 임자는 tools/onboard-gate.mjs이고 여기 것은 그 자의 press와 tap을
   그대로 옮긴 사본이다. 짧은 누름은 한 단을 올릴 뿐이므로(web/src/main.mjs의 step) 누름 수로는 이 판을
   못 걷는다. 실측으로 0.7초 간격 여섯 번은 열한 장 가운데 셋째 장 둘째 단에서, 0.5초 간격 여덟 번은
   셋째 장 첫 단에서 끝났고 판은 그대로 서 있었다. 문턱 LONG_MS 0.45초보다 오래 붙들면 남은 것이 그 자리에서
   전부 열리고, 뗀 뒤 한 번 누르는 것이 닫는다. 첫 진입은 키퍼 한 장과 키커 열한 장 두 마디라
   그 쌍을 판이 걷힐 때까지 되풀이한다. */
async function clearDraw(page) {
  // 카드가 지나는 다섯 단의 마지막 번호. 길이는 제품의 STAGE_MS가 정하고 계기는 그 수를 마주 든다.
  const STAGE_LAST = 4;
  /* 긴 누름이 남은 것을 여는 것을 기다리는 상한. 제품 문턱이 0.45초라 여섯 배가 넘고,
     문턱이 아니라 상한이므로 초록 회차에서는 0.5초 언저리에 풀린다. */
  const PRESS_MS = 3000;
  // 마디 수의 상한. 두 마디가 끝이고 남는 둘은 손이 한 번 헛나갔을 때의 자리다.
  const BEATS = 4;
  // 닫힌 판은 누를 자리가 없다. 그 자리에서 한 번 더 누르면 오류로 끝나 결과 줄이 아예 안 남는다.
  const standing = () => page.evaluate(() => { const e = document.getElementById("pull"); return Boolean(e) && !e.hidden; });
  for (let beat = 0; beat < BEATS; beat += 1) {
    if (!(await standing())) return true;
    const spot = await page.locator("#pull .tap").boundingBox();
    if (!spot) return false;
    /* 손가락이 내려가 있는 동안 열리는 물건이라 누름과 뗌을 따로 보내고, 열린 것을 보고 뗀다.
       뗄 때 브라우저가 만드는 click은 제 일을 한 긴 누름의 것이라 제품이 삼키므로 닫는 누름은 따로 간다. */
    await page.mouse.move(spot.x + spot.width / 2, spot.y + spot.height / 2);
    await page.mouse.down();
    await page.waitForFunction((last) => {
      const r = window.__reveal();
      return r.drawn > 0 && r.shown === r.drawn && r.stage === last;
    }, STAGE_LAST, { timeout: PRESS_MS, polling: "raf" }).catch(() => {});
    await page.mouse.up();
    await page.waitForTimeout(300);
    if (await standing()) await page.click("#pull", { force: true });
    /* 닫히거나, 닫혀서 다음 마디가 이어 열리거나. 둘 중 하나가 설 때까지가 이 마디의 끝이다. */
    await page.waitForFunction(() => {
      const e = document.getElementById("pull");
      if (!e || e.hidden) return true;
      const r = window.__reveal();
      return r.drawn > 0 && r.shown < r.drawn;
    }, null, { timeout: PRESS_MS, polling: "raf" }).catch(() => {});
  }
  return !(await standing());
}

let browser;
const shots = {};
try {
  browser = await chromium.launch({ executablePath: EXE, args: ["--use-gl=angle", "--enable-gpu"] });
  const errs = [];
  for (const mode of ["pix", "full"]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    // 시계는 손잡이가 생기는 틱에 못 박힌다. evaluate로 켜면 그 전에 흐른 실시간이 세계시각에 쌓인다.
    await pinClock(ctx, STEP);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    for (const [f, body] of routed) {
      await page.route("**/" + f, (route) => route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body }));
    }
    const at = (n) => page.waitForFunction((m) => window.__frames() >= m, n, { timeout: 20000 });
    await page.goto(BASE + (mode === "full" ? "&pix=0" : ""), { waitUntil: "load" });
    await page.waitForSelector("#go", { timeout: 15000 });
    await page.click("#go", { force: true });
    // 첫 진입은 개봉 카드 두 마디를 지난다. 그 카드를 안 닫으면 화면 가운데를 카드가 덮고,
    // 유니폼을 잰다고 고른 초록 화소가 경기장의 키퍼가 아니라 카드 안의 썸네일이 된다.
    await clearDraw(page);
    // 판을 잠근다. 안 잠그면 대기 타이머가 제 슛을 쏘고, 그 슛이 예약한 프레임과 겹쳐
    // 어느 회차에는 사건이 슛 위에 얹히고 어느 회차에는 안 얹힌다.
    await page.evaluate(() => window.__lockRound());
    // 흔들림 위상을 못 박는다. 위상은 구가 열린 프레임에서 시작하고 그 프레임은 클릭이 정한다.
    // 안 박으면 같은 프레임의 몸이 회차마다 조금 다른 자리에 서고, 그림자 차분이 1435와 1443으로 갈린다.
    // 되돌린 판에는 이 손잡이가 없다. 없으면 그 회차는 흔들림 위상이 안 박힌 채로 도는 것이고,
    // 조용히 지나가는 대신 축으로 적는다. 대조군은 한 번 돌고 마는 판정이라 그래도 뜻이 선다.
    const pinned = await page.evaluate(() => (window.__swayPin ? window.__swayPin(0) : -1));
    say("control:the-sway-phase-is-pinned " + mode, pinned >= 0,
      pinned >= 0 ? "phase " + pinned : "window.__swayPin missing on this layer");
    /* 임팩트 층을 내린다. 흙먼지 뭉치와 글자는 사건마다 Math.random으로 기울어(impact.mjs blobSpin,
       wordSpin) 회차마다 다른 화소를 덮는다. 세계 상태가 같은데도 그 층이 그늘 위에 다른 모양으로
       앉아 실측으로 같은 사건의 그늘이 483과 487 화소로 갈렸다. 재는 대상은 재질과 그림자 지도이고
       먼지는 그 위에 얹힌 다른 층이라, 여기서는 내려놓고 잰다. */
    await page.evaluate(() => { if (window.__impactHide) window.__impactHide(true); });
    await page.evaluate(() => { document.getElementById("hud").style.display = "none"; });
    const covered = await page.evaluate(() => {
      const e = document.getElementById("pull");
      return Boolean(e) && !e.hidden;
    });
    say("control:the-pitch-is-not-behind-a-card " + mode, covered === false, covered ? "#pull still open" : "clear");

    const state = await page.evaluate(() => (window.__pixState ? window.__pixState() : null));
    const rt = state ? state.rt.join("x") : "hook missing";
    if (mode === "pix") say("pix:the-default-target-stays-683x384", Boolean(state) && state.rt[0] === 683 && state.rt[1] === 384, rt);
    else say("pix:full-res-target-follows-the-canvas",
      Boolean(state) && state.rt[0] === state.canvas[0] && state.rt[1] === state.canvas[1] && state.canvas[0] === W * state.dpr,
      rt + " canvas " + (state ? state.canvas.join("x") + " dpr " + state.dpr : "hook missing"));

    // 표본은 이 모드의 사건 셋을 합친 면이다. 한 컷만 보면 단의 개수가 그 자세의 함수가 된다.
    const pool = [];
    let anchored = false;
    for (const kind of EVENTS) {
      // 사건을 걸 프레임과 멈출 프레임을 한 번의 evaluate로 페이지에 맡긴다. 밖에서 프레임을 읽고
      // 다시 걸면 그 사이에 지난 프레임만큼 세계가 더 돌아 회차마다 다른 몸이 언다.
      const plan = await page.evaluate(([k, lead, tail, anchor]) => {
        const f = window.__frames();
        const base = anchor > 0 ? anchor : f;
        window.__plan(base + lead, k, base + lead + tail);
        return { f, stop: base + lead + tail };
      }, [kind, LEAD, TAIL, anchored ? 0 : ANCHOR]);
      const stopAt = plan.stop;
      if (!anchored) {
        // 예약이 닻보다 늦게 걸리면 첫 정지 프레임의 세계시각이 다시 벽시계를 탄다. 조용히 밀리는 대신 여기서 빨개진다.
        say("control:the-first-event-is-planned-before-the-anchor " + mode, plan.f < ANCHOR,
          "planned at frame " + plan.f + ", anchor " + ANCHOR);
        anchored = true;
      }
      await at(stopAt);
      const tag = mode + "/" + kind;

      /* 멈춤이 진짜인지 먼저 묻는다. 세계시각이 그대로이고 프레임은 늘어야 정지 프레임이다.
         찍는 값은 프레임 번호가 아니라 세계의 지문이다. 프레임 번호는 멈춘 동안에도 벽시계를 따라
         늘어나므로 회차마다 다르고, 세계시각과 두 몸의 좌표는 같은 프레임이면 같은 수여야 한다. */
      const t0 = await page.evaluate(() => ({ v: window.__camDbg().vnow, f: window.__frames() }));
      await page.waitForTimeout(250);
      const t1 = await page.evaluate(() => ({
        v: window.__camDbg().vnow, f: window.__frames(), k: window.__keeperPos(), b: window.__ballPos()
      }));
      const fix = (o) => [o.x, o.y, o.z].map((n) => n.toFixed(3)).join(",");
      say("control:the-world-stopped-at-the-planned-frame " + tag, t0.v === t1.v && t1.f > t0.f,
        "vnow " + t1.v.toFixed(4) + " held while frames kept ticking, keeper " + fix(t1.k) + " ball " + fix(t1.b));

      const A = (await page.screenshot()).toString("base64");
      const A2 = (await page.screenshot()).toString("base64");
      const off = await page.evaluate(() => (window.__castOff ? window.__castOff(true) : -1));
      await page.waitForTimeout(200);
      const B = (await page.screenshot()).toString("base64");
      await page.evaluate(() => { if (window.__castOff) window.__castOff(false); });

      const ctrl = await page.evaluate(darkerBlobs, [A, A2, SHADOW_DROP, SHADOW_LINK, OWNER_RAYS, OCC_STEP, BALL_R]);
      const cast = await page.evaluate(darkerBlobs, [A, B, SHADOW_DROP, SHADOW_LINK, OWNER_RAYS, OCC_STEP, BALL_R]);
      const top = cast.blobs[0] || null;
      const owners = top ? await page.evaluate(ownerOf, [top.pts, W, H]) : [];
      const floor = owners.filter((o) => o.name === "box" || o.name === "ground");
      const share = owners.length ? floor.length / owners.length : 0;
      const zMed = floor.length ? floor.map((o) => o.z).sort((a, b) => a - b)[floor.length >> 1] : 0;
      say("control:the-frozen-frame-repeats-itself " + tag, ctrl.blobs.length === 0 && off > 0,
        "ctrl blobs " + ctrl.blobs.length + " diff " + ctrl.hits + "px, casters " + off);
      say("shadow:the-keeper-drops-a-cast-shadow-on-the-floor " + tag,
        Boolean(top) && top.px >= SHADOW_MIN && owners.length >= 8 && share >= OWNER_FLOOR,
        (top ? top.px + "px of " + cast.hits + "px" : "no blob") + " on the floor, "
        + floor.length + "/" + owners.length + " rays on box or ground z" + zMed.toFixed(1)
        + ", bridged over " + cast.occCells + " occluded cells");

      if (kind === "save" && mode === "pix") {
        const cells = await page.evaluate(dirtCells, [W, H]);
        const vals = await page.evaluate(lumaAt, [A, cells, 8]);
        const trio = [pct(vals, 0.1), pct(vals, 0.5), pct(vals, 0.9)];
        const ok = trio.every((v, i) => Math.abs(v - DIRT_BEFORE[i]) <= DIRT_TOL);
        say("light:the-dirt-keeps-the-brightness-it-had-before", ok,
          "p10/p50/p90 " + trio.join("/") + " vs " + DIRT_BEFORE.join("/") + " cells " + cells.length);
        notes.push("dirt histogram " + JSON.stringify(modes(vals).map((p) => p.at + ":" + p.share.toFixed(2))));
      }

      await page.evaluate(() => window.__solo("keeper"));
      await page.waitForTimeout(200);
      const S = (await page.screenshot()).toString("base64");
      await page.evaluate(() => window.__solo());
      const lum = await page.evaluate(greenLuma, [S, GREEN_R, GREEN_B, CLOTH_R]);
      const peaks = modes(lum.flat);
      for (const v of lum.flat) pool.push(v);
      say("control:the-uniform-sample-is-a-face-not-a-speck " + tag, lum.flat.length >= UNIFORM_MIN,
        lum.flat.length + "px, 무늬 걷기 전 " + modes(lum.raw).map((p) => p.at).join(","));
      say("toon:the-uniform-face-is-banded " + tag,
        peaks.length >= EVENT_MODES_MIN && peaks.length <= MODES_MAX, show(peaks));

      const run = await page.evaluate(runLength, [A, 470, 700, 200, 1080, W]);
      if (kind === "save") shots["run-" + mode] = run;
    }
    const bands = modes(pool);
    say("toon:the-uniform-reads-as-three-bands " + mode,
      bands.length >= MODES_MIN && bands.length <= MODES_MAX,
      show(bands) + " of " + pool.length + "px over " + EVENTS.length + " events");
    await ctx.close();
  }

  const rp = shots["run-pix"] || 0;
  const rf = shots["run-full"] || 0;
  // DPR 1에서만 재면 캔버스 화소 수와 CSS 크기가 같은 수라 둘이 갈리는지 못 본다. 2로 한 번 더 연다.
  for (const mode of ["pix", "full"]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(BASE + (mode === "full" ? "&pix=0" : ""), { waitUntil: "load" });
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => (window.__pixState ? window.__pixState() : null));
    const want = mode === "full" ? [W * 2, H * 2] : [683, 384];
    say("pix:the-target-holds-at-dpr-2 " + mode,
      Boolean(st) && st.dpr === 2 && st.canvas[0] === W * 2 && st.canvas[1] === H * 2
      && st.rt[0] === want[0] && st.rt[1] === want[1],
      st ? "rt " + st.rt.join("x") + " canvas " + st.canvas.join("x") + " dpr " + st.dpr : "hook missing");
    await ctx.close();
  }
  // 모바일 하한은 바 없이 적는다. 판이 캔버스보다 크면 확대 층은 그 폭에서 축소로 뒤집힌다.
  for (const mode of ["pix", "full"]) {
    const ctx = await browser.newContext({ viewport: { width: MW, height: MH } });
    const page = await ctx.newPage();
    await page.goto(BASE + (mode === "full" ? "&pix=0" : ""), { waitUntil: "load" });
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => (window.__pixState ? window.__pixState() : null));
    notes.push("report " + MW + "x" + MH + " " + mode + ": target " + (st ? st.rt.join("x") : "hook missing")
      + " vs canvas " + (st ? st.canvas.join("x") : "?")
      + (st && st.rt[0] > st.canvas[0] ? "  (target wider than the canvas, so the upscale is a downscale here)" : ""));
    await ctx.close();
  }
  say("pix:the-upscaled-frame-is-blockier-than-the-full-res-one",
    rp >= RUN_MIN && rf > 0 && rp / rf >= RUN_RATIO,
    "run " + rp.toFixed(2) + " vs " + rf.toFixed(2) + "px (ratio " + (rf ? rp / rf : 0).toFixed(2) + ")");
  say("console:no-errors", errs.length === 0, errs.length ? errs[0].slice(0, 120) : "clean");
} finally {
  clearTimeout(t);
  if (browser) await browser.close();
}

// 대조군 둘. 한 색으로 채운 표본은 한 봉, 세 단으로 나눈 표본은 세 봉이어야 이 자가 봉을 센다고 말할 수 있다.
const flatCtl = modes(new Array(4000).fill(137));
const trioCtl = modes([].concat(
  new Array(1200).fill(0).map((_, i) => 62 + (i % 3)),
  new Array(1200).fill(0).map((_, i) => 121 + (i % 3)),
  new Array(1200).fill(0).map((_, i) => 196 + (i % 3))));
say("control:a-flat-patch-reads-as-one-mode", flatCtl.length === 1, flatCtl.length + " modes");
say("control:a-three-step-patch-reads-as-three-modes", trioCtl.length === 3, trioCtl.length + " modes");

let bad = 0;
for (const n of notes) console.log("  " + n);
for (const [pass, name, detail] of rows) {
  if (!pass) bad += 1;
  console.log("  " + (pass ? "ok  " : "FAIL") + " " + name + " " + detail);
}
console.log("표본 범위: 사건 셋(save, distracted, charge) x 두 모드(384 확대 기본, ?pix=0 풀해상), 1280x720");
console.log((WAS ? "toon(--was " + WAS_REV + ") " : "toon ") + (bad ? "FAIL " + bad : "PASS " + rows.length));
process.exitCode = bad ? 1 : 0;
