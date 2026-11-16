// StarLight(NeonJS) 로더 시험 — Projects·FileStream·BotManager·Chat·fetch 를 흉내 내고 로더를 진짜 ES 모듈로 불러온다.
// 사용 (저장소 맨 위에서): node bot/starlight/test/loader.test.mjs bot/starlight
import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const SRC = process.argv[2];
const HERE = fs.mkdtempSync(path.join(os.tmpdir(), "starlight-luna-"));
const PROJ = path.join(HERE, "proj");
fs.rmSync(PROJ, { recursive: true, force: true });
fs.mkdirSync(path.join(PROJ, "data"), { recursive: true });
fs.writeFileSync(path.join(PROJ, "package.json"), '{"type":"module"}');
fs.copyFileSync(path.join(SRC, "루나봇로더.js"), path.join(PROJ, "main.js"));
const BODY = fs.readFileSync(path.join(SRC, "루나봇.js"), "utf8");

let ok = 0, bad = 0;
function t(n, c, i) { if (c) ok++; else { bad++; console.log("FAIL", n, i === undefined ? "" : JSON.stringify(i)); } }

// ── 가짜 StarLight ──
const P = (p) => p;   // 경로는 실제 파일로
globalThis.FileStream = {
    exists: (p) => fs.existsSync(p),
    read: (p) => fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null,
    write: (p, d) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, String(d)); return String(d); },
    remove: (p) => { try { fs.unlinkSync(p); return true; } catch (e) { return false; } },
    createDir: (p) => { fs.mkdirSync(p, { recursive: true }); return true; }
};
const dirObj = (p) => ({ absolutePath: p });
globalThis.Projects = { getSelf: () => ({ directory: dirObj(PROJ.replace(/\\/g, "/")), getDataDirectory: () => dirObj(path.join(PROJ, "data").replace(/\\/g, "/")) }) };
let sent = [], compiled = 0;
globalThis.BotManager = { getCurrentBot: () => ({ send: (r, m) => { sent.push(r + "|" + m); return true; }, compile: () => { compiled++; return true; } }) };
globalThis.Chat = { findRoom: () => null };
const timers = [];
globalThis.setInterval = () => 0;                       // 알림 시계는 시험에서 안 돌린다
const realSetTimeout = setTimeout;
globalThis.setTimeout = (fn, ms) => realSetTimeout(fn, 0);   // 기다림은 바로
let fetchLog = [], remoteBody = BODY, answer = null;
globalThis.fetch = async (url, opt) => {
    opt = opt || {};
    fetchLog.push((opt.method || "GET") + " " + url.split("?")[0]);
    const R = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
    if (url.indexOf("raw.githubusercontent.com") !== -1) return remoteBody === null ? R(404, "") : R(200, remoteBody);
    if (opt.method === "PUT") return R(201, "{}");
    if (opt.method === "POST") return R(204, "");
    if (url.indexOf("/ask/a-") !== -1) return answer ? R(200, JSON.stringify(answer)) : R(404, "");
    return R(404, "");
};

function room(name) {
    return { name, isGroupChat: () => true, send: (m) => { sent.push(name + "|" + m); return true; } };
}
function say(sender, msg, id, rname) {
    sent = [];
    main.onMessage({ room: room(rname || "루나"), message: msg, sender: { name: sender, id: id === undefined ? null : id } });
    return sent.join("\n");
}
const flush = () => new Promise((ok) => realSetTimeout(ok, 30));

// ── 1. 처음 설치: 본체가 없으면 깃헙에서 받아 둔다 ──
let main = await import(pathToFileURL(path.join(PROJ, "main.js")).href);
t("처음: 깃헙에서 받음", fetchLog.some((x) => x.indexOf("raw.githubusercontent.com") !== -1) && fs.existsSync(path.join(PROJ, "luna_body.js")));
let info = say("x", "/루나로더", "HX");
t("로더 상태: 본체 있음", /본체: \d{4}-\d+ ✅ \(깃헙에서 처음 받음\)/.test(info), info);

// ── 2. 재련·저장 ──
let r = say("철수", "재련가즈아", "H1");
t("재련", r.indexOf("철수님, 1 → 2") !== -1, r);
const db = JSON.parse(fs.readFileSync(path.join(PROJ, "data", "luna_Database.json"), "utf8"));
t("data 폴더에 저장 + hash 키", db.userData["#h:H1"] === 2, db.userData);
t("다른 방 무시", say("철수", "재련가즈아", "H1", "다른방") === "");
t("고정 응답", say("x", "퉤", "HX") === "루나|후룹");

// ── 3. /내정보 — hash 값은 안 보인다 ──
r = say("영희", "/내정보", "SECRET-HASH-123");
t("내정보: 있음", r.indexOf("있음 ✅ (값은 비공개)") !== -1 && r.indexOf("SECRET") === -1, r);
t("내정보: 디버그 방처럼 id 없음", say("영희", "/내정보", null).indexOf("없음 ❌") !== -1);

// ── 4. 업데이트 ──
t("관리자 아니면 무시", say("철수", "/루나업데이트", "H1") === "");
remoteBody = BODY.replace(/var BOT_VER = "[^"]*";/, 'var BOT_VER = "9999-1";');
say("멱살잡힌스쳐(후파)", "/루나업데이트", "HA");
await flush(); await flush();
t("업데이트: 안내", sent.join().indexOf("본체 9999-1") !== -1, sent);
t("업데이트: 본체 파일 바뀜 + 옛 본체 남김", fs.readFileSync(path.join(PROJ, "luna_body.js"), "utf8").indexOf('"9999-1"') !== -1 &&
    fs.existsSync(path.join(PROJ, "luna_body_prev.js")));
t("업데이트: 다시 컴파일 부름", compiled === 1, compiled);
t("업데이트: 시험 파일 지움", fs.readdirSync(PROJ).filter((f) => f.indexOf("_test_") !== -1).length === 0);
// 깨진 본체는 받지 않는다
remoteBody = BODY.replace("function refine(", "function refine((") ;
say("멱살잡힌스쳐(후파)", "/루나업데이트", "HA");
await flush(); await flush();
t("깨진 본체: 실패 안내", sent.join().indexOf("업데이트 실패") !== -1, sent);
t("깨진 본체: 파일 그대로", fs.readFileSync(path.join(PROJ, "luna_body.js"), "utf8").indexOf('"9999-1"') !== -1);
t("깨진 본체: 컴파일 안 부름", compiled === 1);
remoteBody = null;
say("멱살잡힌스쳐(후파)", "/루나업데이트", "HA");
await flush(); await flush();
t("깃헙 안 됨: 실패 안내", sent.join().indexOf("깃헙 응답 404") !== -1, sent);

// ── 5. 옛 데이터 가져오기 ──
const OLD = path.join(HERE, "old").replace(/\\/g, "/");
fs.rmSync(OLD, { recursive: true, force: true }); fs.mkdirSync(OLD);
fs.writeFileSync(OLD + "/luna_Database.json", JSON.stringify({ userData: { "#h:H9": 7 }, roomUsers: { "루나": ["#h:H9"] }, people: { "#h:H9": { name: "옛사람", last: "옛사람" } } }));
fs.writeFileSync(OLD + "/claude_token.txt", "ghp_test");
t("가져오기: 관리자만", say("철수", "/루나가져오기 " + OLD, "H1") === "");
r = say("멱살잡힌스쳐(후파)", "/루나가져오기 " + OLD, "HA");
await flush();
t("가져오기: 두 파일", r.indexOf("luna_Database.json: 가져옴 ✅") !== -1 && r.indexOf("claude_token.txt: 가져옴 ✅") !== -1, r);
t("가져오기: 지금 것 .bak", fs.existsSync(path.join(PROJ, "data", "luna_Database.json.bak")));
t("가져오기: 다시 컴파일", compiled === 2);
// 다시 컴파일된 것처럼 새로 불러오면 옛 기록이 보인다
main = await import(pathToFileURL(path.join(PROJ, "main.js")).href + "?v=2");
r = say("x", "/랭킹", "HX");
t("가져온 기록이 랭킹에", r.indexOf("옛사람: 7재련") !== -1, r);

// ── 6. 클로드 답변 (fetch 로 백그라운드) ──
say("멱살잡힌스쳐(후파)", "..", "HA");
answer = { ok: true, answer: "저녁은 김치찌개!" };
fetchLog = [];
r = say("철수", ".저녁 뭐 먹지?", "H1");
t("클로드: 생각 중", r.indexOf("생각 중이에요") !== -1, r);
for (let i = 0; i < 10; i++) await flush();
t("클로드: 질문 올리고 깨우고 읽기", fetchLog.some((x) => x.indexOf("PUT") === 0) && fetchLog.some((x) => x.indexOf("POST") === 0) && fetchLog.some((x) => x.indexOf("/ask/a-") !== -1), fetchLog);
t("클로드: 답 보냄", sent.join().indexOf("저녁은 김치찌개!") !== -1, sent);

// ── 7. 오류가 밖으로 안 나간다 ──
let threw = false;
try { main.onMessage({ room: null, message: "/x", sender: null }); } catch (e) { threw = true; }
t("이상한 이벤트도 안 터짐", !threw);

console.log(ok + " 통과, " + bad + " 실패");
process.exit(0);
