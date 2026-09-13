"""파일 저장 — 쓰다가 죽어도 이전 파일이 깨지지 않게 임시 파일에 쓰고 바꿔치기한다."""

from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)


class Store:
    def __init__(self, directory: Path) -> None:
        self.dir = Path(directory)
        self.dir.mkdir(parents=True, exist_ok=True)

    def path(self, name: str) -> Path:
        return self.dir / name

    def read_json(self, name: str, default: Any = None) -> Any:
        p = self.path(name)
        try:
            with p.open(encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            return default
        except (OSError, json.JSONDecodeError) as e:
            log.warning("%s 를 읽지 못했습니다: %s", p, e)
            return default

    def write_json(self, name: str, value: Any) -> bool:
        p = self.path(name)
        tmp = None
        try:
            fd, tmp_name = tempfile.mkstemp(dir=str(self.dir), suffix=".tmp")
            tmp = Path(tmp_name)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(value, f, ensure_ascii=False)
            tmp.replace(p)
            return True
        except OSError as e:
            log.warning("%s 를 저장하지 못했습니다: %s", p, e)
            if tmp is not None:
                tmp.unlink(missing_ok=True)
            return False

    def read_text(self, name: str) -> str | None:
        try:
            return self.path(name).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            return None

    def write_text(self, name: str, text: str) -> bool:
        try:
            self.path(name).write_text(text, encoding="utf-8")
            return True
        except OSError as e:
            log.warning("%s 를 저장하지 못했습니다: %s", self.path(name), e)
            return False
