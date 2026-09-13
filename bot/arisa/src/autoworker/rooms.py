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

        # 배운 것 먼저 올리고
        raw = store.read_json(ROOMS_NAME)
        if isinstance(raw, dict):
            for name, cid in raw.items():
                try:
                    self.by_name[str(name)] = int(cid)
                except (TypeError, ValueError):
                    continue

        # 설정에 적힌 id 가 이깁니다 — 사람이 직접 적은 값이라 더 확실하다.
        # 덕분에 켜자마자 먼저 말 걸기가 된다.
        from . import config

        for cid, name in config.ROOM_IDS.items():
            self.by_name[name] = cid

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

    def known_text(self, only_configured: bool = False) -> str:
        """아는 방 목록. only_configured 면 봇이 실제로 동작하는 방만."""
        from . import config

        items = sorted(self.by_name.items())
        if only_configured:
            items = [(n, c) for n, c in items if config.in_rooms(n)]
        if not items:
            return "(아직 배운 방이 없어요)"
        return "\n".join(f"  {name} → {cid}" for name, cid in items)


def channel_name(channel) -> str:
    """Arisa2 Channel 에서 사람이 쓰는 방 이름을 꺼낸다."""
    for attr in ("name", "private_name"):
        value = getattr(channel, attr, None)
        if value:
            return str(value)
    return ""
