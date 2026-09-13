"""대화 기록 — 삭제된 메시지를 시각으로 되짚어 보기 위한 보관소.

카톡은 삭제를 봇에게 알려주지 않으므로(※ 메신저봇R 판 기준), 오는 메시지를
모아뒀다가 나중에 시각으로 대조하는 방식이다. 메신저봇R 판과 동일하게 옮겼다.

※ Arisa2 는 실제로 ``FeedMessageDeleted`` 이벤트를 주므로 나중에 이 부분을
  제대로 고칠 수 있다. 지금은 1:1 이식이라 시각 대조 방식을 유지한다.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

from . import config

_TIME_RE = re.compile(r"(\d{1,2})\s*[:시]\s*(\d{1,2})")
_TIME_COMPACT_RE = re.compile(r"(\d{1,2})(\d{2})\s*$")


@dataclass(slots=True)
class Entry:
    t: str  # "오후 3:24"
    s: str  # 보낸 사람
    m: str  # 내용

    def to_dict(self) -> dict[str, str]:
        return {"t": self.t, "s": self.s, "m": self.m}

    @classmethod
    def from_dict(cls, d: dict) -> "Entry":
        return cls(t=str(d.get("t", "")), s=str(d.get("s", "")), m=str(d.get("m", "")))


def log_time(now: datetime | None = None) -> str:
    """카톡 표기와 같은 "오전 9:05" 형태."""
    d = now or datetime.now()
    ap = "오전" if d.hour < 12 else "오후"
    h = d.hour % 12 or 12
    return f"{ap} {h}:{d.minute:02d}"


def time_to_min(s: str) -> int:
    """"오후 3:24", "3:24", "1530" 같은 표기를 분 단위로. 못 읽으면 -1."""
    t = str(s).strip()
    pm = "오후" in t
    am = "오전" in t

    m = _TIME_RE.search(t)
    if not m:
        m = _TIME_COMPACT_RE.search(t)
        if not m:
            return -1

    hour, minute = int(m.group(1)), int(m.group(2))
    if hour > 23 or minute > 59:
        return -1
    if pm and hour < 12:
        hour += 12
    if am and hour == 12:
        hour = 0
    return hour * 60 + minute


def log_text(entries: list[Entry], target_room: str, around: str = "") -> str:
    """기록 조회 결과 문구."""
    if not entries:
        return (
            f"📭 「{target_room}」 기록이 아직 없어요.\n"
            "(봇이 켜진 뒤에 오는 메시지부터 쌓입니다)"
        )

    if around:
        want = time_to_min(around)
        if want < 0:
            return (
                f"시각을 못 읽었어요: 「{around}」\n"
                f"예) {config.PREFIX}삭제내역1 3:24  /  "
                f"{config.PREFIX}삭제내역1 오후 3:24"
            )

        # 오전/오후를 안 쓰고 12시 이하로 적었으면 양쪽 다 본다 (3:24 → 오전·오후 둘 다)
        wants = [want]
        if "오전" not in around and "오후" not in around and want < 12 * 60:
            wants.append(want + 12 * 60)

        picked = [
            e
            for e in entries
            if (mm := time_to_min(e.t)) >= 0
            and any(abs(mm - w) <= config.LOG_NEAR_MIN for w in wants)
        ]
        if not picked:
            return f"📭 그 시각 근처(±{config.LOG_NEAR_MIN}분)에 기록된 메시지가 없어요."
        if len(picked) > config.LOG_SHOW * 2:
            picked = picked[-config.LOG_SHOW * 2 :]
        head = (
            f"🗂️ 「{target_room}」 {around} 앞뒤 {config.LOG_NEAR_MIN}분 "
            f"({len(picked)}개)"
        )
    else:
        picked = entries[-config.LOG_SHOW :]
        head = (
            f"🗂️ 「{target_room}」 최근 {len(picked)}개 "
            f"(보관 {len(entries)}/{config.LOG_MAX})"
        )

    lines = [head, "─────────────"]
    for e in picked:
        body = e.m.replace("\n", " ")
        if len(body) > 60:
            body = body[:60] + "…"
        lines.append(f"{e.t} {e.s}: {body}")
    lines += [
        "─────────────",
        "※ 어느 게 삭제됐는지는 표시되지 않습니다 (카톡이 봇에게 알려주지 않음).",
        "  방에서 「삭제된 메시지입니다」가 보이는 시각으로 대조하세요.",
    ]
    return "\n".join(lines)


class ChatLog:
    """방마다 최대 ``LOG_MAX`` 개까지 보관한다."""

    def __init__(self, rooms: list[str] | None = None) -> None:
        self.rooms = rooms if rooms is not None else config.LOG_ROOMS
        self.data: dict[str, list[Entry]] = {}
        self.since_flush = 0

    def add(self, room: str, sender: str, message: str, now: datetime | None = None) -> bool:
        """기록했으면 True. 저장할 때가 됐는지는 ``should_flush`` 로 따로 본다."""
        if room not in self.rooms:
            return False
        bucket = self.data.setdefault(room, [])
        bucket.append(Entry(t=log_time(now), s=str(sender), m=str(message)))
        if len(bucket) > config.LOG_MAX:
            del bucket[: len(bucket) - config.LOG_MAX]
        self.since_flush += 1
        return True

    def should_flush(self) -> bool:
        if self.since_flush >= config.LOG_FLUSH_EVERY:
            self.since_flush = 0
            return True
        return False

    def text(self, target_room: str, around: str = "") -> str:
        return log_text(self.data.get(target_room, []), target_room, around)

    def count(self, room: str) -> int:
        return len(self.data.get(room, []))

    def to_dict(self) -> dict[str, list[dict[str, str]]]:
        return {r: [e.to_dict() for e in v] for r, v in self.data.items()}

    def load_dict(self, raw: dict) -> None:
        self.data = {
            str(room): [Entry.from_dict(e) for e in entries if isinstance(e, dict)]
            for room, entries in raw.items()
            if isinstance(entries, list)
        }
