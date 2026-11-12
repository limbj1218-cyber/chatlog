/**
 * ═══════════════════════════════════════════════════════════
 *  사건봇 — "사건" 방 전용 재련(강화) 미니게임
 *
 *  ◆ 명령어
 *    제련가즈아 / 재련가즈아 → 재련 시도 (하루 2회)
 *    /랭킹                    → 이 방 참여자들의 재련 랭킹
 *    /등록_명령어_할말        → 명령어 등록 (누구나)
 *    /삭제_명령어             → 등록한 명령어 삭제 (누구나)
 *    /리스트                  → 등록된 명령어 목록
 *    /탐지 할말               → 거짓말 탐지기 (참·거짓·중립 무작위, 누구나)
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
var BOT_VER = "1112-3";

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
        roomUsers: rooms
    };
}

var store = loadData();
var userData = store.userData;
var dailyLimit = store.dailyLimit;
var roomUsers = store.roomUsers;
var custom = store.custom;

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
    if (t.indexOf("/등록") === 0 || t.indexOf("/삭제") === 0 || t.indexOf("/탐지") === 0) return true;
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

        // ── 거짓말 탐지기 (누구나) ──
        var detectReply = handleDetect(raw);
        if (detectReply !== null) return replier.reply(detectReply);

        // ── 재련 시도 ──
        if (msg === "제련가즈아" || msg === "재련가즈아") {
            if (!dailyLimit[sender] || dailyLimit[sender].date !== today) {
                dailyLimit[sender] = { count: 0, date: today };
            }

            if (dailyLimit[sender].count >= MAX_ATTEMPTS) {
                return replier.reply("오늘 할 수 있는 재련 기회를 모두 사용하셨습니다.");
            }

            if (!userData[sender]) userData[sender] = 1;

            var level = userData[sender];
            var prevLevel = level;
            var result = refine(level);
            var message = sender + "님, ";

            if (result === "성공") {
                level++;
                message += prevLevel + " → " + level + " 재련에 성공하셨습니다!";
            } else if (result === "유지") {
                message += prevLevel + " → " + level + " 재련에 실패하셨네요ㅜㅜ";
            } else {
                level = Math.max(1, level - 1);
                message += "재련에 실패하여 " + prevLevel + " → " + level + "로 하락되었습니다ㅠㅠ";
            }

            userData[sender] = level;
            dailyLimit[sender].count++;

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
                lines.push((i + 1) + ". " + arr[i][0] + ": " + arr[i][1] + "재련");
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
            saveData();
            return replier.reply("모든 유저의 재련값이 1으로 초기화되었습니다.");
        }

        // ── 등록된 명령어 응답 (메시지 전체가 일치할 때) ──
        var rc = custom[room];
        if (rc && rc.hasOwnProperty(raw)) return replier.reply(rc[raw]);

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
