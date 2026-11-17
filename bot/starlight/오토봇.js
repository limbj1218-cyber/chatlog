/**
 * ═══════════════════════════════════════════════════════════
 *  오토봇 — 등록된 문구에 자동으로 응답하는 봇 (읽기 전용)
 *
 *  ◆ 명령어 (등록·삭제는 REG_KINDS 의 from 방에서만, 등록분은 그 갈래의 rooms 에서 반응)
 *    /리스트   → 이 방에서 반응하는 트리거 목록 (누구나)
 *               LIST_SPLIT 에 있는 방에서는 방별로 갈라서 보여준다
 *    /오토     → 진단 (방 인식·데이터 상태·버전) — 모든 방에서 동작
 *    /삭제내역 /삭제내역1 /삭제내역2 → 보관된 대화 되짚어보기 (지정한 방에서만, 누구나)
 *    /닉변감지 → 이 방에서 대화명을 바꾼 사람 (처음 이름 → … → 지금 이름, 누구나)
 *
 *    [공백기 근무표]  /등록_명령어_할말 → 오토2·오토2프프·공백기 근무표에서 반응
 *                    /프반_명령어_할말 → 오토2프프에서만 반응
 *    [멱살반2]        /등록_명령어_할말 → 멱살반2에서만 반응 (대화명에 "[조교]"·"버터떡" 이 있는 사람만)
 *    /삭제_명령어      → 그 방에서 넣은 것만 지운다 (다른 방 것은 못 건드린다)
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
 *  ◆ StarLight(NeonJS) 판 (2026-11-16) — bot/오토봇.js(메신저봇R 판)를 그대로 두고 따로 만든 것
 *    - 이 파일은 ES 모듈이다. 내보낸 함수 하나(export default)에 본체 전체가 들어 있고,
 *      로더(bot/starlight/오토봇로더.js)가 (방 목록, 폰 기능 __PLAT__) 을 넘겨 부른다.
 *    - 파일·네트워크는 전부 __PLAT__ 으로만 한다 (java·FileStream·Thread 없음).
 *    - 자동응답 로직은 메신저봇R 판과 같다. 메신저봇R 판을 고치면
 *      python bot/starlight/make_neon_auto.py 로 다시 만든다.
 *    - NeonJS 는 한 번에 한 작업만 돌리므로 메시지가 동시에 처리될 일이 없다.
 * ═══════════════════════════════════════════════════════════
 */
export default function autoBody(__ROOMS__, __PLAT__) {
var scriptName = "오토봇";
var BOT_VER = "1117-1s6";

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
// 넣고 빼는 건 누구나 할 수 있다. 갈래마다 "어느 방에서 넣는지(from)" 와
// "어느 방에서 반응하는지(rooms)" 가 따로 정해져 있다.
var REG_SEP = "_";                                // /등록_명령어_할말
var REG_MAX = 200;                                // 갈래마다 등록 최대 개수

// 등록 갈래 — 넣는 방 / 명령어 / 폰에 저장할 파일 / 반응하는 방
// 갈래를 늘리려면 여기에 한 줄 더 적으면 된다.
// ※ cmd 는 갈래끼리 겹쳐도 된다 — 넣는 방(from)이 다르면 서로 다른 갈래로 친다.
// admin 을 적으면 대화명에 그 중 하나라도 든 사람만 넣고 뺄 수 있다. 없으면 누구나.
var REG_KINDS = [
    { from: "공백기 근무표", cmd: "등록", file: "등록응답.json", rooms: ["오토2", "오토2프프", "공백기 근무표"] },
    { from: "공백기 근무표", cmd: "프반", file: "프반응답.json", rooms: ["오토2프프"] },
    { from: "멱살반2",      cmd: "등록", file: "멱살응답.json", rooms: ["멱살반2"],
      admin: ["[조교]", "버터떡"] }
];

// /리스트 를 방별로 갈라 보여줄 방. 여기 없는 방은 자기 것만 한 목록으로 보여준다.
var LIST_SPLIT = {
    "공백기 근무표": ["오토2", "오토2프프"]
};

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

// ═══════════════ 앱 호환 계층 (StarLight NeonJS) ═══════════════
// 파일·네트워크·백그라운드는 전부 로더가 준 __PLAT__ 으로만 한다 (java·FileStream·Thread 없음).
// 파일은 이름만 쓴다 — 로더가 프로젝트 data 폴더에 넣는다.
var PLAT = __PLAT__ || {};

function fileRead(name) {
    try {
        var r = PLAT.read ? PLAT.read(name) : null;
        if (r === null || r === undefined || String(r) === "") return null;
        return String(r);
    } catch (e) { return null; }
}

function fileWrite(name, text) {
    try { return PLAT.write ? !!PLAT.write(name, String(text)) : false; } catch (e) { return false; }
}

// ※ 메신저봇R 판과 같은 파일 이름 — 옛 폰의 파일을 data 폴더에 그대로 넣으면 기록이 이어진다
var BASE_DIR = "";
var CACHE_FILE = "오토봇캐시.json";
var LOG_FILE = "대화기록.json";
var PEOPLE_FILE = "사람.json";
for (var ki = 0; ki < REG_KINDS.length; ki++) {
    REG_KINDS[ki].path = REG_KINDS[ki].file;
}

/** 깃헙에서 텍스트 가져오기 → Promise<문자열> */
function fetchText(url) {
    var f = PLAT.fetch || fetch;
    return f(url, { headers: { "User-Agent": UA } }).then(function (res) {
        if (!res.ok) throw "HTTP " + res.status;
        return res.text().then(function (t) { return String(t); });
    });
}

/** 백그라운드 실행 — NeonJS 는 await 하는 동안 다른 메시지를 처리하므로 스레드가 필요 없다 */
function runAsync(fn) {
    try {
        Promise.resolve().then(fn).catch(function (e) { lastLoadErr = String(e); });
        return true;
    } catch (e) { return false; }
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
async function loadData() {
    lastLoadAt = new Date().getTime();
    try {
        // 중간 캐시된 옛 내용이 오지 않도록 시각을 붙인다
        var txt = await fetchText(DATA_URL + "?t=" + lastLoadAt);
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
    runAsync(function () { return loadData(); });
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

/** 이 방에서 넣고 뺄 수 있는 갈래들 */
function kindsFrom(room) {
    var out = [];
    for (var i = 0; i < REG_KINDS.length; i++) {
        if (REG_KINDS[i].from === room) out.push(REG_KINDS[i]);
    }
    return out;
}

/** 등록하는 방인지 */
function isRegRoom(room) {
    return kindsFrom(room).length > 0;
}

/** 이 갈래를 넣고 뺄 수 있는 사람인지 — admin 이 없으면 누구나 */
function canManage(kind, sender) {
    if (!kind.admin || kind.admin.length === 0) return true;
    var name = String(sender);
    for (var i = 0; i < kind.admin.length; i++) {
        if (name.indexOf(kind.admin[i]) !== -1) return true;
    }
    return false;
}


/** 두 갈래가 반응하는 방이 하나라도 겹치는지 — 겹칠 때만 이름이 부딪힌다 */
function overlaps(a, b) {
    for (var i = 0; i < a.rooms.length; i++) {
        if (b.rooms.indexOf(a.rooms[i]) !== -1) return true;
    }
    return false;
}

/**
 * 이 트리거가 이미 등록돼 있는 갈래. 없으면 null.
 * kind 를 주면 그 갈래와 **반응하는 방이 겹치는** 갈래만 본다 —
 * 겹치지 않으면 같은 이름을 써도 어느 쪽이 나갈지 헷갈릴 일이 없다.
 */
function kindHaving(trigger, kind) {
    for (var i = 0; i < REG_KINDS.length; i++) {
        if (kind && !overlaps(kind, REG_KINDS[i])) continue;
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

/**
 * 깃헙에서 관리하는 고정 트리거인지 (등록분은 빼고 본다).
 * kind 를 주면 그 갈래가 반응하는 방만 본다 — 다른 방의 고정 트리거까지 막을 이유는 없다.
 */
// 고정 사진 응답 (2026-11-17 사용자 요청): 메시지 전체가 이 말이면 폰의 사진 파일을 보낸다.
// 사진은 폰의 FIXED_MEDIA_DIR(Download 폴더)에 그 이름으로 넣어 둔다. StarLight 판에서만 보낼 수 있다
// (메신저봇R 엔 사진 보내기가 없어 아무 말도 안 한다). 오토봇의 모든 방에서 반응하고, 같은 이름은 /등록_ 으로 못 넣는다.
var FIXED_MEDIA_DIR = "/sdcard/Download";
var FIXED_MEDIA = {
    "확장업데이트": "이지워커업데이트.jpg"
};
var mediaLast = "";      // 마지막 사진 보내기 결과

/** 고정 사진 응답 — 보냈으면(보내려 했으면) true */
function handleFixedMedia(text, replier) {
    if (!FIXED_MEDIA.hasOwnProperty(text)) return false;
    var file = FIXED_MEDIA[text];
    var path = FIXED_MEDIA_DIR + "/" + file;
    if (!replier || typeof replier.sendMedia !== "function") { mediaLast = "이 앱에선 사진을 못 보내요"; return true; }
    function fail(e) {
        mediaLast = file + " 실패 — " + e;
        try { replier.reply("⚠️ " + file + " 를 못 보냈어요. 폰 Download 폴더에 그 이름으로 있는지 봐 주세요."); } catch (e2) {}
    }
    try {
        var p = replier.sendMedia(path);
        mediaLast = file + " 보내는 중";
        if (p && typeof p.then === "function") {
            p.then(function (r) {
                var err = r && r.error ? String(r.error) : "";
                if (err) fail(err); else mediaLast = file + " 보냄 ✅";
            }, fail);
        }
    } catch (e) { fail(e); }
    return true;
}

function isFixed(trigger, kind) {
    if (FIXED_MEDIA.hasOwnProperty(trigger)) return true;
    var rooms = [], seen = {}, i, j;
    if (kind) {
        rooms = kind.rooms;
    } else {
        for (i = 0; i < REG_KINDS.length; i++) {
            for (j = 0; j < REG_KINDS[i].rooms.length; j++) rooms.push(REG_KINDS[i].rooms[j]);
        }
    }
    for (i = 0; i < rooms.length; i++) {
        if (seen[rooms[i]]) continue;
        seen[rooms[i]] = true;
        var t = tableFor(rooms[i], false);
        if (t.hasOwnProperty(trigger)) return true;
        if (t.hasOwnProperty(CONTAIN_MARK + trigger)) return true;
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
    return isArray(value) ? value.join("\u0000") : String(value);
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

// ═══════════════ 사람 구분 · 닉변 감지 (2026-11-13) ═══════════════
// 사건봇·루나봇에 있던 것을 그대로 옮겼다. 카톡 알림에는 회원 ID 가 없어서,
// 메신저봇R API2 가 주는 author.hash 로 사람을 구분한다 (로더가 who.hash 로 넘긴다).
// ★ hash 는 절대 화면에 보여주지 않는다. 보이는 건 그 사람이 처음 쓰던 대화명뿐이다.
// hash 가 없는 앱·옛 로더에서는 아무것도 기록하지 않는다 (닉변 감지가 동작하지 않을 뿐, 나머지는 그대로).

var HASH_PREFIX = "#h:";
var NICK_HIST_MAX = 10;    // 한 사람당 남겨 둘 대화명 개수 (첫 이름은 늘 남긴다)
var NICK_LIST_MAX = 30;    // /닉변감지 에 한 번에 보여줄 사람 수

var PEOPLE = null;         // { "#h:해시": { name: 최초 대화명, last: 최근 대화명, at: 바뀐 시각, hist: [이름…] } }
var ROOM_PEOPLE = null;    // { 방이름: { "#h:해시": true } } — 그 방에서 말한 적 있는 사람
var lastPeopleErr = null;
var peopleDirty = false;
var peopleSaving = false;

function loadPeople() {
    if (PEOPLE !== null) return;
    PEOPLE = {};
    ROOM_PEOPLE = {};
    if (!PEOPLE_FILE) return;
    try {
        var t = fileRead(PEOPLE_FILE);
        if (t) {
            var o = JSON.parse(String(t));
            if (o && typeof o === "object") {
                PEOPLE = o.people || {};
                ROOM_PEOPLE = o.rooms || {};
            }
        }
    } catch (e) { lastPeopleErr = String(e); }
}

// 저장은 백그라운드로 — 메시지 흐름에서 파일을 붙들지 않는다 (철칙)
function savePeople() {
    if (!PEOPLE_FILE || peopleSaving) return;
    peopleSaving = true;
    try {
        fileWrite(PEOPLE_FILE, JSON.stringify({ people: PEOPLE, rooms: ROOM_PEOPLE }));
        peopleDirty = false;
        lastPeopleErr = null;
    } catch (e) { lastPeopleErr = String(e); }
    peopleSaving = false;
}

function addNickHistory(p, newName) {
    if (!p.hist || !p.hist.length) {
        p.hist = [p.name];
        if (p.last && p.last !== p.name) p.hist.push(p.last);
    }
    if (p.hist[p.hist.length - 1] !== newName) p.hist.push(newName);
    // 첫 이름은 남기고 오래된 중간 이름부터 버린다
    while (p.hist.length > NICK_HIST_MAX) p.hist.splice(1, 1);
}

/** 이 메시지를 보낸 사람을 적어 둔다. hash 가 없으면 아무것도 하지 않는다. */
function seePerson(room, sender, who) {
    var h = "";
    try { h = who && who.hash ? String(who.hash) : ""; } catch (e) { h = ""; }
    if (!h || h === "null" || h === "undefined") return;

    loadPeople();
    var name = String(sender);
    var key = HASH_PREFIX + h;
    var p = PEOPLE[key], changed = false;

    if (!p) {
        PEOPLE[key] = { name: name, last: name, at: new Date().getTime() };
        changed = true;
    } else if (p.last !== name) {
        addNickHistory(p, name);
        p.last = name;
        p.at = new Date().getTime();
        changed = true;
    }

    if (!ROOM_PEOPLE[room]) ROOM_PEOPLE[room] = {};
    if (!ROOM_PEOPLE[room][key]) { ROOM_PEOPLE[room][key] = true; changed = true; }

    if (changed) {
        peopleDirty = true;
        if (!peopleSaving) runAsync(savePeople);
    }
}

/** 처음 이름 → … → 지금 이름 */
function nickChain(p) {
    var chain = (p.hist && p.hist.length) ? p.hist.slice(0) : [p.name, p.last];
    if (chain[0] !== p.name) chain.unshift(p.name);
    if (p.last && chain[chain.length - 1] !== p.last) chain.push(p.last);
    var out = [];
    for (var i = 0; i < chain.length; i++) {
        if (chain[i] && (!out.length || out[out.length - 1] !== chain[i])) out.push(String(chain[i]));
    }
    return out;
}

function nickWatchText(room) {
    loadPeople();
    var inRoom = ROOM_PEOPLE[room] || {};
    var rows = [], k;
    for (k in PEOPLE) {
        if (!PEOPLE.hasOwnProperty(k) || !inRoom[k]) continue;
        var chain = nickChain(PEOPLE[k]);
        if (chain.length >= 2) {
            rows.push({ at: Number(PEOPLE[k].at || 0), text: "• " + chain.join(" → ") });
        }
    }
    if (!rows.length) {
        var seen = 0;
        for (k in inRoom) if (inRoom.hasOwnProperty(k)) seen++;
        return "🕵️ 닉변 감지\n아직 대화명을 바꾼 사람이 없어요." +
            (seen ? "\n(이 방에서 지켜보는 사람 " + seen + "명)"
                  : "\n(아직 아무도 말하지 않았거나, 이 앱이 사람 구분 값을 주지 않습니다)");
    }
    rows.sort(function (a, b) { return b.at - a.at; });
    var lines = [];
    for (var i = 0; i < rows.length && i < NICK_LIST_MAX; i++) lines.push(rows[i].text);
    return "🕵️ 닉변 감지 (" + rows.length + "명)\n" + lines.join("\n") +
        (rows.length > NICK_LIST_MAX ? "\n… 외 " + (rows.length - NICK_LIST_MAX) + "명" : "");
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
 *  - LIST_SPLIT 에 있는 방: 어느 방 것인지 갈라서
 */
function listText(room) {
    var split = LIST_SPLIT.hasOwnProperty(room) ? LIST_SPLIT[room] : null;
    if (split) {
        // 앞 방에 이미 나온 명령어는 뒤 방에서 빼고 보여준다 (겹치는 게 많아 목록이 길어지므로)
        var parts = [], seen = {}, dropped = false;
        for (var i = 0; i < split.length; i++) {
            var r = split[i];
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
    if (isFixed(trigger, kind)) {
        return "「" + trigger + "」 는 깃헙에서 관리하는 고정 명령어예요.\n" +
            "여기서는 덮어쓸 수 없으니 다른 이름을 써 주세요.";
    }

    // 반응하는 방이 겹치는 갈래에 같은 이름이 있으면 어느 쪽이 나갈지 헷갈리므로 막는다
    var owner = kindHaving(trigger, kind);
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
function regDel(room, rest, sender) {
    var trigger = String(rest).trim();
    if (!trigger) return "이렇게 써 주세요\n" + PREFIX + "삭제" + REG_SEP + "명령어";

    // 이 방에서 넣은 갈래만, 그것도 권한이 있는 갈래만 지울 수 있다
    var mine = kindsFrom(room), kind = null;
    for (var i = 0; i < mine.length; i++) {
        if (!canManage(mine[i], sender)) continue;
        if (regsOf(mine[i]).hasOwnProperty(trigger)) { kind = mine[i]; break; }
    }
    if (!kind) {
        if (isFixed(trigger)) {
            return "「" + trigger + "」 는 깃헙에서 관리하는 고정 명령어라 여기서는 못 지워요.";
        }
        return "「" + trigger + "」 는 (이 방에서) 등록된 게 없어요.";
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
    if (lastPeopleErr) out += "\n⚠️ 사람 기록: " + lastPeopleErr;
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
function response(room, msg, sender, isGroupChat, replier, who) {
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

        // ①-2 누가 말했는지 적어 둔다 (닉변 감지용). hash 가 없으면 조용히 넘어간다.
        try { seePerson(room, sender, who); } catch (e) {}

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
            if (DATA === null) { runAsync(function () { return loadData(); }); return; }
        } else {
            refreshIfStale();
        }

        // ⑤-0 닉변 감지 — 이 방에서 대화명을 바꾼 사람 (누구나)
        if (text === PREFIX + "닉변감지") {
            replier.reply(nickWatchText(room));
            return;
        }

        // ⑤ /리스트
        if (text === PREFIX + "리스트") {
            replier.reply(listText(room));
            return;
        }

        // ⑤-2 방에서 직접 넣고 빼기 — 정해진 방에서만, 누구나
        //     "/삭제_" 로 받으므로 위에서 처리한 /삭제내역 과 겹치지 않는다
        var myKinds = kindsFrom(room);
        if (myKinds.length > 0) {
            for (var kk = 0; kk < myKinds.length; kk++) {
                var kind = myKinds[kk];
                var addCmd = PREFIX + kind.cmd + REG_SEP;
                if (text !== PREFIX + kind.cmd && text.indexOf(addCmd) !== 0) continue;
                if (!canManage(kind, sender)) return;   // 권한 없으면 조용히 넘어간다
                replier.reply(regAdd(kind, text === PREFIX + kind.cmd
                    ? "" : text.substring(addCmd.length)));
                return;
            }

            var delCmd = PREFIX + "삭제" + REG_SEP;
            if (text === PREFIX + "삭제" || text.indexOf(delCmd) === 0) {
                // 이 방에서 하나라도 다룰 수 있어야 /삭제 를 받아준다
                var can = null;
                for (var dk = 0; dk < myKinds.length; dk++) {
                    if (canManage(myKinds[dk], sender)) { can = myKinds[dk]; break; }
                }
                if (!can) return;                      // 권한 없으면 조용히 넘어간다
                replier.reply(regDel(room,
                    text === PREFIX + "삭제" ? "" : text.substring(delCmd.length), sender));
                return;
            }
        }

        // ⑤-3 고정 사진 응답 (확장업데이트 → 이지워커업데이트.jpg)
        if (handleFixedMedia(text, replier)) return;

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

// /감지 켜고 끄기를 할 수 있는 사람 — 오토봇엔 관리자 목록이 따로 없어서 여기서 정한다 (대화명에 들어 있으면)
var KW_ADMIN_PARTS = ["후파", "임병진", "[조교]"];
function isAdmin(sender) {
    for (var i = 0; i < KW_ADMIN_PARTS.length; i++) {
        if (String(sender).indexOf(KW_ADMIN_PARTS[i]) !== -1) return true;
    }
    return false;
}
// ═══════════════ 입퇴장·닉변·삭제 감지 (StarLight + KakaoDB 플러그인, 2026-11-16) ═══════════════
// 이 조각은 make_neon.py 가 StarLight 판 본체(bot/starlight/○○봇.js) 안에 넣는다. 메신저봇R 판에는 없다
// (메신저봇R 는 카톡 알림만 받아서 입퇴장·삭제를 알 수 없다).
//
// KakaoDB 플러그인(github.com/mooner1022/starlight-kakaodb)이 카톡 DB 를 읽어 주는 이벤트를 로더가 넘겨 준다:
//   onKakaoMemberJoined → kwJoined, onKakaoMemberLeft → kwLeft, onKakaoMessage → kwMessage, onKakaoMessageDeleted → kwDeleted
// 사람은 카톡 회원 ID(문자열 — 숫자로 바꾸면 자릿수가 깨진다)로 구분한다. StarLight 알림의 sender.id 와 달리 정확하다.
//
//  - 입장: 처음 보는 사람 → "OO님 어서오세요"
//          전에 있던 사람 → "OO님 돌아오신걸 환영해요", 대화명이 바뀌었으면 "OO님(구 XX님) 돌아오신걸 환영해요"
//  - 퇴장: "OO님이 나가셨어요" / 내보내졌으면 "OO님이 내보내졌어요"
//  - 닉변: 말할 때 대화명이 바뀌어 있으면 "🔄 대화명 변경: 처음 → … → 지금" (쓴 이름 누적). /닉변감지 는 이 기록으로 보여준다
//          오픈채팅에서는 오픈채팅 프로필 이름(kind "open_member")만 본다 — 친구 이름이 섞여 오면 가짜 닉변이 된다
//  - 삭제: "🗑️ OO님이 메시지를 지웠어요" + 지운 내용
//  - 기록은 data 폴더의 ○○_kakao.json (방마다 사람 ID → 처음 이름·지금 이름·바뀐 이름들)
//  - 처음 쓰는 방은 첫 이벤트 때 카톡 DB 의 멤버 목록으로 지금 있는 사람을 미리 적어 둔다
//    (그래야 원래 있던 사람이 나갔다 오면 "돌아오신걸" 로 맞이한다)
//  - 관리자(후파)가 /감지 입장 끄기 처럼 하나씩 끄고 켠다. /감지 로 상태를 본다

var KW_FILE = "auto_kakao.json";   // make_neon.py 가 봇마다 넣는다 (예: luna_kakao.json)
var KW_KINDS = { "입장": "join", "퇴장": "leave", "닉변": "nick", "삭제": "del" };
var KW_HIST_MAX = 10;
var KW_DEL_MAX = 200;      // 지운 내용은 이만큼만 보여준다
var kwStore = null;
var kwLastEventAt = 0;
var kwLastErr = "";
var kwCounts = {};          // 받은 DB 이벤트 수 (종류별, 다시 컴파일하면 0)

function kwSaw(kind) {
    kwLastEventAt = new Date().getTime();
    kwCounts[kind] = (kwCounts[kind] || 0) + 1;
}

function kwLoad() {
    if (kwStore) return kwStore;
    var raw = fileRead(KW_FILE);
    try { kwStore = raw ? JSON.parse(raw) : null; } catch (e) { kwStore = null; }
    if (!kwStore || typeof kwStore !== "object") kwStore = {};
    if (!kwStore.rooms) kwStore.rooms = {};
    if (!kwStore.off) kwStore.off = {};
    // v2 (2026-11-16): 오픈채팅에서 친구 이름이 섞여 생긴 가짜 닉변 기록을 한 번 지운다.
    // 지금 이름을 확실히 모르므로 다음에 말할 때 보이는 이름으로 조용히 맞춘다(quiet — 알림·기록 없이)
    if (kwStore.v !== 2) {
        for (var r in kwStore.rooms) {
            if (!kwStore.rooms.hasOwnProperty(r)) continue;
            var us = kwStore.rooms[r].users || {};
            for (var id in us) {
                if (!us.hasOwnProperty(id)) continue;
                delete us[id].hist;
                us[id].last = us[id].name;
                us[id].quiet = true;
            }
        }
        kwStore.v = 2;
        try { kwSave(); } catch (e) {}
    }
    return kwStore;
}

/** 오픈채팅방이면 오픈채팅 프로필 이름만 믿는다 — 카톡 DB 플러그인이 오픈 프로필을 못 찾으면 친구 이름을 대신 줘서
 *  같은 사람이 "[조교]후파 → 횡횡 → [조교]후파" 처럼 말할 때마다 바뀌어 보였다 (2026-11-16 겪음) */
function kwNameOk(kroom, user) {
    var open = false;
    try { open = !!kroom.isOpenChat; } catch (e) { open = false; }
    if (!open || !user) return true;
    var kind = "";
    try { kind = kwStr(user.kind); } catch (e) { kind = ""; }
    return !kind || kind === "open_member";
}

/** 이 봇이 맡은 방인지 — 오토봇은 EXTRA_ROOMS 까지 보는 inRooms() 가 있다 */
function kwInRoom(name) {
    if (typeof inRooms === "function") return !!inRooms(name);
    return ROOMS.indexOf(name) !== -1;
}

function kwSave() { fileWrite(KW_FILE, JSON.stringify(kwStore)); }

function kwRoomData(room) {
    var s = kwLoad();
    if (!s.rooms[room]) s.rooms[room] = { seeded: false, users: {} };
    return s.rooms[room];
}

function kwOn(room, kind) {
    var off = kwLoad().off[room];
    return !(off && off[kind]);
}

function kwStr(v) {
    if (v === null || v === undefined) return "";
    return String(v);
}

// 자바 리스트 → 배열 (Array.from 이 안 되면 번호로)
function kwList(list) {
    var out = [];
    if (!list) return out;
    try {
        if (typeof list.size === "function" && typeof list.get === "function") {
            var n = list.size();
            for (var i = 0; i < n; i++) out.push(list.get(i));
            return out;
        }
    } catch (e) { out = []; }
    try { out = Array.from(list); } catch (e2) { out = []; }
    if (!out.length && list.length > 0) {
        for (var j = 0; j < list.length; j++) out.push(list[j]);
    }
    return out;
}

/** KakaoDB 방 → 이 봇의 방 이름 (ROOMS 에 없으면 null). 폰에서 방 이름을 바꿔 둔 경우(customName)도 본다 */
function kwRoomName(kroom) {
    if (!kroom) return null;
    var names = [];
    try { names.push(kwStr(kroom.customName)); } catch (e) {}
    try { names.push(kwStr(kroom.name)); } catch (e) {}
    for (var i = 0; i < names.length; i++) {
        if (names[i] && kwInRoom(names[i])) { kwRooms[names[i]] = kroom; return names[i]; }
    }
    return null;
}

// 방 이름 → 마지막으로 이벤트가 온 KakaoDB 방 (명령에서 멤버 목록을 읽을 때 쓴다)
var kwRooms = {};

function kwSend(kroom, room, text) {
    var ok = false;
    try { ok = !!kroom.send(String(text)); } catch (e) { ok = false; }
    if (!ok) {
        try { ok = !!(PLAT.send && PLAT.send(room, String(text))); } catch (e2) { ok = false; }
    }
    return ok;
}

/** 처음 쓰는 방: 지금 멤버를 미리 적어 둔다 (방금 들어온 사람 skipIds 는 빼고) */
function kwSeed(kroom, room, skipIds) {
    var rd = kwRoomData(room);
    if (rd.seeded) return;
    rd.seeded = true;
    var now = new Date().getTime();
    try {
        var members = kwList(kroom.getMembers());
        for (var i = 0; i < members.length; i++) {
            var m = members[i];
            var id = kwStr(m.id), name = kwStr(m.name);
            if (!id || !name || m.isMe || (skipIds && skipIds[id]) || rd.users[id] || !kwNameOk(kroom, m)) continue;
            rd.users[id] = { name: name, last: name, at: now, seed: true };
        }
    } catch (e) { kwLastErr = "멤버 목록: " + e; }
}

function kwAddHist(rec, name) {
    if (!rec.hist || !rec.hist.length) rec.hist = [rec.name];
    if (rec.hist[rec.hist.length - 1] !== name) rec.hist.push(name);
    while (rec.hist.length > KW_HIST_MAX) rec.hist.splice(1, 1);
}

/** 이 사람의 지금 대화명을 적는다. 바뀌었으면 예전 이름을 돌려준다 (안 바뀌었으면 null) */
function kwSeeName(rd, id, name, now) {
    var rec = rd.users[id];
    if (!rec) { rd.users[id] = { name: name, last: name, at: now }; return null; }
    if (rec.quiet) {   // 정리한 기록 — 처음 보는 이름을 지금 이름으로 조용히 맞춘다
        delete rec.quiet;
        if (rec.last !== name) { rec.name = name; rec.last = name; rec.at = now; }
        return null;
    }
    if (rec.last === name) return null;
    var old = rec.last;
    kwAddHist(rec, name);
    rec.last = name;
    rec.at = now;
    return old;
}

function kwJoined(event) {
    kwSaw("입장");
    var room = kwRoomName(event.room);
    if (!room) return;
    var members = kwList(event.members);
    var skip = {};
    for (var i = 0; i < members.length; i++) skip[kwStr(members[i].id)] = true;
    kwSeed(event.room, room, skip);
    var rd = kwRoomData(room), now = new Date().getTime(), lines = [];
    for (var j = 0; j < members.length; j++) {
        var m = members[j];
        var id = kwStr(m.id), name = kwStr(m.name);
        if (!id || m.isMe) continue;
        if (!name) name = "새 멤버";
        var rec = rd.users[id];
        if (!rec) {
            rd.users[id] = { name: name, last: name, at: now, joins: 1 };
            lines.push(name + "님 어서오세요");
        } else {
            var old = rec.last && rec.last !== name && !rec.quiet ? rec.last : null;
            if (rec.quiet) { delete rec.quiet; rec.name = name; }
            if (old) kwAddHist(rec, name);
            rec.last = name;
            rec.at = now;
            rec.left = false;
            rec.joins = (rec.joins || 1) + 1;
            lines.push(old ? name + "님(구 " + old + "님) 돌아오신걸 환영해요" : name + "님 돌아오신걸 환영해요");
        }
    }
    kwSave();
    if (lines.length && kwOn(room, "join")) kwSend(event.room, room, lines.join("\n"));
    // 봇마다 덧붙인 입장 처리 (오토봇: 오픈프로필로 들어온 사람에게 안내)
    if (typeof kwAfterJoin === "function") {
        var joined = [];
        for (var q = 0; q < members.length; q++) if (members[q] && !members[q].isMe && kwStr(members[q].id)) joined.push(members[q]);
        try { if (joined.length) kwAfterJoin(event, room, joined); } catch (e) { kwLastErr = "입장 뒤 처리: " + e; }
    }
}

function kwLeft(event) {
    kwSaw("퇴장");
    var room = kwRoomName(event.room);
    if (!room) return;
    var m = event.member;
    if (!m || m.isMe) return;
    var id = kwStr(m.id), name = kwStr(m.name);
    kwSeed(event.room, room, null);
    var rd = kwRoomData(room), now = new Date().getTime();
    if (id) {
        if (name) kwSeeName(rd, id, name, now);
        else if (!rd.users[id]) rd.users[id] = { name: "?", last: "?", at: now };
        rd.users[id].left = true;
        rd.users[id].leftAt = now;
        if (!name) name = rd.users[id].last;
    }
    kwSave();
    if (name && kwOn(room, "leave")) {
        kwSend(event.room, room, event.isKicked ? name + "님이 내보내졌어요" : name + "님이 나가셨어요");
    }
}

function kwMessage(event) {
    kwSaw("메시지");
    var room = kwRoomName(event.room);
    if (!room) return;
    var msg = event.message;
    if (!msg || msg.isMine) return;
    var s = msg.sender;
    var id = kwStr(msg.senderId || (s && s.id)), name = kwStr(s && s.name);
    if (!id || !name || (s && s.isMe)) return;
    if (!kwNameOk(event.room, s)) return;      // 오픈채팅인데 친구 이름이 온 것 — 대화명으로 치지 않는다
    var rd = kwRoomData(room);
    if (!rd.seeded) kwSeed(event.room, room, null);
    var wasQuiet = rd.users[id] && rd.users[id].quiet;
    var old = kwSeeName(rd, id, name, new Date().getTime());
    var rec = rd.users[id];
    if (rec.left) rec.left = false;
    if (old !== null || wasQuiet || !rec.seenMsg) { rec.seenMsg = true; kwSave(); }
    // 바로 앞 이름만이 아니라 지금까지 쓴 이름을 다 보여준다 (처음 → … → 지금, 최대 10개)
    if (old !== null && kwOn(room, "nick")) {
        var chain = rec.hist && rec.hist.length >= 2 ? rec.hist.join(" → ") : old + " → " + name;
        kwSend(event.room, room, "🔄 대화명 변경: " + chain);
    }
}

var KW_TYPE_LABEL = { PHOTO: "사진", MULTIPHOTO: "사진 여러 장", VIDEO: "동영상", AUDIO: "음성", FILE: "파일",
    EMOTICON: "이모티콘", STICKER: "이모티콘", ANIMATED_EMOTICON: "이모티콘", LINK: "링크", CONTACT: "연락처",
    LOCATION: "위치", SEARCH: "샵검색" };

function kwDeleted(event) {
    kwSaw("삭제");
    var room = kwRoomName(event.room);
    if (!room || !kwOn(room, "del")) return;
    var msg = event.message;
    if (!msg || msg.isMine) return;           // 지운 메시지가 DB 에 남아 있지 않으면 누가 무엇을 지웠는지 모른다
    var name = kwStr(msg.sender && msg.sender.name) || "누군가";
    var type = kwStr(msg.type), text = kwStr(msg.text);
    var body;
    if (text && (type === "TEXT" || type === "REPLY" || type === "UNKNOWN" || type === "")) {
        body = text.length > KW_DEL_MAX ? text.substring(0, KW_DEL_MAX) + "…" : text;
    } else {
        body = "(" + (KW_TYPE_LABEL[type] || "메시지") + ")";
    }
    kwSend(event.room, room, "🗑️ " + name + "님이 메시지를 지웠어요\n" + body);
}

function kwNickText(room) {
    var rd = kwLoad().rooms[room];
    if (!rd) return null;
    var rows = [];
    for (var id in rd.users) {
        if (!rd.users.hasOwnProperty(id)) continue;
        var r = rd.users[id];
        if (r.hist && r.hist.length >= 2) rows.push({ at: Number(r.at || 0), text: "• " + r.hist.join(" → ") });
    }
    if (!rows.length) return "🕵️ 닉변 감지\n아직 대화명을 바꾼 사람이 없어요.";
    rows.sort(function (a, b) { return b.at - a.at; });
    var lines = [];
    for (var i = 0; i < rows.length && i < 30; i++) lines.push(rows[i].text);
    return "🕵️ 닉변 감지 (" + rows.length + "명)\n" + lines.join("\n") + (rows.length > 30 ? "\n… 외 " + (rows.length - 30) + "명" : "");
}

function kwStatusText(room) {
    var connected = "모름";
    try { if (typeof KakaoDB !== "undefined") connected = KakaoDB.isConnected ? "연결됨 ✅" : "끊김 ❌"; else connected = "플러그인 없음 ❌"; } catch (e) {}
    var rd = kwLoad().rooms[room], n = 0;
    if (rd) for (var k in rd.users) if (rd.users.hasOwnProperty(k)) n++;
    var parts = [];
    for (var ko in KW_KINDS) if (KW_KINDS.hasOwnProperty(ko)) parts.push(ko + " " + (kwOn(room, KW_KINDS[ko]) ? "켜짐" : "꺼짐"));
    var ago = kwLastEventAt ? Math.round((new Date().getTime() - kwLastEventAt) / 1000) + "초 전" : "아직 없음";
    var cnt = [];
    for (var c in kwCounts) if (kwCounts.hasOwnProperty(c)) cnt.push(c + " " + kwCounts[c]);
    var lines = ["👀 감지 상태", "카톡 DB: " + connected, parts.join(" · "), "기억하는 사람: " + n + "명",
        "마지막 DB 이벤트: " + ago + (cnt.length ? " (" + cnt.join(" · ") + ")" : "")];
    if (!kwLastEventAt) {
        lines.push("", "DB 이벤트가 하나도 안 왔어요. 확인할 것:",
            "① /루나로더 의 로더가 sl-1116-3 인지 (아니면 로더를 다시 붙여넣기)",
            "② 프로젝트 받을 이벤트에 kakaodb.member.join · leave · message.create · delete",
            "③ 방에서 아무 말이나 하고 몇 초 뒤 /감지 다시");
    }
    if (typeof kwStatusExtra === "function") {
        try { var ex = kwStatusExtra(room); if (ex) lines.push(ex); } catch (e) {}
    }
    if (kwLastErr) lines.push("최근 문제: " + kwLastErr);
    return lines.join("\n");
}

/** 방 명령 — 처리했으면 true. /감지, /감지 입장 끄기, /닉변감지(카톡 DB 기록이 있을 때) */
function kwCommand(room, msg, sender, replier) {
    if (!kwInRoom(room)) return false;
    var t = kwStr(msg).trim();
    if (t === "/감지") { replier.reply(kwStatusText(room)); return true; }
    // 봇마다 덧붙인 명령 (오토봇의 /내프로필·/프로필사진 등)
    if (typeof kwExtraCommand === "function" && kwExtraCommand(room, t, sender, replier)) return true;
    var m = /^\/감지\s+(\S+)\s+(켜기|끄기)$/.exec(t);
    if (m && (m[1] === "전부" || KW_KINDS.hasOwnProperty(m[1]))) {
        if (!isAdmin(sender)) return true;
        var s = kwLoad();
        if (!s.off[room]) s.off[room] = {};
        var kinds = [];
        if (m[1] === "전부") { for (var kk in KW_KINDS) if (KW_KINDS.hasOwnProperty(kk)) kinds.push(KW_KINDS[kk]); }
        else kinds.push(KW_KINDS[m[1]]);
        for (var i = 0; i < kinds.length; i++) s.off[room][kinds[i]] = m[2] === "끄기";
        kwSave();
        replier.reply("👀 " + m[1] + " 감지를 " + (m[2] === "끄기" ? "껐어요" : "켰어요") + "\n" + kwStatusText(room));
        return true;
    }
    if (t === "/닉변감지") {
        var txt = kwNickText(room);
        if (txt) { replier.reply(txt); return true; }
    }
    return false;
}

// ═══════════════ 오픈프로필 입장 안내 (오토봇만, 2026-11-16) ═══════════════
// make_neon_auto.py 가 kakaodb_watch.js 다음에 넣는다. 들어온 사람이 카카오톡 기본 프로필이 아니면
// 안내 글과 폰에 저장된 안내 사진을 그 방에 보낸다 (오토봇 방 전부 — 사용자 요청).
//
//  - 프로필 종류는 카톡 DB 오픈채팅 멤버의 profile_type. 뜻은 공식 문서가 없고, 알려진 값은
//    1 = 카카오톡 기본 프로필, 2 = 닉네임 프로필, 16 = 오픈프로필 → 기본(KW_MAIN_PROFILE)이 아니면 안내한다.
//    값을 모를 때(DB 에 아직 없음)는 아무 말도 안 한다. /내프로필 로 실제 값을 확인할 수 있다
//  - 사진은 StarLight 의 room.sendMedia(폰 경로) — 카톡 공유 화면을 거쳐 보낸다("다른 앱 위에 표시" 필요).
//    경로는 /프로필사진 경로 (관리자)로 바꾸고, 사진을 못 보내도 안내 글은 간다
//  - /감지 프로필 끄기·켜기 (관리자)로 방마다 끈다

KW_KINDS["프로필"] = "profile";
var KW_MAIN_PROFILE = [1];
var KW_PROFILE_TEXT = "님, 오픈프로필로 들어오셨어요. 사진을 참고 하셔서 카카오톡 기본 프로필로 바꿔 주세요 🙏";
var KW_PHOTO_DEFAULT = "/sdcard/Download/오픈프로필안내.jpg";
var kwPhotoLast = "";      // 마지막 사진 보내기 결과 (/감지 에 보인다)

function kwPhotoPath() {
    var p = kwLoad().profilePhoto;
    return p ? String(p) : KW_PHOTO_DEFAULT;
}

/** 카톡 DB 사용자 → 프로필 종류 숫자 (모르면 null) */
function kwProfileType(user) {
    if (!user) return null;
    try {
        var j = JSON.parse(String(user.toJson()));
        if (j && j.profileType !== undefined && j.profileType !== null) return Number(j.profileType);
    } catch (e) {}
    try { if (user.profileType !== undefined && user.profileType !== null) return Number(user.profileType); } catch (e2) {}
    return null;
}

function kwProfileName(t) {
    if (t === null) return "모름";
    if (t === 1) return "카카오톡 기본 프로필";
    if (t === 2) return "닉네임 프로필";
    if (t === 16) return "오픈프로필";
    return "알 수 없는 종류";
}

function kwNeedsMainProfile(t) {
    return t !== null && !isNaN(t) && KW_MAIN_PROFILE.indexOf(t) === -1;
}

/** 방의 카톡 DB 멤버 목록에서 이 사람(id) 찾기 */
function kwFindMember(kroom, id, name) {
    var members = [];
    try { members = kwList(kroom.getMembers()); } catch (e) { return null; }
    for (var i = 0; i < members.length; i++) {
        var m = members[i];
        if (id && kwStr(m.id) === id) return m;
        if (!id && name && kwStr(m.name) === name && kwNameOk(kroom, m)) return m;
    }
    return null;
}

function kwSendPhoto(kroom, room) {
    var path = kwPhotoPath();
    try {
        var p = kroom.sendMedia(path);
        kwPhotoLast = "보내는 중";
        if (p && typeof p.then === "function") {
            p.then(function (r) {
                var err = r && r.error ? String(r.error) : "";
                kwPhotoLast = err ? "실패 — " + err : "보냄 ✅";
            }, function (e) { kwPhotoLast = "실패 — " + e; });
        }
    } catch (e) {
        kwPhotoLast = "실패 — " + e;
        try { if (PLAT.sendMedia) PLAT.sendMedia(room, path); } catch (e2) {}
    }
}

function kwProfileNotice(kroom, room, member) {
    var t = kwProfileType(member);
    if (t === null) {
        // 들어온 직후엔 멤버 정보가 아직 DB 에 없을 수 있다 → 몇 초 뒤 한 번 더 본다
        var later = PLAT.setTimeout || (typeof setTimeout === "function" ? setTimeout : null);
        if (!later) return;
        var id = kwStr(member.id), name = kwStr(member.name);
        later(function () {
            try {
                var m2 = kwFindMember(kroom, id, null);
                var t2 = kwProfileType(m2);
                if (kwNeedsMainProfile(t2)) {
                    kwSend(kroom, room, (kwStr(m2 && m2.name) || name) + KW_PROFILE_TEXT);
                    kwSendPhoto(kroom, room);
                }
            } catch (e) { kwLastErr = "프로필 다시 보기: " + e; }
        }, 3000);
        return;
    }
    if (!kwNeedsMainProfile(t)) return;
    kwSend(kroom, room, kwStr(member.name) + KW_PROFILE_TEXT);
    kwSendPhoto(kroom, room);
}

function kwAfterJoin(event, room, members) {
    if (!kwOn(room, "profile")) return;
    for (var i = 0; i < members.length; i++) kwProfileNotice(event.room, room, members[i]);
}

function kwExtraCommand(room, t, sender, replier) {
    if (t === "/내프로필") {
        var kroom = kwRooms[room];
        if (!kroom) { replier.reply("아직 이 방의 카톡 DB 정보를 못 받았어요. 방에서 몇 마디 오간 뒤 다시 쳐 주세요."); return true; }
        var m = kwFindMember(kroom, null, String(sender));
        if (!m) { replier.reply("카톡 DB 멤버 목록에서 '" + sender + "' 님을 못 찾았어요."); return true; }
        var pt = kwProfileType(m);
        replier.reply("🪪 " + sender + "님 프로필\n종류 값: " + (pt === null ? "모름" : pt) + " (" + kwProfileName(pt) + ")\n" +
            (kwNeedsMainProfile(pt) ? "→ 들어올 때 기본 프로필 안내를 받는 종류예요" : "→ 안내 안 받는 종류예요"));
        return true;
    }
    if (t === "/프로필사진" || t.indexOf("/프로필사진 ") === 0) {
        if (!isAdmin(sender)) return true;
        var path = t.substring("/프로필사진".length).trim();
        if (path) {
            if (path.charAt(0) !== "/") { replier.reply("경로는 / 로 시작해야 해요. 예) /프로필사진 /sdcard/Download/안내.jpg"); return true; }
            kwLoad().profilePhoto = path;
            kwSave();
        }
        replier.reply("🖼️ 안내 사진: " + kwPhotoPath() + (path ? " 으로 바꿨어요" : "") + "\n(마지막 보내기: " + (kwPhotoLast || "아직 없음") + ")");
        return true;
    }
    return false;
}

function kwStatusExtra(room) {
    return "프로필 안내 사진: " + kwPhotoPath() + " (마지막 보내기: " + (kwPhotoLast || "아직 없음") + ")";
}

// 로더가 준 방 목록 (비어 있으면 본체 기본값)
if (__ROOMS__ && __ROOMS__.length > 0) ROOMS = __ROOMS__;

// 스크립트가 켜질 때 미리 받아둔다 (기다리지 않고 백그라운드로)
runAsync(function () { return loadData(); });

return {
    response: function (room, msg, sender, isGroupChat, replier, who) {
        try { if (kwCommand(room, msg, sender, replier)) return; } catch (e) { kwLastErr = String(e); }
        return response(room, msg, sender, isGroupChat, replier, who);
    },
    kakao: { joined: kwJoined, left: kwLeft, message: kwMessage, deleted: kwDeleted, status: kwStatusText },
    version: BOT_VER,
    rooms: function () { return ROOMS.concat(EXTRA_ROOMS); },
    reload: function () { return loadData(); },
    status: function () {
        return {
            dataFrom: DATA_FROM,
            lastOkAt: lastOkAt ? lastOkAt.toLocaleString() : null,
            loadErr: lastLoadErr, logErr: lastLogErr,
            regErr: lastRegErr, peopleErr: lastPeopleErr
        };
    }
};
}
