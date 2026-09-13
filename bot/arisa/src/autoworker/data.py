"""자동응답 데이터 — 깃헙에서 받아 쓰고 디스크에 캐시한다.

메신저봇R 판과 같은 파일(``bot/오토봇데이터.json``)을 쓰므로,
두 봇이 같은 내용을 보고 움직인다. 옮기는 동안 한쪽만 고칠 일이 없다.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime

from . import config, http
from .store import Store

log = logging.getLogger(__name__)

CACHE_NAME = "autobot-data.json"


class AutoReplyData:
    def __init__(self, store: Store) -> None:
        self.store = store
        self.data: dict | None = None
        self.source = "없음"  # 깃헙 / 캐시 / 없음
        self.last_try = 0.0
        self.last_ok: datetime | None = None
        self.last_error: str | None = None

    # ── 읽기 ──

    def load_cache(self) -> bool:
        raw = self.store.read_json(CACHE_NAME)
        if isinstance(raw, dict):
            self.data = raw
            self.source = "캐시"
            return True
        return False

    def _fetch_blocking(self) -> dict:
        text = http.get_text(f"{config.DATA_URL}?t={int(time.time() * 1000)}")
        parsed = json.loads(text)
        if not isinstance(parsed, dict):
            raise ValueError("최상위가 객체가 아닙니다")
        return parsed

    async def refresh(self) -> bool:
        """깃헙에서 새로 받아온다. 성공하면 True."""
        self.last_try = time.monotonic()
        try:
            parsed = await asyncio.to_thread(self._fetch_blocking)
        except Exception as e:  # noqa: BLE001 — 어떤 실패든 봇은 계속 돌아야 한다
            self.last_error = str(e)
            log.warning("자동응답 데이터를 받지 못했습니다: %s", e)
            if self.data is None:
                self.load_cache()
            return False

        self.data = parsed
        self.source = "깃헙"
        self.last_ok = datetime.now()
        self.last_error = None
        await asyncio.to_thread(self.store.write_json, CACHE_NAME, parsed)
        return True

    def is_stale(self) -> bool:
        return (time.monotonic() - self.last_try) >= config.REFRESH_MIN * 60

    async def run_forever(self) -> None:
        """주기적으로 갱신한다. 자동응답 처리와 별개로 도는 작업."""
        while True:
            await self.refresh()
            await asyncio.sleep(config.REFRESH_MIN * 60)
