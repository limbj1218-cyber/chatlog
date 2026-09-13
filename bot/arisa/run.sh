#!/usr/bin/env bash
# 오토워커 봇 — 깃헙에서 최신 코드를 받아 실행하고, 멈추면 다시 띄운다.
cd "$(dirname "$0")" || exit 1

while true; do
    echo "[$(date '+%m-%d %H:%M:%S')] 깃헙에서 최신 코드를 받습니다..."
    git pull --ff-only || echo "  ! git pull 실패 — 예전 코드로 계속 진행합니다."

    if ! command -v uv >/dev/null 2>&1; then
        echo "  ! uv 가 없습니다. 설치하세요:"
        echo "    curl -LsSf https://astral.sh/uv/install.sh | sh"
        echo "    source \"\$HOME/.local/bin/env\""
        exit 1
    fi

    if ! uv sync --quiet; then
        echo
        echo "  ! uv sync 실패 — 위 오류를 보세요. 흔한 원인:"
        echo "    · 네트워크 문제 (깃헙에서 airi-py 를 받지 못함)"
        echo "    · 파이썬 3.11 이상이 없음 (uv 가 알아서 받지만 막힐 수 있음)"
        exit 1
    fi

    uv run python -m autoworker

    echo
    echo "[$(date '+%m-%d %H:%M:%S')] 봇이 멈췄습니다. 10초 뒤 다시 시작합니다. (Ctrl+C 로 종료)"
    sleep 10
done
