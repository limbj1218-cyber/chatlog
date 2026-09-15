/**
 * ═══════════════════════════════════════════════════════════
 *  오토봇 로더 — 이 파일만 봇 앱(메신저봇R 등)에 붙여넣으면 됩니다.
 *
 *  동작: GitHub에 있는 본체 코드(bot/오토봇.js)를 읽어와 실행합니다.
 *  - 방 목록은 이 로더(폰)에만 두어도 되고, 비워두면 본체 기본값을 씁니다
 *  - 코드나 자동응답 내용이 갱신되면 방에서 /오토업데이트 (관리자만) 또는 재컴파일
 *    → 본체를 다시 불러오면서 자동응답 데이터(오토봇데이터.json)도 같이 새로 받습니다
 *
 *  ◆ 지원: 메신저봇R 신버전(API2) / 구버전(API1) / 다크토네이도 챗봇
 *  ◆ 본체 로드: ① 동적 평가 → ② modules 폴더 + require (API2처럼 eval 막힌 앱)
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "오토봇";
var GLOBAL_SCOPE = this;

// ── 폰에만 두는 설정 (비워두면 본체 기본값 사용) ────────────
var MY_ROOMS = [
    "오토2프프",
    "오토2",
    "[오차율 계산봇]"
];
// /오토업데이트·/쿠키 를 쓸 수 있는 사람 (대화명에 이 문자열이 포함되면 허용)
var SUPER_ADMINS = ["후파", "임병진", "[오차율 계산봇]"];

// 네이버 카페 새글 알림용 로그인 쿠키 (비공개 카페일 때만 필요).
// ※ 보통은 여기 두지 않고, 카톡에서 /쿠키 NID_AUT=값; NID_SES=값 으로 넣는 게 편하다.
//    (봇이 폰 파일에 저장하므로 앱을 껐다 켜도 유지된다)
// 굳이 여기 넣으려면: PC 크롬 F12 → Application → Cookies → cafe.naver.com 에서 두 값을 복사
// 예) var MY_COOKIE = "NID_AUT=abcd...; NID_SES=efgh...";
// ★ 이 값은 폰에만 두고 절대 깃헙에 올리지 않는다.
var MY_COOKIE = "";
// ────────────────────────────────────────────────────────────

var SRC_URL = "https://raw.githubusercontent.com/limbj1218-cyber/chatlog/main/bot/" +
    encodeURIComponent("오토봇.js");

var remoteResponse = null;
var loadedAt = null;
var lastError = null;
var loadMethod = "";
var codeFrom = "";     // 본체 코드를 어디서 얻었는지 (깃헙 / 폰에 저장된 코드)
var apiMode = "(아직 메시지 못 받음)";
var api2Ready = false;
var lastSeen = "";
var lastSeenAt = 0;
var lastErrorReportAt = 0;
var lastLoadTryAt = 0;

function isLoaderAdmin(sender) {
    for (var i = 0; i < SUPER_ADMINS.length; i++) {
        if (String(sender).indexOf(SUPER_ADMINS[i]) !== -1) return true;
    }
    return false;
}

/** 깃헙에서 텍스트 가져오기 — jsoup 우선, 없으면 순수 자바 HTTP */
function fetchText(url) {
    try {
        if (typeof org !== "undefined" && org.jsoup) {
            return String(org.jsoup.Jsoup.connect(url)
                .ignoreContentType(true)
                .userAgent("autobot-loader")
                .timeout(15000)
                .maxBodySize(0)
                .execute().body());
        }
    } catch (e) {}

    var conn = new java.net.URL(url).openConnection();
    conn.setRequestProperty("User-Agent", "autobot-loader");
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
        try { return cx.evaluateString(GLOBAL_SCOPE, src, "autobot", 1, null); }
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

// ── 파일 · 백그라운드 (본체를 못 받았을 때를 대비한 장치들) ──

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

/** 백그라운드 실행 — 메시지 흐름에서 네트워크를 절대 기다리지 않기 위해 */
function runAsync(fn) {
    var body = function () { try { fn(); } catch (e) {} };
    try {
        var t = new java.lang.Thread(body);
        t.setDaemon(true); t.start();
        return true;
    } catch (e) {}
    return false;   // 스레드를 못 만들면 그냥 포기한다 (여기서 직접 돌리면 봇이 멈춘다)
}

/** 마지막으로 성공한 본체 코드를 두는 곳 — 깃헙이 안 될 때 이걸로 버틴다 */
function codeCachePath() {
    return botFolder() + "오토봇본체캐시.js";
}

/** 예전에 받아둔 모듈 파일 정리 (지금 쓰는 것만 남김) */
function cleanOldModules(dir, keep) {
    try {
        var files = new java.io.File(dir).listFiles();
        if (!files) return;
        for (var i = 0; i < files.length; i++) {
            var n = String(files[i].getName());
            if (n.indexOf("autobot_core_") === 0 && n !== keep) files[i]["delete"]();
        }
    } catch (e) {}
}

/**
 * 본체 코드를 modules 폴더에 CommonJS 모듈로 저장한 뒤 require 로 불러온다.
 * (파일명에 시각을 넣어 require 캐시를 피하므로 /오토업데이트 가 매번 최신을 반영)
 */
function loadViaRequire(code) {
    if (typeof require !== "function") throw "이 앱에는 require 가 없어요";

    var dir = botFolder() + "modules";
    try { new java.io.File(dir).mkdirs(); } catch (e) {}

    var fname = "autobot_core_" + new Date().getTime();
    var body = "module.exports = function (__ROOMS__, __COOKIE__, __ADMINS__) {\n" + code +
        "\nif (__ROOMS__ && __ROOMS__.length > 0) ROOMS = __ROOMS__;" +
        "\nif (__ADMINS__ && __ADMINS__.length > 0) ADMINS = __ADMINS__;" +
        "\nif (__COOKIE__) NAVER_COOKIE = __COOKIE__;" +
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

/**
 * 본체를 준비한다.
 *
 * @param useNetwork 깃헙에서 받아올지. false 면 폰에 저장해 둔 마지막 코드만 쓴다.
 *
 * ※ 깃헙이 잠깐이라도 안 되면 봇이 통째로 죽던 문제 때문에 캐시를 둔다.
 *   예전에는 받아오기가 실패하면 그것으로 끝이라 본체가 없는 채로 남았고,
 *   그 뒤로는 메시지가 올 때마다 메시지 흐름에서 네트워크를 다시 시도하며
 *   최대 20초씩 멈춰서 결국 안드로이드가 앱을 정지시켰다.
 */
function loadRemote(useNetwork) {
    var code = null, netErr = null;

    if (useNetwork !== false) {
        try {
            // 깃헙 raw 에 잠깐 캐시가 걸려 옛 코드가 오는 일이 있어 시각을 붙인다
            var got = fetchText(SRC_URL + "?t=" + new Date().getTime());
            if (String(got).indexOf("function response") === -1) {
                netErr = "받아온 코드가 올바르지 않아요 (URL 확인 필요)";
            } else {
                code = got;
            }
        } catch (e) {
            netErr = String(e);
        }
    }

    var fromCache = false;
    if (!code) {
        code = fileRead(codeCachePath());
        if (code && String(code).indexOf("function response") !== -1) {
            fromCache = true;
        } else {
            code = null;
        }
    }

    if (!code) {
        throw "본체를 받지 못했고 폰에 저장된 것도 없어요" + (netErr ? "\n· " + netErr : "");
    }

    var factory = null, evalErr = null, reqErr = null;

    // ① 동적 평가 허용 앱
    var wrapped = "(function (__ROOMS__, __COOKIE__, __ADMINS__) {\n" + code +
        "\nif (__ROOMS__ && __ROOMS__.length > 0) ROOMS = __ROOMS__;" +
        "\nif (__ADMINS__ && __ADMINS__.length > 0) ADMINS = __ADMINS__;" +
        "\nif (__COOKIE__) NAVER_COOKIE = __COOKIE__;" +
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

    remoteResponse = factory(MY_ROOMS, MY_COOKIE, SUPER_ADMINS);
    loadedAt = new Date();
    codeFrom = fromCache ? "폰에 저장된 코드" : "깃헙";
    // 깃헙에서 제대로 받았을 때만 저장해 둔다 (다음에 깃헙이 안 될 때 쓸 것)
    if (!fromCache) { try { fileWrite(codeCachePath(), code); } catch (e) {} }
    // 캐시로 버틴 경우엔 왜 그랬는지 남겨 둔다
    lastError = fromCache ? netErr : null;
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

        // 같은 메시지가 두 API로 중복 전달되는 경우 방지 (1초 이내 동일 내용 무시)
        var key = room + " " + sender + " " + text;
        var now = new Date().getTime();
        if (key === lastSeen && now - lastSeenAt < 1000) return;
        lastSeen = key; lastSeenAt = now;

        // 로더 자체 명령: 본체 코드 + 자동응답 데이터 새로고침 (관리자만)
        if (text === "/오토업데이트") {
            if (!isLoaderAdmin(sender)) return;
            loadRemote(true);   // 관리자가 직접 시킨 것이니 여기서는 기다린다
            replier.reply("🔄 깃헙에서 최신 오토봇 코드와 자동응답 내용을 불러왔어요! (" + loadMethod + ")");
            return;
        }
        if (text === "/오토로더") {
            replier.reply("🧩 오토봇 로더 상태\n" +
                "API 방식: " + apiMode + "\n" +
                "API2 리스너: " + (api2Ready ? "등록됨 ✅" : "미등록 (API1 모드)") + "\n" +
                "방 이름: [" + room + "]\n" +
                "보낸 사람: [" + sender + "]\n" +
                "본체 로드: " + (remoteResponse ? "정상 ✅ (" + loadMethod + ")" : "아직 안 됨 ❌") + "\n" +
                "코드 출처: " + (codeFrom || "(아직 없음)") +
                (loadedAt ? "\n마지막 로드: " + loadedAt.toLocaleString() : "") +
                (lastError ? "\n최근 오류: " + lastError : ""));
            return;
        }

        // 본체가 아직 없으면 준비한다.
        // ※ 여기서 네트워크를 기다리면 봇이 멈춘다 — 폰에 저장된 코드만 즉시 써보고,
        //   깃헙에서 받아오는 건 백그라운드로 넘긴다.
        if (remoteResponse === null) {
            try { loadRemote(false); } catch (e) { lastError = String(e); }

            if (remoteResponse === null) {
                var t = new Date().getTime();
                if (t - lastLoadTryAt >= 60000) {
                    lastLoadTryAt = t;
                    runAsync(function () {
                        try { loadRemote(true); } catch (e2) { lastError = String(e2); }
                    });
                }
                return;
            }
        }

        remoteResponse(room, msg, sender, isGroupChat, replier);
    } catch (e) {
        lastError = String(e);
        if (shouldReportError(text)) {
            try { replier.reply("⚠️ 오토봇 로더 오류: " + e); } catch (e2) {}
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

// 컴파일 시 준비.
// 폰에 저장된 코드로 먼저 즉시 띄우고(네트워크를 기다리지 않는다),
// 깃헙에서 받아오는 건 백그라운드로 넘긴다. 깃헙이 잠깐 안 되어도 봇은 살아 있다.
try { loadRemote(false); } catch (e) {}
if (!runAsync(function () { try { loadRemote(true); } catch (e2) { lastError = String(e2); } })) {
    // 스레드를 못 만드는 앱이면 어쩔 수 없이 여기서 받아온다
    try { loadRemote(true); } catch (e3) { lastError = String(e3); }
}
