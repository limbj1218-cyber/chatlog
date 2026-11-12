/**
 * ═══════════════════════════════════════════════════════════
 *  사건봇 — "사건" 방 전용 재련(강화) 미니게임
 *
 *  ◆ 명령어
 *    제련가즈아 / 재련가즈아 → 재련 시도 (하루 2회)
 *    /랭킹                    → 이 방 참여자들의 재련 랭킹
 *    /등록 명령어 할말        → 명령어 등록 (누구나, /등록_명령어_할말 도 된다)
 *    /삭제 명령어             → 등록한 명령어 삭제 (누구나, /삭제_명령어 도 된다)
 *    /리스트                  → 등록된 명령어 목록
 *    /탐지 할말               → 거짓말 탐지기 (참·거짓·중립 무작위, 누구나)
 *    /경험치 레벨             → ROX 사냥터 추천 (그 레벨~+3 몬스터 중 경험치×마릿수 1등, 누구나)
 *    /메뉴얼 (/매뉴얼)        → 사용법 안내 (누구나)
 *    /닉변감지                → 대화명을 바꾼 사람 (처음 이름 → … → 지금 이름, 누구나)
 *    (몬스터 이름)            → 그 몬스터 카드의 부위·옵션 (띄어쓰기 무시, 영문 이름도 됨, 누구나)
 *    /카드 옵션               → 그 옵션이 붙은 카드 찾기 (예: /카드 풍속증가, 누구나)
 *    .질문                    → 클로드가 답한다 (관리자가 켰을 때, 답은 1~2분 뒤)
 *    .. / ...                 → 클로드 답변 켜기 / 끄기 (관리자)
 *    /클로드 /클로드토큰      → 클로드 상태 / 깃헙 토큰 등록 (토큰은 관리자)
 *    /지정_유저명_값          → 그 사람의 재련값을 값으로 바꾼다 (관리자)
 *    /초기화_유저명           → 그 사람의 재련 기록을 지운다 (관리자)
 *    /전부_값                 → 이 방 사람 모두의 재련값을 값으로 바꾼다 (관리자)
 *    /초기화 /삭제            → 관리자 전용
 *
 *  ◆ 제련봇(bot/제련봇.js)과는 완전히 별개다.
 *    - 방이 다르고(사건), 데이터 파일도 따로 쓰며, 파괴/수리 개념이 없다.
 *
 *  ◆ 호환성
 *    - 메신저봇R 신버전(API2) / 구버전(API1) / 다크토네이도 챗봇 모두 동작
 *    - FileStream(readJson/saveJson)이 없는 앱에서는 java.io + JSON 으로 자동 대체
 *    - 저장 폴더는 쓰기 가능한 곳을 자동 선택 (권한 없어도 앱 전용 폴더 사용)
 *    - 옛 경로(/sdcard/사건/Database.json)에 데이터가 있으면 자동으로 이어받음
 *
 *  ※ 안드로이드 Rhino 엔진 호환을 위해 ES5 문법만 사용한다.
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "사건봇";
var BOT_VER = "1112-24";

// ─────────────── 설정 (여기만 고치면 됨) ───────────────
var ROOMS = ["사건"];
var ADMINS = ["사업처임병진", "가이아✡", "가이어트"];   // 정확히 일치해야 관리자
// 추가 관리자 — 대화명에 이 낱말이 "들어 있기만" 하면 관리자 (2026-11-12 후파 추가).
// ※ 로더의 MY_ADMINS 가 ADMINS 를 덮어쓰므로, 로더를 다시 붙여넣지 않아도 되게 따로 둔다
var EXTRA_ADMIN_PARTS = ["후파"];
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
        cands.push(String(app.getFilesDir().getAbsolutePath()) + "/sageon");
    } catch (e) {}
    cands.push("/sdcard/사건");
    for (var i = 0; i < cands.length; i++) {
        try {
            if (fileWrite(cands[i] + "/write_test.txt", "ok") &&
                String(fileRead(cands[i] + "/write_test.txt")).indexOf("ok") === 0) return cands[i];
        } catch (e) {}
    }
    return "/sdcard/사건";
}

var BASE_DIR = pickBaseDir();
var DATA_FILE = BASE_DIR + "/Database.json";
var LEGACY_FILE = "/sdcard/사건/Database.json";   // 예전 경로 (데이터 이어받기용)

// ═══════════════ 데이터 ═══════════════
// roomUsers 는 원본에서 Set 이었지만, Rhino 호환을 위해 { 이름: true } 객체로 다룬다.
// 파일에는 원본과 같은 배열 형태로 저장하므로 기존 데이터와 호환된다.

if (typeof __SAGEON_DATA__ === "undefined") __SAGEON_DATA__ = null;

function loadData() {
    var raw = fileRead(DATA_FILE);
    if (!raw) raw = fileRead(LEGACY_FILE);

    var parsed = null;
    if (raw) {
        try { parsed = JSON.parse(raw); } catch (e) {}
    }
    if (!parsed && __SAGEON_DATA__) parsed = __SAGEON_DATA__;
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
        custom: parsed.custom || {},              // { 방: { 명령어: 할말 } } 등록 명령어
        askOn: parsed.askOn || {},                // { 방: true } 클로드 답변 켜짐
        startLevel: parsed.startLevel || {},      // { 방: 숫자 } 기록 없는 사람의 시작 재련값 (/전부_)
        people: parsed.people || {},              // { "#h:해시": { name: 최초 대화명, last: 최근 대화명 } } (절대 화면에 안 나감)
        roomUsers: rooms
    };
}

var store = loadData();
var userData = store.userData;
var dailyLimit = store.dailyLimit;
var roomUsers = store.roomUsers;
var custom = store.custom;
var askOn = store.askOn;
var startLevel = store.startLevel;
var people = store.people;

/** 이 방에서 기록 없는 사람이 시작하는 재련값 (/전부_ 로 정한다, 기본 1) */
function roomStart(room) {
    var v = Number(startLevel[room]);
    return v >= 1 ? v : 1;
}

function saveData() {
    var out = { userData: userData, dailyLimit: dailyLimit, roomUsers: {} };
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
    out.people = people;
    try { __SAGEON_DATA__ = out; } catch (e) {}       // 파일 저장이 막혀도 메모리에는 유지
    fileWrite(DATA_FILE, JSON.stringify(out));
}

// ═══════════════ 게임 규칙 ═══════════════

var chances = {
    1: [50, 50, 0],
    2: [33, 67, 0],
    3: [25, 75, 0],
    4: [25, 40, 25],
    5: [25, 40, 25],
    6: [20, 40, 25],
    7: [20, 40, 25],
    8: [20, 35, 30],
    9: [20, 35, 30],
    10: [20, 30, 30],
    11: [20, 30, 30],
    12: [20, 25, 30],
    13: [15, 20, 35],
    14: [15, 15, 35],
    15: [0, 0, 0]
};

function refine(level) {
    var row = chances[level] || [0, 0, 0];
    var success = row[0], keep = row[1];
    var rand = Math.random() * 100;
    if (rand < success) return "성공";
    if (rand < success + keep) return "유지";
    return "하락";
}

function isAdmin(sender) {
    for (var i = 0; i < ADMINS.length; i++) {
        if (ADMINS[i] === sender) return true;
    }
    for (var j = 0; j < EXTRA_ADMIN_PARTS.length; j++) {
        if (EXTRA_ADMIN_PARTS[j] && String(sender).indexOf(EXTRA_ADMIN_PARTS[j]) !== -1) return true;
    }
    return false;
}

// ═══════════════ 사람 구분 (2026-11-12) ═══════════════
// 기록은 대화명이 아니라 사람별 hash 로 묶는다 → 대화명을 바꿔 새 사람처럼 재련할 수 없다.
//   hash 는 로더(1112-1 이상)가 response 의 6번째 인자 who.hash 로 넘긴다 (메신저봇R API2 의 author.hash).
// ★ hash 는 절대 화면에 보여주지 않는다. 화면에는 그 사람이 처음 등록된 대화명(people[키].name)만 나온다.
//   대화명을 바꿔도 랭킹·재련 답장은 최초 대화명 그대로다 (사용자 요청).
// hash 가 없으면(옛 로더·구버전 앱) 예전처럼 대화명으로 묶는다.
// 기록 키: hash 가 있으면 HASH_PREFIX + hash, 없으면 대화명.
// 옛 기록(대화명 키)은 그 대화명으로 hash 와 함께 처음 나타날 때 hash 키로 옮긴다 (재련값·오늘 횟수·파괴·방 기록).
//   ※ 이미 다른 대화명으로 바꾼 뒤에 나타나면 옛 기록과 이어지지 않는다 (알 방법이 없다) → 관리자가 /초기화_옛이름 으로 정리.
var HASH_PREFIX = "#h:";
var CUR_USER_KEY = null;     // 지금 처리 중인 메시지를 보낸 사람 (클로드 답변 쿨다운·이름 표시용)
var CUR_USER_NAME = null;

function displayName(key) {
    var p = people[key];
    return p && p.name ? p.name : String(key);
}

// ※ 같은 메시지가 로더에 두 갈래(API1·API2)로 들어오고 로더는 먼저 온 것만 처리한다 (2026-11-12 실제로 겪음).
//   API1 로 먼저 오면 hash 가 없다 → 그 대화명을 최근에 쓴 hash 사람이 있으면 그 사람으로 본다 (keyByLastName).
//   그래도 대화명 기록이 따로 생겼으면, 그 사람이 hash 와 함께 나타날 때마다 hash 기록으로 합친다 (mergeNameInto).

function hasNameRecord(name) {
    if (userData.hasOwnProperty(name) || dailyLimit.hasOwnProperty(name)) return true;
    if (typeof broken !== "undefined" && broken.hasOwnProperty(name)) return true;
    for (var r in roomUsers) {
        if (roomUsers.hasOwnProperty(r) && roomUsers[r] && roomUsers[r][name]) return true;
    }
    return false;
}

/** 대화명 기록을 hash 기록으로 합친다 — 재련값은 높은 쪽, 오늘 횟수는 오늘 것 중 많이 쓴 쪽 */
function mergeNameInto(name, key) {
    if (userData.hasOwnProperty(name)) {
        if (!userData.hasOwnProperty(key) || Number(userData[name]) > Number(userData[key])) userData[key] = userData[name];
        delete userData[name];
    }
    if (dailyLimit.hasOwnProperty(name)) {
        var a = dailyLimit[name], b = dailyLimit[key], today = new Date().toDateString();
        if (!b) dailyLimit[key] = a;
        else if (a && a.date === today && (b.date !== today || Number(a.count) > Number(b.count))) dailyLimit[key] = a;
        delete dailyLimit[name];
    }
    if (typeof broken !== "undefined" && broken.hasOwnProperty(name)) {
        if (broken[name]) broken[key] = true;
        delete broken[name];
    }
    if (typeof repairPrompt !== "undefined" && repairPrompt.hasOwnProperty(name)) {
        if (!repairPrompt[key]) repairPrompt[key] = repairPrompt[name];
        delete repairPrompt[name];
    }
    for (var r in roomUsers) {
        if (roomUsers.hasOwnProperty(r) && roomUsers[r] && roomUsers[r][name]) {
            delete roomUsers[r][name];
            roomUsers[r][key] = true;
        }
    }
}

/** hash 없이 온 메시지 — 이 대화명을 가장 최근에 쓴 hash 사람의 키 (없으면 null) */
function keyByLastName(name) {
    var best = null, bestAt = -1;
    for (var k in people) {
        if (!people.hasOwnProperty(k) || people[k].last !== name) continue;
        var at = Number(people[k].at || 0);
        if (at > bestAt) { best = k; bestAt = at; }
    }
    return best;
}

/** 이 메시지를 보낸 사람의 기록 키 (처음 보는 hash 면 지금 대화명을 최초 대화명으로 등록) */
function userKeyOf(sender, who) {
    var name = String(sender);
    var h = "";
    try { h = who && who.hash ? String(who.hash) : ""; } catch (e) { h = ""; }
    if (!h || h === "null" || h === "undefined") return keyByLastName(name) || name;
    var key = HASH_PREFIX + h;
    var p = people[key], changed = false;
    if (!p) {
        p = people[key] = { name: name, last: name };
        changed = true;
    } else if (p.last !== name) {
        addNickHistory(p, name);
        p.last = name;
        changed = true;
    }
    if (changed) p.at = new Date().getTime();
    if (hasNameRecord(name)) { mergeNameInto(name, key); changed = true; }
    if (changed) saveData();
    return key;
}

// ═══════════════ 닉변 감지 (2026-11-12, 누구나) ═══════════════
// /닉변감지 → 이 방에서 대화명을 바꾼 사람을 "처음 이름 → … → 지금 이름" 으로 보여준다 (최근에 바꾼 사람부터).
// people[키].hist 에 바꾼 이름을 순서대로 남긴다 (최대 NICK_HIST_MAX 개, 첫 이름은 늘 남긴다).
// hist 가 생기기 전(사람 구분 첫날)의 사람은 처음 이름 → 지금 이름 만 보인다.
// ※ hash 는 절대 보이지 않는다. 사람 구분(hash)을 켠 뒤, 바꾼 이름으로 한 번이라도 말해야 잡힌다.
var NICK_HIST_MAX = 10;
var NICK_LIST_MAX = 30;

function addNickHistory(p, newName) {
    if (!p.hist || !p.hist.length) {
        p.hist = [p.name];
        if (p.last && p.last !== p.name) p.hist.push(p.last);
    }
    if (p.hist[p.hist.length - 1] !== newName) p.hist.push(newName);
    while (p.hist.length > NICK_HIST_MAX) p.hist.splice(1, 1);   // 첫 이름은 남기고 오래된 중간 이름부터 버린다
}

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
    var inRoom = roomUsers[room] || {};
    var rows = [];
    for (var k in people) {
        if (!people.hasOwnProperty(k) || !inRoom[k]) continue;
        var chain = nickChain(people[k]);
        if (chain.length >= 2) rows.push({ at: Number(people[k].at || 0), text: "• " + chain.join(" → ") });
    }
    if (!rows.length) return "🕵️ 닉변 감지\n아직 대화명을 바꾼 사람이 없어요.\n(사람 구분을 켠 뒤, 바꾼 이름으로 말한 사람부터 잡혀요)";
    rows.sort(function (a, b) { return b.at - a.at; });
    var lines = [];
    for (var i = 0; i < rows.length && i < NICK_LIST_MAX; i++) lines.push(rows[i].text);
    return "🕵️ 닉변 감지 (" + rows.length + "명)\n" + lines.join("\n") +
        (rows.length > NICK_LIST_MAX ? "\n… 외 " + (rows.length - NICK_LIST_MAX) + "명" : "");
}

/** 관리자가 친 이름 → 기록 키. 최초 대화명 → 최근 대화명 → 옛 대화명 기록 순서로 찾는다. 없으면 null */
function findUserKey(room, name) {
    var k;
    for (k in people) if (people.hasOwnProperty(k) && people[k].name === name) return k;
    for (k in people) if (people.hasOwnProperty(k) && people[k].last === name) return k;
    if (userData.hasOwnProperty(name) || dailyLimit.hasOwnProperty(name) ||
        (roomUsers[room] && roomUsers[room][name])) return name;
    return null;
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
    var key = findUserKey(room, name);
    if (key === null) {
        return "\"" + name + "\" 님을 찾을 수 없어요.\n이 방에서 말한 적 있는 대화명을 정확히 써 주세요.";
    }
    var inRoom = roomUsers[room] || {};
    var prev = userData[key] || roomStart(room);
    userData[key] = val;
    inRoom[key] = true;
    roomUsers[room] = inRoom;
    var unbroken = false;
    if (typeof broken !== "undefined" && broken[key]) {
        delete broken[key];
        if (typeof repairPrompt !== "undefined") delete repairPrompt[key];
        unbroken = true;
    }
    saveData();
    return "✏️ " + displayName(key) + "님의 재련값을 " + prev + " → " + val + "(으)로 바꿨습니다." +
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
    var key = findUserKey(room, name);
    var had = key !== null && (userData.hasOwnProperty(key) || dailyLimit.hasOwnProperty(key) ||
        (typeof broken !== "undefined" && broken.hasOwnProperty(key)));
    if (!had) return "\"" + name + "\" 님의 재련 기록이 없어요.\n대화명을 정확히 써 주세요.";
    var prev = userData[key];
    delete userData[key];
    delete dailyLimit[key];
    if (typeof broken !== "undefined") delete broken[key];
    if (typeof repairPrompt !== "undefined") delete repairPrompt[key];
    saveData();
    return "🧹 " + displayName(key) + "님의 재련 기록을 지웠습니다." + (prev ? " (" + prev + "재련)" : "") +
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
        || t.charAt(0) === "." || t.indexOf("/클로드") === 0 || t === "/닉변감지" || t.indexOf("/카드") === 0) return true;
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

    // 두 가지로 받는다 (2026-11-12): "/등록_명령어_할말" 그리고 밑줄 없이 "/등록 명령어 할말"
    //   띄어쓰기 쪽은 첫 낱말이 명령어, 나머지 전부가 할말 (명령어에 띄어쓰기가 있으면 밑줄 쪽을 쓴다)
    if (raw === "/등록" || raw.indexOf("/등록_") === 0 || /^\/등록\s/.test(raw)) {
        var trigger = "", text = "";
        if (raw.charAt(3) === "_") {
            var rest = raw.substring(4);
            var cut = rest.indexOf("_");
            trigger = cut === -1 ? "" : rest.substring(0, cut).trim();
            text = cut === -1 ? "" : rest.substring(cut + 1);
        } else {
            var sm = /^(\S+)\s+([\s\S]*)$/.exec(raw.substring(3).replace(/^\s+/, ""));
            trigger = sm ? sm[1] : "";
            text = sm ? sm[2] : "";
        }
        if (!trigger || !text.trim()) {
            return "형식: /등록 명령어 할말\n예) /등록 공지 오늘 8시에 모여요\n(명령어에 띄어쓰기가 있으면 /등록_명령어_할말)";
        }
        if (isReserved(trigger)) {
            return "\"" + trigger + "\" 은(는) 봇이 이미 쓰는 말이라 등록할 수 없습니다.";
        }
        if (list.hasOwnProperty(trigger)) {
            return "\"" + trigger + "\" 은(는) 이미 등록되어 있습니다.\n바꾸려면 /삭제 " + trigger + " 후 다시 등록해 주세요.";
        }
        list[trigger] = text;
        custom[room] = list;
        saveData();
        return "✅ \"" + trigger + "\" 등록 완료! 이제 " + trigger + " 라고 치면 답합니다.";
    }

    // 지우기도 "/삭제_명령어" 와 "/삭제 명령어" 둘 다. 그냥 "/삭제"(관리자 재련값 초기화)와는 겹치지 않는다
    if (raw.indexOf("/삭제_") === 0 || /^\/삭제\s/.test(raw)) {
        var name = raw.substring(3).replace(/^_/, "").trim();
        if (!name) return "형식: /삭제 명령어";
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
        if (!names.length) return "등록된 명령어가 없습니다.\n/등록 명령어 할말 로 누구나 넣을 수 있어요.";
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
[126,"레이스 데드",449,1346,2],
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
    "📖 사건봇 사용법",
    "",
    "⚔️ 재련 (하루 2번)",
    "재련가즈아 — 장비 재련. 성공하면 +1, 실패하면 그대로거나 1 내려가요",
    "/랭킹 — 이 방 재련 순위",
    "",
    "📝 명령어 등록 (누구나)",
    "/등록 명령어 할말 — 예) /등록 공지 오늘 8시에 모여요",
    "/삭제 명령어 — 등록한 명령어 지우기",
    "/리스트 — 등록된 명령어 보기",
    "",
    "🎲 놀이 (누구나)",
    "/탐지 할말 — 거짓말 탐지기 (참·거짓·중립)",
    "/경험치 레벨 — ROX 추천 몬스터 (예: /경험치 110)",
    "/닉변감지 — 대화명을 바꾼 사람 보기 (처음 이름 → 지금 이름)",
    "몬스터 이름 — 그 몬스터 카드 옵션 (예: 포링, 띄어쓰기 상관없음)",
    "/카드 옵션 — 그 옵션 카드 찾기 (예: /카드 풍속증가)",
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
    var key = room + "|" + (CUR_USER_KEY || sender);
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
        room: room, sender: String(CUR_USER_NAME || sender), question: question, at: d.toISOString()
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

// ═══════════════ 몬스터 카드 옵션 (2026-11-12, 누구나) ═══════════════
// 메시지 전체가 몬스터 이름이면(띄어쓰기·대소문자 무시) 그 몬스터 카드의 부위·옵션을 알려준다. 영문 이름도 받는다.
// "스네이크(보아)" 처럼 괄호가 붙은 이름은 괄호를 뺀 이름이 하나뿐일 때 그 이름으로도 받는다.
// 등록 명령어(/등록)·고정 응답이 같은 말이면 그쪽이 먼저다 (이건 맨 마지막에 본다).
// 데이터는 "ROX 몬스터 경험치표" 아티팩트(https://claude.ai/artifact/UDrTj3djzfp9sSe95D4x8p)의 카드 열을 그대로 옮긴 것.
//   카드 옵션은 영문 원문을 한글 용어로 옮긴 거라 게임 표기와 조금 다를 수 있다. 표를 고치면 여기도 다시 옮길 것.
// 형식: [한글 이름, 영문 이름, 레벨, 카드 부위, 카드 옵션]  (부위·옵션이 "" 면 아직 정보 없음)
var CARD_MONSTERS = [
["포링","Poring",1,"머리장식","ATK +60"],
["파브르","Fabre",2,"무기","ASPD +60"],
["푸파","Pupa",3,"걸칠것","Max HP +1,200"],
["루나틱","Lunatic",4,"머리장식","MATK +60"],
["페코페코 알","Pecopeco Egg",5,"무기","신속 +60"],
["픽키","Picky",6,"의상","Max HP +1,200"],
["드롭프스","Drops",7,"머리장식","DEF 관통 +60"],
["콘도르","Condor",8,"걸칠것","물리 대미지 감소 +60"],
["분노의 픽키","Picky (Shell)",9,"의상","DEF +60"],
["윌로우","Willow",10,"머리장식","MDEF 관통 +60"],
["로커","Rocker",11,"머리장식","물리 대미지 추가 +60"],
["촌촌","Chonchon",12,"신발","Max HP +1,200"],
["도둑벌레 알","Thief Bug Egg",13,"액세서리","ASPD +60"],
["만드라고라","Mandragora",14,"머리장식","마법 대미지 추가 +60"],
["도둑벌레","Thief Bug",15,"걸칠것","마법 대미지 감소 +60"],
["세비지 베베","Savage Bebe",16,"무기","MATK +30 / 마법 대미지 추가 +30"],
["퍼밀리어","Familiar",17,"무기","MATK +30 / MDEF 관통 +30"],
["데저트 울프 새끼","Baby Desert Wolf",18,"신발","MDEF +30 / 마법 대미지 감소 +30"],
["암컷 도둑벌레","Female Thief Bug",19,"무기","CRI +60"],
["포포링","Poporing",20,"액세서리","MDEF 관통 +60"],
["플랑크톤","Plankton",21,"무기","MATK +60"],
["호넷","Hornet",22,"무기","ATK +30 / 물리 대미지 추가 +30"],
["타로우","Tarou",23,"액세서리","신속 +60"],
["앰버나이트","Ambernite",24,"무기","ATK +30 / DEF 관통 +30"],
["수컷 도둑벌레","Male Thief Bug",25,"신발","DEF +30 / 물리 대미지 감소 +30"],
["스포아","Spore",26,"액세서리","DEF 관통 +60"],
["크리미","Creamy",27,"액세서리","물리 대미지 추가 +60"],
["포이즌 스포아","Poison Spore",28,"액세서리","마법 대미지 추가 +60"],
["스틸 촌촌","Steel Chonchon",29,"의상","MDEF +60"],
["드레인리어","Drainliar",30,"무기","ATK +60"],
["코코","Coco",31,"머리장식","MATK +120"],
["스타이너","Stainer",31,"머리장식","ATK +120"],
["더스티네스","Dustiness",32,"걸칠것","Max HP +4,800"],
["스모키","Smokie",32,"액세서리","ASPD +120"],
["로다 프로그","Roda Frog",33,"의상","DEF +120"],
["보컬","Vocal",33,"의상","Max HP +4,800"],
["카라멜","Caramel",34,"무기","MATK +60 / MDEF 관통 +60"],
["디노피시스","Dead Plankton",34,"머리장식","DEF 관통 +120"],
["쿠크레","Kukre",35,"액세서리","신속 +120"],
["좀비","Zombie",35,"신발","Max HP +4,800"],
["히드라","Hydra",36,"무기","MATK +120"],
["호른","Horn",36,"무기","ASPD +120"],
["마르틴","Martin",37,"머리장식","MDEF 관통 +120"],
["요요","Yoyo",37,"액세서리","DEF 관통 +120"],
["가이어스","Giearth",38,"머리장식","물리 대미지 추가 +240"],
["그리슬","Axe-Wielding Skeleton Pirate",38,"신발","DEF +60 / 물리 대미지 감소 +120"],
["파이어럿 스켈","Pirate Skeleton",39,"액세서리","MDEF 관통 +120"],
["티비아","Dagger-Wielding Skel Pirate",39,"무기","신속 +120"],
["헌터 플라이","Hunter Fly",40,"무기","ATK +60 / 물리 대미지 추가 +120"],
["스켈워커","Skeleton Worker",40,"무기","CRI +120"],
["위스퍼","Whisper",41,"걸칠것","마법 대미지 감소 +240"],
["미스트","Myst",41,"걸칠것","물리 대미지 감소 +240"],
["아르고스","Argos",42,"무기","ATK +60 / DEF 관통 +60"],
["무카","Muka",42,"액세서리","물리 대미지 추가 +240"],
["맨티스","Mantis",43,"액세서리","마법 대미지 추가 +240"],
["페코페코","Pecopeco",43,"무기","MDEF +60 / 마법 대미지 감소 +120"],
["메틀러","Metaller",44,"무기","ATK +120"],
["세비지","Savage",44,"의상","MDEF +120"],
["아나콘다크","Anacondaq",45,"머리장식","마법 대미지 추가 +240"],
["플로라","Flora",45,"무기","MATK +60 / 마법 대미지 추가 +120"],
["스콜피온","Scorpion",46,"무기","최종 ASPD +30%"],
["사스콰치","Sasquatch",46,"의상","Max HP +12%"],
["사이드 와인더","Side Winder",47,"무기","최종 신속 +3%"],
["고렘","Golem",47,"액세서리","최종 ASPD +30%"],
["개미 알","Ant Larva",48,"머리장식","ATK +6%"],
["백련옥","Magnolia",48,"무기","최종 CRI +6%"],
["마타","Matyr",49,"신발","Max HP +12%"],
["호드","Hode",49,"걸칠것","Max HP +12%"],
["앙드레","Andre",50,"무기","ATK +3% / 최종 DEF 관통 +3%"],
["데저트 울프","Desert Wolf",50,"무기","MATK +3% / 최종 마법 대미지 추가 +3%"],
["피에르","Piere",51,"머리장식","MATK +6%"],
["솔져 스켈레톤","Soldier Skeleton",51,"액세서리","최종 신속 +3%"],
["바돈","Vadon",52,"무기","ATK +3% / 최종 물리 대미지 추가 +3%"],
["아르지오프","Argiope",52,"의상","최종 DEF +6%"],
["마리나","Marina",53,"무기","ATK +6%"],
["아쳐 스켈레톤","Archer Skeleton",53,"무기","MATK +3% / 최종 MDEF 관통 +3%"],
["데니로","Deniro",54,"머리장식","최종 DEF 관통 +6%"],
["프릴도라","Frilldora",54,"걸칠것","최종 물리 대미지 감소 +6%"],
["비타타","Vitata",55,"액세서리","최종 DEF 관통 +6% / Lv.1 힐 사용 가능 (모든 스킬 SP 소모 +25%)"],
["커너투스","Cornutus",55,"신발","최종 DEF +3% / 최종 물리 대미지 감소 +3%"],
["휀","Phen",56,"액세서리","최종 MDEF 관통 +6%"],
["미이라","Mummy",56,"머리장식","최종 MDEF 관통 +6%"],
["베릿트","Verit",57,"머리장식","최종 마법 대미지 추가 +6%"],
["마르두크","Marduk",57,"머리장식","최종 물리 대미지 추가 +6%"],
["마린 스피어","Marine Sphere",58,"액세서리","최종 물리 대미지 추가 +6%"],
["이시스","Isis",58,"신발","최종 MDEF +3% / 최종 마법 대미지 감소 +3%"],
["소드피쉬","Swordfish",59,"의상","최종 MDEF +6%"],
["마이너 우로스","Minorous",59,"무기","MATK +6%"],
["마르스","Marse",60,"걸칠것","최종 마법 대미지 감소 +6%"],
["제롬","Zerom",60,"액세서리","최종 마법 대미지 추가 +6%"],
["아크라우스","Arclouze",61,"무기","수속성 강화 +10% / 풍속성 강화 +10%"],
["오본느","Obeaune",61,"액세서리","스턴 저항 +30%"],
["웜테일","Wormtail",62,"액세서리","동빙 저항 +30%"],
["레퀴엠","Requiem",62,"무기","지속성 강화 +10% / 화속성 강화 +10%"],
["스네이크(보아)","Snake",63,"무기","염속성 강화 +10% / 독속성 강화 +10%"],
["빅풋","Bigfoot",63,"무기","성속성 강화 +10% / 무속성 강화 +10%"],
["울프","Wolf",64,"무기","최종 ASPD +40%"],
["파사나","Pasana",64,"의상","무속성·암속성·풍속성 몬스터로부터 받는 대미지 -10%"],
["스켈레톤","Skeleton",65,"무기","대형 몬스터에 입히는 대미지 +10%"],
["아누비스","Anubis",65,"무기","최종 CRI +8%"],
["무낙","Munak",66,"무기","중형 몬스터에 입히는 대미지 +10%"],
["엘더 윌로우","Elder Willow",66,"머리장식","암흑 저항 +30%"],
["마르크","Marc",67,"의상","화속성·염속성·지속성 몬스터로부터 받는 대미지 -10%"],
["본건","Bongun",67,"액세서리","고정 저항 +30%"],
["도깨비","Dokebi",68,"의상","독속성·불사형·수속성 몬스터로부터 받는 대미지 -10%"],
["천하대장군","Greatest General",68,"액세서리","석화 저항 +30%"],
["데비어스","Deviace",69,"무기","소형 몬스터에 입히는 대미지 +10%"],
["소희","Sohee",69,"신발","대형 몬스터로부터 받는 대미지 -10%"],
["구미호","Nine Tail",70,"걸칠것","악마형·어패형·용족 몬스터로부터 받는 대미지 -10%"],
["에기라","Eggyra",70,"신발","중형 몬스터로부터 받는 대미지 -10%"],
["호롱","Horong",71,"액세서리","수면 저항 +30%"],
["고블린(플레일)","Flail-Wielding Goblin",71,"머리장식","저주 저항 +30%"],
["오크 베이비","Orc Baby",72,"액세서리","침묵 저항 +30%"],
["오크 좀비","Orc Zombie",72,"걸칠것","무형·인간형·식물형 몬스터로부터 받는 대미지 -10%"],
["고블린(모닝스타)","Mace-Wielding Goblin",73,"머리장식","독 저항 +30%"],
["코볼트(모닝스타)","Mace-Wielding Kobold",73,"머리장식","출혈 저항 +30%"],
["잭","Jakk",74,"걸칠것","곤충형·불사형·동물형 몬스터로부터 받는 대미지 -10%"],
["스켈레톤 제네럴","Skeleton General",74,"신발","소형 몬스터로부터 받는 대미지 -10%"],
["고블린(해머)","Hammer-Wielding Goblin",75,"머리장식","갑옷 훼손 저항 +30%"],
["오크 워리어","Orc Warrior",75,"머리장식","무기 훼손 저항 +30%"],
["코볼트(해머)","Hammer-Wielding Kobold",76,"액세서리","물리 흡혈 +10%"],
["오크 스켈레톤","Orc Skeleton",76,"무기","악마형 몬스터에 입히는 대미지 +12.5%"],
["고블린(도끼)","Axe-Wielding Goblin",77,"머리장식","변동 쿨타임 -2.5초"],
["구울","Ghoul",77,"머리장식","변동 캐스팅 -0.625초"],
["거대 위스퍼","Giant Whisper",78,"걸칠것","최종 물리 대미지 감소 +10%"],
["마리오네트","Marionet",78,"걸칠것","Max HP +20%"],
["고블린(단검)","Dagger-Wielding Goblin",79,"신발","Max HP +20%"],
["쁘띠","Ground Petite",79,"무기","무형 몬스터에 입히는 대미지 +12.5%"],
["바포메트 주니어","Baphomet Jr",80,"걸칠것","최종 마법 대미지 감소 +10%"],
["공중 쁘띠","Sky Petite",80,"의상","Max HP +20%"],
["고블린 아쳐","Goblin Archer",81,"무기","곤충형 몬스터에 입히는 대미지 +12.5%"],
["캐럿","Carat",81,"머리장식","치유량 +10%"],
["코볼트 아쳐","Kobold Archer",82,"무기","어패형 몬스터에 입히는 대미지 +12.5%"],
["레이드릭","Raydric",82,"신발","최종 DEF +5% / 최종 물리 대미지 감소 +5%"],
["데비루치","Deviruchi",83,"머리장식","받는 치유량 +10%"],
["오크 레이디","Orc Lady",83,"무기","인간형 몬스터에 입히는 대미지 +12.5%"],
["제노크","Zenorc",84,"무기","불사형 몬스터에 입히는 대미지 +12.5%"],
["피빛의 기사","Bloody Knight",84,"액세서리","CRI.DMG 추가 +20%"],
["고블린 스팀라이더","Goblin Steamrider",85,"무기","용족 몬스터에 입히는 대미지 +12.5%"],
["코볼트(도끼)","Axe-Wielding Kobold",85,"신발","최종 MDEF +5% / 최종 마법 대미지 감소 +5%"],
["하이오크","High Orc",86,"의상","최종 MDEF +10%"],
["메이저 우로스","Majoruros",86,"머리장식","5초마다 SP 회복 +5%"],
["나이트 메어","Nightmare",87,"머리장식","5초마다 HP 회복 +5%"],
["세이지 웜","Sageworm",87,"액세서리","물리 반사 +10%"],
["오크 아쳐","Orc Archer",88,"액세서리","마법 흡혈 +10%"],
["로터자이로","Rotar Zairo",88,"무기","동물형 몬스터에 입히는 대미지 +12.5%"],
["윈드고스트","Wind Ghost",89,"액세서리","마법 반사 +10%"],
["좀비 프리즈너","Zombie Prisoner",89,"무기","식물형 몬스터에 입히는 대미지 +12.5%"],
["레이쓰","Wraith",90,"액세서리","CRI.DMG 감소 +20%"],
["리비오","Rybio",90,"의상","최종 DEF +10%"],
["브릴라이트","Brilight",91,"의상","PVP 최종 물리 대미지 감소 +3.6% / PVP 상태이상 저항 +3.6%"],
["스팅","Sting",91,"무기","최종 ASPD +50%"],
["크램프","Cramp",92,"액세서리","지속성 강화 +15%"],
["인저스티스","Injustice",92,"신발","PVP 마법 대미지 감소 +360"],
["스켈 프리즈너","Skeleton Prisoner",93,"신발","PVP 물리 대미지 감소 +360"],
["바소리","Bathory",93,"의상","PVP 상태이상 감소 +3.6% / PVP 최종 마법 대미지 감소 +3.6%"],
["알람","Alarm",94,"머리장식","무속성 강화 +15%"],
["심연의 기사","Abysmal Knight",94,"무기","최종 신속 +5%"],
["레이드릭 아처","Raydric Archer",95,"무기","최종 CRI +10%"],
["펑크","Punk",95,"걸칠것","PVP 상태이상 감소 +3.6% / PVP 최종 물리 대미지 감소 +3.6%"],
["페노메나","Penomena",96,"액세서리","화속성 강화 +15%"],
["조커","Joker",96,"머리장식","독속성 강화 +15%"],
["다크 프레임","Dark Frame",97,"액세서리","수속성 강화 +15%"],
["이블 드루이드","Evil Druid",97,"무기","CRI.DMG 추가 +24%"],
["칼리츠버그","Khalitzburg",98,"무기","PVP 최종 물리 대미지 추가 +6%"],
["배회하는 자","Wanderer",98,"걸칠것","PVP 상태이상 저항 +3.6% / PVP 최종 마법 대미지 감소 +3.6%"],
["클락","Clock",99,"머리장식","성속성 강화 +15%"],
["지르타스","Zealotus",99,"액세서리","풍속성 강화 +15%"],
["펜다르크","Phendark",100,"무기","PVP 최종 마법 대미지 추가 +6%"],
["시계탑 관리자","Clock Tower Manager",100,"머리장식","염속성 강화 +15%"],
["트라이 조인트","Tri Joint",101,"무기","수속성 강화 +17.5% / 풍속성 강화 +17.5%"],
["레글러","Raggler",101,"신발","PVP 최종 마법 대미지 감소 +3.5% / Max HP +14%"],
["조개","Shellfish",102,"무기","지속성 강화 +17.5% / 화속성 강화 +17.5%"],
["타라 프로그","Thara Frog",102,"걸칠것","Max HP +14% / 최종 DEF +7%"],
["메갈로돈","Megalodon",103,"무기","성속성 강화 +17.5% / 무속성 강화 +17.5%"],
["해달","Sea Otter",103,"액세서리","스턴 저항 +33.6% / 저주 저항 +33.6%"],
["네레이드","Nereid",104,"머리장식","최종 물리 대미지 추가 +14%"],
["스템웜","Stem Worm",104,"액세서리","동빙 저항 +33.6% / 암흑 저항 +33.6%"],
["에스터","Aster",105,"무기","염속성 강화 +17.5% / 독속성 강화 +17.5%"],
["메갈리스","Megalith",105,"걸칠것","PVP 물리 대미지 감소 +420"],
["퍼씰","Seal",106,"무기","최종 DEF 관통 +14%"],
["엘리게이터","Alligator",106,"머리장식","치유량 +14%"],
["갈라파고","Galapago",107,"액세서리","최종 CRI +14%"],
["페스트","Pest",107,"의상","PVP 마법 대미지 감소 +420"],
["폭력배","Mobster",108,"머리장식","최종 CRI +7% / CRI.DMG 추가 +14%"],
["아놀리안","Anolian",108,"의상","Max HP +14% / 최종 MDEF +7%"],
["게","Crab",109,"무기","최종 MDEF 관통 +14%"],
["가고일","Gargoyle",109,"액세서리","물리 반사 +14%"],
["스터랙틱 고렘","Stalactic Golem",110,"머리장식","최종 마법 대미지 추가 +14%"],
["머맨","Merman",110,"신발","PVP 최종 물리 대미지 감소 +3.5% / Max HP +14%"],
["비틀 킹","Beetle King",111,"무기","물리 대미지 추가 +1,920 / PVP 물리 대미지 추가 +240"],
["쵸코","Choco",111,"걸칠것","동물형 몬스터에 입히는 대미지 +12% / 물리 대미지 감소 +1,536"],
["우든 골렘","Wooden Golem",112,"의상","5초마다 HP 회복 +2.4% / PVP 최종 물리 대미지 감소 +5.6%"],
["헬 푸들","Hell Poodle",112,"머리장식","ATK +16%"],
["래기드 좀비","Ragged Zombie",113,"머리장식","MATK +16%"],
["듀라한","Dullahan",113,"무기","마법 대미지 추가 +1,920 / PVP 마법 대미지 추가 +240"],
["드래곤 테일","Dragon Tail",114,"걸칠것","곤충형 몬스터에 입히는 대미지 +12% / 마법 대미지 감소 +1,536"],
["우탄 파이터","Wootan Fighter",114,"액세서리","화/독속성 몬스터에 입히는 대미지 +12%"],
["드라이어드","Dryad",115,"머리장식","최종 DEF 관통 +16%"],
["메두사","Medusa",115,"신발","석화 저항 +36% / Max HP +12%"],
["기벳","Gibbet",116,"액세서리","수/성속성 몬스터에 입히는 대미지 +12%"],
["밴시","Banshee",116,"액세서리","풍/암속성 몬스터에 입히는 대미지 +12%"],
["패러사이트","Parasite",117,"액세서리","지/염속성 몬스터에 입히는 대미지 +12%"],
["스톤 슈터","Stone Shooter",117,"무기","최종 물리 대미지 추가 +16%"],
["드릴러","Driller",118,"무기","최종 MDEF 관통 +8% / 마법 흡혈 +8%"],
["우탄 슈터","Wootan Shooter",118,"머리장식","최종 MDEF 관통 +16%"],
["플레임 스컬","Flame Skull",119,"무기","최종 물리 대미지 감소 +8% / 물리 반사 +8%"],
["로리 루리","Loli Ruri",119,"의상","5초마다 HP 회복 +2.4% / PVP 최종 마법 대미지 감소 +5.6%"],
["좀비 슬로터","Zombie Slaughter",120,"신발","불사형 몬스터에 입히는 대미지 +12% / 물리 대미지 감소 +1,536"],
["블러디 머더러","Bloody Murderer",120,"무기","CRI.DMG 추가 +16% / 물리 흡혈 +8%"],
["브리즈","Breeze",121,"",""],
["데몬 펑거스","Demon Pungus",121,"걸칠것","Max HP +20% / 화속성 저항 +37.5%"],
["멘블라트","Menblatt",122,"무기","물리 대미지 추가 +34%"],
["마린","Marin",122,"",""],
["지오그래퍼","Geographer",123,"신발","Max HP +20% / 풍속성 저항 +37.5%"],
["브라운 베나투","Brown Venatu",123,"무기","중형 몬스터에 입히는 대미지 +25%"],
["슬리퍼","Sleeper",124,"무기","마법 대미지 추가 +34%"],
["라플레시아","Rafflesia",124,"걸칠것","Max HP +20% / 독속성 저항 +37.5%"],
["템페스트 디미크","Tempest Dimik",125,"액세서리","상태이상 감소 +12.5 / 최종 마법 대미지 감소 +10%"],
["그랜드 페코","Grand Peco",125,"신발","Max HP +20% / 염속성 저항 +37.5%"],
["블루 베나투","Blue Venatu",126,"무기","소형 몬스터에 입히는 대미지 +25%"],
["고트","Goat",126,"무기","ATK +20%"],
["레이스 데드","Cursed Grave Keeper",126,"무기","대형 몬스터에 입히는 대미지 +25%"],
["오렌지 베나투","Orange Venatu",127,"액세서리","상태이상 관통 +12.5 / 최종 물리 대미지 추가 +10%"],
["선더링 디미크","Sundering Dimik",127,"머리장식","독속성 강화 +25% / 염속성 강화 +25%"],
["하피","Harpy",128,"무기","MATK +20%"],
["파이어리 디미크","Fiery Dimik",128,"머리장식","화속성 강화 +25% / 지속성 강화 +25%"],
["그린 베나투","Green Venatu",129,"액세서리","상태이상 관통 +12.5 / 최종 마법 대미지 추가 +10%"],
["프로스트 디미크","Frost Dimik",129,"머리장식","수속성 강화 +25% / 풍속성 강화 +25%"],
["아포칼립스","Apocalypse",130,"머리장식","성속성 강화 +25% / 무속성 강화 +25%"],
["나이트메어 이블 드루이드","Nightmare Evil Druid",130,"머리장식","암속성 강화 +25% / 불사속성 강화 +25%"],
["아크담","Archdam",130,"액세서리","상태이상 감소 +12.5 / 최종 물리 대미지 감소 +10%"],
["메탈링","Metaling",131,"",""],
["녹셔스","Noxious",131,"",""],
["포르셀리오","Porcellio",132,"",""],
["블레이저","Blazzer",132,"",""],
["베노무스","Venomous",133,"",""],
["익스플로전","Explosion",133,"",""],
["몰","Mole",134,"",""],
["옵시디언","Obsidian",134,"",""],
["운고리안트","Ungoliant",135,"",""],
["디아볼릭","Diabolic",135,"",""],
["어스 딜리터","Earth Deleter",136,"",""],
["미네랄","Mineral",136,"",""],
["지그","Gig",137,"",""],
["그리즐리","Grizzly",137,"",""],
["핏맨","Pitman",138,"",""],
["웨이스트 스토브","Waste Stove",138,"",""],
["스카이 딜리터","Sky Deleter",139,"",""],
["라바 골렘","Lava Golem",139,"",""],
["테디 베어","Teddy Bear",140,"",""],
["나이트메어 테러","Nightmare Terror",140,"",""],
["아노펠레스","Anopheles",141,"",""],
["물의 정령","Water Spirit",141,"",""],
["그렘린","Gremlin",142,"",""],
["로윈","Roween",142,"",""],
["시로마","Siroma",143,"",""],
["필라","Phylla",143,"",""],
["힐 윈드","Hill Wind",144,"",""],
["이스라","Isra",144,"",""],
["비홀더","Beholder",145,"",""],
["아이스 울프","Ice Wolf",145,"",""],
["가제티","Gazeti",146,"",""],
["반베르크","Vanberk",146,"",""],
["아이시클","Iceicle",147,"",""],
["드로세라","Drosera",147,"",""],
["시커","Seeker",148,"",""],
["스노이어","Snowier",148,"",""],
["에키오","Echio",149,"",""],
["호드렘린","Hodremlin",149,"",""],
["아가브","Agav",150,"",""],
["아이스 타이탄","Ice Titan",150,"",""],
["세실 디몬","Cecil Damon",151,"",""],
["마가레타 소린","Margaretha Sorin",152,"",""],
["하워드 알트아이젠","Howard Alt-Eisen",153,"",""],
["에레메스 가일","Eremes Guile",154,"",""],
["랜들","Randel",155,"",""],
["셀리아","Celia",156,"",""],
["트렌티니","Trentini",157,"",""],
["첸","Chen",158,"",""],
["플라멜","Flamel",159,"",""],
["거티","Gertie",160,"",""]
];

function cardKey(str) { return String(str).replace(/\s+/g, "").toLowerCase(); }

// 다른 이름으로도 찾기 — { 다른 이름: 지금 표의 이름 }
// 경험치표의 Lv.111 이상 한글 이름은 영문을 옮긴 것이라 게임 이름과 다를 수 있다. 게임 이름이 확인되면
// 표(CARD_MONSTERS·EXP_MONSTERS)는 게임 이름으로 고치고, 옛 이름은 여기 남겨 계속 찾히게 한다.
var CARD_ALIASES = {
    "저주받은 묘지기": "레이스 데드"     // 2026-11-12 사용자 확인: 게임 이름은 레이스 데드
};

var CARD_INDEX = (function () {
    var idx = {}, base = {}, i, k;
    for (i = 0; i < CARD_MONSTERS.length; i++) {
        idx[cardKey(CARD_MONSTERS[i][0])] = i;
        idx[cardKey(CARD_MONSTERS[i][1])] = i;
        var b = cardKey(String(CARD_MONSTERS[i][0]).replace(/\(.*?\)/g, ""));
        if (b !== cardKey(CARD_MONSTERS[i][0])) base[b] = base.hasOwnProperty(b) ? -1 : i;
    }
    for (k in base) if (base.hasOwnProperty(k) && base[k] >= 0 && !idx.hasOwnProperty(k)) idx[k] = base[k];
    for (k in CARD_ALIASES) {
        if (CARD_ALIASES.hasOwnProperty(k) && idx.hasOwnProperty(cardKey(CARD_ALIASES[k]))) idx[cardKey(k)] = idx[cardKey(CARD_ALIASES[k])];
    }
    return idx;
})();

/** 몬스터 이름이면 카드 안내, 아니면 null */
// ── 보기 좋게 (2026-11-12 사용자 요청: 시인성) — 부위마다 그림, 옵션은 한 줄에 하나씩 ──
var CARD_SLOT_ORDER = ["무기", "머리장식", "의상", "걸칠것", "신발", "액세서리"];
var CARD_SLOT_ICON = { "무기": "⚔️", "머리장식": "🎩", "의상": "👕", "걸칠것": "🧥", "신발": "👟", "액세서리": "💍" };
var CARD_LINE = "━━━━━━━━━━━━";

function cardSlotLabel(slot) {
    return (CARD_SLOT_ICON[slot] || "🃏") + " " + (slot || "부위 모름");
}

function cardOptionLines(opt, indent) {
    var segs = String(opt).split(" / "), out = [];
    for (var i = 0; i < segs.length; i++) out.push(indent + "· " + segs[i]);
    return out;
}

function handleCard(raw) {
    var k = cardKey(raw);
    if (!k || !CARD_INDEX.hasOwnProperty(k)) return null;
    var m = CARD_MONSTERS[CARD_INDEX[k]];
    var lines = ["🃏 " + m[0] + " 카드", "Lv." + m[2] + (m[4] ? "  |  " + cardSlotLabel(m[3]) : ""), CARD_LINE];
    if (!m[4]) lines.push("카드 정보가 아직 없어요.");
    else lines = lines.concat(cardOptionLines(m[4], ""));
    return lines.join("\n");
}

// ═══════════════ 옵션으로 카드 찾기 (2026-11-12, 누구나) ═══════════════
// /카드 풍속증가 → 카드 옵션에 "풍속" 이 들어간 카드를 부위·카드·옵션으로 보여준다 (레벨 낮은 순).
// · 띄어쓰기·대소문자 무시. "/카드풍속" 처럼 붙여 써도 된다.
// · "증가·강화·상승" 이 들어가거나 "업·up" 으로 끝나면 올려 주는 옵션만 남긴다 —
//   그 옵션 줄에 "저항·감소·받는·-" 가 있으면 뺀다 (풍속증가에 "풍속성 몬스터로부터 받는 대미지 -10%" 가 섞이지 않게).
// · 영문 키워드는 앞에 다른 영문자가 붙은 건 안 친다 (ATK 로 찾을 때 MATK 가 섞이지 않게).
// · 카드 옵션은 " / " 로 나뉜 줄마다 따로 본다. Lv.121 이상 일부는 카드 정보가 없어 안 나온다.
var CARD_SEARCH_MAX = 30;

function cardSegMatch(segKey, q) {
    var from = 0, at;
    while ((at = segKey.indexOf(q, from)) !== -1) {
        if (!/^[a-z]/.test(q) || at === 0 || !/[a-z]/.test(segKey.charAt(at - 1))) return true;
        from = at + 1;
    }
    return false;
}

/** /카드 명령이면 답장 문구, 아니면 null */
function handleCardSearch(raw) {
    if (raw.indexOf("/카드") !== 0) return null;
    var shown = raw.substring(3).replace(/^\s+|\s+$/g, "");
    var q = cardKey(shown);
    if (!q) return "형식: /카드 옵션\n예) /카드 풍속증가, /카드 ATK, /카드 MaxHP";
    var boost = /증가|강화|상승/.test(q) || /(업|up)$/.test(q);
    q = q.replace(/증가|강화|상승/g, "").replace(/(업|up)$/, "");
    if (!q) return "어떤 옵션인지 알려 주세요. 예) /카드 풍속증가";
    var hits = [];
    for (var i = 0; i < CARD_MONSTERS.length; i++) {
        var m = CARD_MONSTERS[i];
        if (!m[4]) continue;
        var segs = String(m[4]).split(" / "), found = false;
        for (var j = 0; j < segs.length && !found; j++) {
            var sk = cardKey(segs[j]);
            if (!cardSegMatch(sk, q)) continue;
            if (boost && /저항|감소|받는|-/.test(segs[j])) continue;
            found = true;
        }
        if (found) hits.push(m);
    }
    if (!hits.length) {
        return "🔎 \"" + shown + "\" 카드\n" + CARD_LINE + "\n찾는 옵션이 붙은 카드가 없어요.\n예) /카드 풍속증가 · /카드 ATK · /카드 MaxHP";
    }
    // 레벨 낮은 순으로 고른 뒤, 부위별로 묶어서 보여준다
    hits.sort(function (a, b) { return a[2] - b[2]; });
    var shownHits = hits.slice(0, CARD_SEARCH_MAX);
    var groups = {}, order = [], g, k;
    for (k = 0; k < shownHits.length; k++) {
        g = shownHits[k][3] || "";
        if (!groups.hasOwnProperty(g)) { groups[g] = []; order.push(g); }
        groups[g].push(shownHits[k]);
    }
    order.sort(function (a, b) {
        var ia = CARD_SLOT_ORDER.indexOf(a), ib = CARD_SLOT_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    var lines = ["🔎 \"" + shown + "\" 카드 · " + hits.length + "장", CARD_LINE];
    for (var o = 0; o < order.length; o++) {
        if (o > 0) lines.push("");
        lines.push(cardSlotLabel(order[o]));
        var list = groups[order[o]];
        for (var j = 0; j < list.length; j++) {
            lines.push(" ▸ " + list[j][0] + " (Lv." + list[j][2] + ")");
            lines = lines.concat(cardOptionLines(list[j][4], "    "));
        }
    }
    if (hits.length > CARD_SEARCH_MAX) lines.push("", "… 외 " + (hits.length - CARD_SEARCH_MAX) + "장 (더 자세히 써 주세요)");
    return lines.join("\n");
}

// ═══════════════ 메시지 처리 ═══════════════

function response(room, msg, sender, isGroupChat, replier, who) {
    try {
        if (ROOMS.indexOf(room) === -1) return;

        // 보낸 사람 — 기록은 uKey(사람), 화면엔 uName(최초 대화명). 관리자 검사(isAdmin)는 지금 대화명 그대로
        var uKey = userKeyOf(sender, who);
        var uName = displayName(uKey);
        CUR_USER_KEY = uKey;
        CUR_USER_NAME = uName;

        var raw = String(msg).trim();         // 원문 (등록 명령어·할말은 이걸로)
        msg = raw.toLowerCase();
        var today = new Date().toDateString();
        var user;

        // 이 방에서 말한 사람 기록 (랭킹 집계용)
        if (!roomUsers[room]) roomUsers[room] = {};
        roomUsers[room][uKey] = true;

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

        // ── 닉변 감지 (누구나) ──
        if (raw === "/닉변감지") return replier.reply(nickWatchText(room));

        // ── 옵션으로 카드 찾기 (누구나) ──
        var cardSearchReply = handleCardSearch(raw);
        if (cardSearchReply !== null) return replier.reply(cardSearchReply);

        // ── 클로드 답변 (켜기 .. / 끄기 ... / 질문 .할말) ──
        askReplier[room] = replier;
        var askReply = handleAsk(room, raw, sender, isGroupChat);
        if (askReply !== null) return replier.reply(askReply);

        // ── 재련 시도 ──
        if (msg === "제련가즈아" || msg === "재련가즈아") {
            if (!dailyLimit[uKey] || dailyLimit[uKey].date !== today) {
                dailyLimit[uKey] = { count: 0, date: today };
            }

            if (dailyLimit[uKey].count >= MAX_ATTEMPTS) {
                return replier.reply("오늘 할 수 있는 재련 기회를 모두 사용하셨습니다.");
            }

            if (!userData[uKey]) userData[uKey] = roomStart(room);

            var level = userData[uKey];
            var prevLevel = level;
            var result = refine(level);
            var message = uName + "님, ";

            if (result === "성공") {
                level++;
                message += prevLevel + " → " + level + " 재련에 성공하셨습니다!";
            } else if (result === "유지") {
                message += prevLevel + " → " + level + " 재련에 실패하셨네요ㅜㅜ";
            } else {
                level = Math.max(1, level - 1);
                message += "재련에 실패하여 " + prevLevel + " → " + level + "로 하락되었습니다ㅠㅠ";
            }

            userData[uKey] = level;
            dailyLimit[uKey].count++;

            saveData();
            return replier.reply(message);
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
                lines.push((i + 1) + ". " + displayName(arr[i][0]) + ": " + arr[i][1] + "재련");
            }
            return replier.reply(lines.length
                ? "[재련 랭킹]\n" + lines.join("\n")
                : "현재 재련 기록이 없습니다.");
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
            delete startLevel[room];    // 방 시작 값도 1로
            saveData();
            return replier.reply("모든 유저의 재련값이 1으로 초기화되었습니다.");
        }

        // ── 등록된 명령어 응답 (메시지 전체가 일치할 때) ──
        var rc = custom[room];
        if (rc && rc.hasOwnProperty(raw)) return replier.reply(rc[raw]);

        // ── 몬스터 카드 옵션 (메시지가 몬스터 이름이면, 맨 마지막) ──
        var cardReply = handleCard(raw);
        if (cardReply !== null) return replier.reply(cardReply);

    } catch (e) {
        // 일반 대화 중에는 조용히 넘어간다 (명령어일 때만 알림)
        try {
            if (String(msg).indexOf("/") === 0) replier.reply("⚠️ 사건봇 오류: " + e);
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
