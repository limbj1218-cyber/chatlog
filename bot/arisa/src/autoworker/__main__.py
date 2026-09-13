"""진입점 — ``python -m autoworker``"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path


def load_dotenv() -> None:
    """.env 를 읽어 환경 변수로 넣는다 (이미 있는 값은 덮어쓰지 않는다)."""
    for base in (Path.cwd(), Path(__file__).resolve().parents[2]):
        path = base / ".env"
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))
        return


def main() -> int:
    load_dotenv()
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%m-%d %H:%M:%S",
    )

    from . import config
    from .bot import AutoworkerBot

    log = logging.getLogger("autoworker")
    log.info("arisa 연결 대상: %s", config.ARISA_TARGET)
    log.info("저장 위치: %s", config.DATA_DIR)
    if not config.GITHUB_TOKEN:
        log.warning("GITHUB_TOKEN 이 없습니다 — 카페 새글 알림은 동작하지 않습니다")

    bot = AutoworkerBot()
    try:
        asyncio.run(bot.run())
    except KeyboardInterrupt:
        log.info("종료합니다")
    return 0


if __name__ == "__main__":
    sys.exit(main())
