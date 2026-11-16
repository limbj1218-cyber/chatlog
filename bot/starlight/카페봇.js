/**
 * ═══════════════════════════════════════════════════════════
 *  카페봇 — 네이버 카페 새글을 방에 알린다
 *
 *  오토봇에서 이 기능만 떼어냈다. 카페 쪽은 네트워크·타이머·대기가 얽혀 있어
 *  한 스크립트에 두면 문제가 생겼을 때 자동응답까지 같이 느려진다.
 *  봇 앱은 스크립트마다 따로 돌리므로, 나눠두면 서로 영향을 주지 않는다.
 *
 *  ◆ 명령어
 *    /카페       → 상태 (누구나)
 *    /새글테스트 → 최근 글 1건을 알림 모양으로 (관리자)
 *    /카페확인   → 지금 확인 + 상세 진단 (관리자)
 *    /깃토큰     → 깃헙 토큰 등록 (관리자, /깃토큰 삭제 로 제거)
 *    /발송테스트 /기능조사 → 앱이 먼저 말 걸기를 지원하는지 조사 (관리자)
 *
 *  ◆ 동작
 *    폰에서 네이버를 직접 부르면 쿠키·IP·헤더를 다 맞춰도 세션이 거부된다.
 *    그래서 깃헙 Actions 가 대신 카페를 확인하고, 봇은 그 결과만 읽는다.
 *
 *      chatlog(.github/workflows/cafe-watch.yml)
 *        → 네이버 카페 API (쿠키는 저장소 Secret)
 *        → cafe-watch(비공개)/latest.json
 *        → 카페봇이 읽어 새 글만 발송
 *
 *    깃헙 예약 실행은 몇 시간씩 건너뛰므로, 봇이 주기마다 워크플로우를 직접 깨운다.
 *    (토큰에 chatlog 의 Actions 쓰기 권한이 필요하다)
 *
 *  ◆ StarLight(NeonJS) 판 (2026-11-16) — bot/카페봇.js(메신저봇R 판)를 그대로 두고 따로 만든 것
 *    - 이 파일은 ES 모듈이다. 내보낸 함수 하나(export default)에 본체 전체가 들어 있고,
 *      로더(bot/starlight/카페봇로더.js)가 (방, 토큰, 관리자, 폰 기능 __PLAT__) 을 넘겨 부른다.
 *    - 파일·HTTP·타이머·먼저 말 걸기는 전부 __PLAT__ 으로만 한다 (java·FileStream·Thread 없음).
 *    - 네트워크가 async 라서 기다리는 함수는 전부 async 다. NeonJS 는 await 하는 동안
 *      다른 메시지를 처리하므로 "메시지 스레드에서 기다리면 안 된다"는 걱정이 없다
 *      (그래서 메신저봇R 판의 safeToWait·MSG_THREAD_ID 장치가 없다).
 *    - 카페 로직은 메신저봇R 판과 같다. 메신저봇R 판을 고치면
 *      python bot/starlight/make_neon_cafe.py 로 다시 만든다.
 * ═══════════════════════════════════════════════════════════
 */
export default function cafeBody(__ROOMS__, __TOKEN__, __ADMINS__, __PLAT__) {
var scriptName = "카페봇";
var BOT_VER = "0909-1";

// ─────────────── 설정 (여기만 고치면 됨) ───────────────
var ROOMS = [
    "오토2프프",
    "오토2"
];

// 로더가 ROOMS·ADMINS 를 덮어쓰므로, 로더를 다시 붙여넣지 않고 늘리려면 여기에 적는다.
// ※ ROOMS 는 봇이 "반응"할 방이고, 알림을 "보낼" 방은 아래 CAFE.rooms 이다.
var EXTRA_ROOMS = ["[오차율 계산봇]"];
var EXTRA_ADMINS = ["[오차율 계산봇]"];

var ADMINS = ["후파", "임병진"];   // 대화명에 포함되면 관리자
var PREFIX = "/";

var CAFE = {
    on: true,                       // false 면 알림 기능 전체 정지
    cafeUrl: "autoworker2",         // 링크용 주소 (cafe.naver.com/이것/글번호)
    name: "오토워커",                // 알림 제목에 쓰는 이름
    rooms: ["오토2프프", "오토2"],   // 알림 보낼 방
    checkMin: 3,                    // 확인 주기 (분)
    maxNotify: 5,                   // 한 번에 알릴 최대 글 수 (넘으면 "외 N건")
    menuIds: []                     // 특정 게시판만 알리려면 menuId 를 넣는다 (빈 배열 = 전체)
};

// 카페 최신글 목록이 놓이는 비공개 저장소 (깃헙 Actions 가 갱신한다)
var GH_REPO = "limbj1218-cyber/cafe-watch";
var GH_PATH = "latest.json";

// 그 목록을 만드는 워크플로우 (봇이 직접 깨운다)
var WF_REPO = "limbj1218-cyber/chatlog";
var WF_FILE = "cafe-watch.yml";
var WF_REF = "main";
// ────────────────────────────────────────────────────────

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var LAST_HTTP = 0;        // 마지막 HTTP 응답 코드 (진단용)
var GH_TOKEN = "";        // 로더 주입 또는 /깃토큰 (폰에만 둔다)

function inRooms(room) {
    return ROOMS.indexOf(room) !== -1 || EXTRA_ROOMS.indexOf(room) !== -1;
}

function isAdmin(sender) {
    var all = ADMINS.concat(EXTRA_ADMINS), i;
    for (i = 0; i < all.length; i++) {
        if (String(sender).indexOf(all[i]) !== -1) return true;
    }
    return false;
}

// ═══════════════ 앱 호환 계층 (StarLight NeonJS) ═══════════════
// 파일·HTTP·먼저 말 걸기·타이머는 전부 로더가 준 __PLAT__ 으로만 한다.
// 파일은 이름만 쓴다 — 로더가 프로젝트 data 폴더에 넣는다.
var PLAT = __PLAT__ || {};

function fileRead(name) {
    try {
        var r = PLAT.read ? PLAT.read(name) : null;
        if (r === null || r === undefined || String(r) === "") return null;
        return String(r);
    } catch (e) { return null; }
}

function fileWrite(name, text) {
    try { return PLAT.write ? !!PLAT.write(name, String(text)) : false; } catch (e) { return false; }
}

// ※ 메신저봇R 판과 같은 파일 이름 — 옛 폰의 파일을 data 폴더에 그대로 넣으면 기준 글번호가 이어진다
var BASE_DIR = "";
var STATE_FILE = "카페봇상태.json";
var TOKEN_FILE = "gh_token.txt";

/** 백그라운드 실행 — NeonJS 는 await 하는 동안 다른 메시지를 처리하므로 스레드가 필요 없다 */
function runAsync(fn) {
    try {
        Promise.resolve().then(fn).catch(function (e) { cafeErr = String(e); });
        return true;
    } catch (e) { return false; }
}

function sleepMs(ms) {
    return new Promise(function (ok) { (PLAT.setTimeout || setTimeout)(ok, ms); });
}

// ═══════════════ HTTP ═══════════════

/** opt: { headers: [[이름,값], ...], method: "POST", body: "..." } → Promise<문자열> */
function fetchText(url, opt) {
    opt = opt || {};
    var headers = { "User-Agent": UA };
    if (opt.headers) {
        for (var h = 0; h < opt.headers.length; h++) headers[opt.headers[h][0]] = opt.headers[h][1];
    }
    var f = PLAT.fetch || fetch;
    return f(url, { method: opt.method || "GET", headers: headers, body: opt.body || undefined })
        .then(function (res) {
            LAST_HTTP = Number(res.status);
            return res.text().then(function (t) {
                if (!res.ok) throw "HTTP " + res.status;
                return String(t);
            });
        });
}

// ═══════════════ 깃헙 토큰 ═══════════════

function ghToken() {
    if (GH_TOKEN) return GH_TOKEN;
    if (TOKEN_FILE) {
        var t = fileRead(TOKEN_FILE);
        if (t) return String(t).replace(/[\r\n]+/g, "").replace(/^\s+|\s+$/g, "");
    }
    return "";
}

function loadToken() {
    if (!TOKEN_FILE) return;
    try {
        var t = fileRead(TOKEN_FILE);
        if (!t) return;
        t = String(t).replace(/[\r\n]+/g, "").replace(/^\s+|\s+$/g, "");
        if (t) GH_TOKEN = t;
    } catch (e) {}
}

async function setTokenCmd(arg, sender, isGroupChat) {
    if (!isAdmin(sender)) return null;
    var v = String(arg || "").replace(/[\r\n]+/g, " ").replace(/^\s+|\s+$/g, "");

    if (!v) {
        return "🔐 깃헙 토큰\n─────────────\n" +
            "현재: " + (ghToken() ? "등록됨 ✅" : "없음 ❌") + "\n\n" +
            "사용법: " + PREFIX + "깃토큰 <토큰>\n지우려면: " + PREFIX + "깃토큰 삭제";
    }
    if (v === "삭제") {
        GH_TOKEN = "";
        if (TOKEN_FILE) fileWrite(TOKEN_FILE, "");
        return "🗑️ 깃헙 토큰을 지웠어요.";
    }
    if (v.indexOf("gh") !== 0 && v.indexOf("github_pat_") !== 0) {
        return "⛔ 토큰은 보통 ghp_ 또는 github_pat_ 로 시작해요.";
    }

    GH_TOKEN = v;
    var saved = false;
    if (TOKEN_FILE) saved = fileWrite(TOKEN_FILE, v);

    var head = "🔐 깃헙 토큰을 등록했어요 (" + v.length + "자)" +
        (saved ? "" : "\n⚠️ 파일 저장 실패 — 앱을 껐다 켜면 사라집니다") +
        (isGroupChat ? "\n⚠️ 여기는 단톡방이에요 — 방금 보낸 메시지를 꼭 삭제하세요!" : "");

    var wasFirst = (cafeLastId === 0);
    await cafeCheck(true);
    if (cafeErr) return head + "\n\n❌ 목록 읽기 실패: " + cafeErr;
    return head + "\n\n✅ 카페 목록을 읽었어요!" +
        (wasFirst ? "\n지금부터 올라오는 새 글만 알려드릴게요 (기준 글번호 " + cafeLastId + ")"
                  : "\n마지막 글번호: " + cafeLastId);
}

// ═══════════════ 먼저 말 걸기 ═══════════════

var SEND_KIND = "(아직 시도 안 함)";
var SEND_TRIED = "";
var LAST_REPLIER = {};

/** 방에 먼저 말 걸기 — 로더가 StarLight 방식(봇 send → Chat.findRoom)으로 보낸다 */
function sendToRoom(room, text) {
    var tried = [];
    try {
        if (PLAT.send && PLAT.send(room, text)) { SEND_KIND = "StarLight send"; return true; }
        tried.push("PLAT.send 실패");
    } catch (e) { tried.push("PLAT.send 오류"); }

    try {
        var r = LAST_REPLIER[room];
        if (r && typeof r.reply === "function") {
            r.reply(text); SEND_KIND = "저장해둔 답장 객체"; return true;
        }
        tried.push("저장된 답장 객체 없음");
    } catch (e) { tried.push("저장된 답장 객체 만료"); }

    SEND_TRIED = tried.join(" / ");
    SEND_KIND = "실패 ❌";
    return false;
}

// ═══════════════ 카페 ═══════════════

var cafeLastId = 0;        // 마지막으로 알린 글 번호
var cafeCheckedAt = null;
var cafeOkAt = null;
var cafeErr = null;
var cafeSentTotal = 0;
var cafeRawHead = "";
var cafeUpdatedAt = "";
var wfKickedAt = null;
var wfKickCode = 0;

function loadState() {
    if (!STATE_FILE) return;
    try {
        var s = fileRead(STATE_FILE);
        if (!s) return;
        var o = JSON.parse(s);
        if (o && o.cafeLastId) cafeLastId = Number(o.cafeLastId);
    } catch (e) {}
}

function saveState() {
    if (!STATE_FILE) return;
    try { fileWrite(STATE_FILE, JSON.stringify({ cafeLastId: cafeLastId })); } catch (e) {}
}

function cafeArticleUrl(id) {
    return "https://cafe.naver.com/" + CAFE.cafeUrl + "/" + id;
}

/** 감시 워크플로우를 지금 실행시킨다 (깃헙 예약 실행은 몇 시간씩 건너뛴다) */
async function kickWorkflow(token) {
    try {
        var url = "https://api.github.com/repos/" + WF_REPO +
            "/actions/workflows/" + WF_FILE + "/dispatches";
        await fetchText(url, {
            method: "POST",
            body: '{"ref":"' + WF_REF + '"}',
            headers: [
                ["Authorization", "token " + token],
                ["Accept", "application/vnd.github+json"],
                ["Content-Type", "application/json"],
                ["X-GitHub-Api-Version", "2022-11-28"]
            ]
        });
    } catch (e) {}
    wfKickedAt = new Date();
    wfKickCode = LAST_HTTP;
    return LAST_HTTP === 204;
}

async function fetchCafeFeed(token) {
    var url = "https://api.github.com/repos/" + GH_REPO + "/contents/" + GH_PATH +
        "?t=" + new Date().getTime();
    var txt = await fetchText(url, {
        headers: [
            ["Authorization", "token " + token],
            ["Accept", "application/vnd.github.raw"],
            ["X-GitHub-Api-Version", "2022-11-28"]
        ]
    });
    cafeRawHead = String(txt).substring(0, 200);
    return JSON.parse(txt);
}

function cafeWanted(a) {
    if (!a || !a.id) return false;
    if (Number(a.id) <= cafeLastId) return false;
    if (CAFE.menuIds.length > 0 && CAFE.menuIds.indexOf(Number(a.menuId)) === -1) return false;
    return true;
}

function cafeMessage(list) {
    var head = "📢 " + CAFE.name + " 카페 새글";
    if (list.length === 1) {
        var a = list[0];
        return head + "\n\n[" + String(a.menu || "") + "] " + String(a.subject) +
            "\n✍️ " + String(a.writer || "") + "\n" + cafeArticleUrl(a.id);
    }
    var shown = list.slice(0, CAFE.maxNotify);
    var out = head + " " + list.length + "건\n";
    for (var i = 0; i < shown.length; i++) {
        var b = shown[i];
        out += "\n[" + String(b.menu || "") + "] " + String(b.subject) +
            "\n" + cafeArticleUrl(b.id) + "\n";
    }
    if (list.length > shown.length) out += "\n… 외 " + (list.length - shown.length) + "건";
    return out;
}

/**
 * 이미 이 글까지 보냈는지 확인하고, 아니면 내가 보낼 것으로 찜한다.
 * ※ 메신저봇R 판은 앱 전체(JVM)가 공유하는 값으로 확인해 스크립트가 중복 설치돼도 막았지만,
 *   StarLight 는 프로젝트마다 따로 돌아 그런 공유값이 없다. 여기서는 이 프로젝트 안에서만 막는다
 *   (같은 카페를 보는 프로젝트를 둘 만들면 두 번 나가므로 하나만 둘 것).
 */
var sentUpTo = 0;

function alreadySentByAnother(maxId) {
    if (maxId <= sentUpTo) return true;
    sentUpTo = maxId;
    return false;
}

function cafeBroadcast(text) {
    var any = false;
    for (var i = 0; i < CAFE.rooms.length; i++) {
        var r = CAFE.rooms[i];
        if (!inRooms(r)) continue;
        try { if (sendToRoom(r, text)) any = true; } catch (e) {}
    }
    return any;
}

/**
 * 목록을 읽고 새 글이 있으면 알린다.
 * 처음 실행이면 알리지 않고 기준 글번호만 잡는다 — 밀린 글 도배 방지.
 */
async function cafeCheck(noKick) {
    if (!CAFE.on) return;
    cafeCheckedAt = new Date();
    var token = ghToken();
    if (!token) {
        cafeErr = "깃헙 토큰이 없어요 (" + PREFIX + "깃토큰 으로 등록하세요)";
        return;
    }
    if (!noKick) runAsync(function () { return kickWorkflow(token); });

    try {
        var j = await fetchCafeFeed(token);
        if (!j || !j.articles) { cafeErr = "받은 내용이 올바르지 않아요"; return; }
        cafeUpdatedAt = String(j.updatedAt || "");

        var list = j.articles, fresh = [], i;
        for (i = 0; i < list.length; i++) if (cafeWanted(list[i])) fresh.push(list[i]);

        var maxId = cafeLastId;
        for (i = 0; i < list.length; i++) {
            var n = Number(list[i].id);
            if (n > maxId) maxId = n;
        }

        cafeErr = null;
        cafeOkAt = new Date();

        var first = (cafeLastId === 0);
        if (first || fresh.length === 0) {
            cafeLastId = maxId;
            saveState();
            return;
        }

        // 이 앱 안에서 카페봇이 둘 이상 돌고 있어도 같은 글이 두 번 나가지 않게 막는다.
        // (스크립트 중복 설치·구버전 잔존 등) 앱 전체가 공유하는 값으로 확인한다.
        if (alreadySentByAnother(maxId)) {
            cafeLastId = maxId;
            saveState();
            return;
        }

        // 발송이 실패하면 기준을 올리지 않는다 — 다음 주기에 다시 시도한다
        fresh.sort(function (x, y) { return Number(x.id) - Number(y.id); });
        if (!cafeBroadcast(cafeMessage(fresh))) {
            cafeErr = "발송 실패 — 다음 확인 때 다시 시도합니다 (" + SEND_KIND + ")";
            return;
        }
        cafeLastId = maxId;
        saveState();
        cafeSentTotal += fresh.length;

    } catch (e) {
        cafeErr = String(e);
    }
}

var cafeCycleRunning = false;

/**
 * 한 주기에 "깨우기 → 잠깐 기다리기 → 읽기"를 모두 한다.
 * ※ 메시지 스레드에서는 기다리지 않는다 (봇이 멈춘다).
 */
async function cafeCycle() {
    if (cafeCycleRunning) return;
    cafeCycleRunning = true;
    try {
        var token = ghToken();
        if (!token) { await cafeCheck(true); return; }

        var before = cafeUpdatedAt;
        await kickWorkflow(token);

        var waits = [12000, 12000, 15000];   // 12초 → 24초 → 39초
        for (var i = 0; i < waits.length; i++) {
            await sleepMs(waits[i]);
            await cafeCheck(true);
            if (cafeUpdatedAt && cafeUpdatedAt !== before) break;
        }
    } catch (e) {
        cafeErr = String(e);
    } finally {
        cafeCycleRunning = false;
    }
}

// ═══════════════ 타이머 ═══════════════
// NeonJS 는 다시 컴파일하면 옛 타이머가 저절로 꺼지므로 세대 장치가 필요 없다.

var TIMER_KIND = "없음 (알림 불가)";
var lastTickAt = 0;

function timerBeat() {
    try {
        var now = new Date().getTime();
        if (now - lastTickAt >= CAFE.checkMin * 60 * 1000) {
            lastTickAt = now;
            runAsync(cafeCycle);
        }
    } catch (e) { cafeErr = String(e); }
    return true;
}

function startTimer() {
    try {
        var si = PLAT.setInterval || (typeof setInterval === "function" ? setInterval : null);
        if (si) { si(timerBeat, 60000); TIMER_KIND = "setInterval"; }
    } catch (e) { cafeErr = "시계 켜기 실패: " + e; }
}

// ═══════════════ 명령어 ═══════════════

function cafeText() {
    return "📰 카페 새글 알림 (" + CAFE.name + ")\n─────────────\n" +
        "버전: " + BOT_VER + "\n" +
        "상태: " + (CAFE.on ? "켜짐 ✅" : "꺼짐 ⏸️") + "\n" +
        "확인 주기: " + CAFE.checkMin + "분 (타이머: " + TIMER_KIND + ")\n" +
        "출처: 깃헙 " + GH_REPO + "\n" +
        "깃헙 토큰: " + (ghToken() ? "등록됨 ✅" : "없음 ❌ (" + PREFIX + "깃토큰 으로 등록)") + "\n" +
        "목록 갱신 시각: " + (cafeUpdatedAt || "(아직 없음)") + "\n" +
        "워크플로우 깨우기: " + (wfKickedAt
            ? (wfKickCode === 204 ? "정상 ✅" : "실패 (" + wfKickCode + ")") +
              " " + wfKickedAt.toLocaleString()
            : "(아직 없음)") + "\n" +
        "마지막 글 번호: " + (cafeLastId || "(아직 없음)") + "\n" +
        "마지막 확인: " + (cafeCheckedAt ? cafeCheckedAt.toLocaleString() : "(아직 없음)") + "\n" +
        "마지막 성공: " + (cafeOkAt ? cafeOkAt.toLocaleString() : "(아직 없음)") + "\n" +
        "보낸 글 수: " + cafeSentTotal + " (발송 방식: " + SEND_KIND + ")\n" +
        "알림 방: " + CAFE.rooms.join(", ") +
        (cafeErr ? "\n최근 오류: " + cafeErr : "");
}

async function myPublicIp() {
    try {
        var ip = await fetchText("https://api.ipify.org?format=text");
        return String(ip).replace(/[\r\n]+/g, "").replace(/^\s+|\s+$/g, "") || "(빈 응답)";
    } catch (e) {
        return "(확인 실패: " + e + ")";
    }
}

/** 지금 확인 + 상세 진단. 이 명령은 메시지 흐름에서 돌므로 기다리지 않는다 */
async function cafeDebugCmd(sender) {
    if (!isAdmin(sender)) return null;
    var token = ghToken();
    var kicked = token ? await kickWorkflow(token) : false;
    await cafeCheck(true);
    return cafeText() +
        "\n\n── 진단 ──\nHTTP: " + (LAST_HTTP || "(모름)") +
        "\n워크플로우 깨우기: " + (kicked ? "성공 ✅ (204)" : "실패 ❌ (" + wfKickCode + ")") +
        "\n깃헙 토큰 길이: " + (ghToken() ? ghToken().length + "자" : "없음") +
        "\n봇 공인 IP: " + (await myPublicIp()) +
        "\n응답 앞부분:\n" + (cafeRawHead || "(없음)") +
        "\n\n※ 방금 깨운 결과는 다음 확인(최대 " + CAFE.checkMin + "분)에 반영됩니다.";
}

/** 가장 최근 글 하나를 알림과 같은 모양으로 (기준 글번호는 건드리지 않음) */
async function cafeTestCmd(sender) {
    if (!isAdmin(sender)) return null;
    var token = ghToken();
    if (!token) return "❌ 깃헙 토큰이 없어요 (" + PREFIX + "깃토큰 으로 등록하세요)";
    try {
        var j = await fetchCafeFeed(token);
        var list = (j && j.articles) ? j.articles : [];
        if (list.length === 0) return "받아온 글이 없어요.";
        var newest = list[0], i;
        for (i = 1; i < list.length; i++) {
            if (Number(list[i].id) > Number(newest.id)) newest = list[i];
        }
        return cafeMessage([newest]);
    } catch (e) {
        return "❌ 목록 읽기 실패: " + e;
    }
}

function sendTestCmd(room, sender) {
    if (!isAdmin(sender)) return null;
    var ok = sendToRoom(room, "🔔 발송 테스트 — 이 줄이 보이면 알림이 정상 동작합니다.");
    return "📤 발송 테스트\n─────────────\n" +
        "결과: " + (ok ? "성공 ✅" : "실패 ❌") + "\n" +
        "방식: " + SEND_KIND + (ok ? "" : "\n시도 내역: " + SEND_TRIED);
}

function eventProbe() {
    return "🔍 앱 기능 조사\n─────────────\n" +
        "StarLight 판에서는 로더가 보내기를 맡습니다.\n" +
        "발송 방식: " + SEND_KIND + "\n" +
        "타이머: " + TIMER_KIND + "\n" +
        (SEND_TRIED ? "최근 시도 내역: " + SEND_TRIED : "");
}

// ═══════════════ 메시지 처리 ═══════════════

var lastErrorReportAt = 0;

/** 기다려야 답이 나오는 명령 — 나오면 그때 보낸다 (메시지 흐름은 막지 않는다) */
function later(replier, promise) {
    try {
        Promise.resolve(promise).then(function (t) {
            if (t) { try { replier.reply(String(t)); } catch (e) {} }
        }).catch(function (e) {
            cafeErr = String(e);
            try { replier.reply("⚠️ 카페봇 오류: " + e); } catch (e2) {}
        });
    } catch (e) { cafeErr = String(e); }
}

function shouldReportError(text) {
    if (String(text).indexOf(PREFIX) !== 0) return false;
    var now = new Date().getTime();
    if (now - lastErrorReportAt < 60000) return false;
    lastErrorReportAt = now;
    return true;
}

function response(room, msg, sender, isGroupChat, replier) {
    var text = "";
    try {
        text = String(msg).trim();
        if (!text) return;

        // 나중에 먼저 말을 걸어야 할 때 쓸 수 있게 답장 객체를 기억해 둔다
        try { if (replier && replier.reply) LAST_REPLIER[room] = replier; } catch (e) {}

        // 토큰 등록은 어느 방에서든 (관리자만, 아니면 조용히 무시)
        if (text === PREFIX + "깃토큰" || text.indexOf(PREFIX + "깃토큰 ") === 0) {
            later(replier, setTokenCmd(text.substring((PREFIX + "깃토큰").length), sender, isGroupChat));
            return;
        }

        if (!inRooms(room)) return;

        if (text === PREFIX + "카페") { replier.reply(cafeText()); return; }
        if (text === PREFIX + "카페확인") {
            later(replier, cafeDebugCmd(sender));
            return;
        }
        if (text === PREFIX + "새글테스트") {
            later(replier, cafeTestCmd(sender));
            return;
        }
        if (text === PREFIX + "발송테스트") {
            var st = sendTestCmd(room, sender);
            if (st) replier.reply(st);
            return;
        }
        if (text === PREFIX + "기능조사") {
            if (isAdmin(sender)) replier.reply(eventProbe());
            return;
        }
        // 그 밖의 메시지는 이 봇이 건드리지 않는다 (자동응답은 오토봇 담당)

    } catch (e) {
        cafeErr = String(e);
        try {
            if (shouldReportError(text)) replier.reply("⚠️ 카페봇 오류: " + e);
        } catch (e2) {}
    }
}

// 저장해둔 값 복원
try { loadToken(); } catch (e) {}
try { loadState(); } catch (e) {}

// 로더가 준 값 (비어 있으면 본체 기본값)
if (__ROOMS__ && __ROOMS__.length > 0) ROOMS = __ROOMS__;
if (__ADMINS__ && __ADMINS__.length > 0) ADMINS = __ADMINS__;
if (__TOKEN__) GH_TOKEN = __TOKEN__;

// 시계 켜기 (모든 정의가 끝난 뒤)
startTimer();

return {
    response: response,
    version: BOT_VER,
    rooms: function () { return ROOMS.slice(); },
    checkNow: function () { return cafeCycle(); },
    status: function () {
        return {
            on: CAFE.on, lastId: cafeLastId, sent: cafeSentTotal,
            timer: TIMER_KIND, sendKind: SEND_KIND,
            hasToken: !!ghToken(), err: cafeErr
        };
    }
};
}
