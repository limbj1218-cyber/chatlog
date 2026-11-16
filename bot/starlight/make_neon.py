# 메신저봇R 용 본체(bot/루나봇.js 등)를 StarLight NeonJS 용 본체(bot/starlight/…)로 바꾼다.
# 게임 로직은 그대로 두고 폰 기능을 쓰는 부분(파일·스레드·네트워크·타이머·앱 등록)만 __PLAT__ 으로 바꾼다.
# 사용 (저장소 맨 위에서): python bot/starlight/make_neon.py 루나봇 luna
import io, os, re, sys

name, key = sys.argv[1], sys.argv[2]          # 루나봇, luna
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'bot', name + '.js')
DST = os.path.join(ROOT, 'bot', 'starlight', name + '.js')
s = io.open(SRC, encoding='utf-8').read()
DATA_VAR = '__%s_DATA__' % key.upper()

def cut(start_marker, end_marker, new, include_end=False):
    """start_marker 부터 end_marker 앞(또는 포함)까지를 new 로 바꾼다"""
    global s
    a = s.index(start_marker)
    b = s.index(end_marker, a)
    if include_end:
        b += len(end_marker)
    assert s.count(start_marker) == 1, start_marker
    s = s[:a] + new + s[b:]

def rep(a, b):
    global s
    assert s.count(a) == 1, (a[:80], s.count(a))
    s = s.replace(a, b)

# ── 0. 머리 주석의 호환성 안내 ──
cut(' *  ◆ 호환성', ' * ═══════════════════════════════════════════════════════════\n */',
r''' *  ◆ StarLight(NeonJS) 판 (2026-11-16) — bot/%s.js(메신저봇R 판)를 그대로 두고 따로 만든 것
 *    - 이 파일은 ES 모듈이다. 내보낸 함수 하나(export default)에 본체 전체가 들어 있고,
 *      로더(bot/starlight/%s로더.js)가 (방 목록, 관리자, 폰 기능 __PLAT__) 을 넘겨 부른다.
 *    - 파일·보내기·네트워크·타이머는 전부 __PLAT__ 으로만 한다 (java·FileStream·Thread 없음).
 *    - 게임 로직은 메신저봇R 판과 같다. 메신저봇R 판을 고치면 bot/starlight/make_neon.py 로 다시 만든다.
 *    - NeonJS 는 한 번에 한 작업만 돌리므로 메시지가 동시에 처리될 일이 없다.
''' % (name, name))

# ── 1. 파일 읽기·쓰기·저장 폴더 ──
cut('// ═══════════════ 앱 호환 계층 ═══════════════', '// ═══════════════ 데이터 ═══════════════',
r'''// ═══════════════ 앱 호환 계층 (StarLight NeonJS) ═══════════════
// 파일은 로더가 정한 폴더(프로젝트의 data 폴더)에 이름으로만 읽고 쓴다.
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

var BASE_DIR = "";
// ※ 메신저봇R 판과 같은 파일 이름 — 옛 폰의 파일을 프로젝트 data 폴더에 그대로 넣으면 기록이 이어진다
var DATA_FILE = "%s_Database.json";

''' % key)
rep('if (typeof %s === "undefined") %s = null;' % (DATA_VAR, DATA_VAR), 'var %s = null;   // 파일 저장이 막혔을 때 메모리 사본' % DATA_VAR)

# ── 2. 클로드 답변: 스레드·java.net → fetch·setTimeout ──
rep('var ASK_TOKEN_FILE = BASE_DIR + "/claude_token.txt";', 'var ASK_TOKEN_FILE = "claude_token.txt";')
cut('function askSleep(ms) {', 'function askContentsUrl(name) {',
r'''function askSleep(ms) {
    return new Promise(function (ok) { (PLAT.setTimeout || setTimeout)(ok, ms); });
}

/** 백그라운드 실행 — NeonJS 는 fetch 를 기다리는 동안 다른 메시지를 처리하므로 스레드가 필요 없다 */
function askRunAsync(fn) {
    try {
        Promise.resolve().then(fn).catch(function (e) { askLastErr = "오류: " + e; });
        return true;
    } catch (e) { return false; }
}

/** 깃헙 API → Promise<{ code, body }> */
function askHttp(method, url, bodyStr, accept) {
    var headers = {
        "Authorization": "Bearer " + askToken,
        "Accept": accept || "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "chatbot-ask"
    };
    if (bodyStr) headers["Content-Type"] = "application/json; charset=utf-8";
    var f = PLAT.fetch || fetch;
    return f(url, { method: method, headers: headers, body: bodyStr || undefined }).then(function (res) {
        return res.text().then(function (t) { return { code: Number(res.status), body: String(t) }; });
    });
}

var ASK_B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** 문자열 → UTF-8 바이트 */
function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
            var d = str.charCodeAt(i + 1);
            if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
        }
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
}

/** UTF-8 → Base64 (깃헙 Contents API 는 내용을 Base64 로 받는다) */
function askBase64(str) {
    var bytes = utf8Bytes(String(str));
    var out = "", i = 0, n = bytes.length;
    while (i < n) {
        var b0 = bytes[i++];
        var b1 = i < n ? bytes[i++] : -1;
        var b2 = i < n ? bytes[i++] : -1;
        out += ASK_B64.charAt(b0 >> 2);
        out += ASK_B64.charAt(((b0 & 3) << 4) | (b1 < 0 ? 0 : b1 >> 4));
        out += b1 < 0 ? "=" : ASK_B64.charAt(((b1 & 15) << 2) | (b2 < 0 ? 0 : b2 >> 6));
        out += b2 < 0 ? "=" : ASK_B64.charAt(b2 & 63);
    }
    return out;
}

/** 방에 먼저 말 걸기 — 로더가 StarLight 방식(봇 send → Chat.findRoom)으로 보낸다 */
function askSend(room, text) {
    try { if (PLAT.send && PLAT.send(room, text)) return true; } catch (e) {}
    try {
        var r = askReplier[room];
        if (r && typeof r.reply === "function") { r.reply(text); return true; }
    } catch (e) {}
    askLastErr = "방에 보내지 못함 (먼저 말 걸기 불가)";
    return false;
}

''')
cut('/** 백그라운드: 질문 올리기 → 워크플로우 깨우기 → 답 기다렸다 보내기 */', 'function askStatus(room) {',
r'''/** 백그라운드: 질문 올리기 → 워크플로우 깨우기 → 답 기다렸다 보내기 (await 하는 동안 다른 메시지는 그대로 처리된다) */
async function askWork(job) {
    try {
        var put = await askHttp("PUT", askContentsUrl("q-" + job.id + ".json"), JSON.stringify({
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
        var wf = await askHttp("POST", "https://api.github.com/repos/" + ASK.WF_REPO +
            "/actions/workflows/" + ASK.WF_FILE + "/dispatches", JSON.stringify({ ref: ASK.WF_REF }));
        if (wf.code !== 204) {
            askLastErr = "워크플로우 깨우기 실패 (HTTP " + wf.code + ")";
            askSend(job.room, "⚠️ 클로드를 깨우지 못했어요 (깃헙 " + wf.code + ")\n관리자는 /클로드 로 상태를 확인해 주세요.");
            return;
        }

        await askSleep(ASK.FIRST_WAIT_MS);
        var started = new Date().getTime();
        while (new Date().getTime() - started < ASK.GIVE_UP_MS) {
            var got = null;
            try {
                got = await askHttp("GET", askContentsUrl("a-" + job.id + ".json") + "?t=" + new Date().getTime(),
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
            await askSleep(ASK.POLL_MS);
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

''')
rep('    if (!askRunAsync(function () { askWork(job); })) {', '    if (!askRunAsync(function () { return askWork(job); })) {')

# ── 3. 알림 시계: 세대 장치·예비 스레드 없이 setInterval 하나 ──
cut('    if (alarmFallbackOn || ALARM_TIMER === "Thread") return;', '/** 알림 명령이면 답장 문구',
r'''    // NeonJS 판은 예비 시계가 없다 — 다시 컴파일하면 시계도 새로 켜진다
}

''')
cut('function alarmBeat() {', '// ═══════════════ 메시지 처리 ═══════════════',
r'''function alarmBeat() {
    try { alarmTick(new Date().getTime()); } catch (e) { alarmLastErr = "시계 오류: " + e; }
    return true;
}

/** NeonJS 는 다시 컴파일하면 옛 타이머가 저절로 꺼지므로 세대 장치가 필요 없다 */
function alarmStart() {
    try {
        var si = PLAT.setInterval || (typeof setInterval === "function" ? setInterval : null);
        if (si) {
            si(alarmBeat, ALARM.TICK_MS);
            ALARM_TIMER = "setInterval";
        }
    } catch (e) { alarmLastErr = "시계 켜기 실패: " + e; }
}

''')
rep('// ※ 시계는 백그라운드 타이머다(카페봇과 같은 방식: setInterval → java Timer → Thread). 메시지 흐름에서는 대기하지 않는다.',
    '// ※ 시계는 NeonJS 의 setInterval 이다 (StarLight 판). 메시지 흐름에서는 대기하지 않는다.')

# ── 4. 앱 직접 등록 부분 빼고, 내보낸 함수로 감싸기 ──
cut('// ═══════════════ 앱 API 연결 (직접 붙여넣기용) ═══════════════', '// 알림 시계 켜기 (모든 정의가 끝난 뒤)', '')
rep('// 알림 시계 켜기 (모든 정의가 끝난 뒤)\nalarmStart();',
r'''// 로더가 준 방·관리자 (비어 있으면 본체 기본값)
if (__ROOMS__ && __ROOMS__.length > 0) ROOMS = __ROOMS__;
if (__ADMINS__ && __ADMINS__.length > 0) ADMINS = __ADMINS__;

// 알림 시계 켜기 (모든 정의가 끝난 뒤)
alarmStart();

return {
    response: response,
    version: BOT_VER,
    rooms: function () { return ROOMS.slice(); },
    alarmTick: alarmTick,
    status: function () {
        return { dataFile: DATA_FILE, timer: ALARM_TIMER, alarmErr: alarmLastErr, askErr: askLastErr };
    }
};
}''')

# ── 사람 구분: StarLight 의 sender.id 는 쓰지 않는다 (2026-11-16 토마토 방에서 겪음) ──
# StarLight 는 대화명·내용은 이번 메시지에서 읽지만 id 는 알림에 쌓인 메시지 중 **첫 번째(messages[0])** 에서 읽는다
# (AndroidRParserSpec·ConversationShortcutParserSpec·DefaultParserSpec 모두). 그래서 후파의 재련가즈아가
# 바로 앞에 말한 엑시아의 기록으로 처리됐다. 맞는 id 를 얻을 방법이 없어 대화명으로만 사람을 찾는다.
rep('    try { h = who && who.hash ? String(who.hash) : ""; } catch (e) { h = ""; }',
    '    // StarLight 의 id 는 앞 메시지 사람 것이 섞여 오므로 쓰지 않는다 (make_neon.py 참고)')
rep('''function keyByLastName(name) {
    var best = null, bestAt = -1;
    for (var k in people) {''',
'''function keyByLastName(name) {
    // StarLight 판: 최초 대화명이 같은 사람을 먼저 (먼저 생긴 기록부터).
    // 잘못된 id 때문에 최근 대화명(last)이 엉뚱하게 바뀐 기록이 있어도 처음 이름은 그대로라서다.
    for (var k0 in people) {
        if (people.hasOwnProperty(k0) && people[k0].name === name) return k0;
    }
    var best = null, bestAt = -1;
    for (var k in people) {''')
# 본체 버전 뒤에 StarLight 판 고친 횟수를 붙인다 (/○○로더 에서 새 본체인지 보이게)
SL_REV = 2
m = re.search(r'var BOT_VER = "([^"]*)";', s)
rep(m.group(0), 'var BOT_VER = "%ss%d";' % (m.group(1), SL_REV))

# 머리 주석이 끝난 바로 뒤에서 함수를 연다
head_end = s.index(' */\n') + 4
s = s[:head_end] + 'export default function %sBody(__ROOMS__, __ADMINS__, __PLAT__) {\n' % key + s[head_end:]

# 남은 폰 전용 코드가 없는지
left = [l for l in s.split('\n') if re.search(r'\bjava\.|android\.|JavaAdapter|FileStream\.|BotManager|Api\.replyRoom', l) and not l.strip().startswith(('//', '*'))]
assert not left, left

import os
os.makedirs(os.path.dirname(DST), exist_ok=True)
io.open(DST, 'w', encoding='utf-8', newline='').write(s)
print("ok", DST, len(s.split('\n')), "줄")
