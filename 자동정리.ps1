# ─────────────────────────────────────────────────
# 카톡 대화 자동 정리 스크립트
# chats\ 폴더에 새(또는 변경된) txt가 있으면
# Claude Code로 정리 → index.html 갱신 → git push 까지 자동 실행.
# 변경이 없으면 아무것도 하지 않고 조용히 종료.
# ─────────────────────────────────────────────────
$root      = "D:\Chatbot"
$chats     = Join-Path $root "chats"
$stateFile = Join-Path $root ".last-processed"
$logFile   = Join-Path $root "자동정리.log"

# 가장 최근에 저장된 txt 찾기 (파일명은 아무거나 OK — 카톡 기본 이름 그대로 저장해도 됨)
$latest = Get-ChildItem $chats -Filter *.txt -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "여기에*" } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latest) { exit 0 }

# 이미 처리한 파일이면 종료 (내용 해시로 비교)
$hash = (Get-FileHash $latest.FullName -Algorithm MD5).Hash
$prev = if (Test-Path $stateFile) { (Get-Content $stateFile -Raw).Trim() } else { "" }
if ($hash -eq $prev) { exit 0 }

$date = $latest.LastWriteTime.ToString('yyyy-MM-dd')
"[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] 새 대화 파일 감지: $($latest.Name) → 정리 시작" | Add-Content $logFile

Set-Location $root
$prompt = "chats/$($latest.Name) 파일을 읽고 CLAUDE.md 규칙대로 $date 날짜의 대화를 정리해서 index.html에 추가해줘. " +
          "이미 $date 다이제스트 블록이 있으면 그 블록만 새 내용으로 갱신해줘. " +
          "완료되면 git add -A, git commit, git push로 배포해줘."

& claude -p $prompt --permission-mode acceptEdits 2>&1 | Add-Content $logFile

if ($LASTEXITCODE -eq 0) {
    $hash | Out-File $stateFile -Encoding utf8
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] 완료" | Add-Content $logFile
} else {
    "[$(Get-Date -Format 'yyyy-MM-dd HH:mm')] 실패 (종료코드 $LASTEXITCODE) — 다음 실행 때 재시도" | Add-Content $logFile
}
