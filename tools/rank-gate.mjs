// 랭킹의 자. 판이 잰 값이 장부와 같은가, 같은 값에 같은 등수를 주는가, 세이브율이 규정 구수를 지키는가,
// 닉네임이 두 계정에 서지 못하는가(이 기기와 서버 두 자리), 이름을 바꾼 계정이 옛 이름을 놓는가.
// 대조군은 심은 위반이다. 등수를 줄 번호로 주는 판, 중복을 안 보는 서버, 공백과 대소문자를 이름으로 읽는 비교.
import { rankLine, sortBoard, rankValue, qualifies, nickKey, RANK_MIN_SHOTS, RANK_BOARDS } from "../web/src/state/rank.mjs";
import { createRankStore } from "../server/rank.mjs";
import { RAPPORT_CAP } from "../web/src/state/rapport.mjs";
import { GROWABLE } from "../src/ledger.mjs";
import { UTILS, payCash, renamePrice } from "../web/src/state/util.mjs";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { signUp, nickProblem, setNick, guestUp, namedAccounts } = await import("../web/src/state/account.mjs");

const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push("rank:" + n + " " + d);

// 줄은 장부에서 뽑는다.
const keeper = Object.fromEntries(GROWABLE.map((g, i) => [g, i < 5 ? 12 : 3]));
keeper.level = 17;
const saved = { record: { a: { saved: 30, conceded: 10 }, b: { saved: 7, conceded: 3 } }, keeper, fans: 1234.9, rapport: { "0:1": RAPPORT_CAP, "1:4": RAPPORT_CAP, "0:2": 5 } };
const line = rankLine("키퍼", saved);
const statMean = GROWABLE.reduce((a, g) => a + keeper[g], 0) / GROWABLE.length;
check("line-reads-the-ledger", line.shots === 50 && line.save === 37 / 50 && line.fans === 1234 && line.charm === 2 && line.level === 17 && line.stat === statMean, JSON.stringify(line));
check("empty-save-stands-at-zero", JSON.stringify(rankLine("x", null)) === JSON.stringify({ nick: "x", shots: 0, save: 0, fans: 0, charm: 0, level: 1, stat: 0 }), "null save");
check("boards-are-the-five-the-founder-named", RANK_BOARDS.map((b) => b.id).join() === "save,fans,charm,level,stat", RANK_BOARDS.map((b) => b.label).join());

// 같은 값은 같은 등수, 다음 등수는 건너뛴다(1, 2, 2, 4).
const rows = [
  { nick: "a", shots: 60, save: 0.7, fans: 9, charm: 0, level: 3, stat: 3 },
  { nick: "b", shots: 80, save: 0.8, fans: 9, charm: 0, level: 3, stat: 3 },
  { nick: "c", shots: 70, save: 0.7, fans: 1, charm: 0, level: 3, stat: 3 },
  { nick: "d", shots: 90, save: 0.6, fans: 1, charm: 0, level: 3, stat: 3 }
];
const byRank = (b) => sortBoard(rows, b).map((r) => r.nick + r.rank).join(" ");
check("ties-share-a-rank", byRank("save") === "b1 c2 a2 d4", byRank("save"));
check("ties-order-by-sample-then-name", byRank("fans") === "b1 a1 d3 c3", byRank("fans"));
const naive = (l, b) => l.slice().sort((x, y) => y[b] - x[b]).map((r, i) => r.nick + (i + 1)).join(" ");
check("control:row-number-ranks-fail-the-tie-axis", naive(rows, "save") !== "b1 c2 a2 d4", naive(rows, "save"));

// 규정 구수.
const rookie = { nick: "r", shots: RANK_MIN_SHOTS - 1, save: 1, fans: 0, charm: 0, level: 1, stat: 1 };
check("save-board-holds-the-qualifier", !qualifies(rookie, "save") && qualifies(rookie, "fans") && !sortBoard([rookie], "save").length && sortBoard([rookie], "fans").length === 1, RANK_MIN_SHOTS + " shots");
check("save-reads-like-a-batting-average", rankValue("save", 0.7234) === ".723" && rankValue("save", 1) === "1.000" && rankValue("save", 0) === ".000", [0.7234, 1, 0].map((v) => rankValue("save", v)).join(" "));
check("stat-shows-two-decimals", rankValue("stat", 10.456) === "10.46" && rankValue("fans", 12345) === "12,345", rankValue("stat", 10.456) + " " + rankValue("fans", 12345));

// 이름 비교는 사람이 같은 이름으로 읽는 둘을 같게 본다.
check("nick-key-folds-case-space-and-composition", nickKey("  Kim  Keeper ") === nickKey("kim keeper") && nickKey(String.fromCharCode(0x1100, 0x1161)) === nickKey(String.fromCharCode(0xAC00)), JSON.stringify(nickKey("  Kim  Keeper ")));
check("control:raw-compare-fails-the-fold-axis", "  Kim  Keeper " !== "kim keeper", "raw strings differ");

// 이 기기: 둘째 계정은 같은 이름을 못 든다. 손님은 이름을 안 잡는다.
const one = signUp("alpha", "pass1", "골문지기");
const two = signUp("beta", "pass2", " 골문지기 ");
guestUp(); guestUp();
check("device-refuses-a-taken-nick", one.ok && !two.ok && two.why === "이미 쓰는 닉네임이다", JSON.stringify(two));
check("guests-never-take-a-nick", namedAccounts().length === 1 && nickProblem("손님", "zeta") === "", JSON.stringify(namedAccounts()));
const three = signUp("gamma", "pass3", "수문장");
const moved = setNick("alpha", "골문장인");
check("renaming-frees-the-old-nick", three.ok && moved.ok && nickProblem("골문지기", "delta") === "" && nickProblem("골문장인", "delta") !== "", JSON.stringify(namedAccounts()));
check("a-nick-past-twelve-is-refused", nickProblem("가".repeat(13), "x") !== "" && nickProblem("가".repeat(12), "x") === "", "12");

// 서버: 같은 이름 409, 같은 계정의 다시 걸기 200, 바꾸면 옛 이름을 놓는다, 이름 없는 줄은 403.
const store = createRankStore(null);
const s1 = store.claim("u1", "Keeper"), s2 = store.claim("u2", " keeper"), s3 = store.claim("u1", "KEEPER");
const s4 = store.claim("u1", "Wall"), s5 = store.claim("u2", "keeper");
const s6 = store.post("u3", line), s7 = store.post("u1", line);
check("server-refuses-a-taken-nick", s1 === 200 && s2 === 409 && s3 === 200, [s1, s2, s3].join());
check("server-rename-frees-the-old-nick", s4 === 200 && s5 === 200, [s4, s5].join());
check("server-takes-lines-only-from-named-accounts", s6 === 403 && s7 === 200 && store.lines().length === 1, [s6, s7, store.lines().length].join());
const loose = { nicks: {}, claim(id, n) { this.nicks[n] = id; return 200; } };
check("control:a-server-without-the-check-fails", loose.claim("u1", "k") === 200 && loose.claim("u2", "k") === 200, "both 200");

// 닉네임 변경권은 캐시로만 산다. 골드가 아무리 많아도 캐시가 모자라면 아무것도 안 빠진다.
const rich = { coin: 1e6, cash: 29 }, paid = { coin: 5, cash: 45 };
const r1 = payCash(rich, 30), r2 = payCash(paid, 30);
check("util:sold-for-cash-only", UTILS.length > 0 && UTILS.every((u) => Number.isInteger(u.cash) && u.cash > 0 && !("coin" in u) && !("gold" in u)) && !r1 && rich.coin === 1e6 && rich.cash === 29 && r2 && paid.cash === 15 && paid.coin === 5, JSON.stringify({ rich, paid }));
check("util:each-rename-costs-more-up-to-ten-times", renamePrice(0) === UTILS[0].cash && renamePrice(1) === 2 * UTILS[0].cash && renamePrice(3) === 4 * UTILS[0].cash && renamePrice(99) === 10 * UTILS[0].cash, [0, 1, 3, 99].map(renamePrice).join(" "));
const both = (w, n) => (w.coin >= n * 10 ? ((w.coin -= n * 10), true) : payCash(w, n));
check("control:a-gold-fallback-fails-the-cash-axis", both({ coin: 1e6, cash: 0 }, 30) === true, "gold paid");

for (const n of notes) console.log("  ok   " + n);
for (const f of fails) console.log("  FAIL " + f);
console.log(fails.length ? "rank FAIL " + fails.length : "rank PASS " + notes.length);
process.exit(fails.length ? 1 : 0);

