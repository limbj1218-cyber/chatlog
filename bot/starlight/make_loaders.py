# StarLight 로더를 만든다 (2026-11-17 부터 로더 = 틀 + 로더 코어).
#  ① 틀(폰에 붙여넣는 것, 거의 안 바뀜): 로더틀.js → 루나·토마토·레몬·거북·사건·오토·카페 봇로더.js
#  ② 로더 코어(깃헙에서 받음, /○○업데이트 로 바뀜): 루나봇로더코어.js → 토마토·레몬·거북·사건 봇로더코어.js
#     오토봇로더코어.js·카페봇로더코어.js 는 손으로 고친다.
# 손으로 고치는 건 로더틀.js·루나봇로더코어.js·오토봇로더코어.js·카페봇로더코어.js 뿐이다 — 고친 뒤 이걸 돌릴 것.
# 사용 (저장소 맨 위에서): python bot/starlight/make_loaders.py
import io, os

B = os.path.dirname(os.path.abspath(__file__))


def read(name):
    return io.open(os.path.join(B, name), encoding='utf-8', newline='').read()


def write(name, s):
    io.open(os.path.join(B, name), 'w', encoding='utf-8', newline='').write(s)
    print('ok', name)


# ── ① 틀 ──
STUB = read('로더틀.js')
KAKAO_NOTE = ('\n *      + 카톡 DB 플러그인(KakaoDB)이 연결돼 있으면 kakaodb.member.join · kakaodb.member.leave ·\n'
              ' *        kakaodb.message.create · kakaodb.message.delete 도 체크 (입퇴장·닉변·삭제 감지).\n'
              ' *        플러그인 설정의 "onMessage 호환 이벤트" 는 꺼 둘 것 (메시지가 두 번 온다)')
STUBS = [
    # (이름, KEY, 업데이트 명령, 상태 명령, 비상 관리자, 카톡 DB 이벤트를 쓰나)
    ('루나', 'luna', '/루나업데이트', '/루나로더', '["후파"]', True),
    ('토마토', 'tomato', '/토마토업데이트', '/토마토로더', '["후파"]', True),
    ('레몬', 'lemon', '/레몬업데이트', '/레몬로더', '["후파"]', True),
    ('거북', 'turtle', '/거북업데이트', '/거북로더', '["후파"]', True),
    ('사건', 'sageon', '/사건업데이트', '/사건로더', '["후파"]', True),
    ('오토', 'auto', '/오토업데이트', '/오토로더', '["후파", "임병진"]', True),
    ('카페', 'cafe', '/카페업데이트', '/카페로더', '["후파", "임병진"]', False),
]
for kind, key, cmd_up, cmd_info, rescue, kakao in STUBS:
    s = (STUB.replace('__BOT_NAME__', kind + '봇').replace('__KEY__', key)
         .replace('__CMD_UPDATE__', cmd_up).replace('__CMD_INFO__', cmd_info)
         .replace('__RESCUE__', rescue).replace('__KAKAO_NOTE__', KAKAO_NOTE if kakao else ''))
    assert '__' not in s.replace('__KEY___', ''), kind
    write(kind + '봇로더.js', s)

# ── ② 게임봇 로더 코어 ──
LUNA = read('루나봇로더코어.js')
MADE = (' *    - 토마토·레몬·사건 코어는 make_loaders.py 가 이 파일에서 만든다 — 이 파일만 손으로 고칠 것\n')
assert LUNA.count(MADE) == 1
GEN = ' *    - make_loaders.py 가 루나봇로더코어.js 에서 만든 파일이다 — 손으로 고치지 말 것\n'

# 토마토·레몬·거북: 이름만 바꾼다
for kind, key in [('토마토', 'tomato'), ('레몬', 'lemon'), ('거북', 'turtle')]:
    write(kind + '봇로더코어.js', LUNA.replace(MADE, GEN).replace('루나', kind).replace('luna', key))

# 사건: 관리자 규칙과 데이터 파일 이름이 다르다
s = LUNA.replace(MADE, GEN).replace('루나', '사건').replace('luna', 'sageon')


def rep(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)


rep('    const MY_ADMINS = CFG.MY_ADMINS !== undefined && CFG.MY_ADMINS !== null ? CFG.MY_ADMINS : ["후파"];'
    '   // 대화명에 이 낱말이 들어 있으면 관리자\n',
    '    // 본체 관리자 — 정확히 일치 (메신저봇R 판 사건봇로더와 같다). 본체의 EXTRA_ADMIN_PARTS("후파" 포함)도 관리자다\n'
    '    const MY_ADMINS = CFG.MY_ADMINS !== undefined && CFG.MY_ADMINS !== null ? CFG.MY_ADMINS :\n'
    '        ["사업처임병진", "가이아✡", "가이어트"];\n'
    '    // 로더 명령(/사건업데이트·/사건가져오기)을 쓸 수 있는 사람 — 위 이름과 정확히 같거나, 대화명에 이 낱말이 들어 있으면\n'
    '    const LOADER_ADMIN_PARTS = CFG.LOADER_ADMIN_PARTS || ["후파"];\n')
rep('    function isLoaderAdmin(sender) {\n        return MY_ADMINS.some((a) => a && String(sender).indexOf(a) !== -1);\n    }',
    '    function isLoaderAdmin(sender) {\n'
    '        const n = String(sender);\n'
    '        return MY_ADMINS.some((a) => a && n === a) || LOADER_ADMIN_PARTS.some((a) => a && n.indexOf(a) !== -1);\n'
    '    }')
# 사건봇은 메신저봇R 때부터 데이터 파일 이름이 Database.json 이다 (제련봇과 같은 이름 — 같은 앱 폴더면 한 파일을 같이 썼다)
rep('    const DATA_FILES = [KEY + "_Database.json", "claude_token.txt"];',
    '    const DATA_FILES = ["Database.json", "claude_token.txt"];')
rep('데이터 파일(sageon_Database.json·claude_token.txt)', '데이터 파일(Database.json·claude_token.txt)')
write('사건봇로더코어.js', s)
