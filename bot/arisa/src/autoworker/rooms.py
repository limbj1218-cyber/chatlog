"""방 이름 ↔ channel_id.

설정은 사람이 읽는 **방 이름**으로 쓰지만 Arisa2 는 숫자 ``channel_id`` 로 다룬다.
메시지가 올 때마다 짝을 배워서 디스크에 남기므로, 봇을 껐다 켜도 기억한다.

※ 처음 켠 직후에는 아직 배운 방이 없다. 카페 새글 알림처럼 **먼저 말 거는**
  기능은 그 방에서 메시지가 한 번 올라온 뒤부터 동작한다.
  급하면 각 방에서 ``/방정보`` 를 한 번씩 쳐주면 된다.
"""

from __future__ import annotations

import logging

from .store import Store

log = logging.getLogger(__name__)

ROOMS_NAME = "rooms.json"


class RoomMap:
    def __init__(self, store: Store) -> None:
        self.store = store
        self.by_name: dict[str, int] = {}
        raw = store.read_json(ROOMS_NAME)
        if isinstance(raw, dict):
            for name, cid in raw.items():
                try:
                    self.by_name[str(name)] = int(cid)
                except (TypeError, ValueError):
                    continue

    def learn(self, name: str, channel_id: int) -> None:
        if not name:
            return
        if self.by_name.get(name) == channel_id:
            return
        self.by_name[name] = channel_id
        self.store.write_json(ROOMS_NAME, self.by_name)
        log.info("방을 기억했습니다: %s → %s", name, channel_id)

    def id_for(self, name: str) -> int | None:
        return self.by_name.get(name)

    def known_text(self) -> str:
        if not self.by_name:
            return "(아직 배운 방이 없어요)"
        return "\n".join(f"  {name} → {cid}" for name, cid in sorted(self.by_name.items()))


def channel_name(channel) -> str:
    """Arisa2 Channel 에서 사람이 쓰는 방 이름을 꺼낸다."""
    for attr in ("name", "private_name"):
        value = getattr(channel, attr, None)
        if value:
            return str(value)
    return ""
