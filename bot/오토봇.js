/**
 * ═══════════════════════════════════════════════════════════
 *  오토봇 — 등록된 문구에 자동으로 응답하는 봇 (읽기 전용)
 *
 *  ◆ 명령어
 *    /리스트   → 이 방에서 반응하는 트리거 목록 (누구나)
 *    /오토     → 진단 (방 인식·데이터 상태·버전) — 모든 방에서 동작
 *    ※ 등록/삭제 명령은 없다. 내용은 깃헙의 bot/오토봇데이터.json 을 고쳐서 관리한다.
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
var BOT_VER = "0828-1";

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
// ────────────────────────────────────────────────────────

var REFRESH_MS = REFRESH_MIN * 60 * 1000;

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

/** 깃헙에서 텍스트 가져오기 — jsoup 우선, 없으면 순수 자바 HTTP */
function fetchText(url) {
    try {
        if (typeof org !== "undefined" && org.jsoup) {
            return String(org.jsoup.Jsoup.connect(url)
                .ignoreContentType(true)
                .userAgent("autobot")
                .timeout(15000)
                .maxBodySize(0)
                .execute().body());
        }
    } catch (e) {}

    var conn = new java.net.URL(url).openConnection();
    conn.setRequestProperty("User-Agent", "autobot");
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

        // ① 목록에 없는 방은 완전히 무시
        if (ROOMS.indexOf(room) === -1) return;

        // ② 데이터 준비 (없으면 바로, 있으면 주기마다 백그라운드로 갱신)
        if (DATA === null) loadData();
        else refreshIfStale();

        // ③ /리스트
        if (text === PREFIX + "리스트") {
            replier.reply(listText(room));
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
