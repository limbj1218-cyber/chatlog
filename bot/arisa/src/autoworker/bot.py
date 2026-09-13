"""봇 본체 — Arisa2 에 붙어서 오토봇 + 카페봇을 함께 돌린다.

메신저봇R 판에서는 두 봇을 **별개 스크립트**로 나눠야 했다. 한쪽이 네트워크를
기다리면 앱 전체가 멈췄기 때문이다(2026-09-07). 여기서는 asyncio 라
카페 감시가 30초를 기다려도 자동응답은 그대로 처리된다. 그래서 한 프로세스에 둔다.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from airi import AiriContext, BotClient, proto

from . import config, matching, rooms
from .cafe import CafeWatcher
from .chatlog import ChatLog
from .data import AutoReplyData
from .store import Store

log = logging.getLogger(__name__)

LOGS_NAME = "chatlog.json"

#: 카톡 일반 텍스트 메시지
MESSAGE_TYPE_TEXT = 1


class AutoworkerBot:
    def __init__(self) -> None:
        self.started_at = datetime.now()
        self.seen_any = False
        self.store = Store(config.DATA_DIR)
        self.rooms = rooms.RoomMap(self.store)
        self.data = AutoReplyData(self.store)
        self.cooldown = matching.Cooldown()
        self.logs = ChatLog()
        self.cafe = CafeWatcher(self.store, self.send_to_room)

        self.client = BotClient(config.ARISA_TARGET)
        self.client.on(proto.MessageEvent)(self.on_message)

        raw = self.store.read_json(LOGS_NAME)
        if isinstance(raw, dict):
            self.logs.load_dict(raw)
        self.data.load_cache()

    # ─────────────── 보내기 ───────────────

    async def send_to_room(self, room: str, text: str) -> bool:
        """방 이름으로 먼저 말 걸기. 아직 배우지 못한 방이면 False."""
        channel_id = self.rooms.id_for(room)
        if channel_id is None:
            log.warning("[%s] channel_id 를 아직 모릅니다 — 그 방에서 메시지가 한 번 와야 합니다", room)
            return False
        try:
            await self.client.reply(channel_id, text)
            return True
        except Exception as e:  # noqa: BLE001
            log.warning("[%s] 발송 실패: %s", room, e)
            return False

    # ─────────────── 메시지 처리 ───────────────

    async def on_message(self, ctx: AiriContext[proto.MessageEvent]) -> None:
        try:
            await self._handle(ctx)
        except Exception:  # noqa: BLE001 — 한 메시지의 실패가 봇을 죽이면 안 된다
            log.exception("메시지 처리 중 오류")

    async def _handle(self, ctx: AiriContext[proto.MessageEvent]) -> None:
        author = ctx.event.author
        text = str(ctx.event.message or "").strip()
        raw_room = rooms.channel_name(ctx.channel)
        # channel_id 를 먼저 보고, 모르는 방이면 이름으로 (긴 카톡 이름 → 짧은 설정 이름)
        room = config.resolve_room(ctx.channel.id, raw_room)
        sender = author.nickname if author is not None else ""

        if not self.seen_any:
            self.seen_any = True
            log.info("첫 메시지를 받았습니다 — 연결 정상 ✅ [%s] %s", room, sender)

        # 무슨 일이 일어나는지 보이도록 남긴다 (LOG_LEVEL=DEBUG 로 켜서 본다)
        log.debug(
            "[%s] (%s) mine=%s type=%s: %s",
            room,
            sender,
            getattr(author, "is_mine", None),
            ctx.event.message_type,
            text[:60],
        )

        if author is not None and author.is_mine:
            return  # 내가 보낸 말에 내가 답하지 않는다
        if not text:
            return

        if room:
            self.rooms.learn(room, ctx.channel.id)

        # ⓪ 진단 — 등록 여부와 무관하게 모든 방에서 동작
        if text == config.PREFIX + "오토":
            await ctx.reply(self.diag_text(room, sender, ctx.channel.id))
            return
        if text == config.PREFIX + "방정보":
            alias_note = f"\n설정 이름: [{room}]" if room != raw_room else ""
            await ctx.reply(
                f"🏷️ 방 정보\n─────────────\n"
                f"카톡 이름: [{raw_room}]{alias_note}\n"
                f"channel_id: {ctx.channel.id}\n"
                f"종류: {ctx.channel.channel_type}\n"
                f"보낸 사람: [{sender}]\n"
                f"이 방 활성화됨: {'예 ✅' if config.in_rooms(room) else '아니오 ❌'}\n\n"
                f"기억하고 있는 방:\n{self.rooms.known_text()}"
            )
            return

        # ① 목록에 없는 방은 완전히 무시
        if not config.in_rooms(room):
            return

        # ② 대화 기록
        if ctx.event.message_type == MESSAGE_TYPE_TEXT:
            if self.logs.add(room, sender, text) and self.logs.should_flush():
                asyncio.create_task(self._flush_logs())

        # ③ 기록 조회 — 지정한 방에서만, 누구나
        if room == config.VIEW_ROOM:
            for cmd, target in config.LOG_CMDS:
                full = config.PREFIX + cmd
                if text == full:
                    await ctx.reply(self.logs.text(target))
                    return
                if text.startswith(full + " "):
                    await ctx.reply(self.logs.text(target, text[len(full) + 1 :].strip()))
                    return

        # ④ 카페 명령
        if await self._cafe_commands(ctx, text, sender):
            return

        # ⑤ 자동응답 갱신 (관리자)
        if text == config.PREFIX + "오토업데이트":
            if not config.is_admin(sender):
                return
            ok = await self.data.refresh()
            await ctx.reply(
                "🔄 자동응답 내용을 깃헙에서 새로 받았어요."
                if ok
                else f"⚠️ 받지 못했어요: {self.data.last_error}"
            )
            return

        # ⑥ /리스트
        table = matching.table_for(self.data.data, room)
        if text == config.PREFIX + "리스트":
            await ctx.reply(matching.list_text(table))
            return

        # ⑦ 등록된 트리거 (전체 일치 우선, 그 다음 포함 매칭)
        reply = matching.match(table, text, room, self.cooldown)
        if reply:
            await ctx.reply(reply)

    async def _cafe_commands(
        self, ctx: AiriContext[proto.MessageEvent], text: str, sender: str
    ) -> bool:
        if text == config.PREFIX + "카페":
            await ctx.reply(self.cafe.status_text())
            return True
        if text == config.PREFIX + "카페확인":
            if not config.is_admin(sender):
                return True
            await ctx.reply("☕ 지금 확인해볼게요… (최대 40초)")
            asyncio.create_task(self.cafe.cycle())
            return True
        if text == config.PREFIX + "발송테스트":
            if not config.is_admin(sender):
                return True
            results = []
            for room_name in config.CAFE_ROOMS:
                ok = await self.send_to_room(room_name, "🔔 발송 테스트입니다.")
                results.append(f"{room_name}: {'성공 ✅' if ok else '실패 ❌'}")
            await ctx.reply("📨 발송 테스트\n─────────────\n" + "\n".join(results))
            return True
        return False

    async def _flush_logs(self) -> None:
        await asyncio.to_thread(self.store.write_json, LOGS_NAME, self.logs.to_dict())

    # ─────────────── 진단 ───────────────

    def diag_text(self, room: str, sender: str, channel_id: int) -> str:
        active = config.in_rooms(room)
        table = matching.table_for(self.data.data, room)
        logged = (
            f"{self.logs.count(room)}/{config.LOG_MAX}개"
            if room in config.LOG_ROOMS
            else "안 함"
        )
        return (
            "🤖 오토봇 진단 (Arisa2 판)\n─────────────\n"
            f"방 이름: [{room}]\n"
            f"channel_id: {channel_id}\n"
            f"보낸 사람: [{sender}]\n"
            f"이 방 활성화됨: {'예 ✅' if active else '아니오 ❌'}\n"
            f"데이터 출처: {self.data.source}\n"
            f"이 방 트리거: {len(table)}개\n"
            f"마지막 갱신: {self.data.last_ok.strftime('%m-%d %H:%M:%S') if self.data.last_ok else '(아직 없음)'}\n"
            f"기록 보관: {logged}\n"
            f"켜진 시각: {self.started_at.strftime('%m-%d %H:%M:%S')}\n"
            f"arisa: {config.ARISA_TARGET}\n"
            f"저장 위치: {config.DATA_DIR}"
            + (f"\n최근 오류: {self.data.last_error}" if self.data.last_error else "")
        )

    # ─────────────── 실행 ───────────────

    async def _wait_for_arisa(self) -> None:
        """붙을 때까지 기다리되, 왜 안 되는지 조용히 넘기지 않는다.

        airi 의 run() 은 연결 실패를 말없이 재시도하기만 해서,
        주소가 틀렸을 때 "아무 반응이 없다" 로만 보인다. 그래서 여기서 먼저 알린다.
        """
        attempt = 0
        while True:
            attempt += 1
            try:
                await self.client.connect()
                await self.client.health_check()
                log.info("arisa 에 연결되었습니다 ✅ (%s)", config.ARISA_TARGET)
                return
            except Exception as e:  # noqa: BLE001
                if attempt == 1 or attempt % 6 == 0:
                    log.error(
                        "arisa 에 붙지 못했습니다 (%s): %s: %s",
                        config.ARISA_TARGET,
                        type(e).__name__,
                        e,
                    )
                    log.error(
                        "  확인할 것 — ① 패드에서 arisa 가 떠 있는지"
                        " ② ARISA_BIND 가 0.0.0.0:3000 인지"
                        " ③ .env 의 ARISA_TARGET 이 패드 IP 인지"
                        " ④ 둘이 같은 공유기인지"
                    )
                await asyncio.sleep(10)

    async def run(self) -> None:
        await self._wait_for_arisa()
        await self.data.refresh()
        log.info(
            "자동응답 데이터: %s (방 %d개)",
            self.data.source,
            len(self.data.data or {}),
        )
        log.info("기억하고 있는 방:\n%s", self.rooms.known_text())
        log.info("메시지를 기다립니다. 방에서 /방정보 를 쳐보세요.")
        tasks = [
            asyncio.create_task(self.data.run_forever(), name="data"),
            asyncio.create_task(self.cafe.run_forever(), name="cafe"),
            asyncio.create_task(self._flush_forever(), name="flush"),
        ]
        try:
            await self.client.run()
        finally:
            for t in tasks:
                t.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            await self._flush_logs()

    async def _flush_forever(self) -> None:
        while True:
            await asyncio.sleep(300)
            await self._flush_logs()
