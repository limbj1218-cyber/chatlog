/**
 * ═══════════════════════════════════════════════════════════
 *  사건봇 로더 — StarLight(NeonJS) 판 (2026-11-16)
 *
 *  이 파일을 StarLight 프로젝트의 메인 스크립트에 붙여넣는다. (메신저봇R 판 bot/사건봇로더.js 는 그대로 둔다)
 *
 *  ◆ 프로젝트 만들 때
 *    - 언어: NeonJS
 *    - API 방식: StarLight 원본 + 메신저봇 API2  (원본 = onMessage·Projects·Chat, API2 = FileStream·BotManager)
 *    - 받을 이벤트: starlight.message.create (onMessage)
 *      + 카톡 DB 플러그인(KakaoDB)이 연결돼 있으면 kakaodb.member.join · kakaodb.member.leave ·
 *        kakaodb.message.create · kakaodb.message.delete 도 체크 (입퇴장·닉변·삭제 감지).
 *        kakaodb.* 로 한꺼번에 켜도 되지만 플러그인 설정의 "onMessage 호환 이벤트" 는 꺼 둘 것 (메시지가 두 번 온다)
 *
 *  ◆ 동작
 *    - 본체(bot/starlight/사건봇.js)를 깃헙에서 받아 프로젝트 폴더에 sageon_body.js 로 두고 import 한다.
 *      한 번 받아 두면 깃헙이 안 돼도 그 파일로 돈다.
 *    - /사건업데이트 (관리자) → 새 본체를 받아 먼저 읽어 보고(깨진 본체로 바꾸지 않게), 바꾼 뒤 다시 컴파일한다.
 *      옛 본체는 sageon_body_prev.js 로 남겨 새 본체가 실패하면 그걸로 돈다.
 *    - 데이터 파일(Database.json·claude_token.txt)은 프로젝트의 data 폴더에 둔다.
 *    - /사건로더 (상태), /내정보 (사람 구분 값이 오는지 — 값은 절대 안 보여 준다), /사건가져오기 (옛 데이터 파일 가져오기, 관리자)
 *
 *  ※ 메시지 처리 중에는 네트워크를 기다리지 않는다 — fetch 는 await 하는 동안 다른 메시지를 처리한다.
 *  ※ onMessage 밖으로 오류가 나가면 StarLight 가 프로젝트를 꺼 버리므로(오류 발생시 비활성화) 전부 잡는다.
 * ═══════════════════════════════════════════════════════════
 */
const LOADER_VER = "sl-1117-1";
const KEY = "sageon";
const BOT_NAME = "사건봇";

// ── 폰에만 두는 설정 (비워두면 본체 기본값 사용) ────────────
const MY_ROOMS = ["사건"];
// 본체 관리자 — 정확히 일치 (메신저봇R 판 사건봇로더와 같다). 본체의 EXTRA_ADMIN_PARTS("후파" 포함)도 관리자다
const MY_ADMINS = ["사업처임병진", "가이아✡", "가이어트"];
// 로더 명령(/사건업데이트·/사건가져오기)을 쓸 수 있는 사람 — 위 이름과 정확히 같거나, 대화명에 이 낱말이 들어 있으면
const LOADER_ADMIN_PARTS = ["후파"];
// ────────────────────────────────────────────────────────────

const CMD_UPDATE = "/사건업데이트";
const CMD_INFO = "/사건로더";
const CMD_IMPORT = "/사건가져오기";
const SRC_URL = "https://raw.githubusercontent.com/limbj1218-cyber/chatlog/main/bot/starlight/" +
    encodeURIComponent(BOT_NAME + ".js");

// 옛 메신저봇R 판이 데이터를 두던 곳 (가져오기에서 차례로 찾아본다)
const OLD_DATA_PLACES = [
    "/sdcard/Download",
    "/sdcard/사건",
    "/sdcard/Android/data/com.xfl.msgbot/files",
    "/sdcard/Android/data/com.xfl.msgbot/files/sageon"
];
const DATA_FILES = ["Database.json", "claude_token.txt"];

const self = Projects.getSelf();
const PROJECT_DIR = String(self.directory.absolutePath);
const DATA_DIR = String(self.getDataDirectory().absolutePath);
const BODY_REL = "./" + KEY + "_body.js";
const BODY_FILE = PROJECT_DIR + "/" + KEY + "_body.js";
const PREV_REL = "./" + KEY + "_body_prev.js";
const PREV_FILE = PROJECT_DIR + "/" + KEY + "_body_prev.js";

const rooms = {};          // 방 이름 → 마지막으로 메시지가 온 방 객체 (먼저 말 걸기 예비)
let body = null;           // 본체가 돌려준 { response, version, … }
let bodyFrom = "";
let loadErr = "";
let lastErr = "";
let updating = false;
let lastErrorReportAt = 0;

function isLoaderAdmin(sender) {
    const n = String(sender);
    return MY_ADMINS.some((a) => a && n === a) || LOADER_ADMIN_PARTS.some((a) => a && n.indexOf(a) !== -1);
}

function inMyRooms(room) {
    return !MY_ROOMS.length || MY_ROOMS.indexOf(room) !== -1;
}

function ensureDir(path) {
    try { if (!FileStream.exists(path)) FileStream.createDir(path); } catch (e) {}
}

// ─── 본체에 넘기는 폰 기능 ───
const PLAT = {
    read(name) {
        try {
            const p = DATA_DIR + "/" + name;
            return FileStream.exists(p) ? FileStream.read(p) : null;
        } catch (e) { return null; }
    },
    write(name, text) {
        try {
            ensureDir(DATA_DIR);
            FileStream.write(DATA_DIR + "/" + name, String(text));
            return true;
        } catch (e) { lastErr = "저장 실패: " + e; return false; }
    },
    send(room, text) {
        try { const b = BotManager.getCurrentBot(); if (b && b.send(room, String(text))) return true; } catch (e) {}
        try { const r = Chat.findRoom(String(room)); if (r && r.send(String(text))) return true; } catch (e) {}
        try { const r = rooms[room]; if (r && r.send(String(text))) return true; } catch (e) {}
        return false;
    },
    fetch: (url, opt) => fetch(url, opt),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    setInterval: (fn, ms) => setInterval(fn, ms)
};

// ─── 본체 받기·읽기 ───
async function fetchBody() {
    const res = await fetch(SRC_URL + "?t=" + Date.now());
    if (!res.ok) throw new Error("깃헙 응답 " + res.status);
    const text = await res.text();
    if (text.indexOf("export default function") === -1) throw new Error("받아온 코드가 본체 형식이 아니에요");
    return text;
}

async function importFactory(rel) {
    const m = await import(rel);
    if (typeof m.default !== "function") throw new Error("본체 형식이 아니에요 (" + rel + ")");
    return m.default;
}

function start(factory, from) {
    body = factory(MY_ROOMS, MY_ADMINS, PLAT);
    bodyFrom = from;
}

// 컴파일할 때 (최상위 await — 메시지 처리 중이 아니라 기다려도 된다)
try {
    let from = "저장된 본체";
    if (!FileStream.exists(BODY_FILE)) {
        FileStream.write(BODY_FILE, await fetchBody());
        from = "깃헙에서 처음 받음";
    }
    start(await importFactory(BODY_REL), from);
} catch (e) {
    loadErr = String(e);
    try {
        if (FileStream.exists(PREV_FILE)) start(await importFactory(PREV_REL), "이전 본체 (새 본체 오류로)");
    } catch (e2) { loadErr += " / 이전 본체도 실패: " + e2; }
}
console.log("[" + BOT_NAME + "] 로더 " + LOADER_VER + " · 본체 " + (body ? body.version + " (" + bodyFrom + ")" : "없음 — " + loadErr));

// ─── /사건업데이트 ───
async function doUpdate(room) {
    if (updating) { room.send("⏳ 이미 업데이트 중이에요."); return; }
    updating = true;
    let testFile = "";
    try {
        const text = await fetchBody();
        // 깨진 본체로 바꾸면 다음 컴파일이 실패하므로, 먼저 다른 이름으로 저장해 읽어 본다
        const testName = KEY + "_body_test_" + Date.now() + ".js";
        testFile = PROJECT_DIR + "/" + testName;
        FileStream.write(testFile, text);
        await importFactory("./" + testName);
        const ver = (/var BOT_VER = "([^"]*)"/.exec(text) || [])[1] || "?";
        if (FileStream.exists(BODY_FILE)) FileStream.write(PREV_FILE, FileStream.read(BODY_FILE));
        FileStream.write(BODY_FILE, text);
        room.send("🔄 깃헙에서 최신 " + BOT_NAME + "(본체 " + ver + ")를 받았어요. 다시 불러올게요!");
        updating = false;
        setTimeout(() => {
            try { BotManager.getCurrentBot().compile(); } catch (e) { lastErr = "다시 컴파일 실패: " + e; }
        }, 300);
    } catch (e) {
        updating = false;
        lastErr = "업데이트 실패: " + e;
        room.send("⚠️ 업데이트 실패 — 지금 본체로 계속 돌아요.\n" + e);
    } finally {
        if (testFile) { try { FileStream.remove(testFile); } catch (e) {} }
    }
}

// ─── /사건가져오기 [폴더] — 옛 메신저봇R 판 데이터 파일을 data 폴더로 복사 ───
function importOldData(arg) {
    const places = arg ? [arg.replace(/\/+$/, "")] : OLD_DATA_PLACES;
    const lines = ["📦 옛 데이터 가져오기"];
    let copied = 0;
    ensureDir(DATA_DIR);
    for (const name of DATA_FILES) {
        let found = "";
        for (const dir of places) {
            try { if (FileStream.exists(dir + "/" + name)) { found = dir + "/" + name; break; } } catch (e) {}
        }
        if (!found) { lines.push("· " + name + ": 못 찾음"); continue; }
        try {
            const dst = DATA_DIR + "/" + name;
            if (FileStream.exists(dst)) FileStream.write(dst + ".bak", FileStream.read(dst));
            FileStream.write(dst, FileStream.read(found));
            copied++;
            lines.push("· " + name + ": 가져옴 ✅ (" + found + ")");
        } catch (e) { lines.push("· " + name + ": 실패 — " + e); }
    }
    if (copied) {
        lines.push("", "다시 불러올게요 — 잠시 뒤 /랭킹 으로 확인해 주세요.");
        setTimeout(() => { try { BotManager.getCurrentBot().compile(); } catch (e) { lastErr = "다시 컴파일 실패: " + e; } }, 300);
    } else {
        lines.push("", "옛 폰에서 " + DATA_FILES[0] + " 를 Download 폴더에 넣거나", CMD_IMPORT + " 폴더경로 로 알려 주세요.");
    }
    return lines.join("\n");
}

function loaderInfo(room, sender) {
    let st = {};
    try { st = body ? body.status() : {}; } catch (e) {}
    return "🧩 " + BOT_NAME + " 로더 상태 (StarLight · 로더 " + LOADER_VER + ")\n" +
        "본체: " + (body ? body.version + " ✅ (" + bodyFrom + ")" : "없음 ❌") + "\n" +
        "방 이름: [" + room + "] · 보낸 사람: [" + sender + "]\n" +
        "데이터 폴더: " + DATA_DIR + "\n" +
        "알림 시계: " + (st.timer || "없음") + "\n" +
        "카톡 DB 감지: " + kakaoDbState() + " · 회원 ID 찾기 " + kakaoIdHits + "번 성공 / " + kakaoIdMiss + "번 못 찾음" +
        (loadErr ? "\n불러오기 오류: " + loadErr : "") +
        (lastErr ? "\n최근 오류: " + lastErr : "");
}

function kakaoDbState() {
    if (!body || !body.kakao) return "이 봇에는 없음";
    try {
        if (typeof KakaoDB === "undefined") return "플러그인 없음";
        return KakaoDB.isConnected ? "연결됨 ✅ (이벤트 " + kakaoEvents + "개 받음)" : "플러그인 연결 끊김 ❌";
    } catch (e) { return "확인 실패: " + e; }
}

function myInfoText(sender, hash, kid) {
    return ["🪪 내 정보 (" + BOT_NAME + " 로더 " + LOADER_VER + ")", "대화명: " + sender, "받은 방식: StarLight onMessage",
        // ★ hash 는 사람을 구분하는 열쇠라 값은 절대 보여주지 않는다
        "보낸 사람 hash: " + (hash ? "받음 (값은 비공개) — 쓰지 않음" : "없음"),
        "카톡 DB 회원 ID: " + (kid ? "찾음 ✅ (값은 비공개)" : "못 찾음 ❌"),
        "", "카톡 DB 회원 ID 를 찾으면 대화명을 바꿔도 같은 사람으로 기록돼요.",
        "(못 찾으면 대화명으로 구분 — 카톡 DB 플러그인 연결을 확인)"].join("\n");
}

function isGroup(room) {
    try { return typeof room.isGroupChat === "function" ? !!room.isGroupChat() : !!room.groupChat; } catch (e) { return true; }
}

// ─── 카톡 DB(KakaoDB 플러그인)에서 이 메시지를 보낸 사람의 회원 ID 찾기 (2026-11-17) ───
// 알림의 방 ID(event.room.id)는 카톡 방 번호와 같다(KakaoDB 의 ReplyActionStore 가 그렇게 맞춘다).
// 그 방의 최근 메시지에서 내용이 같은 것을 찾아 senderId 를 쓴다 — chatLogId 는 JS 숫자로 오면 자릿수가 깨질 수 있어 안 쓴다.
// 못 찾으면(플러그인 없음·끊김·DB 가 아직 안 적음) null → 본체가 대화명으로 찾는다. 오류는 밖으로 안 낸다.
let kakaoIdHits = 0, kakaoIdMiss = 0;
function kakaoSenderId(event, sender) {
    try {
        if (typeof KakaoDB === "undefined" || !KakaoDB.isConnected) return null;
        const roomId = String(event.room.id || "");
        if (!/^\d+$/.test(roomId)) { kakaoIdMiss++; return null; }
        const text = String(event.message);
        const list = KakaoDB.getMessages(roomId, 15);
        const n = typeof list.size === "function" ? list.size() : list.length;
        let byText = null;
        for (let i = n - 1; i >= 0; i--) {                       // 최근 것부터
            const m = typeof list.get === "function" ? list.get(i) : list[i];
            if (!m || m.isMine || String(m.text) !== text) continue;
            const id = String(m.senderId || "");
            if (!id) continue;
            if (m.sender && String(m.sender.name) === sender) { kakaoIdHits++; return id; }
            if (!byText) byText = id;
        }
        if (byText) { kakaoIdHits++; return byText; }
        kakaoIdMiss++;
        return null;
    } catch (e) { kakaoIdMiss++; return null; }
}

// ─── 메시지 ───
export function onMessage(event) {
    let text = "";
    try {
        const room = String(event.room.name);
        text = String(event.message).trim();
        const sender = String(event.sender.name);
        const id = event.sender.id;
        const hash = id === null || id === undefined || String(id) === "" ? null : String(id);
        if (inMyRooms(room)) rooms[room] = event.room;

        if (text === CMD_UPDATE) {
            if (!isLoaderAdmin(sender)) return;
            doUpdate(event.room);
            return;
        }
        if (text === CMD_INFO) { event.room.send(loaderInfo(room, sender)); return; }
        if (text === "/내정보") {
            if (!inMyRooms(room)) return;
            event.room.send(myInfoText(sender, hash, kakaoSenderId(event, sender)));
            return;
        }
        if (text === CMD_IMPORT || text.indexOf(CMD_IMPORT + " ") === 0) {
            if (!isLoaderAdmin(sender) || !inMyRooms(room)) return;
            event.room.send(importOldData(text.substring(CMD_IMPORT.length).trim()));
            return;
        }

        if (!body) return;
        body.response(room, event.message, sender, isGroup(event.room),
            { reply: (t) => event.room.send(String(t)) },
            // ★ hash 는 넘기지 않는다 — StarLight 는 id 를 알림에 쌓인 첫 메시지(앞사람)에서 읽는다 (2026-11-16 겪음)
            //   대신 카톡 DB 에서 이 메시지를 찾아 보낸 사람의 회원 ID(kakaoId)를 넘긴다 — 대화명을 바꿔도 같은 사람
            { name: sender, hash: null, kakaoId: inMyRooms(room) ? kakaoSenderId(event, sender) : null, profileKey: () => null });
    } catch (e) {
        lastErr = String(e);
        const now = Date.now();
        if (text.indexOf("/") === 0 && now - lastErrorReportAt > 60000) {
            lastErrorReportAt = now;
            try { event.room.send("⚠️ " + BOT_NAME + " 로더 오류: " + e); } catch (e2) {}
        }
    }
}

// ─── 카톡 DB 플러그인(KakaoDB) 이벤트 → 본체의 입퇴장·닉변·삭제 감지 ───
// 플러그인이 없거나 이 봇 본체에 감지가 없으면 아무것도 안 한다. 오류는 밖으로 내보내지 않는다(프로젝트가 꺼진다).
let kakaoEvents = 0;
function kakaoForward(kind, event) {
    try {
        if (!body || !body.kakao || typeof body.kakao[kind] !== "function") return;
        kakaoEvents++;
        body.kakao[kind](event);
    } catch (e) { lastErr = "카톡 DB " + kind + ": " + e; }
}
export function onKakaoMemberJoined(event) { kakaoForward("joined", event); }
export function onKakaoMemberLeft(event) { kakaoForward("left", event); }
export function onKakaoMessage(event) { kakaoForward("message", event); }
export function onKakaoMessageDeleted(event) { kakaoForward("deleted", event); }
