// StarLight(NeonJS) 오토봇 로더 시험 — Projects·FileStream·BotManager·fetch 를 흉내 내고 로더를 진짜 ES 모듈로 불러온다.
// 사용 (저장소 맨 위에서): node bot/starlight/test/오토봇로더.test.mjs
import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const SRC = "bot/starlight";
const KEY = "auto";
const HERE = fs.mkdtempSync(path.join(os.tmpdir(), "starlight-auto-"));
const PROJ = path.join(HERE, "proj");
fs.mkdirSync(path.join(PROJ, "data"), { recursive: true });
fs.writeFileSync(path.join(PROJ, "package.json"), '{"type":"module"}');
fs.copyFileSync(path.join(SRC, "오토봇로더.js"), path.join(PROJ, "main.js"));
const BODY = fs.readFileSync(path.join(SRC, "오토봇.js"), "utf8");
const DATA = fs.readFileSync("bot/오토봇데이터.json", "utf8");

let ok = 0, bad = 0;
function t(n, c, i) { if (c) ok++; else { bad++; console.log("FAIL", n, i === undefined ? "" : JSON.stringify(i)); } }

// ── 가짜 StarLight ──
globalThis.FileStream = {
    exists: (p) => fs.existsSync(p),
    read: (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null),
    write: (p, d) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, String(d)); return String(d); },
    remove: (p) => { try { fs.unlinkSync(p); return true; } catch (e) { return false; } },
    createDir: (p) => { fs.mkdirSync(p, { recursive: true }); return true; }
};
const dirObj = (p) => ({ absolutePath: p });
globalThis.Projects = { getSelf: () => ({
    directory: dirObj(PROJ.replace(/\\/g, "/")),
    getDataDirectory: () => dirObj(path.join(PROJ, "data").replace(/\\/g, "/"))
}) };
let sent = [], compiled = 0;
globalThis.BotManager = { getCurrentBot: () => ({
    send: (r, m) => { sent.push(r + "|" + m); return true; },
    compile: () => { compiled++; return true; }
}) };
globalThis.Chat = { findRoom: () => null };
const realSetTimeout = setTimeout;
globalThis.setTimeout = (fn) => realSetTimeout(fn, 0);
let fetchLog = [], remoteBody = BODY, remoteData = DATA;
globalThis.fetch = async (url) => {
    fetchLog.push(url.split("?")[0]);
    const R = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => body });
    // 자동응답 데이터와 본체 코드는 같은 raw 주소라 파일 이름으로 가른다
    if (url.indexOf(encodeURIComponent("오토봇데이터.json")) !== -1) {
        return remoteData === null ? R(500, "") : R(200, remoteData);
    }
    if (url.indexOf("raw.githubusercontent.com") !== -1) {
        return remoteBody === null ? R(404, "") : R(200, remoteBody);
    }
    return R(404, "");
};

function room(name) {
    return { name, isGroupChat: () => true, send: (m) => { sent.push(name + "|" + m); return true; } };
}
function say(sender, msg, id, rname) {
    sent = [];
    main.onMessage({ room: room(rname || "오토2"), message: msg, sender: { name: sender, id: id === undefined ? null : id } });
    return sent.join("\n");
}
const flush = () => new Promise((r) => realSetTimeout(r, 30));

// ── 1. 처음 설치 ──
let main = await import(pathToFileURL(path.join(PROJ, "main.js")).href);
await flush();
t("처음: 깃헙에서 본체 받음", fs.existsSync(path.join(PROJ, KEY + "_body.js")));
t("처음: 자동응답 데이터도 받음", fetchLog.some((u) => u.indexOf(encodeURIComponent("오토봇데이터.json")) !== -1), fetchLog);
t("데이터 폴더에 캐시 저장", fs.existsSync(path.join(PROJ, "data", "오토봇캐시.json")));

let info = say("x", "/오토로더");
t("로더 상태: 본체 있음", /본체: \d{4}-\d+\S* ✅/.test(info) && info.indexOf("데이터: 깃헙") !== -1, info);

// ── 2. 자동응답 ──
t("봇테스트", say("철수", "봇테스트", "H1").indexOf("정상 동작") !== -1);
t("질문", say("철수", "질문", "H1").indexOf("자주 묻는 질문") !== -1);
t("말 속에 섞이면 무반응", say("철수", "질문이 있는데요", "H1") === "");
t("목록에 없는 방 무시", say("철수", "봇테스트", "H1", "아무방") === "");
t("EXTRA_ROOMS 방은 동작", say("철수", "봇테스트", "H1", "멱살반2").indexOf("정상 동작") !== -1);

// ── 3. 등록 · 권한 · 저장 ──
t("조교만 등록 (멱살반2)",
    say("[조교] 아는아이", "/등록_출석_밤 11시까지", "HA", "멱살반2").indexOf("등록했어요") !== -1);
t("등록분 응답", say("철수", "출석", "H1", "멱살반2").indexOf("밤 11시까지") !== -1);
t("권한 없으면 조용히", say("철수", "/등록_장난_x", "H1", "멱살반2") === "");
await flush();
t("data 폴더에 등록 저장", fs.existsSync(path.join(PROJ, "data", "멱살응답.json")));

// ── 4. 닉변 감지 — StarLight 의 sender.id 는 앞사람 것이 섞여 와서 안 쓴다. 카톡 DB(KakaoDB) 이벤트로 잡는다 ──
say("미미르", "안녕", "H9");
say("미친미르", "바꿈", "H9");
let nick = say("x", "/닉변감지", "HX");
t("sender.id 로는 닉변을 안 잡음", nick.indexOf("미미르 → 미친미르") === -1, nick);
globalThis.KakaoDB = { isConnected: true };
const jl = (a) => ({ size: () => a.length, get: (i) => a[i] });
const kroom = (name) => ({ name, customName: null, send: (m) => { sent.push(name + "|" + m); return true; }, getMembers: () => jl([{ id: "1", name: "원래있던분", isMe: false }]) });
const kev = (fn, e) => { sent = []; main[fn](Object.assign({ room: kroom("오토2") }, e)); return sent.join("\n"); };
const KU = (id, name) => ({ id: String(id), name, isMe: false });
t("입장 환영 (오토2)", kev("onKakaoMemberJoined", { members: jl([KU(7, "새학생")]) }) === "오토2|새학생님 어서오세요");
t("원래 있던 분 퇴장", kev("onKakaoMemberLeft", { member: KU(1, "원래있던분"), isKicked: false }) === "오토2|원래있던분님이 나가셨어요");
t("돌아옴", kev("onKakaoMemberJoined", { members: jl([KU(1, "바뀐이름")]) }) === "오토2|바뀐이름님(구 원래있던분님) 돌아오신걸 환영해요");
const KM = (id, name, text) => ({ senderId: String(id), sender: KU(id, name), text, type: "TEXT", isMine: false });
kev("onKakaoMessage", { message: KM(9, "미미르", "안녕") });
t("말할 때 닉변 알림", kev("onKakaoMessage", { message: KM(9, "미친미르", "바꿈") }) === "오토2|🔄 대화명 변경: 미미르 → 미친미르");
t("삭제 알림", kev("onKakaoMessageDeleted", { message: KM(9, "미친미르", "지운 말") }) === "오토2|🗑️ 미친미르님이 메시지를 지웠어요\n지운 말");
t("EXTRA_ROOMS 방도 감지", (() => { sent = []; main.onKakaoMemberJoined({ room: kroom("멱살반2"), members: jl([KU(8, "멱살새분")]) }); return sent.join(); })() === "멱살반2|멱살새분님 어서오세요");
t("목록에 없는 방 무시", (() => { sent = []; main.onKakaoMemberJoined({ room: kroom("아무방"), members: jl([KU(8, "x")]) }); return sent.length; })() === 0);
nick = say("x", "/닉변감지", "HX");
t("닉변 잡힘 (카톡 DB 기록)", nick.indexOf("미미르 → 미친미르") !== -1, nick);
t("hash 안 보임", nick.indexOf("H9") === -1 && nick.indexOf("#h:") === -1);
t("/감지 끄기는 조교·관리자만", say("철수", "/감지 입장 끄기", "H1") === "" && say("[조교] 아는아이", "/감지 입장 끄기", "HA").indexOf("껐어요") !== -1);
t("꺼진 방에선 조용", kev("onKakaoMemberJoined", { members: jl([KU(30, "조용")]) }) === "");
say("[조교] 아는아이", "/감지 입장 켜기", "HA");
t("로더 상태에 카톡 DB 줄", say("x", "/오토로더").indexOf("카톡 DB 감지: 연결됨 ✅") !== -1);
t("감지 기록 파일", fs.existsSync(path.join(PROJ, "data", "auto_kakao.json")));

// ── 4-2. 오픈프로필로 들어온 사람 안내 + 폰 사진 (오토봇만) ──
{
    let media = [];
    let members = [{ id: "1", name: "원래있던분", isMe: false }];
    const PU = (id, name, pt) => ({ id: String(id), name, isMe: false, kind: "open_member", toJson: () => JSON.stringify({ id: String(id), name, profileType: pt }) });
    const proom = (name) => ({ name, customName: null, isOpenChat: true,
        send: (m) => { sent.push(name + "|" + m); return true; },
        sendMedia: (p) => { media.push(name + "|" + p); return Promise.resolve({ error: null }); },
        getMembers: () => jl(members) });
    const pj = (m, rname) => { sent = []; media = []; main.onKakaoMemberJoined({ room: proom(rname || "오토2프프"), members: jl([m]) }); return sent.join("\n"); };
    let r = pj(PU(40, "오픈님", 16));
    t("오픈프로필 → 안내 글", r.indexOf("오토2프프|오픈님님, 오픈프로필로 들어오셨어요. 사진을 참고 하셔서 카카오톡 기본 프로필로 바꿔 주세요 🙏") !== -1, r);
    t("오픈프로필 → 폰 사진", media.join() === "오토2프프|/sdcard/Download/오픈프로필안내.jpg", media);
    r = pj(PU(41, "기본님", 1));
    t("기본 프로필 → 안내 없음", r === "오토2프프|기본님님 어서오세요" && media.length === 0, r);
    r = pj(PU(42, "닉네임님", 2));
    t("닉네임 프로필 → 안내", r.indexOf("닉네임님님, 오픈프로필로") !== -1 && media.length === 1, r);
    // 들어온 직후 종류를 모르면 몇 초 뒤 멤버 목록에서 다시 본다
    members = [{ id: "43", name: "늦은님", isMe: false, kind: "open_member", toJson: () => JSON.stringify({ profileType: 16 }) }];
    pj({ id: "43", name: "늦은님", isMe: false, toJson: () => "{}" });
    await flush();
    t("종류를 늦게 알아도 안내", sent.join().indexOf("늦은님님, 오픈프로필로") !== -1 && media.length === 1, sent);
    t("/감지 프로필 끄기 (관리자)", say("[조교] 아는아이", "/감지 프로필 끄기", "HA", "오토2프프").indexOf("프로필 감지를 껐어요") !== -1);
    r = pj(PU(44, "꺼짐님", 16));
    t("꺼진 방에선 안내 없음", r.indexOf("오픈프로필로") === -1 && media.length === 0, r);
    t("다른 방은 그대로", pj(PU(45, "멱살님", 16), "멱살반2").indexOf("멱살님님, 오픈프로필로") !== -1);
    say("[조교] 아는아이", "/감지 프로필 켜기", "HA", "오토2프프");
    r = say("철수", "/프로필사진 /sdcard/x.jpg", "H1", "오토2프프");
    t("/프로필사진 은 관리자만", r === "", r);
    r = say("후파", "/프로필사진 /sdcard/Pictures/안내2.png", "H1", "오토2프프");
    t("/프로필사진 바꾸기", r.indexOf("/sdcard/Pictures/안내2.png 으로 바꿨어요") !== -1, r);
    pj(PU(46, "새오픈", 16));
    t("바꾼 사진으로 보냄", media.join() === "오토2프프|/sdcard/Pictures/안내2.png", media);
    members = [{ id: "50", name: "확인님", isMe: false, kind: "open_member", toJson: () => JSON.stringify({ profileType: 2 }) }];
    r = say("확인님", "/내프로필", "H5", "오토2프프");
    t("/내프로필", r.indexOf("종류 값: 2 (닉네임 프로필)") !== -1 && r.indexOf("안내를 받는 종류") !== -1, r);
    t("/감지 에 사진 경로", say("x", "/감지", "HX", "오토2프프").indexOf("프로필 안내 사진: /sdcard/Pictures/안내2.png") !== -1);
}

// ── 5. /내정보 ──
let r = say("영희", "/내정보", "SECRET-HASH-123");
t("내정보: 값은 비공개", r.indexOf("받음 (값은 비공개) — 쓰지 않음") !== -1 && r.indexOf("SECRET") === -1, r);
t("내정보: id 없으면 없음", say("영희", "/내정보", null).indexOf("hash: 없음") !== -1);

// ── 6. 업데이트 ──
t("관리자 아니면 무시", say("철수", "/오토업데이트", "H1") === "");

// 같은 버전 → 데이터만 다시 받고 진단을 붙여 답한다 (다시 컴파일 안 함)
say("후파", "/오토업데이트", "HA");
await flush(); await flush();
let upd = sent.join("\n");
t("같은 버전: 데이터만", upd.indexOf("최신으로 바꿨어요") !== -1 && upd.indexOf("🤖 오토봇 v") !== -1, upd);
t("같은 버전: 다시 컴파일 안 함", compiled === 0, compiled);

// 새 버전 → 본체 교체 + 다시 컴파일
remoteBody = BODY.replace(/var BOT_VER = "[^"]*";/, 'var BOT_VER = "9999-1";');
say("후파", "/오토업데이트", "HA");
await flush(); await flush();
t("새 버전: 안내", sent.join().indexOf("본체 9999-1") !== -1, sent);
t("새 버전: 본체 바뀌고 옛 본체 남김",
    fs.readFileSync(path.join(PROJ, KEY + "_body.js"), "utf8").indexOf('"9999-1"') !== -1 &&
    fs.existsSync(path.join(PROJ, KEY + "_body_prev.js")));
t("새 버전: 다시 컴파일 부름", compiled === 1, compiled);
t("시험 파일 지움", fs.readdirSync(PROJ).filter((f) => f.indexOf("_test_") !== -1).length === 0);

// 깨진 본체는 받지 않는다
const before = fs.readFileSync(path.join(PROJ, KEY + "_body.js"), "utf8");
remoteBody = BODY.replace(/var BOT_VER = "[^"]*";/, 'var BOT_VER = "9998-1";')
    .replace("function inRooms(", "function inRooms((");
say("후파", "/오토업데이트", "HA");
await flush(); await flush();
t("깨진 본체: 안 바꿈", fs.readFileSync(path.join(PROJ, KEY + "_body.js"), "utf8") === before);
t("깨진 본체: 실패 알림", sent.join().indexOf("업데이트 실패") !== -1, sent);

// ── 7. 깃헙이 안 될 때 ──
remoteBody = null; remoteData = null;
say("후파", "/오토업데이트", "HA");
await flush(); await flush();
t("깃헙 안 됨: 지금 본체로 계속", sent.join().indexOf("계속 돌아요") !== -1, sent);
t("깃헙 안 됨: 자동응답은 그대로", say("철수", "봇테스트", "H1").indexOf("정상 동작") !== -1);

// ── 8. 옛 데이터 가져오기 ──
const old = path.join(HERE, "old");
fs.mkdirSync(old, { recursive: true });
fs.writeFileSync(path.join(old, "등록응답.json"), '{"옛명령":"옛답"}');
r = say("후파", "/오토가져오기 " + old.replace(/\\/g, "/"), "HA");
t("가져오기: 복사됨", r.indexOf("등록응답.json: 가져옴 ✅") !== -1, r);
t("가져오기: data 폴더에 생김", fs.existsSync(path.join(PROJ, "data", "등록응답.json")));
await flush();
t("가져오기: 다시 컴파일", compiled === 2, compiled);

console.log((bad ? "✗ " + bad + "개 실패 / " : "") + ok + "개 통과");
fs.rmSync(HERE, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
