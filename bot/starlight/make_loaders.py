# 루나봇로더.js 에서 토마토·레몬·사건 로더를 만든다 (루나봇로더.js 만 손으로 고치고 이걸 돌릴 것).
# 사용 (저장소 맨 위에서): python bot/starlight/make_loaders.py
import io, os

B = os.path.dirname(os.path.abspath(__file__))
LUNA = io.open(os.path.join(B, '루나봇로더.js'), encoding='utf-8').read()


def write(kind, s):
    io.open(os.path.join(B, kind + '봇로더.js'), 'w', encoding='utf-8', newline='').write(s)
    print('ok', kind)


# 토마토·레몬: 이름만 바꾼다
for kind, key in [('토마토', 'tomato'), ('레몬', 'lemon')]:
    write(kind, LUNA.replace('루나', kind).replace('luna', key))

# 사건: 관리자 규칙과 데이터 파일 이름이 다르다
s = LUNA.replace('루나', '사건').replace('luna', 'sageon')


def rep(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)


rep('const MY_ADMINS = ["후파"];   // 대화명에 이 낱말이 들어 있으면 관리자\n',
    '// 본체 관리자 — 정확히 일치 (메신저봇R 판 사건봇로더와 같다). 본체의 EXTRA_ADMIN_PARTS("후파" 포함)도 관리자다\n'
    'const MY_ADMINS = ["사업처임병진", "가이아✡", "가이어트"];\n'
    '// 로더 명령(/사건업데이트·/사건가져오기)을 쓸 수 있는 사람 — 위 이름과 정확히 같거나, 대화명에 이 낱말이 들어 있으면\n'
    'const LOADER_ADMIN_PARTS = ["후파"];\n')
rep('function isLoaderAdmin(sender) {\n    return MY_ADMINS.some((a) => a && String(sender).indexOf(a) !== -1);\n}',
    'function isLoaderAdmin(sender) {\n'
    '    const n = String(sender);\n'
    '    return MY_ADMINS.some((a) => a && n === a) || LOADER_ADMIN_PARTS.some((a) => a && n.indexOf(a) !== -1);\n'
    '}')
# 사건봇은 메신저봇R 때부터 데이터 파일 이름이 Database.json 이다 (제련봇과 같은 이름 — 같은 앱 폴더면 한 파일을 같이 썼다)
rep('const DATA_FILES = [KEY + "_Database.json", "claude_token.txt"];',
    'const DATA_FILES = ["Database.json", "claude_token.txt"];')
rep('데이터 파일(sageon_Database.json·claude_token.txt)', '데이터 파일(Database.json·claude_token.txt)')
write('사건', s)
