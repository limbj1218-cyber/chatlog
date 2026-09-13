@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ════════════════════════════════════════════
echo  오토워커 봇 (Arisa2)
echo ════════════════════════════════════════════
echo.

:loop
echo [%date% %time%] 깃헙에서 최신 코드를 받습니다...
git pull --ff-only
if errorlevel 1 (
    echo.
    echo  ! git pull 실패 - 예전 코드로 계속 진행합니다.
    echo    ^(이 PC 에서 파일을 고쳤다면 되돌리거나 커밋하세요^)
    echo.
)

uv sync --quiet
if errorlevel 1 (
    echo  ! uv sync 실패 - uv 가 설치되어 있는지 확인하세요.
    echo    https://docs.astral.sh/uv/getting-started/installation/
    pause
    exit /b 1
)

uv run python -m autoworker

echo.
echo [%date% %time%] 봇이 멈췄습니다. 10초 뒤 다시 시작합니다.
echo  ^(완전히 끄려면 이 창을 닫으세요^)
timeout /t 10 /nobreak >nul
goto loop
