/**
 * ═══════════════════════════════════════════════════════════
 *  루나봇 — "루나" 방 전용 재련(강화) 미니게임
 *
 *  ◆ 명령어
 *    제련가즈아 / 재련가즈아 → 재련 시도 (하루 2회)
 *    /랭킹                    → 이 방 참여자들의 재련 랭킹
 *    /확률                    → 단계별 [성공, 유지, 하락, 파괴] 확률표 (누구나)
 *    (수리 문구)              → 장비가 파괴되면 봇이 알려주는 문구를 그대로 외치면 복구
 *    /등록_명령어_할말        → 명령어 등록 (누구나)
 *    /삭제_명령어             → 등록한 명령어 삭제 (누구나)
 *    /리스트                  → 등록된 명령어 목록
 *    /탐지 할말               → 거짓말 탐지기 (참·거짓·중립 무작위, 누구나)
 *    /경험치 레벨             → ROX 사냥터 추천 (그 레벨~+3 몬스터 중 경험치×마릿수 1등, 누구나)
 *    /메뉴얼 (/매뉴얼)        → 사용법 안내 (누구나)
 *    .질문                    → 클로드가 답한다 (관리자가 켰을 때, 답은 1~2분 뒤)
 *    .. / ...                 → 클로드 답변 켜기 / 끄기 (관리자)
 *    /클로드 /클로드토큰      → 클로드 상태 / 깃헙 토큰 등록 (토큰은 관리자)
 *    /지정_유저명_값          → 그 사람의 재련값을 값으로 바꾼다 (관리자)
 *    /초기화_유저명           → 그 사람의 재련 기록을 지운다 (관리자)
 *    /전부_값                 → 이 방 사람 모두의 재련값을 값으로 바꾼다 (관리자)
 *    /초기화 /삭제            → 관리자 전용 (대화명에 "후파"가 들어간 사람)
 *
 *  ◆ 사건봇(bot/사건봇.js)을 복사해 루나 방용으로 따로 만든 봇이다 (2026-11-12).
 *    - 방(루나)·데이터 파일(luna_Database.json)·관리자가 사건봇과 따로다.
 *    - 사건봇과 달리 파괴/수리가 있다 (제련봇 방식, 확률표도 제련봇과 같다).
 *      파괴되면 재련이 막히고, 그때 재련가즈아를 치면 수리 문구(REPAIR_KEYWORDS 7개 중 하나)를 알려준다. 수리하면 그날 재련 기회 +1.
 *      파괴·수리 문구는 파일에 저장하므로 봇을 다시 켜도 유지된다. 수리는 재련 횟수를 쓰지 않는다.
 *    - 사건봇과 같은 폰에서 함께 돌려도 기록이 섞이지 않는다.
 *    - 제련봇·사건봇과 명령어(/랭킹 등)가 같으므로, 그 봇들 방 목록에 "루나"를 넣지 말 것.
 *
 *  ◆ 호환성
 *    - 메신저봇R 신버전(API2) / 구버전(API1) / 다크토네이도 챗봇 모두 동작
 *    - FileStream(readJson/saveJson)이 없는 앱에서는 java.io + JSON 으로 자동 대체
 *    - 저장 폴더는 쓰기 가능한 곳을 자동 선택 (권한 없어도 앱 전용 폴더 사용)
 *
 *  ※ 안드로이드 Rhino 엔진 호환을 위해 ES5 문법만 사용한다.
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "루나봇";
var BOT_VER = "1112-20";

// ─────────────── 설정 (여기만 고치면 됨) ───────────────
var ROOMS = ["루나"];
var ADMINS = ["후파"];                                   // 대화명에 이 낱말이 "들어 있기만" 하면 관리자
var MAX_ATTEMPTS = 2;                                    // 하루 재련 횟수
// ────────────────────────────────────────────────────────

// ═══════════════ 앱 호환 계층 ═══════════════

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

function fileWrite(path, text) {
    try {
        if (typeof FileStream !== "undefined" && FileStream && FileStream.write) {
            FileStream.write(path, text);
            return true;
        }
    } catch (e) {}
    try {
        var f = new java.io.File(path);
        var parent = f.getParentFile();
        if (parent && !parent.exists()) parent.mkdirs();
        var w = new java.io.OutputStreamWriter(new java.io.FileOutputStream(f, false), "UTF-8");
        w.write(text);
        w.close();
        return true;
    } catch (e) {}
    return false;
}

/** 쓰기 가능한 저장 폴더 자동 선택 (권한 없어도 앱 전용 폴더는 쓸 수 있다) */
function pickBaseDir() {
    var cands = [];
    try {
        var app = android.app.ActivityThread.currentApplication();
        var ext = app.getExternalFilesDir(null);
        if (ext) cands.push(String(ext.getAbsolutePath()));
        cands.push(String(app.getFilesDir().getAbsolutePath()) + "/luna");
    } catch (e) {}
    cands.push("/sdcard/루나");
    for (var i = 0; i < cands.length; i++) {
        try {
            if (fileWrite(cands[i] + "/luna_write_test.txt", "ok") &&
                String(fileRead(cands[i] + "/luna_write_test.txt")).indexOf("ok") === 0) return cands[i];
        } catch (e) {}
    }
    return "/sdcard/루나";
}

var BASE_DIR = pickBaseDir();
// ※ 사건봇과 같은 앱 폴더를 쓸 수 있으므로 파일 이름을 반드시 다르게 둔다 (Database.json 은 사건봇 것)
var DATA_FILE = BASE_DIR + "/luna_Database.json";

// ═══════════════ 데이터 ═══════════════
// roomUsers 는 원본에서 Set 이었지만, Rhino 호환을 위해 { 이름: true } 객체로 다룬다.
// 파일에는 원본과 같은 배열 형태로 저장하므로 기존 데이터와 호환된다.

if (typeof __LUNA_DATA__ === "undefined") __LUNA_DATA__ = null;

function loadData() {
    var raw = fileRead(DATA_FILE);

    var parsed = null;
    if (raw) {
        try { parsed = JSON.parse(raw); } catch (e) {}
    }
    if (!parsed && __LUNA_DATA__) parsed = __LUNA_DATA__;
    if (!parsed) parsed = {};

    var rooms = {};
    var src = parsed.roomUsers || {};
    for (var room in src) {
        if (!src.hasOwnProperty(room)) continue;
        rooms[room] = {};
        var list = src[room];
        if (list && list.length) {                    // 저장된 배열 → 객체
            for (var i = 0; i < list.length; i++) rooms[room][list[i]] = true;
        } else if (list) {                            // 이미 객체 형태면 그대로
            for (var n in list) if (list.hasOwnProperty(n)) rooms[room][n] = true;
        }
    }

    return {
        userData: parsed.userData || {},
        dailyLimit: parsed.dailyLimit || {},
        broken: parsed.broken || {},              // { 이름: true } 장비 파괴 상태
        repairPrompt: parsed.repairPrompt || {},  // { 이름: 수리 문구 }
        custom: parsed.custom || {},              // { 방: { 명령어: 할말 } } 등록 명령어
        askOn: parsed.askOn || {},                // { 방: true } 클로드 답변 켜짐
        startLevel: parsed.startLevel || {},      // { 방: 숫자 } 기록 없는 사람의 시작 재련값 (/전부_)
        roomUsers: rooms
    };
}

var store = loadData();
var userData = store.userData;
var dailyLimit = store.dailyLimit;
var broken = store.broken;
var repairPrompt = store.repairPrompt;
var roomUsers = store.roomUsers;
var custom = store.custom;
var askOn = store.askOn;
var startLevel = store.startLevel;

/** 이 방에서 기록 없는 사람이 시작하는 재련값 (/전부_ 로 정한다, 기본 1) */
function roomStart(room) {
    var v = Number(startLevel[room]);
    return v >= 1 ? v : 1;
}

function saveData() {
    var out = { userData: userData, dailyLimit: dailyLimit,
        broken: broken, repairPrompt: repairPrompt, roomUsers: {} };
    for (var room in roomUsers) {
        if (!roomUsers.hasOwnProperty(room)) continue;
        var arr = [];
        for (var name in roomUsers[room]) {
            if (roomUsers[room].hasOwnProperty(name)) arr.push(name);
        }
        out.roomUsers[room] = arr;                    // 원본과 같은 배열 형태로 저장
    }
    out.custom = custom;
    out.askOn = askOn;
    out.startLevel = startLevel;
    try { __LUNA_DATA__ = out; } catch (e) {}       // 파일 저장이 막혀도 메모리에는 유지
    fileWrite(DATA_FILE, JSON.stringify(out));
}

// ═══════════════ 게임 규칙 ═══════════════

// [성공, 유지, 하락, 파괴] — 제련봇과 같은 표. 넷의 합이 100 이다.
// (사건봇은 파괴 칸이 없어서 그 몫이 하락으로 들어간다)
// 15단계는 전부 0 → 아무것도 안 걸려 "유지" (사실상 최고 단계)
var chances = {
    1: [50, 50, 0, 0],
    2: [33, 67, 0, 0],
    3: [25, 75, 0, 0],
    4: [25, 40, 25, 10],
    5: [25, 40, 25, 10],
    6: [20, 40, 25, 15],
    7: [20, 40, 25, 15],
    8: [20, 35, 30, 15],
    9: [20, 35, 30, 15],
    10: [20, 30, 30, 20],
    11: [20, 30, 30, 20],
    12: [20, 25, 30, 25],
    13: [15, 20, 35, 30],
    14: [15, 15, 35, 35],
    15: [0, 0, 0, 0]
};
var RESULTS = ["성공", "유지", "하락", "파괴"];

// 파괴되면 이 중 하나를 골라 "이렇게 외쳐주세요" 라고 알려준다 (2026-11-12 루나 전용 문구로 교체)
// 띄어쓰기까지 정확히 쳐야 수리된다. 루나 방 11/12 대화에서 나온 말로 골랐다 (주문 3개 + 반성문 4개).
// "진상님 죄송해요" 는 2026-11-12 사용자 요청으로 뺐다 — 이미 안내받은 사람은 봇 시작 때 아래 문구로 바뀐다.
// ※ 특정인을 겨냥하거나 성적 지향을 소재로 한 말은 넣지 않는다 — 파괴될 때마다 모두가 따라 외치게 되므로.
// 수리하면 그날 재련 기회를 1번 더 준다 (REPAIR_BONUS).
var REPAIR_BONUS = 1;
var REPAIR_KEYWORDS = [
    // 주문
    "아수라발발타",
    "오이시쿠나레 모에모에뀽",
    "가만히 있으면 반은 간다",
    // 반성문
    "이쁜말 고운말 쓰겠습니다",
    "이방에서는 체통을 지키겠습니다",
    "저는 구라비티의 노예입니다",
    "버그도 실력입니다"
];

// 문구를 바꾸기 전에 안내받은 사람은 옛 문구가 저장돼 있다 → 지금 목록의 문구로 바꿔 준다
(function refreshOldPrompts() {
    var changed = false;
    for (var who in repairPrompt) {
        if (!repairPrompt.hasOwnProperty(who)) continue;
        if (REPAIR_KEYWORDS.indexOf(repairPrompt[who]) === -1) {
            repairPrompt[who] = REPAIR_KEYWORDS[Math.floor(Math.random() * REPAIR_KEYWORDS.length)];
            changed = true;
        }
    }
    if (changed) saveData();
})();

function refine(level) {
    var row = chances[level] || [0, 0, 0, 0];
    var rand = Math.random() * 100;
    var sum = 0;
    for (var i = 0; i < row.length; i++) {
        sum += row[i];
        if (rand < sum) return RESULTS[i];
    }
    return "유지";
}

function isAdmin(sender) {
    for (var i = 0; i < ADMINS.length; i++) {
        if (ADMINS[i] && String(sender).indexOf(ADMINS[i]) !== -1) return true;
    }
    return false;
}

// ═══════════════ 재련값 지정 (관리자, 2026-11-12) ═══════════════
// /지정_유저명_값 → 그 사람의 재련 단계를 값으로 바꾼다. 값은 1 ~ 확률표의 마지막 단계.
// 대화명에 "_" 가 들어 있을 수 있어 "마지막 _" 에서 값과 나눈다.
// 오타로 없는 사람이 랭킹에 생기지 않게, 재련 기록이 있거나 이 방에서 말한 적 있는 대화명만 받는다 (정확히 일치).
// 파괴 상태가 있는 봇(루나봇)이면 파괴도 풀어 준다 — 관리자가 단계를 정해 준 것이므로.
function maxRefineLevel() {
    var m = 1;
    for (var k in chances) if (chances.hasOwnProperty(k) && Number(k) > m) m = Number(k);
    return m;
}

/** /지정_ 명령이면 답장 문구, 아니면 null */
function handleSetLevel(room, raw, sender) {
    if (raw.indexOf("/지정_") !== 0) return null;
    if (!isAdmin(sender)) return "해당 명령어를 사용할 수 있는 권한이 없습니다.";
    var rest = raw.substring(4);
    var cut = rest.lastIndexOf("_");
    var name = cut === -1 ? "" : rest.substring(0, cut).trim();
    var valStr = cut === -1 ? "" : rest.substring(cut + 1).trim();
    if (!name || !/^\d+$/.test(valStr)) return "형식: /지정_유저명_값\n예) /지정_철수_7";
    var val = parseInt(valStr, 10), max = maxRefineLevel();
    if (val < 1 || val > max) return "값은 1~" + max + " 사이로 넣어 주세요.";
    var inRoom = roomUsers[room] || {};
    if (!userData.hasOwnProperty(name) && !inRoom[name]) {
        return "\"" + name + "\" 님을 찾을 수 없어요.\n이 방에서 말한 적 있는 대화명을 정확히 써 주세요.";
    }
    var prev = userData[name] || roomStart(room);
    userData[name] = val;
    inRoom[name] = true;
    roomUsers[room] = inRoom;
    var unbroken = false;
    if (typeof broken !== "undefined" && broken[name]) {
        delete broken[name];
        if (typeof repairPrompt !== "undefined") delete repairPrompt[name];
        unbroken = true;
    }
    saveData();
    return "✏️ " + name + "님의 재련값을 " + prev + " → " + val + "(으)로 바꿨습니다." +
        (unbroken ? "\n(파괴 상태도 풀었어요)" : "");
}

// ═══════════════ 한 사람 재련 기록 지우기 (관리자, 2026-11-12) ═══════════════
// /초기화_유저명 → 그 사람의 재련값·오늘 횟수(·파괴 상태)를 모두 지운다. 랭킹에서 빠지고 다음 재련은 방 시작 값(기본 1)부터.
// 전체 "/초기화"(모두의 오늘 횟수)와 헷갈리지 않게 반드시 "/초기화_" 로 받는다. 대화명은 정확히 일치해야 한다.

/** /초기화_ 명령이면 답장 문구, 아니면 null */
function handleResetUser(room, raw, sender) {
    if (raw.indexOf("/초기화_") !== 0) return null;
    if (!isAdmin(sender)) return "해당 명령어를 사용할 수 있는 권한이 없습니다.";
    var name = raw.substring(5).trim();
    if (!name) return "형식: /초기화_유저명\n예) /초기화_철수";
    var had = userData.hasOwnProperty(name) || dailyLimit.hasOwnProperty(name) ||
        (typeof broken !== "undefined" && broken.hasOwnProperty(name));
    if (!had) return "\"" + name + "\" 님의 재련 기록이 없어요.\n대화명을 정확히 써 주세요.";
    var prev = userData[name];
    delete userData[name];
    delete dailyLimit[name];
    if (typeof broken !== "undefined") delete broken[name];
    if (typeof repairPrompt !== "undefined") delete repairPrompt[name];
    saveData();
    return "🧹 " + name + "님의 재련 기록을 지웠습니다." + (prev ? " (" + prev + "재련)" : "") +
        "\n다음 재련은 " + roomStart(room) + "부터 시작해요.";
}

// ═══════════════ 방 전체 재련값 일괄 지정 (관리자, 2026-11-12) ═══════════════
// /전부_값 → 이 방에서 말한 적 있는 사람 모두의 재련값을 값으로 바꾸고, 방 "시작 값"도 값으로 정한다.
// 카톡은 방 멤버 목록을 주지 않아 봇은 말한 사람만 안다 → 아직 말 안 한 사람은 시작 값으로 처리한다:
// 기록이 없는 사람이 처음 재련하면 1이 아니라 시작 값부터 (2026-11-12, 38명 방에서 11명만 바뀐 문제).
// 다른 방 사람은 건드리지 않는다.
// 파괴 상태가 있는 봇(루나봇)이면 파괴도 풀어 준다 (/지정 과 같은 규칙).

/** /전부_ 명령이면 답장 문구, 아니면 null */
function handleSetAll(room, raw, sender) {
    if (raw.indexOf("/전부_") !== 0) return null;
    if (!isAdmin(sender)) return "해당 명령어를 사용할 수 있는 권한이 없습니다.";
    var valStr = raw.substring(4).trim();
    if (!/^\d+$/.test(valStr)) return "형식: /전부_값\n예) /전부_5";
    var val = parseInt(valStr, 10), max = maxRefineLevel();
    if (val < 1 || val > max) return "값은 1~" + max + " 사이로 넣어 주세요.";
    var inRoom = roomUsers[room] || {};
    var count = 0;
    for (var name in inRoom) {
        if (!inRoom.hasOwnProperty(name) || !inRoom[name]) continue;
        userData[name] = val;
        if (typeof broken !== "undefined") delete broken[name];
        if (typeof repairPrompt !== "undefined") delete repairPrompt[name];
        count++;
    }
    startLevel[room] = val;
    saveData();
    return "✏️ 이 방 " + count + "명의 재련값을 모두 " + val + "(으)로 바꿨습니다." +
        "\n아직 재련 기록이 없는 사람도 처음 재련하면 " + val + "부터 시작해요.";
}

// ═══════════════ 명령어 등록 (2026-11-12) ═══════════════
// /등록_명령어_할말 → 그 방에서 "명령어"를 그대로 치면 "할말"을 보낸다.
// /삭제_명령어 로 지우고, /리스트 로 본다. 누구나 넣고 뺄 수 있다 (관리자 아님). 방별로 따로 저장.
// 명령어 쪽엔 "_" 를 못 쓰지만(첫 "_" 에서 끊는다) 할말 쪽 "_"·줄바꿈은 그대로 남는다.
// ※ "/삭제"(관리자 재련값 초기화)와 헷갈리지 않게 지우기는 꼭 "/삭제_" 로 받는다.
// ※ 봇이 이미 쓰는 말(재련가즈아·/랭킹 등)은 등록을 거절한다 — 등록해도 절대 응답할 수 없어서.
var RESERVED = ["재련가즈아", "제련가즈아", "/랭킹", "/확률", "/초기화", "/삭제", "/리스트"];

function isReserved(trigger) {
    var t = trigger.toLowerCase();
    if (RESERVED.indexOf(t) !== -1) return true;
    if (t.indexOf("/등록") === 0 || t.indexOf("/삭제") === 0 || t.indexOf("/탐지") === 0 || t.indexOf("/지정") === 0 || t.indexOf("/초기화") === 0 || t.indexOf("/전부") === 0 || t.indexOf("/경험치") === 0 || t === "/메뉴얼" || t === "/매뉴얼"
        || t.charAt(0) === "." || t.indexOf("/클로드") === 0) return true;
    if (typeof REPAIR_KEYWORDS !== "undefined") {
        for (var i = 0; i < REPAIR_KEYWORDS.length; i++) {
            if (REPAIR_KEYWORDS[i].toLowerCase() === t) return true;
        }
    }
    return false;
}

/** 등록 관련 명령이면 답장 문구, 아니면 null */
function handleRegister(room, raw) {
    var list = custom[room] || {};

    if (raw.indexOf("/등록_") === 0) {
        var rest = raw.substring(4);
        var cut = rest.indexOf("_");
        var trigger = cut === -1 ? "" : rest.substring(0, cut).trim();
        var text = cut === -1 ? "" : rest.substring(cut + 1);
        if (!trigger || !text.trim()) {
            return "형식: /등록_명령어_할말\n예) /등록_공지_오늘 8시에 모여요";
        }
        if (isReserved(trigger)) {
            return "\"" + trigger + "\" 은(는) 봇이 이미 쓰는 말이라 등록할 수 없습니다.";
        }
        if (list.hasOwnProperty(trigger)) {
            return "\"" + trigger + "\" 은(는) 이미 등록되어 있습니다.\n바꾸려면 /삭제_" + trigger + " 후 다시 등록해 주세요.";
        }
        list[trigger] = text;
        custom[room] = list;
        saveData();
        return "✅ \"" + trigger + "\" 등록 완료! 이제 " + trigger + " 라고 치면 답합니다.";
    }

    if (raw.indexOf("/삭제_") === 0) {
        var name = raw.substring(4).trim();
        if (!name) return "형식: /삭제_명령어";
        if (!list.hasOwnProperty(name)) {
            return "\"" + name + "\" 은(는) 등록된 명령어가 아닙니다. /리스트 로 확인해 주세요.";
        }
        delete list[name];
        saveData();
        return "🗑️ \"" + name + "\" 삭제 완료!";
    }

    if (raw === "/리스트") {
        var names = [];
        for (var k in list) if (list.hasOwnProperty(k)) names.push(k);
        if (!names.length) return "등록된 명령어가 없습니다.\n/등록_명령어_할말 로 누구나 넣을 수 있어요.";
        names.sort();
        return "📋 등록된 명령어 (" + names.length + "개)\n" + names.join("\n");
    }

    return null;
}

// ═══════════════ 거짓말 탐지기 (2026-11-12) ═══════════════
// /탐지 할말 → 참·거짓·중립 중 하나를 무작위로 답한다 (재미용 — 실제로 판별하지 않는다).
// 같은 말이라도 칠 때마다 다르게 나온다 (사용자 요청). 횟수 제한·저장 없음.
var DETECT_RESULTS = [
    { word: "참", icon: "🟢", lines: ["진실 반응입니다. 바늘이 꿈쩍도 안 하네요.", "거짓말 탐지기가 고개를 끄덕입니다.", "맥박·호흡 모두 안정적. 사실로 보입니다."] },
    { word: "거짓", icon: "🔴", lines: ["삐빅! 바늘이 크게 흔들렸습니다.", "동공이 흔들리는 게 포착됐습니다.", "식은땀이 감지됐습니다. 수상하네요."] },
    { word: "중립", icon: "🟡", lines: ["애매합니다. 반은 맞고 반은 틀린 듯해요.", "탐지기도 판단을 보류했습니다.", "진실과 거짓 사이 어딘가에 있습니다."] }
];

/** /탐지 명령이면 답장 문구, 아니면 null */
function handleDetect(raw) {
    if (raw.indexOf("/탐지") !== 0) return null;
    var rest = raw.substring(3);
    if (rest && !/^\s/.test(rest)) return null;   // "/탐지기" 같은 다른 말은 건드리지 않는다
    var claim = rest.trim();
    if (!claim) return "형식: /탐지 할말\n예) /탐지 나는 어제 일찍 잤다";
    var r = DETECT_RESULTS[Math.floor(Math.random() * DETECT_RESULTS.length)];
    var line = r.lines[Math.floor(Math.random() * r.lines.length)];
    if (claim.length > 60) claim = claim.substring(0, 60) + "…";
    return "🔍 거짓말 탐지기\n「" + claim + "」\n\n" + r.icon + " 결과: " + r.word + "\n" + line;
}

// ═══════════════ ROX 경험치 추천 (2026-11-12) ═══════════════
// /경험치 110 → 몬스터 레벨 110~113 중에서 "한 번에 잡는 무리"의 Job·Base 경험치가 가장 큰 몬스터를 하나씩 알려준다.
// 효율 = 1마리 경험치 × 한 번에 나오는 마릿수 (대형 2 · 중형 3 · 소형 5) — 광역으로 무리를 한 번에 잡는다고 본다.
// HP 는 보지 않는다 (사용자 요청: 어차피 다 한 대에 잡는다).
// 레벨 차이 0~3 이라 경험치 배율은 모두 100%. 합계가 같으면 표에서 먼저 나온(레벨 낮은) 몬스터.
// 데이터는 "ROX 몬스터 경험치표" 아티팩트(https://claude.ai/artifact/UDrTj3djzfp9sSe95D4x8p)의 282종을 그대로 옮긴 것.
//   (원 출처: GamingPH, 글로벌 서버 2026.11.11 수정본) 표를 고치면 여기도 다시 옮겨야 한다.
// 형식: [레벨, 이름, Base, Job, 마릿수]  (마릿수는 체형에서: 대형 2 · 중형 3 · 소형 5)
var EXP_MONSTERS = [
[1,"포링",32,32,3],
[2,"파브르",17,17,5],
[3,"푸파",18,18,5],
[4,"루나틱",19,19,5],
[5,"페코페코 알",20,20,5],
[6,"픽키",21,21,5],
[7,"드롭프스",33,55,3],
[8,"콘도르",46,46,3],
[9,"분노의 픽키",24,24,5],
[10,"윌로우",50,50,3],
[11,"로커",78,26,3],
[12,"촌촌",41,14,5],
[13,"도둑벌레 알",28,28,5],
[14,"만드라고라",44,73,3],
[15,"도둑벌레",23,38,5],
[16,"세비지 베베",31,31,5],
[17,"퍼밀리어",32,32,5],
[18,"데저트 울프 새끼",33,33,5],
[19,"암컷 도둑벌레",68,68,3],
[20,"포포링",70,70,3],
[21,"플랑크톤",45,27,5],
[22,"호넷",37,37,5],
[23,"타로우",29,48,5],
[24,"앰버나이트",176,59,2],
[25,"수컷 도둑벌레",60,100,3],
[26,"스포아",62,103,3],
[27,"크리미",63,21,5],
[28,"포이즌 스포아",43,129,3],
[29,"스틸 촌촌",55,33,5],
[30,"드레인리어",34,56,5],
[31,"코코",46,46,5],
[31,"스타이너",46,46,5],
[32,"더스티네스",35,59,5],
[32,"스모키",71,24,5],
[33,"로다 프로그",48,144,3],
[33,"보컬",144,48,3],
[34,"카라멜",25,74,5],
[34,"디노피시스",49,49,5],
[35,"쿠크레",50,50,5],
[35,"좀비",125,75,3],
[36,"히드라",64,38,5],
[36,"호른",128,77,3],
[37,"마르틴",26,78,5],
[37,"요요",78,26,5],
[38,"가이어스",53,53,5],
[38,"그리슬",106,106,3],
[39,"파이어럿 스켈",108,108,3],
[39,"티비아",162,54,3],
[40,"헌터 플라이",69,41,5],
[40,"스켈워커",110,110,3],
[41,"위스퍼",43,71,5],
[41,"미스트",214,128,2],
[42,"아르고스",133,221,2],
[42,"무카",221,133,2],
[43,"맨티스",122,122,3],
[43,"페코페코",275,92,2],
[44,"메틀러",158,95,3],
[44,"세비지",142,236,2],
[45,"아나콘다크",65,195,3],
[45,"플로라",195,195,2],
[46,"스콜피온",67,67,5],
[46,"사스콰치",201,201,2],
[47,"사이드 와인더",138,138,3],
[47,"고렘",259,155,2],
[48,"개미 알",71,71,5],
[48,"백련옥",89,53,5],
[49,"마타",146,146,3],
[49,"호드",146,146,3],
[50,"앙드레",75,75,5],
[50,"데저트 울프",113,188,3],
[51,"피에르",77,77,5],
[51,"솔져 스켈레톤",193,116,3],
[52,"바돈",59,99,5],
[52,"아르지오프",237,237,2],
[53,"마리나",61,101,5],
[53,"아쳐 스켈레톤",122,203,3],
[54,"데니로",83,83,5],
[54,"프릴도라",166,166,3],
[55,"비타타",43,128,5],
[55,"커너투스",64,106,5],
[56,"휀",131,218,3],
[56,"미이라",261,87,3],
[57,"베릿트",178,178,3],
[57,"마르두크",200,334,2],
[58,"마린 스피어",91,91,5],
[58,"이시스",341,205,2],
[59,"소드피쉬",140,419,2],
[59,"마이너 우로스",349,209,2],
[60,"마르스",95,95,5],
[60,"제롬",238,143,3],
[61,"아크라우스",123,74,5],
[61,"오본느",147,245,3],
[62,"웜테일",202,202,3],
[62,"레퀴엠",253,152,3],
[63,"스네이크(보아)",104,312,3],
[63,"빅풋",234,390,2],
[64,"울프",268,161,3],
[64,"파사나",321,321,2],
[65,"스켈레톤",220,220,3],
[65,"아누비스",495,165,2],
[66,"무낙",226,226,3],
[66,"엘더 윌로우",339,339,2],
[67,"마르크",116,116,5],
[67,"본건",232,232,3],
[68,"도깨비",149,89,5],
[68,"천하대장군",446,268,2],
[69,"데비어스",61,184,5],
[69,"소희",244,244,3],
[70,"구미호",125,125,5],
[70,"에기라",125,375,3],
[71,"호롱",128,128,5],
[71,"고블린(플레일)",320,192,3],
[72,"오크 베이비",131,131,5],
[72,"오크 좀비",295,491,2],
[73,"고블린(모닝스타)",268,268,3],
[73,"코볼트(모닝스타)",335,201,3],
[74,"잭",206,69,5],
[74,"스켈레톤 제네럴",274,274,3],
[75,"고블린(해머)",350,210,3],
[75,"오크 워리어",210,630,2],
[76,"코볼트(해머)",286,286,3],
[76,"오크 스켈레톤",429,429,2],
[77,"고블린(도끼)",292,292,3],
[77,"구울",292,292,3],
[78,"거대 위스퍼",335,559,2],
[78,"마리오네트",149,149,5],
[79,"고블린(단검)",304,304,3],
[79,"쁘띠",304,304,3],
[80,"바포메트 주니어",78,233,5],
[80,"공중 쁘띠",349,581,2],
[81,"고블린 아쳐",119,198,5],
[81,"캐럿",158,158,5],
[82,"코볼트 아쳐",161,161,5],
[82,"레이드릭",242,403,3],
[83,"데비루치",246,82,5],
[83,"오크 레이디",328,328,3],
[84,"제노크",334,334,3],
[84,"피빛의 기사",376,626,2],
[85,"고블린 스팀라이더",170,510,3],
[85,"코볼트(도끼)",340,340,3],
[86,"하이오크",649,389,2],
[86,"메이저 우로스",519,519,2],
[87,"나이트 메어",660,396,2],
[87,"세이지 웜",220,132,5],
[88,"오크 아쳐",358,358,3],
[88,"로터자이로",671,403,2],
[89,"윈드고스트",546,182,3],
[89,"좀비 프리즈너",182,546,3],
[90,"레이쓰",833,278,2],
[90,"리비오",555,555,2],
[91,"브릴라이트",94,282,5],
[91,"스팅",141,235,5],
[92,"크램프",287,96,5],
[92,"인저스티스",478,287,3],
[93,"스켈 프리즈너",388,388,3],
[93,"바소리",485,291,3],
[94,"알람",296,493,3],
[94,"심연의 기사",739,443,2],
[95,"레이드릭 아처",400,400,3],
[95,"펑크",150,250,5],
[96,"페노메나",254,152,2],
[96,"조커",761,457,2],
[97,"다크 프레임",206,206,5],
[97,"이블 드루이드",927,309,2],
[98,"칼리츠버그",470,784,2],
[98,"배회하는 자",209,627,3],
[99,"클락",636,212,3],
[99,"지르타스",424,424,3],
[100,"펜다르크",323,968,2],
[100,"시계탑 관리자",645,645,2],
[101,"트라이 조인트",327,109,5],
[101,"레글러",164,273,5],
[102,"조개",166,276,5],
[102,"타라 프로그",221,663,3],
[103,"메갈로돈",504,840,2],
[103,"해달",448,448,3],
[104,"네레이드",170,284,5],
[104,"스템웜",341,568,3],
[105,"에스터",345,115,5],
[105,"메갈리스",690,690,2],
[106,"퍼씰",350,583,3],
[106,"엘리게이터",1049,350,2],
[107,"갈라파고",354,590,3],
[107,"페스트",295,177,5],
[108,"폭력배",478,478,3],
[108,"아놀리안",478,478,3],
[109,"게",242,242,5],
[109,"가고일",484,484,3],
[110,"스터랙틱 고렘",368,1103,2],
[110,"머맨",613,368,3],
[111,"비틀 킹",248,248,5],
[111,"쵸코",310,186,5],
[112,"우든 골렘",377,1130,2],
[112,"헬 푸들",251,251,5],
[113,"래기드 좀비",635,381,3],
[113,"듀라한",508,508,3],
[114,"드래곤 테일",386,643,3],
[114,"우탄 파이터",1157,386,2],
[115,"드라이어드",650,390,3],
[115,"메두사",260,260,5],
[116,"기벳",395,1184,2],
[116,"밴시",658,395,3],
[117,"패러사이트",532,532,3],
[117,"스톤 슈터",599,998,2],
[118,"드릴러",404,135,5],
[118,"우탄 슈터",538,538,3],
[119,"플레임 스컬",408,136,5],
[119,"로리 루리",816,816,2],
[120,"좀비 슬로터",550,550,3],
[120,"블러디 머더러",825,825,2],
[121,"브리즈",419,698,3],
[121,"데몬 펑거스",279,279,5],
[122,"멘블라트",566,566,3],
[122,"마린",566,566,3],
[123,"지오그래퍼",287,861,3],
[123,"브라운 베나투",574,574,3],
[124,"슬리퍼",728,437,3],
[124,"라플레시아",291,291,5],
[125,"템페스트 디미크",738,443,3],
[125,"그랜드 페코",885,885,2],
[126,"블루 베나투",897,299,3],
[126,"고트",598,598,3],
[126,"저주받은 묘지기",449,1346,2],
[127,"오렌지 베나투",455,758,3],
[127,"선더링 디미크",606,606,3],
[128,"하피",614,614,3],
[128,"파이어리 디미크",307,921,3],
[129,"그린 베나투",622,622,3],
[129,"프로스트 디미크",622,622,3],
[130,"아포칼립스",945,945,2],
[130,"나이트메어 이블 드루이드",473,1418,2],
[130,"아크담",1418,473,2],
[131,"메탈링",239,399,5],
[131,"녹셔스",479,798,3],
[132,"포르셀리오",162,485,5],
[132,"블레이저",485,808,3],
[133,"베노무스",818,491,3],
[133,"익스플로전",164,491,5],
[134,"몰",497,166,5],
[134,"옵시디언",248,414,5],
[135,"운고리안트",1256,754,2],
[135,"디아볼릭",419,251,5],
[136,"어스 딜리터",339,1017,3],
[136,"미네랄",339,339,5],
[137,"지그",515,172,5],
[137,"그리즐리",1029,1029,2],
[138,"핏맨",521,1562,2],
[138,"웨이스트 스토브",1301,781,2],
[139,"스카이 딜리터",702,702,3],
[139,"라바 골렘",527,1580,2],
[140,"테디 베어",533,178,5],
[140,"나이트메어 테러",1598,533,2],
[141,"아노펠레스",269,449,5],
[141,"물의 정령",1346,808,2],
[142,"그렘린",817,1361,2],
[142,"로윈",908,545,3],
[143,"시로마",459,275,5],
[143,"필라",551,918,3],
[144,"힐 윈드",928,557,3],
[144,"이스라",557,928,3],
[145,"비홀더",563,188,5],
[145,"아이스 울프",375,1125,3],
[146,"가제티",1137,379,3],
[146,"반베르크",379,1137,3],
[147,"아이시클",383,383,5],
[147,"드로세라",766,766,3],
[148,"시커",194,581,5],
[148,"스노이어",1742,581,2],
[149,"에키오",1173,391,3],
[149,"호드렘린",391,1173,3],
[150,"아가브",790,790,3],
[150,"아이스 타이탄",1185,1185,2],
[151,"세실 디몬",798,798,3],
[152,"마가레타 소린",806,806,3],
[153,"하워드 알트아이젠",814,814,3],
[154,"에레메스 가일",822,822,3],
[155,"랜들",830,830,3],
[156,"셀리아",838,838,3],
[157,"트렌티니",846,846,3],
[158,"첸",854,854,3],
[159,"플라멜",862,862,3],
[160,"거티",870,870,3]
];

function expBest(list, col) {
    var best = list[0];
    for (var i = 1; i < list.length; i++) {
        if (list[i][col] * list[i][4] > best[col] * best[4]) best = list[i];
    }
    return best;
}

function expText(m, col) {
    return m[1] + "(exp " + m[col] + "×" + m[4] + "=" + (m[col] * m[4]) + ")";
}

/** /경험치 명령이면 답장 문구, 아니면 null */
function handleExp(raw) {
    if (raw.indexOf("/경험치") !== 0) return null;
    var rest = raw.substring(4);
    if (rest && !/^[\s\d]/.test(rest)) return null;   // "/경험치표" 같은 다른 말은 건드리지 않는다
    var mm = /^\s*(\d{1,3})\s*$/.exec(rest);
    if (!mm) return "형식: /경험치 레벨\n예) /경험치 110";
    var lv = parseInt(mm[1], 10);
    var list = [];
    for (var i = 0; i < EXP_MONSTERS.length; i++) {
        var d = EXP_MONSTERS[i][0] - lv;
        if (d >= 0 && d <= 3) list.push(EXP_MONSTERS[i]);
    }
    if (!list.length) return lv + "레벨~" + (lv + 3) + "레벨 몬스터가 표에 없습니다.\n(몬스터는 Lv.1~160 까지 있어요)";
    var job = expBest(list, 3), base = expBest(list, 2);
    return "[" + lv + "레벨 기준 추천몬스터]\nBASE : " + expText(base, 2)
        + "\nJOB : " + expText(job, 3)
        + "\n※ 한 번에 젠되는 마릿수 기준 (대형 2 · 중형 3 · 소형 5마리)";
}

// ═══════════════ 사용법 (2026-11-12) ═══════════════
// /메뉴얼 → 이 봇의 사용법. 맞춤법이 헷갈리기 쉬워 /매뉴얼 도 받는다.
// ※ 명령어를 늘리거나 바꾸면 여기도 같이 고칠 것. 관리자 명령(/초기화·/삭제)은 일부러 뺐다 (사용자 요청).
var MANUAL_TEXT = [
    "📖 루나봇 사용법",
    "",
    "⚔️ 재련 (하루 2번)",
    "재련가즈아 — 장비 재련. 성공하면 +1, 실패하면 그대로거나 1 내려가요",
    "4단계부터는 파괴될 수도 있어요 💥",
    "/확률 — 단계별 성공·유지·하락·파괴 확률",
    "/랭킹 — 이 방 재련 순위",
    "",
    "🛠️ 파괴됐을 때",
    "재련가즈아를 치면 수리 문구를 알려줘요. 그 문구를 그대로 외치면 복구!",
    "수리하면 오늘 재련 기회 +1 🎁",
    "",
    "📝 명령어 등록 (누구나)",
    "/등록_명령어_할말 — 예) /등록_공지_오늘 8시에 모여요",
    "/삭제_명령어 — 등록한 명령어 지우기",
    "/리스트 — 등록된 명령어 보기",
    "",
    "🎲 놀이 (누구나)",
    "/탐지 할말 — 거짓말 탐지기 (참·거짓·중립)",
    "/경험치 레벨 — ROX 추천 몬스터 (예: /경험치 110)",
    "",
    "🤖 클로드 (관리자가 켰을 때만)",
    ".질문 — 점 하나 붙여서 물어보면 클로드가 답해요 (1~2분 걸려요)"
].join("\n");

// ═══════════════ 클로드 답변 (2026-11-12) ═══════════════
// ".질문" → 클로드가 답한다. 관리자가 ".." 치면 켜고 "..." 치면 끈다 (방별, 처음엔 꺼져 있다).
// API 키(종량제)를 쓰지 않는다 — 벽타기처럼 깃헙 Actions 가 클로드 구독 토큰으로 돌린다:
//   ① 봇이 질문을 비공개 저장소(ASK.REPO)의 ask/q-번호.json 으로 올리고
//   ② chatlog 의 ask-claude.yml 워크플로우를 깨우면
//   ③ 워크플로우가 클로드에게 물어 ask/a-번호.json 에 답을 적고
//   ④ 봇이 그 파일을 읽어 방에 보낸다 (먼저 말 걸기 = BotManager.getCurrentBot().send).
// ※ 철칙: 메시지 처리 흐름에서는 네트워크·대기를 절대 하지 않는다. ①~④는 전부 백그라운드 스레드에서 한다.
//   스레드를 못 만드는 앱이면 질문을 받지 않는다 (그 자리에서 돌리면 봇이 몇 분씩 멈춘다).
// ※ chatlog 는 공개 저장소라 질문·답을 거기 두지 않는다. 워크플로우 로그에도 내용은 찍지 않는다.
// ※ 깃헙 토큰은 폰에만 둔다 (관리자가 /클로드토큰 으로 넣는다). 필요한 권한:
//   ASK.REPO 의 Contents 읽기/쓰기 + ASK.WF_REPO 의 Actions 읽기/쓰기.
var ASK = {
    REPO: "limbj1218-cyber/cafe-watch",   // 질문·답을 두는 비공개 저장소
    DIR: "ask",
    WF_REPO: "limbj1218-cyber/chatlog",   // 워크플로우가 있는 저장소
    WF_FILE: "ask-claude.yml",
    WF_REF: "main",
    MAX_LEN: 500,          // 질문 최대 글자 수
    COOL_SEC: 60,          // 한 사람이 다시 물을 수 있기까지 (초)
    MAX_BUSY: 3,           // 동시에 기다리는 질문 수 (방 전체 합)
    DAILY_MAX: 50,         // 방마다 하루 질문 수
    FIRST_WAIT_MS: 40000,  // 워크플로우가 켜지는 데 걸리는 시간 — 그 전엔 읽어 봐야 없다
    POLL_MS: 10000,
    GIVE_UP_MS: 300000     // 5분 넘으면 포기
};
var ASK_TOKEN_FILE = BASE_DIR + "/claude_token.txt";
var askToken = "";
var askBusy = 0;
var askLastAt = {};        // "방|이름" → 마지막으로 물은 시각(ms)
var askDaily = {};         // 방 → { date, count }
var askLastErr = "";
var askAnswered = 0;
var askReplier = {};       // 방 → 마지막 replier (먼저 말 걸기가 안 되는 앱에서 대신 쓴다)

(function loadAskToken() {
    try {
        var t = fileRead(ASK_TOKEN_FILE);
        if (t) askToken = String(t).replace(/[\r\n\s]+/g, "");
    } catch (e) {}
})();

function askSleep(ms) {
    try { java.lang.Thread.sleep(ms); } catch (e) {}
}

/** 백그라운드 실행. 스레드를 못 만들면 false (그 자리에서 실행하지 않는다) */
function askRunAsync(fn) {
    var body = function () { try { fn(); } catch (e) { askLastErr = "스레드 오류: " + e; } };
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
    return false;
}

/** 깃헙 API → { code, body } */
function askHttp(method, url, bodyStr, accept) {
    var conn = new java.net.URL(url).openConnection();
    conn.setRequestMethod(method);
    conn.setRequestProperty("Authorization", "Bearer " + askToken);
    conn.setRequestProperty("Accept", accept || "application/vnd.github+json");
    conn.setRequestProperty("X-GitHub-Api-Version", "2022-11-28");
    conn.setRequestProperty("User-Agent", "chatbot-ask");
    conn.setConnectTimeout(15000);
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
        var line, first = true;
        while ((line = br.readLine()) !== null) { body += (first ? "" : "\n") + line; first = false; }
        br.close();
    }
    try { conn.disconnect(); } catch (e) {}
    return { code: code, body: body };
}

var ASK_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** UTF-8 → Base64 (깃헙 Contents API 는 내용을 Base64 로 받는다) */
function askBase64(str) {
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
        out += ASK_B64.charAt(b0 >> 2);
        out += ASK_B64.charAt(((b0 & 3) << 4) | (b1 < 0 ? 0 : b1 >> 4));
        out += b1 < 0 ? "=" : ASK_B64.charAt(((b1 & 15) << 2) | (b2 < 0 ? 0 : b2 >> 6));
        out += b2 < 0 ? "=" : ASK_B64.charAt(b2 & 63);
    }
    return out;
}

/** 방에 먼저 말 걸기 — 이 앱에서는 BotManager.getCurrentBot().send 만 된다 (카페봇에서 확인) */
function askSend(room, text) {
    try {
        if (typeof BotManager !== "undefined" && BotManager && BotManager.getCurrentBot) {
            var b = BotManager.getCurrentBot();
            if (b && typeof b.send === "function") { b.send(room, text); return true; }
        }
    } catch (e) {}
    try {
        if (typeof Api !== "undefined" && Api && Api.replyRoom) { Api.replyRoom(room, text); return true; }
    } catch (e) {}
    try {
        var r = askReplier[room];
        if (r && typeof r.reply === "function") { r.reply(text); return true; }
    } catch (e) {}
    askLastErr = "방에 보내지 못함 (먼저 말 걸기 불가)";
    return false;
}

function askContentsUrl(name) {
    return "https://api.github.com/repos/" + ASK.REPO + "/contents/" + ASK.DIR + "/" + name;
}

/** 백그라운드: 질문 올리기 → 워크플로우 깨우기 → 답 기다렸다 보내기 */
function askWork(job) {
    try {
        var put = askHttp("PUT", askContentsUrl("q-" + job.id + ".json"), JSON.stringify({
            message: "ask " + job.id,
            content: askBase64(JSON.stringify({
                id: job.id, room: job.room, sender: job.sender, question: job.question, at: job.at
            }))
        }));
        if (put.code !== 201 && put.code !== 200) {
            askLastErr = "질문 올리기 실패 (HTTP " + put.code + ")";
            askSend(job.room, "⚠️ 질문을 보내지 못했어요 (깃헙 " + put.code + ")\n관리자는 /클로드 로 상태를 확인해 주세요.");
            return;
        }
        var wf = askHttp("POST", "https://api.github.com/repos/" + ASK.WF_REPO +
            "/actions/workflows/" + ASK.WF_FILE + "/dispatches", JSON.stringify({ ref: ASK.WF_REF }));
        if (wf.code !== 204) {
            askLastErr = "워크플로우 깨우기 실패 (HTTP " + wf.code + ")";
            askSend(job.room, "⚠️ 클로드를 깨우지 못했어요 (깃헙 " + wf.code + ")\n관리자는 /클로드 로 상태를 확인해 주세요.");
            return;
        }

        askSleep(ASK.FIRST_WAIT_MS);
        var started = new Date().getTime();
        while (new Date().getTime() - started < ASK.GIVE_UP_MS) {
            var got = null;
            try {
                got = askHttp("GET", askContentsUrl("a-" + job.id + ".json") + "?t=" + new Date().getTime(),
                    null, "application/vnd.github.raw");
            } catch (ne) { got = null; }
            if (got && got.code === 200) {
                var a = null;
                try { a = JSON.parse(got.body); } catch (pe) {}
                if (a && a.ok && a.answer) {
                    askAnswered++;
                    var q = job.question.length > 40 ? job.question.substring(0, 40) + "…" : job.question;
                    askSend(job.room, "💬 " + job.sender + "님: " + q + "\n\n" + a.answer);
                } else {
                    askLastErr = "클로드 실행 실패" + (a && a.error ? " — " + a.error : "");
                    askSend(job.room, "⚠️ 클로드가 답하지 못했어요. 잠시 뒤에 다시 물어봐 주세요.");
                }
                return;
            }
            askSleep(ASK.POLL_MS);
        }
        askLastErr = "답 기다리다 포기 (" + (ASK.GIVE_UP_MS / 60000) + "분)";
        askSend(job.room, "⌛ 답이 너무 늦어져서 그만 기다렸어요. 잠시 뒤에 다시 물어봐 주세요.");
    } catch (e) {
        askLastErr = "오류: " + e;
        askSend(job.room, "⚠️ 클로드에게 묻다가 문제가 생겼어요. 잠시 뒤에 다시 물어봐 주세요.");
    } finally {
        askBusy = Math.max(0, askBusy - 1);
    }
}

function askStatus(room) {
    return "🤖 클로드 답변\n" +
        "이 방: " + (askOn[room] ? "켜짐 ✅" : "꺼짐 ⛔") + "\n" +
        "깃헙 토큰: " + (askToken ? "등록됨 ✅" : "없음 ❌ (/클로드토큰 으로 등록)") + "\n" +
        "기다리는 질문: " + askBusy + "개 · 답한 질문: " + askAnswered + "개" +
        (askLastErr ? "\n⚠️ 마지막 문제: " + askLastErr : "");
}

/** 클로드 관련 메시지면 답장 문구("" 이면 조용히 넘어감), 아니면 null */
function handleAsk(room, raw, sender, isGroupChat) {
    // ── 켜고 끄기 (관리자) — 관리자가 아니면 평소 대화로 보고 그냥 넘어간다 ──
    if (raw === ".." || raw === "...") {
        if (!isAdmin(sender)) return null;
        if (raw === "..") {
            askOn[room] = true;
            saveData();
            return "🤖 클로드 답변을 켰어요!\n점 하나 붙여서 물어보세요. 예) .오늘 저녁 뭐 먹지?\n(답은 1~2분 걸려요 · 끄려면 ...)" +
                (askToken ? "" : "\n⚠️ 아직 깃헙 토큰이 없어요 — /클로드토큰 으로 먼저 넣어 주세요.");
        }
        askOn[room] = false;
        saveData();
        return "😴 클로드 답변을 껐어요. (다시 켜려면 ..)";
    }

    // ── 토큰 등록 (관리자) ──
    if (raw === "/클로드토큰" || raw.indexOf("/클로드토큰 ") === 0) {
        if (!isAdmin(sender)) return "해당 명령어를 사용할 수 있는 권한이 없습니다.";
        var v = raw.substring(6).replace(/[\r\n\s]+/g, "");
        if (!v) return "🔐 깃헙 토큰: " + (askToken ? "등록됨 ✅" : "없음 ❌") +
            "\n사용법: /클로드토큰 <토큰>\n지우려면: /클로드토큰 삭제";
        if (v === "삭제") {
            askToken = "";
            fileWrite(ASK_TOKEN_FILE, "");
            return "🗑️ 깃헙 토큰을 지웠어요.";
        }
        if (v.indexOf("ghp_") !== 0 && v.indexOf("github_pat_") !== 0) {
            return "⛔ 토큰은 보통 ghp_ 또는 github_pat_ 로 시작해요.";
        }
        askToken = v;
        var saved = fileWrite(ASK_TOKEN_FILE, v);
        return "🔐 깃헙 토큰을 등록했어요 (" + v.length + "자)" +
            (saved ? "" : "\n⚠️ 파일 저장 실패 — 앱을 껐다 켜면 사라집니다") +
            (isGroupChat ? "\n⚠️ 단톡방이에요 — 방금 보낸 메시지를 꼭 삭제하세요!" : "");
    }

    if (raw === "/클로드") return askStatus(room);

    // ── 질문 ──
    if (!askOn[room]) return null;
    if (raw.charAt(0) !== "." || raw.charAt(1) === ".") return null;
    var question = raw.substring(1).trim();
    if (!question) return null;

    if (!askToken) return "⚠️ 깃헙 토큰이 없어서 물어볼 수 없어요. (관리자: /클로드토큰)";
    if (question.length > ASK.MAX_LEN) return "✂️ 질문이 너무 길어요. " + ASK.MAX_LEN + "자 안으로 줄여 주세요.";

    var now = new Date().getTime();
    var key = room + "|" + sender;
    if (askLastAt[key] && now - askLastAt[key] < ASK.COOL_SEC * 1000) {
        return "⏳ " + Math.ceil((ASK.COOL_SEC * 1000 - (now - askLastAt[key])) / 1000) + "초 뒤에 다시 물어봐 주세요.";
    }
    if (askBusy >= ASK.MAX_BUSY) return "🙏 지금 답을 기다리는 질문이 많아요. 조금 뒤에 물어봐 주세요.";
    var today = new Date().toDateString();
    if (!askDaily[room] || askDaily[room].date !== today) askDaily[room] = { date: today, count: 0 };
    if (askDaily[room].count >= ASK.DAILY_MAX) return "🌙 오늘은 질문을 다 썼어요 (방마다 하루 " + ASK.DAILY_MAX + "개). 내일 또 물어봐 주세요.";

    var d = new Date();
    function p2(n) { return (n < 10 ? "0" : "") + n; }
    var job = {
        id: d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + "-" + p2(d.getHours()) + p2(d.getMinutes()) +
            p2(d.getSeconds()) + "-" + Math.floor(Math.random() * 100000),
        room: room, sender: String(sender), question: question, at: d.toISOString()
    };
    askBusy++;
    if (!askRunAsync(function () { askWork(job); })) {
        askBusy--;
        askLastErr = "이 앱에서는 백그라운드 스레드를 만들 수 없음";
        return "⚠️ 이 앱에서는 클로드 답변을 쓸 수 없어요 (백그라운드 실행 불가).";
    }
    askLastAt[key] = now;
    askDaily[room].count++;
    return "🤔 클로드가 생각 중이에요… (1~2분 걸려요)";
}

// ═══════════════ 메시지 처리 ═══════════════

function response(room, msg, sender, isGroupChat, replier) {
    try {
        if (ROOMS.indexOf(room) === -1) return;

        var raw = String(msg).trim();         // 원문 (등록 명령어·할말은 이걸로)
        msg = raw.toLowerCase();
        var today = new Date().toDateString();
        var user;

        // 이 방에서 말한 사람 기록 (랭킹 집계용)
        if (!roomUsers[room]) roomUsers[room] = {};
        roomUsers[room][sender] = true;

        // ── 명령어 등록·삭제·목록 (누구나) ──
        var regReply = handleRegister(room, raw);
        if (regReply !== null) return replier.reply(regReply);

        // ── 재련값 지정 (관리자) ──
        var setReply = handleSetLevel(room, raw, sender);
        if (setReply !== null) return replier.reply(setReply);

        // ── 한 사람 재련 기록 지우기 (관리자) ──
        var resetReply = handleResetUser(room, raw, sender);
        if (resetReply !== null) return replier.reply(resetReply);

        // ── 방 전체 재련값 일괄 지정 (관리자) ──
        var allReply = handleSetAll(room, raw, sender);
        if (allReply !== null) return replier.reply(allReply);

        // ── 거짓말 탐지기 (누구나) ──
        var detectReply = handleDetect(raw);
        if (detectReply !== null) return replier.reply(detectReply);

        // ── ROX 경험치 추천 (누구나) ──
        var expReply = handleExp(raw);
        if (expReply !== null) return replier.reply(expReply);

        // ── 사용법 (누구나) ──
        if (raw === "/메뉴얼" || raw === "/매뉴얼") return replier.reply(MANUAL_TEXT);

        // ── 클로드 답변 (켜기 .. / 끄기 ... / 질문 .할말) ──
        askReplier[room] = replier;
        var askReply = handleAsk(room, raw, sender, isGroupChat);
        if (askReply !== null) return replier.reply(askReply);

        // ── 재련 시도 ──
        if (msg === "제련가즈아" || msg === "재련가즈아") {
            // 파괴된 장비는 수리 전까지 재련 불가 (횟수도 쓰지 않는다)
            if (broken[sender]) {
                if (!repairPrompt[sender]) {
                    repairPrompt[sender] = REPAIR_KEYWORDS[Math.floor(Math.random() * REPAIR_KEYWORDS.length)];
                    saveData();
                }
                return replier.reply(sender + "님, 장비가 파괴되어 재련을 할 수 없습니다. 수리를 원하시면 \"" +
                    repairPrompt[sender] + "\" 라고 외쳐주세요!");
            }

            if (!dailyLimit[sender] || dailyLimit[sender].date !== today) {
                dailyLimit[sender] = { count: 0, date: today };
            }

            if (dailyLimit[sender].count >= MAX_ATTEMPTS) {
                return replier.reply("오늘 할 수 있는 재련 기회를 모두 사용하셨습니다.");
            }

            if (!userData[sender]) userData[sender] = roomStart(room);

            var level = userData[sender];
            var prevLevel = level;
            var result = refine(level);
            var message = sender + "님, ";

            if (result === "성공") {
                level++;
                message += prevLevel + " → " + level + " 재련에 성공하셨습니다!";
            } else if (result === "유지") {
                message += prevLevel + " → " + level + " 재련에 실패하셨네요ㅜㅜ";
            } else if (result === "하락") {
                level = Math.max(1, level - 1);
                message += "재련에 실패하여 " + prevLevel + " → " + level + "로 하락되었습니다ㅠㅠ";
            } else {
                broken[sender] = true;
                delete repairPrompt[sender];
                message += prevLevel + " → " + level + " 재련에 실패하여 장비가 파괴되었습니다💥";
            }

            userData[sender] = level;
            dailyLimit[sender].count++;

            saveData();
            return replier.reply(message);
        }

        // ── 수리 ── (봇이 알려준 문구와 똑같이 외쳐야 한다)
        if (broken[sender] && repairPrompt[sender]) {
            if (msg === String(repairPrompt[sender]).toLowerCase()) {
                delete broken[sender];
                delete repairPrompt[sender];
                // 수리 보상: 오늘 재련 기회 +1 (쓴 횟수를 1 줄인다 — 아직 안 썼으면 오늘 3번이 된다)
                if (!dailyLimit[sender] || dailyLimit[sender].date !== today) {
                    dailyLimit[sender] = { count: 0, date: today };
                }
                dailyLimit[sender].count -= REPAIR_BONUS;
                saveData();
                var left = MAX_ATTEMPTS - dailyLimit[sender].count;
                return replier.reply(sender + "님 장비가 수리되어 재련을 하실 수 있습니다\n🎁 수리 보너스! 오늘 재련 기회 +" +
                    REPAIR_BONUS + " (남은 기회 " + left + "번)");
            }
            for (var k = 0; k < REPAIR_KEYWORDS.length; k++) {
                if (msg === REPAIR_KEYWORDS[k].toLowerCase()) {
                    return replier.reply(sender + "님, 잘못된 키워드를 입력하셨습니다. 다시 \"" +
                        repairPrompt[sender] + "\" 라고 외쳐주세요!");
                }
            }
        }

        // ── 랭킹 ──
        if (msg === "/랭킹") {
            var inRoom = roomUsers[room] || {};
            var arr = [];
            for (user in userData) {
                if (userData.hasOwnProperty(user) && inRoom[user]) arr.push([user, userData[user]]);
            }
            arr.sort(function (a, b) { return b[1] - a[1]; });

            var lines = [];
            for (var i = 0; i < arr.length; i++) {
                lines.push((i + 1) + ". " + arr[i][0] + ": " + arr[i][1] + "재련");
            }
            return replier.reply(lines.length
                ? "[재련 랭킹]\n" + lines.join("\n")
                : "현재 재련 기록이 없습니다.");
        }

        // ── 확률표 ──
        if (msg === "/확률") {
            var rows = [];
            for (var lv = 1; chances.hasOwnProperty(lv); lv++) {
                rows.push(lv + ": [" + chances[lv].join(", ") + "]");
            }
            return replier.reply("*[재련확률표]*\n[성공, 유지, 하락, 파괴]\n" + rows.join("\n"));
        }

        // ── 오늘 횟수 초기화 (관리자) ──
        if (msg === "/초기화") {
            if (!isAdmin(sender)) return replier.reply("해당 명령어를 사용할 수 있는 권한이 없습니다.");
            for (user in dailyLimit) {
                if (!dailyLimit.hasOwnProperty(user)) continue;
                dailyLimit[user].count = 0;
                dailyLimit[user].date = today;
            }
            saveData();
            return replier.reply("모든 사람의 재련 횟수가 초기화되었습니다!");
        }

        // ── 재련값 초기화 (관리자) ──
        if (msg === "/삭제") {
            if (!isAdmin(sender)) return replier.reply("해당 명령어를 사용할 수 있는 권한이 없습니다.");
            for (user in userData) {
                if (userData.hasOwnProperty(user)) userData[user] = 1;
            }
            broken = {};          // 재련값을 1로 돌리면 파괴 상태도 함께 푼다
            repairPrompt = {};
            delete startLevel[room];    // 방 시작 값도 1로
            saveData();
            return replier.reply("모든 유저의 재련값이 1으로 초기화되었습니다.");
        }

        // ── 등록된 명령어 응답 (메시지 전체가 일치할 때) ──
        var rc = custom[room];
        if (rc && rc.hasOwnProperty(raw)) return replier.reply(rc[raw]);

    } catch (e) {
        // 일반 대화 중에는 조용히 넘어간다 (명령어일 때만 알림)
        try {
            if (String(msg).indexOf("/") === 0) replier.reply("⚠️ 루나봇 오류: " + e);
        } catch (e2) {}
    }
}

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
