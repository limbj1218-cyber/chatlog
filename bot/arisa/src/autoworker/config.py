"""설정 — 여기만 고치면 된다.

메신저봇R 판(bot/오토봇.js, bot/카페봇.js)의 설정을 그대로 옮겨 왔다.
값을 바꿀 때는 두 곳이 어긋나지 않게 주의할 것.
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import quote

# ─────────────── 환경 변수 (.env 또는 시스템 환경) ───────────────


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or "").strip() or default


#: arisa 바이너리가 떠 있는 주소. 단말기가 다른 기기면 그 기기의 IP 를 넣는다.
ARISA_TARGET = _env("ARISA_TARGET", "127.0.0.1:3000")

#: 카페 알림용 깃헙 토큰 (cafe-watch 읽기 + chatlog Actions 쓰기).
#: ★ 절대 코드에 적지 말고 .env 로만 준다. .env 는 깃헙에 올리지 않는다.
GITHUB_TOKEN = _env("GITHUB_TOKEN")

#: 캐시·대화기록·상태 파일을 둘 곳
DATA_DIR = Path(_env("AUTOWORKER_DATA_DIR", str(Path.home() / ".autoworker-bot")))

# ─────────────── 공통 ───────────────

PREFIX = "/"

#: 대화명에 이 문자열이 들어 있으면 관리자
ADMINS = ["후파", "임병진", "[오차율 계산봇]"]

#: 자동응답이 동작하는 방
ROOMS = ["오토2프프", "오토2"]
EXTRA_ROOMS = ["[오차율 계산봇]", "공백기 근무표"]
ALL_ROOMS = ROOMS + EXTRA_ROOMS

# ─────────────── 오토봇 (자동응답) ───────────────

COMMON_KEY = "_공통"

#: 트리거 이름이 이 글자로 시작하면 "메시지에 들어 있기만 해도" 응답한다
CONTAIN_MARK = "*"

#: 같은 안내는 방마다 이 분 안에 한 번만 (일상 대화에 섞여 나오는 말이라)
CONTAIN_COOL_MIN = 20

#: 자동응답 데이터 갱신 주기 (분)
REFRESH_MIN = 30

#: /리스트 에 한 번에 보여줄 최대 개수
LIST_MAX = 30

DATA_URL = (
    "https://raw.githubusercontent.com/limbj1218-cyber/chatlog/main/bot/"
    + quote("오토봇데이터.json")
)

# ─────────────── 대화 기록 ───────────────

#: 기록할 방
LOG_ROOMS = ["오토2", "오토2프프", "공백기 근무표"]

#: 조회 명령을 쓸 수 있는 방
VIEW_ROOM = "공백기 근무표"

LOG_MAX = 3000  # 방마다 보관할 최대 개수
LOG_SHOW = 15  # 한 번에 보여줄 개수
LOG_NEAR_MIN = 5  # 시각으로 찾을 때 앞뒤 몇 분까지
LOG_FLUSH_EVERY = 100  # 몇 개마다 파일로 저장할지

#: 조회 명령 → 어느 방의 기록을 보여줄지
LOG_CMDS: list[tuple[str, str]] = [
    ("삭제내역", VIEW_ROOM),
    ("삭제내역1", "오토2"),
    ("삭제내역2", "오토2프프"),
]

# ─────────────── 카페봇 (네이버 카페 새글 알림) ───────────────

CAFE_ON = True  # False 면 알림 기능 전체 정지
CAFE_URL = "autoworker2"  # 링크용 주소 (cafe.naver.com/이것/글번호)
CAFE_NAME = "오토워커"  # 알림 제목에 쓰는 이름
CAFE_ROOMS = ["오토2프프", "오토2"]  # 알림 보낼 방
CAFE_CHECK_MIN = 3  # 확인 주기 (분)
CAFE_MAX_NOTIFY = 5  # 한 번에 알릴 최대 글 수 (넘으면 "외 N건")
CAFE_MENU_IDS: list[int] = []  # 특정 게시판만 알리려면 menuId. 빈 목록 = 전체

#: 깃헙 Actions 가 갱신하는 비공개 저장소의 최신글 목록
GH_REPO = "limbj1218-cyber/cafe-watch"
GH_PATH = "latest.json"

#: 그 목록을 만드는 워크플로우 (봇이 직접 깨운다)
WF_REPO = "limbj1218-cyber/chatlog"
WF_FILE = "cafe-watch.yml"
WF_REF = "main"

#: 깨운 뒤 결과가 올라오길 기다리는 간격 (초) — 메신저봇R 판과 동일
CAFE_WAIT_STEPS = [12, 12, 15]


def cafe_article_url(article_id: int | str) -> str:
    return f"https://cafe.naver.com/{CAFE_URL}/{article_id}"


def is_admin(sender: str) -> bool:
    """대화명에 관리자 문자열이 들어 있으면 관리자."""
    name = str(sender)
    return any(a in name for a in ADMINS)


def in_rooms(room: str) -> bool:
    return room in ALL_ROOMS
