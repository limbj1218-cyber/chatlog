"""HTTP — 표준 라이브러리만 쓴다 (의존성을 늘리지 않으려고).

blocking 호출이므로 봇에서는 반드시 ``asyncio.to_thread`` 로 감싸서 부른다.
메시지 처리를 막지 않는 것이 이 봇의 제1원칙이다.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any

log = logging.getLogger(__name__)

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

DEFAULT_TIMEOUT = 20


class HttpError(Exception):
    def __init__(self, status: int, body: str = "") -> None:
        super().__init__(f"HTTP {status}")
        self.status = status
        self.body = body


def request(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
    timeout: int = DEFAULT_TIMEOUT,
) -> tuple[int, str]:
    """(상태코드, 본문). 4xx/5xx 도 예외 없이 그대로 돌려준다."""
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("User-Agent", UA)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def get_text(url: str, headers: dict[str, str] | None = None) -> str:
    status, text = request(url, headers=headers)
    if status >= 400:
        raise HttpError(status, text[:200])
    return text


def get_json(url: str, headers: dict[str, str] | None = None) -> Any:
    return json.loads(get_text(url, headers))


def github_headers(token: str, accept: str = "application/vnd.github+json") -> dict[str, str]:
    return {
        "Authorization": f"token {token}",
        "Accept": accept,
        "X-GitHub-Api-Version": "2022-11-28",
    }
