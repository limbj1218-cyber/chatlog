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

where uv >nul 2>&1
if errorlevel 1 (
    echo  ! uv 가 없습니다. PowerShell 에서 설치하세요:
    echo    irm https://astral.sh/uv/install.ps1 ^| iex
    pause
    exit /b 1
)

uv sync --quiet
if errorlevel 1 (
    echo.
    echo  ! uv sync 실패 - 위 오류를 보세요. 흔한 원인:
    echo    - 네트워크 문제 ^(깃헙에서 airi-py 를 받지 못함^)
    echo    - 파이썬 3.11 이상이 없음
    pause
    exit /b 1
)

uv run python -m autoworker

echo.
echo [%date% %time%] 봇이 멈췄습니다. 10초 뒤 다시 시작합니다.
echo  ^(완전히 끄려면 이 창을 닫으세요^)
timeout /t 10 /nobreak >nul
goto loop
