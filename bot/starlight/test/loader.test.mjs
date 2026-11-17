// StarLight(NeonJS) 로더 시험 — Projects·FileStream·BotManager·Chat·fetch 를 흉내 내고 로더를 진짜 ES 모듈로 불러온다.
// 사용 (저장소 맨 위에서): node bot/starlight/test/loader.test.mjs bot/starlight [루나|토마토|레몬|거북|사건]
import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const SRC = process.argv[2];
const KIND = process.argv[3] || "루나";
const KEY = { "루나": "luna", "토마토": "tomato", "레몬": "lemon", "거북": "turtle", "사건": "sageon" }[KIND];
const DBFILE = KIND === "사건" ? "Database.json" : KEY + "_Database.json";   // 사건봇은 메신저봇R 때부터 이 이름
const HERE = fs.mkdtempSync(path.join(os.tmpdir(), "starlight-" + KEY + "-"));
const PROJ = path.join(HERE, "proj");
fs.rmSync(PROJ, { recursive: true, force: true });
fs.mkdirSync(path.join(PROJ, "data"), { recursive: true });
fs.writeFileSync(path.join(PROJ, "package.json"), '{"type":"module"}');
fs.copyFileSync(path.join(SRC, KIND + "봇로더.js"), path.join(PROJ, "main.js"));
const BODY = fs.readFileSync(path.join(SRC, KIND + "봇.js"), "utf8");

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
let remoteCore = fs.readFileSync(path.join(SRC, KIND + "봇로더코어.js"), "utf8");
globalThis.fetch = async (url, opt) => {
    opt = opt || {};
    fetchLog.push((opt.method || "GET") + " " + url.split("?")[0]);
    const R = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
    // 로더 코어 (2026-11-17 — 폰의 틀이 받아 쓴다)
    if (decodeURIComponent(url).indexOf("로더코어.js") !== -1) return remoteCore === null ? R(404, "") : R(200, remoteCore);
    if (url.indexOf("raw.githubusercontent.com") !== -1) return remoteBody === null ? R(404, "") : R(200, remoteBody);
    if (opt.method === "PUT") return R(201, "{}");
    if (opt.method === "POST") return R(204, "");
    if (url.indexOf("/ask/a-") !== -1) return answer ? R(200, JSON.stringify(answer)) : R(404, "");
    return R(404, "");
};

let media = [], mediaResult = {};
function room(name) {
    return { name, isGroupChat: () => true, send: (m) => { sent.push(name + "|" + m); return true; },
        sendMedia: (p) => { media.push(name + "|" + p); return Promise.resolve(mediaResult); } };
}
function say(sender, msg, id, rname) {
    sent = [];
    main.onMessage({ room: room(rname || KIND), message: msg, sender: { name: sender, id: id === undefined ? null : id } });
    return sent.join("\n");
}
const flush = () => new Promise((ok) => realSetTimeout(ok, 30));

// ── 1. 처음 설치: 본체가 없으면 깃헙에서 받아 둔다 ──
let main = await import(pathToFileURL(path.join(PROJ, "main.js")).href);
t("처음: 깃헙에서 받음", fetchLog.some((x) => x.indexOf("raw.githubusercontent.com") !== -1) && fs.existsSync(path.join(PROJ, KEY + "_body.js")));
let info = say("x", "/" + KIND + "로더", "HX");
t("로더 상태: 본체 있음", /본체: \d{4}-\d+\S* ✅ \(깃헙에서 처음 받음\)/.test(info), info);

// ── 2. 재련·저장 ──
Math.random = () => 0;   // 재련은 늘 성공
let r = say("철수", "재련가즈아", "H1");
t("재련", r.indexOf("철수님, 1 → 2") !== -1, r);
const db = JSON.parse(fs.readFileSync(path.join(PROJ, "data", DBFILE + ""), "utf8"));
t("data 폴더에 저장 + 대화명 키 (StarLight id 는 안 씀)", db.userData["철수"] === 2 && !db.userData["#h:H1"], db.userData);
// 2026-11-16 토마토 방에서 겪은 것: StarLight 는 id 를 앞사람 메시지에서 읽는다 → 이름으로만 사람을 찾는다
r = say("영희", "재련가즈아", "H1");   // 앞사람(철수)의 id 가 섞여 와도
t("앞사람 id 가 와도 본인 기록", r.indexOf("영희님, 1 → 2") !== -1, r);
t("다른 방 무시", say("철수", "재련가즈아", "H1", "다른방") === "");
t("고정 응답 (루나만)", say("x", "퉤", "HX") === (KIND === "루나" ? "루나|후룹" : ""));
// 고정 사진 응답 — 루나 방에서만 (2026-11-17)
media = [];
t("사진 응답: 글은 안 보냄", say("x", "퐁듀는", "HX") === "");
t("사진 응답 (루나만)", media.join() === (KIND === "루나" ? "루나|/sdcard/Download/퐁듀는.jpg" : ""), media);
media = [];
say("x", " 퐁듀는 ", "HX");
t("사진 응답: 앞뒤 공백 무시", media.length === (KIND === "루나" ? 1 : 0), media);
media = [];
say("x", "퐁듀는 귀엽다", "HX"); say("x", "퐁듀", "HX");
t("사진 응답: 다른 말엔 안 보냄", media.length === 0, media);
if (KIND === "루나") {
    mediaResult = { error: "파일 없음" };
    say("x", "퐁듀는", "HX"); await flush();
    t("사진 실패: 안내", sent.join().indexOf("퐁듀는.jpg 를 못 보냈어요") !== -1, sent);
    mediaResult = {};
    r = say("x", "/등록 퐁듀는 아무말", "HX");
    t("사진 이름은 등록 거절", r.indexOf("봇이 이미 쓰는 말이라 등록할 수 없습니다") !== -1, r);
    // 여러 장을 한 번에 묶어서 (물슈노스킬 → 물슈1~12.jpg, 2026-11-17) — sendMedia 에 경로 목록 하나
    const want = []; for (let i = 1; i <= 12; i++) want.push("/sdcard/Download/물슈" + i + ".jpg");
    let calls = [], res = {}, hold = null;
    const rm = room("루나");
    rm.sendMedia = (p) => { calls.push(p); return hold ? hold.p : Promise.resolve(res); };
    const sayM = () => { sent = []; main.onMessage({ room: rm, message: "물슈노스킬", sender: { name: "x", id: null } }); };
    sayM(); await flush();
    t("일괄: sendMedia 한 번", calls.length === 1, calls);
    t("일괄: 1~12 순서대로 목록", Array.isArray(calls[0]) && calls[0].join() === want.join(), calls[0]);
    t("일괄: 글은 안 보냄", sent.length === 0, sent);
    // 보내는 동안 또 치면 무시
    calls = []; let done; hold = { p: new Promise((ok) => { done = ok; }) };
    sayM(); sayM();
    t("일괄: 보내는 중엔 다시 쳐도 무시", calls.length === 1, calls);
    done({}); await flush(); hold = null;
    calls = []; sayM(); await flush();
    t("일괄: 다 보낸 뒤엔 다시 됨", calls.length === 1, calls);
    // 몇 장만 실패 / 전부 실패
    res = { sent: 10, failed: 2, error: "2 files failed" };
    sayM(); await flush();
    t("일괄: 일부 실패 안내", sent.join().indexOf("물슈노스킬 사진 12장 중 2장을 못 보냈어요") !== -1, sent);
    res = { sent: 0, failed: 12, error: "None of the 12 files could be prepared" };
    sayM(); await flush();
    t("일괄: 전부 실패 안내", sent.join().indexOf("물슈노스킬 사진 12장을 못 보냈어요") !== -1, sent);
    r = say("x", "/등록 물슈노스킬 아무말", "HX");
    t("여러 장 이름도 등록 거절", r.indexOf("봇이 이미 쓰는 말이라 등록할 수 없습니다") !== -1, r);
}

// ── 2-3. 조용히해 (관리자, 30분 뒤 저절로 풀림, 2026-11-17) ──
{
    const ADM = "멱살잡힌스쳐(후파)";
    r = say("철수", "/조용히해 영희", "H1");
    t("조용히해: 관리자만", r.indexOf("권한이 없습니다") !== -1, r);
    r = say(ADM, "/조용히해 영희", "HA");
    t("조용히해: 걸기", r.indexOf("영희님이 말할 때마다 \"조용히해\"") !== -1 && r.indexOf("30분") !== -1, r);
    r = say("영희", "안녕하세요", "H2");
    t("조용히해: 걸린 사람이 말하면", r === KIND + "|조용히해", r);
    r = say("영희", "재련가즈아", "H2");
    t("조용히해: 말은 평소처럼 처리", r.indexOf(KIND + "|조용히해") === 0 && r.indexOf("영희님,") !== -1, r);
    t("조용히해: 다른 사람은 그대로", say("철수", "안녕", "H1") === "");
    t("조용히해: 다른 방은 그대로", say("영희", "안녕", "H2", "다른방") === "");
    r = say(ADM, "/조용히해", "HA");
    t("조용히해: 목록", r.indexOf("· 영희 — 30분 남음") !== -1, r);
    r = say(ADM, "/조용히해 없는사람", "HA");
    t("조용히해: 모르는 이름", r.indexOf("찾을 수 없어요") !== -1, r);
    r = say(ADM, "/조용히해제_영희", "HA");
    t("조용히해: 풀기 (밑줄)", r.indexOf("영희님의 조용히해를 풀었어요") !== -1, r);
    t("조용히해: 풀린 뒤 조용", say("영희", "안녕", "H2") === "");
    // 30분 뒤 저절로
    say(ADM, "/조용히해_철수", "HA");
    t("조용히해: 다시 걸기", say("철수", "안녕", "H1") === KIND + "|조용히해");
    const realGetTime = Date.prototype.getTime;
    Date.prototype.getTime = function () { return realGetTime.call(this) + 31 * 60000; };
    t("조용히해: 30분 지나면 풀림", say("철수", "안녕", "H1") === "");
    Date.prototype.getTime = realGetTime;
    // 다시 켜도 유지 (데이터 파일)
    say(ADM, "/조용히해 영희", "HA");
    const db2 = JSON.parse(fs.readFileSync(path.join(PROJ, "data", DBFILE + ""), "utf8"));
    t("조용히해: 파일에 저장", db2.shush && db2.shush[KIND] && Object.keys(db2.shush[KIND]).length === 1, db2.shush);
    r = say(ADM, "/조용히해제 전부", "HA");
    t("조용히해: 전부 풀기", r.indexOf("모두 풀었어요 (1명)") !== -1, r);
    // 이름 일부만 써도 (2026-11-17 사용자 요청)
    say("김사과님", "안녕", "HS1"); say("김포도님", "안녕", "HS2");
    r = say(ADM, "/조용히해 사과", "HA");
    t("조용히해: 이름 일부로 걸기", r.indexOf("김사과님님이 말할 때마다") !== -1 && r.indexOf("/조용히해제 김사과님") !== -1, r);
    t("조용히해: 일부로 건 사람이 말하면", say("김사과님", "ㅎㅇ", "HS1") === KIND + "|조용히해");
    t("조용히해: 비슷한 이름은 그대로", say("김포도님", "ㅎㅇ", "HS2") === "");
    r = say(ADM, "/조용히해 김", "HA");
    t("조용히해: 여럿이면 후보 안내", r.indexOf("2명이에요") !== -1 && r.indexOf("· 김사과님") !== -1 && r.indexOf("· 김포도님") !== -1, r);
    t("조용히해: 여럿이면 안 걸림", say("김포도님", "ㅎㅇ", "HS2") === "");
    r = say(ADM, "/조용히해제 김", "HA");
    t("조용히해: 풀 때는 걸린 사람 중에서 찾음", r.indexOf("김사과님님의 조용히해를 풀었어요") !== -1, r);
    r = say(ADM, "/조용히해 없는사람", "HA");
    t("조용히해: 조각도 없으면", r.indexOf("찾을 수 없어요") !== -1, r);
    r = say("x", "/등록_조용히해_아무말", "HX");
    t("조용히해: 그냥 '조용히해' 는 등록 가능한 일반 말", r.indexOf("봇이 이미 쓰는 말") === -1, r);
    say("x", "/삭제_조용히해", "HX");
}

// ── 3. /내정보 — hash 값은 안 보인다 ──
r = say("영희", "/내정보", "SECRET-HASH-123");
t("내정보: 받지만 안 씀", r.indexOf("받음 (값은 비공개) — 쓰지 않음") !== -1 && r.indexOf("SECRET") === -1, r);
t("내정보: 디버그 방처럼 id 없음", say("영희", "/내정보", null).indexOf("hash: 없음") !== -1);

// ── 4. 업데이트 ──
t("관리자 아니면 무시", say("철수", "/" + KIND + "업데이트", "H1") === "");
remoteBody = BODY.replace(/var BOT_VER = "[^"]*";/, 'var BOT_VER = "9999-1";');
say("멱살잡힌스쳐(후파)", "/" + KIND + "업데이트", "HA");
await flush(); await flush();
t("업데이트: 안내", sent.join().indexOf("본체 9999-1") !== -1, sent);
t("업데이트: 본체 파일 바뀜 + 옛 본체 남김", fs.readFileSync(path.join(PROJ, KEY + "_body.js"), "utf8").indexOf('"9999-1"') !== -1 &&
    fs.existsSync(path.join(PROJ, KEY + "_body_prev.js")));
t("업데이트: 다시 컴파일 부름", compiled === 1, compiled);
t("업데이트: 시험 파일 지움", fs.readdirSync(PROJ).filter((f) => f.indexOf("_test_") !== -1).length === 0);
// 깨진 본체는 받지 않는다
remoteBody = BODY.replace("function refine(", "function refine((") ;
say("멱살잡힌스쳐(후파)", "/" + KIND + "업데이트", "HA");
await flush(); await flush();
t("깨진 본체: 실패 안내", sent.join().indexOf("업데이트 실패") !== -1, sent);
t("깨진 본체: 파일 그대로", fs.readFileSync(path.join(PROJ, KEY + "_body.js"), "utf8").indexOf('"9999-1"') !== -1);
t("깨진 본체: 컴파일 안 부름", compiled === 1);
remoteBody = null;
say("멱살잡힌스쳐(후파)", "/" + KIND + "업데이트", "HA");
await flush(); await flush();
t("깃헙 안 됨: 실패 안내", sent.join().indexOf("깃헙 응답 404") !== -1, sent);

// ── 5. 옛 데이터 가져오기 ──
const OLD = path.join(HERE, "old").replace(/\\/g, "/");
fs.rmSync(OLD, { recursive: true, force: true }); fs.mkdirSync(OLD);
fs.writeFileSync(OLD + "/" + DBFILE + "", JSON.stringify({ userData: { "#h:H9": 7, "#h:H8": 3, "#h:H7": 4 }, roomUsers: { [KIND]: ["#h:H9"] }, people: { "#h:H9": { name: "옛사람", last: "옛사람" }, "#h:H8": { name: "엑시아", last: "후파", at: 2 }, "#h:H7": { name: "후파", last: "착한생각", at: 1 } } }));
fs.writeFileSync(OLD + "/claude_token.txt", "ghp_test");
t("가져오기: 관리자만", say("철수", "/" + KIND + "가져오기 " + OLD, "H1") === "");
r = say("멱살잡힌스쳐(후파)", "/" + KIND + "가져오기 " + OLD, "HA");
await flush();
t("가져오기: 두 파일", r.indexOf(DBFILE + ": 가져옴 ✅") !== -1 && r.indexOf("claude_token.txt: 가져옴 ✅") !== -1, r);
t("가져오기: 지금 것 .bak", fs.existsSync(path.join(PROJ, "data", DBFILE + ".bak")));
t("가져오기: 다시 컴파일", compiled === 2);
// 다시 컴파일된 것처럼 새로 불러오면 옛 기록이 보인다
main = await import(pathToFileURL(path.join(PROJ, "main.js")).href + "?v=2");
r = say("x", "/랭킹", "HX");
t("가져온 기록이 랭킹에", r.indexOf("옛사람: 7재련") !== -1, r);
// 잘못된 id 로 최근 대화명(last)이 엉킨 기록이어도 최초 대화명으로 제 기록을 찾는다
r = say("후파", "재련가즈아", "H8");
t("엉킨 기록: 후파는 후파 것", r.indexOf("후파님, 4 → 5") !== -1, r);
r = say("엑시아", "재련가즈아", "H7");
t("엉킨 기록: 엑시아는 엑시아 것", r.indexOf("엑시아님, 3 → 4") !== -1, r);

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

// ── 8. 카톡 DB 회원 ID 로 사람 구분 — 대화명을 바꿔도 같은 사람 (2026-11-17) ──
{
    const dbMsgs = [];   // 카톡 DB 에 적힌 메시지 (가짜)
    globalThis.KakaoDB = { isConnected: true, getMessages: (roomId) => roomId === "123" ? dbMsgs.slice(-15) : [] };
    const kroom = { name: KIND, id: "123", isGroupChat: () => true, send: (m) => { sent.push(KIND + "|" + m); return true; } };
    const ksay = (name, msg, kid, wrongId) => {
        dbMsgs.push({ text: msg, senderId: kid, sender: { name }, isMine: false });
        sent = [];
        main.onMessage({ room: kroom, message: msg, sender: { name, id: wrongId || "앞사람" } });
        return sent.join("\n");
    };
    Math.random = () => 0;
    let r1 = ksay("영수", "재련가즈아", "5001");
    t("회원 ID: 처음 재련", r1.indexOf("영수님, 1 → 2") !== -1, r1);
    let r2 = ksay("영수바꿈", "재련가즈아", "5001");
    t("회원 ID: 대화명 바꿔도 이어짐 (표시는 처음 이름)", r2.indexOf("영수님, 2 → 3") !== -1, r2);
    let r3 = ksay("영수바꿈", "재련가즈아", "5001");
    t("회원 ID: 하루 횟수도 같은 사람", r3.indexOf("모두 사용") !== -1, r3);
    let r4 = ksay("옛사람", "재련가즈아", "5002");
    t("회원 ID: 옛 기록(#h:) 이어받음", r4.indexOf("옛사람님, 7 → 8") !== -1, r4);
    let r5 = ksay("영희", "재련가즈아", "5003", "5001");
    t("회원 ID: 알림 id 가 앞사람 것이어도 본인", r5.indexOf("영희님,") !== -1 && r5.indexOf("영수") === -1, r5);
    const saved = JSON.parse(fs.readFileSync(path.join(PROJ, "data", DBFILE), "utf8"));
    t("회원 ID 키로 저장", saved.userData["#h:k5001"] === 3 && !saved.userData["#h:H9"] && saved.userData["#h:k5002"] === 8, saved.userData);
    let info2 = say("영수바꿈", "/내정보", "X");
    t("/내정보: 회원 ID 값은 안 보임", info2.indexOf("5001") === -1);
    // 카톡 DB 가 아직 그 메시지를 못 적었으면 대화명으로 (같은 대화명의 회원 ID 사람에게 붙는다)
    sent = [];
    main.onMessage({ room: kroom, message: "/랭킹", sender: { name: "영수바꿈", id: "x" } });
    t("DB 에 없을 때도 랭킹은 그대로", sent.join().indexOf("영수: 3재련") !== -1, sent);
    delete globalThis.KakaoDB;
}

// ── 9. 틀 + 로더 코어 (2026-11-17) — 로더를 고쳐도 폰에 다시 붙여넣지 않게 ──
{
    const CORE = path.join(PROJ, KEY + "_core.js"), CPREV = path.join(PROJ, KEY + "_core_prev.js");
    const ADMIN = "멱살잡힌스쳐(후파)";
    const coreSrc = remoteCore;
    remoteBody = BODY;
    t("틀: 코어를 받아 둠", fs.existsSync(CORE) && fs.readFileSync(CORE, "utf8") === coreSrc);
    let s1 = say("x", "/" + KIND + "로더", "HX");
    t("로더 상태: 틀·코어 버전", s1.indexOf("로더 core-") !== -1 && s1.indexOf("틀 틀-") !== -1, s1);
    // 코어가 그대로면 코어 안내 없음
    let c0 = compiled;
    say(ADMIN, "/" + KIND + "업데이트", "HA"); await flush(); await flush();
    t("업데이트: 코어 그대로면 말 없음", sent.join().indexOf("로더 코어") === -1 && compiled === c0 + 1, sent);
    // 새 코어 — 본체와 같이 바뀐다
    remoteCore = coreSrc.replace(/const LOADER_VER = "[^"]*";/, 'const LOADER_VER = "core-9999-1";');
    say(ADMIN, "/" + KIND + "업데이트", "HA"); await flush(); await flush();
    t("새 코어: 안내", sent.join().indexOf("로더 코어도 core-9999-1 로 바꿨어요") !== -1, sent);
    t("새 코어: 파일 바뀜 + 옛 코어 남김", fs.readFileSync(CORE, "utf8").indexOf("core-9999-1") !== -1 &&
        fs.readFileSync(CPREV, "utf8") === coreSrc);
    t("새 코어: 시험 파일 지움", fs.readdirSync(PROJ).filter((f) => f.indexOf("_test_") !== -1).length === 0);
    // 깨진 코어는 받지 않고, 본체 업데이트는 그대로 한다
    remoteCore = coreSrc.replace("function loaderInfo(", "function loaderInfo((");
    c0 = compiled;
    say(ADMIN, "/" + KIND + "업데이트", "HA"); await flush(); await flush();
    t("깨진 코어: 못 받았다고 안내 + 본체는 받음", sent.join().indexOf("로더 코어는 못 받았어요") !== -1 &&
        sent.join().indexOf("다시 불러올게요") !== -1 && compiled === c0 + 1, sent);
    t("깨진 코어: 파일 그대로", fs.readFileSync(CORE, "utf8").indexOf("core-9999-1") !== -1);
    // 본체는 못 받아도 새 코어는 받았으면 다시 컴파일한다
    remoteCore = coreSrc; remoteBody = null; c0 = compiled;
    say(ADMIN, "/" + KIND + "업데이트", "HA"); await flush(); await flush();
    t("본체 실패 + 새 코어: 다시 컴파일", sent.join().indexOf("업데이트 실패") !== -1 && compiled === c0 + 1, sent);
    remoteBody = BODY;

    // 다시 컴파일된 것처럼 — node 는 같은 주소의 모듈을 다시 읽지 않으므로 프로젝트를 새 폴더로 옮겨 불러온다
    let PJ = PROJ, gen = 0;
    const fresh = async (mainName) => {
        const next = path.join(HERE, "proj" + (++gen));
        fs.cpSync(PJ, next, { recursive: true });
        PJ = next;
        globalThis.Projects = { getSelf: () => ({ directory: dirObj(PJ.replace(/\\/g, "/")), getDataDirectory: () => dirObj(path.join(PJ, "data").replace(/\\/g, "/")) }) };
        return import(pathToFileURL(path.join(PJ, mainName || "main.js")).href);
    };
    const pj = (f) => path.join(PJ, f);
    // 코어 파일이 깨지면 이전 코어로 돈다
    fs.writeFileSync(CORE, "export default async function loaderCore(CFG) { throw new Error('고장'); }");
    main = await fresh();
    let s2 = say("x", "/" + KIND + "로더", "HX");
    t("깨진 코어: 이전 코어로", s2.indexOf("이전 코어 (새 코어 오류로)") !== -1, s2);
    Math.random = () => 0;
    t("이전 코어로도 재련", say("새사람", "재련가즈아", "Z").indexOf("새사람님,") !== -1);

    // 둘 다 깨지면 틀이 직접 상태·다시 받기만 한다
    fs.writeFileSync(pj(KEY + "_core_prev.js"), "export default async function loaderCore(CFG) { throw new Error('고장2'); }");
    main = await fresh();
    let s3 = say("x", "/" + KIND + "로더", "HX");
    t("코어 없음: 틀이 상태 안내", s3.indexOf("로더 코어: 없음") !== -1 && s3.indexOf("고장2") !== -1, s3);
    t("코어 없음: 다른 말은 조용", say("x", "재련가즈아", "HX") === "");
    t("코어 없음: 관리자 아니면 무시", say("철수", "/" + KIND + "업데이트", "H1") === "");
    c0 = compiled;
    say(ADMIN, "/" + KIND + "업데이트", "HA"); await flush(); await flush();
    t("코어 없음: 관리자가 다시 받기", sent.join().indexOf("로더 코어를 다시 받았어요") !== -1 &&
        fs.readFileSync(pj(KEY + "_core.js"), "utf8") === coreSrc && compiled === c0 + 1, sent);
    main = await fresh();
    t("다시 받은 코어로 동작", say("x", "/" + KIND + "로더", "HX").indexOf("본체: ") !== -1);
    let threw2 = false;
    try { main.onKakaoMessage(null); main.onKakaoMemberJoined(undefined); } catch (e) { threw2 = true; }
    t("틀: 카톡 DB 이벤트 이상해도 안 터짐", !threw2);

    // 틀의 SETTINGS 가 코어 기본값보다 먼저
    const stub = fs.readFileSync(pj("main.js"), "utf8");
    t("틀: SETTINGS 자리", stub.indexOf("const SETTINGS = {\n};") !== -1);
    fs.writeFileSync(pj("main6.js"), stub.replace("const SETTINGS = {\n};", 'const SETTINGS = {\n    MY_ROOMS: ["다른방"],\n};'));
    main = await fresh("main6.js");
    t("틀 설정: 방을 바꾸면 그 방에서만", say("새사람2", "재련가즈아", "Z", "다른방").indexOf("새사람2님,") !== -1 &&
        say("새사람3", "재련가즈아", "Z") === "");

    // 거북봇: 시작 랭킹(78명) — 랭킹 이름 3명이 이 방에서 말하면 조용히 깔린다 (2026-11-17)
    if (KIND === "거북") {
        main = await fresh();
        say("몰랑/스나", "안녕", "T1");
        let rk = say("리/아", "ㅎㅇ", "T2");
        // (앞 시험에서 "후파" 가 이미 말해서 여기선 두 명만 더 말해도 3명이 된다)
        rk = say("날개구름", "ㅎㅇ", "T3");
        t("거북 랭킹: 방에는 아무 말 안 함", rk === "", rk);
        rk = say("x", "/랭킹", "HX");
        t("거북 랭킹: 1등 몰랑/스나 15", /1\S*\s*몰랑\/스나: 15/.test(rk) || rk.indexOf("몰랑/스나: 15") !== -1, rk);
        t("거북 랭킹: 10·8·7 단계도", rk.indexOf("무소유의김사장/상인: 10") !== -1 && rk.indexOf("날개구름: 8") !== -1 && rk.indexOf("꾸동/뀨동: 7") !== -1, rk);
        t("거북 랭킹: 순서", rk.indexOf("몰랑/스나") < rk.indexOf("무소유의김사장/상인") && rk.indexOf("무소유의김사장/상인") < rk.indexOf("날개구름"), rk);
        rk = say("몰랑/스나", "재련가즈아", "T1");
        t("거북 랭킹: 15 는 최고 단계라 더 못 올림", rk.indexOf("15") !== -1, rk);
        rk = say("날개구름", "재련가즈아", "T3");
        t("거북 랭킹: 이어서 재련 (8 → 9)", rk.indexOf("8 → 9") !== -1, rk);
    }
}

console.log(ok + " 통과, " + bad + " 실패");
process.exit(0);
