/**
 * ═══════════════════════════════════════════════════════════
 *  강의봇 — 강의(카톡방 3개 묶음)별로 완전히 분리된 자동응답 봇
 *
 *  ◆ 묶음 = 강의 하나 = 조교방 · 사담방 · 프리미엄방
 *    - 조교방에서 명령어를 넣고 빼면, 그 강의의 사담방·프리미엄방에서 반응한다
 *    - 강의가 다르면 서로 완전히 독립이다 (같은 명령어 이름을 써도 충돌 없음)
 *    - 강의 목록은 깃헙 bot/강의목록.json 에 있다 — 코드를 고치지 않고 강의를 늘린다
 *
 *  ◆ 명령어
 *    /리스트            → 이 방에서 반응하는 명령어 목록 (누구나)
 *                         조교방에서는 사담방·프리미엄방을 갈라서 보여준다
 *    /강의              → 진단 (이 방이 어느 강의의 어느 방인지, 데이터 상태) — 모든 방
 *    /강의전체          → 받아온 강의 목록 전체 (관리자만, 모든 방)
 *    /등록_명령어_할말  → 사담방·프리미엄방(+조교방)에서 반응      (조교방에서만, 누구나)
 *    /프반_명령어_할말  → 프리미엄방에서만 반응                   (조교방에서만, 누구나)
 *    /삭제_명령어       → 위 둘 중 어느 쪽으로 넣었든 지운다       (조교방에서만, 누구나)
 *
 *  ◆ 데이터 — 두 갈래다
 *    ① 고정: 깃헙 bot/강의데이터/강의이름.json 을 강의마다 받아 쓰고 폰에 캐시한다.
 *       { "_공통": {명령어: 할말}, "사담방": {...}, "프리미엄방": {...}, "조교방": {...} }
 *       _공통은 그 강의의 세 방 모두에, 나머지는 그 역할의 방에만 적용된다.
 *       값이 문자열이면 메시지 1개, 목록이면 항목마다 나눠서 여러 개를 보낸다.
 *       명령어 이름이 "*" 로 시작하면 그 낱말이 말 속에 섞여 있기만 해도 응답한다 (방마다 20분 쿨다운).
 *       갱신: 앱 시작 시 / 30분마다 / 방에서 /강의업데이트 (즉시)
 *    ② 등록: 조교방에서 /등록·/프반 으로 넣은 것. 폰 파일에 강의별로 저장하고 바로 답한다.
 *       고정 명령어와 이름이 겹치면 등록을 거절한다 (고정을 덮어쓸 수 없다).
 *       **깃헙 저장**: 등록이 바뀌면 백그라운드에서 깃헙 bot/강의등록/강의이름.json 에 폰 파일 전체를 올린다.
 *       강의마다 올리는 담당 스레드는 하나뿐이고(바뀜 깃발 + 담당 하나), 올리는 중에 또 바뀌면 끝난 뒤 한 번 더 올린다.
 *       그래서 같은 강의에서 연달아 등록해도 깃헙에는 항상 폰과 같은 전체 내용이 들어간다.
 *       sha 불일치(409/422)면 최신 sha 를 받아 한 번 재시도하고, 그래도 실패하면 30분 뒤 갱신 때 다시 올린다.
 *       갱신 때는 깃헙 쪽 sha 가 바뀌어 있으면(깃헙에서 직접 고침 / 폰을 새로 깐 경우) 받아와 폰에 적용한다.
 *       폰에 바뀜 깃발이 서 있으면 폰이 우선이다. 로더에 토큰이 없으면 깃헙 저장은 꺼지고 폰에만 남는다.
 *       ※ 메시지 흐름에서는 깃헙을 기다리지 않는다 — 등록 응답은 폰 저장 직후 바로 나간다.
 *
 *  ◆ 오토봇과의 관계 — 없다. 오토봇(오토2·오토2프프·공백기 근무표)은 그대로 두고,
 *    이 봇은 별개의 스크립트로 돈다. 강의목록에 오토봇의 방을 넣으면 둘이 같이 답하므로 넣지 말 것.
 *
 *  ※ 안드로이드 Rhino 엔진 호환을 위해 ES5 문법만 사용한다.
 *  ※ 메시지 처리 흐름에서는 네트워크를 기다리지 않는다 — 봇 전체가 멈춘다.
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "강의봇";
var BOT_VER = "1005-1";

// ─────────────── 설정 ───────────────
// /강의전체 를 볼 수 있는 사람 (대화명에 포함되면 허용). 로더가 __ADMINS__ 로 넘겨주면 그걸 쓴다.
var ADMINS = (typeof __ADMINS__ !== "undefined" && __ADMINS__ && __ADMINS__.length > 0)
    ? __ADMINS__ : ["후파", "임병진"];

// 등록분을 올려 둘 깃헙 저장소. 토큰은 로더(폰)에만 두고 __TOKEN__ 으로 받는다 — 깃헙에 올리지 않는다.
// 저장소를 바꾸려면 로더의 REG_REPO 에 "소유자/저장소" 를 적는다 (비공개 저장소도 토큰만 맞으면 된다).
var GITHUB = {
    TOKEN: (typeof __TOKEN__ !== "undefined" && __TOKEN__) ? String(__TOKEN__) : "",
    OWNER: "limbj1218-cyber",
    REPO: "chatlog",
    BRANCH: "main",
    DIR: "bot/강의등록"              // 강의마다 DIR/강의이름.json
};
if (typeof __REPO__ !== "undefined" && __REPO__) {
    var __repoParts = String(__REPO__).split("/");
    if (__repoParts.length === 2 && __repoParts[0] && __repoParts[1]) {
        GITHUB.OWNER = __repoParts[0];
        GITHUB.REPO = __repoParts[1];
    }
}

var PREFIX = "/";                  // 명령어 접두사
var COMMON_KEY = "_공통";          // 강의의 세 방 모두에 적용되는 데이터 키
var REFRESH_MIN = 30;              // 데이터 자동 갱신 주기 (분)
var LIST_MAX = 30;                 // /리스트 에 한 번에 보여줄 최대 개수

// 명령어 이름이 "*" 로 시작하면 메시지 전체가 아니라 "그 낱말이 들어 있기만 해도" 응답한다.
var CONTAIN_MARK = "*";
var CONTAIN_COOL_MIN = 20;         // 같은 포함 트리거는 방마다 이 분 안에 한 번만

// 강의 하나를 이루는 방의 역할. 강의목록.json 의 키 이름이자, 강의데이터 JSON 의 키 이름이다.
var ROLES = ["조교방", "사담방", "프리미엄방"];
var STAFF = "조교방";                            // 등록·삭제를 할 수 있는 역할
var LIST_SPLIT_ROLES = ["사담방", "프리미엄방"];   // 조교방 /리스트 에서 갈라 보여줄 역할

var BASE_URL = "https://raw.githubusercontent.com/limbj1218-cyber/chatlog/main/bot/";
var LIST_URL = BASE_URL + encodeURIComponent("강의목록.json");
var DATA_URL_PREFIX = BASE_URL + encodeURIComponent("강의데이터") + "/";

// ── 조교방에서 직접 등록하는 자동응답 ──
var REG_SEP = "_";                                // /등록_명령어_할말
var REG_MAX = 200;                                // 강의·갈래마다 등록 최대 개수

// 등록 갈래 — 명령어 / 폰에 저장할 파일 이름 조각 / 실제로 반응하는 역할
// 갈래를 늘리려면 여기에 한 줄 더 적으면 된다.
var REG_KINDS = [
    { cmd: "등록", file: "등록응답", roles: ["사담방", "프리미엄방", "조교방"] },
    { cmd: "프반", file: "프반응답", roles: ["프리미엄방"] }
];
// ────────────────────────────────────────────────────────

var REFRESH_MS = REFRESH_MIN * 60 * 1000;
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function isArray(v) {
    return Object.prototype.toString.call(v) === "[object Array]";
}

function isAdmin(sender) {
    for (var i = 0; i < ADMINS.length; i++) {
        if (String(sender).indexOf(ADMINS[i]) !== -1) return true;
    }
    return false;
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
        if (ext) cands.push(String(ext.getAbsolutePath()) + "/강의봇");
        cands.push(String(app.getFilesDir().getAbsolutePath()) + "/coursebot");
    } catch (e) {}
    cands.push("/sdcard/강의봇");
    for (var i = 0; i < cands.length; i++) {
        try {
            if (fileWrite(cands[i] + "/write_test.txt", "ok") &&
                String(fileRead(cands[i] + "/write_test.txt")).indexOf("ok") === 0) return cands[i];
        } catch (e) {}
    }
    return null;   // 어디에도 못 쓰면 캐시 없이 동작 (깃헙만 사용, 등록은 메모리만)
}

var BASE_DIR = pickBaseDir();
var CACHE_FILE = BASE_DIR ? (BASE_DIR + "/강의봇캐시.json") : null;
var SYNC_FILE = BASE_DIR ? (BASE_DIR + "/깃헙동기화.json") : null;   // 강의이름 → 마지막으로 맞춘 깃헙 sha

/** 깃헙에서 텍스트 가져오기 — jsoup 우선, 없으면 순수 자바 HTTP. 200 이 아니면 던진다 */
function fetchText(url) {
    try {
        if (typeof org !== "undefined" && org.jsoup) {
            var res = org.jsoup.Jsoup.connect(url)
                .ignoreContentType(true)
                .ignoreHttpErrors(true)
                .userAgent(UA)
                .timeout(15000)
                .maxBodySize(0)
                .execute();
            var code = Number(res.statusCode());
            if (code !== 200) throw "HTTP " + code;
            return String(res.body());
        }
    } catch (e) {
        if (String(e).indexOf("HTTP ") === 0) throw e;
    }

    var conn = new java.net.URL(url).openConnection();
    conn.setRequestProperty("User-Agent", UA);
    conn.setConnectTimeout(15000);
    conn.setReadTimeout(20000);
    var status = Number(conn.getResponseCode());
    if (status !== 200) { try { conn.disconnect(); } catch (e2) {} throw "HTTP " + status; }
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
    return false;   // 스레드를 못 만들면 포기한다 (여기서 직접 돌리면 봇이 멈춘다)
}

// ═══════════════ 강의 목록 · 고정 데이터 ═══════════════

var COURSES = null;       // [ { "이름", "조교방", "사담방", "프리미엄방", "표시":{역할:보여줄 이름} } ]
var DATA = {};            // { 강의이름: { "_공통": {명령어:할말}, "사담방": {...}, ... } }
var DATA_FROM = "없음";   // 깃헙 / 캐시 / 없음
var lastLoadAt = 0;       // 마지막 로드 "시도" 시각
var lastOkAt = null;      // 마지막 성공 시각
var lastLoadErr = null;   // 강의목록을 못 받은 사유
var courseErr = {};       // 강의이름 → 그 강의 데이터를 못 받은 사유

function parseCourses(txt) {
    var obj = JSON.parse(String(txt));
    var list = isArray(obj) ? obj : (obj && obj["강의"]);
    if (!isArray(list)) throw "강의목록 형식이 올바르지 않아요 (\"강의\": [ ... ] 가 필요)";
    var out = [];
    for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c && typeof c === "object" && c["이름"]) out.push(c);
    }
    return out;
}

function parseData(txt) {
    var obj = JSON.parse(String(txt));
    if (!obj || typeof obj !== "object" || isArray(obj)) throw "데이터 형식이 올바르지 않아요";
    return obj;
}

function saveCache() {
    if (!CACHE_FILE) return;
    try { fileWrite(CACHE_FILE, JSON.stringify({ "강의": COURSES, "데이터": DATA })); } catch (e) {}
}

/** 폰 캐시만 즉시 읽어 쓴다 (네트워크를 기다리지 않는다) */
function loadCacheOnly() {
    if (COURSES !== null || !CACHE_FILE) return;
    try {
        var c = fileRead(CACHE_FILE);
        if (!c) return;
        var o = JSON.parse(String(c));
        if (o && isArray(o["강의"])) {
            COURSES = o["강의"];
            DATA = (o["데이터"] && typeof o["데이터"] === "object") ? o["데이터"] : {};
            DATA_FROM = "캐시";
        }
    } catch (e) {}
}

/**
 * 깃헙에서 강의목록을 받고, 강의마다 데이터 파일을 받는다.
 * 목록을 못 받으면 아무것도 바꾸지 않는다 (처음이면 폰 캐시로 대체).
 * 어느 강의의 데이터만 못 받으면 그 강의는 전에 받은 것(없으면 빈 것)으로 두고 나머지는 갱신한다.
 */
function loadAll() {
    lastLoadAt = new Date().getTime();
    var list;
    try {
        list = parseCourses(fetchText(LIST_URL + "?t=" + lastLoadAt));
    } catch (e) {
        lastLoadErr = String(e);
        if (COURSES === null) loadCacheOnly();
        return false;
    }

    var newData = {};
    for (var i = 0; i < list.length; i++) {
        var name = String(list[i]["이름"]);
        try {
            var txt = fetchText(DATA_URL_PREFIX + encodeURIComponent(name) + ".json?t=" + lastLoadAt);
            newData[name] = parseData(txt);
            delete courseErr[name];
        } catch (e2) {
            courseErr[name] = String(e2);
            newData[name] = DATA[name] || {};
        }
    }
    COURSES = list;
    DATA = newData;
    DATA_FROM = "깃헙";
    lastOkAt = new Date();
    lastLoadErr = null;
    saveCache();

    // 등록분 깃헙 동기화 — 깃헙에서 바뀐 게 있으면 받아오고, 폰에 미반영이 남아 있으면 올린다
    for (var si = 0; si < list.length; si++) {
        try { syncPull(list[si]); }
        catch (e3) { syncOf(String(list[si]["이름"])).err = String(e3); }
    }
    return true;
}

/** 오래됐으면 백그라운드로 다시 받아온다 (메시지 처리는 기다리지 않는다) */
function refreshIfStale() {
    var now = new Date().getTime();
    if (now - lastLoadAt < REFRESH_MS) return;
    lastLoadAt = now;               // 실패해도 다음 주기까지는 재시도하지 않는다
    runAsync(loadAll);
}

// ═══════════════ 방 → 강의 ═══════════════

/** 이 방이 속한 강의와 역할. 없으면 null. dup 는 같은 방 이름이 여러 강의에 들어 있을 때 */
function findRoom(room) {
    if (!COURSES) return null;
    var hit = null, dup = false;
    for (var i = 0; i < COURSES.length; i++) {
        for (var r = 0; r < ROLES.length; r++) {
            if (COURSES[i][ROLES[r]] === room) {
                if (hit) dup = true;
                else hit = { course: COURSES[i], role: ROLES[r] };
            }
        }
    }
    if (hit) hit.dup = dup;
    return hit;
}

/** 사람에게 보여줄 방 이름 — 강의목록의 "표시" 가 있으면 그것, 없으면 실제 방 이름 */
function roleLabel(course, role) {
    var t = course["표시"];
    if (t && t[role]) return String(t[role]);
    return course[role] ? String(course[role]) : role;
}

function roleLabels(course, roles) {
    var out = [];
    for (var i = 0; i < roles.length; i++) out.push(roleLabel(course, roles[i]));
    return out.join("·");
}

// ═══════════════ 조교방에서 등록한 자동응답 ═══════════════
// 깃헙 데이터와 달리 폰 파일에만 강의별로 있다. 파일이 작아서 저장이 금방 끝나므로
// 그 자리에서 저장하고 성공/실패를 바로 알려준다.

var REGS = {};            // 강의이름 → { 갈래cmd → {명령어:할말} }
var lastRegErr = null;

function safeName(s) {
    return String(s).replace(/[\\\/:*?"<>|\s]/g, "_");
}

function regPath(course, kind) {
    if (!BASE_DIR) return null;
    return BASE_DIR + "/등록-" + safeName(course["이름"]) + "-" + kind.file + ".json";
}

/** 강의·갈래 하나의 { 명령어: 할말 } — 처음 찾을 때 파일에서 읽어 들인다 */
function regsOf(course, kind) {
    var name = String(course["이름"]);
    if (!REGS[name]) REGS[name] = {};
    if (REGS[name][kind.cmd]) return REGS[name][kind.cmd];
    var o = {};
    var p = regPath(course, kind);
    if (p) {
        try {
            var t = fileRead(p);
            if (t) {
                var j = JSON.parse(String(t));
                if (j && typeof j === "object") o = j;
            }
        } catch (e) { lastRegErr = String(e); }
    }
    REGS[name][kind.cmd] = o;
    return o;
}

function saveRegs(course, kind) {
    var p = regPath(course, kind);
    if (!p) { lastRegErr = "폰에 저장할 곳을 못 찾았어요"; return false; }
    try {
        if (fileWrite(p, JSON.stringify(regsOf(course, kind)))) { lastRegErr = null; return true; }
        lastRegErr = "파일 쓰기 실패";
    } catch (e) { lastRegErr = String(e); }
    return false;
}

/** 이 강의에서 그 명령어가 이미 등록돼 있는 갈래. 없으면 null */
function kindHaving(course, trigger) {
    for (var i = 0; i < REG_KINDS.length; i++) {
        if (regsOf(course, REG_KINDS[i]).hasOwnProperty(trigger)) return REG_KINDS[i];
    }
    return null;
}

function countOf(course, kind) {
    var n = 0, k, regs = regsOf(course, kind);
    for (k in regs) if (regs.hasOwnProperty(k)) n++;
    return n;
}

/** 이 강의의 이 역할 방에서 실제로 동작하는 등록 개수 */
function regCountFor(course, role) {
    var n = 0;
    for (var i = 0; i < REG_KINDS.length; i++) {
        if (REG_KINDS[i].roles.indexOf(role) !== -1) n += countOf(course, REG_KINDS[i]);
    }
    return n;
}

/**
 * 이 강의·역할에 적용되는 명령어표 — 공통 위에 역할별을 덮어쓴다.
 * withRegs 가 false 가 아니면 등록분도 얹는다 (고정 명령어는 덮어쓰지 않는다).
 */
function tableFor(course, role, withRegs) {
    var out = {}, k;
    var d = DATA[String(course["이름"])];
    if (d) {
        var common = d[COMMON_KEY];
        if (common) for (k in common) if (common.hasOwnProperty(k)) out[k] = common[k];
        var own = d[role];
        if (own) for (k in own) if (own.hasOwnProperty(k)) out[k] = own[k];
    }
    if (withRegs !== false) {
        for (var i = 0; i < REG_KINDS.length; i++) {
            if (REG_KINDS[i].roles.indexOf(role) === -1) continue;
            var regs = regsOf(course, REG_KINDS[i]);
            for (k in regs) if (regs.hasOwnProperty(k) && !out.hasOwnProperty(k)) out[k] = regs[k];
        }
    }
    return out;
}

/** 깃헙에서 관리하는 고정 명령어인지 (이 강의의 어느 방에서든) */
function isFixed(course, trigger) {
    for (var r = 0; r < ROLES.length; r++) {
        var t = tableFor(course, ROLES[r], false);
        if (t.hasOwnProperty(trigger)) return true;
        if (t.hasOwnProperty(CONTAIN_MARK + trigger)) return true;
    }
    return false;
}

/**
 * 응답을 내보낸다. 값이 목록이면 메시지를 나눠서 여러 개로 보낸다.
 *   "명령어": "한 줄"              → 메시지 1개
 *   "명령어": ["첫 개", "둘째 개"]  → 메시지 2개
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

/** 쿨다운을 묶는 기준 — 목록이든 한 줄이든 같은 내용이면 같은 값 */
function replyKey(value) {
    return isArray(value) ? value.join(" ") : String(value);
}

function triggersOf(table) {
    var keys = [], k;
    for (k in table) if (table.hasOwnProperty(k)) keys.push(k);
    keys.sort();
    return keys;
}

// ── 포함 트리거 쿨다운 (앱이 살아 있는 동안만 기억) ──
var containAt = {};

function containReady(room, what) {
    var id = room + "|" + what;
    var now = new Date().getTime();
    var prev = containAt[id] || 0;
    if (now - prev < CONTAIN_COOL_MIN * 60 * 1000) return false;
    containAt[id] = now;
    return true;
}

/** 메시지 안에 들어 있기만 해도 되는 명령어를 찾는다. 없으면 null */
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

// ═══════════════ 등록분 깃헙 저장 (백업 · 복원) ═══════════════
//
// 폰 파일이 기준이고 깃헙은 그 사본이다. 깃헙 쓰기는 전부 백그라운드에서만 한다.
//  - 바뀌면: 그 강의에 "바뀜(dirty)" 깃발을 올리고 올리기 담당(pushLoop)을 깨운다. 담당은 강의마다 하나만 돈다.
//  - 담당: 깃발을 내리고 폰 파일 전체를 올린다 → 끝나고 깃발이 다시 서 있으면 한 번 더 → 깃발이 내려가 있으면 끝.
//  - 갱신(30분·시작): 깃헙 sha 가 마지막으로 맞춘 것과 다르면 깃헙 쪽이 바뀐 것이니 받아와 폰에 적용한다.
//    폰에 깃발이 서 있으면(미반영) 받아오지 않고 올린다 — 조교방 등록이 우선.

var SYNC = {};             // 강의이름 → { dirty, running, sha, err, okAt }
var syncShaLoaded = false;

function syncOf(name) {
    if (!SYNC[name]) SYNC[name] = { dirty: false, running: false, sha: null, err: null, okAt: null };
    return SYNC[name];
}

/** 폰에 적어 둔 "마지막으로 맞춘 sha" — 앱을 다시 켜도 깃헙 쪽 변화를 알아보기 위해 */
function loadSyncShas() {
    if (syncShaLoaded) return;
    syncShaLoaded = true;
    if (!SYNC_FILE) return;
    try {
        var t = fileRead(SYNC_FILE);
        if (!t) return;
        var o = JSON.parse(String(t));
        for (var k in o) if (o.hasOwnProperty(k) && o[k]) syncOf(k).sha = String(o[k]);
    } catch (e) {}
}

function saveSyncShas() {
    if (!SYNC_FILE) return;
    var o = {};
    for (var k in SYNC) if (SYNC.hasOwnProperty(k) && SYNC[k].sha) o[k] = SYNC[k].sha;
    try { fileWrite(SYNC_FILE, JSON.stringify(o)); } catch (e) {}
}

function ghPath(course) {
    return GITHUB.DIR + "/" + String(course["이름"]) + ".json";
}

function ghUrl(path) {
    var segs = String(path).split("/");
    for (var i = 0; i < segs.length; i++) segs[i] = encodeURIComponent(segs[i]);
    return "https://api.github.com/repos/" + GITHUB.OWNER + "/" + GITHUB.REPO + "/contents/" + segs.join("/");
}

/** 깃헙 API 호출 → { code, body } */
function httpReq(method, urlStr, bodyStr) {
    var conn = new java.net.URL(urlStr).openConnection();
    conn.setRequestMethod(method);
    conn.setRequestProperty("Authorization", "Bearer " + GITHUB.TOKEN);
    conn.setRequestProperty("Accept", "application/vnd.github+json");
    conn.setRequestProperty("User-Agent", "coursebot");
    conn.setConnectTimeout(10000);
    conn.setReadTimeout(20000);
    if (bodyStr) {
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        var os = conn.getOutputStream();
        os.write(new java.lang.String(bodyStr).getBytes("UTF-8"));
        os.close();
    }
    var code = Number(conn.getResponseCode());
    var is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
    var body = "";
    if (is) {
        var br = new java.io.BufferedReader(new java.io.InputStreamReader(is, "UTF-8"));
        var line;
        while ((line = br.readLine()) !== null) body += line;
        br.close();
    }
    conn.disconnect();
    return { code: code, body: body };
}

var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** UTF-8 → Base64. 앱마다 쓸 수 있는 구현이 달라서 순서대로 시도 */
function base64utf8(str) {
    var bytes = new java.lang.String(str).getBytes("UTF-8");
    try {
        if (typeof android !== "undefined" && android.util && android.util.Base64) {
            return String(android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP));
        }
    } catch (e) {}
    try { return String(java.util.Base64.getEncoder().encodeToString(bytes)); } catch (e) {}
    var out = "", i = 0, n = bytes.length;
    while (i < n) {
        var b0 = bytes[i++] & 0xff;
        var b1 = i < n ? bytes[i++] & 0xff : -1;
        var b2 = i < n ? bytes[i++] & 0xff : -1;
        out += B64.charAt(b0 >> 2);
        out += B64.charAt(((b0 & 3) << 4) | (b1 < 0 ? 0 : b1 >> 4));
        out += b1 < 0 ? "=" : B64.charAt(((b1 & 15) << 2) | (b2 < 0 ? 0 : b2 >> 6));
        out += b2 < 0 ? "=" : B64.charAt(b2 & 63);
    }
    return out;
}

/** Base64 → UTF-8 문자열. 깃헙은 60자마다 줄바꿈을 넣어 주므로 공백을 견디는 쪽을 쓴다 */
function base64decodeUtf8(b64) {
    var s = String(b64).replace(/[\s=]/g, "");
    try {
        if (typeof android !== "undefined" && android.util && android.util.Base64) {
            var ab = android.util.Base64.decode(s, android.util.Base64.DEFAULT);
            return String(new java.lang.String(ab, "UTF-8"));
        }
    } catch (e) {}
    try {
        var jb = java.util.Base64.getMimeDecoder().decode(s);
        return String(new java.lang.String(jb, "UTF-8"));
    } catch (e) {}
    // 최후 수단: 직접 풀어서 UTF-8 로 해석
    var bytes = [], bits = 0, acc = 0;
    for (var i = 0; i < s.length; i++) {
        var v = B64.indexOf(s.charAt(i));
        if (v < 0) continue;
        acc = (acc << 6) | v; bits += 6;
        if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 0xff); }
    }
    var out = "", j = 0;
    while (j < bytes.length) {
        var c = bytes[j++];
        if (c < 0x80) out += String.fromCharCode(c);
        else if (c < 0xe0) out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[j++] & 0x3f));
        else if (c < 0xf0) out += String.fromCharCode(((c & 0x0f) << 12) | ((bytes[j++] & 0x3f) << 6) | (bytes[j++] & 0x3f));
        else {
            var cp = ((c & 0x07) << 18) | ((bytes[j++] & 0x3f) << 12) | ((bytes[j++] & 0x3f) << 6) | (bytes[j++] & 0x3f);
            cp -= 0x10000;
            out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        }
    }
    return out;
}

/** 이 강의의 등록분 전체 — { "등록": {명령어:할말}, "프반": {...} } (깃헙 파일 모양) */
function regsSnapshot(course) {
    var o = {};
    for (var i = 0; i < REG_KINDS.length; i++) {
        var src = regsOf(course, REG_KINDS[i]), copy = {}, k;
        for (k in src) if (src.hasOwnProperty(k)) copy[k] = src[k];
        o[REG_KINDS[i].cmd] = copy;
    }
    return o;
}

function regsEmpty(course) {
    for (var i = 0; i < REG_KINDS.length; i++) if (countOf(course, REG_KINDS[i]) > 0) return false;
    return true;
}

/** 깃헙에서 받은 등록분을 폰에 적용한다 (갈래별 파일로 저장) */
function adoptRegs(course, data) {
    if (!data || typeof data !== "object" || isArray(data)) throw "깃헙 등록 파일 형식이 올바르지 않아요";
    var name = String(course["이름"]);
    if (!REGS[name]) REGS[name] = {};
    for (var i = 0; i < REG_KINDS.length; i++) {
        var kind = REG_KINDS[i], src = data[kind.cmd], o = {}, k;
        if (src && typeof src === "object" && !isArray(src)) {
            for (k in src) if (src.hasOwnProperty(k) && k && src[k]) o[k] = src[k];
        }
        REGS[name][kind.cmd] = o;
        saveRegs(course, kind);
    }
}

/** 깃헙의 등록 파일 → { code, sha, data } */
function ghGetRegs(course) {
    var res = httpReq("GET", ghUrl(ghPath(course)) + "?ref=" + GITHUB.BRANCH, null);
    if (res.code !== 200) return { code: res.code };
    var j = JSON.parse(res.body);
    var txt = base64decodeUtf8(j.content);
    return { code: 200, sha: String(j.sha), data: JSON.parse(txt) };
}

/** 폰 파일 전체를 깃헙에 한 번 올린다. sha 가 어긋나면 최신 sha 로 한 번 재시도 */
function ghPush(course) {
    var name = String(course["이름"]), s = syncOf(name);
    var url = ghUrl(ghPath(course));
    var content = JSON.stringify(regsSnapshot(course), null, 2);
    var body = { message: "강의등록: " + name, branch: GITHUB.BRANCH, content: base64utf8(content) };
    if (s.sha) body.sha = s.sha;

    var res = httpReq("PUT", url, JSON.stringify(body));
    if (res.code === 409 || res.code === 422) {
        var g = httpReq("GET", url + "?ref=" + GITHUB.BRANCH, null);
        if (g.code === 200) body.sha = String(JSON.parse(g.body).sha);
        else if (g.code === 404) delete body.sha;
        res = httpReq("PUT", url, JSON.stringify(body));
    }
    if (res.code === 200 || res.code === 201) {
        s.sha = String(JSON.parse(res.body).content.sha);
        s.err = null;
        s.okAt = new Date();
        saveSyncShas();
        return true;
    }
    s.err = "HTTP " + res.code + " " + String(res.body).substring(0, 80);
    return false;
}

/** 올리기 담당 — 강의마다 하나만 돈다 (백그라운드) */
function pushLoop(course) {
    var s = syncOf(String(course["이름"]));
    try {
        while (s.dirty) {
            s.dirty = false;                  // 올리는 동안 또 바뀌면 다시 서는 깃발
            if (!ghPush(course)) { s.dirty = true; break; }   // 실패 → 깃발 그대로, 다음 갱신 때
        }
    } catch (e) {
        s.err = String(e);
        s.dirty = true;
    }
    s.running = false;
    // 담당이 끝나는 찰나에 들어온 등록은 깃발만 서 있으니 다시 깨운다 (오류로 멈춘 경우는 제외)
    if (s.dirty && !s.err) kickPush(course);
}

function kickPush(course) {
    if (!GITHUB.TOKEN) return;
    var s = syncOf(String(course["이름"]));
    if (s.running) return;
    s.running = true;
    if (!runAsync(function () { pushLoop(course); })) s.running = false;   // 스레드를 못 만들면 다음 갱신 때
}

/** 등록이 바뀌었다 — 깃헙 올리기를 백그라운드로 예약한다 */
function markDirty(course) {
    syncOf(String(course["이름"])).dirty = true;
    kickPush(course);
}

/**
 * 갱신 때(백그라운드) 깃헙과 맞춘다.
 *  - 폰에 미반영이 있으면 올린다 (폰 우선)
 *  - 깃헙 sha 가 마지막으로 맞춘 것과 다르면 깃헙 쪽이 바뀐 것 → 받아와 폰에 적용
 *    단, 아직 한 번도 맞춘 적이 없고 폰에 등록이 있으면 폰을 올린다 (첫 만남엔 폰이 기준)
 *  - 깃헙에 파일이 없는데 폰에 등록이 있으면 올린다 (복원 아님 → 새로 만듦)
 *  - 토큰이 없으면 쓰기는 못 하고, 폰이 비어 있을 때 공개 raw 에서 복원만 시도한다
 */
function syncPull(course) {
    var name = String(course["이름"]), s = syncOf(name);
    loadSyncShas();

    if (!GITHUB.TOKEN) {
        if (!regsEmpty(course)) return;
        try {
            var raw = fetchText("https://raw.githubusercontent.com/" + GITHUB.OWNER + "/" + GITHUB.REPO + "/" +
                GITHUB.BRANCH + "/" + ghPath(course).split("/").map(encodeURIComponent).join("/") + "?t=" + new Date().getTime());
            adoptRegs(course, JSON.parse(raw));
        } catch (e) {}   // 없으면 그냥 빈 채로
        return;
    }

    if (s.dirty) { kickPush(course); return; }

    var r = ghGetRegs(course);
    if (r.code === 200) {
        if (r.sha === s.sha) { s.err = null; return; }
        if (s.sha === null && !regsEmpty(course)) { markDirty(course); return; }
        adoptRegs(course, r.data);
        s.sha = r.sha;
        s.err = null;
        saveSyncShas();
    } else if (r.code === 404) {
        s.sha = null;
        if (!regsEmpty(course)) markDirty(course);
        else s.err = null;
    } else {
        s.err = "HTTP " + r.code;
    }
}

/** 진단 한 줄 */
function syncLine(name) {
    if (!GITHUB.TOKEN) return "깃헙 저장 꺼짐 (로더에 토큰 없음)";
    var s = syncOf(name);
    if (s.err) return "⚠️ 깃헙 미반영: " + s.err;
    if (s.dirty || s.running) return "깃헙 올리는 중…";
    if (s.okAt) return "깃헙 반영 · " + shortTime(s.okAt);
    return s.sha ? "깃헙 동기화됨" : "깃헙 등록 없음";
}

// ═══════════════ 명령어 ═══════════════

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
 *  - 사담방·프리미엄방: 그 방이 반응하는 것 전부를 한 목록으로 (고정·등록 구분 없이)
 *  - 조교방: 사담방·프리미엄방을 갈라서. 앞 방에 이미 나온 명령어는 뒤 방에서 뺀다
 */
function listText(course, role) {
    if (role === STAFF) {
        var parts = [], seen = {}, dropped = false;
        for (var i = 0; i < LIST_SPLIT_ROLES.length; i++) {
            var r = LIST_SPLIT_ROLES[i];
            var all = triggersOf(tableFor(course, r));
            var ks = [];
            for (var j = 0; j < all.length; j++) {
                if (seen[all[j]]) { dropped = true; continue; }
                seen[all[j]] = true;
                ks.push(all[j]);
            }
            parts.push("───── " + roleLabel(course, r) + " (" + (i === 0 ? "" : "+") + ks.length + "개) ─────\n" +
                (ks.length ? listLines(ks) : "(겹치는 것 말고는 없음)"));
        }
        return "📋 " + course["이름"] + " 명령어 목록\n" + parts.join("\n\n") +
            (dropped ? "\n\n※ 겹치는 명령어는 뒤쪽 방에서 뺐습니다" : "");
    }

    var keys = triggersOf(tableFor(course, role));
    if (keys.length === 0) {
        return "등록된 자동응답이 없어요.\n(조교방에서 등록해 주세요)";
    }
    return "📋 이 방의 자동응답 (" + keys.length + "개)\n─────────────\n" + listLines(keys);
}

/** 갈래의 명령 뒤쪽을 받아 이 강의에 등록한다 */
function regAdd(course, kind, rest) {
    var usage = "이렇게 써 주세요\n" +
        PREFIX + kind.cmd + REG_SEP + "명령어" + REG_SEP + "할말";
    var cut = String(rest).indexOf(REG_SEP);
    if (cut === -1) return usage;

    var trigger = rest.substring(0, cut).trim();
    var say = rest.substring(cut + REG_SEP.length).trim();   // 뒤쪽은 밑줄·줄바꿈 그대로 둔다

    if (!trigger || !say) return usage;
    if (trigger.charAt(0) === PREFIX) return "명령어는 " + PREFIX + " 로 시작할 수 없어요.";
    if (trigger.charAt(0) === CONTAIN_MARK) return CONTAIN_MARK + " 로 시작하는 이름은 쓸 수 없어요.";
    if (isFixed(course, trigger)) {
        return "「" + trigger + "」 는 깃헙에서 관리하는 고정 명령어예요.\n" +
            "여기서는 덮어쓸 수 없으니 다른 이름을 써 주세요.";
    }

    var owner = kindHaving(course, trigger);
    if (owner) {
        return "「" + trigger + "」 는 이미 " + PREFIX + owner.cmd + " 으로 등록돼 있어요.\n" +
            "바꾸려면 먼저 " + PREFIX + "삭제" + REG_SEP + trigger + " 하고 다시 등록해 주세요.";
    }
    if (countOf(course, kind) >= REG_MAX) {
        return "등록이 " + REG_MAX + "개까지예요. 안 쓰는 걸 먼저 지워 주세요.";
    }

    var regs = regsOf(course, kind);
    regs[trigger] = say;
    if (!saveRegs(course, kind)) {
        delete regs[trigger];
        return "폰에 저장을 못 했어요 — 등록하지 않았습니다.\n" + (lastRegErr || "");
    }
    markDirty(course);   // 깃헙 올리기는 백그라운드로 — 여기서는 기다리지 않는다
    return "✅ 등록했어요 (" + roleLabels(course, kind.roles) + " / " + countOf(course, kind) + "개)\n" +
        "─────────────\n" + trigger + "\n  ↓\n" + say;
}

/** "/삭제_" 뒤쪽을 받아 이 강의에서 지운다 — 등록분만 지울 수 있다 */
function regDel(course, rest) {
    var trigger = String(rest).trim();
    if (!trigger) return "이렇게 써 주세요\n" + PREFIX + "삭제" + REG_SEP + "명령어";

    var kind = kindHaving(course, trigger);
    if (!kind) {
        if (isFixed(course, trigger)) {
            return "「" + trigger + "」 는 깃헙에서 관리하는 고정 명령어라 여기서는 못 지워요.";
        }
        return "「" + trigger + "」 는 등록된 게 없어요.";
    }

    var regs = regsOf(course, kind);
    var backup = regs[trigger];
    delete regs[trigger];
    if (!saveRegs(course, kind)) {
        regs[trigger] = backup;
        return "폰에 저장을 못 했어요 — 지우지 않았습니다.\n" + (lastRegErr || "");
    }
    markDirty(course);
    return "🗑️ 지웠어요 (" + PREFIX + kind.cmd + " / " + countOf(course, kind) + "개 남음)\n" + trigger;
}

/** "10/01 14:32" */
function shortTime(d) {
    function p(n) { return n < 10 ? "0" + n : String(n); }
    return p(d.getMonth() + 1) + "/" + p(d.getDate()) + " " +
        p(d.getHours()) + ":" + p(d.getMinutes());
}

/** 고정 데이터 오류를 사람 말로 */
function courseErrText(name) {
    var e = courseErr[name];
    if (!e) return "";
    if (String(e).indexOf("HTTP 404") === 0) return "고정 데이터 파일 없음 (등록분만 동작)";
    return "고정 데이터: " + e;
}

/**
 * 진단 — 평소에는 짧게, 문제가 있을 때만 길어진다.
 * 로더의 /강의업데이트 가 이 내용을 그대로 덧붙여 보여주므로 짧게 유지할 것.
 */
function diagText(room) {
    var out = "🎓 강의봇 v" + BOT_VER + "\n";
    var hit = findRoom(room);
    if (COURSES === null) {
        out += "방 [" + room + "] — 강의목록을 아직 못 받았어요 ❌";
    } else if (!hit) {
        out += "방 [" + room + "] 어느 강의에도 없음 ❌ (강의 " + COURSES.length + "개)";
    } else {
        var name = String(hit.course["이름"]);
        var reg = regCountFor(hit.course, hit.role);
        out += "방 [" + room + "] = " + name + " · " + hit.role + " ✅\n" +
            "명령어 " + triggersOf(tableFor(hit.course, hit.role)).length + "개" +
            (reg > 0 ? " (등록 " + reg + "개 포함)" : "");
        if (hit.dup) out += "\n⚠️ 이 방 이름이 여러 강의에 들어 있어요 (첫 강의로 동작)";
        if (courseErr[name]) out += "\n⚠️ " + courseErrText(name);
        out += "\n" + syncLine(name);
    }
    out += "\n데이터 " + DATA_FROM + (lastOkAt ? " · " + shortTime(lastOkAt) : " · 아직 못 받음");

    // 아래는 문제가 있을 때만 — 평소에는 보이지 않는다
    if (!CACHE_FILE) out += "\n⚠️ 폰에 저장할 곳이 없어 등록이 앱을 끄면 사라집니다";
    if (lastLoadErr) out += "\n⚠️ 강의목록: " + lastLoadErr;
    if (lastRegErr) out += "\n⚠️ 등록 저장: " + lastRegErr;
    return out;
}

/** /강의전체 — 받아온 강의 목록 전체 (관리자용) */
function allText() {
    if (COURSES === null) return "강의목록을 아직 못 받았어요." + (lastLoadErr ? "\n⚠️ " + lastLoadErr : "");
    var out = "🎓 강의 " + COURSES.length + "개 · 데이터 " + DATA_FROM +
        (lastOkAt ? " · " + shortTime(lastOkAt) : "");
    for (var i = 0; i < COURSES.length; i++) {
        var c = COURSES[i], name = String(c["이름"]);
        var fixed = 0, regs = 0;
        for (var r = 0; r < ROLES.length; r++) {
            fixed = Math.max(fixed, triggersOf(tableFor(c, ROLES[r], false)).length);
        }
        for (var k = 0; k < REG_KINDS.length; k++) regs += countOf(c, REG_KINDS[k]);
        out += "\n─────────────\n" + (i + 1) + ". " + name + " — 고정 " + fixed + " · 등록 " + regs;
        for (var r2 = 0; r2 < ROLES.length; r2++) {
            out += "\n  " + ROLES[r2] + ": " + (c[ROLES[r2]] ? c[ROLES[r2]] : "(없음)");
        }
        if (courseErr[name]) out += "\n  ⚠️ " + courseErrText(name);
        out += "\n  " + syncLine(name);
    }
    return out;
}

// ═══════════════ 메시지 처리 ═══════════════

var lastErrorReportAt = 0;
var lastLoadTryAt = 0;

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

        // ⓪ 진단 — 어느 방에서든
        if (text === PREFIX + "강의") {
            replier.reply(diagText(room));
            return;
        }
        if (text === PREFIX + "강의전체") {
            if (isAdmin(sender)) replier.reply(allText());
            return;
        }

        // ① 강의목록 준비 — 여기서 네트워크를 기다리지 않는다.
        //    캐시가 있으면 즉시 쓰고, 갱신은 백그라운드에서 한다.
        if (COURSES === null) {
            loadCacheOnly();
            if (COURSES === null) {
                var now = new Date().getTime();
                if (now - lastLoadTryAt >= 60000) {
                    lastLoadTryAt = now;
                    runAsync(loadAll);
                }
                return;
            }
        } else {
            refreshIfStale();
        }

        // ② 어느 강의의 어느 방인지. 목록에 없는 방은 완전히 무시
        var hit = findRoom(room);
        if (!hit) return;
        var course = hit.course, role = hit.role;

        // ③ /리스트
        if (text === PREFIX + "리스트") {
            replier.reply(listText(course, role));
            return;
        }

        // ④ 조교방에서 넣고 빼기 — 누구나
        if (role === STAFF) {
            for (var kk = 0; kk < REG_KINDS.length; kk++) {
                var kind = REG_KINDS[kk];
                var addCmd = PREFIX + kind.cmd + REG_SEP;
                if (text === PREFIX + kind.cmd) { replier.reply(regAdd(course, kind, "")); return; }
                if (text.indexOf(addCmd) === 0) {
                    replier.reply(regAdd(course, kind, text.substring(addCmd.length)));
                    return;
                }
            }
            var delCmd = PREFIX + "삭제" + REG_SEP;
            if (text === PREFIX + "삭제") { replier.reply(regDel(course, "")); return; }
            if (text.indexOf(delCmd) === 0) { replier.reply(regDel(course, text.substring(delCmd.length))); return; }
        }

        // ⑤ 명령어 — 메시지 전체가 정확히 일치할 때
        var table = tableFor(course, role);
        if (table.hasOwnProperty(text)) {
            sendReply(replier, table[text]);
            return;
        }

        // ⑥ 포함 트리거 — 그 낱말이 대화에 섞여 있기만 해도 응답 (방마다 쿨다운)
        var ckey = findContain(table, text);
        if (ckey) {
            var value = table[ckey];
            if (containReady(room, replyKey(value))) sendReply(replier, value);
        }

    } catch (e) {
        try {
            if (shouldReportError(text)) replier.reply("⚠️ 강의봇 오류: " + e);
        } catch (e2) {}
    }
}

// 스크립트가 켜질 때 미리 받아둔다 (여기서는 기다려도 된다). 못 받으면 폰 캐시로 시작한다
try { loadAll(); } catch (e) {}
try { loadCacheOnly(); } catch (e) {}

// ═══════════════ 앱 API 연결 (직접 붙여넣기용) ═══════════════
//
// 이 파일을 봇 앱에 "직접" 붙여넣었을 때 메신저봇R 신버전(API2)에서도 동작하도록 등록한다.
// ※ 로더를 통해 불러온 경우엔 로더가 이미 등록했으므로 건너뛴다.
(function registerApi2Direct() {
    if (typeof __ADMINS__ !== "undefined") return;   // 로더 경유 → 중복 등록 방지
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
