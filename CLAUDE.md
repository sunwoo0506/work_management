# Work Management — 작업 규칙

제우스 경영지원 업무를 관리하는 **개인용** 웹 서비스. 사용자는 오선우 부장 한 명이며, 나중에 사업체가 5개까지 늘어날 수 있다.

React + Vite + TypeScript + Tailwind v4 프론트엔드가 Supabase에 직접 붙는다. 별도 백엔드 서버는 없다.

## 문서 위치

| | |
|---|---|
| 설계서 | `docs/specs/2026-08-09-personal-work-management-design.md` |
| 구현 계획 | `docs/plans/` |
| 개발일지 | `docs/devlog/` |

무엇을 왜 만드는지는 **설계서가 원본**이다. 구현 중 설계와 다른 판단이 필요하면 설계서를 먼저 고치고 그 이유를 개발일지에 남긴다.

---

## 개발일지 — 커밋할 때마다 쓴다

**파일명:** `docs/devlog/YYYY-MM-DD_vNN.md` — 예: `2026-08-09_v01.md`

하루에 여러 번 커밋하면 `v01`, `v02`, `v03`으로 올라간다.

**이전 버전은 절대 수정하지 않는다.** 앞선 판단이 틀렸다고 밝혀져도 그 파일은 그대로 두고, 다음 버전에 "v01에서 이렇게 했는데 이런 이유로 바꿨다"를 적는다. 일지는 결론이 아니라 **경위 기록**이다.

**쉽고 자세하게 쓴다.** 3개월 뒤의 본인과, 이 프로젝트를 처음 보는 사람이 읽고 "아 이런 문제가 있었고 이렇게 풀었구나"를 알 수 있어야 한다. 용어를 줄이지 말고, 왜 그게 문제였는지부터 적는다.

각 일지에 들어갈 것:

1. **무엇을 했나** — 한두 문장 요약
2. **커밋 목록** — SHA와 제목
3. **겪은 이슈와 처리** — 가장 중요하다. 증상 → 원인 → 어떻게 고쳤는지 → 왜 그 방법인지
4. **결정한 것** — 갈림길에서 무엇을 왜 골랐는지
5. **다음에 할 것**

이슈가 없었으면 "없음"이라고 적는다. 억지로 만들지 않는다.

---

## 보안 — 타협하지 않는다

- **`service_role` 키를 코드나 `.env`에 절대 넣지 않는다.** RLS를 통째로 우회하는 마스터 키다. 브라우저에 들어가는 건 `anon` 키뿐이다.
- **`.env.local`은 커밋하지 않는다.** `.gitignore`에 이미 있다.
- **모든 테이블에 RLS를 켠다.** 안 켜면 `anon` 키를 가진 누구나 전체 데이터를 읽는다.
- **저장소 루트가 `Work_Management/`인 이유**: 상위 폴더의 `제우스_3대사업축_사업이해자료.docx`는 표지에 「내부 자료 · 사외 반출 금지」라고 적혀 있다. git 바깥에 둬서 실수로도 올라가지 않게 했다. 이 문서를 저장소 안으로 옮기지 않는다.
- **회의 녹음 파일과 전사문은 커밋하지 않는다.** `.gitignore`에 `*.m4a`, `*.mp3`, `recordings/`, `transcripts/`가 있다.
- 민감 회의(회생·인사)의 전사문은 Supabase에도 저장하지 않는다. 설계서 §4.3 참고.

---

## 코드 규칙

### `src/domain/`은 순수하게 유지한다

**Supabase와 React를 import하지 않는다.** 날짜 계산·정렬·집계·매핑 같은 로직이 여기 모여 있고, DB나 브라우저 없이 테스트하기 위해 분리한 것이다. 이 경계가 무너지면 테스트가 느려지고 깨지기 쉬워진다.

### 날짜 — 실제로 결함이 났던 곳이다

- **테스트 픽스처는 로컬 벽시계 리터럴을 쓴다.** `new Date(2026, 7, 11, 9, 0)` ○ / `new Date('2026-08-11T09:00:00+09:00')` ✕
  ISO 문자열은 절대 시각을 고정하는데 구현은 로컬 달력일을 본다. UTC 오프셋이 음수인 지역(미국 등)에서 하루가 밀려 테스트가 깨진다.
- **`daysUntil`은 `Math.floor`가 아니라 `Math.round`를 쓴다.** 서머타임 전환 때 두 로컬 자정 사이가 23시간 또는 25시간이 되는데, `round`가 그 ±1시간을 흡수한다.
- **Windows의 Node는 `TZ` 환경변수를 무시한다.** `TZ=America/New_York npm test`로 시간대 테스트를 했다고 믿으면 안 된다. 실제로는 로컬 시간대로 돌아간다.

### Tailwind v4

**`tailwind.config.js`를 만들지 않는다.** v4는 CSS의 `@theme` 블록으로 토큰을 정의한다. `src/index.css`에 있다.

토큰이 `dist` CSS에 안 보인다고 고장난 게 아니다. v4는 **실제로 쓰인 토큰만 방출한다**. 그리고 Lightning CSS가 색을 줄여 쓰므로 `#0066cc`는 `#06c`로 나온다.

### TypeScript

`verbatimModuleSyntax: true`가 켜져 있다. 타입만 가져올 때는 `import type`을 쓴다.

---

## 디자인 — `DESIGN-apple.md` 기준

- **Action Blue `#0066cc`가 유일한 인터랙티브 색이다.** 두 번째 액센트를 만들지 않는다. 기한 초과 경고(`#d70015`)만 예외로 두되 그것도 최소한으로 쓴다.
- **본문은 17px다.** 16px이 아니다.
- **weight 사다리는 300 / 400 / 600 / 700. 500은 쓰지 않는다.**
- 버튼은 pill, 유틸리티 카드는 radius 18px.
- **카드·버튼·텍스트에 그림자를 넣지 않는다.** 밝은 면과 어두운 면의 교차가 구분선 역할을 한다.
- 잉크는 `#1d1d1f`, 순수 검정이 아니다.

---

## 커밋

- **메시지는 한국어로 쓴다.** 제목 한 줄 + 빈 줄 + 본문(왜 그렇게 했는지).
- **자기가 만든 파일만 명시적 경로로 스테이징한다.** `git add -A`는 다른 사람의 진행 중인 변경을 자기 커밋에 쓸어 담는다. 실제로 그럴 뻔한 적이 있다.
- 작업 단위로 자주 커밋한다.
- Claude가 작성한 커밋에는 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`을 넣는다.
- **커밋과 함께 개발일지를 쓴다.** (위 규칙 참고)

---

## 환경 — 함정이 있다

**Windows 11 / PowerShell.** Bash 툴도 쓸 수 있지만 셸이 다르다.

**Bash 툴에서 PowerShell here-string(`@'...'@`)을 쓰지 않는다.** `@` 문자가 그대로 들어가 커밋 메시지가 망가진다. 여러 줄 문자열이 필요하면 Bash heredoc(`<<'EOF'`)을 쓴다. 이 실수가 두 번 났다.

**PowerShell에서 네이티브 명령에 `2>&1`을 붙이지 않는다.** 정상 종료(exit 0)인데도 `NativeCommandError`가 뜬다. stderr는 이미 캡처된다.

**Docker가 없어서 `supabase start`(로컬 스택)를 못 쓴다.** 클라우드 프로젝트에 `npx supabase db push`로 마이그레이션을 올린다.

**스택 버전이 매우 최신이다.** Vite 8 / TypeScript 6 / React 19.2 / vitest 4 / Tailwind 4 / jsdom 29. 문제가 생기면 버전 차이를 먼저 의심한다. 스캐폴드는 ESLint가 아니라 **oxlint**를 쓴다.

---

## 자주 쓰는 명령

```bash
# 개발 서버
cd frontend && npm run dev          # http://localhost:5173

# 테스트
cd frontend && npm test             # 1회 실행
cd frontend && npm run test:watch   # 감시 모드

# 빌드 (타입 검사 포함)
cd frontend && npm run build

# Supabase 마이그레이션 적용
npx supabase db push

# DB 타입 재생성 (스키마 바꾼 뒤 반드시)
npx supabase gen types typescript --linked > frontend/src/lib/database.types.ts
```

## Supabase 프로젝트

| | |
|---|---|
| Project Ref | `mpcphuyvffsccsmrocwu` |
| Region | `ap-southeast-1` (싱가포르) |
| URL·anon key | `frontend/.env.local` (git 제외) |
