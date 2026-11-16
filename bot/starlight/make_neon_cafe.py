# 메신저봇R 용 bot/카페봇.js 를 StarLight(NeonJS) 용 bot/starlight/카페봇.js 로 바꾼다.
# 카페 로직은 그대로 두고 폰 기능(파일·HTTP·스레드·타이머·먼저 말 걸기·앱 등록)만 __PLAT__ 으로 바꾼다.
# 네트워크가 async 가 되므로 그 길에 있는 함수들(kickWorkflow·fetchCafeFeed·cafeCheck·cafeCycle·
# 진단 명령 셋)도 async 가 되고, 메시지 흐름에서는 기다리지 않고 답이 나오면 그때 보낸다.
# 사용 (저장소 맨 위에서): python bot/starlight/make_neon_cafe.py
import io, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'bot', '카페봇.js')
DST = os.path.join(ROOT, 'bot', 'starlight', '카페봇.js')
s = io.open(SRC, encoding='utf-8').read()


def cut(start_marker, end_marker, new, include_end=False):
    global s
    assert s.count(start_marker) == 1, start_marker
    a = s.index(start_marker)
    b = len(s) if end_marker is None else s.index(end_marker, a)
    if include_end and end_marker is not None:
        b += len(end_marker)
    s = s[:a] + new + s[b:]


def rep(a, b):
    global s
    assert s.count(a) == 1, (a[:80], s.count(a))
    s = s.replace(a, b)


# ── 0. 머리 주석 ──
rep(''' *  ※ 안드로이드 Rhino 엔진 호환을 위해 ES5 문법만 사용한다.
 *  ※ 메시지 처리 스레드에서는 절대 기다리지 않는다 — 봇 전체가 멈춘다.''',
''' *  ◆ StarLight(NeonJS) 판 (2026-11-16) — bot/카페봇.js(메신저봇R 판)를 그대로 두고 따로 만든 것
 *    - 이 파일은 ES 모듈이다. 내보낸 함수 하나(export default)에 본체 전체가 들어 있고,
 *      로더(bot/starlight/카페봇로더.js)가 (방, 토큰, 관리자, 폰 기능 __PLAT__) 을 넘겨 부른다.
 *    - 파일·HTTP·타이머·먼저 말 걸기는 전부 __PLAT__ 으로만 한다 (java·FileStream·Thread 없음).
 *    - 네트워크가 async 라서 기다리는 함수는 전부 async 다. NeonJS 는 await 하는 동안
 *      다른 메시지를 처리하므로 "메시지 스레드에서 기다리면 안 된다"는 걱정이 없다
 *      (그래서 메신저봇R 판의 safeToWait·MSG_THREAD_ID 장치가 없다).
 *    - 카페 로직은 메신저봇R 판과 같다. 메신저봇R 판을 고치면
 *      python bot/starlight/make_neon_cafe.py 로 다시 만든다.''')

# ── 1. 파일·HTTP·백그라운드 ──
cut('// ═══════════════ 앱 호환 계층 ═══════════════', '// ═══════════════ 깃헙 토큰 ═══════════════',
r'''// ═══════════════ 앱 호환 계층 (StarLight NeonJS) ═══════════════
// 파일·HTTP·먼저 말 걸기·타이머는 전부 로더가 준 __PLAT__ 으로만 한다.
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

// ※ 메신저봇R 판과 같은 파일 이름 — 옛 폰의 파일을 data 폴더에 그대로 넣으면 기준 글번호가 이어진다
var BASE_DIR = "";
var STATE_FILE = "카페봇상태.json";
var TOKEN_FILE = "gh_token.txt";

/** 백그라운드 실행 — NeonJS 는 await 하는 동안 다른 메시지를 처리하므로 스레드가 필요 없다 */
function runAsync(fn) {
    try {
        Promise.resolve().then(fn).catch(function (e) { cafeErr = String(e); });
        return true;
    } catch (e) { return false; }
}

function sleepMs(ms) {
    return new Promise(function (ok) { (PLAT.setTimeout || setTimeout)(ok, ms); });
}

// ═══════════════ HTTP ═══════════════

/** opt: { headers: [[이름,값], ...], method: "POST", body: "..." } → Promise<문자열> */
function fetchText(url, opt) {
    opt = opt || {};
    var headers = { "User-Agent": UA };
    if (opt.headers) {
        for (var h = 0; h < opt.headers.length; h++) headers[opt.headers[h][0]] = opt.headers[h][1];
    }
    var f = PLAT.fetch || fetch;
    return f(url, { method: opt.method || "GET", headers: headers, body: opt.body || undefined })
        .then(function (res) {
            LAST_HTTP = Number(res.status);
            return res.text().then(function (t) {
                if (!res.ok) throw "HTTP " + res.status;
                return String(t);
            });
        });
}

''')

# ── 2. 먼저 말 걸기 → PLAT.send ──
cut('/** API2 는 전역 bot 이 아니라 BotManager 로 봇 객체를 가져와야 한다 */',
    '// ═══════════════ 카페 ═══════════════',
r'''/** 방에 먼저 말 걸기 — 로더가 StarLight 방식(봇 send → Chat.findRoom)으로 보낸다 */
function sendToRoom(room, text) {
    var tried = [];
    try {
        if (PLAT.send && PLAT.send(room, text)) { SEND_KIND = "StarLight send"; return true; }
        tried.push("PLAT.send 실패");
    } catch (e) { tried.push("PLAT.send 오류"); }

    try {
        var r = LAST_REPLIER[room];
        if (r && typeof r.reply === "function") {
            r.reply(text); SEND_KIND = "저장해둔 답장 객체"; return true;
        }
        tried.push("저장된 답장 객체 없음");
    } catch (e) { tried.push("저장된 답장 객체 만료"); }

    SEND_TRIED = tried.join(" / ");
    SEND_KIND = "실패 ❌";
    return false;
}

''')

# ── 3. 네트워크를 타는 함수들을 async 로 ──
rep('function kickWorkflow(token) {\n    try {\n', 'async function kickWorkflow(token) {\n    try {\n')
rep('        fetchText(url, {\n            method: "POST",', '        await fetchText(url, {\n            method: "POST",')
rep('function fetchCafeFeed(token) {', 'async function fetchCafeFeed(token) {')
rep('    var txt = fetchText(url, {\n        headers: [', '    var txt = await fetchText(url, {\n        headers: [')
rep('function cafeCheck(noKick) {', 'async function cafeCheck(noKick) {')
rep('    if (!noKick) runAsync(function () { kickWorkflow(token); });',
    '    if (!noKick) runAsync(function () { return kickWorkflow(token); });')
rep('        var j = fetchCafeFeed(token);\n        if (!j || !j.articles)',
    '        var j = await fetchCafeFeed(token);\n        if (!j || !j.articles)')

# cafeCycle — 기다림이 있어도 되는 곳 (await 중에 다른 메시지는 그대로 처리된다)
cut('function cafeCycle() {', '// ═══════════════ 타이머 ═══════════════',
r'''async function cafeCycle() {
    if (cafeCycleRunning) return;
    cafeCycleRunning = true;
    try {
        var token = ghToken();
        if (!token) { await cafeCheck(true); return; }

        var before = cafeUpdatedAt;
        await kickWorkflow(token);

        var waits = [12000, 12000, 15000];   // 12초 → 24초 → 39초
        for (var i = 0; i < waits.length; i++) {
            await sleepMs(waits[i]);
            await cafeCheck(true);
            if (cafeUpdatedAt && cafeUpdatedAt !== before) break;
        }
    } catch (e) {
        cafeErr = String(e);
    } finally {
        cafeCycleRunning = false;
    }
}

''')

# ── 3-2. 중복 발송 막기: JVM 공유값이 없으므로 이 프로젝트 안에서만 ──
cut('''/**
 * 다른 인스턴스가 이미 이 글까지 보냈는지 확인하고, 아니면 내가 보낼 것으로 찜한다.''',
    'function cafeBroadcast(text) {',
r'''/**
 * 이미 이 글까지 보냈는지 확인하고, 아니면 내가 보낼 것으로 찜한다.
 * ※ 메신저봇R 판은 앱 전체(JVM)가 공유하는 값으로 확인해 스크립트가 중복 설치돼도 막았지만,
 *   StarLight 는 프로젝트마다 따로 돌아 그런 공유값이 없다. 여기서는 이 프로젝트 안에서만 막는다
 *   (같은 카페를 보는 프로젝트를 둘 만들면 두 번 나가므로 하나만 둘 것).
 */
var sentUpTo = 0;

function alreadySentByAnother(maxId) {
    if (maxId <= sentUpTo) return true;
    sentUpTo = maxId;
    return false;
}

''')

# ── 4. 타이머: setInterval 하나 (다시 컴파일하면 옛 타이머가 저절로 꺼진다) ──
cut('// ═══════════════ 타이머 ═══════════════', '// ═══════════════ 명령어 ═══════════════',
r'''// ═══════════════ 타이머 ═══════════════
// NeonJS 는 다시 컴파일하면 옛 타이머가 저절로 꺼지므로 세대 장치가 필요 없다.

var TIMER_KIND = "없음 (알림 불가)";
var lastTickAt = 0;

function timerBeat() {
    try {
        var now = new Date().getTime();
        if (now - lastTickAt >= CAFE.checkMin * 60 * 1000) {
            lastTickAt = now;
            runAsync(cafeCycle);
        }
    } catch (e) { cafeErr = String(e); }
    return true;
}

function startTimer() {
    try {
        var si = PLAT.setInterval || (typeof setInterval === "function" ? setInterval : null);
        if (si) { si(timerBeat, 60000); TIMER_KIND = "setInterval"; }
    } catch (e) { cafeErr = "시계 켜기 실패: " + e; }
}

''')

# ── 5. 진단 명령 셋도 async (답이 나오면 그때 보낸다) ──
rep('    var wasFirst = (cafeLastId === 0);\n    cafeCheck(true);',
    '    var wasFirst = (cafeLastId === 0);\n    await cafeCheck(true);')
rep('function setTokenCmd(', 'async function setTokenCmd(')
rep('function cafeDebugCmd(sender) {', 'async function cafeDebugCmd(sender) {')
rep('    var kicked = token ? kickWorkflow(token) : false;\n    cafeCheck(true);',
    '    var kicked = token ? await kickWorkflow(token) : false;\n    await cafeCheck(true);')
rep('        "\\n봇 공인 IP: " + myPublicIp() +', '        "\\n봇 공인 IP: " + (await myPublicIp()) +')
rep('function myPublicIp() {\n    try {\n        var ip = fetchText(',
    'async function myPublicIp() {\n    try {\n        var ip = await fetchText(')
rep('function cafeTestCmd(sender) {', 'async function cafeTestCmd(sender) {')
rep('        var j = fetchCafeFeed(token);\n        var list =', '        var j = await fetchCafeFeed(token);\n        var list =')

# 앱 기능 조사는 StarLight 에선 의미가 없다 (봇 객체를 로더가 감싼다)
cut('function eventProbe() {', '// ═══════════════ 메시지 처리 ═══════════════',
r'''function eventProbe() {
    return "🔍 앱 기능 조사\n─────────────\n" +
        "StarLight 판에서는 로더가 보내기를 맡습니다.\n" +
        "발송 방식: " + SEND_KIND + "\n" +
        "타이머: " + TIMER_KIND + "\n" +
        (SEND_TRIED ? "최근 시도 내역: " + SEND_TRIED : "");
}

''')

# ── 6. 메시지 처리: 기다리는 명령은 답이 나오면 그때 보낸다 ──
rep('        MSG_THREAD_ID = threadId();   // 이 스레드에서는 절대 기다리지 않는다\n\n        text',
    '        text')
rep('''            var tr = setTokenCmd(text.substring((PREFIX + "깃토큰").length), sender, isGroupChat);
            if (tr) replier.reply(tr);
            return;''',
    '''            later(replier, setTokenCmd(text.substring((PREFIX + "깃토큰").length), sender, isGroupChat));
            return;''')
rep('''            var dr = cafeDebugCmd(sender);
            if (dr) replier.reply(dr);
            return;''', '            later(replier, cafeDebugCmd(sender));\n            return;')
rep('''            var nt = cafeTestCmd(sender);
            if (nt) replier.reply(nt);
            return;''', '            later(replier, cafeTestCmd(sender));\n            return;')
rep('var lastErrorReportAt = 0;',
r'''var lastErrorReportAt = 0;

/** 기다려야 답이 나오는 명령 — 나오면 그때 보낸다 (메시지 흐름은 막지 않는다) */
function later(replier, promise) {
    try {
        Promise.resolve(promise).then(function (t) {
            if (t) { try { replier.reply(String(t)); } catch (e) {} }
        }).catch(function (e) {
            cafeErr = String(e);
            try { replier.reply("⚠️ 카페봇 오류: " + e); } catch (e2) {}
        });
    } catch (e) { cafeErr = String(e); }
}''')

# ── 7. 앱 직접 등록 빼고 내보낸 함수로 닫기 ──
cut('// ═══════════════ 앱 API 연결 (직접 붙여넣기용) ═══════════════', None,
r'''// 로더가 준 값 (비어 있으면 본체 기본값)
if (__ROOMS__ && __ROOMS__.length > 0) ROOMS = __ROOMS__;
if (__ADMINS__ && __ADMINS__.length > 0) ADMINS = __ADMINS__;
if (__TOKEN__) GH_TOKEN = __TOKEN__;

// 시계 켜기 (모든 정의가 끝난 뒤)
startTimer();

return {
    response: response,
    version: BOT_VER,
    rooms: function () { return ROOMS.slice(); },
    checkNow: function () { return cafeCycle(); },
    status: function () {
        return {
            on: CAFE.on, lastId: cafeLastId, sent: cafeSentTotal,
            timer: TIMER_KIND, sendKind: SEND_KIND,
            hasToken: !!ghToken(), err: cafeErr
        };
    }
};
}
''')

# 머리 주석이 끝난 바로 뒤에서 함수를 연다
head_end = s.index(' */\n') + 4
s = s[:head_end] + 'export default function cafeBody(__ROOMS__, __TOKEN__, __ADMINS__, __PLAT__) {\n' + s[head_end:]

left = [l for l in s.split('\n')
        if re.search(r'\bjava\.|android\.|JavaAdapter|FileStream\.|BotManager|Api\.replyRoom|threadId\(|safeToWait', l)
        and not l.strip().startswith(('//', '*'))]
assert not left, left

io.open(DST, 'w', encoding='utf-8', newline='').write(s)
print("ok", DST, len(s.split('\n')), "줄")
