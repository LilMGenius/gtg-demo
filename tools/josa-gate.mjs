import { readFileSync } from "node:fs";
import { withRo } from "../web/src/ui/josa.mjs";

// 수 뒤의 조사를 재는 자. 만남 선택지가 '의사소통 3로'라고 적었다. 수를 문자열에 바로 이어 붙이면
// 조사는 수가 무엇이든 한 글자로 고정된다. 읽는 소리가 조사를 고르므로 조사는 withRo 한 곳이 붙인다.
// 축은 둘이다. 표의 수마다 조사가 맞는가, 소스가 능력치 값 뒤에 조사를 손으로 잇지 않는가.
const fails = [], notes = [];
const check = (n, ok, d) => (ok ? notes : fails).push(n + " " + d);
const KEY = { 0: "0으로", 1: "1로", 2: "2로", 3: "3으로", 4: "4로", 5: "5로", 6: "6으로", 7: "7로", 8: "8로", 9: "9로", 10: "10으로", 13: "13으로", 20: "20으로", 100: "100으로", 1000: "1000으로", 21: "21로" };
const wrong = Object.entries(KEY).filter(([n, want]) => withRo(Number(n)) !== want).map(([n, want]) => withRo(Number(n)) + " not " + want);
check("josa:every-number-takes-its-own-particle", wrong.length === 0, wrong.join(", ") || Object.keys(KEY).length + " numbers");
// 손으로 이은 조사. 값 표에서 꺼낸 수(대괄호로 끝나는 식) 바로 뒤에 로나 으로로 시작하는 글자를 붙이는 줄이다.
const HAND = /\]\s*\+\s*'(으)?로[ ']/;
const src = readFileSync(new URL("../web/src/main.mjs", import.meta.url), "utf8").split(String.fromCharCode(10));
const hand = src.map((l, i) => [i + 1, l]).filter(([, l]) => HAND.test(l)).map(([i]) => "main.mjs:" + i);
check("josa:no-particle-is-glued-by-hand", hand.length === 0, hand.join(", ") || "none");
check("control:a-glued-particle-is-caught", HAND.test("CAUSE_LABEL[m.stat] + ' ' + state.keeper[m.stat] + '로 성공'"), "planted line");
check("control:a-wrong-table-entry-is-caught", withRo(3) !== "3로", "3 -> " + withRo(3));
if (notes.length) console.log(notes.map((x) => "  ok   " + x).join(String.fromCharCode(10)));
if (fails.length) console.log(fails.map((x) => "  FAIL " + x).join(String.fromCharCode(10)));
console.log(fails.length ? "josa FAIL " + fails.length : "josa PASS " + notes.length);
process.exitCode = fails.length ? 1 : 0;
