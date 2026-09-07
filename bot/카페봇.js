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
 *  ※ 안드로이드 Rhino 엔진 호환을 위해 ES5 문법만 사용한다.
 *  ※ 메시지 처리 스레드에서는 절대 기다리지 않는다 — 봇 전체가 멈춘다.
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "카페봇";
var BOT_VER = "0907-2";

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

// ═══════════════ 앱 호환 계층 ═══════════════

function fileRead(path) {
    try {
        if (typeof FileStream !== "undefined" && FileStream && FileStream.read) {
            var r = FileStream.read(path);
            if (r !== null && r !== undefined && String(r) !== "") return String(r);
        }
    } catch (e) {}
    try {
        var f = new java.io.File(path);
        if (!f.exists()) return null;
        var br = new java.io.BufferedReader(
            new java.io.InputStreamReader(new java.io.FileInputStream(f), "UTF-8"));
        var sb = new java.lang.StringBuilder(), line;
        while ((line = br.readLine()) !== null) { sb.append(line); sb.append("\n"); }
        br.close();
        return String(sb.toString());
    } catch (e) {}
    return null;
}

function fileWrite(path, data) {
    try {
        if (typeof FileStream !== "undefined" && FileStream && FileStream.write) {
            FileStream.write(path, data);
            return true;
        }
    } catch (e) {}
    try {
        var f = new java.io.File(path);
        var parent = f.getParentFile();
        if (parent && !parent.exists()) parent.mkdirs();
        var w = new java.io.OutputStreamWriter(new java.io.FileOutputStream(f, false), "UTF-8");
        w.write(data);
        w.close();
        return true;
    } catch (e) {}
    return false;
}

/** 쓰기 가능한 폴더 자동 선택 (권한 없어도 앱 전용 폴더는 쓸 수 있다) */
function pickBaseDir() {
    var cands = [];
    try {
        var app = android.app.ActivityThread.currentApplication();
        var ext = app.getExternalFilesDir(null);
        if (ext) cands.push(String(ext.getAbsolutePath()) + "/카페봇");
        cands.push(String(app.getFilesDir().getAbsolutePath()) + "/cafebot");
    } catch (e) {}
    cands.push("/sdcard/카페봇");
    for (var i = 0; i < cands.length; i++) {
        try {
            if (fileWrite(cands[i] + "/write_test.txt", "ok") &&
                String(fileRead(cands[i] + "/write_test.txt")).indexOf("ok") === 0) return cands[i];
        } catch (e) {}
    }
    return null;
}

var BASE_DIR = pickBaseDir();
var STATE_FILE = BASE_DIR ? (BASE_DIR + "/카페봇상태.json") : null;
var TOKEN_FILE = BASE_DIR ? (BASE_DIR + "/gh_token.txt") : null;

// ═══════════════ 스레드 안전 ═══════════════
// 메시지를 처리하는 스레드에서 기다리면 봇 전체가 멈추고,
// 오래 멈추면 안드로이드가 앱을 정지시킨다. 그래서 스레드 번호로 판별한다.

var MSG_THREAD_ID = -1;

function threadId() {
    try { return Number(java.lang.Thread.currentThread().getId()); } catch (e) { return -1; }
}

/** 지금 기다려도 안전한가 — 확인이 안 되면 기다리지 않는다 */
function safeToWait() {
    var id = threadId();
    return id !== -1 && MSG_THREAD_ID !== -1 && id !== MSG_THREAD_ID;
}

function sleepMs(ms) {
    try { java.lang.Thread.sleep(ms); } catch (e) {}
}

/** 백그라운드 실행. 스레드를 못 만들면 그 자리에서 실행한다 */
function runAsync(fn) {
    var body = function () { try { fn(); } catch (e) {} };
    try {
        var t = new java.lang.Thread(body);
        t.setDaemon(true); t.start();
        return true;
    } catch (e) {}
    try {
        var t2 = new java.lang.Thread(new JavaAdapter(java.lang.Runnable, { run: body }));
        t2.setDaemon(true); t2.start();
        return true;
    } catch (e) {}
    try { fn(); } catch (e) {}
    return false;
}

// ═══════════════ HTTP ═══════════════

/** opt: { headers: [[이름,값], ...], method: "POST", body: "..." } */
function fetchText(url, opt) {
    opt = opt || {};
    var conn = new java.net.URL(url).openConnection();
    conn.setRequestProperty("User-Agent", UA);
    if (opt.headers) {
        for (var h = 0; h < opt.headers.length; h++) {
            try { conn.setRequestProperty(opt.headers[h][0], opt.headers[h][1]); } catch (he) {}
        }
    }
    conn.setConnectTimeout(15000);
    conn.setReadTimeout(20000);

    if (opt.method) {
        try { conn.setRequestMethod(opt.method); } catch (me) {}
        if (opt.body) {
            try {
                conn.setDoOutput(true);
                var os = conn.getOutputStream();
                os.write(new java.lang.String(opt.body).getBytes("UTF-8"));
                os.flush();
                os.close();
            } catch (be) {}
        }
    }

    try { LAST_HTTP = Number(conn.getResponseCode()); } catch (e) {}
    var br = new java.io.BufferedReader(
        new java.io.InputStreamReader(conn.getInputStream(), "UTF-8"));
    var sb = new java.lang.StringBuilder(), line;
    while ((line = br.readLine()) !== null) { sb.append(line); sb.append("\n"); }
    br.close();
    conn.disconnect();
    return String(sb.toString());
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

function setTokenCmd(arg, sender, isGroupChat) {
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
    cafeCheck(true);
    if (cafeErr) return head + "\n\n❌ 목록 읽기 실패: " + cafeErr;
    return head + "\n\n✅ 카페 목록을 읽었어요!" +
        (wasFirst ? "\n지금부터 올라오는 새 글만 알려드릴게요 (기준 글번호 " + cafeLastId + ")"
                  : "\n마지막 글번호: " + cafeLastId);
}

// ═══════════════ 먼저 말 걸기 ═══════════════

var SEND_KIND = "(아직 시도 안 함)";
var SEND_TRIED = "";
var LAST_REPLIER = {};

/** API2 는 전역 bot 이 아니라 BotManager 로 봇 객체를 가져와야 한다 */
function currentBot() {
    try {
        if (typeof BotManager !== "undefined" && BotManager && BotManager.getCurrentBot) {
            return BotManager.getCurrentBot();
        }
    } catch (e) {}
    try { if (typeof bot !== "undefined" && bot) return bot; } catch (e) {}
    return null;
}

function sendToRoom(room, text) {
    var tried = [];
    try {
        if (typeof Api !== "undefined" && Api && Api.replyRoom) {
            Api.replyRoom(room, text); SEND_KIND = "Api.replyRoom"; return true;
        }
        tried.push("Api.replyRoom 없음");
    } catch (e) { tried.push("Api.replyRoom 오류"); }

    try {
        var b = currentBot();
        if (b && typeof b.send === "function") {
            b.send(room, text); SEND_KIND = "bot.send (BotManager)"; return true;
        }
        tried.push(b ? "bot.send 없음" : "봇 객체 없음");
    } catch (e) { tried.push("bot.send 오류"); }

    try {
        if (typeof Bot !== "undefined" && Bot && Bot.send) {
            Bot.send(room, text); SEND_KIND = "Bot.send"; return true;
        }
        tried.push("Bot.send 없음");
    } catch (e) { tried.push("Bot.send 오류"); }

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
function kickWorkflow(token) {
    try {
        var url = "https://api.github.com/repos/" + WF_REPO +
            "/actions/workflows/" + WF_FILE + "/dispatches";
        fetchText(url, {
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

function fetchCafeFeed(token) {
    var url = "https://api.github.com/repos/" + GH_REPO + "/contents/" + GH_PATH +
        "?t=" + new Date().getTime();
    var txt = fetchText(url, {
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
function cafeCheck(noKick) {
    if (!CAFE.on) return;
    cafeCheckedAt = new Date();
    var token = ghToken();
    if (!token) {
        cafeErr = "깃헙 토큰이 없어요 (" + PREFIX + "깃토큰 으로 등록하세요)";
        return;
    }
    if (!noKick) runAsync(function () { kickWorkflow(token); });

    try {
        var j = fetchCafeFeed(token);
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
function cafeCycle() {
    if (cafeCycleRunning) return;
    cafeCycleRunning = true;
    try {
        var token = ghToken();
        if (!token) { cafeCheck(true); return; }

        var before = cafeUpdatedAt;
        kickWorkflow(token);

        if (!safeToWait()) { cafeCheck(true); return; }

        var waits = [12000, 12000, 15000];   // 12초 → 24초 → 39초
        for (var i = 0; i < waits.length; i++) {
            sleepMs(waits[i]);
            cafeCheck(true);
            if (cafeUpdatedAt && cafeUpdatedAt !== before) break;
        }
    } catch (e) {
        cafeErr = String(e);
    } finally {
        cafeCycleRunning = false;
    }
}

// ═══════════════ 타이머 ═══════════════
// /카페업데이트 로 코드를 다시 불러와도 옛 타이머가 남지 않도록 세대를 관리한다.

var TIMER_GEN = String(new Date().getTime());
try { java.lang.System.setProperty("cafebot.timer.gen", TIMER_GEN); } catch (e) {}
var TIMER_KIND = "없음 (알림 불가)";

var lastTickAt = 0;

function timerBeat() {
    try {
        if (String(java.lang.System.getProperty("cafebot.timer.gen")) !== TIMER_GEN) return false;
        var now = new Date().getTime();
        if (now - lastTickAt >= CAFE.checkMin * 60 * 1000) {
            lastTickAt = now;
            runAsync(cafeCycle);
        }
    } catch (e) {}
    return true;
}

(function startTimer() {
    try {
        if (typeof setInterval === "function") {
            var h = setInterval(function () {
                if (!timerBeat() && typeof clearInterval === "function") clearInterval(h);
            }, 60000);
            TIMER_KIND = "setInterval";
            return;
        }
    } catch (e) {}
    try {
        if (typeof JavaAdapter !== "undefined") {
            var timer = new java.util.Timer("cafebot-timer", true);
            timer.schedule(new JavaAdapter(java.util.TimerTask, {
                run: function () { if (!timerBeat()) { try { this.cancel(); } catch (e2) {} } }
            }), 30000, 60000);
            TIMER_KIND = "JavaAdapter";
            return;
        }
    } catch (e) {}
    try {
        var th = new java.lang.Thread(function () {
            java.lang.Thread.sleep(30000);
            while (timerBeat()) java.lang.Thread.sleep(60000);
        });
        th.setDaemon(true);
        th.start();
        TIMER_KIND = "Thread";
    } catch (e) {}
})();

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

function myPublicIp() {
    try {
        var ip = fetchText("https://api.ipify.org?format=text");
        return String(ip).replace(/[\r\n]+/g, "").replace(/^\s+|\s+$/g, "") || "(빈 응답)";
    } catch (e) {
        return "(확인 실패: " + e + ")";
    }
}

/** 지금 확인 + 상세 진단. 이 명령은 메시지 흐름에서 돌므로 기다리지 않는다 */
function cafeDebugCmd(sender) {
    if (!isAdmin(sender)) return null;
    var token = ghToken();
    var kicked = token ? kickWorkflow(token) : false;
    cafeCheck(true);
    return cafeText() +
        "\n\n── 진단 ──\nHTTP: " + (LAST_HTTP || "(모름)") +
        "\n워크플로우 깨우기: " + (kicked ? "성공 ✅ (204)" : "실패 ❌ (" + wfKickCode + ")") +
        "\n깃헙 토큰 길이: " + (ghToken() ? ghToken().length + "자" : "없음") +
        "\n봇 공인 IP: " + myPublicIp() +
        "\n응답 앞부분:\n" + (cafeRawHead || "(없음)") +
        "\n\n※ 방금 깨운 결과는 다음 확인(최대 " + CAFE.checkMin + "분)에 반영됩니다.";
}

/** 가장 최근 글 하나를 알림과 같은 모양으로 (기준 글번호는 건드리지 않음) */
function cafeTestCmd(sender) {
    if (!isAdmin(sender)) return null;
    var token = ghToken();
    if (!token) return "❌ 깃헙 토큰이 없어요 (" + PREFIX + "깃토큰 으로 등록하세요)";
    try {
        var j = fetchCafeFeed(token);
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
    var out = [], k, n;
    out.push("■ Event 상수");
    try {
        if (typeof Event === "undefined" || !Event) { out.push("  (Event 없음)"); }
        else {
            n = 0;
            for (k in Event) {
                var v = "";
                try { v = " = " + Event[k]; } catch (e2) {}
                out.push("  " + k + v);
                if (++n >= 40) { out.push("  …"); break; }
            }
            if (n === 0) out.push("  (목록을 읽을 수 없음)");
        }
    } catch (e) { out.push("  오류: " + e); }

    out.push("");
    out.push("■ 봇 객체가 가진 것");
    try {
        var b = currentBot();
        if (!b) { out.push("  (봇 객체 없음)"); }
        else {
            n = 0;
            for (k in b) { out.push("  " + k); if (++n >= 40) { out.push("  …"); break; } }
            if (n === 0) out.push("  (목록을 읽을 수 없음)");
        }
    } catch (e) { out.push("  오류: " + e); }

    return "🔍 앱 기능 조사\n─────────────\n" + out.join("\n");
}

// ═══════════════ 메시지 처리 ═══════════════

var lastErrorReportAt = 0;

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
        MSG_THREAD_ID = threadId();   // 이 스레드에서는 절대 기다리지 않는다

        text = String(msg).trim();
        if (!text) return;

        // 나중에 먼저 말을 걸어야 할 때 쓸 수 있게 답장 객체를 기억해 둔다
        try { if (replier && replier.reply) LAST_REPLIER[room] = replier; } catch (e) {}

        // 토큰 등록은 어느 방에서든 (관리자만, 아니면 조용히 무시)
        if (text === PREFIX + "깃토큰" || text.indexOf(PREFIX + "깃토큰 ") === 0) {
            var tr = setTokenCmd(text.substring((PREFIX + "깃토큰").length), sender, isGroupChat);
            if (tr) replier.reply(tr);
            return;
        }

        if (!inRooms(room)) return;

        if (text === PREFIX + "카페") { replier.reply(cafeText()); return; }
        if (text === PREFIX + "카페확인") {
            var dr = cafeDebugCmd(sender);
            if (dr) replier.reply(dr);
            return;
        }
        if (text === PREFIX + "새글테스트") {
            var nt = cafeTestCmd(sender);
            if (nt) replier.reply(nt);
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

// ═══════════════ 앱 API 연결 (직접 붙여넣기용) ═══════════════
// 로더를 통해 불러온 경우엔 로더가 이미 등록했으므로 건너뛴다.
(function registerApi2Direct() {
    if (typeof __ROOMS__ !== "undefined") return;
    try {
        var b = null;
        if (typeof BotManager !== "undefined" && BotManager && BotManager.getCurrentBot) {
            b = BotManager.getCurrentBot();
        } else if (typeof bot !== "undefined" && bot) {
            b = bot;
        }
        if (!b || typeof b.addListener !== "function") return;

        var ev = (typeof Event !== "undefined" && Event && Event.MESSAGE) ? Event.MESSAGE : "message";
        b.addListener(ev, function (m) {
            response(
                String(m.room),
                String(m.content),
                String(m.author ? m.author.name : ""),
                !!m.isGroupChat,
                { reply: function (t) { m.reply(t); } }
            );
        });
    } catch (e) {}
})();
