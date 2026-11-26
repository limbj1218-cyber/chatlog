/**
 * ═══════════════════════════════════════════════════════════
 *  제련봇 — 카카오톡 장비 제련(강화) 미니게임
 *
 *  ◆ 명령어
 *    제련가즈아 / 재련가즈아 → 제련 시도 (하루 2회)
 *    (파괴 시 지정된 수리 문구를 외치면 복구)
 *    /랭킹 /확률
 *    /로드 /초기화 /삭제 /삭제_이름 /복구_이름 /지정_이름_숫자   (관리자)
 *    /확률업 20  → "몇 시까지?" 를 묻고 그때까지 성공 확률을 원래의 20% 만큼 올린다 (관리자, 아래 "확률업 이벤트")
 *
 *  ◆ 호환성
 *    - 메신저봇R 신버전(API2) / 구버전(API1) / 다크토네이도 챗봇 모두 동작
 *    - FileStream 이 없는 앱에서는 java.io 로 자동 대체
 *    - 저장 폴더는 쓰기 가능한 곳을 자동 선택 (권한 없어도 앱 전용 폴더 사용)
 *    - 옛 경로(/sdcard/제련/Database.json)에 데이터가 있으면 자동으로 이어받음
 *
 *  ※ 안드로이드 Rhino 엔진 호환을 위해 ES5 문법만 사용한다.
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "제련봇";
var BOT_VER = "1126-1";

// ─────────────── 설정 (여기만 고치면 됨) ───────────────
var ROOMS = [
    "사업처임병진",
    "몽구"
    // "거북"(지금 방 이름 하늘)은 2026-11-17 부터 하늘봇(bot/하늘봇.js)이 맡는다 — 같이 넣으면 둘 다 답한다
];

var ADMINS = ["사업처임병진", "후파", "후파/엔젤링"];   // 정확히 일치해야 관리자
// ────────────────────────────────────────────────────────

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

/** 쓰기 가능한 저장 폴더 자동 선택 (권한 없어도 앱 전용 폴더는 쓸 수 있다) */
function pickBaseDir() {
    var cands = [];
    try {
        var app = android.app.ActivityThread.currentApplication();
        var ext = app.getExternalFilesDir(null);
        if (ext) cands.push(String(ext.getAbsolutePath()));
        cands.push(String(app.getFilesDir().getAbsolutePath()) + "/jeryeon");
    } catch (e) {}
    cands.push("/sdcard/제련");
    for (var i = 0; i < cands.length; i++) {
        try {
            if (fileWrite(cands[i] + "/write_test.txt", "ok") &&
                String(fileRead(cands[i] + "/write_test.txt")).indexOf("ok") === 0) return cands[i];
        } catch (e) {}
    }
    return "/sdcard/제련";
}

var BASE_DIR = pickBaseDir();
var DATA_FILE = BASE_DIR + "/Database.json";
var LEGACY_FILE = "/sdcard/제련/Database.json";   // 예전 경로 (데이터 이어받기용)

// ═══════════════ 데이터 ═══════════════
// /업데이트(코드 재로드) 후에도 데이터가 날아가지 않도록 전역에 보관

if (typeof __JERYEON_DATA__ === "undefined") __JERYEON_DATA__ = null;
if (typeof __JERYEON_PROMPT__ === "undefined") __JERYEON_PROMPT__ = {};

var repairPrompt = __JERYEON_PROMPT__;

function loadData() {
    var raw = fileRead(DATA_FILE);
    if (!raw) raw = fileRead(LEGACY_FILE);   // 옛 경로에서 이어받기
    if (raw) {
        try { return JSON.parse(raw); } catch (e) {}
    }
    if (__JERYEON_DATA__) return __JERYEON_DATA__;
    return {};
}

var data = loadData();

function save() {
    try { __JERYEON_DATA__ = data; } catch (e) {}   // 파일 저장이 막혀도 메모리에는 유지
    fileWrite(DATA_FILE, JSON.stringify(data));
}

function getRoomData(room) {
    if (!data[room]) data[room] = { users: {}, deleted: {}, boost: null };
    if (!data[room].users) data[room].users = {};
    if (!data[room].deleted) data[room].deleted = {};
    return data[room];
}

// ═══════════════ 게임 규칙 ═══════════════

var table = {
    0: [100.0, 0.0, 0.0, 0.0], 1: [50.0, 50.0, 0.0, 0.0],
    2: [33.0, 67.0, 0.0, 0.0], 3: [25.0, 75.0, 0.0, 0.0],
    4: [25.0, 40.0, 25.0, 10.0], 5: [25.0, 40.0, 25.0, 10.0],
    6: [20.0, 40.0, 25.0, 15.0], 7: [20.0, 40.0, 25.0, 15.0],
    8: [20.0, 35.0, 30.0, 15.0], 9: [20.0, 35.0, 30.0, 15.0],
    10: [20.0, 30.0, 30.0, 20.0], 11: [20.0, 30.0, 30.0, 20.0],
    12: [20.0, 25.0, 30.0, 25.0], 13: [15.0, 20.0, 35.0, 30.0],
    14: [15.0, 15.0, 35.0, 35.0], 15: [0.0, 0.0, 0.0, 0.0]
};

var repairKeywords = [
    "그라비티개객끼", "그라비티 개객끼", "후파님 사랑해요",
    "존경하는 후파님", "비경보상 400개내놔", "앗살라무 알레이꿈"
];

// ═══════════════ 확률업 이벤트 (2026-11-26 사용자 요청) ═══════════════
// /확률업 20 → "몇 시까지 적용할까요?" 를 묻고, 그 관리자가 5분 안에 시각(23시 · 23시30분 · 23:30 · 오후 11시 · 24시)이나
// "3시간" 을 보내면 그때까지 성공 확률을 **원래의 20% 만큼** 올린다 (25% → 30%, 20%p 가 아니다 — 사용자 선택).
// 늘어난 만큼 실패(유지) 칸에서 빼고, 실패가 모자라면 하락 → 파괴 순으로 뺀다 (합은 늘 100). 성공은 100 을 넘지 않는다.
// /확률업 20 23시 처럼 한 번에 써도 된다. /확률업 0 (끄기·종료) → 바로 끝. /확률업 → 지금 이벤트 보기.
// 시각은 한국 시간(UTC+9)으로 직접 계산한다 — 폰의 getHours() 시간대가 어긋난 적이 있다(루나봇 알림, 2026-11-14).
// 예전 /확률업_배수_시간 으로 저장된 이벤트({ multiplier })는 (배수-1)×100 % 로 읽는다.
var BOOST_ASK_MS = 5 * 60000;   // 시각을 기다리는 시간
var BOOST_MAX_PCT = 500;
var KST_MS = 9 * 3600000, DAY_MS = 86400000;
var boostPending = {};          // { 방: { who, pct, at } } — 메모리만

/** 이 방에서 지금 적용 중인 확률업 % (없으면 null) */
function boostPctOf(roomData, now) {
    var b = roomData.boost;
    if (!b || !(now < b.until)) return null;
    if (typeof b.pct === "number") return b.pct;
    if (typeof b.multiplier === "number") return (b.multiplier - 1) * 100;
    return null;
}

/** 단계별 [성공, 실패, 하락, 파괴] — 확률업이면 성공을 원래의 pct% 만큼 올리고 그만큼 실패 → 하락 → 파괴 에서 뺀다 */
function boostRates(level, pct) {
    var row = table[level] || [0, 0, 0, 0];
    var r = [row[0], row[1], row[2], row[3]];
    if (!pct || pct <= 0) return r;
    var up = Math.min(100, r[0] * (1 + pct / 100)) - r[0];
    r[0] += up;
    for (var i = 1; i < 4 && up > 0; i++) {
        var take = Math.min(r[i], up);
        r[i] -= take;
        up -= take;
    }
    for (var j = 0; j < 4; j++) r[j] = Math.round(r[j] * 10000) / 10000;
    return r;
}

function fmtPct(n) { return String(Math.round(n * 100) / 100); }

function kstDayStart(ms) { return Math.floor((ms + KST_MS) / DAY_MS) * DAY_MS - KST_MS; }

/** 한국 시간 "오후 11:00" (오늘이 아니면 앞에 "내일"·"M/D") */
function kstLabel(ms, now) {
    var d = new Date(ms + KST_MS);
    var h = d.getUTCHours(), mi = d.getUTCMinutes();
    var t = (h < 12 ? "오전 " : "오후 ") + (h % 12 === 0 ? 12 : h % 12) + ":" + (mi < 10 ? "0" : "") + mi;
    var dd = Math.round((kstDayStart(ms) - kstDayStart(now)) / DAY_MS);
    if (dd === 0) return t;
    if (dd === 1) return "내일 " + t;
    return (d.getUTCMonth() + 1) + "/" + d.getUTCDate() + " " + t;
}

/** "23시" · "23시30분" · "23:30" · "오후 11시" · "24시" · "3시간" → 끝나는 ms (못 알아들으면 null). 지난 시각이면 다음 날 */
function parseBoostUntil(text, now) {
    var t = String(text).replace(/\s+/g, "");
    var m = /^(\d{1,2})시간$/.exec(t);
    if (m) {
        var hrs = parseInt(m[1], 10);
        return hrs >= 1 && hrs <= 72 ? now + hrs * 3600000 : null;
    }
    m = /^(오전|오후)?(\d{1,2})(?:시(?:(\d{1,2})분?)?|:(\d{2}))$/.exec(t);
    if (!m) return null;
    var h = parseInt(m[2], 10);
    var mi = m[3] !== undefined && m[3] !== "" ? parseInt(m[3], 10) : (m[4] !== undefined && m[4] !== "" ? parseInt(m[4], 10) : 0);
    if (m[1] === "오후" && h < 12) h += 12;
    if (m[1] === "오전" && h === 12) h = 0;
    if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
    var at = kstDayStart(now) + h * 3600000 + mi * 60000;
    if (at <= now) at += DAY_MS;
    return at;
}

function startBoost(roomData, pct, until, now) {
    roomData.boost = { pct: pct, until: until };
    save();
    var ex = boostRates(4, pct);
    return "🎉 제련확률이 원래의 " + fmtPct(pct) + "% 만큼 오르는 제련이벤트가 " + kstLabel(until, now) + "까지 진행됩니다!\n" +
        "(예: 4 → 5 성공 " + fmtPct(table[4][0]) + "% → " + fmtPct(ex[0]) + "%, 실패 " + fmtPct(table[4][1]) + "% → " + fmtPct(ex[1]) + "%)";
}

/** 확률업 명령·시각 답이면 답장 문구, 아니면 null */
function handleBoost(room, msg, sender, roomData, now) {
    var t = String(msg).trim();
    var pend = boostPending[room];
    if (pend && (pend.who !== sender || now - pend.at > BOOST_ASK_MS)) {
        if (now - pend.at > BOOST_ASK_MS) delete boostPending[room];
        pend = null;
    }
    var isCmd = t === "/확률업" || t.indexOf("/확률업 ") === 0 || t.indexOf("/확률업_") === 0;
    if (pend && !isCmd) {
        if (t.charAt(0) === "/") { delete boostPending[room]; return null; }   // 다른 명령을 치면 묻기를 그만둔다
        var until0 = parseBoostUntil(t, now);
        if (until0 === null) return null;                                       // 시각이 아니면 평소 대화로
        delete boostPending[room];
        return startBoost(roomData, pend.pct, until0, now);
    }
    if (!isCmd) return null;
    if (!isAdmin(sender)) return "권한이 없습니다";
    var rest = t.substring(4).replace(/_/g, " ").trim();
    if (!rest) {
        var cur = boostPctOf(roomData, now);
        return cur === null
            ? "진행 중인 확률업 이벤트가 없어요.\n형식: /확률업 20 (원래 성공 확률의 20% 만큼 올려요)"
            : "🎉 확률업 이벤트 중: 원래의 " + fmtPct(cur) + "% 만큼, " + kstLabel(roomData.boost.until, now) + "까지\n(끝내려면 /확률업 0)";
    }
    var sp = rest.indexOf(" ");
    var first = sp === -1 ? rest : rest.substring(0, sp);
    var when = sp === -1 ? "" : rest.substring(sp + 1).trim();
    if (first === "0" || first === "끄기" || first === "종료") {
        delete boostPending[room];
        var had = boostPctOf(roomData, now) !== null;
        roomData.boost = null;
        save();
        return had ? "제련이벤트가 종료되었습니다" : "진행 중인 확률업 이벤트가 없어요.";
    }
    var pm = /^(\d+(?:\.\d+)?)%?$/.exec(first);
    var pct = pm ? parseFloat(pm[1]) : NaN;
    if (!(pct > 0 && pct <= BOOST_MAX_PCT)) {
        return "형식: /확률업 20\n원래 성공 확률의 몇 % 만큼 올릴지 1~" + BOOST_MAX_PCT + " 사이 숫자로 써 주세요. (끝내기: /확률업 0)";
    }
    if (when) {
        var until1 = parseBoostUntil(when, now);
        if (until1 === null) return "시각을 못 알아들었어요.\n예) /확률업 " + fmtPct(pct) + " 23시 · 23시30분 · 23:30 · 오후 11시 · 3시간";
        delete boostPending[room];
        return startBoost(roomData, pct, until1, now);
    }
    boostPending[room] = { who: sender, pct: pct, at: now };
    return "⏰ 확률업 " + fmtPct(pct) + "% — 몇 시까지 적용할까요?\n예) 23시 · 23시30분 · 23:30 · 오후 11시 · 3시간 (5분 안에 보내 주세요)";
}

function pickResult(level, boostPct) {
    var rates = boostRates(level, boostPct);
    var rand = Math.random() * 100;
    var sum = 0;
    for (var i = 0; i < rates.length; i++) {
        sum += rates[i];
        if (rand < sum) return i;
    }
    return 1;
}

function todayDateStr() {
    return new Date().toLocaleDateString();
}

function isAdmin(sender) {
    for (var i = 0; i < ADMINS.length; i++) {
        if (ADMINS[i] === sender) return true;
    }
    return false;
}

/** 이름 일부로 유저 찾기 */
function matchUser(users, keyword) {
    for (var name in users) {
        if (users.hasOwnProperty(name) && name.indexOf(keyword) !== -1) return name;
    }
    return null;
}

function defaultUser() {
    return { level: 1, count: 0, broken: false, lastDate: todayDateStr() };
}

// ═══════════════ 메시지 처리 ═══════════════

function response(room, msg, sender, isGroupChat, replier) {
    try {
        if (ROOMS.indexOf(room) === -1) return;

        var now = new Date().getTime();
        var roomData = getRoomData(room);
        var users = roomData.users;
        var deletedUsers = roomData.deleted;
        var name;

        // 알려진 유저 정보 정규화 (예전 데이터에 빠진 항목 채우기)
        for (name in deletedUsers) {
            if (deletedUsers.hasOwnProperty(name) && !users[name]) users[name] = defaultUser();
        }
        for (name in users) {
            if (!users.hasOwnProperty(name)) continue;
            var u = users[name];
            if (typeof u.level === "undefined") u.level = 1;
            if (typeof u.count === "undefined") u.count = 0;
            if (typeof u.broken === "undefined") u.broken = false;
            if (!u.lastDate) u.lastDate = todayDateStr();
        }

        if (!users[sender]) users[sender] = defaultUser();
        var user = users[sender];

        // 날짜가 바뀌면 오늘 사용 횟수 초기화
        if (user.lastDate !== todayDateStr()) {
            user.count = 0;
            user.lastDate = todayDateStr();
        }

        var key = room + "_" + sender;

        // ── 확률업 이벤트 (관리자 명령 + 시각 묻기) ──
        var boostReply = handleBoost(room, msg, sender, roomData, now);
        if (boostReply !== null) return replier.reply(boostReply);

        // ── 제련 시도 ──
        if (msg === "제련가즈아" || msg === "재련가즈아") {
            if (user.broken) {
                if (!repairPrompt[key]) {
                    if (sender === "로망이") {
                        repairPrompt[key] = "후파님 정말 사랑해요";
                    } else {
                        repairPrompt[key] = repairKeywords[Math.floor(Math.random() * repairKeywords.length)];
                    }
                }
                return replier.reply(sender + "님, 장비가 파괴되어 재련을 할 수 없습니다. 수리를 원하시면 \"" +
                    repairPrompt[key] + "\" 라고 외쳐주세요!");
            }

            if (user.count >= 2) {
                return replier.reply(sender + "님, 오늘 사용할 수 있는 제련횟수를 모두 사용하셨어요(일 2회)");
            }

            var result = pickResult(user.level, boostPctOf(roomData, now));
            var before = user.level;
            var message = sender + "님 ";

            if (result === 0) {
                user.level++;
                message += before + " → " + user.level + " 제련에 성공하셨습니다!";
            } else if (result === 1) {
                message += before + " → " + user.level + " 제련에 실패하셨습니다 (레벨 유지)";
            } else if (result === 2) {
                user.level--;
                message += before + " → " + user.level + " 제련에 실패하여 하락하였습니다.";
            } else if (result === 3) {
                user.broken = true;
                message += before + " → " + user.level + " 제련에 실패하여 장비가 파괴되었습니다.";
            }

            user.count++;
            save();
            return replier.reply(message);
        }

        // ── 수리 ──
        if (user.broken && repairPrompt[key] && msg === repairPrompt[key]) {
            user.broken = false;
            delete repairPrompt[key];
            save();
            return replier.reply(sender + "님 장비가 수리되어 재련을 하실 수 있습니다");
        }

        if (user.broken && repairPrompt[key] &&
            repairKeywords.indexOf(msg) !== -1 && msg !== repairPrompt[key]) {
            return replier.reply(sender + "님, 잘못된 키워드를 입력하셨습니다. 다시 \"" +
                repairPrompt[key] + "\" 라고 외쳐주세요!");
        }

        // ── 관리 명령 ──
        if (msg === "/로드") {
            if (!isAdmin(sender)) return replier.reply("권한이 없습니다");
            var added = 0;
            for (name in users) {
                if (!users.hasOwnProperty(name)) continue;
                var ru = users[name];
                if (!ru.lastDate) ru.lastDate = todayDateStr();
                if (typeof ru.count === "undefined") ru.count = 0;
                if (typeof ru.level === "undefined") ru.level = 1;
                if (typeof ru.broken === "undefined") ru.broken = false;
                added++;
            }
            save();
            return replier.reply(room + " 방에서 " + added + "명의 유저 데이터가 로드 및 초기화 되었습니다.");
        }

        if (msg === "/랭킹") {
            var arr = [];
            for (name in users) {
                if (users.hasOwnProperty(name)) arr.push([name, users[name]]);
            }
            arr.sort(function (a, b) { return b[1].level - a[1].level; });
            var lines = [];
            for (var i = 0; i < arr.length; i++) {
                lines.push((i + 1) + ". " + arr[i][0] + " : " + arr[i][1].level + "제련");
            }
            return replier.reply("[제련랭킹]\n" + lines.join("\n"));
        }

        if (msg === "/확률") {
            var bp = boostPctOf(roomData, now);
            var rows = [];
            for (var lv in table) {
                if (!table.hasOwnProperty(lv)) continue;
                var rr = bp === null ? table[lv] : boostRates(Number(lv), bp);
                var cells = [];
                for (var ci = 0; ci < rr.length; ci++) cells.push(bp === null ? rr[ci] : fmtPct(rr[ci]));
                rows.push(lv + ": [" + cells.join(", ") + "]");
            }
            return replier.reply("*[제련확률표]*\n" +
                (bp === null ? "" : "🎉 확률업 이벤트 중 (원래의 +" + fmtPct(bp) + "%, " + kstLabel(roomData.boost.until, now) + "까지)\n") +
                "[성공,실패,하락,파괴]\n" + rows.join("\n"));
        }

        if (msg === "/초기화") {
            if (!isAdmin(sender)) return replier.reply("권한이 없습니다");
            for (name in users) {
                if (users.hasOwnProperty(name)) users[name].count = 0;
            }
            save();
            return replier.reply("모든 유저의 제련횟수가 초기화 되었습니다");
        }

        if (msg === "/삭제") {
            if (!isAdmin(sender)) return replier.reply("권한이 없습니다");
            for (name in users) {
                if (users.hasOwnProperty(name)) roomData.deleted[name] = users[name];
            }
            roomData.users = {};
            save();
            return replier.reply("모든 유저의 제련 데이터가 초기화 되었습니다");
        }

        if (msg.indexOf("/삭제_") === 0) {
            if (!isAdmin(sender)) return replier.reply("권한이 없습니다");
            var partsDel = msg.split("_");
            if (partsDel.length < 2 || !partsDel[1]) return replier.reply("삭제할 유저 이름을 입력해주세요.");
            var delTarget = matchUser(users, partsDel[1]);
            if (!delTarget) return replier.reply("일치하는 유저를 찾을 수 없습니다.");
            roomData.deleted[delTarget] = JSON.parse(JSON.stringify(users[delTarget]));
            delete users[delTarget];
            save();
            return replier.reply(delTarget + "님의 제련 데이터가 초기화 되었습니다");
        }

        if (msg.indexOf("/복구_") === 0) {
            if (!isAdmin(sender)) return replier.reply("권한이 없습니다");
            var partsRec = msg.split("_");
            if (partsRec.length < 2 || !partsRec[1]) return replier.reply("복구할 유저 이름을 입력해주세요.");
            var recTarget = matchUser(roomData.deleted, partsRec[1]);
            if (!recTarget) return replier.reply("일치하는 유저를 찾을 수 없습니다.");
            users[recTarget] = roomData.deleted[recTarget];
            delete roomData.deleted[recTarget];
            save();
            return replier.reply(recTarget + "님의 제련 데이터가 복구 되었습니다");
        }

        if (msg.indexOf("/지정_") === 0) {
            if (!isAdmin(sender)) return replier.reply("권한이 없습니다");
            var parts = msg.split("_");
            if (parts.length < 3) return replier.reply("형식: /지정_유저이름_숫자");
            var level = parseInt(parts[2], 10);
            if (isNaN(level)) return replier.reply("숫자를 정확히 입력해주세요.");
            var setTarget = matchUser(users, parts[1]);
            if (!setTarget) return replier.reply("일치하는 유저를 찾을 수 없습니다.");
            users[setTarget].level = level;
            save();
            return replier.reply(setTarget + "님의 제련값이 " + level + "으로 설정되었습니다.");
        }

        // ── 이벤트 종료 안내 ──
        if (roomData.boost && now > roomData.boost.until) {
            roomData.boost = null;
            save();
            return replier.reply("제련이벤트가 종료되었습니다");
        }

    } catch (e) {
        // 일반 대화 중에는 조용히 넘어간다 (명령어일 때만 알림)
        try {
            if (String(msg).indexOf("/") === 0) replier.reply("⚠️ 제련봇 오류: " + e);
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
