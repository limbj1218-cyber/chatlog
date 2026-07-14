/**
 * ═══════════════════════════════════════════════════════════
 *  단톡봇 — 메신저봇R용 카카오톡 봇 (방별 독립 동작)
 *
 *  ◆ 동작할 방: 아래 ROOMS 목록에 직접 입력 (카톡 방 이름과 정확히 일치)
 *
 *  ◆ 권한
 *    - 최고 관리자: 대화명에 "후파" 포함
 *    - 부관리자: 방에서 /지정 이름조각 으로 지정 (방별 관리)
 *
 *  ◆ 명령어 (활성화된 방에서)
 *    - /등록 명령어 내용...  → 자동응답 등록 (관리자만, 내용은 띄어쓰기 포함 전부)
 *    - /삭제 명령어          → 자동응답 삭제 (관리자만)
 *    - 등록된 명령어와 메시지가 정확히 일치하면 봇이 내용으로 응답
 *    - /벽타기 → 오늘 대화를 GitHub에 올려 Actions가 요약·게시 (방별 6시간에 1번)
 *    - /목록 /통계 /날씨 /봇 /도움말 /방이름(진단)
 *
 *  ◆ 자동 스케줄 (수동 /벽타기와 별개, 같은 페이지를 갱신)
 *    - 02:50/08:50/14:50/20:50 → 새 대화가 있으면 자동 벽타기
 *    - 09:00/15:00/21:00 → 그 방에 오늘 대화가 있으면 그 방 전용 링크를 그 방에만 공지
 *
 *  ◆ 저장: 파일 저장을 시도하고, 실패하면 메모리로 자동 대체.
 *    (메모리 모드에서는 앱을 재시작하면 자동응답/부관리자/오늘 기록이 사라지므로
 *     가능하면 메신저봇R에 "모든 파일 접근" 권한을 주는 것을 권장)
 *
 *  모든 데이터(부관리자, 자동응답, 쿨다운, 대화로그)는 방별로 분리.
 * ═══════════════════════════════════════════════════════════
 */
var scriptName = "단톡봇";

// ─────────────── 봇이 동작할 방 (여기에 직접 입력) ───────────────
var ROOMS = [
    "임병진",
    // "우리 오픈채팅방",     ← 이렇게 쉼표로 계속 추가
    // "두번째 방",
];
// ──────────────────────────────────────────────────────────────

// ─────────────── 기본 설정 ───────────────
var PREFIX = "/";              // 명령어 접두사
var SUPER_ADMIN = "후파";      // 대화명에 이 문자열이 포함되면 최고 관리자
var WALL_COOLDOWN_HOURS = 6;   // /벽타기 방별 쿨다운 (시간)

// 자동 스케줄 (24시간 기준 "HH:MM")
var AUTO_UPLOAD_TIMES = ["02:50", "08:50", "14:50", "20:50"];  // 6시간마다 자동 벽타기
var ANNOUNCE_TIMES    = ["09:00", "15:00", "21:00"];           // 방에 정리 페이지 링크 공지
var CATCHUP_WINDOW_MIN = 180;  // 폰이 자느라 시간을 놓쳤을 때 이 시간(분) 안이면 늦게라도 실행

// GitHub 연동 (벽타기용)
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
            replier.reply(diagText(room, sender));
            return;
        }

        // ① 목록에 없는 방은 완전히 무시
        if (ROOMS.indexOf(room) === -1) return;

        // ② 날짜가 바뀌었으면 어제 로그를 자동 업로드 → 매일 빠짐없이 정리됨
        //    (logMessage가 메모리 버퍼를 오늘 것으로 교체하기 전에 실행해야 함)
        autoUploadYesterday(room);

        // ②-1 스케줄 확인 — 단, 이 메시지가 온 "이 방"의 밀린 일만 처리
        //    (다른 방 것까지 처리하면 한 방의 /벽타기가 다른 방에 공지를 띄우는 것처럼 보임)
        try { schedulerTick(room); } catch (e) {}

        // ③ 대화 기록 (벽타기/통계의 원본)
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

// ═══════════════ 진단 ═══════════════

function diagText(room, sender) {
    var saved = "파일 저장: ";
    try {
        FileStream.write(DIRS.DATA + "/write_test.txt", "ok");
        saved += (String(FileStream.read(DIRS.DATA + "/write_test.txt")) === "ok")
            ? "정상 ✅" : "실패 ❌ (메모리 모드로 동작)";
    } catch (e) { saved += "실패 ❌ (메모리 모드로 동작)"; }
    return "🔍 봇이 보는 정보\n" +
        "방 이름: [" + room + "]\n" +
        "보낸 사람: [" + sender + "]\n" +
        "이 방 활성화됨: " + (ROOMS.indexOf(room) !== -1 ? "예 ✅" : "아니오 ❌ (코드의 ROOMS 목록에 추가하세요)") + "\n" +
        saved;
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
        case "공지":    replier.reply(setNotice(room, sender, p.arg)); break;
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
            PREFIX + "삭제 명령어 — 자동응답 삭제\n" +
            PREFIX + "공지 내용 — 페이지 고정 공지 등록";
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
        "가동 시간: " + (h > 0 ? h + "시간 " : "") + m + "분\n" +
        "자동 벽타기: " + AUTO_UPLOAD_TIMES.join(", ") + "\n" +
        "링크 공지: " + ANNOUNCE_TIMES.join(", ");
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

// ─── 고정 공지 (방별) ───

/**
 * 페이지 상단 고정 공지 등록: 로그에 [공지등록] 마커를 남기면
 * 다음 정리(벽타기/자동정리) 때 Claude가 그 내용을 고정 공지로 반영한다.
 */
function setNotice(room, sender, arg) {
    if (!isAdmin(room, sender)) return "⛔ 관리자/부관리자만 공지를 등록할 수 있어요.";
    if (!arg) return "사용법: " + PREFIX + "공지 내용\n(페이지 상단 고정 공지로 올라갑니다)";
    logMessage(room, sender, "[공지등록] " + arg);
    return "📌 공지 접수!\n「" + arg + "」\n\n다음 정리 때 페이지 상단 고정 공지로 반영됩니다.\n" +
        "(바로 반영하려면 " + PREFIX + "벽타기)";
}

// ─── 벽타기: 오늘 대화 → GitHub → Actions가 요약·게시 ───

function wallClimb(room) {
    if (!GITHUB.TOKEN || !GITHUB.OWNER || !GITHUB.REPO) {
        return "🧗 벽타기가 아직 설정되지 않았어요.\n(스크립트의 GITHUB 설정을 채워주세요)";
    }
    var pageUrl = roomPageUrl(room);

    // 쿨다운 확인 (방별)
    var wall = loadJson(wallPath(room), { t: 0 });
    var now = new Date().getTime();
    var remain = WALL_COOLDOWN_HOURS * 3600000 - (now - (wall.t || 0));
    // 쿨다운 중: 링크만 (카톡이 미리보기 카드를 자동으로 붙이므로 텍스트는 생략)
    if (remain > 0) {
        return pageUrl;
    }

    // 오늘 로그 확인 (파일 → 실패 시 메모리)
    var log = readTodayLog(room);
    if (!log) {
        return "📭 오늘 기록된 대화가 없어서 정리할 게 없어요.\n(봇이 켜진 이후의 대화만 기록됩니다)";
    }

    // GitHub에 업로드 → push가 Actions를 깨워 요약·게시
    var path = "chats/" + safeName(room) + "-" + today() + ".txt";
    var ok = githubPutFile(path, log, "벽타기: " + room + " " + today());
    if (!ok) return "⚠️ GitHub 업로드에 실패했어요. 토큰/저장소 설정을 확인해주세요.";

    saveJson(wallPath(room), { t: now });
    markUploaded(room, log);   // 자동 벽타기가 같은 내용을 또 올리지 않게
    // 링크만 발송 (카톡 미리보기 카드가 제목·설명을 대신함 → 말풍선 하나로 보임)
    return pageUrl;
}

// ═══════════════ 자동 스케줄러 (자동 벽타기 + 링크 공지) ═══════════════
//
// - AUTO_UPLOAD_TIMES: 새 대화가 있을 때만 오늘 로그를 자동 업로드 (수동 /벽타기 쿨다운과 무관)
// - ANNOUNCE_TIMES: 방별 독립 — 그 방에 오늘 대화가 있으면 그 방 전용 링크를 그 방에만 공지
// - 실행 여부는 방별 상태 파일에 날짜로 기록해 중복 실행을 막고,
//   폰이 자느라 정각을 놓쳐도 CATCHUP_WINDOW_MIN 안이면 늦게라도 실행한다.
// - /업데이트 로 코드를 다시 불러와도 타이머가 중복되지 않게 JVM 프로퍼티로 세대를 관리한다.

var TIMER_GEN = String(new Date().getTime());
java.lang.System.setProperty("dantalk.timer.gen", TIMER_GEN);

(function startScheduler() {
    var timer = new java.util.Timer("dantalk-scheduler", true);
    timer.schedule(new JavaAdapter(java.util.TimerTask, {
        run: function () {
            try {
                // 새 코드가 로드됐으면 이 (옛) 타이머는 스스로 멈춤
                if (String(java.lang.System.getProperty("dantalk.timer.gen")) !== TIMER_GEN) {
                    this.cancel();
                    return;
                }
                schedulerTick();
            } catch (e) {}
        }
    }), 20000, 60000);   // 20초 후 시작, 1분마다
})();

/**
 * 스케줄 실행. onlyRoom을 주면 그 방의 밀린 일만 처리 (메시지 수신으로 깨어난 경우),
 * 없으면 전체 방 처리 (1분 타이머가 제시간에 도는 경우).
 */
function schedulerTick(onlyRoom) {
    var nowMin = minutesOfDay();
    var t = today();
    var targets = onlyRoom ? [onlyRoom] : ROOMS;
    for (var i = 0; i < targets.length; i++) {
        var room = targets[i];
        var st = loadJson(schedPath(room), {});
        var changed = false;
        var j, key, sMin;
        for (j = 0; j < AUTO_UPLOAD_TIMES.length; j++) {
            sMin = toMinutes(AUTO_UPLOAD_TIMES[j]);
            key = "up_" + AUTO_UPLOAD_TIMES[j];
            if (nowMin >= sMin && nowMin - sMin <= CATCHUP_WINDOW_MIN && st[key] !== t) {
                st[key] = t; changed = true;
                autoUpload(room, st);
            }
        }
        for (j = 0; j < ANNOUNCE_TIMES.length; j++) {
            sMin = toMinutes(ANNOUNCE_TIMES[j]);
            key = "an_" + ANNOUNCE_TIMES[j];
            if (nowMin >= sMin && nowMin - sMin <= CATCHUP_WINDOW_MIN && st[key] !== t) {
                st[key] = t; changed = true;
                announcePage(room);
            }
        }
        if (changed) saveJson(schedPath(room), st);
    }
}

/** 새 대화가 있을 때만 오늘 로그를 자동 업로드 */
function autoUpload(room, st) {
    if (!GITHUB.TOKEN) return;
    var log = readTodayLog(room);
    if (!log) return;
    if (st.upLen === log.length) return;   // 지난 업로드 이후 변화 없음
    var path = "chats/" + safeName(room) + "-" + today() + ".txt";
    if (githubPutFile(path, log, "자동 벽타기: " + room + " " + today())) {
        st.upLen = log.length;
    }
}

/**
 * 정시 링크 공지 — 방별로 완전히 독립.
 * 그 방에 오늘 대화가 있을 때만, 그 방 전용 링크를 그 방에만 발송 (링크 1개).
 * 대화가 전혀 없던 방은 조용히 건너뜀 (도배 방지).
 */
function announcePage(room) {
    if (!readTodayLog(room)) return;
    // 링크만 발송 (카톡 미리보기 카드가 제목·설명을 대신함 → 말풍선 하나로 보임)
    try {
        Api.replyRoom(room, roomPageUrl(room));
    } catch (e) {}
}

/** 수동 /벽타기 성공 시 업로드 기준점 갱신 (자동 벽타기가 같은 내용을 또 올리지 않게) */
function markUploaded(room, log) {
    var st = loadJson(schedPath(room), {});
    st.upLen = log.length;
    saveJson(schedPath(room), st);
}

function minutesOfDay() {
    var d = new Date();
    return d.getHours() * 60 + d.getMinutes();
}

function toMinutes(hm) {
    var p = hm.split(":");
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
}

function roomPageUrl(room) {
    var base = GITHUB.PAGE_BASE;
    if (!base) return "(페이지 주소 미설정)";
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
    var raw = readTodayLog(room);
    if (!raw) return "📊 오늘은 아직 기록된 대화가 없어요.";
    var lines = raw.split("\n");
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

// ═══════════════ 대화 기록 (파일 + 메모리 이중화) ═══════════════

var MEMLOG = {};   // room → { date, lines[] }  (파일 저장 실패 대비)

/** 카톡 내보내기와 같은 형식: [이름] [오후 3:24] 내용 */
function logMessage(room, sender, msg) {
    var line = "[" + sender + "] [" + kakaoTime() + "] " + msg;
    // 메모리 기록 (오늘 것만 유지, 최대 5000줄)
    var buf = MEMLOG[room];
    if (!buf || buf.date !== today()) buf = MEMLOG[room] = { date: today(), lines: [] };
    buf.lines.push(line);
    if (buf.lines.length > 5000) buf.lines.shift();
    // 파일 기록 (되면 좋고, 안 되면 메모리로 충분)
    try { FileStream.append(logPath(room), line + "\n"); } catch (e) {}
}

/** 특정 날짜 로그: 파일이 있으면 파일, 없으면 메모리 */
function readLogFor(room, date) {
    var raw = null;
    try { raw = FileStream.read(DIRS.LOG + "/" + safeName(room) + "-" + date + ".txt"); } catch (e) {}
    if (raw !== null && raw !== undefined && String(raw).trim() !== "") return String(raw);
    var buf = MEMLOG[room];
    if (buf && buf.date === date && buf.lines.length > 0) return buf.lines.join("\n") + "\n";
    return null;
}

function readTodayLog(room) { return readLogFor(room, today()); }

/**
 * 날짜 전환 감지: 이 방의 마지막 활동일이 오늘이 아니면,
 * 그날(어제) 로그를 GitHub에 자동 업로드해서 정리가 누락되지 않게 한다.
 * (그날 /벽타기를 이미 했더라도 전체 하루치로 다시 올려 최종본으로 갱신)
 */
function autoUploadYesterday(room) {
    var st = loadJson(statePath(room), { lastDate: null });
    var t = today();
    if (st.lastDate === t) return;
    var prev = st.lastDate;
    st.lastDate = t;
    saveJson(statePath(room), st);          // 먼저 저장해서 중복 업로드 방지
    if (!prev || !GITHUB.TOKEN) return;     // 첫 실행이거나 토큰 없으면 통과
    var log = readLogFor(room, prev);
    if (!log) return;                        // 그날 기록이 없으면 통과
    var path = "chats/" + safeName(room) + "-" + prev + ".txt";
    githubPutFile(path, log, "자동정리: " + room + " " + prev);
    // 조용히 처리 (방에 메시지 안 보냄)
}

// ═══════════════ 권한 ═══════════════

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

// ═══════════════ 저장소 (파일 + 메모리 이중화) ═══════════════

var MEM = {};   // 파일 저장 실패 시 대체 저장소 (앱 재시작 전까지 유지)

function loadJson(path, def) {
    try {
        var raw = FileStream.read(path);
        if (raw !== null && raw !== undefined && String(raw).trim() !== "") {
            return JSON.parse(String(raw));
        }
    } catch (e) {}
    return MEM.hasOwnProperty(path) ? MEM[path] : def;
}

function saveJson(path, obj) {
    MEM[path] = obj;   // 메모리에 항상 저장
    try { FileStream.write(path, JSON.stringify(obj)); } catch (e) {}
}

// ═══════════════ 유틸 ═══════════════

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

function cmdsPath(room)   { return DIRS.DATA + "/cmds_" + safeName(room) + ".json"; }
function statePath(room)  { return DIRS.DATA + "/state_" + safeName(room) + ".json"; }
function schedPath(room)  { return DIRS.DATA + "/sched_" + safeName(room) + ".json"; }
function subsPath(room)   { return DIRS.DATA + "/subs_" + safeName(room) + ".json"; }
function wallPath(room)   { return DIRS.DATA + "/wall_" + safeName(room) + ".json"; }
function logPath(room)    { return DIRS.LOG + "/" + safeName(room) + "-" + today() + ".txt"; }
