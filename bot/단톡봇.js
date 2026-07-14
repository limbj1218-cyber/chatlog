/**
 * ═══════════════════════════════════════════════════════════
 *  단톡봇 — 메신저봇R용 카카오톡 봇 (방별 독립 동작)
 *
 *  ◆ 권한
 *    - 최고 관리자: 대화명에 "후파" 포함
 *    - 부관리자: 방에서 /지정 이름조각 으로 지정 (방별 관리)
 *
 *  ◆ 제어실 ("임병진" 일반 채팅방)
 *    - /등록 방이름 → 그 방에서 봇 활성화
 *    - /삭제 방이름 → 비활성화
 *    - /방목록 → 활성 방 목록
 *
 *  ◆ 활성화된 방에서
 *    - /등록 명령어 내용...  → 자동응답 등록 (관리자만, 내용은 띄어쓰기 포함 전부)
 *    - /삭제 명령어          → 자동응답 삭제 (관리자만)
 *    - 등록된 명령어와 메시지가 정확히 일치하면 봇이 내용으로 응답
 *    - /벽타기 → 오늘 대화를 GitHub에 올려 Actions가 요약·게시 (방별 6시간에 1번)
 *    - /목록 /통계 /날씨 /봇 /도움말
 *
 *  모든 데이터(부관리자, 자동응답, 쿨다운, 대화로그)는 방별로 분리 저장.
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "단톡봇";

// ─────────────── 기본 설정 ───────────────
var PREFIX = "/";              // 명령어 접두사
var SUPER_ADMIN = "후파";      // 대화명에 이 문자열이 포함되면 최고 관리자
var CONTROL_ROOM = "임병진";   // 봇 제어실 (방 등록/해제 전용 채팅방)
var WALL_COOLDOWN_HOURS = 6;   // /벽타기 방별 쿨다운 (시간)

// GitHub 연동 (벽타기용) — 배포 후 채우세요
var GITHUB = {
    OWNER: "limbj1218-cyber",
    REPO: "chatlog",
    BRANCH: "main",
    TOKEN: "",       // ← 여기에 Personal Access Token 입력 (이 저장소 Contents 읽기/쓰기 권한만)
    PAGE_BASE: "https://limbj1218-cyber.github.io/chatlog/"
};

var DIRS = {
    LOG: "/sdcard/msgbot/chatlogs",   // 대화 기록
    DATA: "/sdcard/msgbot/botdata"    // 봇 데이터 (부관리자/자동응답/쿨다운)
};
// ────────────────────────────────────────

var BOT_START = new Date();

/** 메신저봇R이 메시지를 받을 때마다 호출 */
function response(room, msg, sender, isGroupChat, replier, imageDB, packageName) {
    try {
        var text = String(msg).trim();

        // ⓪ 진단용 — 등록 여부와 무관하게 모든 방에서 동작
        if (text === PREFIX + "방이름") {
            var saved = "저장 테스트: ";
            try {
                FileStream.write(DIRS.DATA + "/write_test.txt", "ok");
                saved += (String(FileStream.read(DIRS.DATA + "/write_test.txt")) === "ok") ? "정상 ✅" : "실패 ❌";
            } catch (e) { saved += "실패 ❌ (" + e + ")"; }
            replier.reply("🔍 봇이 보는 정보\n" +
                "방 이름: [" + room + "]\n" +
                "보낸 사람: [" + sender + "]\n" +
                "제어실 설정값: [" + CONTROL_ROOM + "]\n" +
                "제어실 일치: " + (room === CONTROL_ROOM ? "예 ✅" : "아니오 ❌") + "\n" +
                "이 방 활성화됨: " + (activeRooms().indexOf(room) !== -1 ? "예 ✅" : "아니오 ❌") + "\n" +
                saved);
            return;
        }

        // ① 제어실
        if (room === CONTROL_ROOM) {
            controlRoom(text, replier);
            return;
        }

        // ② 등록 안 된 방은 완전히 무시
        if (activeRooms().indexOf(room) === -1) return;

        // ③ 대화 기록 (벽타기/통계/일일정리의 원본)
        logMessage(room, sender, msg);

        // ④ /명령어
        if (text.indexOf(PREFIX) === 0) {
            handleCommand(room, text, sender, replier);
            return;
        }

        // ⑤ 등록된 자동응답 — 메시지 전체가 정확히 일치할 때만
        var cmds = loadJson(cmdsPath(room), {});
        if (cmds.hasOwnProperty(text)) replier.reply(cmds[text]);

    } catch (e) {
        try { replier.reply("⚠️ 봇 오류: " + e); } catch (e2) {}
    }
}

// ═══════════════ 제어실 (임병진 방) ═══════════════

function controlRoom(text, replier) {
    if (text.indexOf(PREFIX) !== 0) return;
    var p = splitCmd(text);
    var rooms = activeRooms();

    if (p.cmd === "등록") {
        if (!p.arg) { replier.reply("사용법: " + PREFIX + "등록 방이름"); return; }
        if (rooms.indexOf(p.arg) !== -1) { replier.reply("이미 등록된 방이에요: " + p.arg); return; }
        rooms.push(p.arg);
        saveJson(roomsPath(), rooms);
        replier.reply("✅ 봇 활성화: " + p.arg +
            "\n(카톡에 보이는 방 이름과 한 글자도 다르면 동작하지 않아요)");

    } else if (p.cmd === "삭제") {
        var i = rooms.indexOf(p.arg);
        if (i === -1) { replier.reply("등록되지 않은 방이에요: " + p.arg); return; }
        rooms.splice(i, 1);
        saveJson(roomsPath(), rooms);
        replier.reply("🛑 봇 비활성화: " + p.arg);

    } else if (p.cmd === "방목록") {
        replier.reply(rooms.length
            ? "🤖 활성화된 방 (" + rooms.length + "개)\n- " + rooms.join("\n- ")
            : "활성화된 방이 없어요.\n" + PREFIX + "등록 방이름 으로 추가하세요.");

    } else if (p.cmd === "도움말") {
        replier.reply("🎛️ 제어실 명령어\n" +
            PREFIX + "등록 방이름 — 그 방에서 봇 활성화\n" +
            PREFIX + "삭제 방이름 — 비활성화\n" +
            PREFIX + "방목록 — 활성화된 방 보기");
    }
}

// ═══════════════ 방 명령어 ═══════════════

function handleCommand(room, text, sender, replier) {
    var p = splitCmd(text);
    switch (p.cmd) {
        case "도움말":  replier.reply(helpText(room, sender)); break;
        case "봇":      replier.reply(statusText(room)); break;
        case "지정":    replier.reply(addSub(room, sender, p.arg)); break;
        case "해제":    replier.reply(delSub(room, sender, p.arg)); break;
        case "관리자":  replier.reply(listAdmins(room)); break;
        case "등록":    replier.reply(addCmd(room, sender, p.arg)); break;
        case "삭제":    replier.reply(delCmd(room, sender, p.arg)); break;
        case "목록":    replier.reply(listCmds(room)); break;
        case "벽타기":  replier.reply(wallClimb(room)); break;
        case "통계":    replier.reply(statsText(room)); break;
        case "날씨":    replier.reply(weatherText(p.arg || "서울")); break;
        // 모르는 /명령어는 조용히 무시
    }
}

function helpText(room, sender) {
    var out = "🤖 단톡봇 명령어\n─────────────\n" +
        "누구나:\n" +
        PREFIX + "벽타기 — 오늘 대화 정리해서 페이지 게시 (" + WALL_COOLDOWN_HOURS + "시간에 1번)\n" +
        PREFIX + "목록 — 등록된 자동응답 보기\n" +
        PREFIX + "통계 — 오늘 대화 통계\n" +
        PREFIX + "날씨 지역 — 현재 날씨\n" +
        PREFIX + "봇 — 봇 상태";
    if (isAdmin(room, sender)) {
        out += "\n\n관리자:\n" +
            PREFIX + "등록 명령어 내용 — 자동응답 등록\n" +
            PREFIX + "삭제 명령어 — 자동응답 삭제";
    }
    if (isSuper(sender)) {
        out += "\n\n최고 관리자:\n" +
            PREFIX + "지정 이름 — 부관리자 지정\n" +
            PREFIX + "해제 이름 — 부관리자 해제\n" +
            PREFIX + "관리자 — 관리자 목록";
    }
    return out;
}

function statusText(room) {
    var up = Math.floor((new Date() - BOT_START) / 60000);
    var h = Math.floor(up / 60), m = up % 60;
    var cmds = loadJson(cmdsPath(room), {});
    var n = 0; for (var k in cmds) n++;
    return "🤖 봇 정상 동작 중\n" +
        "방: " + room + "\n" +
        "자동응답: " + n + "개\n" +
        "가동 시간: " + (h > 0 ? h + "시간 " : "") + m + "분";
}

// ─── 부관리자 (방별) ───

function addSub(room, sender, arg) {
    if (!isSuper(sender)) return "⛔ 최고 관리자만 부관리자를 지정할 수 있어요.";
    if (!arg) return "사용법: " + PREFIX + "지정 이름조각\n예: " + PREFIX + "지정 뿡재";
    var subs = loadJson(subsPath(room), []);
    if (subs.indexOf(arg) !== -1) return "이미 지정되어 있어요: " + arg;
    subs.push(arg);
    saveJson(subsPath(room), subs);
    return "✅ 부관리자 지정: 대화명에 「" + arg + "」가 포함된 사람\n(이 방에서만 적용)";
}

function delSub(room, sender, arg) {
    if (!isSuper(sender)) return "⛔ 최고 관리자만 해제할 수 있어요.";
    var subs = loadJson(subsPath(room), []);
    var i = subs.indexOf(arg);
    if (i === -1) return "지정되어 있지 않아요: " + arg;
    subs.splice(i, 1);
    saveJson(subsPath(room), subs);
    return "✅ 부관리자 해제: " + arg;
}

function listAdmins(room) {
    var subs = loadJson(subsPath(room), []);
    return "👑 이 방의 관리자\n─────────────\n" +
        "최고 관리자: 대화명에 「" + SUPER_ADMIN + "」 포함\n" +
        "부관리자: " + (subs.length ? "「" + subs.join("」, 「") + "」 포함" : "(없음)");
}

// ─── 자동응답 (방별) ───

function addCmd(room, sender, arg) {
    if (!isAdmin(room, sender)) return "⛔ 관리자/부관리자만 등록할 수 있어요.";
    var sp = arg.indexOf(" ");
    if (!arg || sp === -1) return "사용법: " + PREFIX + "등록 명령어 내용\n예: " + PREFIX + "등록 안녕 하세요 좋은 날씨입니다.";
    var trigger = arg.substring(0, sp);
    var content = arg.substring(sp + 1);   // 띄어쓰기 포함 전부 내용
    if (trigger.indexOf(PREFIX) === 0) return "⛔ " + PREFIX + "로 시작하는 명령어는 등록할 수 없어요.";
    var cmds = loadJson(cmdsPath(room), {});
    var isNew = !cmds.hasOwnProperty(trigger);
    cmds[trigger] = content;
    saveJson(cmdsPath(room), cmds);
    return (isNew ? "✅ 등록 완료!" : "✏️ 수정 완료!") + "\n「" + trigger + "」 → 「" + content + "」";
}

function delCmd(room, sender, arg) {
    if (!isAdmin(room, sender)) return "⛔ 관리자/부관리자만 삭제할 수 있어요.";
    if (!arg) return "사용법: " + PREFIX + "삭제 명령어";
    var cmds = loadJson(cmdsPath(room), {});
    if (!cmds.hasOwnProperty(arg)) return "등록되지 않은 명령어예요: " + arg;
    delete cmds[arg];
    saveJson(cmdsPath(room), cmds);
    return "🗑️ 삭제 완료: 「" + arg + "」";
}

function listCmds(room) {
    var cmds = loadJson(cmdsPath(room), {});
    var keys = [];
    for (var k in cmds) keys.push(k);
    if (keys.length === 0) return "등록된 자동응답이 없어요.\n" + PREFIX + "등록 명령어 내용 (관리자)";
    keys.sort();
    return "📋 이 방의 자동응답 (" + keys.length + "개)\n─────────────\n" + keys.join("\n");
}

// ─── 벽타기: 오늘 대화 → GitHub → Actions가 요약·게시 ───

function wallClimb(room) {
    if (!GITHUB.TOKEN || !GITHUB.OWNER || !GITHUB.REPO) {
        return "🧗 벽타기가 아직 설정되지 않았어요.\n(스크립트의 GITHUB 설정을 채워주세요)";
    }
    var pageUrl = roomPageUrl(room);

    // 쿨다운 확인 (방별)
    var last = 0;
    try {
        var t = FileStream.read(wallPath(room));
        if (t) last = parseInt(String(t).trim(), 10) || 0;
    } catch (e) {}
    var now = new Date().getTime();
    var remain = WALL_COOLDOWN_HOURS * 3600000 - (now - last);
    if (remain > 0) {
        var rh = Math.floor(remain / 3600000);
        var rm = Math.ceil((remain % 3600000) / 60000);
        return "⏳ 벽타기는 " + WALL_COOLDOWN_HOURS + "시간에 한 번만 가능해요.\n" +
            "다음 가능: " + (rh > 0 ? rh + "시간 " : "") + rm + "분 후\n\n" +
            "📄 지난 정리 보기:\n" + pageUrl;
    }

    // 오늘 로그 확인
    var log = null;
    try { log = FileStream.read(logPath(room)); } catch (e) {}
    if (log === null || log === undefined || String(log).trim() === "") {
        return "📭 오늘 기록된 대화가 없어서 정리할 게 없어요.";
    }

    // GitHub에 업로드 → push가 Actions를 깨워 요약·게시
    var path = "chats/" + safeName(room) + "-" + today() + ".txt";
    var ok = githubPutFile(path, String(log), "벽타기: " + room + " " + today());
    if (!ok) return "⚠️ GitHub 업로드에 실패했어요. 토큰/저장소 설정을 확인해주세요.";

    FileStream.write(wallPath(room), String(now));
    return "🧗 벽타기 시작! 오늘 대화를 정리하고 있어요.\n" +
        "약 2~5분 후 페이지가 갱신됩니다:\n" + pageUrl;
}

function roomPageUrl(room) {
    if (!GITHUB.PAGE_BASE) return "(페이지 주소 미설정)";
    var base = GITHUB.PAGE_BASE;
    if (base.charAt(base.length - 1) !== "/") base += "/";
    return base + "rooms/" + encodeURIComponent(safeName(room)) + "/";
}

// ─── GitHub API ───

function githubPutFile(path, contentStr, message) {
    try {
        var segs = path.split("/");
        for (var i = 0; i < segs.length; i++) segs[i] = encodeURIComponent(segs[i]);
        var url = "https://api.github.com/repos/" + GITHUB.OWNER + "/" + GITHUB.REPO +
            "/contents/" + segs.join("/");

        // 이미 있는 파일이면 sha 필요 (같은 날 두 번째 벽타기 = 덮어쓰기)
        var sha = null;
        var getRes = httpReq("GET", url + "?ref=" + GITHUB.BRANCH, null);
        if (getRes.code === 200) {
            try { sha = JSON.parse(getRes.body).sha; } catch (e) {}
        }

        var body = { message: message, branch: GITHUB.BRANCH, content: base64utf8(contentStr) };
        if (sha) body.sha = sha;

        var putRes = httpReq("PUT", url, JSON.stringify(body));
        return putRes.code === 200 || putRes.code === 201;
    } catch (e) {
        return false;
    }
}

function httpReq(method, urlStr, bodyStr) {
    var conn = new java.net.URL(urlStr).openConnection();
    conn.setRequestMethod(method);
    conn.setRequestProperty("Authorization", "Bearer " + GITHUB.TOKEN);
    conn.setRequestProperty("Accept", "application/vnd.github+json");
    conn.setRequestProperty("User-Agent", "dantalk-bot");
    conn.setConnectTimeout(10000);
    conn.setReadTimeout(20000);
    if (bodyStr) {
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        var os = conn.getOutputStream();
        os.write(new java.lang.String(bodyStr).getBytes("UTF-8"));
        os.close();
    }
    var code = conn.getResponseCode();
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

function base64utf8(str) {
    var bytes = new java.lang.String(str).getBytes("UTF-8");
    return String(android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP));
}

// ─── 통계 / 날씨 ───

function statsText(room) {
    var raw = null;
    try { raw = FileStream.read(logPath(room)); } catch (e) {}
    if (raw === null || raw === undefined || raw === "") {
        return "📊 오늘은 아직 기록된 대화가 없어요.";
    }
    var lines = String(raw).split("\n");
    var re = /^\[(.+?)\] \[오[전후] \d{1,2}:\d{2}\] /;
    var total = 0, counts = {};
    for (var i = 0; i < lines.length; i++) {
        var mch = lines[i].match(re);
        if (!mch) continue; // 여러 줄 메시지의 이어지는 줄은 건너뜀
        total++;
        counts[mch[1]] = (counts[mch[1]] || 0) + 1;
    }
    var people = [];
    for (var name in counts) people.push([name, counts[name]]);
    people.sort(function (a, b) { return b[1] - a[1]; });

    var medals = ["🥇", "🥈", "🥉"];
    var top = "";
    for (var j = 0; j < Math.min(3, people.length); j++) {
        top += "\n" + medals[j] + " " + people[j][0] + " (" + people[j][1] + "개)";
    }
    return "📊 오늘 대화 통계 (" + today() + ")\n─────────────\n" +
        "전체 메시지: " + total + "개\n" +
        "참여 인원: " + people.length + "명\n" +
        "수다왕 TOP3" + (top || "\n(없음)");
}

/** wttr.in 무료 날씨 — API 키 불필요 */
function weatherText(city) {
    try {
        var q = java.net.URLEncoder.encode(city, "UTF-8");
        var fmt = java.net.URLEncoder.encode("%c %t (체감 %f), 습도 %h, 바람 %w", "UTF-8");
        var res = org.jsoup.Jsoup
            .connect("https://wttr.in/" + q + "?format=" + fmt + "&lang=ko&m")
            .ignoreContentType(true)
            .userAgent("curl/8.0")
            .timeout(10000)
            .execute().body();
        res = String(res).trim();
        if (res.indexOf("Unknown location") !== -1) {
            return "🤔 '" + city + "' 지역을 찾지 못했어요.";
        }
        return "🌤️ " + city + " 현재 날씨\n" + res;
    } catch (e) {
        return "⚠️ 날씨 정보를 가져오지 못했어요. 잠시 후 다시 시도해주세요.";
    }
}

// ─── 대화 기록 ───

/** 카톡 내보내기와 같은 형식: [이름] [오후 3:24] 내용 */
function logMessage(room, sender, msg) {
    try {
        FileStream.append(logPath(room), "[" + sender + "] [" + kakaoTime() + "] " + msg + "\n");
    } catch (e) {} // 기록 실패해도 봇 동작에는 지장 없게
}

// ─── 권한 ───

function isSuper(sender) {
    return String(sender).indexOf(SUPER_ADMIN) !== -1;
}

function isAdmin(room, sender) {
    if (isSuper(sender)) return true;
    var subs = loadJson(subsPath(room), []);
    for (var i = 0; i < subs.length; i++) {
        if (String(sender).indexOf(subs[i]) !== -1) return true;
    }
    return false;
}

// ─── 저장소 / 유틸 ───

function loadJson(path, def) {
    try {
        var raw = FileStream.read(path);
        if (raw === null || raw === undefined || String(raw).trim() === "") return def;
        return JSON.parse(String(raw));
    } catch (e) { return def; }
}

function saveJson(path, obj) {
    FileStream.write(path, JSON.stringify(obj));
}

function activeRooms() { return loadJson(roomsPath(), []); }

function splitCmd(text) {
    var body = text.substring(PREFIX.length).trim();
    var sp = body.indexOf(" ");
    return {
        cmd: (sp === -1) ? body : body.substring(0, sp),
        arg: (sp === -1) ? "" : body.substring(sp + 1).trim()
    };
}

function today() {
    var d = new Date();
    var mm = d.getMonth() + 1, dd = d.getDate();
    return d.getFullYear() + "-" + (mm < 10 ? "0" + mm : mm) + "-" + (dd < 10 ? "0" + dd : dd);
}

function kakaoTime() {
    var d = new Date();
    var h = d.getHours(), m = d.getMinutes();
    var ampm = h < 12 ? "오전" : "오후";
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return ampm + " " + h12 + ":" + (m < 10 ? "0" + m : m);
}

function safeName(room) {
    return String(room).replace(/[\\\/:*?"<>|]/g, "_");
}

function roomsPath()      { return DIRS.DATA + "/rooms.json"; }
function cmdsPath(room)   { return DIRS.DATA + "/cmds_" + safeName(room) + ".json"; }
function subsPath(room)   { return DIRS.DATA + "/subs_" + safeName(room) + ".json"; }
function wallPath(room)   { return DIRS.DATA + "/wall_" + safeName(room) + ".txt"; }
function logPath(room)    { return DIRS.LOG + "/" + safeName(room) + "-" + today() + ".txt"; }
