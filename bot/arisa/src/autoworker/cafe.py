"""네이버 카페 새글 알림.

경로는 메신저봇R 판 그대로다 — 폰에서 네이버를 직접 부르면 세션이 거부되므로
깃헙 Actions 를 거친다.

    chatlog/.github/workflows/cafe-watch.yml  (봇이 workflow_dispatch 로 깨움)
        → 비공개 저장소 cafe-watch/latest.json
            → 이 모듈이 깃헙 토큰으로 읽어 새 글만 발송

※ 봇이 PC 에서 돌게 되었으니 네이버를 직접 부르는 쪽이 될 수도 있다.
  다만 이번은 1:1 이식이라 검증된 경로를 그대로 쓴다.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime
from typing import Awaitable, Callable

from . import config, http
from .store import Store

log = logging.getLogger(__name__)

STATE_NAME = "cafe-state.json"

#: (방 이름, 보낼 내용) → 보냈으면 True
Broadcaster = Callable[[str, str], Awaitable[bool]]


class CafeWatcher:
    def __init__(self, store: Store, broadcast: Broadcaster) -> None:
        self.store = store
        self._broadcast = broadcast

        self.last_id = 0  # 마지막으로 알린 글 번호
        self.updated_at = ""  # latest.json 의 updatedAt
        self.checked_at: datetime | None = None
        self.ok_at: datetime | None = None
        self.error: str | None = None
        self.sent_total = 0
        self._running = False

        self._load_state()

    # ── 상태 ──

    def _load_state(self) -> None:
        raw = self.store.read_json(STATE_NAME)
        if isinstance(raw, dict):
            try:
                self.last_id = int(raw.get("cafeLastId") or 0)
            except (TypeError, ValueError):
                self.last_id = 0

    def _save_state(self) -> None:
        self.store.write_json(STATE_NAME, {"cafeLastId": self.last_id})

    # ── 깃헙 ──

    def _kick_workflow_blocking(self, token: str) -> int:
        url = (
            f"https://api.github.com/repos/{config.WF_REPO}"
            f"/actions/workflows/{config.WF_FILE}/dispatches"
        )
        body = json.dumps({"ref": config.WF_REF}).encode("utf-8")
        status, _ = http.request(
            url,
            method="POST",
            headers={**http.github_headers(token), "Content-Type": "application/json"},
            body=body,
        )
        return status

    def _fetch_feed_blocking(self, token: str) -> dict:
        url = (
            f"https://api.github.com/repos/{config.GH_REPO}/contents/{config.GH_PATH}"
            f"?t={int(time.time() * 1000)}"
        )
        text = http.get_text(url, http.github_headers(token, "application/vnd.github.raw"))
        parsed = json.loads(text)
        if not isinstance(parsed, dict):
            raise ValueError("받은 내용이 올바르지 않아요")
        return parsed

    # ── 글 고르기 ──

    def _wanted(self, article: dict) -> bool:
        try:
            article_id = int(article.get("id"))
        except (TypeError, ValueError):
            return False
        if article_id <= self.last_id:
            return False
        if config.CAFE_MENU_IDS:
            try:
                menu_id = int(article.get("menuId"))
            except (TypeError, ValueError):
                return False
            if menu_id not in config.CAFE_MENU_IDS:
                return False
        return True

    @staticmethod
    def message(articles: list[dict]) -> str:
        head = f"📢 {config.CAFE_NAME} 카페 새글"
        if len(articles) == 1:
            a = articles[0]
            return (
                f"{head}\n\n[{a.get('menu', '')}] {a.get('subject', '')}\n"
                f"✍️ {a.get('writer', '')}\n{config.cafe_article_url(a.get('id'))}"
            )

        shown = articles[: config.CAFE_MAX_NOTIFY]
        out = [f"{head} {len(articles)}건"]
        for a in shown:
            out.append(
                f"\n[{a.get('menu', '')}] {a.get('subject', '')}\n"
                f"{config.cafe_article_url(a.get('id'))}"
            )
        if len(articles) > len(shown):
            out.append(f"\n… 외 {len(articles) - len(shown)}건")
        return "\n".join(out)

    # ── 확인 ──

    async def check(self, *, kick: bool = True) -> None:
        """목록을 읽고 새 글이 있으면 알린다.

        처음 실행이면 알리지 않고 기준 글번호만 잡는다 — 밀린 글 도배 방지.
        발송이 실패하면 기준을 올리지 않아 다음 주기에 다시 시도한다.
        """
        if not config.CAFE_ON:
            return
        self.checked_at = datetime.now()

        token = config.GITHUB_TOKEN
        if not token:
            self.error = "깃헙 토큰이 없어요 (.env 의 GITHUB_TOKEN)"
            return

        if kick:
            asyncio.create_task(self._kick(token))

        try:
            feed = await asyncio.to_thread(self._fetch_feed_blocking, token)
        except Exception as e:  # noqa: BLE001
            self.error = str(e)
            log.warning("카페 목록을 읽지 못했습니다: %s", e)
            return

        articles = feed.get("articles")
        if not isinstance(articles, list):
            self.error = "받은 내용이 올바르지 않아요"
            return

        self.updated_at = str(feed.get("updatedAt") or "")
        self.error = None
        self.ok_at = datetime.now()

        fresh = [a for a in articles if isinstance(a, dict) and self._wanted(a)]
        max_id = self.last_id
        for a in articles:
            if not isinstance(a, dict):
                continue
            try:
                max_id = max(max_id, int(a.get("id")))
            except (TypeError, ValueError):
                continue

        first_run = self.last_id == 0
        if first_run or not fresh:
            self.last_id = max_id
            self._save_state()
            return

        fresh.sort(key=lambda a: int(a["id"]))
        if not await self._send(self.message(fresh)):
            self.error = "발송 실패 — 다음 확인 때 다시 시도합니다"
            return

        self.last_id = max_id
        self._save_state()
        self.sent_total += len(fresh)

    async def _kick(self, token: str) -> None:
        try:
            status = await asyncio.to_thread(self._kick_workflow_blocking, token)
            if status >= 400:
                log.warning("워크플로우를 깨우지 못했습니다 (HTTP %s)", status)
        except Exception as e:  # noqa: BLE001
            log.warning("워크플로우를 깨우지 못했습니다: %s", e)

    async def _send(self, text: str) -> bool:
        any_sent = False
        for room in config.CAFE_ROOMS:
            try:
                if await self._broadcast(room, text):
                    any_sent = True
            except Exception as e:  # noqa: BLE001
                log.warning("[%s] 발송 실패: %s", room, e)
        return any_sent

    # ── 주기 ──

    async def cycle(self) -> None:
        """깨우기 → 잠깐 기다리기 → 읽기 를 한 주기에 모두 한다.

        asyncio 라 기다리는 동안에도 자동응답은 그대로 처리된다.
        메신저봇R 판에서 이 대기가 앱 전체를 멈추게 했던 부분이다.
        """
        if self._running:
            return
        self._running = True
        try:
            token = config.GITHUB_TOKEN
            if not token:
                await self.check(kick=False)
                return

            before = self.updated_at
            await self._kick(token)

            for wait in config.CAFE_WAIT_STEPS:
                await asyncio.sleep(wait)
                await self.check(kick=False)
                if self.updated_at and self.updated_at != before:
                    break
        except Exception as e:  # noqa: BLE001
            self.error = str(e)
            log.exception("카페 주기 중 오류")
        finally:
            self._running = False

    async def run_forever(self) -> None:
        while True:
            await self.cycle()
            await asyncio.sleep(config.CAFE_CHECK_MIN * 60)

    # ── 진단 ──

    def status_text(self) -> str:
        return (
            "☕ 카페봇 상태\n─────────────\n"
            f"감시: {'켜짐 ✅' if config.CAFE_ON else '꺼짐 ❌'}\n"
            f"카페: {config.CAFE_NAME} ({config.CAFE_URL})\n"
            f"알림 방: {', '.join(config.CAFE_ROOMS)}\n"
            f"확인 주기: {config.CAFE_CHECK_MIN}분\n"
            f"출처: 깃헙 {config.GH_REPO}\n"
            f"토큰: {'등록됨 ✅' if config.GITHUB_TOKEN else '없음 ❌'}\n"
            f"마지막 글 번호: {self.last_id or '(아직 없음)'}\n"
            f"목록 갱신 시각: {self.updated_at or '(모름)'}\n"
            f"마지막 확인: {self.checked_at.strftime('%m-%d %H:%M:%S') if self.checked_at else '(아직)'}\n"
            f"마지막 성공: {self.ok_at.strftime('%m-%d %H:%M:%S') if self.ok_at else '(아직)'}\n"
            f"보낸 글 수: {self.sent_total}"
            + (f"\n최근 오류: {self.error}" if self.error else "")
        )
