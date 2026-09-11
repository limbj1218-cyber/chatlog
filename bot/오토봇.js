/**
 * ═══════════════════════════════════════════════════════════
 *  오토봇 — 등록된 문구에 자동으로 응답하는 봇 (읽기 전용)
 *
 *  ◆ 명령어
 *    /리스트   → 이 방에서 반응하는 트리거 목록 (누구나)
 *    /오토     → 진단 (방 인식·데이터 상태·버전) — 모든 방에서 동작
 *    /삭제내역 /삭제내역1 /삭제내역2 → 보관된 대화 되짚어보기 (지정한 방에서만, 누구나)
 *    ※ 등록/삭제 명령은 없다. 내용은 깃헙의 bot/오토봇데이터.json 을 고쳐서 관리한다.
 *
 *  ◆ 데이터
 *    깃헙에서 오토봇데이터.json 을 받아 쓰고, 받은 내용을 폰에 캐시한다.
 *    네트워크가 죽어도 마지막으로 받은 내용으로 계속 동작한다.
 *    갱신: 앱 시작 시 / 30분마다 / 방에서 /오토업데이트 (즉시)
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
var BOT_VER = "0911-1";

// ─────────────── 설정 (여기만 고치면 됨) ───────────────
var ROOMS = [
    "오토2프프",
    "오토2"
];

// 로더(MY_ROOMS)가 위 ROOMS 를 덮어쓰므로, 로더를 다시 붙여넣지 않고 방을 늘리려면 여기에 적는다.
var EXTRA_ROOMS = [
    "[오차율 계산봇]",
    "공백기 근무표"
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

function saveLogs() {
    if (!LOG_FILE) return;
    try {
        fileWrite(LOG_FILE, JSON.stringify(loadLogs()));
        logDirty = false;
        logSinceFlush = 0;
    } catch (e) {}
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
    if (logSinceFlush >= LOG_FLUSH_EVERY) runAsync(saveLogs);
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
    var lines = [];
    for (var i = 0; i < shown.length; i++) {
        var k = shown[i];
        lines.push(k.charAt(0) === CONTAIN_MARK
            ? (k.substring(1) + "  (말 속에 있어도)")
            : k);
    }
    return "📋 이 방의 자동응답 (" + keys.length + "개)\n─────────────\n" +
        lines.join("\n") + tail;
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
        "기록 보관: " + (LOG_ROOMS.indexOf(room) !== -1
            ? ((loadLogs()[room] || []).length + "/" + LOG_MAX + "개") : "안 함") + "\n" +
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

        // ⑥ 등록된 트리거 — 메시지 전체가 정확히 일치할 때
        var table = tableFor(room);
        if (table.hasOwnProperty(text)) {
            replier.reply(String(table[text]));
            return;
        }

        // ⑦ 포함 트리거 — 그 낱말이 대화에 섞여 있기만 해도 응답 (방마다 쿨다운)
        var ckey = findContain(table, text);
        if (ckey) {
            var body = String(table[ckey]);
            if (containReady(room, body)) replier.reply(body);
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
