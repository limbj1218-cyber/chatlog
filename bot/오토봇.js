/**
 * ═══════════════════════════════════════════════════════════
 *  오토봇 — 등록된 문구에 자동으로 응답하는 봇 (읽기 전용)
 *
 *  ◆ 명령어
 *    /리스트   → 이 방에서 반응하는 트리거 목록 (누구나)
 *    /오토     → 진단 (방 인식·데이터 상태·버전) — 모든 방에서 동작
 *    /카페     → 카페 새글 알림 상태 진단
 *    /쿠키 ... → 네이버 로그인 쿠키 등록 (관리자만, 아래 참고)
 *    /쿠키삭제 → 등록한 쿠키 지우기 (관리자만)
 *    ※ 등록/삭제 명령은 없다. 내용은 깃헙의 bot/오토봇데이터.json 을 고쳐서 관리한다.
 *
 *  ◆ 네이버 카페 새글 알림
 *    CHECK_MIN 분마다 카페 글 목록 API를 확인해 새 글을 방에 알린다 (제목 + 링크).
 *    비공개 카페는 네이버 로그인 쿠키가 있어야 읽힌다. 쿠키는 깃헙에 올리지 않고
 *    ① 방에서 /쿠키 명령 ② 로더의 MY_COOKIE ③ 폰의 <캐시폴더>/naver_cookie.txt 중 하나로 넣는다.
 *    (①로 넣으면 폰 파일에 저장되므로 앱을 껐다 켜도 유지된다)
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
var BOT_VER = "0904-3";

// ─────────────── 설정 (여기만 고치면 됨) ───────────────
var ROOMS = [
    "오토2프프",
    "오토2"
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

var LAST_HTTP = 0;   // 마지막 HTTP 응답 코드 (진단용)

// 로더에서 주입한다 (폰에만 두는 값 — 깃헙에는 올리지 않는다)
var NAVER_COOKIE = "";

// /쿠키 명령을 쓸 수 있는 사람 (대화명에 이 문자열이 포함되면 관리자). 로더가 덮어쓴다.
var ADMINS = ["후파", "임병진"];

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

/**
 * 텍스트 가져오기 — jsoup 우선, 없으면 순수 자바 HTTP.
 * opt: { cookie: "...", referer: "..." } (없으면 그냥 평범한 GET)
 */
function fetchText(url, opt) {
    opt = opt || {};
    // 쿠키가 필요한 요청은 jsoup 을 건너뛴다.
    // (jsoup 은 자체 쿠키 저장소로 Cookie 헤더를 덮어써 로그인이 풀리는 경우가 있다)
    try {
        if (!opt.cookie && typeof org !== "undefined" && org.jsoup) {
            var c = org.jsoup.Jsoup.connect(url)
                .ignoreContentType(true)
                .ignoreHttpErrors(true)
                .userAgent(UA)
                .timeout(15000)
                .maxBodySize(0);
            if (opt.cookie) c = c.header("Cookie", opt.cookie);
            if (opt.referer) c = c.header("Referer", opt.referer);
            return String(c.execute().body());
        }
    } catch (e) {}

    var conn = new java.net.URL(url).openConnection();
    conn.setRequestProperty("User-Agent", UA);
    if (opt.cookie) conn.setRequestProperty("Cookie", opt.cookie);
    if (opt.referer) conn.setRequestProperty("Referer", opt.referer);
    conn.setConnectTimeout(15000);
    conn.setReadTimeout(20000);
    try { LAST_HTTP = Number(conn.getResponseCode()); } catch (e) {}
    var br = new java.io.BufferedReader(
        new java.io.InputStreamReader(conn.getInputStream(), "UTF-8"));
    var sb = new java.lang.StringBuilder(), line;
    while ((line = br.readLine()) !== null) { sb.append(line); sb.append("\n"); }
    br.close();
    conn.disconnect();
    return String(sb.toString());
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
    for (var i = 0; i < ADMINS.length; i++) {
        if (String(sender).indexOf(ADMINS[i]) !== -1) return true;
    }
    return false;
}

/**
 * /쿠키 NID_AUT=...; NID_SES=...  → 폰에 저장하고 곧바로 카페를 확인해 결과를 알려준다.
 * 관리자가 아니면 조용히 무시한다 (남이 떠보는 것 방지).
 * 쿠키 값 자체는 응답에 절대 되돌려 쓰지 않는다.
 */
function setCookieCmd(arg, sender, isGroupChat) {
    if (!isAdmin(sender)) return null;

    var v = String(arg || "").replace(/[\r\n]+/g, " ").trim();
    if (!v) {
        return "사용법: " + PREFIX + "쿠키 NID_AUT=값; NID_SES=값\n" +
            "(PC 크롬 F12 → Application → Cookies → cafe.naver.com 에서 복사)";
    }
    if (v.indexOf("NID_AUT") === -1 || v.indexOf("NID_SES") === -1) {
        return "⛔ NID_AUT 와 NID_SES 가 모두 있어야 해요.\n" +
            "형식: NID_AUT=값; NID_SES=값";
    }

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
function cafeDebugCmd(sender) {
    if (!isAdmin(sender)) return null;
    cafeCheck();
    return cafeText() +
        "\n\n── 진단 ──\nHTTP: " + (LAST_HTTP || "(모름)") +
        "\n쿠키 구성: " + cookieShape() +
        "\n응답 앞부분:\n" + (cafeRawHead || "(없음)");
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

/** 알릴 대상 글인지 — 새 글이고, 가려진 글이 아니고, 지정 게시판이면 그 게시판 */
function cafeWanted(a) {
    if (!a || !a.articleId) return false;
    if (Number(a.articleId) <= cafeLastId) return false;
    if (a.blindArticle) return false;
    if (CAFE.menuIds.length > 0 && CAFE.menuIds.indexOf(Number(a.menuId)) === -1) return false;
    return true;
}

function cafeMessage(list) {
    var head = "📢 " + CAFE.name + " 카페 새글";
    if (list.length === 1) {
        var a = list[0];
        return head + "\n\n[" + String(a.menuName || "") + "] " + String(a.subject) +
            "\n✍️ " + String(a.writerNickname || "") + "\n" + cafeArticleUrl(a.articleId);
    }
    var shown = list.slice(0, CAFE.maxNotify);
    var out = head + " " + list.length + "건\n";
    for (var i = 0; i < shown.length; i++) {
        var b = shown[i];
        out += "\n[" + String(b.menuName || "") + "] " + String(b.subject) +
            "\n" + cafeArticleUrl(b.articleId) + "\n";
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
    try {
        var url = "https://apis.naver.com/cafe-web/cafe2/ArticleListV2dot1.json" +
            "?search.clubid=" + CAFE.clubId +
            "&search.queryType=lastArticle&search.page=1" +
            "&search.perPage=" + CAFE.perPage + "&ad=false";
        var txt = fetchText(url, {
            cookie: naverCookie(),
            referer: "https://cafe.naver.com/" + CAFE.cafeUrl
        });
        cafeRawHead = String(txt).substring(0, 200);
        var j = JSON.parse(txt);
        var m = j ? j.message : null;
        if (!m || String(m.status) !== "200") {
            var em = (m && m.error && m.error.msg) ? String(m.error.msg) : "알 수 없는 응답";
            cafeErr = em;
            // 로그인 만료는 조용히 멈추면 모르니 6시간에 한 번 방에 알린다
            if (em.indexOf("로그인") !== -1 && new Date().getTime() - cafeWarnAt > 6 * 3600 * 1000) {
                cafeWarnAt = new Date().getTime();
                cafeBroadcast("⚠️ 카페 새글 알림이 멈췄어요 — 네이버 로그인이 만료됐습니다.\n" +
                    "(쿠키를 다시 넣어주세요)");
            }
            return;
        }

        var list = (m.result && m.result.articleList) ? m.result.articleList : [];
        var fresh = [], i;
        for (i = 0; i < list.length; i++) if (cafeWanted(list[i])) fresh.push(list[i]);

        // 이번에 본 것 중 가장 큰 글 번호 (알림 여부와 무관하게 갱신)
        var maxId = cafeLastId;
        for (i = 0; i < list.length; i++) {
            var n = Number(list[i].articleId);
            if (n > maxId) maxId = n;
        }

        var first = (cafeLastId === 0);
        cafeLastId = maxId;
        saveState();
        cafeErr = null;
        cafeOkAt = new Date();
        if (first || fresh.length === 0) return;   // 첫 가동이면 기준만 잡고 끝

        fresh.sort(function (x, y) { return Number(x.articleId) - Number(y.articleId); });
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
        if (ROOMS.indexOf(r) === -1) continue;
        try { sendToRoom(r, text); } catch (e) {}
    }
}

function cafeText() {
    return "📰 카페 새글 알림 (" + CAFE.name + ")\n─────────────\n" +
        "상태: " + (CAFE.on ? "켜짐 ✅" : "꺼짐 ⏸️") + "\n" +
        "확인 주기: " + CAFE.checkMin + "분 (타이머: " + TIMER_KIND + ")\n" +
        "쿠키: " + (naverCookie() ? "있음 ✅" : "없음 ❌ (비공개 카페는 필요)") + "\n" +
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
    var active = ROOMS.indexOf(room) !== -1;
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
        if (text === PREFIX + "쿠키삭제") {
            var cr = clearCookieCmd(sender);
            if (cr) replier.reply(cr);
            return;
        }
        if (text === PREFIX + "카페확인") {
            var dr = cafeDebugCmd(sender);
            if (dr) replier.reply(dr);
            return;
        }
        if (text === PREFIX + "쿠키" || text.indexOf(PREFIX + "쿠키 ") === 0) {
            var sr = setCookieCmd(text.substring((PREFIX + "쿠키").length), sender, isGroupChat);
            if (sr) replier.reply(sr);
            return;
        }

        // ① 목록에 없는 방은 완전히 무시
        if (ROOMS.indexOf(room) === -1) return;

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
