"""자동응답 매칭 — 단말기 없이 돌려볼 수 있는 순수 로직.

메신저봇R 판의 규칙을 그대로 옮겼다.

1. 메시지 **전체 일치**가 언제나 우선이고 쿨다운이 없다.
2. 트리거 이름이 ``*`` 로 시작하면 그 낱말이 **들어 있기만 해도** 응답한다.
3. 포함 매칭의 쿨다운은 트리거 이름이 아니라 **내보낼 내용**으로 묶는다.
   ``*질문`` 과 ``*궁금`` 처럼 같은 안내를 가리키는 낱말이 여럿이어도
   한 방에 20분에 한 번만 나간다.
"""

from __future__ import annotations

import time
from typing import Callable, Mapping

from . import config

Table = dict[str, str]
Data = Mapping[str, Mapping[str, str]]


def table_for(data: Data | None, room: str) -> Table:
    """이 방에 적용되는 트리거표 — 공통 위에 방별을 덮어쓴다."""
    out: Table = {}
    if not data:
        return out
    common = data.get(config.COMMON_KEY)
    if isinstance(common, Mapping):
        out.update({str(k): str(v) for k, v in common.items()})
    own = data.get(room)
    if isinstance(own, Mapping):
        out.update({str(k): str(v) for k, v in own.items()})
    return out


def triggers_of(table: Table) -> list[str]:
    return sorted(table)


def find_contain(table: Table, text: str) -> str | None:
    """메시지 안에 들어 있기만 해도 되는 트리거를 찾는다. 없으면 None."""
    for key in triggers_of(table):
        if not key.startswith(config.CONTAIN_MARK):
            continue
        word = key[len(config.CONTAIN_MARK) :]
        if word and word in text:
            return key
    return None


class Cooldown:
    """포함 트리거가 지금 응답해도 되는지 판단한다.

    묶는 기준(``what``)은 트리거 이름이 아니라 내보낼 내용이다.
    프로세스가 살아 있는 동안만 기억하며, 재시작하면 초기화된다 (원판과 동일).
    """

    def __init__(
        self,
        minutes: int = config.CONTAIN_COOL_MIN,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.seconds = minutes * 60
        self._clock = clock
        self._at: dict[tuple[str, str], float] = {}

    def ready(self, room: str, what: str) -> bool:
        key = (room, what)
        now = self._clock()
        prev = self._at.get(key)
        if prev is not None and now - prev < self.seconds:
            return False
        self._at[key] = now
        return True


def match(
    table: Table,
    text: str,
    room: str,
    cooldown: Cooldown,
) -> str | None:
    """이 메시지에 내보낼 응답. 없거나 쿨다운 중이면 None.

    text 는 앞뒤 공백을 제거한 뒤에 넘길 것.
    """
    if text in table:  # 전체 일치 — 쿨다운 없음
        return table[text]

    key = find_contain(table, text)
    if key is None:
        return None
    body = table[key]
    return body if cooldown.ready(room, body) else None


def list_text(table: Table) -> str:
    keys = triggers_of(table)
    if not keys:
        return "등록된 자동응답이 없어요.\n(관리자에게 등록을 요청하세요)"

    shown = keys[: config.LIST_MAX]
    tail = ""
    if len(keys) > config.LIST_MAX:
        tail = f"\n… 외 {len(keys) - config.LIST_MAX}개"

    lines = [
        (k[len(config.CONTAIN_MARK) :] + "  (말 속에 있어도)")
        if k.startswith(config.CONTAIN_MARK)
        else k
        for k in shown
    ]
    return (
        f"📋 이 방의 자동응답 ({len(keys)}개)\n─────────────\n"
        + "\n".join(lines)
        + tail
    )
