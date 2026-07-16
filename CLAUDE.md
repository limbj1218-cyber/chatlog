# 단톡방 일일 정리 페이지 + 단톡봇 (벽타기)

카카오톡 오픈채팅방 대화를 방별로 요약해서 GitHub Pages에 게시하는 프로젝트.
안드로이드 폰의 메신저봇R 봇(`bot/단톡봇.js`)이 대화를 기록하다가, 방에서 `/벽타기` 명령이 오면
오늘 로그를 `chats/`에 push → GitHub Actions(`.github/workflows/summarize.yml`)가 Claude로 요약 →
`rooms/방이름/index.html` 갱신 → Pages 자동 반영. PC가 꺼져 있어도 동작한다.

## 구조

- `rooms/방이름/index.html` — 방별 정리 페이지 (방마다 독립)
- `rooms/_template.html` — 새 방 페이지 생성용 템플릿 (`{{방이름}}` 치환)
- `chats/` — 봇이 업로드하는 방별 대화 로그. 파일명: `방이름-YYYY-MM-DD.txt`.
  **요약이 끝나면 워크플로우가 원본을 자동 삭제**하므로 평소엔 비어 있다 (원본은 봇 폰에만 보관)
- `bot/단톡봇.js` — 봇 본체 (안드로이드 폰 위 Rhino 엔진에서 실행되므로 ES5 문법만 사용할 것)
- `bot/로더.js` — 폰에 실제로 설치되는 로더. 깃헙 raw에서 단톡봇.js를 받아 실행하며 TOKEN/ROOMS를 주입. 본체 수정 후 push하면 방에서 `/업데이트`로 반영
- `bot/봇설치가이드.md` — 봇 설치/연동 가이드
- `index.html` — 루트 페이지 (구버전 단일 페이지, 추후 방 목록 페이지로 전환 예정)
- `.github/workflows/summarize.yml` — 벽타기 워크플로우 (chats/** push 시 실행)

## 방별 페이지 규칙 (벽타기 정리 요청을 받으면)

1. `chats/방이름-YYYY-MM-DD.txt` 를 읽는다. 형식: `[이름] [오후 3:24] 메시지내용`
   (파일명에서 마지막 `-YYYY-MM-DD` 앞부분이 방 이름이다)
2. `rooms/방이름/index.html` 이 없으면 `rooms/_template.html` 을 복사해 만들고 `{{방이름}}` 을 실제 방 이름으로 치환한다.
   페이지는 3개 탭(일자별 / 자주 묻는 질문 / 용어사전)과 고정 공지 배너로 구성된다. 템플릿의 주석 마커는 절대 지우지 않는다.
3. 새 날짜 블록(`.day-accordion`)을 `#tab-daily` 안에 **날짜 내림차순(최신이 위)** 위치로 삽입한다.
   **같은 날짜 블록이 이미 있으면 그 블록 전체를 새 내용으로 교체**한다 (하루에 벽타기가 여러 번 올 수 있고,
   자정 이후 전날 로그가 자동 업로드되어 어제 날짜가 늦게 도착할 수도 있다). 다른 날짜 블록의 내용은 수정하지 않는다.
   **예외(유실 보호)**: 같은 날짜 블록이 이미 있는데 새 로그의 메시지 수가 기존 블록의 "전체 메시지" 수보다
   확연히 적으면(절반 미만) — 봇 재시작 등으로 로그 일부가 유실된 상황이므로 — 기존 블록을 유지하고 교체하지 않는다.
   단, `오늘` 배지(`.day-accordion-badge`)는 항상 최신 날짜 블록에만 있도록 이전 블록에서 제거한다.

### 날짜 블록 마크업 (이 구조를 정확히 따를 것)

```html
<div class="day-accordion">
  <button class="day-accordion-header" onclick="toggleDay(this)">
    <div class="day-accordion-left">
      <span class="day-accordion-arrow">▼</span>
      <span class="day-accordion-date">7/14 (화)</span>
      <span class="day-accordion-badge">오늘</span><!-- 최신 날짜에만 -->
    </div>
    <div class="day-accordion-summary">전체 메시지 151 · 주요 Q&amp;A 7 · 인사이트 6</div>
  </button>
  <div class="day-accordion-body"><div class="day-accordion-content">
    <div class="stats-bar">
      <div class="stat-pill"><span class="num">151</span><span class="label">전체 메시지</span></div>
      <div class="stat-pill"><span class="num">7</span><span class="label">주요 Q&amp;A</span></div>
      <div class="stat-pill"><span class="num">6</span><span class="label">인사이트</span></div>
      <div class="stat-pill"><span class="num">2</span><span class="label">공지</span></div>
    </div>
    <!-- 이하 섹션들: 주요 공지 → 오늘의 MVP → 주요 Q&A → 인사이트 & 팁 → 타임라인 순.
         해당 내용이 없는 섹션은 통째로 생략 -->
  </div></div>
</div>
```

각 섹션 공통 헤더: `<div class="section"><div class="section-header"><div class="section-icon">📢</div><div class="section-title">주요 공지</div></div> ...카드들... </div>`
(아이콘: 공지 📢 / MVP 🏆 / Q&A 💬 / 인사이트 💡 / 타임라인 🕒)

- **주요 공지** (방장/운영진의 공지성 메시지, 작성자·시각 명시):
```html
<div class="insight-card"><div class="insight-emoji">📢</div><div class="insight-body">
  <h3>작성자 · 오후 2:00</h3><p>공지 내용을 완결된 문장으로.</p>
  <span class="insight-tag tag-important">중요 공지</span><!-- 일반 공지는 tag-notice + "공지" -->
</div></div>
```
- **오늘의 MVP** (기여가 큰 멤버 2~3명, 활약상을 2~3문장으로 구체적으로):
```html
<div class="mvp-grid">
<div class="mvp-card"><div class="mvp-avatar">🥇</div><div>
  <div class="mvp-name">이름 <span class="mvp-role">방장</span></div><!-- 역할 배지는 방장/운영진/멤버 등, 모르면 생략 -->
  <div class="mvp-desc">무엇을 어떻게 기여했는지 구체적으로 2~3문장.</div>
</div></div>
</div>
```
- **주요 Q&A** (실제 답변이 달린 것만 5~10개. 같은 질문이 여러 번 나오면 횟수 표기):
```html
<div class="qa-card" onclick="toggleQa(this)">
  <div class="qa-header"><div class="qa-q-icon">Q</div>
    <div class="qa-question">질문을 자연스러운 한 문장으로?</div>
    <span class="qa-count">3회</span><!-- 1회면 생략 -->
    <span class="qa-toggle">▼</span></div>
  <div class="qa-body"><div class="qa-answer">
    <div class="qa-answer-header"><span class="qa-answer-badge">답변</span><span class="qa-answer-name">답변자 이름</span></div>
    <p>답변을 요약해 완결된 문장으로. 여러 답변이 합쳐져도 됨.</p>
  </div></div>
</div>
```
- **인사이트 & 팁** (노하우·경험담·공유된 링크. 이모지 💡노하우 🔧문제해결 🛠️도구/링크):
```html
<div class="insight-card"><div class="insight-emoji">💡</div><div class="insight-body">
  <h3>기여자 이름</h3><p>내용을 2~3문장으로, 맥락까지 담아서.</p>
  <span class="insight-tag tag-tip">핵심 키워드</span><!-- tag-tip/tag-tool/tag-info 중 선택, 키워드는 2~6자 -->
</div></div>
```
- **타임라인** (하루 흐름을 시간 구간 4~7개로, 각 구간을 1~2문장 서사로):
```html
<div class="timeline">
<div class="tl-item"><div class="tl-time">오전 9:00~오전 11:30</div><div class="tl-text">이 시간대에 무슨 일이 있었는지 서사형으로.</div></div>
</div>
```

### 고정 공지 배너 (`.notice-banner`)

- 로그에 `[공지등록] 내용` 마커가 있으면 (봇이 관리자 확인 후 남긴 것) **가장 마지막 마커의 내용을 그대로** 반영한다. 최우선.
- 마커가 없으면 기존 배너를 유지하되, 대화 중 명백한 공지성 메시지가 있으면 갱신해도 된다.
- 내용이 여러 건이면 `<b>제목</b>` + `<br>　└ 부연` 형태의 계층 구조로 보기 좋게 구성한다. 링크는 `<a href>` 처리.

### 자주 묻는 질문 탭 (`#tab-faq`) — 누적 관리

- 정리할 때마다 갱신한다. 여러 날에 걸쳐 반복된 질문 주제를 집계해 **누적 질문 랭킹** TOP 5~10을 만들고,
  각 주제의 대표 질문·베스트 답변을 `.qa-card` 로 아래에 나열한다 (오늘 것과 기존 것을 합산해 재구성).
```html
<li class="faq-bar-item"><div class="faq-bar-label"><span>질문 주제</span><span class="cnt">5</span></div>
<div class="faq-bar-track"><div class="faq-bar-fill" data-pct="100"></div></div></li>
```
  `data-pct` = (해당 횟수 / 최다 횟수) × 100 반올림. `.empty-hint` 는 내용이 생기면 삭제한다.

### 용어사전 탭 (`#tab-glossary`) — 누적 관리

- 대화에 등장한 전문용어·은어·도구명을 뽑아 **기존 항목과 중복되지 않게 추가**한다 (가나다순 정렬 유지).
```html
<div class="glossary-card"><div class="glossary-term">🧗 벽타기</div><div class="glossary-def">이 방 대화를 정리해 페이지에 올리는 봇 명령어.</div></div>
```

### 마스코트

- 각 방 페이지 하단의 `<!-- ═══ 마스코트 ═══ -->` ~ `<!-- ═══ 마스코트 끝 ═══ -->` 블록은
  방 주민 픽셀 캐릭터(라옴·마이폰·시지지·강성개미·날다진)로, 정리 작업 시 절대 수정/삭제하지 않는다.
- 블록은 모든 페이지에 들어 있지만 JS의 `ROOM_CREW` 설정에 있는 방에서만 화면에 나타난다
  (왼쪽 아래 고정 정렬). 현재: 금광2 = 라옴·마이폰·시지지·강성개미·날다진 5인방(2줄), 삽자루 = 바다가좋아.
  다른 방에 보이게 하려면 `ROOM_CREW`에 방 이름과 멤버 구성만 추가.

### 방별 표시 이름 (별칭)

- **거북 방**: 파일 경로는 `rooms/거북/`이지만 페이지 표시 이름(title, og:title, hero h1)은 **"하늘"**이다.
  정리 작업 시 이 표시 이름을 "거북"으로 되돌리지 않는다.

### 공통 규칙

- `/봇`, `/등록`, `/벽타기` 등 봇 명령어와 봇의 응답 메시지, `[공지등록]` 마커 줄은 요약/통계에서 제외한다.
- 개인정보 주의: 전화번호, 주소, 개인 신상은 요약에 포함하지 않는다. 이름 뒤 숫자로 된 오픈채팅 ID도 생략.
- 방별 데이터는 완전히 분리 — 다른 방의 페이지는 절대 건드리지 않는다.
- 문체: 모든 요약은 완결된 문장·존댓말 서술체("~했습니다")로, 명사 나열이 아니라 맥락이 읽히게 쓴다.

## 봇 동작 요약 (bot/단톡봇.js)

- 동작할 방: 스크립트 맨 위 `ROOMS` 배열에 직접 입력 (목록에 없는 방은 무시)
- 최고 관리자: 대화명에 "후파" 포함 / 부관리자: 방에서 `/지정 이름조각` (방별)
- 자동응답: `/등록 명령어 내용...` (첫 단어=트리거, 나머지 전부=내용), 메시지 전체 일치 시 응답, 방별 분리
- `/벽타기`: 방별 6시간 쿨다운, 오늘 로그를 GitHub contents API로 chats/에 업로드 (쿨다운 중엔 기존 페이지 링크 안내)
- 자동 벽타기: 02:50/08:50/14:50/20:50에 새 대화가 있으면 자동 업로드 (수동 쿨다운과 별개, 같은 페이지 갱신)
- 링크 공지: 09:00/15:00/21:00에 그 방에 오늘 대화가 있으면 그 방 전용 링크를 그 방에만 공지 (방별 독립)
- 자동 일일 정리: 날짜가 바뀐 뒤 그 방의 첫 메시지가 오면 전날 로그를 자동 업로드 → 매일 빠짐없이 정리됨
- 저장: 파일 저장 실패 시 메모리로 자동 대체 (재시작하면 소실) — `/방이름` 진단 명령으로 상태 확인

## 배포 (로컬에서 수동 작업 시)

```
git add -A
git commit -m "M/D 정리 추가"
git push
```

GitHub Pages가 main 브랜치 루트를 서빙하므로 push하면 1~2분 내 반영된다.
벽타기 경로(폰 → Actions)는 push 자체가 자동이므로 별도 작업 불필요.
