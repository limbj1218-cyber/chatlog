#!/usr/bin/env bash
# 오토워커 봇 — 깃헙에서 최신 코드를 받아 실행하고, 멈추면 다시 띄운다.
cd "$(dirname "$0")" || exit 1

while true; do
    echo "[$(date '+%m-%d %H:%M:%S')] 깃헙에서 최신 코드를 받습니다..."
    git pull --ff-only || echo "  ! git pull 실패 — 예전 코드로 계속 진행합니다."

    if ! uv sync --quiet; then
        echo "  ! uv sync 실패 — uv 가 설치되어 있는지 확인하세요."
        echo "    https://docs.astral.sh/uv/getting-started/installation/"
        exit 1
    fi

    uv run python -m autoworker

    echo
    echo "[$(date '+%m-%d %H:%M:%S')] 봇이 멈췄습니다. 10초 뒤 다시 시작합니다. (Ctrl+C 로 종료)"
    sleep 10
done
