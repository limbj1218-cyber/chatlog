# 메신저봇R 용 bot/오토봇.js 를 StarLight(NeonJS) 용 bot/starlight/오토봇.js 로 바꾼다.
# 자동응답 로직은 그대로 두고 폰 기능(파일·네트워크·백그라운드·앱 등록)만 __PLAT__ 으로 바꾼다.
# 사용 (저장소 맨 위에서): python bot/starlight/make_neon_auto.py
import io, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'bot', '오토봇.js')
DST = os.path.join(ROOT, 'bot', 'starlight', '오토봇.js')
s = io.open(SRC, encoding='utf-8').read()


def cut(start_marker, end_marker, new, include_end=False):
    """start_marker 부터 end_marker 앞(또는 포함)까지를 new 로 바꾼다. end_marker 가 None 이면 끝까지."""
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


# ── 0. 머리 주석의 호환성 안내 ──
cut(' *  ◆ 호환성', ' * ═══════════════════════════════════════════════════════════\n */',
r''' *  ◆ StarLight(NeonJS) 판 (2026-11-16) — bot/오토봇.js(메신저봇R 판)를 그대로 두고 따로 만든 것
 *    - 이 파일은 ES 모듈이다. 내보낸 함수 하나(export default)에 본체 전체가 들어 있고,
 *      로더(bot/starlight/오토봇로더.js)가 (방 목록, 폰 기능 __PLAT__) 을 넘겨 부른다.
 *    - 파일·네트워크는 전부 __PLAT__ 으로만 한다 (java·FileStream·Thread 없음).
 *    - 자동응답 로직은 메신저봇R 판과 같다. 메신저봇R 판을 고치면
 *      python bot/starlight/make_neon_auto.py 로 다시 만든다.
 *    - NeonJS 는 한 번에 한 작업만 돌리므로 메시지가 동시에 처리될 일이 없다.
''')

# ── 1. 파일·네트워크·백그라운드 ──
cut('// ═══════════════ 앱 호환 계층 ═══════════════',
    '// ═══════════════ 자동응답 데이터 ═══════════════',
r'''// ═══════════════ 앱 호환 계층 (StarLight NeonJS) ═══════════════
// 파일·네트워크·백그라운드는 전부 로더가 준 __PLAT__ 으로만 한다 (java·FileStream·Thread 없음).
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

// ※ 메신저봇R 판과 같은 파일 이름 — 옛 폰의 파일을 data 폴더에 그대로 넣으면 기록이 이어진다
var BASE_DIR = "";
var CACHE_FILE = "오토봇캐시.json";
var LOG_FILE = "대화기록.json";
var PEOPLE_FILE = "사람.json";
for (var ki = 0; ki < REG_KINDS.length; ki++) {
    REG_KINDS[ki].path = REG_KINDS[ki].file;
}

/** 깃헙에서 텍스트 가져오기 → Promise<문자열> */
function fetchText(url) {
    var f = PLAT.fetch || fetch;
    return f(url, { headers: { "User-Agent": UA } }).then(function (res) {
        if (!res.ok) throw "HTTP " + res.status;
        return res.text().then(function (t) { return String(t); });
    });
}

/** 백그라운드 실행 — NeonJS 는 await 하는 동안 다른 메시지를 처리하므로 스레드가 필요 없다 */
function runAsync(fn) {
    try {
        Promise.resolve().then(fn).catch(function (e) { lastLoadErr = String(e); });
        return true;
    } catch (e) { return false; }
}

''')

# ── 2. 깃헙에서 받아오기는 async ──
rep('''function loadData() {
    lastLoadAt = new Date().getTime();
    try {
        // 중간 캐시된 옛 내용이 오지 않도록 시각을 붙인다
        var txt = fetchText(DATA_URL + "?t=" + lastLoadAt);''',
    '''async function loadData() {
    lastLoadAt = new Date().getTime();
    try {
        // 중간 캐시된 옛 내용이 오지 않도록 시각을 붙인다
        var txt = await fetchText(DATA_URL + "?t=" + lastLoadAt);''')
rep('    runAsync(function () { loadData(); });\n}',
    '    runAsync(function () { return loadData(); });\n}')
rep('            if (DATA === null) { runAsync(function () { return loadData(); }); return; }\n'
    if '            if (DATA === null) { runAsync(function () { return loadData(); }); return; }\n' in s
    else '            if (DATA === null) { runAsync(function () { loadData(); }); return; }\n',
    '            if (DATA === null) { runAsync(function () { return loadData(); }); return; }\n')

# ── 3. 앱 직접 등록·옛 타이머 끄기를 빼고 내보낸 함수로 닫는다 ──
cut('\n// 예전 오토봇(카페 알림이 들어 있던 버전)이 걸어둔 타이머 끄기.', None,
r'''
// 로더가 준 방 목록 (비어 있으면 본체 기본값)
if (__ROOMS__ && __ROOMS__.length > 0) ROOMS = __ROOMS__;

// 스크립트가 켜질 때 미리 받아둔다 (기다리지 않고 백그라운드로)
runAsync(function () { return loadData(); });

return {
    response: response,
    version: BOT_VER,
    rooms: function () { return ROOMS.concat(EXTRA_ROOMS); },
    reload: function () { return loadData(); },
    status: function () {
        return {
            dataFrom: DATA_FROM,
            lastOkAt: lastOkAt ? lastOkAt.toLocaleString() : null,
            loadErr: lastLoadErr, logErr: lastLogErr,
            regErr: lastRegErr, peopleErr: lastPeopleErr
        };
    }
};
}
''')

# 머리 주석이 끝난 바로 뒤에서 함수를 연다
head_end = s.index(' */\n') + 4
s = s[:head_end] + 'export default function autoBody(__ROOMS__, __PLAT__) {\n' + s[head_end:]

# 남은 폰 전용 코드가 없는지
left = [l for l in s.split('\n')
        if re.search(r'\bjava\.|android\.|JavaAdapter|FileStream\.|BotManager|Api\.replyRoom', l)
        and not l.strip().startswith(('//', '*'))]
assert not left, left

io.open(DST, 'w', encoding='utf-8', newline='').write(s)
print("ok", DST, len(s.split('\n')), "줄")
