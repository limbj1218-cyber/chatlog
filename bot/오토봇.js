/**
 * ═══════════════════════════════════════════════════════════
 *  오토봇 — 등록된 문구에 자동으로 응답하는 봇 (읽기 전용)
 *
 *  ◆ 명령어 (아래 /등록·/프반·/삭제 는 REG_ROOM 에서만, 등록분은 갈래마다 정해진 방에서 반응)
 *    /리스트   → 이 방에서 반응하는 트리거 목록 (누구나)
 *               REG_ROOM 에서는 오토2·오토2프프 를 갈라서 보여준다
 *    /오토     → 진단 (방 인식·데이터 상태·버전) — 모든 방에서 동작
 *    /삭제내역 /삭제내역1 /삭제내역2 → 보관된 대화 되짚어보기 (지정한 방에서만, 누구나)
 *    /등록_명령어_할말 → 오토2·오토2프프·공백기 근무표에서 반응 (공백기 근무표에서만, 누구나)
 *    /프반_명령어_할말 → 오토2프프에서만 반응 (공백기 근무표에서만, 누구나)
 *    /삭제_명령어      → 위 둘 중 어느 쪽으로 넣었든 지운다
 *
 *  ◆ 데이터 — 두 갈래다
 *    ① 고정: 깃헙에서 오토봇데이터.json 을 받아 쓰고, 받은 내용을 폰에 캐시한다.
 *       네트워크가 죽어도 마지막으로 받은 내용으로 계속 동작한다.
 *       갱신: 앱 시작 시 / 30분마다 / 방에서 /오토업데이트 (즉시)
 *    ② 등록: 방에서 /등록 으로 넣은 것. 폰 파일(등록응답.json)에만 있고 깃헙에는 올라가지 않는다.
 *       메시지 흐름에서 네트워크를 쓰면 봇이 멈추기 때문이다. 앱을 지우면 같이 사라진다.
 *       고정 트리거와 이름이 겹치면 등록을 거절한다 (고정을 덮어쓸 수 없다).
 *
 *  ◆ 카페 새글 알림은 이 봇에 없다 — 별도 스크립트 bot/카페봇.js 가 담당한다.
 *    (네트워크·타이머가 얽힌 쪽을 같이 두면 문제가 생겼을 때 자동응답까지 느려진다)
 *
 *  ◆ 호환성
 *    - 메신저봇R 신버전(API2) / 구버전(API1) / 다크토네이도 챗봇 모두 동작
 *    - FileStream 이 없는 앱에서는 java.io 로 자동 대체
 *    - 캐시 폴더는 쓰기 가능한 곳을 자동 선택 (권한 없어도 앱 전용 폴더 사용)
 *
 *  ※ 안드로이드 Rhino 엔진 호환을 위해 ES5 문법만 사용한다.
 *  ※ 메시지 처리 흐름에서는 네트워크를 기다리지 않는다 — 봇 전체가 멈춘다.
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "오토봇";
var BOT_VER = "1009-1";

// ─────────────── 설정 (여기만 고치면 됨) ───────────────
var ROOMS = [
    "오토2프프",
    "오토2"
];

// 로더(MY_ROOMS)가 위 ROOMS 를 덮어쓰므로, 로더를 다시 붙여넣지 않고 방을 늘리려면 여기에 적는다.
var EXTRA_ROOMS = [
    "[오차율 계산봇]",
    "공백기 근무표",
    "멱살반2"
];

var PREFIX = "/";                  // 명령어 접두사
var COMMON_KEY = "_공통";          // 모든 방에 공통 적용되는 데이터 키
var REFRESH_MIN = 30;              // 데이터 자동 갱신 주기 (분)
var LIST_MAX = 30;                 // /리스트 에 한 번에 보여줄 최대 개수

// 트리거 이름이 "*" 로 시작하면 메시지 전체가 아니라 "그 낱말이 들어 있기만 해도" 응답한다.
// 보통 대화에 섞여 나오는 말이라 같은 방에서 연달아 터지지 않게 쿨다운을 둔다.
var CONTAIN_MARK = "*";
var CONTAIN_COOL_MIN = 20;         // 같은 포함 트리거는 방마다 이 분 안에 한 번만

var DATA_URL = "https://raw.githubusercontent.com/limbj1218-cyber/chatlog/main/bot/" +
    encodeURIComponent("오토봇데이터.json");

// ── 대화 기록 (삭제된 메시지 찾아보기용) ──
// 카톡은 삭제를 봇에게 알려주지 않으므로, 오는 메시지를 모아뒀다가 나중에 되짚어 보는 방식이다.
var LOG_ROOMS = ["오토2", "오토2프프", "공백기 근무표"];   // 기록할 방
var VIEW_ROOM = "공백기 근무표";                            // 조회 명령을 쓸 수 있는 방
var LOG_MAX = 3000;                                         // 방마다 보관할 최대 개수
var LOG_SHOW = 15;                                          // 한 번에 보여줄 개수
var LOG_NEAR_MIN = 5;                                       // 시각으로 찾을 때 앞뒤 몇 분까지
var LOG_FLUSH_EVERY = 100;                                  // 몇 개마다 파일로 저장할지

// 조회 명령 → 어느 방의 기록을 보여줄지
var LOG_CMDS = [
    ["삭제내역", VIEW_ROOM],
    ["삭제내역1", "오토2"],
    ["삭제내역2", "오토2프프"]
];

// ── 방에서 직접 등록하는 자동응답 ──
// 한 방(REG_ROOM)에서 넣고 빼면, 갈래마다 정해진 방에서 반응한다. 넣고 빼는 건 누구나 할 수 있다.
var REG_ROOM = "공백기 근무표";                   // /등록 /프반 /삭제 를 쓸 수 있는 방
var REG_SEP = "_";                                // /등록_명령어_할말
var REG_MAX = 200;                                // 갈래마다 등록 최대 개수

// 등록 갈래 — 명령어 / 폰에 저장할 파일 / 실제로 반응하는 방
// 갈래를 늘리려면 여기에 한 줄 더 적으면 된다.
var REG_KINDS = [
    { cmd: "등록", file: "등록응답.json", rooms: ["오토2", "오토2프프", "공백기 근무표"] },
    { cmd: "프반", file: "프반응답.json", rooms: ["오토2프프"] }
];

// /리스트 를 방별로 갈라 보여줄 방 (REG_ROOM 에서 쓴다)
var LIST_SPLIT_ROOMS = ["오토2", "오토2프프"];

// 사람에게 보여줄 때만 쓰는 이름. ※ 방을 가려내는 기준은 끝까지 실제 방 이름이다 —
//   ROOMS·REG_KINDS·LOG_ROOMS 같은 목록에는 절대 이 이름을 쓰지 말 것.
var ROOM_LABELS = {
    "오토2": "오토2사담방",
    "오토2프프": "오토2프반"
};

function roomLabel(room) {
    return ROOM_LABELS.hasOwnProperty(room) ? ROOM_LABELS[room] : room;
}

/** 방 목록을 보여줄 때 (예: "오토2사담방·오토2프반") */
function roomLabels(rooms) {
    var out = [];
    for (var i = 0; i < rooms.length; i++) out.push(roomLabel(rooms[i]));
    return out.join("·");
}
// ────────────────────────────────────────────────────────

var REFRESH_MS = REFRESH_MIN * 60 * 1000;
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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
var LOG_FILE = BASE_DIR ? (BASE_DIR + "/대화기록.json") : null;
// 갈래마다 저장 경로를 붙여 둔다 (BASE_DIR 이 없으면 저장은 못 하고 메모리로만 동작)
for (var ki = 0; ki < REG_KINDS.length; ki++) {
    REG_KINDS[ki].path = BASE_DIR ? (BASE_DIR + "/" + REG_KINDS[ki].file) : null;
}

/** 깃헙에서 텍스트 가져오기 — jsoup 우선, 없으면 순수 자바 HTTP */
function fetchText(url) {
    try {
        if (typeof org !== "undefined" && org.jsoup) {
            return String(org.jsoup.Jsoup.connect(url)
                .ignoreContentType(true)
                .ignoreHttpErrors(true)
                .userAgent(UA)
                .timeout(15000)
                .maxBodySize(0)
                .execute().body());
        }
    } catch (e) {}

    var conn = new java.net.URL(url).openConnection();
    conn.setRequestProperty("User-Agent", UA);
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

/** 백그라운드 실행 — 네트워크·파일 쓰기 때문에 메시지 처리가 멈추지 않게 한다 */
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

// ═══════════════ 자동응답 데이터 ═══════════════

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

/** 깃헙에서 받아온다. 실패하면 폰 캐시로 대체 */
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
    if (DATA === null) {
        try {
            var c = CACHE_FILE ? fileRead(CACHE_FILE) : null;
            if (c) { DATA = parseData(c); DATA_FROM = "캐시"; return true; }
        } catch (e2) {}
    }
    return false;
}

/** 폰 캐시만 즉시 읽어 쓴다 (네트워크를 기다리지 않는다) */
function loadCacheOnly() {
    if (DATA !== null || !CACHE_FILE) return;
    try {
        var c = fileRead(CACHE_FILE);
        if (c) { DATA = parseData(c); DATA_FROM = "캐시"; }
    } catch (e) {}
}

/** 오래됐으면 백그라운드로 다시 받아온다 (메시지 처리는 기다리지 않는다) */
function refreshIfStale() {
    var now = new Date().getTime();
    if (now - lastLoadAt < REFRESH_MS) return;
    lastLoadAt = now;               // 실패해도 다음 주기까지는 재시도하지 않는다
    runAsync(function () { loadData(); });
}

// ═══════════════ 방에서 등록한 자동응답 ═══════════════
// 깃헙 데이터와 달리 폰 파일에만 있다. 파일이 작아서 저장이 금방 끝나므로
// (대화기록과 달리) 그 자리에서 저장하고 성공/실패를 바로 알려준다.

var lastRegErr = null;

/** 갈래 하나의 { 트리거: 할말 } — 처음 찾을 때 파일에서 읽어 들인다 */
function regsOf(kind) {
    if (kind.cache) return kind.cache;
    kind.cache = {};
    if (!kind.path) return kind.cache;
    try {
        var t = fileRead(kind.path);
        if (t) {
            var o = JSON.parse(String(t));
            if (o && typeof o === "object") kind.cache = o;
        }
    } catch (e) { lastRegErr = String(e); }
    return kind.cache;
}

function saveRegs(kind) {
    if (!kind.path) { lastRegErr = "폰에 저장할 곳을 못 찾았어요"; return false; }
    try {
        if (fileWrite(kind.path, JSON.stringify(regsOf(kind)))) { lastRegErr = null; return true; }
        lastRegErr = "파일 쓰기 실패";
    } catch (e) { lastRegErr = String(e); }
    return false;
}

function kindByCmd(cmd) {
    for (var i = 0; i < REG_KINDS.length; i++) {
        if (REG_KINDS[i].cmd === cmd) return REG_KINDS[i];
    }
    return null;
}

/** 이 트리거가 이미 등록돼 있는 갈래. 없으면 null */
function kindHaving(trigger) {
    for (var i = 0; i < REG_KINDS.length; i++) {
        if (regsOf(REG_KINDS[i]).hasOwnProperty(trigger)) return REG_KINDS[i];
    }
    return null;
}

function countOf(kind) {
    var n = 0, k, regs = regsOf(kind);
    for (k in regs) if (regs.hasOwnProperty(k)) n++;
    return n;
}

/** 모든 갈래를 합친 등록 개수 */
function regCount() {
    var n = 0;
    for (var i = 0; i < REG_KINDS.length; i++) n += countOf(REG_KINDS[i]);
    return n;
}

/** 이 방에서 실제로 동작하는 등록 개수 */
function regCountFor(room) {
    var n = 0;
    for (var i = 0; i < REG_KINDS.length; i++) {
        if (REG_KINDS[i].rooms.indexOf(room) !== -1) n += countOf(REG_KINDS[i]);
    }
    return n;
}

/** 이 방에서 등록분이 하나라도 동작하는지 */
function regActive(room) {
    for (var i = 0; i < REG_KINDS.length; i++) {
        if (REG_KINDS[i].rooms.indexOf(room) !== -1) return true;
    }
    return false;
}

/**
 * 이 방에 적용되는 트리거표 — 공통 위에 방별을 덮어쓴다.
 * withRegs 가 false 가 아니면 등록분도 얹는다 (고정 트리거는 덮어쓰지 않는다).
 */
function tableFor(room, withRegs) {
    var out = {}, k;
    if (DATA) {
        var common = DATA[COMMON_KEY];
        if (common) for (k in common) if (common.hasOwnProperty(k)) out[k] = common[k];
        var own = DATA[room];
        if (own) for (k in own) if (own.hasOwnProperty(k)) out[k] = own[k];
    }
    if (withRegs !== false) {
        for (var i = 0; i < REG_KINDS.length; i++) {
            if (REG_KINDS[i].rooms.indexOf(room) === -1) continue;
            var regs = regsOf(REG_KINDS[i]);
            // 고정(깃헙) 트리거는 덮어쓰지 않는다
            for (k in regs) if (regs.hasOwnProperty(k) && !out.hasOwnProperty(k)) out[k] = regs[k];
        }
    }
    return out;
}

/** 깃헙에서 관리하는 고정 트리거인지 (등록분은 빼고 본다) */
function isFixed(trigger) {
    var seen = {};
    for (var i = 0; i < REG_KINDS.length; i++) {
        for (var j = 0; j < REG_KINDS[i].rooms.length; j++) {
            var room = REG_KINDS[i].rooms[j];
            if (seen[room]) continue;
            seen[room] = true;
            var t = tableFor(room, false);
            if (t.hasOwnProperty(trigger)) return true;
            if (t.hasOwnProperty(CONTAIN_MARK + trigger)) return true;
        }
    }
    return false;
}

function isArray(v) {
    return Object.prototype.toString.call(v) === "[object Array]";
}

/**
 * 응답을 내보낸다.
 * 데이터의 값이 **목록**이면 메시지를 나눠서 여러 개로 보낸다.
 *   "트리거": "한 줄"              → 메시지 1개
 *   "트리거": ["첫 개", "둘째 개"]  → 메시지 2개
 */
function sendReply(replier, value) {
    if (isArray(value)) {
        for (var i = 0; i < value.length; i++) {
            var one = String(value[i]);
            if (!one) continue;
            try { replier.reply(one); } catch (e) {}
        }
        return;
    }
    replier.reply(String(value));
}

/** 쿨다운을 묶는 기준 — 목록이든 한 줄이든 같은 내용이면 같은 값이 나오게 */
function replyKey(value) {
    return isArray(value) ? value.join(" ") : String(value);
}

function triggersOf(table) {
    var keys = [], k;
    for (k in table) if (table.hasOwnProperty(k)) keys.push(k);
    keys.sort();
    return keys;
}

// ── 포함 트리거 쿨다운 ──
// 앱이 살아 있는 동안만 기억한다. 재시작하면 초기화되는데, 그래도 상관없다.
var containAt = {};

/**
 * 포함 트리거가 지금 응답해도 되는지.
 * 묶는 기준(what)은 트리거 이름이 아니라 "내보낼 내용" 이다 —
 * 질문·궁금 처럼 여러 낱말이 같은 안내를 가리키면 쿨다운을 함께 쓴다.
 */
function containReady(room, what) {
    var id = room + "|" + what;
    var now = new Date().getTime();
    var prev = containAt[id] || 0;
    if (now - prev < CONTAIN_COOL_MIN * 60 * 1000) return false;
    containAt[id] = now;
    return true;
}

/** 메시지 안에 들어 있기만 해도 되는 트리거를 찾는다. 없으면 null */
function findContain(table, text) {
    var keys = triggersOf(table);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.charAt(0) !== CONTAIN_MARK) continue;
        var word = key.substring(1);
        if (word && text.indexOf(word) !== -1) return key;
    }
    return null;
}

// ═══════════════ 대화 기록 ═══════════════

var LOGS = null;        // { 방이름: [ {t,s,m}, ... ] }
var logSinceFlush = 0;
var logDirty = false;

function logTime() {
    var d = new Date(), h = d.getHours(), ap = h < 12 ? "오전" : "오후";
    var hh = h % 12; if (hh === 0) hh = 12;
    var mm = d.getMinutes(); if (mm < 10) mm = "0" + mm;
    return ap + " " + hh + ":" + mm;
}

function loadLogs() {
    if (LOGS) return LOGS;
    LOGS = {};
    if (LOG_FILE) {
        try {
            var s = fileRead(LOG_FILE);
            if (s) {
                var o = JSON.parse(s);
                if (o && typeof o === "object") LOGS = o;
            }
        } catch (e) {}
    }
    return LOGS;
}

var logSaving = false;     // 저장 스레드가 이미 도는 중인지
var lastLogErr = null;     // 마지막 저장 실패 (진단용)

function saveLogs() {
    if (!LOG_FILE) return;
    if (logSaving) return;          // 같은 파일에 둘이 동시에 쓰면 파일이 깨진다
    logSaving = true;
    try {
        fileWrite(LOG_FILE, JSON.stringify(loadLogs()));
        logDirty = false;
        lastLogErr = null;
    } catch (e) {
        lastLogErr = String(e);
    }
    logSaving = false;
}

function logMessage(room, sender, msg) {
    if (LOG_ROOMS.indexOf(room) === -1) return;
    var all = loadLogs();
    if (!all[room]) all[room] = [];
    all[room].push({ t: logTime(), s: String(sender), m: String(msg) });
    while (all[room].length > LOG_MAX) all[room].shift();

    logDirty = true;
    logSinceFlush++;
    // 저장은 파일 전체를 다시 쓰는 방식이라 자주 하면 손해다.
    // 개수로 끊고, 쓰기는 백그라운드에서 한다.
    //
    // ※ 세는 값을 "여기서 바로" 0 으로 되돌린다.
    //   저장이 끝난 뒤에 되돌리면, 저장이 도는 동안 들어온 메시지마다 스레드가
    //   새로 만들어져 수십 개가 쌓인다. 각 스레드가 기록 전체를 문자열로 만들어
    //   메모리를 잡아먹고, 같은 파일에 동시에 써서 파일이 깨진다.
    //   스레드를 더 못 만들면 runAsync 가 그 자리에서 실행해 봇이 멈춘다.
    if (logSinceFlush >= LOG_FLUSH_EVERY && !logSaving) {
        logSinceFlush = 0;
        runAsync(saveLogs);
    }
}

/** "오후 3:24" → 자정부터의 분. 못 읽으면 -1 */
function timeToMin(s) {
    var t = String(s).replace(/^\s+|\s+$/g, "");
    var pm = t.indexOf("오후") !== -1;
    var am = t.indexOf("오전") !== -1;
    var m = t.match(/(\d{1,2})\s*[:시]\s*(\d{1,2})/);
    if (!m) {
        // "1530" 처럼 붙여 쓴 경우
        var m2 = t.match(/(\d{1,2})(\d{2})\s*$/);
        if (!m2) return -1;
        m = m2;
    }
    var h = Number(m[1]), mi = Number(m[2]);
    if (h > 23 || mi > 59) return -1;
    if (pm && h < 12) h += 12;
    if (am && h === 12) h = 0;
    return h * 60 + mi;
}

/**
 * targetRoom 의 보관 기록을 보여준다.
 * around 가 있으면 그 시각 앞뒤 LOG_NEAR_MIN 분만 추린다 (삭제된 메시지 찾기용).
 */
function logText(targetRoom, around) {
    var all = loadLogs();
    var list = all[targetRoom] || [];
    if (list.length === 0) {
        return "📭 「" + targetRoom + "」 기록이 아직 없어요.\n" +
            "(봇이 켜진 뒤에 오는 메시지부터 쌓입니다)";
    }

    var head, picked = [], i, e;

    if (around) {
        var want = timeToMin(around);
        if (want < 0) {
            return "시각을 못 읽었어요: 「" + around + "」\n" +
                "예) " + PREFIX + "삭제내역1 3:24  /  " + PREFIX + "삭제내역1 오후 3:24";
        }
        // 오전/오후를 안 쓰고 12시 이하로 적었으면 양쪽 다 본다 (3:24 → 오전·오후 둘 다)
        var wants = [want];
        if (String(around).indexOf("오전") === -1 && String(around).indexOf("오후") === -1 &&
            want < 12 * 60) {
            wants.push(want + 12 * 60);
        }
        for (i = 0; i < list.length; i++) {
            var mm = timeToMin(list[i].t);
            if (mm < 0) continue;
            for (var wi = 0; wi < wants.length; wi++) {
                if (Math.abs(mm - wants[wi]) <= LOG_NEAR_MIN) { picked.push(list[i]); break; }
            }
        }
        if (picked.length === 0) {
            return "📭 그 시각 근처(±" + LOG_NEAR_MIN + "분)에 기록된 메시지가 없어요.";
        }
        if (picked.length > LOG_SHOW * 2) picked = picked.slice(picked.length - LOG_SHOW * 2);
        head = "🗂️ 「" + targetRoom + "」 " + around + " 앞뒤 " + LOG_NEAR_MIN + "분 (" +
            picked.length + "개)";
    } else {
        var start = list.length > LOG_SHOW ? list.length - LOG_SHOW : 0;
        for (i = start; i < list.length; i++) picked.push(list[i]);
        head = "🗂️ 「" + targetRoom + "」 최근 " + picked.length + "개" +
            " (보관 " + list.length + "/" + LOG_MAX + ")";
    }

    var out = head + "\n─────────────";
    for (i = 0; i < picked.length; i++) {
        e = picked[i];
        var m = String(e.m).replace(/\n/g, " ");
        if (m.length > 60) m = m.substring(0, 60) + "…";
        out += "\n" + e.t + " " + e.s + ": " + m;
    }
    out += "\n─────────────\n" +
        "※ 어느 게 삭제됐는지는 표시되지 않습니다 (카톡이 봇에게 알려주지 않음).\n" +
        "  방에서 「삭제된 메시지입니다」가 보이는 시각으로 대조하세요.";
    return out;
}

// ═══════════════ 명령어 ═══════════════

/** 트리거 이름 목록을 보기 좋은 줄로 (개수 제한 포함) */
function listLines(keys) {
    var shown = keys, tail = "";
    if (keys.length > LIST_MAX) {
        shown = keys.slice(0, LIST_MAX);
        tail = "\n… 외 " + (keys.length - LIST_MAX) + "개";
    }
    var lines = [];
    for (var i = 0; i < shown.length; i++) {
        var k = shown[i];
        lines.push(k.charAt(0) === CONTAIN_MARK
            ? (k.substring(1) + "  (말 속에 있어도)")
            : k);
    }
    return lines.join("\n") + tail;
}

/**
 * /리스트
 *  - 보통 방: 그 방이 반응하는 것 전부를 한 목록으로 (고정·등록 구분 없이)
 *  - 등록하는 방(REG_ROOM): 어느 방 것인지 갈라서 (LIST_SPLIT_ROOMS)
 */
function listText(room) {
    if (room === REG_ROOM) {
        // 앞 방에 이미 나온 명령어는 뒤 방에서 빼고 보여준다 (겹치는 게 많아 목록이 길어지므로)
        var parts = [], seen = {}, dropped = false;
        for (var i = 0; i < LIST_SPLIT_ROOMS.length; i++) {
            var r = LIST_SPLIT_ROOMS[i];
            var all = triggersOf(tableFor(r));
            var ks = [];
            for (var j = 0; j < all.length; j++) {
                if (seen[all[j]]) { dropped = true; continue; }
                seen[all[j]] = true;
                ks.push(all[j]);
            }
            parts.push("───── " + roomLabel(r) + " (" + (i === 0 ? "" : "+") + ks.length + "개) ─────\n" +
                (ks.length ? listLines(ks) : "(겹치는 것 말고는 없음)"));
        }
        return "📋 명령어 목록\n" + parts.join("\n\n") +
            (dropped ? "\n\n※ 겹치는 명령어는 뒤쪽 방에서 뺐습니다" : "");
    }

    var keys = triggersOf(tableFor(room));
    if (keys.length === 0) {
        return "등록된 자동응답이 없어요.\n(관리자에게 등록을 요청하세요)";
    }
    return "📋 이 방의 자동응답 (" + keys.length + "개)\n─────────────\n" + listLines(keys);
}

/** 갈래의 명령 뒤쪽을 받아 등록한다 */
function regAdd(kind, rest) {
    var usage = "이렇게 써 주세요\n" +
        PREFIX + kind.cmd + REG_SEP + "명령어" + REG_SEP + "할말";
    var cut = String(rest).indexOf(REG_SEP);
    if (cut === -1) return usage;

    var trigger = rest.substring(0, cut).trim();
    var say = rest.substring(cut + REG_SEP.length).trim();   // 뒤쪽은 밑줄·줄바꿈 그대로 둔다

    if (!trigger || !say) return usage;
    if (trigger.charAt(0) === PREFIX) return "명령어는 " + PREFIX + " 로 시작할 수 없어요.";
    if (trigger.charAt(0) === CONTAIN_MARK) return CONTAIN_MARK + " 로 시작하는 이름은 쓸 수 없어요.";
    if (isFixed(trigger)) {
        return "「" + trigger + "」 는 깃헙에서 관리하는 고정 명령어예요.\n" +
            "여기서는 덮어쓸 수 없으니 다른 이름을 써 주세요.";
    }

    // 갈래가 달라도 이름이 겹치면 어느 쪽이 나갈지 헷갈리므로 막는다
    var owner = kindHaving(trigger);
    if (owner) {
        return "「" + trigger + "」 는 이미 " + PREFIX + owner.cmd + " 으로 등록돼 있어요.\n" +
            "바꾸려면 먼저 " + PREFIX + "삭제" + REG_SEP + trigger + " 하고 다시 등록해 주세요.";
    }
    if (countOf(kind) >= REG_MAX) {
        return "등록이 " + REG_MAX + "개까지예요. 안 쓰는 걸 먼저 지워 주세요.";
    }

    var regs = regsOf(kind);
    regs[trigger] = say;
    if (!saveRegs(kind)) {
        delete regs[trigger];
        return "폰에 저장을 못 했어요 — 등록하지 않았습니다.\n" + (lastRegErr || "");
    }
    return "✅ 등록했어요 (" + roomLabels(kind.rooms) + " / " + countOf(kind) + "개)\n" +
        "─────────────\n" + trigger + "\n  ↓\n" + say;
}

/** "/삭제_" 뒤쪽을 받아 지운다 — 등록분만 지울 수 있다 */
function regDel(rest) {
    var trigger = String(rest).trim();
    if (!trigger) return "이렇게 써 주세요\n" + PREFIX + "삭제" + REG_SEP + "명령어";

    // 어느 갈래로 등록했든 같은 /삭제 로 지운다
    var kind = kindHaving(trigger);
    if (!kind) {
        if (isFixed(trigger)) {
            return "「" + trigger + "」 는 깃헙에서 관리하는 고정 명령어라 여기서는 못 지워요.";
        }
        return "「" + trigger + "」 는 등록된 게 없어요.";
    }

    var regs = regsOf(kind);
    var backup = regs[trigger];
    delete regs[trigger];
    if (!saveRegs(kind)) {
        regs[trigger] = backup;
        return "폰에 저장을 못 했어요 — 지우지 않았습니다.\n" + (lastRegErr || "");
    }
    return "🗑️ 지웠어요 (" + PREFIX + kind.cmd + " / " + countOf(kind) + "개 남음)\n" + trigger;
}

/** "10/01 14:32" */
function shortTime(d) {
    function p(n) { return n < 10 ? "0" + n : String(n); }
    return p(d.getMonth() + 1) + "/" + p(d.getDate()) + " " +
        p(d.getHours()) + ":" + p(d.getMinutes());
}

/**
 * 진단 — 평소에는 짧게, 문제가 있을 때만 길어진다.
 * 로더의 /오토업데이트 가 이 내용을 그대로 덧붙여 보여주므로 짧게 유지할 것.
 */
function diagText(room, sender) {
    var reg = regCountFor(room);
    var out = "🤖 오토봇 v" + BOT_VER + "\n" +
        "방 [" + room + "] " + (inRooms(room) ? "동작 중 ✅" : "목록에 없음 ❌") + "\n" +
        "트리거 " + triggersOf(tableFor(room)).length + "개" +
        (reg > 0 ? " (등록 " + reg + "개 포함)" : "") + "\n" +
        "데이터 " + DATA_FROM + (lastOkAt ? " · " + shortTime(lastOkAt) : " · 아직 못 받음");

    if (LOG_ROOMS.indexOf(room) !== -1) {
        out += "\n기록 " + (loadLogs()[room] || []).length + "개";
    }
    // 아래는 문제가 있을 때만 — 평소에는 보이지 않는다
    if (!CACHE_FILE) out += "\n⚠️ 폰에 저장할 곳이 없어 깃헙만 씁니다";
    if (lastLoadErr) out += "\n⚠️ 데이터: " + lastLoadErr;
    if (lastLogErr) out += "\n⚠️ 기록 저장: " + lastLogErr;
    if (lastRegErr) out += "\n⚠️ 등록 저장: " + lastRegErr;
    return out;
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
        if (!inRooms(room)) return;

        // ② 대화 기록 (삭제된 메시지 되짚어보기용)
        try { logMessage(room, sender, msg); } catch (e) {}

        // ③ 기록 조회 — 지정한 방에서만, 누구나
        if (room === VIEW_ROOM) {
            for (var li = 0; li < LOG_CMDS.length; li++) {
                var cmd = PREFIX + LOG_CMDS[li][0];
                if (text === cmd) {
                    replier.reply(logText(LOG_CMDS[li][1], ""));
                    return;
                }
                if (text.indexOf(cmd + " ") === 0) {
                    replier.reply(logText(LOG_CMDS[li][1], text.substring(cmd.length + 1)));
                    return;
                }
            }
        }

        // ④ 데이터 준비 — 여기서 네트워크를 기다리지 않는다.
        //    캐시가 있으면 즉시 쓰고, 갱신은 백그라운드에서 한다.
        if (DATA === null) {
            loadCacheOnly();
            if (DATA === null) { runAsync(function () { loadData(); }); return; }
        } else {
            refreshIfStale();
        }

        // ⑤ /리스트
        if (text === PREFIX + "리스트") {
            replier.reply(listText(room));
            return;
        }

        // ⑤-2 방에서 직접 넣고 빼기 — 정해진 방에서만, 누구나
        //     "/삭제_" 로 받으므로 위에서 처리한 /삭제내역 과 겹치지 않는다
        if (room === REG_ROOM) {
            for (var kk = 0; kk < REG_KINDS.length; kk++) {
                var kind = REG_KINDS[kk];
                var addCmd = PREFIX + kind.cmd + REG_SEP;
                if (text === PREFIX + kind.cmd) { replier.reply(regAdd(kind, "")); return; }
                if (text.indexOf(addCmd) === 0) {
                    replier.reply(regAdd(kind, text.substring(addCmd.length)));
                    return;
                }
            }
            var delCmd = PREFIX + "삭제" + REG_SEP;
            if (text === PREFIX + "삭제") { replier.reply(regDel("")); return; }
            if (text.indexOf(delCmd) === 0) { replier.reply(regDel(text.substring(delCmd.length))); return; }
        }

        // ⑥ 등록된 트리거 — 메시지 전체가 정확히 일치할 때
        var table = tableFor(room);
        if (table.hasOwnProperty(text)) {
            sendReply(replier, table[text]);
            return;
        }

        // ⑦ 포함 트리거 — 그 낱말이 대화에 섞여 있기만 해도 응답 (방마다 쿨다운)
        var ckey = findContain(table, text);
        if (ckey) {
            var value = table[ckey];
            if (containReady(room, replyKey(value))) sendReply(replier, value);
        }

    } catch (e) {
        lastLoadErr = String(e);
        // 일반 대화 중에는 조용히 넘어간다 (명령어일 때만, 1분에 한 번까지 알림)
        try {
            if (shouldReportError(text)) replier.reply("⚠️ 오토봇 오류: " + e);
        } catch (e2) {}
    }
}

// 예전 오토봇(카페 알림이 들어 있던 버전)이 걸어둔 타이머 끄기.
// 그 타이머는 "autobot.timer.gen" 값이 자기 것과 다르면 스스로 멈추는데,
// 지금 오토봇에는 타이머가 없어 그 값을 갱신할 일이 없다. 그래서 여기서 한 번 바꿔준다.
// (이걸 안 하면 본체를 새로 불러와도 옛 타이머가 계속 돌아 카페 알림이 두 번 나간다)
try { java.lang.System.setProperty("autobot.timer.gen", "stopped-" + new Date().getTime()); } catch (e) {}

// 스크립트가 켜질 때 미리 받아둔다 (여기서는 기다려도 된다)
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
