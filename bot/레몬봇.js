/**
 * ═══════════════════════════════════════════════════════════
 *  레몬봇 — "레몬" 방 전용 재련(강화) 미니게임
 *
 *  ◆ 명령어
 *    제련가즈아 / 재련가즈아 → 재련 시도 (하루 2회)
 *    /랭킹                    → 이 방 참여자들의 재련 랭킹
 *    /확률                    → 단계별 [성공, 유지, 하락, 파괴] 확률표 (누구나)
 *    (수리 문구)              → 장비가 파괴되면 봇이 알려주는 문구를 그대로 외치면 복구
 *    /등록 명령어 할말        → 명령어 등록 (누구나, /등록_명령어_할말 도 된다)
 *    /삭제 명령어             → 등록한 명령어 삭제 (누구나, /삭제_명령어 도 된다)
 *    /리스트                  → 등록된 명령어 목록
 *    /탐지 할말               → 거짓말 탐지기 (참·거짓·중립 무작위, 누구나)
 *    /알림 22시50분 할말      → 그 시각부터 N분마다 알림 (/알림목록, /알림삭제 번호, 누구나)
 *    /경험치 레벨             → ROX 사냥터 추천 (그 레벨~+3 몬스터 중 경험치×마릿수 1등, 누구나)
 *    /메뉴얼 (/매뉴얼)        → 사용법 안내 (누구나)
 *    /닉변감지                → 대화명을 바꾼 사람 (처음 이름 → … → 지금 이름, 누구나)
 *    (몬스터 이름)            → 그 몬스터 카드의 부위·옵션 (띄어쓰기 무시, 영문 이름도 됨, 누구나)
 *    /카드 옵션               → 그 옵션이 붙은 카드 찾기 (예: /카드 풍속증가, 누구나)
 *    닉네임 (/닉네임)         → 한글 두 글자 닉네임 추천 (누구나)
 *    전생 [이름] (/전생)      → 이름 초성으로 전생 풀이 (이름 없으면 내 이름, 누구나)
 *    .질문                    → 클로드가 답한다 (관리자가 켰을 때, 답은 1~2분 뒤)
 *    .. / ...                 → 클로드 답변 켜기 / 끄기 (관리자)
 *    /클로드 /클로드토큰      → 클로드 상태 / 깃헙 토큰 등록 (토큰은 관리자)
 *    /지정_유저명_값          → 그 사람의 재련값을 값으로 바꾼다 (관리자)
 *    /초기화_유저명           → 그 사람의 재련 기록을 지운다 (관리자)
 *    /전부_값                 → 이 방 사람 모두의 재련값을 값으로 바꾼다 (관리자)
 *    /초기화 /삭제            → 관리자 전용 (대화명에 "후파"가 들어간 사람)
 *
 *  ◆ 루나봇(bot/루나봇.js)을 그대로 복사해 레몬 방용으로 따로 만든 봇이다 (2026-11-13, 기능 동일).
 *    - 방(레몬)·데이터 파일(lemon_Database.json)이 루나봇·사건봇과 따로다. 관리자는 루나와 같이 "후파".
 *    - 루나 방 전용 데이터 손질(ONE_TIME_FIXES)은 옮기지 않았다.
 *    - (아래는 루나봇에서 이어받은 설명)
 *    - 사건봇과 달리 파괴/수리가 있다 (제련봇 방식, 확률표도 제련봇과 같다).
 *      파괴되면 재련이 막히고, 그때 재련가즈아를 치면 수리 문구(REPAIR_KEYWORDS 7개 중 하나)를 알려준다. 수리하면 그날 재련 기회 +1.
 *      파괴·수리 문구는 파일에 저장하므로 봇을 다시 켜도 유지된다. 수리는 재련 횟수를 쓰지 않는다.
 *    - 사건봇과 같은 폰에서 함께 돌려도 기록이 섞이지 않는다.
 *    - 제련봇·사건봇·루나봇과 명령어(/랭킹 등)가 같으므로, 그 봇들 방 목록에 "레몬"을 넣지 말 것.
 *
 *  ◆ 호환성
 *    - 메신저봇R 신버전(API2) / 구버전(API1) / 다크토네이도 챗봇 모두 동작
 *    - FileStream(readJson/saveJson)이 없는 앱에서는 java.io + JSON 으로 자동 대체
 *    - 저장 폴더는 쓰기 가능한 곳을 자동 선택 (권한 없어도 앱 전용 폴더 사용)
 *
 *  ※ 안드로이드 Rhino 엔진 호환을 위해 ES5 문법만 사용한다.
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "레몬봇";
var BOT_VER = "1114-1";

// ─────────────── 설정 (여기만 고치면 됨) ───────────────
var ROOMS = ["레몬"];
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
        cands.push(String(app.getFilesDir().getAbsolutePath()) + "/lemon");
    } catch (e) {}
    cands.push("/sdcard/레몬");
    for (var i = 0; i < cands.length; i++) {
        try {
            if (fileWrite(cands[i] + "/lemon_write_test.txt", "ok") &&
                String(fileRead(cands[i] + "/lemon_write_test.txt")).indexOf("ok") === 0) return cands[i];
        } catch (e) {}
    }
    return "/sdcard/레몬";
}

var BASE_DIR = pickBaseDir();
// ※ 사건봇·루나봇과 같은 앱 폴더를 쓸 수 있으므로 파일 이름을 반드시 다르게 둔다
//   (Database.json 은 사건봇, luna_Database.json 은 루나봇 것)
var DATA_FILE = BASE_DIR + "/lemon_Database.json";

// ═══════════════ 데이터 ═══════════════
// roomUsers 는 원본에서 Set 이었지만, Rhino 호환을 위해 { 이름: true } 객체로 다룬다.
// 파일에는 원본과 같은 배열 형태로 저장하므로 기존 데이터와 호환된다.

if (typeof __LEMON_DATA__ === "undefined") __LEMON_DATA__ = null;

function loadData() {
    var raw = fileRead(DATA_FILE);

    var parsed = null;
    if (raw) {
        try { parsed = JSON.parse(raw); } catch (e) {}
    }
    if (!parsed && __LEMON_DATA__) parsed = __LEMON_DATA__;
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
        appliedFixes: parsed.appliedFixes || [],
        alarms: parsed.alarms || {},              // { 방: [ { h, m, text, every(분, 0=한 번), next(ms) } ] } 알림  // 한 번만 하는 데이터 손질 중 이미 한 것 (ONE_TIME_FIXES)
        people: parsed.people || {},              // { "#h:해시": { name: 최초 대화명, last: 최근 대화명 } } (절대 화면에 안 나감)
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
var people = store.people;
var appliedFixes = store.appliedFixes;
var alarms = store.alarms;

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
    out.people = people;
    out.appliedFixes = appliedFixes;
    out.alarms = alarms;
    try { __LEMON_DATA__ = out; } catch (e) {}       // 파일 저장이 막혀도 메모리에는 유지
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
var RESERVED = ["재련가즈아", "제련가즈아", "/재련가즈아", "/제련가즈아", "/랭킹", "/확률", "/초기화", "/삭제", "/리스트"];

// 고정 응답 — 폰 파일(등록분)과 달리 코드에 있어서 앱을 지우거나 폰을 바꿔도 남는다.
// 메시지 전체가 정확히 일치할 때만(앞뒤 공백만 무시) 답한다. 같은 이름은 /등록_ 으로 못 넣는다.
var FIXED_REPLIES = {
    // 루나봇의 고정 응답(퉤·ㅋ)은 루나 방 전용이라 넣지 않는다 (2026-11-13 사용자 요청).
    // 이 방에 고정 응답이 필요하면 "말": "대답" 으로 한 줄씩 넣는다.
};

function isReserved(trigger) {
    var t = trigger.toLowerCase();
    if (RESERVED.indexOf(t) !== -1) return true;
    if (typeof FIXED_REPLIES !== "undefined" && FIXED_REPLIES.hasOwnProperty(trigger)) return true;
    if (t.indexOf("/등록") === 0 || t.indexOf("/삭제") === 0 || t.indexOf("/탐지") === 0 || t.indexOf("/지정") === 0 || t.indexOf("/초기화") === 0 || t.indexOf("/전부") === 0 || t.indexOf("/경험치") === 0 || t === "/메뉴얼" || t === "/매뉴얼"
        || t.charAt(0) === "." || t.indexOf("/클로드") === 0 || t === "/닉변감지" || t.indexOf("/카드") === 0
        || t.indexOf("/알림") === 0 || t === "닉네임" || t === "/닉네임" || t.indexOf("전생") === 0 || t.indexOf("/전생") === 0) return true;
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
    "📖 레몬봇 사용법",
    "",
    "⚔️ 재련 (하루 2번)",
    "재련가즈아 — 장비 재련. 성공하면 +1, 실패하면 그대로거나 1 내려가요",
    "(제련가즈아 · /재련가즈아 로 쳐도 돼요)",
    "4단계부터는 파괴될 수도 있어요 💥",
    "/확률 — 단계별 성공·유지·하락·파괴 확률",
    "/랭킹 — 이 방 재련 순위",
    "",
    "🛠️ 파괴됐을 때",
    "재련가즈아를 치면 수리 문구를 알려줘요. 그 문구를 그대로 외치면 복구!",
    "수리하면 오늘 재련 기회 +1 🎁",
    "",
    "📝 명령어 등록 (누구나)",
    "/등록 명령어 할말 — 예) /등록 공지 오늘 8시에 모여요",
    "/삭제 명령어 — 등록한 명령어 지우기",
    "/리스트 — 등록된 명령어 보기",
    "",
    "⏰ 알림 (누구나)",
    "/알림 22시50분 할말 — 그 시각에 알려줘요 (몇 분마다 반복할지 물어봐요)",
    "/알림목록 — 이 방 알림 보기",
    "/알림삭제 번호 — 알림 지우기 (/알림삭제 전부)",
    "",
    "🎲 놀이 (누구나)",
    "/탐지 할말 — 거짓말 탐지기 (참·거짓·중립)",
    "/전생 이름 — 이름으로 보는 전생 (이름 빼면 내 이름)",
    "/닉네임 — 두 글자 닉네임 추천",
    "/닉변감지 — 대화명을 바꾼 사람 보기 (처음 이름 → 지금 이름)",
    "",
    "🗺️ ROX 정보 (누구나)",
    "/경험치 레벨 — 추천 사냥 몬스터 (예: /경험치 110)",
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
    return "🤔 생각 중이에요… (1~2분 걸려요)";
}

// ═══════════════ 한 번만 하는 데이터 손질 (관리자 요청) ═══════════════
// 방에 명령을 치지 않고 재련 기록을 바로잡을 때 쓴다 — 업데이트 뒤 그 방에 첫 메시지가 올 때 조용히 한 번만 적용하고
// appliedFixes 에 id 를 남겨 다시 하지 않는다. 방에는 아무 말도 하지 않는다.
// ★ 이 본체는 설명서를 보고 다른 사람도 받아 쓰므로, 엉뚱한 봇의 데이터를 지우지 않게
//   ① 그 방(fx.room)에 메시지가 왔을 때만 ② 랭킹 이름 중 3명 이상을 이 봇이 알고 있을 때만 적용한다.
// 이름은 랭킹에 보이는 대화명 그대로. hash 로 묶인 사람이면 그 사람(최초·최근 대화명으로 찾음)에게 넣고 표시 이름도 이 이름으로 맞춘다.
// ※ 오늘 쓴 재련 횟수(dailyLimit)는 건드리지 않는다 — 횟수가 갑자기 다시 생기면 사람들이 눈치챈다.
var ONE_TIME_FIXES = [
    // 레몬 방에서 조용히 손질할 일이 생기면 여기에 새 id 로 넣는다 (루나봇의 항목 형식 참고)
];

function fixKeyFor(name) {
    var k;
    for (k in people) if (people.hasOwnProperty(k) && people[k].name === name) return k;
    for (k in people) if (people.hasOwnProperty(k) && people[k].last === name) return k;
    return name;
}

/** 이 봇이 아는 이름인가 (말한 적 있음·재련 기록·hash 사람의 최초/최근 대화명) */
function fixKnowsName(room, name) {
    if (fixKeyFor(name) !== name) return true;
    return userData.hasOwnProperty(name) || !!(roomUsers[room] && roomUsers[room][name]);
}

/** 랭킹에 보이는 이름 from 을 to 로 바꾼다 (재련값·오늘 횟수·파괴는 from 쪽 그대로). 한 일이 있으면 true
 *  · hash 사람이면 화면 이름(people.name)만 to 로 바꾼다
 *  · 대화명 기록이면 기록을 to 이름으로 옮긴다
 *  · to 이름의 대화명 기록이 따로 있으면(같은 사람의 옛 기록) 랭킹에 둘이 뜨지 않게 이 사람 쪽으로 합치고 재련값은 from 것을 남긴다 */
function renameForFix(room, from, to) {
    if (!fixKnowsName(room, from)) return false;
    var key = fixKeyFor(from);
    var keep = userData.hasOwnProperty(key) ? userData[key] : null;
    if (key !== from || people[key]) {
        // hash 사람
        if (key !== to && !people[to] && hasNameRecord(to)) mergeNameInto(to, key);
        if (keep !== null) userData[key] = keep;
        people[key].name = to;
        return true;
    }
    // 대화명 기록 → to 이름으로 옮김 (to 쪽에 남은 기록이 있으면 from 쪽 값이 이긴다)
    var objs = [userData, dailyLimit];
    if (typeof broken !== "undefined") objs.push(broken);
    if (typeof repairPrompt !== "undefined") objs.push(repairPrompt);
    for (var i = 0; i < objs.length; i++) {
        if (objs[i].hasOwnProperty(from)) { objs[i][to] = objs[i][from]; delete objs[i][from]; }
    }
    for (var r in roomUsers) {
        if (roomUsers.hasOwnProperty(r) && roomUsers[r] && roomUsers[r][from]) {
            delete roomUsers[r][from];
            roomUsers[r][to] = true;
        }
    }
    return true;
}

function applyOneTimeFixes(room) {
    var changed = false;
    for (var i = 0; i < ONE_TIME_FIXES.length; i++) {
        var fx = ONE_TIME_FIXES[i];
        if (fx.room !== room || appliedFixes.indexOf(fx.id) !== -1) continue;
        if (fx.renames) {
            // 이름 바꾸기 — 바꿀 이름을 이 봇이 알 때만 (모르면 다음 메시지 때 다시 본다)
            var did = false;
            for (var rn = 0; rn < fx.renames.length; rn++) {
                if (renameForFix(room, fx.renames[rn][0], fx.renames[rn][1])) did = true;
            }
            if (!did) continue;
            appliedFixes.push(fx.id);
            changed = true;
            continue;
        }
        var known = 0;
        for (var n = 0; n < fx.levels.length; n++) if (fixKnowsName(room, fx.levels[n][0])) known++;
        if (known < 3) continue;   // 이 방 사람들이 아니다 — 건드리지 않는다
        if (fx.wipe) {
            // 재련값·파괴 상태 전부 삭제 (이 봇은 한 방 전용이라 전체를 지운다)
            var k;
            for (k in userData) if (userData.hasOwnProperty(k)) delete userData[k];
            for (k in broken) if (broken.hasOwnProperty(k)) delete broken[k];
            for (k in repairPrompt) if (repairPrompt.hasOwnProperty(k)) delete repairPrompt[k];
        }
        if (!roomUsers[fx.room]) roomUsers[fx.room] = {};
        for (var j = 0; j < fx.levels.length; j++) {
            var name = fx.levels[j][0], key = fixKeyFor(name);
            userData[key] = fx.levels[j][1];
            roomUsers[fx.room][key] = true;
            if (people[key]) people[key].name = name;   // 화면 이름도 랭킹에 적힌 이름으로
        }
        appliedFixes.push(fx.id);
        changed = true;
    }
    if (changed) saveData();
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

// ═══════════════ 닉네임 추천 (2026-11-13, 누구나) ═══════════════
// "닉네임" 또는 "/닉네임" → 한글 완성형 2350자(KS X 1001, 사용자가 준 목록과 같다) 중 두 글자를 무작위로 골라
// "00님은 00이라는 이름이 잘 어울리시네요" 로 답한다. 칠 때마다 바뀐다. 부르는 이름은 최초 대화명(사람 구분 기준).
// 받침이 없으면 "이라는" 대신 "라는" 으로 붙인다 (예: 가나라는 / 각난이라는).
var NICK_SYLLABLES =
    "가각간갇갈갉갊감갑값갓갔강갖갗같갚갛개객갠갤갬갭갯갰갱갸갹갼걀걋걍걔걘걜거걱건걷걸걺검겁것겄겅겆겉겊겋게겐겔겜겝겟겠겡겨격겪견겯결겸겹겻겼경곁계곈곌곕곗고곡곤곧골곪곬곯곰곱곳공곶과곽관괄괆괌괍괏광괘괜" +
    "괠괩괬괭괴괵괸괼굄굅굇굉교굔굘굡굣구국군굳굴굵굶굻굼굽굿궁궂궈궉권궐궜궝궤궷귀귁귄귈귐귑귓규균귤그극근귿글긁금급긋긍긔기긱긴긷길긺김깁깃깅깆깊까깍깎깐깔깖깜깝깟깠깡깥깨깩깬깰깸깹깻깼깽꺄꺅꺌꺼꺽꺾껀껄" +
    "껌껍껏껐껑께껙껜껨껫껭껴껸껼꼇꼈꼍꼐꼬꼭꼰꼲꼴꼼꼽꼿꽁꽂꽃꽈꽉꽐꽜꽝꽤꽥꽹꾀꾄꾈꾐꾑꾕꾜꾸꾹꾼꿀꿇꿈꿉꿋꿍꿎꿔꿜꿨꿩꿰꿱꿴꿸뀀뀁뀄뀌뀐뀔뀜뀝뀨끄끅끈끊끌끎끓끔끕끗끙끝끼끽낀낄낌낍낏낑나낙낚난낟날낡낢남" +
    "납낫났낭낮낯낱낳내낵낸낼냄냅냇냈냉냐냑냔냘냠냥너넉넋넌널넒넓넘넙넛넜넝넣네넥넨넬넴넵넷넸넹녀녁년녈념녑녔녕녘녜녠노녹논놀놂놈놉놋농높놓놔놘놜놨뇌뇐뇔뇜뇝뇟뇨뇩뇬뇰뇹뇻뇽누눅눈눋눌눔눕눗눙눠눴눼뉘뉜뉠뉨" +
    "뉩뉴뉵뉼늄늅늉느늑는늘늙늚늠늡늣능늦늪늬늰늴니닉닌닐닒님닙닛닝닢다닥닦단닫달닭닮닯닳담답닷닸당닺닻닿대댁댄댈댐댑댓댔댕댜더덕덖던덛덜덞덟덤덥덧덩덫덮데덱덴델뎀뎁뎃뎄뎅뎌뎐뎔뎠뎡뎨뎬도독돈돋돌돎돐돔돕돗" +
    "동돛돝돠돤돨돼됐되된될됨됩됫됴두둑둔둘둠둡둣둥둬뒀뒈뒝뒤뒨뒬뒵뒷뒹듀듄듈듐듕드득든듣들듦듬듭듯등듸디딕딘딛딜딤딥딧딨딩딪따딱딴딸땀땁땃땄땅땋때땍땐땔땜땝땟땠땡떠떡떤떨떪떫떰떱떳떴떵떻떼떽뗀뗄뗌뗍뗏뗐뗑" +
    "뗘뗬또똑똔똘똥똬똴뙈뙤뙨뚜뚝뚠뚤뚫뚬뚱뛔뛰뛴뛸뜀뜁뜅뜨뜩뜬뜯뜰뜸뜹뜻띄띈띌띔띕띠띤띨띰띱띳띵라락란랄람랍랏랐랑랒랖랗래랙랜랠램랩랫랬랭랴략랸럇량러럭런럴럼럽럿렀렁렇레렉렌렐렘렙렛렝려력련렬렴렵렷렸령례" +
    "롄롑롓로록론롤롬롭롯롱롸롼뢍뢨뢰뢴뢸룀룁룃룅료룐룔룝룟룡루룩룬룰룸룹룻룽뤄뤘뤠뤼뤽륀륄륌륏륑류륙륜률륨륩륫륭르륵른를름릅릇릉릊릍릎리릭린릴림립릿링마막만많맏말맑맒맘맙맛망맞맡맣매맥맨맬맴맵맷맸맹맺먀먁" +
    "먈먕머먹먼멀멂멈멉멋멍멎멓메멕멘멜멤멥멧멨멩며멱면멸몃몄명몇몌모목몫몬몰몲몸몹못몽뫄뫈뫘뫙뫼묀묄묍묏묑묘묜묠묩묫무묵묶문묻물묽묾뭄뭅뭇뭉뭍뭏뭐뭔뭘뭡뭣뭬뮈뮌뮐뮤뮨뮬뮴뮷므믄믈믐믓미믹민믿밀밂밈밉밋밌밍" +
    "및밑바박밖밗반받발밝밞밟밤밥밧방밭배백밴밸뱀뱁뱃뱄뱅뱉뱌뱍뱐뱝버벅번벋벌벎범법벗벙벚베벡벤벧벨벰벱벳벴벵벼벽변별볍볏볐병볕볘볜보복볶본볼봄봅봇봉봐봔봤봬뵀뵈뵉뵌뵐뵘뵙뵤뵨부북분붇불붉붊붐붑붓붕붙붚붜붤" +
    "붰붸뷔뷕뷘뷜뷩뷰뷴뷸븀븃븅브븍븐블븜븝븟비빅빈빌빎빔빕빗빙빚빛빠빡빤빨빪빰빱빳빴빵빻빼빽뺀뺄뺌뺍뺏뺐뺑뺘뺙뺨뻐뻑뻔뻗뻘뻠뻣뻤뻥뻬뼁뼈뼉뼘뼙뼛뼜뼝뽀뽁뽄뽈뽐뽑뽕뾔뾰뿅뿌뿍뿐뿔뿜뿟뿡쀼쁑쁘쁜쁠쁨쁩삐삑삔삘" +
    "삠삡삣삥사삭삯산삳살삵삶삼삽삿샀상샅새색샌샐샘샙샛샜생샤샥샨샬샴샵샷샹섀섄섈섐섕서석섞섟선섣설섦섧섬섭섯섰성섶세섹센셀셈셉셋셌셍셔셕션셜셤셥셧셨셩셰셴셸솅소속솎손솔솖솜솝솟송솥솨솩솬솰솽쇄쇈쇌쇔쇗쇘쇠" +
    "쇤쇨쇰쇱쇳쇼쇽숀숄숌숍숏숑수숙순숟술숨숩숫숭숯숱숲숴쉈쉐쉑쉔쉘쉠쉥쉬쉭쉰쉴쉼쉽쉿슁슈슉슐슘슛슝스슥슨슬슭슴습슷승시식신싣실싫심십싯싱싶싸싹싻싼쌀쌈쌉쌌쌍쌓쌔쌕쌘쌜쌤쌥쌨쌩썅써썩썬썰썲썸썹썼썽쎄쎈쎌쏀쏘" +
    "쏙쏜쏟쏠쏢쏨쏩쏭쏴쏵쏸쐈쐐쐤쐬쐰쐴쐼쐽쑈쑤쑥쑨쑬쑴쑵쑹쒀쒔쒜쒸쒼쓩쓰쓱쓴쓸쓺쓿씀씁씌씐씔씜씨씩씬씰씸씹씻씽아악안앉않알앍앎앓암압앗았앙앝앞애액앤앨앰앱앳앴앵야약얀얄얇얌얍얏양얕얗얘얜얠얩어억언얹얻얼얽" +
    "얾엄업없엇었엉엊엌엎에엑엔엘엠엡엣엥여역엮연열엶엷염엽엾엿였영옅옆옇예옌옐옘옙옛옜오옥온올옭옮옰옳옴옵옷옹옻와왁완왈왐왑왓왔왕왜왝왠왬왯왱외왹왼욀욈욉욋욍요욕욘욜욤욥욧용우욱운울욹욺움웁웃웅워웍원월웜" +
    "웝웠웡웨웩웬웰웸웹웽위윅윈윌윔윕윗윙유육윤율윰윱윳융윷으윽은을읊음읍읏응읒읓읔읕읖읗의읜읠읨읫이익인일읽읾잃임입잇있잉잊잎자작잔잖잗잘잚잠잡잣잤장잦재잭잰잴잼잽잿쟀쟁쟈쟉쟌쟎쟐쟘쟝쟤쟨쟬저적전절젊점접" +
    "젓정젖제젝젠젤젬젭젯젱져젼졀졈졉졌졍졔조족존졸졺좀좁좃종좆좇좋좌좍좔좝좟좡좨좼좽죄죈죌죔죕죗죙죠죡죤죵주죽준줄줅줆줌줍줏중줘줬줴쥐쥑쥔쥘쥠쥡쥣쥬쥰쥴쥼즈즉즌즐즘즙즛증지직진짇질짊짐집짓징짖짙짚짜짝짠짢" +
    "짤짧짬짭짯짰짱째짹짼쨀쨈쨉쨋쨌쨍쨔쨘쨩쩌쩍쩐쩔쩜쩝쩟쩠쩡쩨쩽쪄쪘쪼쪽쫀쫄쫌쫍쫏쫑쫓쫘쫙쫠쫬쫴쬈쬐쬔쬘쬠쬡쭁쭈쭉쭌쭐쭘쭙쭝쭤쭸쭹쮜쮸쯔쯤쯧쯩찌찍찐찔찜찝찡찢찧차착찬찮찰참찹찻찼창찾채책챈챌챔챕챗챘챙챠챤" +
    "챦챨챰챵처척천철첨첩첫첬청체첵첸첼쳄쳅쳇쳉쳐쳔쳤쳬쳰촁초촉촌촐촘촙촛총촤촨촬촹최쵠쵤쵬쵭쵯쵱쵸춈추축춘출춤춥춧충춰췄췌췐취췬췰췸췹췻췽츄츈츌츔츙츠측츤츨츰츱츳층치칙친칟칠칡침칩칫칭카칵칸칼캄캅캇캉캐캑" +
    "캔캘캠캡캣캤캥캬캭컁커컥컨컫컬컴컵컷컸컹케켁켄켈켐켑켓켕켜켠켤켬켭켯켰켱켸코콕콘콜콤콥콧콩콰콱콴콸쾀쾅쾌쾡쾨쾰쿄쿠쿡쿤쿨쿰쿱쿳쿵쿼퀀퀄퀑퀘퀭퀴퀵퀸퀼큄큅큇큉큐큔큘큠크큭큰클큼큽킁키킥킨킬킴킵킷킹타탁탄" +
    "탈탉탐탑탓탔탕태택탠탤탬탭탯탰탱탸턍터턱턴털턺텀텁텃텄텅테텍텐텔템텝텟텡텨텬텼톄톈토톡톤톨톰톱톳통톺톼퇀퇘퇴퇸툇툉툐투툭툰툴툼툽툿퉁퉈퉜퉤튀튁튄튈튐튑튕튜튠튤튬튱트특튼튿틀틂틈틉틋틔틘틜틤틥티틱틴틸팀" +
    "팁팃팅파팍팎판팔팖팜팝팟팠팡팥패팩팬팰팸팹팻팼팽퍄퍅퍼퍽펀펄펌펍펏펐펑페펙펜펠펨펩펫펭펴편펼폄폅폈평폐폘폡폣포폭폰폴폼폽폿퐁퐈퐝푀푄표푠푤푭푯푸푹푼푿풀풂품풉풋풍풔풩퓌퓐퓔퓜퓟퓨퓬퓰퓸퓻퓽프픈플픔픕픗" +
    "피픽핀필핌핍핏핑하학한할핥함합핫항해핵핸핼햄햅햇했행햐향허헉헌헐헒험헙헛헝헤헥헨헬헴헵헷헹혀혁현혈혐협혓혔형혜혠혤혭호혹혼홀홅홈홉홋홍홑화확환활홧황홰홱홴횃횅회획횐횔횝횟횡효횬횰횹횻후훅훈훌훑훔훗훙훠" +
    "훤훨훰훵훼훽휀휄휑휘휙휜휠휨휩휫휭휴휵휸휼흄흇흉흐흑흔흖흗흘흙흠흡흣흥흩희흰흴흼흽힁히힉힌힐힘힙힛힝";

function nickPick() {
    return NICK_SYLLABLES.charAt(Math.floor(Math.random() * NICK_SYLLABLES.length));
}

function nickSuggestText(name) {
    var nick = nickPick() + nickPick();
    var last = nick.charCodeAt(nick.length - 1) - 0xAC00;
    var josa = (last >= 0 && last % 28 !== 0) ? "이라는" : "라는";
    return name + "님은 " + nick + josa + " 이름이 잘 어울리시네요";
}

// ═══════════════ 전생 풀이 (2026-11-13, 누구나) ═══════════════
// "전생" · "/전생" → 내 이름(최초 대화명), "전생 홍길동" · "/전생 홍길동" → 그 이름의 초성으로 전생 문구를 만든다.
// 사용자가 준 예전 코드(초성 → first/second/third 표)를 옮긴 것. 예전 코드의 버그는 고쳤다:
//   · if (3|2 == nameLength) 가 늘 참이라 길이별 분기가 안 됐다 → 의도대로 2~3글자 / 4글자 / 5글자 이상으로 나눈다
//   · second 표의 "E"(ㄸ 오타), first 의 ㅆ·third 의 ㅃ 빠짐 → 채웠다 (같은 계열 자음과 같은 문구)
//   · 혹시 표에 없는 초성이 나오면 예사소리(ㄲ→ㄱ 등)로 대신 찾는다
// 대화명에 한글이 있으면 한글만 쓴다 (예: "송곳/세이지" → 송곳세이지, "Maverick/쉐체(단합)" → 쉐체단합).
// 한글이 하나도 없고 영어만 있으면 영어를 소리 마디로 끊어 첫 자음을 초성으로 본다 (2026-11-13 사용자 질문):
//   Maverick → ma·ve·ri → ㅁ·ㅂ·ㄹ,  Kwave → kwa·ve → ㅋ·ㅂ. 모음으로 시작하는 마디는 ㅇ. 끝에 남는 자음은 버린다.
// 한글도 영어도 없으면 안내만 한다.
var PAST_FIRST = {
    "ㄱ": "덥수룩한 수염에", "ㄲ": "덥수룩한 수염에", "ㄴ": "어렵고", "ㄷ": "외계에서와", "ㄸ": "외계에서와",
    "ㄹ": "돈이 넘치고", "ㅁ": "생각할수록", "ㅂ": "단호박이고", "ㅃ": "매일 술 마시며", "ㅅ": "매일 술 마시며",
    "ㅆ": "매일 술 마시며", "ㅇ": "절세 미모로", "ㅈ": "매일 싸우며", "ㅉ": "매일 싸우며", "ㅊ": "얼짱이고",
    "ㅋ": "친절하게", "ㅌ": "충동적이고", "ㅍ": "더럽고", "ㅎ": "태어날 때부터"
};
var PAST_SECOND = {
    "ㄱ": "똘끼 넘치는", "ㄲ": "똘끼 넘치는", "ㄴ": "고기만 먹던", "ㄷ": "열정적인", "ㄸ": "열정적인",
    "ㄹ": "변태같은", "ㅁ": "드래곤을 처치한", "ㅂ": "예의범절이 바른", "ㅃ": "예의범절이 바른",
    "ㅅ": "이성을 유혹하던", "ㅆ": "이성을 유혹하던", "ㅇ": "사대부 집안의", "ㅈ": "사기치던", "ㅉ": "매일싸우던",
    "ㅊ": "신의 은총이 충만한", "ㅋ": "잘 빌 붙는", "ㅌ": "물건을 훔치던", "ㅍ": "야동 좋아하는", "ㅎ": "바람둥이였던"
};
var PAST_THIRD = {
    "ㄱ": "사냥꾼", "ㄲ": "주모", "ㄴ": "궁중 음악사", "ㄷ": "귀여운 강아지", "ㄸ": "친일파", "ㄹ": "금메달리스트",
    "ㅁ": "가녀린 여인", "ㅂ": "조선제일검", "ㅃ": "조선제일검", "ㅅ": "나무꾼", "ㅆ": "나무꾼", "ㅇ": "변강쇠",
    "ㅈ": "노비", "ㅉ": "추노", "ㅊ": "천재 과학자", "ㅋ": "왕", "ㅌ": "망나니", "ㅍ": "과거시험 급제자", "ㅎ": "탐관오리"
};
var PAST_CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
var PAST_PLAIN = { "ㄲ": "ㄱ", "ㄸ": "ㄷ", "ㅃ": "ㅂ", "ㅆ": "ㅅ", "ㅉ": "ㅈ" };

/** 한글 글자들의 초성 (완성형 글자만, 그 밖은 버린다) */
function pastInitials(name) {
    var out = [];
    for (var i = 0; i < name.length; i++) {
        var code = name.charCodeAt(i) - 0xAC00;
        if (code >= 0 && code < 11172) out.push(PAST_CHO[Math.floor(code / 588)]);
    }
    return out;
}

var PAST_EN = { b: "ㅂ", c: "ㅋ", d: "ㄷ", f: "ㅍ", g: "ㄱ", h: "ㅎ", j: "ㅈ", k: "ㅋ", l: "ㄹ", m: "ㅁ", n: "ㄴ",
    p: "ㅍ", q: "ㅋ", r: "ㄹ", s: "ㅅ", t: "ㅌ", v: "ㅂ", w: "ㅇ", x: "ㅅ", z: "ㅈ" };

/** 영어 이름 → 소리 마디마다 첫 자음의 초성 */
function pastInitialsEn(name) {
    var word = String(name).toLowerCase().replace(/[^a-z]/g, "");
    var out = [], re = /([^aeiouy]*)([aeiouy]+)/g, m;
    while ((m = re.exec(word)) !== null) {
        var onset = m[1];
        if (!onset) { out.push("ㅇ"); continue; }
        var two = onset.substring(0, 2);
        if (two === "ch") out.push("ㅊ");
        else if (two === "ph") out.push("ㅍ");
        else if (two === "sh") out.push("ㅅ");
        else if (two === "th") out.push("ㄷ");
        else out.push(PAST_EN[onset.charAt(0)] || "ㅇ");
    }
    if (!out.length && word) out.push(PAST_EN[word.charAt(0)] || "ㅇ");   // 모음 없는 영어 (예: "xx")
    return out;
}

function pastWord(table, cho) {
    return table[cho] || table[PAST_PLAIN[cho]] || "";
}

/** 전생 명령이면 답장 문구, 아니면 null */
function handlePastLife(raw, myName) {
    var m = /^\/?전생(?:\s+([\s\S]+))?$/.exec(raw);
    if (!m) return null;
    var name = m[1] ? m[1].replace(/^\s+|\s+$/g, "") : String(myName);
    var c = pastInitials(name);
    if (!c.length) c = pastInitialsEn(name);
    if (!c.length) return "한글이나 영어 이름으로 해 주세요. 예) 전생 홍길동";
    var parts;
    if (c.length <= 3) {
        parts = [pastWord(PAST_SECOND, c[0]), pastWord(PAST_THIRD, c[c.length > 1 ? 1 : 0])];
    } else if (c.length === 4) {
        parts = [pastWord(PAST_FIRST, c[0]), pastWord(PAST_SECOND, c[1]), pastWord(PAST_THIRD, c[2])];
    } else {
        parts = [pastWord(PAST_FIRST, c[0]), pastWord(PAST_SECOND, c[3]), pastWord(PAST_THIRD, c[4])];
    }
    return "🔮 " + name + "님의 전생\n" + parts.join(" ");
}

// ═══════════════ 알림 (2026-11-14, 누구나) ═══════════════
// /알림_22시50분_공성시작 (또는 /알림 22시50분 공성시작) → 그 시각에 "⏰ 공성시작" 을 보낸다.
// 등록하면 "몇 분마다 알려줄까요?" 를 묻고, 등록한 사람이 숫자로 답하면 그 시각부터 그 간격으로 계속 알린다
// (0 이면 한 번만, 답하지 않으면 한 번만). /알림목록 으로 보고 /알림삭제 번호 (또는 전부) 로 끈다.
// 시각 형식: 22시50분 · 22시 · 22:50 · 오후 10시50분. 이미 지난 시각이면 다음 날 그 시각부터.
// ※ 시계는 백그라운드 타이머다(카페봇과 같은 방식: setInterval → java Timer → Thread). 메시지 흐름에서는 대기하지 않는다.
// ※ /○○업데이트 로 본체를 다시 불러와도 옛 타이머가 남아 두 번 알리지 않게 세대(ALARM_GEN)를 둔다.
// ※ 폰이 잠들었거나 봇이 꺼져 있다가 10분 넘게 늦어진 알림은 보내지 않고 건너뛴다 (뒤늦은 "공성시작" 방지).
var ALARM = {
    MAX_PER_ROOM: 10,      // 방마다 알림 개수
    MAX_TEXT: 200,         // 알릴 말 최대 글자 수
    MIN_EVERY: 5,          // 반복 간격 최소 (분)
    MAX_EVERY: 1440,       // 반복 간격 최대 (분, 하루)
    ASK_SEC: 300,          // "몇 분마다?" 답을 기다리는 시간 (초)
    LATE_MS: 10 * 60 * 1000,
    TICK_MS: 20000
};
var ALARM_GEN_KEY = "chatbot.alarm.gen." + scriptName;
var ALARM_GEN = String(new Date().getTime()) + "-" + Math.floor(Math.random() * 1000000);
var ALARM_TIMER = "";          // 타이머 종류 (비어 있으면 알림 불가)
var alarmLastTick = 0;
var alarmLastErr = "";
var alarmPending = {};         // { 방|사람키: { a: 알림, at: 시각 } } "몇 분마다?" 답 기다리는 중

function alarmUpdateCmd() {
    return "/" + String(scriptName).replace(/봇$/, "") + "업데이트";
}

function pad2(n) { return (n < 10 ? "0" : "") + n; }

function alarmTimeText(h, m) { return h + "시" + (m ? " " + m + "분" : ""); }

function alarmNextAt(h, m, now) {
    var d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return d.getTime();
}

function alarmShortWhen(t, now) {
    var d = new Date(t), n = new Date(now);
    var day = (d.toDateString() === n.toDateString()) ? "" :
        (d.toDateString() === new Date(now + 86400000).toDateString() ? "내일 " : (d.getMonth() + 1) + "/" + d.getDate() + " ");
    return day + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

/** "22시50분 공성시작" → { h, m, text } / 형식이 틀리면 null */
function alarmParse(rest) {
    var s = rest.replace(/^[\s_]+/, ""), pm = null, mt;
    mt = /^(오전|오후)\s*/.exec(s);
    if (mt) { pm = mt[1]; s = s.substring(mt[0].length); }
    var h, m = 0, text;
    if ((mt = /^(\d{1,2}):(\d{2})[\s_]+([\s\S]+)$/.exec(s))) {
        h = Number(mt[1]); m = Number(mt[2]); text = mt[3];
    } else if ((mt = /^(\d{1,2})\s*시(?:[\s_]*(\d{1,2})\s*분)?[\s_]*([\s\S]+)$/.exec(s))) {
        h = Number(mt[1]); m = mt[2] ? Number(mt[2]) : 0; text = mt[3];
    } else return null;
    if (pm === "오후" && h < 12) h += 12;
    if (pm === "오전" && h === 12) h = 0;
    if (h === 24) h = 0;
    text = String(text).trim();
    if (h > 23 || m > 59 || !text) return null;
    return { h: h, m: m, text: text };
}

function alarmListText(room, now) {
    var list = alarms[room] || [];
    var warn = alarmClockWarn(now);
    if (!list.length) return "등록된 알림이 없어요.\n/알림 22시50분 할말 — 로 등록해요" + (warn ? "\n" + warn : "");
    var lines = ["⏰ 이 방 알림 " + list.length + "개"];
    for (var i = 0; i < list.length; i++) {
        var a = list[i];
        lines.push((i + 1) + ". " + pad2(a.h) + ":" + pad2(a.m) + " " + a.text +
            "\n   " + (a.every ? a.every + "분마다" : "한 번만") + " · 다음 " + alarmShortWhen(a.next, now));
    }
    lines.push("지우기: /알림삭제 번호 (모두 지우기: /알림삭제 전부)");
    if (warn) lines.push(warn);
    return lines.join("\n");
}

function alarmClockWarn(now) {
    if (!ALARM_TIMER) return "⚠️ 이 앱에서는 알림을 보낼 수 없어요 (타이머를 못 만들었어요)";
    if (alarmLastTick && now - alarmLastTick > 3 * 60 * 1000) return "⚠️ 알림 시계가 멈춘 것 같아요 — " + alarmUpdateCmd() + " 로 다시 켜 주세요";
    return "";
}

/** 알림 명령이면 답장 문구, 아니면 null. 등록한 사람의 "몇 분마다?" 숫자 답도 여기서 받는다 */
function handleAlarm(room, raw, uKey) {
    var now = new Date().getTime();
    var pk = room + "|" + uKey;

    // ── "몇 분마다?" 답 (등록한 사람이 5분 안에 숫자로) ──
    var p = alarmPending[pk];
    if (p && now - p.at > ALARM.ASK_SEC * 1000) { delete alarmPending[pk]; p = null; }
    var mn = /^(\d{1,4})\s*분?(?:마다)?$/.exec(raw);
    if (p && mn) {
        var list0 = alarms[room] || [];
        if (list0.indexOf(p.a) === -1) { delete alarmPending[pk]; return null; }   // 그새 지워진 알림
        var ev = Number(mn[1]);
        if (ev !== 0 && (ev < ALARM.MIN_EVERY || ev > ALARM.MAX_EVERY)) {
            return ALARM.MIN_EVERY + "~" + ALARM.MAX_EVERY + "분 사이 숫자로 알려 주세요 (한 번만 알리려면 0)";
        }
        delete alarmPending[pk];
        p.a.every = ev;
        saveData();
        var at = alarmTimeText(p.a.h, p.a.m);
        return ev
            ? "✅ " + at + "부터 " + ev + "분마다 \"" + p.a.text + "\" 알려 드릴게요\n끄려면 /알림목록 에서 번호를 보고 /알림삭제 번호"
            : "✅ " + at + "에 \"" + p.a.text + "\" 한 번만 알려 드릴게요";
    }

    if (raw.indexOf("/알림") !== 0) return null;
    var rest = raw.substring(3);
    if (rest && !/^[\s_\d오]/.test(rest) && !/^(목록|삭제)/.test(rest)) return null;   // "/알림이…" 같은 말은 건드리지 않는다
    var r2 = rest.replace(/^[\s_]+/, "");

    // ── 목록 ──
    if (r2 === "목록" || r2 === "리스트") return alarmListText(room, now);

    // ── 삭제 ──
    var dm = /^삭제[\s_]*([\s\S]*)$/.exec(r2);
    if (dm) {
        var list = alarms[room] || [], arg = dm[1].trim();
        if (!list.length) return "등록된 알림이 없어요.";
        if (arg === "전부" || arg === "모두" || arg === "전체") {
            var n = list.length;
            alarms[room] = [];
            saveData();
            return "🗑️ 이 방 알림 " + n + "개를 모두 지웠어요.";
        }
        if (!/^\d+$/.test(arg)) return "지울 번호를 적어 주세요. 예) /알림삭제 1\n" + alarmListText(room, now);
        var idx = Number(arg) - 1;
        if (idx < 0 || idx >= list.length) return arg + "번 알림이 없어요.\n" + alarmListText(room, now);
        var gone = list.splice(idx, 1)[0];
        saveData();
        return "🗑️ " + pad2(gone.h) + ":" + pad2(gone.m) + " \"" + gone.text + "\" 알림을 지웠어요.";
    }

    var usage = "형식: /알림 22시50분 할말\n예) /알림 22시50분 공성시작 (/알림_22시50분_공성시작 도 돼요)\n" +
        "목록: /알림목록 · 지우기: /알림삭제 번호";
    if (!r2) return usage;

    // ── 등록 ──
    var a = alarmParse(rest);
    if (!a) return "시각을 못 알아봤어요.\n" + usage;
    if (a.text.length > ALARM.MAX_TEXT) return "알릴 말은 " + ALARM.MAX_TEXT + "자까지 돼요.";
    if (!ALARM_TIMER) return "⚠️ 이 앱에서는 알림을 보낼 수 없어요 (타이머를 못 만들었어요)";
    if (!alarms[room]) alarms[room] = [];
    var lst = alarms[room];
    for (var i = 0; i < lst.length; i++) {
        if (lst[i].h === a.h && lst[i].m === a.m && lst[i].text === a.text) return "이미 같은 알림이 있어요.\n" + alarmListText(room, now);
    }
    if (lst.length >= ALARM.MAX_PER_ROOM) return "알림은 방마다 " + ALARM.MAX_PER_ROOM + "개까지예요. /알림삭제 번호 로 지운 뒤 넣어 주세요.";
    a.every = 0;
    a.next = alarmNextAt(a.h, a.m, now);
    lst.push(a);
    lst.sort(function (x, y) { return (x.h * 60 + x.m) - (y.h * 60 + y.m); });
    saveData();
    alarmPending[pk] = { a: a, at: now };
    return "⏰ " + alarmTimeText(a.h, a.m) + " \"" + a.text + "\" 알림을 등록했어요 (" + alarmShortWhen(a.next, now) + ")\n" +
        "몇 분마다 알려 줄까요? 숫자만 보내 주세요 (예: 30)\n한 번만 알리려면 0";
}

/** 시계 한 번 — 때가 된 알림을 보낸다. 시험에서도 직접 부른다 */
function alarmTick(now) {
    alarmLastTick = now;
    var changed = false;
    for (var room in alarms) {
        if (!alarms.hasOwnProperty(room)) continue;
        var list = alarms[room];
        if (!list || !list.length) continue;
        for (var i = list.length - 1; i >= 0; i--) {
            var a = list[i];
            if (!(a.next <= now)) continue;
            // 반복 알림이 여러 번 밀렸으면(폰이 잠들었다 깨는 등) 가장 최근 차례만 본다
            if (a.every > 0) while (a.next + a.every * 60000 <= now) a.next += a.every * 60000;
            if (now - a.next <= ALARM.LATE_MS) {
                if (!askSend(room, "⏰ " + a.text)) alarmLastErr = "보내기 실패 " + new Date(now).toLocaleString();
            }
            if (a.every > 0) {
                while (a.next <= now) a.next += a.every * 60000;
            } else {
                list.splice(i, 1);
            }
            changed = true;
        }
    }
    if (changed) saveData();
}

function alarmBeat() {
    try {
        var v = java.lang.System.getProperty(ALARM_GEN_KEY);
        if (v !== null && String(v) !== ALARM_GEN) return false;   // 새로 불러온 본체가 맡았다 — 이 타이머는 끝
    } catch (e) {}
    try { alarmTick(new Date().getTime()); } catch (e) { alarmLastErr = "시계 오류: " + e; }
    return true;
}

function alarmStart() {
    try { java.lang.System.setProperty(ALARM_GEN_KEY, ALARM_GEN); } catch (e) {}
    try {
        if (typeof setInterval === "function") {
            var h = setInterval(function () {
                if (!alarmBeat() && typeof clearInterval === "function") clearInterval(h);
            }, ALARM.TICK_MS);
            ALARM_TIMER = "setInterval";
            return;
        }
    } catch (e) {}
    try {
        if (typeof JavaAdapter !== "undefined") {
            var timer = new java.util.Timer("alarm-" + scriptName, true);
            timer.schedule(new JavaAdapter(java.util.TimerTask, {
                run: function () { if (!alarmBeat()) { try { this.cancel(); } catch (e2) {} } }
            }), ALARM.TICK_MS, ALARM.TICK_MS);
            ALARM_TIMER = "JavaAdapter";
            return;
        }
    } catch (e) {}
    try {
        var th = new java.lang.Thread(function () {
            while (true) {
                java.lang.Thread.sleep(ALARM.TICK_MS);
                if (!alarmBeat()) return;
            }
        });
        th.setDaemon(true);
        th.start();
        ALARM_TIMER = "Thread";
    } catch (e) {}
}

// ═══════════════ 메시지 처리 ═══════════════

function response(room, msg, sender, isGroupChat, replier, who) {
    try {
        if (ROOMS.indexOf(room) === -1) return;

        // 보낸 사람 — 기록은 uKey(사람), 화면엔 uName(최초 대화명). 관리자 검사(isAdmin)는 지금 대화명 그대로
        var uKey = userKeyOf(sender, who);

        // 한 번만 하는 데이터 손질 (조용히) — 보낸 사람의 최근 대화명을 먼저 적어 둔 뒤에 해야 그 사람을 이름으로 찾는다
        applyOneTimeFixes(room);

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

        // ── 알림 (누구나) — 등록한 사람의 "몇 분마다?" 숫자 답도 여기서 ──
        askReplier[room] = replier;
        var alarmReply = handleAlarm(room, raw, uKey);
        if (alarmReply !== null) return replier.reply(alarmReply);

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

        // ── 닉네임 추천 (누구나) ──
        if (raw === "닉네임" || raw === "/닉네임") return replier.reply(nickSuggestText(uName));

        // ── 전생 풀이 (누구나) ──
        var pastReply = handlePastLife(raw, uName);
        if (pastReply !== null) return replier.reply(pastReply);

        // ── 옵션으로 카드 찾기 (누구나) ──
        var cardSearchReply = handleCardSearch(raw);
        if (cardSearchReply !== null) return replier.reply(cardSearchReply);

        // ── 클로드 답변 (켜기 .. / 끄기 ... / 질문 .할말) ──
        askReplier[room] = replier;
        var askReply = handleAsk(room, raw, sender, isGroupChat);
        if (askReply !== null) return replier.reply(askReply);

        // 앞에 "/" 를 붙여 치는 사람도 있어서 /재련가즈아·/제련가즈아 도 받는다 (2026-11-13 사용자 요청)
        if (msg === "/재련가즈아" || msg === "/제련가즈아") msg = msg.substring(1);

        // ── 재련 시도 ──
        if (msg === "제련가즈아" || msg === "재련가즈아") {
            // 파괴된 장비는 수리 전까지 재련 불가 (횟수도 쓰지 않는다)
            if (broken[uKey]) {
                if (!repairPrompt[uKey]) {
                    repairPrompt[uKey] = REPAIR_KEYWORDS[Math.floor(Math.random() * REPAIR_KEYWORDS.length)];
                    saveData();
                }
                return replier.reply(uName + "님, 장비가 파괴되어 재련을 할 수 없습니다. 수리를 원하시면 \"" +
                    repairPrompt[uKey] + "\" 라고 외쳐주세요!");
            }

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
            } else if (result === "하락") {
                level = Math.max(1, level - 1);
                message += "재련에 실패하여 " + prevLevel + " → " + level + "로 하락되었습니다ㅠㅠ";
            } else {
                broken[uKey] = true;
                delete repairPrompt[uKey];
                message += prevLevel + " → " + level + " 재련에 실패하여 장비가 파괴되었습니다💥";
            }

            userData[uKey] = level;
            dailyLimit[uKey].count++;

            saveData();
            return replier.reply(message);
        }

        // ── 수리 ── (봇이 알려준 문구와 똑같이 외쳐야 한다)
        if (broken[uKey] && repairPrompt[uKey]) {
            if (msg === String(repairPrompt[uKey]).toLowerCase()) {
                delete broken[uKey];
                delete repairPrompt[uKey];
                // 수리 보상: 오늘 재련 기회 +1 (쓴 횟수를 1 줄인다 — 아직 안 썼으면 오늘 3번이 된다)
                if (!dailyLimit[uKey] || dailyLimit[uKey].date !== today) {
                    dailyLimit[uKey] = { count: 0, date: today };
                }
                dailyLimit[uKey].count -= REPAIR_BONUS;
                saveData();
                var left = MAX_ATTEMPTS - dailyLimit[uKey].count;
                return replier.reply(uName + "님 장비가 수리되어 재련을 하실 수 있습니다\n🎁 수리 보너스! 오늘 재련 기회 +" +
                    REPAIR_BONUS + " (남은 기회 " + left + "번)");
            }
            for (var k = 0; k < REPAIR_KEYWORDS.length; k++) {
                if (msg === REPAIR_KEYWORDS[k].toLowerCase()) {
                    return replier.reply(uName + "님, 잘못된 키워드를 입력하셨습니다. 다시 \"" +
                        repairPrompt[uKey] + "\" 라고 외쳐주세요!");
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
                lines.push((i + 1) + ". " + displayName(arr[i][0]) + ": " + arr[i][1] + "재련");
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

        // ── 고정 응답 (코드에 있는 것 — 등록분보다 먼저) ──
        if (FIXED_REPLIES.hasOwnProperty(raw)) return replier.reply(FIXED_REPLIES[raw]);

        // ── 등록된 명령어 응답 (메시지 전체가 일치할 때) ──
        var rc = custom[room];
        if (rc && rc.hasOwnProperty(raw)) return replier.reply(rc[raw]);

        // ── 몬스터 카드 옵션 (메시지가 몬스터 이름이면, 맨 마지막) ──
        var cardReply = handleCard(raw);
        if (cardReply !== null) return replier.reply(cardReply);

    } catch (e) {
        // 일반 대화 중에는 조용히 넘어간다 (명령어일 때만 알림)
        try {
            if (String(msg).indexOf("/") === 0) replier.reply("⚠️ 레몬봇 오류: " + e);
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

// 알림 시계 켜기 (모든 정의가 끝난 뒤)
alarmStart();
