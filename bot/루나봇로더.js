/**
 * ═══════════════════════════════════════════════════════════
 *  루나봇 로더 — 이 파일만 봇 앱(메신저봇R 등)에 붙여넣으면 됩니다.
 *
 *  동작: GitHub에 있는 본체 코드(bot/루나봇.js)를 읽어와 실행합니다.
 *  - 방 목록과 관리자 목록은 이 로더(폰)에만 두어도 되고, 비워두면 본체 기본값을 씁니다
 *  - 본체가 갱신되면 방에서 /루나업데이트 (관리자만) 또는 재컴파일
 *
 *  ◆ 지원: 메신저봇R 신버전(API2) / 구버전(API1) / 다크토네이도 챗봇
 *  ◆ 본체 로드: ① 동적 평가 → ② modules 폴더 + require (API2처럼 eval 막힌 앱)
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "루나봇";
var LOADER_VER = "1112-3";   // 로더를 다시 붙여넣었는지 /루나로더 에서 확인용 (1112-1: /내정보, 1112-2: hash 숨김, 1112-3: API2 우선)
var GLOBAL_SCOPE = this;

// ── 폰에만 두는 설정 (비워두면 본체 기본값 사용) ────────────
var MY_ROOMS = ["루나"];
var MY_ADMINS = ["후파"];   // 대화명에 이 낱말이 들어 있으면 관리자
// ────────────────────────────────────────────────────────────

var SRC_URL = "https://raw.githubusercontent.com/limbj1218-cyber/chatlog/main/bot/" +
    encodeURIComponent("루나봇.js");

var remoteResponse = null;
var loadedAt = null;
var lastError = null;
var loadMethod = "";
var apiMode = "(아직 메시지 못 받음)";
var api2Ready = false;
var api2Seen = false;   // API2 로 메시지를 한 번이라도 받았으면 API1 은 무시한다 (hash 가 API2 에만 있어서)
var lastSeen = "";
var lastSeenAt = 0;
var lastErrorReportAt = 0;
var lastLoadTryAt = 0;

function isLoaderAdmin(sender) {
    for (var i = 0; i < MY_ADMINS.length; i++) {
        if (MY_ADMINS[i] && String(sender).indexOf(MY_ADMINS[i]) !== -1) return true;
    }
    return false;
}

/** 깃헙에서 텍스트 가져오기 — jsoup 우선, 없으면 순수 자바 HTTP */
function fetchText(url) {
    try {
        if (typeof org !== "undefined" && org.jsoup) {
            return String(org.jsoup.Jsoup.connect(url)
                .ignoreContentType(true)
                .userAgent("luna-loader")
                .timeout(15000)
                .maxBodySize(0)
                .execute().body());
        }
    } catch (e) {}

    var conn = new java.net.URL(url).openConnection();
    conn.setRequestProperty("User-Agent", "luna-loader");
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
        try { return cx.evaluateString(GLOBAL_SCOPE, src, "luna", 1, null); }
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
            if (n.indexOf("luna_core_") === 0 && n !== keep) files[i]["delete"]();
        }
    } catch (e) {}
}

function loadViaRequire(code) {
    if (typeof require !== "function") throw "이 앱에는 require 가 없어요";

    var dir = botFolder() + "modules";
    try { new java.io.File(dir).mkdirs(); } catch (e) {}

    var fname = "luna_core_" + new Date().getTime();
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

// ─── 보낸 사람 식별 (대화명을 바꿔도 같은 사람인지 알아보려고, 2026-11-12) ───
// 카톡 알림에는 회원 ID 가 없다. 대신 쓸 수 있는 값 두 가지를 모은다:
//   ① 메신저봇R API2 의 author.hash (앱 버전에 따라 없을 수 있다)
//   ② 프로필 사진으로 만든 지문 (사진을 바꾸면 달라지고, 기본 프사끼리는 겹친다)
// 메시지마다 사진을 해시하면 무거우니 ②는 필요할 때만 계산한다 (who.profileKey()).
// extra: API2 면 { m: 메시지 객체 }, API1 이면 { imageDB: ... }

function sha1Hex(str) {
    var md = java.security.MessageDigest.getInstance("SHA-1");
    var b = md.digest(new java.lang.String(str).getBytes("UTF-8"));
    var out = "";
    for (var i = 0; i < b.length; i++) {
        var v = b[i] & 0xff;
        out += (v < 16 ? "0" : "") + v.toString(16);
    }
    return out;
}

function authorHash(extra) {
    try {
        var a = extra && extra.m ? extra.m.author : null;
        if (a && a.hash !== undefined && a.hash !== null) {
            var h = String(a.hash);
            if (h && h !== "undefined" && h !== "null") return h;
        }
    } catch (e) {}
    return null;
}

function profileBase64(extra) {
    try {
        var a = extra && extra.m ? extra.m.author : null;
        if (a && a.avatar && typeof a.avatar.getBase64 === "function") {
            var s = a.avatar.getBase64();
            if (s) return String(s);
        }
    } catch (e) {}
    try {
        var db = extra ? extra.imageDB : null;
        if (db) {
            if (typeof db.getProfileBase64 === "function") return String(db.getProfileBase64());
            if (typeof db.getProfileImage === "function") return String(db.getProfileImage());
        }
    } catch (e) {}
    return null;
}

function profileKey(extra) {
    var b = profileBase64(extra);
    if (!b) return null;
    try { return sha1Hex(b).substring(0, 12); } catch (e) { return null; }
}

/** 본체에 넘길 보낸 사람 정보 (지금 본체는 쓰지 않는다 — 기록을 사람 단위로 바꿀 때 쓴다) */
function makeWho(sender, extra) {
    return {
        name: String(sender),
        hash: authorHash(extra),
        profileKey: function () { return profileKey(extra); }
    };
}

/** /내정보 — 이 폰의 앱이 사람을 구분할 값을 주는지 확인 */
function myInfoText(sender, extra) {
    var lines = ["🪪 내 정보 (루나봇 로더 " + LOADER_VER + ")", "대화명: " + sender, "받은 방식: " + apiMode];
    // ★ hash·지문은 사람을 구분하는 열쇠라 값은 절대 보여주지 않는다 — 있는지만 알려준다 (2026-11-12)
    var h = authorHash(extra);
    lines.push("보낸 사람 hash: " + (h ? "있음 ✅ (값은 비공개)" : "없음 ❌"));
    var pk = profileKey(extra);
    lines.push("프로필 사진 지문: " + (pk ? "있음 ✅ (값은 비공개)" : "없음 ❌"));
    try {
        var a = extra && extra.m ? extra.m.author : null;
        if (a) {
            var keys = [];
            for (var k in a) { if (keys.length < 15) keys.push(String(k)); }
            if (keys.length) lines.push("보낸 사람 항목: " + keys.join(", "));
        }
    } catch (e) {}
    lines.push("", "hash 가 있으면 대화명을 바꿔도 같은 사람으로 기록돼요.");
    return lines.join("\n");
}

/** 실제 처리 (API1/API2 공통 진입점) */
function handle(room, msg, sender, isGroupChat, replier, extra) {
    var text = "";
    try {
        text = String(msg).trim();

        // 같은 메시지가 두 API로 중복 전달되는 경우 방지
        var key = room + " " + sender + " " + text;
        var now = new Date().getTime();
        if (key === lastSeen && now - lastSeenAt < 1000) return;
        lastSeen = key; lastSeenAt = now;

        // 로더 자체 명령
        if (text === "/루나업데이트") {
            if (!isLoaderAdmin(sender)) return;
            loadRemote();
            replier.reply("🔄 깃헙에서 최신 루나봇 코드를 불러왔어요! (" + loadMethod + ")");
            return;
        }
        if (text === "/내정보") {
            if (MY_ROOMS.length && MY_ROOMS.indexOf(String(room)) === -1) return;
            replier.reply(myInfoText(sender, extra));
            return;
        }
        if (text === "/루나로더") {
            replier.reply("🧩 루나봇 로더 상태 (로더 " + LOADER_VER + ")\n" +
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

        remoteResponse(room, msg, sender, isGroupChat, replier, makeWho(sender, extra));
    } catch (e) {
        lastError = String(e);
        if (shouldReportError(text)) {
            try { replier.reply("⚠️ 루나봇 로더 오류: " + e); } catch (e2) {}
        }
    }
}

// ① 구버전 API (메신저봇R API1 / 다크토네이도 챗봇 등)
function response(room, msg, sender, isGroupChat, replier, imageDB) {
    // 같은 메시지가 두 갈래로 오는데 먼저 온 쪽만 처리된다. API1 이 먼저 오면 hash 가 없어
    // 같은 사람이 새 사람으로 잡혔다 (2026-11-12). API2 가 동작하는 앱이면 API1 은 아예 무시한다.
    if (api2Seen) return;
    apiMode = "API1 (response)";
    handle(room, msg, sender, isGroupChat, replier, { imageDB: imageDB });
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
            api2Seen = true;
            apiMode = "API2 (addListener)";
            handle(
                String(m.room),
                String(m.content),
                String(m.author ? m.author.name : ""),
                !!m.isGroupChat,
                { reply: function (t) { m.reply(t); } },
                { m: m }
            );
        });
        api2Ready = true;
    } catch (e) { lastError = "addListener: " + e; }
})();

// 컴파일 시 미리 로드 (실패해도 첫 메시지 때 다시 시도)
try { loadRemote(); } catch (e) { lastError = String(e); }
