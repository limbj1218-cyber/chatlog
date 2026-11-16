// StarLight 판 오토봇 본체를 가짜 PLAT 으로 돌려 본다.
//   node bot/starlight/test/오토봇.test.mjs   (저장소 맨 위에서)
import fs from "fs";
import autoBody from "../오토봇.js";

const data = fs.readFileSync("bot/오토봇데이터.json", "utf8");
const disk = {};
let fetched = 0;

const PLAT = {
  read: (n) => (Object.prototype.hasOwnProperty.call(disk, n) ? disk[n] : null),
  write: (n, t) => { disk[n] = String(t); return true; },
  fetch: async (url) => {
    fetched++;
    if (url.indexOf("오토봇데이터") !== -1 || url.indexOf("%EC%98%A4%ED%86%A0") !== -1) {
      return { ok: true, status: 200, text: async () => data };
    }
    return { ok: false, status: 404, text: async () => "" };
  }
};

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + label); }
  else { fail++; console.log("  ✗ " + label + (extra ? "  → " + extra : "")); }
}

const bot = autoBody(["오토2", "오토2프프", "[오차율 계산봇]"], PLAT);

function say(room, text, sender = "테스터", hash = "H-" + sender) {
  const out = [];
  bot.response(room, text, sender, true, { reply: (t) => out.push(String(t)) },
    { name: sender, hash });
  return out;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("═══ 시작 — 깃헙에서 데이터 받기 ═══");
await wait(30);
ok("깃헙에서 받아옴", bot.status().dataFrom === "깃헙", JSON.stringify(bot.status()));
ok("캐시 파일에 저장됨", !!disk["오토봇캐시.json"]);
ok("fetch 는 한 번만", fetched === 1, "fetched=" + fetched);

console.log("\n═══ 고정 자동응답 ═══");
ok("봇테스트", say("오토2", "봇테스트")[0].indexOf("정상 동작") !== -1);
ok("플로우", say("오토2", "플로우")[0].indexOf("flow.google.com") !== -1);
ok("질문", say("오토2", "질문")[0].indexOf("자주 묻는 질문") !== -1);
ok("질문이 있는데요 → 무반응", say("오토2", "질문이 있는데요").length === 0);
ok("목록에 없는 방 → 무반응", say("아무방", "봇테스트").length === 0);

console.log("\n═══ 진단 ═══");
const diag = say("오토2", "/오토")[0];
ok("/오토 에 버전", diag.indexOf("v" + bot.version) !== -1, diag);
ok("/오토 에 ⚠️ 없음", diag.indexOf("⚠️") === -1, diag);

console.log("\n═══ 등록 (멱살반2 는 권한 필요) ═══");
const r1 = say("멱살반2", "/등록_출석_밤 11시까지", "[조교] 아는아이");
ok("조교는 등록됨", r1.length && r1[0].indexOf("등록했어요") !== -1, JSON.stringify(r1));
ok("등록한 말이 나옴", say("멱살반2", "출석")[0] === "밤 11시까지");
ok("권한 없으면 조용히", say("멱살반2", "/등록_장난_x", "아무개").length === 0);
ok("다른 방엔 안 나감", say("오토2", "출석").length === 0);
ok("파일로 저장됨", !!disk["멱살응답.json"], Object.keys(disk).join(","));

console.log("\n═══ 공백기 근무표 ═══");
ok("공통 등록", say("공백기 근무표", "/등록_공지_전체 공지", "아무개")[0].indexOf("등록했어요") !== -1);
ok("오토2 에서 나옴", say("오토2", "공지")[0] === "전체 공지");
ok("/리스트 는 방별로", say("공백기 근무표", "/리스트")[0].indexOf("오토2사담방") !== -1);

console.log("\n═══ 닉변 감지 ═══");
say("오토2", "안녕", "미미르", "H1");
say("오토2", "이름 바꿈", "미친미르", "H1");
const nick = say("오토2", "/닉변감지")[0];
ok("닉변 잡힘", nick.indexOf("미미르 → 미친미르") !== -1, nick);
ok("hash 가 안 보임", nick.indexOf("H1") === -1 && nick.indexOf("#h:") === -1);
await wait(0);   // 저장은 백그라운드라 한 틱 뒤에 확인한다
ok("사람 파일 저장됨", !!disk["사람.json"]);

console.log("\n═══ 대화 기록 ═══");
for (let i = 0; i < 5; i++) say("오토2", "잡담 " + i, "미미르", "H1");
const log = say("공백기 근무표", "/삭제내역1")[0];
ok("기록 되짚기", log.indexOf("잡담 4") !== -1, log.slice(0, 120));

console.log("\n═══ 깃헙이 안 될 때 (캐시로 버티기) ═══");
const bot2 = autoBody(["오토2"], {
  read: PLAT.read, write: PLAT.write,
  fetch: async () => { throw new Error("네트워크 없음"); }
});
await wait(30);
ok("캐시로 동작", bot2.status().dataFrom === "캐시", JSON.stringify(bot2.status()));
const out2 = [];
bot2.response("오토2", "봇테스트", "나", true, { reply: (t) => out2.push(t) }, { hash: "H1" });
ok("캐시로도 응답", out2.length === 1 && out2[0].indexOf("정상") !== -1);

console.log("\n" + (fail ? "✗ " + fail + "개 실패 / " : "") + pass + "개 통과");
process.exit(fail ? 1 : 0);
