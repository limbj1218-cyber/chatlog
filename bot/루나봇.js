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
 *    /초기화 /삭제            → 관리자 전용 (대화명에 "후파"가 들어간 사람)
 *
 *  ◆ 사건봇(bot/사건봇.js)을 복사해 루나 방용으로 따로 만든 봇이다 (2026-11-12).
 *    - 방(루나)·데이터 파일(luna_Database.json)·관리자가 사건봇과 따로다.
 *    - 사건봇과 달리 파괴/수리가 있다 (제련봇 방식, 확률표도 제련봇과 같다).
 *      파괴되면 재련이 막히고, 그때 재련가즈아를 치면 수리 문구(REPAIR_KEYWORDS — 지금은 "진상님 죄송해요")를 알려준다.
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
var BOT_VER = "1112-5";

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
var REPAIR_KEYWORDS = ["진상님 죄송해요"];

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
    if (t.indexOf("/등록") === 0 || t.indexOf("/삭제") === 0) return true;
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
                saveData();
                return replier.reply(sender + "님 장비가 수리되어 재련을 하실 수 있습니다");
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
