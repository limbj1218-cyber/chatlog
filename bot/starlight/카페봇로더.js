/**
 * ═══════════════════════════════════════════════════════════
 *  카페봇 로더 (틀) — StarLight(NeonJS) 판 (2026-11-17)
 *
 *  이 파일을 StarLight 프로젝트의 메인 스크립트에 붙여넣는다. (메신저봇R 판 bot/카페봇로더.js 는 그대로 둔다)
 *
 *  ★ 이 틀은 거의 바뀌지 않는다. 로더 기능은 깃헙의 로더 코어(bot/starlight/카페봇로더코어.js)에 있고
 *    방에서 /카페업데이트 를 치면 본체와 함께 새로 받는다 — 로더를 고쳐도 폰에 다시 붙여넣지 않아도 된다.
 *
 *  ◆ 프로젝트 만들 때
 *    - 언어: NeonJS
 *    - API 방식: StarLight 원본 + 메신저봇 API2  (원본 = onMessage·Projects·Chat, API2 = FileStream·BotManager)
 *    - 받을 이벤트: starlight.message.create (onMessage)
 *
 *  ◆ 동작
 *    - 로더 코어를 깃헙에서 받아 프로젝트 폴더에 cafe_core.js 로 두고 import 해서, 메시지와 카톡 DB 이벤트를 그대로 넘긴다.
 *      한 번 받아 두면 깃헙이 안 돼도 그 파일로 돈다. 코어가 깨지면 cafe_core_prev.js(이전 코어)로 돈다.
 *    - 둘 다 안 되면 이 틀이 직접 /카페로더 (상태)와 /카페업데이트 (관리자 — 코어를 다시 받는다)만 받는다.
 *
 *  ※ onMessage 밖으로 오류가 나가면 StarLight 가 프로젝트를 꺼 버리므로(오류 발생시 비활성화) 전부 잡는다.
 *  ※ make_loaders.py 가 로더틀.js 에서 만든 파일이다 — 고치려면 로더틀.js 를 고치고 다시 돌릴 것.
 * ═══════════════════════════════════════════════════════════
 */
const STUB_VER = "틀-1117-1";
const KEY = "cafe";
const BOT_NAME = "카페봇";
const CMD_UPDATE = "/카페업데이트";
const CMD_INFO = "/카페로더";
const RESCUE_ADMINS = ["후파", "임병진"];   // 코어가 없을 때만 쓰는 관리자 (대화명에 이 낱말이 들어 있으면)

// ── 폰에만 두는 설정 ────────────────────────────────────────
// 비워 두면 깃헙 로더 코어의 기본값을 쓴다. 방·관리자를 바꿀 때도 다시 붙여넣지 않도록 보통은 비워 둔다.
// 꼭 이 폰에서만 다르게 하려면 예: MY_ROOMS: ["방이름"], MY_ADMINS: ["대화명 낱말"]
const SETTINGS = {
};
// ────────────────────────────────────────────────────────────

const CORE_URL = "https://raw.githubusercontent.com/limbj1218-cyber/chatlog/main/bot/starlight/" +
    encodeURIComponent(BOT_NAME + "로더코어.js");
const DIR = String(Projects.getSelf().directory.absolutePath);
const CORE_FILE = DIR + "/" + KEY + "_core.js";
const PREV_FILE = DIR + "/" + KEY + "_core_prev.js";

let core = null;        // 로더 코어가 돌려준 { onMessage, onKakao…, … }
let coreErr = "";
let rescuing = false;

async function fetchCore() {
    const res = await fetch(CORE_URL + "?t=" + Date.now());
    if (!res.ok) throw new Error("깃헙 응답 " + res.status);
    const text = await res.text();
    if (text.indexOf("export default async function") === -1) throw new Error("받아온 코드가 로더 코어 형식이 아니에요");
    return text;
}

async function startCore(rel, from) {
    const m = await import(rel);
    if (typeof m.default !== "function") throw new Error("로더 코어 형식이 아니에요 (" + rel + ")");
    core = await m.default(Object.assign({}, SETTINGS, { STUB_VER, CORE_FROM: from }));
}

// 컴파일할 때 (최상위 await — 메시지 처리 중이 아니라 기다려도 된다)
try {
    let from = "저장된 코어";
    if (!FileStream.exists(CORE_FILE)) {
        FileStream.write(CORE_FILE, await fetchCore());
        from = "깃헙에서 처음 받음";
    }
    await startCore("./" + KEY + "_core.js", from);
} catch (e) {
    coreErr = String(e);
    try {
        if (FileStream.exists(PREV_FILE)) await startCore("./" + KEY + "_core_prev.js", "이전 코어 (새 코어 오류로)");
    } catch (e2) { coreErr += " / 이전 코어도 실패: " + e2; }
}
if (!core) console.log("[" + BOT_NAME + "] 틀 " + STUB_VER + " · 로더 코어 없음 — " + coreErr);

// ─── 코어가 없을 때만: 코어를 다시 받아 다시 컴파일 ───
async function rescue(room) {
    if (rescuing) return;
    rescuing = true;
    let testFile = "";
    try {
        const text = await fetchCore();
        const testName = KEY + "_core_test_" + Date.now() + ".js";
        testFile = DIR + "/" + testName;
        FileStream.write(testFile, text);
        const m = await import("./" + testName);
        if (typeof m.default !== "function") throw new Error("로더 코어 형식이 아니에요");
        FileStream.write(CORE_FILE, text);
        room.send("🔄 로더 코어를 다시 받았어요. 다시 불러올게요!");
        setTimeout(() => { try { BotManager.getCurrentBot().compile(); } catch (e) { coreErr = "다시 컴파일 실패: " + e; } }, 300);
    } catch (e) {
        coreErr = "다시 받기 실패: " + e;
        try { room.send("⚠️ 로더 코어를 못 받았어요.\n" + e); } catch (e2) {}
    } finally {
        rescuing = false;
        if (testFile) { try { FileStream.remove(testFile); } catch (e) {} }
    }
}

export function onMessage(event) {
    if (core) {
        try { core.onMessage(event); } catch (e) {}
        return;
    }
    try {
        const text = String(event.message).trim();
        const sender = String(event.sender.name);
        if (text === CMD_INFO) {
            event.room.send("🧩 " + BOT_NAME + " 로더 상태 (틀 " + STUB_VER + ")\n로더 코어: 없음 ❌\n" + coreErr +
                "\n\n" + CMD_UPDATE + " (관리자) 로 코어를 다시 받아 보세요.");
            return;
        }
        if (text === CMD_UPDATE && RESCUE_ADMINS.some((a) => a && sender.indexOf(a) !== -1)) rescue(event.room);
    } catch (e) {}
}

// ─── 카톡 DB 플러그인(KakaoDB) 이벤트 — 코어에 그대로 넘긴다 (코어가 안 쓰면 아무 일도 없다) ───
function pass(name, event) {
    try { if (core && typeof core[name] === "function") core[name](event); } catch (e) {}
}
export function onKakaoMemberJoined(event) { pass("onKakaoMemberJoined", event); }
export function onKakaoMemberLeft(event) { pass("onKakaoMemberLeft", event); }
export function onKakaoMessage(event) { pass("onKakaoMessage", event); }
export function onKakaoMessageDeleted(event) { pass("onKakaoMessageDeleted", event); }
