/**
 * ═══════════════════════════════════════════════════════════
 *  오토봇 — 등록된 문구에 자동으로 응답하는 봇 (읽기 전용)
 *
 *  ◆ 명령어
 *    /리스트   → 이 방에서 반응하는 트리거 목록 (누구나)
 *    /오토     → 진단 (방 인식·데이터 상태·버전) — 모든 방에서 동작
 *    /카페     → 카페 새글 알림 상태 진단
 *    /깃토큰   → 카페 목록을 읽을 깃헙 토큰 등록 (관리자만, /깃토큰 삭제 로 제거)
 *    ※ 등록/삭제 명령은 없다. 내용은 깃헙의 bot/오토봇데이터.json 을 고쳐서 관리한다.
 *
 *  ◆ 네이버 카페 새글 알림
 *    폰에서 네이버를 직접 부르면 세션이 거부되므로(쿠키·IP·헤더를 다 맞춰도 실패),
 *    깃헙 Actions 가 대신 카페를 확인해 비공개 저장소에 목록을 써 두고 봇은 그걸 읽는다.
 *
 *      chatlog(.github/workflows/cafe-watch.yml, 10분마다)
 *        → 네이버 카페 API (쿠키는 저장소 Secret)
 *        → cafe-watch(비공개)/latest.json
 *        → 오토봇이 checkMin 분마다 읽어 새 글만 방에 알림
 *
 *    폰에는 비공개 저장소를 읽을 깃헙 토큰만 둔다 (/깃토큰, 또는 gh_token.txt).
 *    ※ /쿠키·/UA 는 폰에서 네이버를 직접 부르던 시절의 잔재로, 지금 경로에서는 쓰이지 않는다.
 *
 *  ◆ 데이터
 *    깃헙에서 오토봇데이터.json 을 받아 쓰고, 받은 내용을 폰에 캐시한다.
 *    네트워크가 죽어도 마지막으로 받은 내용으로 계속 동작한다.
 *    갱신: 앱 시작 시 / 30분마다 자동 / 방에서 /오토업데이트 (즉시)
 *
 *  ◆ 호환성
 *    - 메신저봇R 신버전(API2) / 구버전(API1) / 다크토네이도 챗봇 모두 동작
 *    - FileStream 이 없는 앱에서는 java.io 로 자동 대체
 *    - 캐시 폴더는 쓰기 가능한 곳을 자동 선택 (권한 없어도 앱 전용 폴더 사용)
 *
 *  ※ 안드로이드 Rhino 엔진 호환을 위해 ES5 문법만 사용한다.
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "오토봇";
var BOT_VER = "0904-12";

// ─────────────── 설정 (여기만 고치면 됨) ───────────────
var ROOMS = [
    "오토2프프",
    "오토2"
];

// 로더(MY_ROOMS)가 위 ROOMS 를 덮어쓰므로, 로더를 다시 붙여넣지 않고 방을 늘리려면 여기에 적는다.
var EXTRA_ROOMS = [
    "[오차율 계산봇]"
];

var PREFIX = "/";                  // 명령어 접두사
var COMMON_KEY = "_공통";          // 모든 방에 공통 적용되는 데이터 키
var REFRESH_MIN = 30;              // 데이터 자동 갱신 주기 (분)
var LIST_MAX = 30;                 // /리스트 에 한 번에 보여줄 최대 개수
var DATA_URL = "https://raw.githubusercontent.com/limbj1218-cyber/chatlog/main/bot/" +
    encodeURIComponent("오토봇데이터.json");

// ── 네이버 카페 새글 알림 ──
var CAFE = {
    on: true,                       // false 로 두면 알림 기능 전체 정지
    clubId: 31766195,               // 카페 고유 번호
    cafeUrl: "autoworker2",         // 링크 만들 때 쓰는 주소 (cafe.naver.com/이것/글번호)
    name: "오토워커",                // 알림 제목에 쓰는 이름
    rooms: ["오토2프프", "오토2"],   // 알림 보낼 방 (ROOMS 안에 있어야 함)
    checkMin: 10,                   // 확인 주기 (분)
    perPage: 20,                    // 한 번에 확인할 글 수
    maxNotify: 5,                   // 한 번에 알릴 최대 글 수 (넘으면 "외 N건")
    menuIds: []                     // 특정 게시판만 알리려면 menuId 를 넣는다 (빈 배열 = 전체)
};
// ────────────────────────────────────────────────────────

var REFRESH_MS = REFRESH_MIN * 60 * 1000;
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

var LAST_HTTP = 0;                 // 마지막 HTTP 응답 코드 (진단용)
var COOKIE_HANDLER_SEEN = false;   // 앱 기본 CookieHandler 가 있었는지 (진단용)
var UA_OVERRIDE = "";              // /UA 로 지정한 브라우저 문자열 (있으면 이걸 쓴다)

/** 실제로 보낼 User-Agent */
function currentUA() { return UA_OVERRIDE || UA; }

/** User-Agent 의 크롬 버전에 맞춘 sec-ch-ua 헤더 값 */
function secChUa() {
    var m = String(currentUA()).match(/Chrome\/(\d+)/);
    var v = m ? m[1] : "120";
    return '"Chromium";v="' + v + '", "Google Chrome";v="' + v + '", "Not.A/Brand";v="24"';
}

// 카페 최신글 목록이 놓이는 비공개 저장소 (깃헙 Actions 가 갱신한다)
var GH_REPO = "limbj1218-cyber/cafe-watch";
var GH_PATH = "latest.json";

// 폰에만 두는 값 — 깃헙에는 올리지 않는다 (로더 주입 또는 /깃토큰 · /쿠키 로 등록)
var NAVER_COOKIE = "";
var GH_TOKEN = "";

// /쿠키 명령을 쓸 수 있는 사람 (대화명에 이 문자열이 포함되면 관리자). 로더가 덮어쓴다.
var ADMINS = ["후파", "임병진"];

// 로더가 ADMINS 를 덮어쓰므로, 로더를 다시 붙여넣지 않고 관리자를 늘리려면 여기에 적는다.
var EXTRA_ADMINS = [
    "[오차율 계산봇]"
];

/** 이 방에서 동작해야 하는지 (로더 목록 + 추가 목록) */
function inRooms(room) {
    return ROOMS.indexOf(room) !== -1 || EXTRA_ROOMS.indexOf(room) !== -1;
}

// ═══════════════ 앱 호환 계층 ═══════════════
// 봇 앱마다 제공하는 전역이 다르다 (메신저봇R API2에는 FileStream 이 없다).

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

/** 쓰기 가능한 캐시 폴더 자동 선택 (권한 없어도 앱 전용 폴더는 쓸 수 있다) */
function pickBaseDir() {
    var cands = [];
    try {
        var app = android.app.ActivityThread.currentApplication();
        var ext = app.getExternalFilesDir(null);
        if (ext) cands.push(String(ext.getAbsolutePath()) + "/오토봇");
        cands.push(String(app.getFilesDir().getAbsolutePath()) + "/autobot");
    } catch (e) {}
    cands.push("/sdcard/오토봇");
    for (var i = 0; i < cands.length; i++) {
        try {
            if (fileWrite(cands[i] + "/write_test.txt", "ok") &&
                String(fileRead(cands[i] + "/write_test.txt")).indexOf("ok") === 0) return cands[i];
        } catch (e) {}
    }
    return null;   // 어디에도 못 쓰면 캐시 없이 동작 (깃헙만 사용)
}

var BASE_DIR = pickBaseDir();
var CACHE_FILE = BASE_DIR ? (BASE_DIR + "/오토봇캐시.json") : null;
var STATE_FILE = BASE_DIR ? (BASE_DIR + "/오토봇상태.json") : null;
var COOKIE_FILE = BASE_DIR ? (BASE_DIR + "/naver_cookie.txt") : null;
var UA_FILE = BASE_DIR ? (BASE_DIR + "/naver_ua.txt") : null;
var TOKEN_FILE = BASE_DIR ? (BASE_DIR + "/gh_token.txt") : null;

/**
 * 텍스트 가져오기 — jsoup 우선, 없으면 순수 자바 HTTP.
 * opt: { cookie: "...", referer: "..." } (없으면 그냥 평범한 GET)
 */
function fetchText(url, opt) {
    opt = opt || {};
    // 쿠키가 필요한 요청은 jsoup 을 건너뛴다.
    // (jsoup 은 자체 쿠키 저장소로 Cookie 헤더를 덮어써 로그인이 풀리는 경우가 있다)
    try {
        if (!opt.cookie && !opt.headers && typeof org !== "undefined" && org.jsoup) {
            var c = org.jsoup.Jsoup.connect(url)
                .ignoreContentType(true)
                .ignoreHttpErrors(true)
                .userAgent(currentUA())
                .timeout(15000)
                .maxBodySize(0);
            if (opt.cookie) c = c.header("Cookie", opt.cookie);
            if (opt.referer) c = c.header("Referer", opt.referer);
            return String(c.execute().body());
        }
    } catch (e) {}

    var conn = new java.net.URL(url).openConnection();
    conn.setRequestProperty("User-Agent", currentUA());
    if (opt.headers) {
        for (var h = 0; h < opt.headers.length; h++) {
            try { conn.setRequestProperty(opt.headers[h][0], opt.headers[h][1]); } catch (he) {}
        }
    }
    if (opt.cookie) {
        // 브라우저가 주소창으로 여는 요청과 최대한 똑같이 맞춘다
        conn.setRequestProperty("Cookie", opt.cookie);
        conn.setRequestProperty("Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp," +
            "image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7");
        conn.setRequestProperty("Accept-Language", "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7");
        conn.setRequestProperty("Upgrade-Insecure-Requests", "1");
        conn.setRequestProperty("Sec-Fetch-Site", "none");
        conn.setRequestProperty("Sec-Fetch-Mode", "navigate");
        conn.setRequestProperty("Sec-Fetch-User", "?1");
        conn.setRequestProperty("Sec-Fetch-Dest", "document");
        conn.setRequestProperty("sec-ch-ua", secChUa());
        conn.setRequestProperty("sec-ch-ua-mobile", "?0");
        conn.setRequestProperty("sec-ch-ua-platform", "\"Windows\"");
    }
    if (opt.referer) conn.setRequestProperty("Referer", opt.referer);
    conn.setConnectTimeout(15000);
    conn.setReadTimeout(20000);

    // 앱에 기본 CookieHandler 가 깔려 있으면 우리가 넣은 Cookie 헤더를 자기 것으로 덮어쓴다.
    // 그래서 이 요청 동안만 잠시 꺼두고, 끝나면 원래대로 되돌린다.
    var savedCH = null, chOff = false;
    if (opt.cookie) {
        try {
            savedCH = java.net.CookieHandler.getDefault();
            if (savedCH !== null) {
                java.net.CookieHandler.setDefault(null);
                chOff = true;
                COOKIE_HANDLER_SEEN = true;
            }
        } catch (e) {}
    }

    try {
        try { LAST_HTTP = Number(conn.getResponseCode()); } catch (e) {}
        var br = new java.io.BufferedReader(
            new java.io.InputStreamReader(conn.getInputStream(), "UTF-8"));
        var sb = new java.lang.StringBuilder(), line;
        while ((line = br.readLine()) !== null) { sb.append(line); sb.append("\n"); }
        br.close();
        conn.disconnect();
        return String(sb.toString());
    } finally {
        if (chOff) { try { java.net.CookieHandler.setDefault(savedCH); } catch (e) {} }
    }
}

// ═══════════════ 데이터 ═══════════════

var DATA = null;          // { "_공통": {트리거:내용}, "방이름": {...} }
var DATA_FROM = "없음";   // 깃헙 / 캐시 / 없음
var lastLoadAt = 0;       // 마지막 로드 "시도" 시각
var lastOkAt = null;      // 마지막 성공 시각
var lastLoadErr = null;

function parseData(txt) {
    var obj = JSON.parse(String(txt));
    if (!obj || typeof obj !== "object") throw "데이터 형식이 올바르지 않아요";
    return obj;
}

/** 깃헙에서 데이터를 받아온다. 실패하면 폰 캐시로 대체 */
function loadData() {
    lastLoadAt = new Date().getTime();
    try {
        // 중간 캐시된 옛 내용이 오지 않도록 시각을 붙인다
        var txt = fetchText(DATA_URL + "?t=" + lastLoadAt);
        var obj = parseData(txt);
        DATA = obj;
        DATA_FROM = "깃헙";
        lastOkAt = new Date();
        lastLoadErr = null;
        if (CACHE_FILE) fileWrite(CACHE_FILE, txt);
        return true;
    } catch (e) {
        lastLoadErr = String(e);
    }
    // 깃헙 실패 → 캐시 (이미 데이터가 있으면 그대로 유지)
    if (DATA === null && CACHE_FILE) {
        try {
            var c = fileRead(CACHE_FILE);
            if (c) { DATA = parseData(c); DATA_FROM = "캐시"; return true; }
        } catch (e2) {}
    }
    return false;
}

/** 네트워크 대기로 메시지 처리가 멈추지 않게 별도 스레드에서 실행 (안 되면 그냥 실행) */
function runAsync(fn) {
    try {
        var t = new java.lang.Thread(new JavaAdapter(java.lang.Runnable, { run: fn }));
        t.setDaemon(true);
        t.start();
        return;
    } catch (e) {}
    try { fn(); } catch (e2) {}
}

/** 마지막 갱신이 REFRESH_MIN 분보다 오래됐으면 백그라운드로 다시 받아온다 */
function refreshIfStale() {
    var now = new Date().getTime();
    if (now - lastLoadAt < REFRESH_MS) return;
    lastLoadAt = now;               // 실패해도 다음 주기까지는 재시도하지 않는다
    runAsync(function () { try { loadData(); } catch (e) {} });
}

/** 이 방에 적용되는 트리거표 — 공통 위에 방별을 덮어쓴다 */
function tableFor(room) {
    var out = {}, k;
    if (!DATA) return out;
    var common = DATA[COMMON_KEY];
    if (common) for (k in common) if (common.hasOwnProperty(k)) out[k] = common[k];
    var own = DATA[room];
    if (own) for (k in own) if (own.hasOwnProperty(k)) out[k] = own[k];
    return out;
}

function triggersOf(table) {
    var keys = [], k;
    for (k in table) if (table.hasOwnProperty(k)) keys.push(k);
    keys.sort();
    return keys;
}

// ═══════════════ 네이버 카페 새글 알림 ═══════════════

var cafeLastId = 0;        // 마지막으로 알린 글 번호
var cafeCheckedAt = null;  // 마지막 확인 시각
var cafeOkAt = null;       // 마지막 성공 시각
var cafeErr = null;
var cafeSentTotal = 0;
var cafeWarnAt = 0;        // 로그인 만료 경고 도배 방지
var cafeRawHead = "";      // 마지막 응답 앞부분 (진단용)
var cafeUpdatedAt = "";    // 깃헙이 목록을 갱신한 시각

/**
 * 봇이 먼저 말 걸기 — 앱마다 API가 달라서 되는 것을 순서대로 시도한다.
 * (메신저봇R 구버전 Api.replyRoom / 신버전 Bot·bot.send)
 */
function sendToRoom(room, text) {
    try { if (typeof Api !== "undefined" && Api.replyRoom) { Api.replyRoom(room, text); return true; } } catch (e) {}
    try { if (typeof bot !== "undefined" && bot && bot.send) { bot.send(room, text); return true; } } catch (e) {}
    try { if (typeof Bot !== "undefined" && Bot && Bot.send) { Bot.send(room, text); return true; } } catch (e) {}
    return false;
}

/** 깃헙 토큰 — ① 로더 주입 ② 폰의 gh_token.txt */
function ghToken() {
    if (GH_TOKEN) return GH_TOKEN;
    if (TOKEN_FILE) {
        var t = fileRead(TOKEN_FILE);
        if (t) return String(t).replace(/[\r\n]+/g, "").replace(/^\s+|\s+$/g, "");
    }
    return "";
}

/** /깃토큰 <PAT> — 비공개 저장소를 읽을 토큰 등록 (관리자만) */
function setTokenCmd(arg, sender, isGroupChat) {
    if (!isAdmin(sender)) return null;
    var v = String(arg || "").replace(/[\r\n]+/g, " ").replace(/^\s+|\s+$/g, "");

    if (!v) {
        return "🔐 깃헙 토큰 등록\n─────────────\n" +
            "현재: " + (ghToken() ? "등록됨 ✅" : "없음 ❌") + "\n\n" +
            "사용법: " + PREFIX + "깃토큰 <토큰>\n" +
            "지우려면: " + PREFIX + "깃토큰 삭제";
    }
    if (v === "삭제") {
        GH_TOKEN = "";
        if (TOKEN_FILE) fileWrite(TOKEN_FILE, "");
        return "🗑️ 깃헙 토큰을 지웠어요.";
    }
    if (v.indexOf("gh") !== 0 && v.indexOf("github_pat_") !== 0) {
        return "⛔ 토큰은 보통 ghp_ 또는 github_pat_ 로 시작해요. 값을 다시 확인해주세요.";
    }

    GH_TOKEN = v;
    var saved = false;
    if (TOKEN_FILE) saved = fileWrite(TOKEN_FILE, v);

    var head = "🔐 깃헙 토큰을 등록했어요 (" + v.length + "자)" +
        (saved ? "" : "\n⚠️ 파일 저장 실패 — 앱을 껐다 켜면 사라집니다") +
        (isGroupChat ? "\n⚠️ 여기는 단톡방이에요 — 방금 보낸 메시지를 꼭 삭제하세요!" : "");

    var wasFirst = (cafeLastId === 0);
    cafeCheck();
    if (cafeErr) return head + "\n\n❌ 목록 읽기 실패: " + cafeErr;
    return head + "\n\n✅ 카페 목록을 읽었어요!" +
        (wasFirst ? "\n지금부터 올라오는 새 글만 알려드릴게요 (기준 글번호 " + cafeLastId + ")"
                  : "\n마지막 글번호: " + cafeLastId);
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

/** 네이버 로그인 쿠키 — ① 로더 주입 ② 폰의 naver_cookie.txt */
function naverCookie() {
    if (NAVER_COOKIE) return NAVER_COOKIE;
    if (COOKIE_FILE) {
        var c = fileRead(COOKIE_FILE);
        if (c) return String(c).replace(/[\r\n]+/g, " ").trim();
    }
    return "";
}

function isAdmin(sender) {
    var all = ADMINS.concat(EXTRA_ADMINS), i;
    for (i = 0; i < all.length; i++) {
        if (String(sender).indexOf(all[i]) !== -1) return true;
    }
    return false;
}

/**
 * /쿠키 NID_AUT=...; NID_SES=...  → 폰에 저장하고 곧바로 카페를 확인해 결과를 알려준다.
 * 관리자가 아니면 조용히 무시한다 (남이 떠보는 것 방지).
 * 쿠키 값 자체는 응답에 절대 되돌려 쓰지 않는다.
 */
/**
 * /쿠키 → 두 번에 나눠 받는다 (NID_AUT 먼저, 그 다음 NID_SES).
 * 값에 "/" 가 들어갈 수 있어서, 진행 중에는 /취소 외에는 전부 값으로 취급한다.
 */
var pending = null;                    // { room, sender, step, aut, at }
var PENDING_MS = 5 * 60 * 1000;        // 5분 지나면 자동 종료

function pendingAlive(room, sender) {
    if (!pending) return false;
    if (new Date().getTime() - pending.at > PENDING_MS) { pending = null; return false; }
    return pending.room === room && pending.sender === sender;
}

function startCookieFlow(room, sender) {
    pending = { room: room, sender: sender, step: 1, aut: "", at: new Date().getTime() };
    return "🔑 네이버 쿠키 등록 (1/2)\n─────────────\n" +
        "NID_AUT 값을 입력해주세요.\n\n" +
        "· 값만 붙여넣으면 됩니다 (NID_AUT= 를 같이 붙여넣어도 괜찮아요)\n" +
        "· 그만하려면 " + PREFIX + "취소";
}

/** "NID_AUT=값" / "값" / "NID_AUT=값; NID_SES=..." 어느 형태로 붙여넣어도 값만 뽑아낸다 */
function cleanVal(name, raw) {
    var s = String(raw).replace(/[\r\n]+/g, " ").replace(/^\s+|\s+$/g, "");
    if (s.indexOf(name) === 0) {
        var eq = s.indexOf("=");
        if (eq !== -1) s = s.substring(eq + 1);
    }
    var sc = s.indexOf(";");
    if (sc !== -1) s = s.substring(0, sc);
    return s.replace(/^\s+|\s+$/g, "");
}

function stepCookieFlow(text, isGroupChat) {
    var t = String(text).replace(/[\r\n]+/g, " ").replace(/^\s+|\s+$/g, "");

    if (pending.step === 1) {
        // 둘 다 한 번에 붙여넣었으면 그대로 끝낸다
        if (t.indexOf("NID_AUT") !== -1 && t.indexOf("NID_SES") !== -1) {
            pending = null;
            return applyCookie(t, isGroupChat);
        }
        var aut = cleanVal("NID_AUT", t);
        if (!aut) return "값이 비어 있어요. NID_AUT 값을 다시 입력해주세요.";
        pending.aut = aut;
        pending.step = 2;
        pending.at = new Date().getTime();
        return "✅ NID_AUT 받았어요 (" + aut.length + "자)\n\n" +
            "🔑 네이버 쿠키 등록 (2/2)\n─────────────\n" +
            "이제 NID_SES 값을 입력해주세요.";
    }

    var ses = cleanVal("NID_SES", t);
    if (!ses) return "값이 비어 있어요. NID_SES 값을 다시 입력해주세요.";
    var cookie = "NID_AUT=" + pending.aut + "; NID_SES=" + ses;
    pending = null;
    return applyCookie(cookie, isGroupChat);
}

function cancelCookieFlow() {
    pending = null;
    return "🚫 쿠키 등록을 취소했어요.";
}

function setCookieCmd(arg, sender, isGroupChat, room) {
    if (!isAdmin(sender)) return null;

    var v = String(arg || "").replace(/[\r\n]+/g, " ").trim();
    if (!v) return startCookieFlow(room, sender);   // 인자 없이 치면 2단계 입력 시작

    if (v.indexOf("NID_AUT") === -1 || v.indexOf("NID_SES") === -1) {
        return "⛔ NID_AUT 와 NID_SES 가 모두 있어야 해요.\n" +
            "형식: " + PREFIX + "쿠키 NID_AUT=값; NID_SES=값\n" +
            "(하나씩 나눠 넣으려면 " + PREFIX + "쿠키 만 치세요)";
    }
    return applyCookie(v, isGroupChat);
}

/** 쿠키를 저장하고 곧바로 카페를 확인해 결과를 돌려준다 */
function applyCookie(v, isGroupChat) {
    NAVER_COOKIE = v;
    var saved = false;
    if (COOKIE_FILE) saved = fileWrite(COOKIE_FILE, v);

    var head = "🔑 쿠키를 등록했어요." +
        (saved ? "" : "\n⚠️ 파일 저장에 실패해 메모리에만 있어요 (앱을 껐다 켜면 사라집니다)") +
        (isGroupChat ? "\n⚠️ 여기는 단톡방이에요 — 방금 보낸 쿠키 메시지를 꼭 삭제하세요!" : "");

    // 바로 확인해서 되는지 알려준다 (첫 확인이면 기준만 잡고 알림은 안 보낸다)
    var wasFirst = (cafeLastId === 0);
    cafeCheck();
    if (cafeErr) return head + "\n\n❌ 카페 확인 실패: " + cafeErr;
    return head + "\n\n✅ 카페 확인 성공!" +
        (wasFirst ? "\n지금부터 올라오는 새 글만 알려드릴게요 (기준 글번호 " + cafeLastId + ")"
                  : "\n마지막 글번호: " + cafeLastId);
}

/** 쿠키의 "모양"만 보여준다 — 이름과 길이만, 값은 절대 노출하지 않는다 (잘림 진단용) */
function cookieShape() {
    var c = naverCookie();
    if (!c) return "없음";
    var parts = String(c).split(";"), out = [];
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i].replace(/^\s+|\s+$/g, "");
        var eq = p.indexOf("=");
        if (eq === -1) continue;
        out.push(p.substring(0, eq) + "(" + (p.length - eq - 1) + "자)");
    }
    return out.length ? out.join(", ") : "형식 이상";
}

/** /카페확인 — 지금 즉시 확인하고 원인 파악용 정보까지 보여준다 (관리자만) */
/**
 * /헤더테스트 — 우리가 넣은 헤더가 실제로 서버까지 가는지 확인한다.
 * ※ 진짜 쿠키는 절대 보내지 않는다. 같은 모양의 가짜 값으로만 시험한다.
 */
function headerTestCmd(sender) {
    if (!isAdmin(sender)) return null;
    try {
        var txt = fetchText("https://httpbin.org/headers", {
            cookie: "TEST_A=1; TEST_B=222222",
            referer: ""
        });
        var seenCookie = txt.indexOf("TEST_A=1") !== -1 && txt.indexOf("TEST_B=222222") !== -1;
        var seenUA = txt.indexOf("Chrome") !== -1;
        return "🧪 헤더 전달 테스트 (가짜 값으로 시험)\n─────────────\n" +
            "Cookie 헤더 도달: " + (seenCookie ? "예 ✅" : "아니오 ❌") + "\n" +
            "User-Agent 도달: " + (seenUA ? "예 ✅" : "아니오 ❌") + "\n" +
            "HTTP: " + LAST_HTTP + "\n\n응답 앞부분:\n" + String(txt).substring(0, 300);
    } catch (e) {
        return "🧪 헤더 전달 테스트 실패: " + e;
    }
}

/** 봇이 실제로 어떤 공인 IP로 나가는지 (노트북 IP와 비교용) */
function myPublicIp() {
    try {
        var ip = fetchText("https://api.ipify.org?format=text");
        return String(ip).replace(/[\r\n]+/g, "").replace(/^\s+|\s+$/g, "") || "(빈 응답)";
    } catch (e) {
        return "(확인 실패: " + e + ")";
    }
}

function cafeDebugCmd(sender) {
    if (!isAdmin(sender)) return null;
    cafeCheck();
    var ip = myPublicIp();
    return cafeText() +
        "\n\n── 진단 ──\nHTTP: " + (LAST_HTTP || "(모름)") +
        "\n깃헙 토큰 길이: " + (ghToken() ? ghToken().length + "자" : "없음") +
        "\n봇 공인 IP: " + ip +
        "\n응답 앞부분:\n" + (cafeRawHead || "(없음)");
}

/**
 * /UA <문자열> — 브라우저와 같은 User-Agent 로 맞춘다.
 * (네이버가 세션을 브라우저 정보와 함께 볼 때를 대비)
 */
function setUACmd(arg, sender) {
    if (!isAdmin(sender)) return null;
    var v = String(arg || "").replace(/[\r\n]+/g, " ").replace(/^\s+|\s+$/g, "");

    if (!v) {
        return "🖥️ 지금 쓰는 User-Agent\n─────────────\n" + currentUA() +
            "\n\n바꾸려면: " + PREFIX + "UA 브라우저값\n" +
            "(노트북 브라우저에서 F12 → Console 에 navigator.userAgent 입력하면 나옵니다)\n" +
            "되돌리려면: " + PREFIX + "UA 초기화";
    }
    if (v === "초기화") {
        UA_OVERRIDE = "";
        if (UA_FILE) fileWrite(UA_FILE, "");
        return "↩️ 기본 User-Agent 로 되돌렸어요.";
    }
    if (v.indexOf("Mozilla") !== 0) {
        return "⛔ User-Agent 는 보통 Mozilla/5.0 으로 시작해요. 값을 다시 확인해주세요.";
    }

    UA_OVERRIDE = v;
    if (UA_FILE) fileWrite(UA_FILE, v);

    var head = "🖥️ User-Agent 를 맞췄어요 (" + v.length + "자)";
    var wasFirst = (cafeLastId === 0);
    cafeCheck();
    if (cafeErr) return head + "\n\n❌ 카페 확인 실패: " + cafeErr;
    return head + "\n\n✅ 카페 확인 성공!" +
        (wasFirst ? "\n지금부터 올라오는 새 글만 알려드릴게요 (기준 글번호 " + cafeLastId + ")"
                  : "\n마지막 글번호: " + cafeLastId);
}

function loadUA() {
    if (!UA_FILE) return;
    try {
        var v = fileRead(UA_FILE);
        if (!v) return;
        v = String(v).replace(/[\r\n]+/g, " ").replace(/^\s+|\s+$/g, "");
        if (v) UA_OVERRIDE = v;
    } catch (e) {}
}

function clearCookieCmd(sender) {
    if (!isAdmin(sender)) return null;
    NAVER_COOKIE = "";
    if (COOKIE_FILE) fileWrite(COOKIE_FILE, "");
    return "🗑️ 등록된 쿠키를 지웠어요.";
}

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

/** 알릴 대상 글인지 — 새 글이고, 지정 게시판이 있으면 그 게시판 */
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
 * 카페를 한 번 확인한다.
 * 처음 실행이면(기록 없음) 알리지 않고 현재 최신 글 번호만 기억한다 — 밀린 글 도배 방지.
 */
function cafeCheck() {
    if (!CAFE.on) return;
    cafeCheckedAt = new Date();
    var token = ghToken();
    if (!token) {
        cafeErr = "깃헙 토큰이 없어요 (" + PREFIX + "깃토큰 으로 등록하세요)";
        return;
    }

    try {
        // 깃헙 Actions 가 만들어 둔 최신 글 목록을 비공개 저장소에서 읽어온다.
        // (네이버를 폰에서 직접 부르면 세션이 거부되므로 깃헙을 거친다)
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

        var j = JSON.parse(txt);
        if (!j || !j.articles) {
            cafeErr = "받은 내용이 올바르지 않아요";
            return;
        }
        cafeUpdatedAt = String(j.updatedAt || "");

        var list = j.articles, fresh = [], i;
        for (i = 0; i < list.length; i++) if (cafeWanted(list[i])) fresh.push(list[i]);

        // 이번에 본 것 중 가장 큰 글 번호 (알림 여부와 무관하게 갱신)
        var maxId = cafeLastId;
        for (i = 0; i < list.length; i++) {
            var n = Number(list[i].id);
            if (n > maxId) maxId = n;
        }

        var first = (cafeLastId === 0);
        cafeLastId = maxId;
        saveState();
        cafeErr = null;
        cafeOkAt = new Date();
        if (first || fresh.length === 0) return;   // 첫 가동이면 기준만 잡고 끝

        fresh.sort(function (x, y) { return Number(x.id) - Number(y.id); });
        cafeBroadcast(cafeMessage(fresh));
        cafeSentTotal += fresh.length;

    } catch (e) {
        cafeErr = String(e);
    }
}

/** 알림 대상 방에만 발송 (ROOMS 밖의 방은 건너뜀) */
function cafeBroadcast(text) {
    for (var i = 0; i < CAFE.rooms.length; i++) {
        var r = CAFE.rooms[i];
        if (!inRooms(r)) continue;
        try { sendToRoom(r, text); } catch (e) {}
    }
}

function cafeText() {
    return "📰 카페 새글 알림 (" + CAFE.name + ")\n─────────────\n" +
        "상태: " + (CAFE.on ? "켜짐 ✅" : "꺼짐 ⏸️") + "\n" +
        "확인 주기: " + CAFE.checkMin + "분 (타이머: " + TIMER_KIND + ")\n" +
        "출처: 깃헙 " + GH_REPO + "\n" +
        "깃헙 토큰: " + (ghToken() ? "등록됨 ✅" : "없음 ❌ (" + PREFIX + "깃토큰 으로 등록)") + "\n" +
        "목록 갱신 시각: " + (cafeUpdatedAt || "(아직 없음)") + "\n" +
        "마지막 글 번호: " + (cafeLastId || "(아직 없음)") + "\n" +
        "마지막 확인: " + (cafeCheckedAt ? cafeCheckedAt.toLocaleString() : "(아직 없음)") + "\n" +
        "마지막 성공: " + (cafeOkAt ? cafeOkAt.toLocaleString() : "(아직 없음)") + "\n" +
        "보낸 글 수: " + cafeSentTotal + "\n" +
        "알림 방: " + CAFE.rooms.join(", ") +
        (cafeErr ? "\n최근 오류: " + cafeErr : "");
}

// ═══════════════ 타이머 ═══════════════
// 앱마다 쓸 수 있는 방식이 달라 순서대로 시도한다.
// /오토업데이트 로 코드를 다시 불러와도 옛 타이머가 남지 않도록 세대를 관리한다.

var TIMER_GEN = String(new Date().getTime());
try { java.lang.System.setProperty("autobot.timer.gen", TIMER_GEN); } catch (e) {}
var TIMER_KIND = "없음 (알림 불가)";

var lastCafeTickAt = 0;

/** 1분마다 할 일. 새 코드가 로드됐으면 false를 돌려 이 (옛) 타이머를 멈춘다. */
function timerBeat() {
    try {
        if (String(java.lang.System.getProperty("autobot.timer.gen")) !== TIMER_GEN) return false;
        var now = new Date().getTime();
        if (now - lastCafeTickAt >= CAFE.checkMin * 60 * 1000) {
            lastCafeTickAt = now;
            cafeCheck();
        }
    } catch (e) {}
    return true;
}

(function startTimer() {
    // ① setInterval — 앱이 제공하면 가장 간단
    try {
        if (typeof setInterval === "function") {
            var h = setInterval(function () {
                if (!timerBeat() && typeof clearInterval === "function") clearInterval(h);
            }, 60000);
            TIMER_KIND = "setInterval";
            return;
        }
    } catch (e) {}

    // ② JavaAdapter + java.util.Timer (Rhino 계열)
    try {
        if (typeof JavaAdapter !== "undefined") {
            var timer = new java.util.Timer("autobot-timer", true);
            timer.schedule(new JavaAdapter(java.util.TimerTask, {
                run: function () { if (!timerBeat()) { try { this.cancel(); } catch (e2) {} } }
            }), 30000, 60000);
            TIMER_KIND = "JavaAdapter";
            return;
        }
    } catch (e) {}

    // ③ 스레드 직접 돌리기
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

function listText(room) {
    var keys = triggersOf(tableFor(room));
    if (keys.length === 0) {
        return "등록된 자동응답이 없어요.\n(관리자에게 등록을 요청하세요)";
    }
    var shown = keys, tail = "";
    if (keys.length > LIST_MAX) {
        shown = keys.slice(0, LIST_MAX);
        tail = "\n… 외 " + (keys.length - LIST_MAX) + "개";
    }
    return "📋 이 방의 자동응답 (" + keys.length + "개)\n─────────────\n" +
        shown.join("\n") + tail;
}

function diagText(room, sender) {
    var active = inRooms(room);
    var n = triggersOf(tableFor(room)).length;
    return "🤖 오토봇 진단 (v" + BOT_VER + ")\n─────────────\n" +
        "방 이름: [" + room + "]\n" +
        "보낸 사람: [" + sender + "]\n" +
        "이 방 활성화됨: " + (active ? "예 ✅" : "아니오 ❌ (코드의 ROOMS 목록에 추가하세요)") + "\n" +
        "데이터 출처: " + DATA_FROM + "\n" +
        "이 방 트리거: " + n + "개\n" +
        "마지막 갱신: " + (lastOkAt ? lastOkAt.toLocaleString() : "(아직 없음)") + "\n" +
        "캐시 위치: " + (CACHE_FILE ? CACHE_FILE : "(저장 불가 — 깃헙만 사용)") +
        (lastLoadErr ? "\n최근 오류: " + lastLoadErr : "");
}

// ═══════════════ 메시지 처리 ═══════════════

var lastErrorReportAt = 0;

function shouldReportError(text) {
    if (String(text).indexOf(PREFIX) !== 0) return false;   // 일반 대화면 조용히
    var now = new Date().getTime();
    if (now - lastErrorReportAt < 60000) return false;
    lastErrorReportAt = now;
    return true;
}

/** 봇 앱이 메시지를 받을 때마다 호출 */
function response(room, msg, sender, isGroupChat, replier) {
    var text = "";
    try {
        text = String(msg).trim();
        if (!text) return;

        // ⓪ 진단 — 등록 여부와 무관하게 모든 방에서 동작
        if (text === PREFIX + "오토") {
            replier.reply(diagText(room, sender));
            return;
        }

        // ⓪-1 쿠키 등록 — 어느 방에서든(1:1 포함) 관리자만. 권한 없으면 조용히 무시
        // ⓪-1 쿠키 등록이 진행 중이면 이 사람의 다음 메시지를 값으로 받는다.
        //      (쿠키 값에 "/" 가 들어갈 수 있어서, 취소·재시작 말고는 전부 값으로 본다)
        if (pendingAlive(room, sender)) {
            if (text === PREFIX + "취소") { replier.reply(cancelCookieFlow()); return; }
            if (text === PREFIX + "쿠키") { replier.reply(startCookieFlow(room, sender)); return; }
            replier.reply(stepCookieFlow(text, isGroupChat));
            return;
        }

        if (text === PREFIX + "쿠키삭제") {
            var cr = clearCookieCmd(sender);
            if (cr) replier.reply(cr);
            return;
        }
        if (text === PREFIX + "UA" || text === PREFIX + "ua" ||
            text.indexOf(PREFIX + "UA ") === 0 || text.indexOf(PREFIX + "ua ") === 0) {
            var ur = setUACmd(text.substring((PREFIX + "UA").length), sender);
            if (ur) replier.reply(ur);
            return;
        }
        if (text === PREFIX + "깃토큰" || text.indexOf(PREFIX + "깃토큰 ") === 0) {
            var tr = setTokenCmd(text.substring((PREFIX + "깃토큰").length), sender, isGroupChat);
            if (tr) replier.reply(tr);
            return;
        }
        if (text === PREFIX + "헤더테스트") {
            var hr = headerTestCmd(sender);
            if (hr) replier.reply(hr);
            return;
        }
        if (text === PREFIX + "카페확인") {
            var dr = cafeDebugCmd(sender);
            if (dr) replier.reply(dr);
            return;
        }
        if (text === PREFIX + "쿠키" || text.indexOf(PREFIX + "쿠키 ") === 0) {
            var sr = setCookieCmd(text.substring((PREFIX + "쿠키").length), sender, isGroupChat, room);
            if (sr) replier.reply(sr);
            return;
        }

        // ① 목록에 없는 방은 완전히 무시
        if (!inRooms(room)) return;

        // ② 데이터 준비 (없으면 바로, 있으면 주기마다 백그라운드로 갱신)
        if (DATA === null) loadData();
        else refreshIfStale();

        // ③ /리스트 · /카페
        if (text === PREFIX + "리스트") {
            replier.reply(listText(room));
            return;
        }
        if (text === PREFIX + "카페") {
            replier.reply(cafeText());
            return;
        }

        // ④ 등록된 트리거 — 메시지 전체가 정확히 일치할 때만
        var table = tableFor(room);
        if (table.hasOwnProperty(text)) replier.reply(String(table[text]));

    } catch (e) {
        lastLoadErr = String(e);
        // 일반 대화 중에는 조용히 넘어간다 (명령어일 때만, 1분에 한 번까지 알림)
        try {
            if (shouldReportError(text)) replier.reply("⚠️ 오토봇 오류: " + e);
        } catch (e2) {}
    }
}

// 본체가 로드될 때 데이터 미리 받아두기 (실패해도 첫 메시지 때 다시 시도)
try { loadData(); } catch (e) {}
// 마지막으로 알린 카페 글 번호 복원 (앱을 껐다 켜도 같은 글을 다시 알리지 않게)
try { loadState(); } catch (e) {}
// 지정해둔 User-Agent 복원
try { loadUA(); } catch (e) {}
// 저장해둔 깃헙 토큰 복원
try { loadToken(); } catch (e) {}

// ═══════════════ 앱 API 연결 (직접 붙여넣기용) ═══════════════
//
// 이 파일을 봇 앱에 "직접" 붙여넣었을 때 메신저봇R 신버전(API2)에서도 동작하도록 등록한다.
// ※ 로더를 통해 불러온 경우엔 로더가 이미 등록했으므로 건너뛴다.
(function registerApi2Direct() {
    if (typeof __ROOMS__ !== "undefined") return;   // 로더 경유 → 중복 등록 방지
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
