/**
 * ═══════════════════════════════════════════════════════════
 *  단톡봇 로더 — 이 파일만 봇 앱(메신저봇R 등)에 붙여넣으면 됩니다.
 *
 *  동작: GitHub에 있는 본체 코드(bot/단톡봇.js)를 읽어와 실행합니다.
 *  - 토큰과 방 목록은 이 로더(폰)에만 존재 → 공개 저장소에 노출 안 됨
 *  - 본체 코드가 갱신되면 방에서 /업데이트 (최고 관리자만) 또는 재컴파일
 *
 *  ◆ 지원 앱 (자동 감지)
 *    - 메신저봇R 신버전(API2) : BotManager.getCurrentBot().addListener(Event.MESSAGE, ...)
 *    - 메신저봇R 구버전(API1) / 다크토네이도 챗봇 등 : response(...)
 *
 *  ◆ 본체 불러오는 방식도 자동 선택
 *    ① 동적 평가 (new Function / eval / Rhino) — 허용하는 앱
 *    ② modules 폴더에 저장 후 require() — 메신저봇R API2처럼 동적 평가가 막힌 앱
 *
 *  ★ 아래 두 값만 채우세요 ★
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "단톡봇";
var GLOBAL_SCOPE = this;   // 최상위 this = 전역 스코프 (동적 평가 우회에 사용)
var PREFIX_CHAR = "/";     // 명령어 접두사 (오류 알림 여부 판단용)

// ── 폰에만 두는 설정 (여기만 수정) ──────────────────────────
var TOKEN = "";                     // ← GitHub Personal Access Token
var MY_ROOMS = [                    // ← 봇이 동작할 방 이름 (카톡과 정확히 일치)
    "임병진",
    // "우리 오픈채팅방",
];
// ────────────────────────────────────────────────────────────

var SUPER_ADMINS = ["후파", "임병진"];   // /업데이트 를 쓸 수 있는 사람 (대화명에 포함되면 허용)
var SRC_URL = "https://raw.githubusercontent.com/limbj1218-cyber/chatlog/main/bot/" +
    encodeURIComponent("단톡봇.js");

var remoteResponse = null;   // 깃헙에서 불러온 본체의 response 함수
var loadedAt = null;
var lastError = null;
var loadMethod = "";         // 본체를 어떤 방식으로 불러왔는지 (/로더 로 확인)
var apiMode = "(아직 메시지 못 받음)";
var api2Ready = false;
var lastSeen = "";           // 중복 처리 방지용
var lastSeenAt = 0;

function isLoaderAdmin(sender) {
    for (var i = 0; i < SUPER_ADMINS.length; i++) {
        if (String(sender).indexOf(SUPER_ADMINS[i]) !== -1) return true;
    }
    return false;
}

/** 깃헙에서 텍스트 가져오기 — jsoup 우선, 없으면 순수 자바 HTTP로 대체 */
function fetchText(url) {
    try {
        if (typeof org !== "undefined" && org.jsoup) {
            return String(org.jsoup.Jsoup.connect(url)
                .ignoreContentType(true)
                .userAgent("dantalk-loader")
                .timeout(15000)
                .maxBodySize(0)
                .execute().body());
        }
    } catch (e) {}

    var conn = new java.net.URL(url).openConnection();
    conn.setRequestProperty("User-Agent", "dantalk-loader");
    conn.setConnectTimeout(15000);
    conn.setReadTimeout(20000);
    var br = new java.io.BufferedReader(
        new java.io.InputStreamReader(conn.getInputStream(), "UTF-8"));
    var sb = new java.lang.StringBuilder(), line;
    while ((line = br.readLine()) !== null) { sb.append(line); sb.append("\n"); }
    br.close();
    conn.disconnect();
    return String(sb.toString());
}

// ─── 방식 ① 동적 평가 ───

function evalCode(src) {
    var err = null;
    try { return (new Function("return (" + src + ")"))(); } catch (e) { err = "Function: " + e; }
    try { return eval(src); } catch (e) { err = "eval: " + e; }
    try {
        var Ctx = org.mozilla.javascript.Context;
        var cx = Ctx.getCurrentContext();
        var entered = false;
        if (!cx) { cx = Ctx.enter(); entered = true; }
        try { return cx.evaluateString(GLOBAL_SCOPE, src, "dantalk", 1, null); }
        finally { if (entered) Ctx.exit(); }
    } catch (e) { err = "rhino: " + e; }
    throw err;
}

// ─── 방식 ② modules 폴더 + require (메신저봇R API2) ───

/** 이 봇의 폴더 경로 찾기 */
function botFolder() {
    var name = null;
    try {
        if (typeof BotManager !== "undefined" && BotManager && BotManager.getCurrentBot) {
            name = String(BotManager.getCurrentBot().getName());
        }
    } catch (e) {}
    if (!name) name = scriptName;

    var bases = ["/storage/emulated/0/msgbot/Bots/", "/sdcard/msgbot/Bots/"];
    for (var i = 0; i < bases.length; i++) {
        try {
            if (new java.io.File(bases[i] + name).exists()) return bases[i] + name + "/";
        } catch (e) {}
    }
    return bases[0] + name + "/";
}

/** 예전에 받아둔 모듈 파일 정리 (지금 쓰는 것만 남김) */
function cleanOldModules(dir, keep) {
    try {
        var files = new java.io.File(dir).listFiles();
        if (!files) return;
        for (var i = 0; i < files.length; i++) {
            var n = String(files[i].getName());
            if (n.indexOf("dantalk_core_") === 0 && n !== keep) files[i]["delete"]();
        }
    } catch (e) {}
}

/**
 * 본체 코드를 modules 폴더에 CommonJS 모듈로 저장한 뒤 require 로 불러온다.
 * (파일명에 시각을 넣어 require 캐시를 피하므로 /업데이트 가 매번 최신을 반영)
 */
function loadViaRequire(code) {
    if (typeof require !== "function") throw "이 앱에는 require 가 없어요";

    var dir = botFolder() + "modules";
    try { new java.io.File(dir).mkdirs(); } catch (e) {}

    var fname = "dantalk_core_" + new Date().getTime();
    var body = "module.exports = function (__TOKEN__, __ROOMS__) {\n" + code +
        "\nGITHUB.TOKEN = __TOKEN__;" +
        "\nif (__ROOMS__ && __ROOMS__.length > 0) ROOMS = __ROOMS__;" +
        "\nreturn response;\n};";
    FileStream.write(dir + "/" + fname + ".js", body);

    var tries = [
        "./modules/" + fname,
        "./modules/" + fname + ".js",
        "modules/" + fname,
        dir + "/" + fname + ".js"
    ];
    var err = null;
    for (var i = 0; i < tries.length; i++) {
        try {
            var mod = require(tries[i]);
            cleanOldModules(dir, fname + ".js");
            return mod;
        } catch (e) { err = e; }
    }
    throw "require 실패: " + err;
}

// ─── 본체 불러오기 ───

function loadRemote() {
    var code = fetchText(SRC_URL);
    if (code.indexOf("function response") === -1) {
        throw "받아온 코드가 올바르지 않아요 (URL 확인 필요)";
    }

    var factory = null, evalErr = null, reqErr = null;

    // ① 동적 평가 허용 앱
    var wrapped = "(function (__TOKEN__, __ROOMS__) {\n" + code +
        "\nGITHUB.TOKEN = __TOKEN__;" +
        "\nif (__ROOMS__ && __ROOMS__.length > 0) ROOMS = __ROOMS__;" +
        "\nreturn response;\n})";
    try { factory = evalCode(wrapped); loadMethod = "동적 평가"; }
    catch (e) { evalErr = String(e); }

    // ② 동적 평가가 막힌 앱 (메신저봇R API2) → 모듈 파일 + require
    if (!factory) {
        try { factory = loadViaRequire(code); loadMethod = "modules + require"; }
        catch (e) { reqErr = String(e); }
    }

    if (!factory) {
        throw "본체 실행 실패\n· 평가: " + evalErr + "\n· 모듈: " + reqErr;
    }

    remoteResponse = factory(TOKEN, MY_ROOMS);
    loadedAt = new Date();
    lastError = null;
}

var lastErrorReportAt = 0;   // 오류 알림 도배 방지
var lastLoadTryAt = 0;       // 본체 로드 재시도 간격 제한

/** 오류를 방에 알릴지 판단 — 명령어일 때만, 그것도 1분에 한 번까지 */
function shouldReportError(text) {
    if (String(text).indexOf(PREFIX_CHAR) !== 0) return false;   // 일반 대화면 조용히
    var now = new Date().getTime();
    if (now - lastErrorReportAt < 60000) return false;
    lastErrorReportAt = now;
    return true;
}

/** 실제 처리 (API1/API2 공통 진입점) */
function handle(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
    var text = "";
    try {
        text = String(msg).trim();

        // 같은 메시지가 두 API로 중복 전달되는 경우 방지 (1초 이내 동일 내용 무시)
        var key = room + " " + sender + " " + text;
        var now = new Date().getTime();
        if (key === lastSeen && now - lastSeenAt < 1000) return;
        lastSeen = key; lastSeenAt = now;

        // 로더 자체 명령: 본체 코드 새로고침 (최고 관리자만)
        if (text === "/업데이트") {
            if (!isLoaderAdmin(sender)) return;
            loadRemote();
            replier.reply("🔄 깃헙에서 최신 봇 코드를 불러왔어요! (" + loadMethod + ")");
            return;
        }
        if (text === "/로더") {
            replier.reply("🧩 로더 상태\n" +
                "API 방식: " + apiMode + "\n" +
                "API2 리스너: " + (api2Ready ? "등록됨 ✅" : "미등록 (API1 모드)") + "\n" +
                "방 이름: [" + room + "]\n" +
                "보낸 사람: [" + sender + "]\n" +
                "본체 로드: " + (remoteResponse ? "정상 ✅ (" + loadMethod + ")" : "아직 안 됨 ❌") +
                (loadedAt ? "\n마지막 로드: " + loadedAt.toLocaleString() : "") +
                (lastError ? "\n최근 오류: " + lastError : ""));
            return;
        }

        // 본체가 아직 없으면 지금 불러오기 (컴파일 직후 네트워크 실패 대비)
        // 실패가 반복될 때 매 메시지마다 재시도하지 않도록 1분 간격으로 제한
        if (remoteResponse === null) {
            var t = new Date().getTime();
            if (t - lastLoadTryAt < 60000) return;
            lastLoadTryAt = t;
            loadRemote();
        }

        remoteResponse(room, msg, sender, isGroupChat, replier, imageDB, packageName);
    } catch (e) {
        lastError = String(e);
        // 일반 대화 중에는 조용히 넘어간다 (오류는 /로더 로 확인)
        if (shouldReportError(text)) {
            try { replier.reply("⚠️ 로더 오류: " + e); } catch (e2) {}
        }
    }
}

// ① 구버전 API (메신저봇R API1 / 다크토네이도 챗봇 등)
function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
    apiMode = "API1 (response)";
    handle(room, msg, sender, isGroupChat, replier, imageDB, packageName);
}

// ② 신버전 API (메신저봇R API2) — BotManager.getCurrentBot().addListener 로 등록
//    ※ API2에서 bot 은 전역 변수가 아니라 BotManager 로 가져와야 한다.
(function registerApi2() {
    try {
        var b = null;
        if (typeof BotManager !== "undefined" && BotManager && BotManager.getCurrentBot) {
            b = BotManager.getCurrentBot();
        } else if (typeof bot !== "undefined" && bot) {
            b = bot;
        }
        if (!b || typeof b.addListener !== "function") return;

        var ev = (typeof Event !== "undefined" && Event && Event.MESSAGE) ? Event.MESSAGE : "message";
        b.addListener(ev, function (msg) {
            apiMode = "API2 (addListener)";
            handle(
                String(msg.room),
                String(msg.content),
                String(msg.author ? msg.author.name : ""),
                !!msg.isGroupChat,
                { reply: function (t) { msg.reply(t); } },
                msg.image,
                String(msg.packageName || "")
            );
        });
        api2Ready = true;
    } catch (e) { lastError = "addListener: " + e; }
})();

// 컴파일 시 미리 로드 (실패해도 첫 메시지 때 다시 시도)
try { loadRemote(); } catch (e) { lastError = String(e); }
