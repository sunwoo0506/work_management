# 1단계 구현 계획 — 뼈대와 업무

| 항목 | 내용 |
|---|---|
| 단계 | **1단계 / 전체 7단계** (설계서 §13) |
| 목표 | 인박스에 던져두고 업무로 승격해 칸반으로 굴릴 수 있는 상태 |
| 설계서 | `docs/specs/2026-08-09-work-management-design-v1.md` |
| 연동 계약서 | `docs/specs/2026-08-09-integration-contract-v1.md` |
| 작성일 | 2026-08-10 |
| 선행 상태 | 프론트엔드 스캐폴드 · 디자인 토큰 · 계산 로직 4개(테스트 35개) 완료 |

---

## 0. 이 단계에서 무엇을 만들고 무엇을 안 만드나

### 만드는 것

```
데이터 창고 7개  →  로그인  →  6탭 껍데기  →  업무(목록·칸반·등록)
                                              →  지시사항
                                              →  인박스(캡처·승격)
                                              →  시드
```

### 안 만드는 것 — 그리고 그 이유

| 안 만드는 것 | 언제 | 왜 지금 안 하나 |
|---|---|---|
| **발행 층** (`issue_publications`) | 6단계 | **연동 계약서가 초안 상태**다. 필드가 계약서 §4에서 나오는데 아직 경영관리서비스 확인 전이다 |
| 절차·실행이력·예외 | 2단계 | |
| AI 비서·문서 | 3단계 | |
| 「오늘」 화면·업무일지 | 4단계 | 업무는 4단계 없이도 굴러간다 |
| 리포트 | 5단계 | |
| 계획·기준·녹음 | 7단계 | |

> **발행 층만 빼고 진행하기로 한 결정** — 발행 층은 6단계에서야 쓰이고, 1단계에 필요한 것(업무·지시사항·인박스)은 계약서와 무관하다. 계약서 확정을 기다리면 **아무것도 못 만든 채로 상대를 기다리게 된다.**

---

## 1. 만들 테이블 7개

설계서의 29개 중 **1단계에 필요한 것만** 만든다. 나머지는 각 단계에서 마이그레이션을 추가한다.

| 테이블 | 무엇을 담나 | 층 |
|---|---|---|
| `companies` | 사업체 | 실행 |
| `directives` | 대표 지시사항 (D-01 ~ D-13) | 실행 |
| `tasks` | 업무 | 실행 |
| `checklist` | 업무 안의 체크 항목 | 실행 |
| `inbox` | 분류 전 메모 | 실행 |
| `activity` | 무엇이 언제 바뀌었나 | 기록 |
| `disclosure_policy` | **AI가 인용해도 되는 데이터 목록** | 정책 |

### 왜 `disclosure_policy`를 1단계에 넣나

AI는 3단계에서야 들어온다. 그런데 **정책은 지금 넣는다.**

설계서 §7의 취지가 *"나중에 AI를 붙이는 사람이 문서를 안 읽어도 사고가 안 나야 한다"* 이기 때문이다. 테이블 하나에 행 몇 개라 비용이 거의 없고, **3단계에 가서 "그런 정책이 있었나?" 하는 상황을 막는다.**

행은 **아직 없는 테이블 것까지 미리 넣는다.** 테이블명은 그냥 문자열이라 존재하지 않아도 무방하다.

### 이 테이블만 예외다

CLAUDE.md에 *"모든 테이블에 `company_id`와 `user_id`를 가진다"* 고 적혀 있는데, **`disclosure_policy`는 예외**다. 사람별·업체별 정책이 아니라 **시스템 규칙**이기 때문이다. RLS는 켜되 로그인한 사용자에게 **읽기만** 허용한다.

---

## Task 1 — 스키마 마이그레이션

**만드는 파일**

- `supabase/migrations/20260810000001_stage1_schema.sql`

### Step 1-1. Supabase CLI 링크 확인

```bash
npx supabase link --project-ref mpcphuyvffsccsmrocwu
npx supabase projects list
```

- [ ] `mpcphuyvffsccsmrocwu`가 링크된 것을 확인

> ⚠️ Docker가 없어 로컬 스택(`supabase start`)은 못 쓴다. **클라우드에 바로 올린다.**

### Step 1-2. 스키마 SQL 작성

`supabase/migrations/20260810000001_stage1_schema.sql`

```sql
-- 1단계 스키마 — 뼈대와 업무
-- 설계서 2026-08-09-work-management-design-v1.md §6

create extension if not exists "pgcrypto";

-- 공통: updated_at 자동 갱신
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ─────────────────────────────────────────────
-- companies — 사업체
-- ─────────────────────────────────────────────
create table companies (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default '#0066cc',
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index companies_user_idx on companies(user_id, sort_order);
create trigger companies_updated before update on companies
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────
-- directives — 지시사항 (D-01 ~ D-13)
-- ─────────────────────────────────────────────
create table directives (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  code        text not null,
  title       text not null,
  axis        text,
  area        text,
  source_ref  text,                     -- 사업이해자료 조항 번호만 (§9-1 등)
  summary     text,
  rationale   text,
  due_date    date,
  priority    text not null default 'P1' check (priority in ('P0','P1','P2')),
  status      text not null default '진행중'
              check (status in ('대기','진행중','완료','보류')),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, code)
);
create index directives_company_idx on directives(company_id, sort_order);
create trigger directives_updated before update on directives
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────
-- tasks — 업무
-- ─────────────────────────────────────────────
create table tasks (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  title          text not null,
  detail         text,

  source         text not null default '내 발의'
                 check (source in ('내 발의','요청받음','일지','인박스','회의록','대표지시','절차')),

  -- 「요청받음」·「대표지시」일 때만 채워진다
  requester       text,                 -- 역할·부서로 적는다. 실명 금지
  requester_dept  text,
  intake_channel  text,
  reply_due       date,
  reply_body      text,

  directive_id   uuid references directives(id) on delete set null,
  area           text,
  priority       text not null default 'P1' check (priority in ('P0','P1','P2')),
  status         text not null default '할 일'
                 check (status in ('할 일','진행중','검토요청','완료','보류')),
  start_date     date,
  due_date       date,
  focus_date     date,                  -- 「오늘 하기로 찍은 날」
  progress       integer not null default 0 check (progress between 0 and 100),
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index tasks_company_status_idx on tasks(company_id, status);
create index tasks_directive_idx      on tasks(directive_id);
create index tasks_due_idx            on tasks(company_id, due_date);
create index tasks_focus_idx          on tasks(company_id, focus_date);
create trigger tasks_updated before update on tasks
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────
-- checklist — 업무 안의 체크 항목
-- ─────────────────────────────────────────────
create table checklist (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  task_id     uuid not null references tasks(id) on delete cascade,
  label       text not null,
  required    boolean not null default false,
  done        boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index checklist_task_idx on checklist(task_id, sort_order);
create trigger checklist_updated before update on checklist
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────
-- inbox — 분류 전 메모
-- ─────────────────────────────────────────────
create table inbox (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  content           text not null,
  tag               text,
  origin            text not null default '직접'
                    check (origin in ('직접','회의록','전화메모','경영관리서비스')),
  origin_ref        text,               -- 외부 이슈 번호 등
  promoted_task_id  uuid references tasks(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index inbox_company_idx on inbox(company_id, created_at desc);
create index inbox_pending_idx on inbox(company_id) where promoted_task_id is null;
create trigger inbox_updated before update on inbox
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────
-- activity — 무엇이 언제 바뀌었나
-- ─────────────────────────────────────────────
create table activity (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references companies(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  target_type  text not null,           -- 'task' | 'directive' | 'inbox'
  target_id    uuid not null,
  action       text not null,           -- '생성' | '상태변경' | '승격' | ...
  detail       jsonb,
  occurred_at  timestamptz not null default now()
);
create index activity_company_time_idx on activity(company_id, occurred_at desc);
create index activity_target_idx       on activity(target_type, target_id);

-- ─────────────────────────────────────────────
-- disclosure_policy — AI가 인용해도 되는 데이터 (설계서 §7)
--   ※ 이 테이블만 company_id·user_id가 없다. 시스템 규칙이기 때문이다.
-- ─────────────────────────────────────────────
create table disclosure_policy (
  table_name     text primary key,
  learn_allowed  boolean not null default true,
  quote_allowed  text not null check (quote_allowed in ('가능','불가','조건부')),
  condition      text,
  reason         text not null,
  updated_at     timestamptz not null default now()
);
create trigger disclosure_policy_updated before update on disclosure_policy
  for each row execute function set_updated_at();
```

- [ ] 파일 작성
- [ ] `create table` 7개, `check` 제약, 인덱스가 다 들어갔는지 눈으로 확인

> **왜 PostgreSQL `enum`이 아니라 `text` + `check`인가**
> `enum`은 값을 추가할 때 `ALTER TYPE`이 필요하고 트랜잭션 제약이 있다. `check`는 제약을 **떼고 새로 붙이면** 끝이다. 업무 출처는 앞으로 계속 늘어난다(`절차`, `대표지시`가 이미 그랬다).

> **`tasks`에 `procedure_id`·`run_id`가 없는 이유**
> 설계서 §6.1에는 있지만 **2단계에서 추가**한다. 참조할 `procedures` 테이블이 아직 없어 외래키를 걸 수 없다.

### Step 1-3. 올리기

```bash
npx supabase db push
```

- [ ] 오류 없이 적용
- [ ] Supabase 대시보드 Table Editor에서 테이블 7개 확인

### Step 1-4. 커밋

```bash
git add supabase/migrations/20260810000001_stage1_schema.sql
git commit
```

메시지 요지 — 1단계 테이블 7개. `enum` 대신 `check`를 쓴 이유, `disclosure_policy`가 `user_id` 예외인 이유, `procedure_id`를 2단계로 미룬 이유.

---

## Task 2 — RLS 정책

**만드는 파일**

- `supabase/migrations/20260810000002_stage1_rls.sql`

> 🔴 **이게 없으면 `anon` 키를 가진 누구나 전체 데이터를 읽는다.** 1단계에서 가장 중요한 작업이다.

### Step 2-1. 정책 SQL 작성

```sql
-- 1단계 RLS — 본인 데이터만 보이게

alter table companies         enable row level security;
alter table directives        enable row level security;
alter table tasks             enable row level security;
alter table checklist         enable row level security;
alter table inbox             enable row level security;
alter table activity          enable row level security;
alter table disclosure_policy enable row level security;

-- 사용자 소유 테이블 6개: 본인 것만 전부 허용
create policy own_companies  on companies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_directives on directives
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_tasks      on tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_checklist  on checklist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_inbox      on inbox
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy own_activity   on activity
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 정책 테이블: 로그인한 사용자는 읽기만. 쓰기는 마이그레이션으로만 한다
create policy read_disclosure on disclosure_policy
  for select to authenticated using (true);
```

- [ ] 파일 작성

> **`with check`를 빼먹지 않는다.** `using`만 쓰면 **읽기는 막히는데 남의 `user_id`로 쓰기는 통과**한다.

### Step 2-2. 올리고 확인

```bash
npx supabase db push
```

- [ ] 대시보드에서 7개 테이블 전부 **RLS enabled** 표시 확인
- [ ] SQL Editor에서 확인:

```sql
select tablename, rowsecurity from pg_tables
where schemaname='public' order by tablename;
```

- [ ] `rowsecurity`가 전부 `true`

### Step 2-3. 커밋

```bash
git add supabase/migrations/20260810000002_stage1_rls.sql
git commit
```

---

## Task 3 — Supabase 클라이언트와 DB 타입

**만드는 파일**

- `frontend/src/lib/supabase.ts`
- `frontend/src/lib/database.types.ts` (자동 생성)

### Step 3-1. 타입 생성

```bash
npx supabase gen types typescript --linked > frontend/src/lib/database.types.ts
```

- [ ] 파일에 테이블 7개가 들어갔는지 확인

> **스키마를 바꿀 때마다 이 명령을 다시 돌린다.** 안 돌리면 코드와 DB가 어긋나는 걸 컴파일 단계에서 못 잡는다.

### Step 3-2. 클라이언트 작성

`frontend/src/lib/supabase.ts` — 싱글턴 클라이언트. `import.meta.env`에서 URL·anon 키를 읽고, 값이 없으면 **즉시 에러를 던진다**(조용히 실패하지 않게).

- [ ] 작성
- [ ] `npm run build` 통과

### Step 3-3. 커밋

```bash
git add frontend/src/lib/supabase.ts frontend/src/lib/database.types.ts
git commit
```

---

## Task 4 — 도메인 타입 확장 (TDD)

**고치는 파일**

- `frontend/src/domain/types.ts`

설계서에서 늘어난 값을 반영한다.

| 상수 | 추가 |
|---|---|
| `TASK_SOURCES` | `대표지시`, `절차` |
| (신규) `INBOX_ORIGINS` | `직접`, `회의록`, `전화메모`, `경영관리서비스` |
| (신규) `DIRECTIVE_STATUSES` | `대기`, `진행중`, `완료`, `보류` |

- [ ] `types.ts` 수정
- [ ] 기존 테스트 35개가 그대로 통과하는지 확인 (`npm test`)
- [ ] 커밋: `git add frontend/src/domain/types.ts`

> **DB의 `check` 제약과 이 상수가 항상 같아야 한다.** 어긋나면 화면에서 고른 값이 DB에서 거부된다. 값을 늘릴 땐 **마이그레이션과 이 파일을 같은 커밋에** 넣는다.

---

## Task 5 — 로그인 (매직링크)

**만드는 파일**

- `frontend/src/features/auth/LoginPage.tsx`
- `frontend/src/features/auth/AuthGate.tsx`
- `frontend/src/main.tsx` (수정)

### 무엇을 만드나

이메일을 넣으면 링크가 오고, 그 링크를 누르면 로그인된다. **비밀번호가 없다** — 혼자 쓰는 도구라 비밀번호를 관리할 이유가 없다.

- `AuthGate` — 로그인 상태를 확인해서, 안 됐으면 `LoginPage`를 보여주고 됐으면 앱을 보여준다
- 세션 변화를 구독해서 로그아웃 시 즉시 반영

### Step

- [ ] `LoginPage` — 이메일 입력 + 「링크 보내기」. 보낸 뒤 안내 문구
- [ ] `AuthGate` — 세션 확인 · 로딩 상태 · 세션 구독
- [ ] `main.tsx`에 `QueryClientProvider` + `BrowserRouter` + `AuthGate` 배선
- [ ] Supabase 대시보드에서 **Authentication → URL Configuration → Site URL**이 `http://localhost:5173`인지 확인
- [ ] 실제로 로그인해 본다
- [ ] 커밋: `git add frontend/src/features/auth/ frontend/src/main.tsx`

> ⚠️ Site URL이 안 맞으면 링크를 눌러도 로그인이 안 된다. 회고 `2026-08-09_v01`에서 미리 확인하라고 남긴 항목이다.

---

## Task 6 — 앱 셸: 사이드바 6탭

**만드는 파일**

- `frontend/src/components/Sidebar.tsx`
- `frontend/src/pages/TodayPage.tsx` · `WorkPage.tsx` · `ProcedurePage.tsx` · `PlanPage.tsx` · `RecordPage.tsx` · `BasePage.tsx`
- `frontend/src/App.tsx` (수정)

### 6탭 (설계서 §4)

```
📌 오늘    📋 업무    ⚙️ 절차    🗓 계획    ✏️ 기록    📖 기준
```

**1단계에서 내용이 들어가는 건 「업무」와 「기준」뿐이다.** 나머지 4개는 *"n단계에서 만듭니다"* 라고 적힌 자리표시자다.

### Step

- [ ] 페이지 6개 자리표시자 작성 — 각 페이지에 **어느 단계에서 채워지는지** 적어둔다
- [ ] `Sidebar` — 빠른 입력 자리 + 메뉴 6개 + 「오늘 한눈에」 카운터 자리
- [ ] `App.tsx`에 라우터 배선. 업체 셀렉터는 **업체가 2개 이상일 때만** 렌더
- [ ] 디자인 규격 확인 — Action Blue 하나만, 본문 17px, 그림자 없음
- [ ] 탭 6개를 눌러 이동되는지 확인
- [ ] 커밋: `git add frontend/src/components/Sidebar.tsx frontend/src/pages/ frontend/src/App.tsx`

---

## Task 7 — 업체 컨텍스트

**만드는 파일**

- `frontend/src/features/companies/useCompany.ts`

### 무엇을 만드나

지금 어느 업체를 보고 있는지를 앱 전체가 공유한다. **업체가 1개면 셀렉터를 숨긴다**(설계서 §5.9).

- [ ] 업체 목록 조회 훅
- [ ] 현재 업체 상태 (기본값 = 첫 번째)
- [ ] `업체 수 <= 1`이면 셀렉터를 렌더하지 않는다
- [ ] `npm run build` 통과
- [ ] 커밋: `git add frontend/src/features/companies/`

---

## Task 8 — 업무 API와 목록

**만드는 파일**

- `frontend/src/features/tasks/api.ts`
- `frontend/src/features/tasks/hooks.ts`
- `frontend/src/components/Badge.tsx`
- `frontend/src/features/tasks/TaskList.tsx`
- `frontend/src/pages/WorkPage.tsx` (수정)

### Step 8-1. API + 훅

- [ ] `api.ts` — 목록 조회 · 단건 조회 · 생성 · 수정 · 상태 변경 · 삭제
- [ ] `hooks.ts` — TanStack Query. **상태 변경은 낙관적 업데이트**로 (클릭이 즉시 반영돼야 한다)

### Step 8-2. 화면

- [ ] `Badge` — 일정 상태(지연/임박/정상/…) · 중요도 · 출처
- [ ] `TaskList` — **`domain/sort.ts`로 정렬**해서 표시. D-day는 `domain/dday.ts`
- [ ] `WorkPage`에 연결

> **정렬과 D-day를 화면에서 다시 계산하지 않는다.** 이미 `src/domain/`에 있고 테스트가 붙어 있다. 화면에서 또 짜면 두 곳이 어긋난다.

### Step 8-3. 확인 · 커밋

- [ ] 업무를 몇 건 넣고 정렬 순서가 맞는지 본다
- [ ] 커밋: `git add frontend/src/features/tasks/ frontend/src/components/Badge.tsx frontend/src/pages/WorkPage.tsx`

---

## Task 9 — 업무 등록·수정 폼

**만드는 파일**

- `frontend/src/components/Field.tsx`
- `frontend/src/features/tasks/TaskForm.tsx`
- `frontend/src/features/tasks/TaskDetail.tsx`

### 담을 것

| 항상 | 「요청받음」·「대표지시」일 때만 |
|---|---|
| 제목 · 상세 · 출처 · 영역 · 중요도 · 상태 · 시작일 · 기한 · 진행률 · 지시사항 연결 | 요청자 · 부서 · 접수경로 · 회신기한 · 회신내용 |

- [ ] `Field` — 라벨 + 입력 공통 컴포넌트
- [ ] `TaskForm` — 등록·수정 겸용. 출처에 따라 요청 관련 칸을 보였다 숨긴다
- [ ] `TaskDetail` — 상세 + 체크리스트 + **「이슈로 공유」 버튼 자리** (6단계에서 동작. 지금은 *"6단계에서 연결됩니다"* 안내)
- [ ] **요청받은 업무는 회신 내용이 없으면 「완료」로 못 바꾼다** (설계서 §4.2)
- [ ] 확인 후 커밋: `git add frontend/src/features/tasks/ frontend/src/components/Field.tsx`

---

## Task 10 — 칸반 보드

**만드는 파일**

- `frontend/src/features/tasks/TaskBoard.tsx`

### Step

- [ ] `할 일 → 진행중 → 검토요청 → 완료` 4열. **`보류`는 하단 별도 영역**
- [ ] dnd-kit으로 카드 이동 → 상태 변경 (낙관적 업데이트)
- [ ] 목록 뷰 / 칸반 뷰 전환
- [ ] 카드에 D-day 배지, 지연이면 경고색(`#d70015`)
- [ ] 카드를 옮겼다가 새로고침해도 유지되는지 확인
- [ ] 커밋: `git add frontend/src/features/tasks/TaskBoard.tsx frontend/src/pages/WorkPage.tsx`

> **경고색은 기한 초과에만 쓴다.** 다른 데 쓰기 시작하면 경고가 안 보인다(설계서 §8.1).

---

## Task 11 — 지시사항

**만드는 파일**

- `frontend/src/features/directives/api.ts` · `hooks.ts` · `DirectiveList.tsx`
- `frontend/src/pages/BasePage.tsx` (수정)

### Step

- [ ] API + 훅
- [ ] `DirectiveList` — 지시사항별로 **`domain/rollup.ts`** 로 집계해 표시
      (시작일 = 최소 시작일 / 마감일 = 최대 기한 / 진행률 = 평균 / 완료 n건 중 m건)
- [ ] 「기준」 탭에 연결
- [ ] 커밋: `git add frontend/src/features/directives/ frontend/src/pages/BasePage.tsx`

---

## Task 12 — 인박스

**만드는 파일**

- `frontend/src/features/inbox/api.ts` · `hooks.ts`
- `frontend/src/features/inbox/InboxCapture.tsx` · `InboxList.tsx` · `PromoteDialog.tsx`

### 무엇을 만드나

```
메모 입력 → 인박스에 쌓임 → 「업무로」 → 중요도·기한·영역 고르기 → 업무 생성
                          → 「버림」   → 삭제
```

### Step

- [ ] `InboxCapture` — 한 줄 입력. **엔터로 바로 저장** (마찰이 있으면 안 쓴다)
- [ ] `InboxList` — 미승격 항목 목록
- [ ] `PromoteDialog` — **`domain/promote.ts`의 `toTaskInsert`를 그대로 쓴다.** 60자 넘으면 제목을 자르고 전문은 상세에 넣는 규칙이 이미 테스트돼 있다
- [ ] 승격되면 `inbox.promoted_task_id`를 채우고 목록에서 빠진다
- [ ] 1단계 인박스는 **직접 던져둔 메모만** 받는다 (`origin = '직접'`)
- [ ] 커밋: `git add frontend/src/features/inbox/`

---

## Task 13 — 시드 데이터

**만드는 파일**

- `supabase/migrations/20260810000003_stage1_seed.sql`

### 넣는 것

| 무엇 | 몇 건 | 주의 |
|---|---|---|
| 업체 (제우스) | 1 | |
| 지시사항 | 13 | **조항 번호와 제목만.** 사업이해자료 본문을 옮기지 않는다 |
| 공개 정책 | 12~13 | 아직 없는 테이블 것까지 미리 |

**안 넣는 것** — 금액·수치(설계서 §12), 실명, 절차, 문서 양식, 샘플 업무

### 지시사항 13건

사업이해자료에서 도출한 것. **`source_ref`에 조항 번호만 적고 내용은 옮기지 않는다.**

`D-01`~`D-07`(§9의 7가지) · `D-08` 승급률(§7) · `D-09` 현장손익(§5-3) · `D-10` 축3 대사(§6-3) · `D-11` 현금표(§13) · `D-12` 회생지원(§10) · `D-13` 제조업 여부 점검(§4-1)

### 공개 정책 행

설계서 §7의 표를 그대로 넣는다.

```sql
insert into disclosure_policy (table_name, learn_allowed, quote_allowed, condition, reason) values
  ('issue_publications', true, '가능',   null, '사용자가 발행한 것'),
  ('directives',         true, '가능',   null, '대표가 준 것'),
  ('documents',          true, '조건부', '확정본 중 발송·제출한 것만', '초안은 미완성물'),
  ('periodic_reports',   true, '조건부', '사용자가 확정한 것만',       '성과평가 자료'),
  ('procedures',         true, '불가',   null, '업무 노하우'),
  ('procedure_steps',    true, '불가',   null, '업무 노하우'),
  ('document_templates', true, '불가',   null, '업무 노하우'),
  ('runs',               true, '불가',   null, '소요시간이 새는 자리'),
  ('run_steps',          true, '불가',   null, '소요시간이 새는 자리'),
  ('exceptions',         true, '불가',   null, '소요시간이 새는 자리'),
  ('tasks',              true, '불가',   null, '비공개 작업 내역'),
  ('checklist',          true, '불가',   null, '비공개 작업 내역'),
  ('daily_logs',         true, '불가',   null, '비공개 작업 내역'),
  ('assistant_threads',  true, '불가',   null, '사용자가 AI에게 무엇을 물었는지는 가장 사적인 기록'),
  ('assistant_messages', true, '불가',   null, '사용자가 AI에게 무엇을 물었는지는 가장 사적인 기록');
```

### Step

- [ ] SQL 작성. **업체와 지시사항은 `user_id`가 필요하므로** 로그인한 사용자 ID를 어떻게 넣을지 정한다 (마이그레이션에 하드코딩하지 말고, 최초 로그인 후 앱에서 만들거나 별도 스크립트로)
- [ ] `npx supabase db push`
- [ ] 지시사항 13건이 「기준」 탭에 보이는지 확인
- [ ] 커밋: `git add supabase/migrations/20260810000003_stage1_seed.sql`

> ⚠️ **`user_id` 하드코딩 주의.** 마이그레이션에 특정 사용자 UUID를 박으면 다른 환경에서 안 돌아간다. **앱에서 최초 진입 시 업체·지시사항을 만드는 방식**을 권한다.

---

## Task 14 — 빠른 입력과 「오늘 한눈에」

**고치는 파일**

- `frontend/src/components/QuickAdd.tsx` (신규)
- `frontend/src/components/Sidebar.tsx` (수정)

### Step

- [ ] `QuickAdd` — 「＋ 새 업무」. 회의록·전화메모 버튼은 **7단계 자리표시자**
- [ ] 사이드바 하단 카운터 — `할 일 n · 지연 n · 회신 대기 n · 인박스 n`
      (⚠️예외는 5단계에서 붙는다)
- [ ] 지연 건수는 **`domain/dday.ts`의 `scheduleOf`** 로 계산
- [ ] 커밋: `git add frontend/src/components/QuickAdd.tsx frontend/src/components/Sidebar.tsx`

---

## Task 15 — 마무리 검증

- [ ] `npm test` — 35개 통과
- [ ] `npm run build` — 타입 오류 없음
- [ ] `npm run lint` — oxlint 통과
- [ ] **`src/domain/`이 Supabase·React를 import하지 않는지 확인**

```bash
cd frontend && grep -rn "supabase\|react" src/domain --include=*.ts | grep -v __tests__
```
결과가 비어 있어야 한다.

- [ ] **빌드 산출물에 키가 없는지 확인** (anon 키는 있어도 되지만 `service_role`은 절대 안 됨)

```bash
cd frontend && npm run build && grep -r "service_role" dist/ ; echo "종료코드 $? — 1이면 정상(없음)"
```

- [ ] **수용 기준 점검** (설계서 §9의 1단계 해당 항목)

| 항목 | |
|---|---|
| 본인 데이터만 조회된다 (RLS) | ⬜ |
| 업체가 1개일 때 셀렉터가 안 보인다 | ⬜ |
| 요청받은 업무는 회신 내용을 적어야 닫힌다 | ⬜ |
| 인박스에서 업무로 승격된다 | ⬜ |
| 진행 중 업무가 지시사항 단위로 묶여 진행률과 함께 보인다 | ⬜ |
| `src/domain/`이 Supabase·React를 import하지 않는다 | ⬜ |

- [ ] 커밋 + **회고 작성** (`docs/retro/`)

---

## 이 단계가 끝나면

**인박스에 던져두고, 업무로 승격하고, 칸반으로 굴릴 수 있다.**

그다음은 **2단계 — 절차와 실행이력**이다. 여기서부터 학습 데이터가 쌓이기 시작한다.

---

## 계획을 실행하며 지킬 것

| | |
|---|---|
| **커밋** | 작업 단위로 자주. **`git add -A` 금지** — 자기가 만든 파일만 명시적 경로로 |
| **회고** | 커밋할 때마다. 비개발자가 읽을 수 있게 (CLAUDE.md) |
| **설계와 달라지면** | **설계서를 먼저 고치고**, 그 경위를 회고에 남긴다 |
| **스키마를 바꾸면** | `npx supabase gen types typescript --linked > frontend/src/lib/database.types.ts` 를 **반드시** 다시 돌린다 |
| **날짜 테스트** | 로컬 벽시계 리터럴. `new Date(2026, 7, 11, 9, 0)` ○ |
| **Bash 툴** | PowerShell here-string(`@'...'@`) 금지. heredoc(`<<'EOF'`) 사용 |

---

## 미확정 — 진행하며 정할 것

| # | 무엇 | 언제 |
|---|---|---|
| P-01 | 시드의 `user_id`를 어떻게 채울 것인가 (마이그레이션 vs 앱 최초 진입) | Task 13 |
| P-02 | `activity` 기록을 어디서 남길 것인가 (앱 코드 vs DB 트리거) | Task 8 |
| P-03 | 업무 정렬 순서를 사람이 직접 바꿀 수 있게 할지 (`sort_order` 활용) | Task 10 |
