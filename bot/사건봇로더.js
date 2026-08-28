/**
 * ═══════════════════════════════════════════════════════════
 *  사건봇 로더 — 이 파일만 봇 앱(메신저봇R 등)에 붙여넣으면 됩니다.
 *
 *  동작: GitHub에 있는 본체 코드(bot/사건봇.js)를 읽어와 실행합니다.
 *  - 방 목록과 관리자 목록은 이 로더(폰)에만 두어도 되고, 비워두면 본체 기본값을 씁니다
 *  - 본체가 갱신되면 방에서 /사건업데이트 (관리자만) 또는 재컴파일
 *
 *  ◆ 지원: 메신저봇R 신버전(API2) / 구버전(API1) / 다크토네이도 챗봇
 *  ◆ 본체 로드: ① 동적 평가 → ② modules 폴더 + require (API2처럼 eval 막힌 앱)
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "사건봇";
var GLOBAL_SCOPE = this;

// ── 폰에만 두는 설정 (비워두면 본체 기본값 사용) ────────────
var MY_ROOMS = ["사건"];
var MY_ADMINS = ["사업처임병진", "가이아✡", "가이어트"];
// ────────────────────────────────────────────────────────────

var SRC_URL = "https://raw.githubusercontent.com/limbj1218-cyber/chatlog/main/bot/" +
    encodeURIComponent("사건봇.js");

var remoteResponse = null;
var loadedAt = null;
var lastError = null;
var loadMethod = "";
var apiMode = "(아직 메시지 못 받음)";
var api2Ready = false;
var lastSeen = "";
var lastSeenAt = 0;
var lastErrorReportAt = 0;
var lastLoadTryAt = 0;

function isLoaderAdmin(sender) {
    for (var i = 0; i < MY_ADMINS.length; i++) {
        if (MY_ADMINS[i] === sender) return true;
    }
    return false;
}

/** 깃헙에서 텍스트 가져오기 — jsoup 우선, 없으면 순수 자바 HTTP */
function fetchText(url) {
    try {
        if (typeof org !== "undefined" && org.jsoup) {
            return String(org.jsoup.Jsoup.connect(url)
                .ignoreContentType(true)
                .userAgent("sageon-loader")
                .timeout(15000)
                .maxBodySize(0)
                .execute().body());
        }
    } catch (e) {}

    var conn = new java.net.URL(url).openConnection();
    conn.setRequestProperty("User-Agent", "sageon-loader");
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
        try { return cx.evaluateString(GLOBAL_SCOPE, src, "sageon", 1, null); }
        finally { if (entered) Ctx.exit(); }
    } catch (e) { err = "rhino: " + e; }
    throw err;
}

// ─── 방식 ② modules 폴더 + require (메신저봇R API2) ───

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

function cleanOldModules(dir, keep) {
    try {
        var files = new java.io.File(dir).listFiles();
        if (!files) return;
        for (var i = 0; i < files.length; i++) {
            var n = String(files[i].getName());
            if (n.indexOf("sageon_core_") === 0 && n !== keep) files[i]["delete"]();
        }
    } catch (e) {}
}

function loadViaRequire(code) {
    if (typeof require !== "function") throw "이 앱에는 require 가 없어요";

    var dir = botFolder() + "modules";
    try { new java.io.File(dir).mkdirs(); } catch (e) {}

    var fname = "sageon_core_" + new Date().getTime();
    var body = "module.exports = function (__ROOMS__, __ADMINS__) {\n" + code +
        "\nif (__ROOMS__ && __ROOMS__.length > 0) ROOMS = __ROOMS__;" +
        "\nif (__ADMINS__ && __ADMINS__.length > 0) ADMINS = __ADMINS__;" +
        "\nreturn response;\n};";
    if (typeof FileStream !== "undefined" && FileStream && FileStream.write) {
        FileStream.write(dir + "/" + fname + ".js", body);
    } else {
        var f = new java.io.File(dir + "/" + fname + ".js");
        var w = new java.io.OutputStreamWriter(new java.io.FileOutputStream(f, false), "UTF-8");
        w.write(body);
        w.close();
    }

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

    var wrapped = "(function (__ROOMS__, __ADMINS__) {\n" + code +
        "\nif (__ROOMS__ && __ROOMS__.length > 0) ROOMS = __ROOMS__;" +
        "\nif (__ADMINS__ && __ADMINS__.length > 0) ADMINS = __ADMINS__;" +
        "\nreturn response;\n})";
    try { factory = evalCode(wrapped); loadMethod = "동적 평가"; }
    catch (e) { evalErr = String(e); }

    if (!factory) {
        try { factory = loadViaRequire(code); loadMethod = "modules + require"; }
        catch (e) { reqErr = String(e); }
    }

    if (!factory) {
        throw "본체 실행 실패\n· 평가: " + evalErr + "\n· 모듈: " + reqErr;
    }

    remoteResponse = factory(MY_ROOMS, MY_ADMINS);
    loadedAt = new Date();
    lastError = null;
}

/** 오류를 방에 알릴지 판단 — 명령어일 때만, 1분에 한 번까지 */
function shouldReportError(text) {
    if (String(text).indexOf("/") !== 0) return false;
    var now = new Date().getTime();
    if (now - lastErrorReportAt < 60000) return false;
    lastErrorReportAt = now;
    return true;
}

/** 실제 처리 (API1/API2 공통 진입점) */
function handle(room, msg, sender, isGroupChat, replier) {
    var text = "";
    try {
        text = String(msg).trim();

        // 같은 메시지가 두 API로 중복 전달되는 경우 방지
        var key = room + " " + sender + " " + text;
        var now = new Date().getTime();
        if (key === lastSeen && now - lastSeenAt < 1000) return;
        lastSeen = key; lastSeenAt = now;

        // 로더 자체 명령
        if (text === "/사건업데이트") {
            if (!isLoaderAdmin(sender)) return;
            loadRemote();
            replier.reply("🔄 깃헙에서 최신 사건봇 코드를 불러왔어요! (" + loadMethod + ")");
            return;
        }
        if (text === "/사건로더") {
            replier.reply("🧩 사건봇 로더 상태\n" +
                "API 방식: " + apiMode + "\n" +
                "API2 리스너: " + (api2Ready ? "등록됨 ✅" : "미등록 (API1 모드)") + "\n" +
                "방 이름: [" + room + "]\n" +
                "보낸 사람: [" + sender + "]\n" +
                "본체 로드: " + (remoteResponse ? "정상 ✅ (" + loadMethod + ")" : "아직 안 됨 ❌") +
                (loadedAt ? "\n마지막 로드: " + loadedAt.toLocaleString() : "") +
                (lastError ? "\n최근 오류: " + lastError : ""));
            return;
        }

        // 본체가 아직 없으면 불러오기 (실패 시 1분 간격으로만 재시도)
        if (remoteResponse === null) {
            var t = new Date().getTime();
            if (t - lastLoadTryAt < 60000) return;
            lastLoadTryAt = t;
            loadRemote();
        }

        remoteResponse(room, msg, sender, isGroupChat, replier);
    } catch (e) {
        lastError = String(e);
        if (shouldReportError(text)) {
            try { replier.reply("⚠️ 사건봇 로더 오류: " + e); } catch (e2) {}
        }
    }
}

// ① 구버전 API (메신저봇R API1 / 다크토네이도 챗봇 등)
function response(room, msg, sender, isGroupChat, replier) {
    apiMode = "API1 (response)";
    handle(room, msg, sender, isGroupChat, replier);
}

// ② 신버전 API (메신저봇R API2)
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
        b.addListener(ev, function (m) {
            apiMode = "API2 (addListener)";
            handle(
                String(m.room),
                String(m.content),
                String(m.author ? m.author.name : ""),
                !!m.isGroupChat,
                { reply: function (t) { m.reply(t); } }
            );
        });
        api2Ready = true;
    } catch (e) { lastError = "addListener: " + e; }
})();

// 컴파일 시 미리 로드 (실패해도 첫 메시지 때 다시 시도)
try { loadRemote(); } catch (e) { lastError = String(e); }
