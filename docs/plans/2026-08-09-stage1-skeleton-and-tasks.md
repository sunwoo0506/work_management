# 1단계 — 뼈대와 업무 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 떠오른 것을 인박스에 던져두고, 업무로 승격해 칸반으로 옮길 수 있는 상태까지 만든다.

**Architecture:** React SPA가 Supabase(Postgres + Auth)에 직접 붙는다. 서버 코드는 없다. 서버 상태는 TanStack Query가 캐싱하고 낙관적 업데이트로 즉시 반영한다. 순수 로직(D-day 계산, 정렬, 승격 매핑, 진행률 집계)은 Supabase와 분리된 함수로 두고 Vitest로 테스트한다.

**Tech Stack:** React 19 · Vite · TypeScript · Tailwind v4 · TanStack Query v5 · dnd-kit · Supabase JS v2 · Vitest

**설계서:** `docs/specs/2026-08-09-personal-work-management-design.md`

---

## 사전 조건

**Docker가 없으므로 로컬 Supabase 스택(`supabase start`)은 쓰지 않는다.** 클라우드 프로젝트 하나를 만들고 마이그레이션을 `supabase db push`로 올린다.

## 파일 구조

```
Work_Management/
  frontend/
    package.json  vite.config.ts  tsconfig.json  index.html
    src/
      main.tsx                     진입점 · QueryClient · Router
      App.tsx                      인증 게이트 + 레이아웃
      index.css                    Tailwind v4 + 애플 디자인 토큰
      lib/
        supabase.ts                Supabase 클라이언트 (싱글턴)
        database.types.ts          supabase gen types 자동생성
      domain/
        dday.ts                    D-day·일정 상태 계산 (순수)
        sort.ts                    업무 정렬 (순수)
        promote.ts                 인박스 → 업무 필드 매핑 (순수)
        rollup.ts                  지시사항별 진행률 집계 (순수)
        types.ts                   도메인 타입
      features/
        auth/     AuthGate.tsx  LoginPage.tsx
        tasks/    api.ts  hooks.ts  TaskCard.tsx  TaskList.tsx  TaskBoard.tsx  TaskForm.tsx
        inbox/    api.ts  hooks.ts  InboxCapture.tsx  InboxList.tsx  PromoteDialog.tsx
        directives/ api.ts  hooks.ts  DirectiveList.tsx
      components/
        Sidebar.tsx  QuickAdd.tsx  Badge.tsx  Field.tsx
      pages/
        TodayPage.tsx  WorkPage.tsx  PlanPage.tsx  RecordPage.tsx  BasePage.tsx
    src/domain/__tests__/         Vitest
  supabase/
    migrations/
      20260809000001_stage1_schema.sql
      20260809000002_stage1_rls.sql
      20260809000003_stage1_seed.sql
```

**1단계에서 만드는 테이블은 6개다** — `companies` `directives` `tasks` `checklist` `inbox` `activity`. 나머지 13개는 각 단계에서 마이그레이션을 추가한다.

`domain/`은 Supabase를 import하지 않는다. 그래야 DB 없이 테스트할 수 있다.

---

## Task 0: Supabase 프로젝트 생성 (사용자 수동)

**이 태스크만 사람이 직접 한다.** 계정이 필요하기 때문이다.

- [ ] **Step 1: 프로젝트 생성**

https://supabase.com/dashboard 에서 New project.
- Name: `work-management`
- Region: `Northeast Asia (Seoul)`
- Database Password: 생성 후 안전한 곳에 보관

- [ ] **Step 2: 키 3개 확보**

Project Settings → API 에서 복사한다.
- Project URL (`https://xxxxx.supabase.co`)
- `anon` public key
- Project Reference ID (URL의 `xxxxx` 부분)

- [ ] **Step 3: 이메일 인증 확인**

Authentication → Providers → Email 이 켜져 있는지 확인. 기본으로 켜져 있다.
Authentication → URL Configuration → Site URL 을 `http://localhost:5173` 으로 설정.

---

## Task 1: 프론트엔드 프로젝트 초기화

**Files:**
- Create: `frontend/` (Vite 스캐폴드)
- Create: `frontend/.env.local`
- Modify: `.gitignore`

- [ ] **Step 1: Vite 프로젝트 생성**

```bash
cd Work_Management
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
```

- [ ] **Step 2: 의존성 설치**

```bash
npm install @supabase/supabase-js @tanstack/react-query react-router-dom @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities date-fns
npm install -D tailwindcss @tailwindcss/vite vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: 환경변수 파일 작성**

`frontend/.env.local` — Task 0에서 받은 값을 넣는다.

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

- [ ] **Step 4: .gitignore 보강**

`Work_Management/.gitignore` 끝에 추가한다.

```
# 프론트엔드
node_modules/
dist/
.env.local
.env.*.local
```

- [ ] **Step 5: Vite 설정**

`frontend/vite.config.ts` 전체를 아래로 교체한다.

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

`frontend/src/test-setup.ts` 생성:

```ts
import '@testing-library/jest-dom/vitest'
```

`frontend/package.json`의 `scripts`에 추가한다.

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: 실행 확인**

Run: `npm run dev`
Expected: `http://localhost:5173`에 Vite 기본 화면이 뜬다. 확인 후 Ctrl+C.

- [ ] **Step 7: 커밋**

```bash
cd Work_Management
git add -A
git commit -m "chore: Vite + React + TS 프론트엔드 초기화"
```

---

## Task 2: 애플 디자인 토큰

**Files:**
- Modify: `frontend/src/index.css`
- Delete: `frontend/src/App.css`

`DESIGN-apple.md`의 토큰을 Tailwind v4의 `@theme`으로 옮긴다. Tailwind v4는 `tailwind.config.js`를 쓰지 않고 CSS에서 토큰을 정의한다.

- [ ] **Step 1: index.css 전체 교체**

```css
@import "tailwindcss";

@theme {
  /* Action Blue — 유일한 인터랙티브 색 */
  --color-action: #0066cc;
  --color-action-focus: #0071e3;
  --color-action-ondark: #2997ff;

  /* 잉크 — 순수 검정이 아니다 */
  --color-ink: #1d1d1f;
  --color-ink-soft: #333333;
  --color-ink-mute: #7a7a7a;

  /* 서피스 */
  --color-canvas: #ffffff;
  --color-parchment: #f5f5f7;
  --color-pearl: #fafafc;
  --color-tile-dark: #272729;
  --color-tile-deep: #252527;

  /* 헤어라인 */
  --color-hairline: #e0e0e0;
  --color-divider: #f0f0f0;

  /* 경고 — HIG 시스템 레드. 기한 초과 전용 */
  --color-alert: #d70015;

  /* radius — sm 유틸리티, lg 카드, pill 버튼 */
  --radius-sm: 8px;
  --radius-md: 11px;
  --radius-lg: 18px;

  /* 본문 17px. 16px이 아니다 */
  --text-body: 17px;
  --text-body--line-height: 1.47;
  --text-caption: 14px;
  --text-tagline: 21px;
  --text-display: 40px;
  --text-hero: 56px;

  --font-sans: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

@layer base {
  html {
    font-size: 17px;
  }
  body {
    @apply bg-canvas text-ink font-sans antialiased;
    font-weight: 400;
    letter-spacing: -0.374px;
  }
  h1, h2, h3, h4 {
    font-weight: 600;
    letter-spacing: -0.374px;
  }
}
```

**weight 사다리는 300 / 400 / 600 / 700이다. 500은 쓰지 않는다.**

- [ ] **Step 2: 기본 CSS 제거**

```bash
rm frontend/src/App.css
```

`frontend/src/App.tsx`에서 `import './App.css'` 줄을 삭제한다.

- [ ] **Step 3: 토큰 적용 확인**

`frontend/src/App.tsx` 전체를 임시로 교체하고 `npm run dev`로 확인한다.

```tsx
export default function App() {
  return (
    <div className="p-12">
      <p className="text-caption text-ink-mute uppercase tracking-wide">디자인 토큰</p>
      <h1 className="text-[40px] leading-[1.1] mt-2">Work Management</h1>
      <button className="mt-6 bg-action text-white rounded-[9999px] px-[22px] py-[11px] text-body">
        Action Blue pill
      </button>
      <div className="mt-6 bg-parchment rounded-lg p-6 border border-hairline">
        파치먼트 카드 · radius 18px
      </div>
    </div>
  )
}
```

Expected: 파란 pill 버튼과 회색 카드가 보인다. 확인 후 Ctrl+C.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat: 애플 디자인 토큰을 Tailwind theme으로 정의"
```

---

## Task 3: 1단계 스키마 마이그레이션

**Files:**
- Create: `supabase/migrations/20260809000001_stage1_schema.sql`

- [ ] **Step 1: Supabase CLI 링크**

```bash
cd Work_Management
npx supabase login
npx supabase link --project-ref <Task 0의 Project Reference ID>
```

- [ ] **Step 2: 스키마 파일 작성**

`supabase/migrations/20260809000001_stage1_schema.sql`

```sql
-- 1단계: 뼈대와 업무
-- companies / directives / tasks / checklist / inbox / activity

create extension if not exists "uuid-ossp";

create table companies (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default '#0066cc',
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table directives (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  company_id    uuid not null references companies(id) on delete cascade,
  code          text not null,
  title         text not null,
  axis          text,
  area          text,
  source        text,
  summary       text,
  rationale     text,
  deadline_text text,
  due_date      date,
  priority      text not null default 'P1' check (priority in ('P0','P1','P2')),
  status        text not null default '미착수' check (status in ('미착수','진행중','완료','보류')),
  created_at    timestamptz not null default now(),
  unique (company_id, code)
);

create table tasks (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  company_id     uuid not null references companies(id) on delete cascade,
  directive_id   uuid references directives(id) on delete set null,
  title          text not null,
  detail         text,
  source         text not null default '내 발의'
                 check (source in ('내 발의','요청받음','일지','인박스','회의록')),
  requester      text,
  requester_dept text,
  channel        text,
  reply          text,
  area           text,
  priority       text not null default 'P1' check (priority in ('P0','P1','P2')),
  status         text not null default '할 일'
                 check (status in ('할 일','진행중','검토요청','완료','보류')),
  start_date     date,
  due_date       date,
  focus_date     date,
  progress       int not null default 0 check (progress between 0 and 100),
  board_order    int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create index tasks_company_status_idx on tasks (company_id, status);
create index tasks_due_idx on tasks (due_date);
create index tasks_focus_idx on tasks (focus_date);

create table checklist (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  task_id    uuid not null references tasks(id) on delete cascade,
  label      text not null,
  required   boolean not null default true,
  completed  boolean not null default false,
  sort_order int not null default 0
);

create table inbox (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  company_id        uuid not null references companies(id) on delete cascade,
  content           text not null,
  tag               text,
  origin            text not null default '직접'
                    check (origin in ('직접','회의록','전화메모')),
  origin_id         uuid,
  promoted_task_id  uuid references tasks(id) on delete set null,
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz
);

create index inbox_open_idx on inbox (company_id, resolved_at);

create table activity (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  company_id  uuid not null references companies(id) on delete cascade,
  entity_type text not null,
  entity_id   uuid,
  action      text not null,
  detail      text,
  created_at  timestamptz not null default now()
);

-- updated_at 자동 갱신
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tasks_touch before update on tasks
  for each row execute function touch_updated_at();
```

- [ ] **Step 3: 마이그레이션 적용**

```bash
npx supabase db push
```

Expected: `Applying migration 20260809000001_stage1_schema.sql...` 후 성공. 대시보드 Table Editor에서 테이블 6개가 보인다.

- [ ] **Step 4: 커밋**

```bash
git add supabase/
git commit -m "feat(db): 1단계 스키마 — 업체·지시사항·업무·체크리스트·인박스·활동"
```

---

## Task 4: RLS 정책

**Files:**
- Create: `supabase/migrations/20260809000002_stage1_rls.sql`

RLS를 켜지 않으면 anon 키를 가진 누구나 전체 데이터를 읽는다. **반드시 필요하다.**

- [ ] **Step 1: 정책 파일 작성**

`supabase/migrations/20260809000002_stage1_rls.sql`

```sql
-- 본인 데이터만 읽고 쓴다

alter table companies  enable row level security;
alter table directives enable row level security;
alter table tasks      enable row level security;
alter table checklist  enable row level security;
alter table inbox      enable row level security;
alter table activity   enable row level security;

create policy own_companies on companies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy own_directives on directives
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy own_tasks on tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy own_checklist on checklist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy own_inbox on inbox
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy own_activity on activity
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: 적용**

```bash
npx supabase db push
```

- [ ] **Step 3: RLS가 켜졌는지 확인**

대시보드 → Table Editor → `tasks` → 우측 상단에 "RLS enabled" 표시를 확인한다.
또는 SQL Editor에서:

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by tablename;
```

Expected: 6개 테이블 모두 `rowsecurity = true`.

- [ ] **Step 4: 커밋**

```bash
git add supabase/
git commit -m "feat(db): RLS 정책 — 본인 데이터만 접근"
```

---

## Task 5: Supabase 클라이언트와 타입

**Files:**
- Create: `frontend/src/lib/supabase.ts`
- Create: `frontend/src/lib/database.types.ts` (자동생성)

- [ ] **Step 1: 타입 생성**

```bash
cd Work_Management
npx supabase gen types typescript --linked > frontend/src/lib/database.types.ts
```

Expected: `Database` 타입이 들어 있는 파일이 생성된다. `tasks`, `inbox` 등이 보이는지 확인한다.

- [ ] **Step 2: 클라이언트 작성**

`frontend/src/lib/supabase.ts`

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error(
    'VITE_SUPABASE_URL 과 VITE_SUPABASE_ANON_KEY 가 필요합니다. frontend/.env.local 을 확인하세요.',
  )
}

export const supabase = createClient<Database>(url, key)

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type Insert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type Update<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
```

- [ ] **Step 3: 타입 체크**

Run: `cd frontend && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat: Supabase 클라이언트와 DB 타입 생성"
```

---

## Task 6: 도메인 로직 — D-day와 일정 상태 (TDD)

**Files:**
- Create: `frontend/src/domain/types.ts`
- Create: `frontend/src/domain/dday.ts`
- Test: `frontend/src/domain/__tests__/dday.test.ts`

**날짜 경계가 틀리기 쉬운 곳이다. 테스트를 먼저 쓴다.**

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/domain/__tests__/dday.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { daysUntil, scheduleOf, ddayLabel } from '../dday'

const TODAY = new Date('2026-08-11T09:00:00+09:00')

describe('daysUntil', () => {
  it('오늘이면 0', () => {
    expect(daysUntil('2026-08-11', TODAY)).toBe(0)
  })
  it('내일이면 1', () => {
    expect(daysUntil('2026-08-12', TODAY)).toBe(1)
  })
  it('어제면 -1', () => {
    expect(daysUntil('2026-08-10', TODAY)).toBe(-1)
  })
  it('시각이 늦어도 날짜만 본다', () => {
    expect(daysUntil('2026-08-11', new Date('2026-08-11T23:59:00+09:00'))).toBe(0)
  })
  it('기한이 없으면 null', () => {
    expect(daysUntil(null, TODAY)).toBeNull()
  })
})

describe('scheduleOf', () => {
  it('완료된 업무는 기한이 지났어도 완료', () => {
    expect(scheduleOf({ status: '완료', due_date: '2026-08-01' }, TODAY)).toBe('완료')
  })
  it('보류는 보류', () => {
    expect(scheduleOf({ status: '보류', due_date: '2026-08-01' }, TODAY)).toBe('보류')
  })
  it('기한이 지나면 지연', () => {
    expect(scheduleOf({ status: '할 일', due_date: '2026-08-10' }, TODAY)).toBe('지연')
  })
  it('오늘 마감은 임박', () => {
    expect(scheduleOf({ status: '할 일', due_date: '2026-08-11' }, TODAY)).toBe('임박')
  })
  it('7일 이내는 임박', () => {
    expect(scheduleOf({ status: '할 일', due_date: '2026-08-18' }, TODAY)).toBe('임박')
  })
  it('8일 뒤는 정상', () => {
    expect(scheduleOf({ status: '할 일', due_date: '2026-08-19' }, TODAY)).toBe('정상')
  })
  it('기한이 없으면 기한없음', () => {
    expect(scheduleOf({ status: '할 일', due_date: null }, TODAY)).toBe('기한없음')
  })
})

describe('ddayLabel', () => {
  it('오늘', () => expect(ddayLabel(0)).toBe('오늘 마감'))
  it('미래', () => expect(ddayLabel(13)).toBe('D-13'))
  it('과거', () => expect(ddayLabel(-3)).toBe('3일 지연'))
  it('없음', () => expect(ddayLabel(null)).toBe('기한 미정'))
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npm test`
Expected: FAIL — `Failed to resolve import "../dday"`

- [ ] **Step 3: 도메인 타입 작성**

`frontend/src/domain/types.ts`

```ts
export const PRIORITIES = ['P0', 'P1', 'P2'] as const
export type Priority = (typeof PRIORITIES)[number]

export const TASK_STATUSES = ['할 일', '진행중', '검토요청', '완료', '보류'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** 칸반에 보이는 열. 보류는 별도 영역에 둔다. */
export const BOARD_STATUSES = ['할 일', '진행중', '검토요청', '완료'] as const

export const TASK_SOURCES = ['내 발의', '요청받음', '일지', '인박스', '회의록'] as const
export type TaskSource = (typeof TASK_SOURCES)[number]

export type Schedule = '지연' | '임박' | '정상' | '완료' | '보류' | '기한없음'

export const AREAS = [
  '인수인계', '품목·가격', '원가·단위', '재고', '축별손익',
  '현장손익', '자금·현금', '회계·세무', '회생지원', '데이터·지표', '보고·마감',
] as const
```

- [ ] **Step 4: 구현**

`frontend/src/domain/dday.ts`

```ts
import type { Schedule, TaskStatus } from './types'

/** 로컬 자정 기준으로 날짜만 비교한다. 시각은 무시한다. */
function atMidnight(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const DAY_MS = 86_400_000

export function daysUntil(due: string | null, today: Date): number | null {
  if (!due) return null
  return Math.round((atMidnight(parseDate(due)) - atMidnight(today)) / DAY_MS)
}

export function scheduleOf(
  task: { status: TaskStatus | string; due_date: string | null },
  today: Date,
): Schedule {
  if (task.status === '완료') return '완료'
  if (task.status === '보류') return '보류'
  const d = daysUntil(task.due_date, today)
  if (d === null) return '기한없음'
  if (d < 0) return '지연'
  if (d <= 7) return '임박'
  return '정상'
}

export function ddayLabel(d: number | null): string {
  if (d === null) return '기한 미정'
  if (d === 0) return '오늘 마감'
  if (d > 0) return `D-${d}`
  return `${Math.abs(d)}일 지연`
}
```

- [ ] **Step 5: 통과 확인**

Run: `cd frontend && npm test`
Expected: PASS — 15개 테스트 통과.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat(domain): D-day와 일정 상태 계산"
```

---

## Task 7: 도메인 로직 — 업무 정렬 (TDD)

**Files:**
- Create: `frontend/src/domain/sort.ts`
- Test: `frontend/src/domain/__tests__/sort.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/domain/__tests__/sort.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { sortTasks } from '../sort'

const TODAY = new Date('2026-08-11T09:00:00+09:00')

const t = (id: string, priority: string, due: string | null) => ({
  id, priority, due_date: due, status: '할 일',
})

describe('sortTasks', () => {
  it('지연된 것이 가장 먼저 온다', () => {
    const rows = [t('a', 'P2', '2026-08-20'), t('b', 'P2', '2026-08-01')]
    expect(sortTasks(rows, TODAY).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('같은 일정 상태면 중요도 순', () => {
    const rows = [t('a', 'P2', '2026-08-20'), t('b', 'P0', '2026-08-20')]
    expect(sortTasks(rows, TODAY).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('같은 중요도면 기한이 이른 것 먼저', () => {
    const rows = [t('a', 'P1', '2026-08-25'), t('b', 'P1', '2026-08-20')]
    expect(sortTasks(rows, TODAY).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('기한 없는 것은 맨 뒤', () => {
    const rows = [t('a', 'P0', null), t('b', 'P2', '2026-09-30')]
    expect(sortTasks(rows, TODAY).map(r => r.id)).toEqual(['b', 'a'])
  })

  it('완료는 항상 맨 뒤', () => {
    const rows = [
      { ...t('done', 'P0', '2026-08-01'), status: '완료' },
      t('open', 'P2', '2026-09-30'),
    ]
    expect(sortTasks(rows, TODAY).map(r => r.id)).toEqual(['open', 'done'])
  })

  it('원본 배열을 바꾸지 않는다', () => {
    const rows = [t('a', 'P2', '2026-08-20'), t('b', 'P0', '2026-08-20')]
    sortTasks(rows, TODAY)
    expect(rows.map(r => r.id)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npm test`
Expected: FAIL — `Failed to resolve import "../sort"`

- [ ] **Step 3: 구현**

`frontend/src/domain/sort.ts`

```ts
import { scheduleOf } from './dday'
import type { Schedule } from './types'

const SCHEDULE_RANK: Record<Schedule, number> = {
  '지연': 0, '임박': 1, '정상': 2, '기한없음': 3, '보류': 4, '완료': 5,
}

const PRIORITY_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2 }

type Sortable = { priority: string; due_date: string | null; status: string }

export function sortTasks<T extends Sortable>(rows: readonly T[], today: Date): T[] {
  return [...rows].sort((a, b) => {
    const sa = SCHEDULE_RANK[scheduleOf(a, today)]
    const sb = SCHEDULE_RANK[scheduleOf(b, today)]
    if (sa !== sb) return sa - sb

    const pa = PRIORITY_RANK[a.priority] ?? 9
    const pb = PRIORITY_RANK[b.priority] ?? 9
    if (pa !== pb) return pa - pb

    if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
    if (a.due_date) return -1
    if (b.due_date) return 1
    return 0
  })
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && npm test`
Expected: PASS — 21개 테스트 통과.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(domain): 업무 정렬 — 일정 상태 → 중요도 → 기한"
```

---

## Task 8: 도메인 로직 — 지시사항 진행률 집계 (TDD)

**Files:**
- Create: `frontend/src/domain/rollup.ts`
- Test: `frontend/src/domain/__tests__/rollup.test.ts`

설계서 §5.1 — 묶음의 시작일은 최소 시작일, 마감일은 최대 기한, 진행률은 평균이다.

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/domain/__tests__/rollup.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { rollupByDirective } from '../rollup'

const directives = [
  { id: 'd1', code: 'D-01', title: '품목구분 확정' },
  { id: 'd2', code: 'D-03', title: '단위환산 기준' },
]

const tasks = [
  { id: 't1', directive_id: 'd1', start_date: '2026-08-10', due_date: '2026-08-24', progress: 100, status: '완료' },
  { id: 't2', directive_id: 'd1', start_date: '2026-08-12', due_date: '2026-08-20', progress: 20,  status: '진행중' },
  { id: 't3', directive_id: 'd2', start_date: '2026-08-17', due_date: '2026-08-24', progress: 0,   status: '할 일' },
  { id: 't4', directive_id: null,  start_date: '2026-08-11', due_date: '2026-08-11', progress: 0,  status: '할 일' },
]

describe('rollupByDirective', () => {
  it('지시사항별로 묶는다', () => {
    const r = rollupByDirective(directives, tasks)
    expect(r.map(x => x.code)).toEqual(['D-01', 'D-03'])
  })

  it('시작일은 최소, 마감일은 최대', () => {
    const [d1] = rollupByDirective(directives, tasks)
    expect(d1.startDate).toBe('2026-08-10')
    expect(d1.dueDate).toBe('2026-08-24')
  })

  it('진행률은 평균을 반올림한다', () => {
    const [d1] = rollupByDirective(directives, tasks)
    expect(d1.progress).toBe(60)
  })

  it('완료 건수와 전체 건수를 센다', () => {
    const [d1] = rollupByDirective(directives, tasks)
    expect(d1.doneCount).toBe(1)
    expect(d1.totalCount).toBe(2)
  })

  it('업무가 없는 지시사항은 진행률 0에 날짜 null', () => {
    const r = rollupByDirective([{ id: 'd9', code: 'D-09', title: '없음' }], tasks)
    expect(r[0]).toMatchObject({ progress: 0, totalCount: 0, startDate: null, dueDate: null })
  })

  it('지시사항에 연결되지 않은 업무는 무시한다', () => {
    const r = rollupByDirective(directives, tasks)
    expect(r.reduce((s, x) => s + x.totalCount, 0)).toBe(3)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npm test`
Expected: FAIL — `Failed to resolve import "../rollup"`

- [ ] **Step 3: 구현**

`frontend/src/domain/rollup.ts`

```ts
export type DirectiveLike = { id: string; code: string; title: string }

export type TaskLike = {
  id: string
  directive_id: string | null
  start_date: string | null
  due_date: string | null
  progress: number
  status: string
}

export type DirectiveRollup = DirectiveLike & {
  startDate: string | null
  dueDate: string | null
  progress: number
  doneCount: number
  totalCount: number
}

function minOf(values: (string | null)[]): string | null {
  const present = values.filter((v): v is string => Boolean(v))
  return present.length ? present.reduce((a, b) => (a < b ? a : b)) : null
}

function maxOf(values: (string | null)[]): string | null {
  const present = values.filter((v): v is string => Boolean(v))
  return present.length ? present.reduce((a, b) => (a > b ? a : b)) : null
}

export function rollupByDirective(
  directives: readonly DirectiveLike[],
  tasks: readonly TaskLike[],
): DirectiveRollup[] {
  return directives.map((d) => {
    const own = tasks.filter((t) => t.directive_id === d.id)
    const total = own.length
    const sum = own.reduce((s, t) => s + t.progress, 0)
    return {
      ...d,
      startDate: minOf(own.map((t) => t.start_date)),
      dueDate: maxOf(own.map((t) => t.due_date)),
      progress: total ? Math.round(sum / total) : 0,
      doneCount: own.filter((t) => t.status === '완료').length,
      totalCount: total,
    }
  })
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && npm test`
Expected: PASS — 27개 테스트 통과.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(domain): 지시사항별 기간·진행률 집계"
```

---

## Task 9: 도메인 로직 — 인박스 승격 매핑 (TDD)

**Files:**
- Create: `frontend/src/domain/promote.ts`
- Test: `frontend/src/domain/__tests__/promote.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/domain/__tests__/promote.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { toTaskInsert } from '../promote'

const item = {
  id: 'i1',
  company_id: 'c1',
  user_id: 'u1',
  content: '품목구분 0/1 의미 — 권훈에게 확인',
  tag: '확인필요',
  origin: '직접' as const,
}

describe('toTaskInsert', () => {
  it('인박스 내용이 업무 제목이 된다', () => {
    const r = toTaskInsert(item, { priority: 'P0', due_date: '2026-08-20', area: '품목·가격' })
    expect(r.title).toBe('품목구분 0/1 의미 — 권훈에게 확인')
  })

  it('출처는 인박스로 고정된다', () => {
    const r = toTaskInsert(item, { priority: 'P1', due_date: null, area: null })
    expect(r.source).toBe('인박스')
  })

  it('user_id와 company_id를 그대로 옮긴다', () => {
    const r = toTaskInsert(item, { priority: 'P1', due_date: null, area: null })
    expect(r.user_id).toBe('u1')
    expect(r.company_id).toBe('c1')
  })

  it('선택한 값이 반영된다', () => {
    const r = toTaskInsert(item, { priority: 'P0', due_date: '2026-08-20', area: '재고' })
    expect(r.priority).toBe('P0')
    expect(r.due_date).toBe('2026-08-20')
    expect(r.area).toBe('재고')
  })

  it('상태는 할 일로 시작한다', () => {
    const r = toTaskInsert(item, { priority: 'P1', due_date: null, area: null })
    expect(r.status).toBe('할 일')
    expect(r.progress).toBe(0)
  })

  it('제목이 60자를 넘으면 자르고 전문은 detail에 남긴다', () => {
    const long = 'ㄱ'.repeat(80)
    const r = toTaskInsert({ ...item, content: long }, { priority: 'P1', due_date: null, area: null })
    expect(r.title).toHaveLength(60)
    expect(r.detail).toBe(long)
  })

  it('짧으면 detail은 비운다', () => {
    const r = toTaskInsert(item, { priority: 'P1', due_date: null, area: null })
    expect(r.detail).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npm test`
Expected: FAIL — `Failed to resolve import "../promote"`

- [ ] **Step 3: 구현**

`frontend/src/domain/promote.ts`

```ts
import type { Priority } from './types'

const TITLE_MAX = 60

export type InboxLike = {
  id: string
  user_id: string
  company_id: string
  content: string
  tag: string | null
  origin: string
}

export type PromoteChoice = {
  priority: Priority
  due_date: string | null
  area: string | null
}

export type TaskInsert = {
  user_id: string
  company_id: string
  title: string
  detail: string | null
  source: '인박스'
  status: '할 일'
  priority: Priority
  due_date: string | null
  area: string | null
  progress: 0
}

export function toTaskInsert(item: InboxLike, choice: PromoteChoice): TaskInsert {
  const long = item.content.length > TITLE_MAX
  return {
    user_id: item.user_id,
    company_id: item.company_id,
    title: long ? item.content.slice(0, TITLE_MAX) : item.content,
    detail: long ? item.content : null,
    source: '인박스',
    status: '할 일',
    priority: choice.priority,
    due_date: choice.due_date,
    area: choice.area,
    progress: 0,
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && npm test`
Expected: PASS — 34개 테스트 통과.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(domain): 인박스 → 업무 승격 매핑"
```

---

## Task 10: 인증 게이트

**Files:**
- Create: `frontend/src/features/auth/LoginPage.tsx`
- Create: `frontend/src/features/auth/AuthGate.tsx`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: 로그인 화면 작성**

`frontend/src/features/auth/LoginPage.tsx`

```tsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="min-h-screen bg-parchment flex items-center justify-center px-6">
      <div className="w-full max-w-[420px] bg-canvas rounded-lg border border-hairline p-8">
        <p className="text-caption font-semibold text-ink-mute">WORK MANAGEMENT</p>
        <h1 className="text-[28px] leading-[1.14] mt-2 mb-6">로그인</h1>

        {sent ? (
          <p className="text-body">
            <strong>{email}</strong> 으로 로그인 링크를 보냈습니다. 메일함을 확인하세요.
          </p>
        ) : (
          <form onSubmit={send}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일 주소"
              className="w-full rounded-sm border border-hairline px-3 py-3 text-body outline-none focus:border-action"
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-4 w-full bg-action text-white rounded-[9999px] px-[22px] py-[11px] text-body disabled:opacity-40"
            >
              {busy ? '보내는 중…' : '로그인 링크 받기'}
            </button>
            {error && <p className="mt-3 text-caption text-alert">{error}</p>}
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 인증 게이트 작성**

`frontend/src/features/auth/AuthGate.tsx`

```tsx
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { LoginPage } from './LoginPage'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (loading) {
    return <div className="min-h-screen bg-parchment" />
  }
  if (!session) return <LoginPage />
  return <>{children}</>
}
```

- [ ] **Step 3: main.tsx 배선**

`frontend/src/main.tsx` 전체 교체.

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthGate } from './features/auth/AuthGate'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthGate>
          <App />
        </AuthGate>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 4: 로그인 확인**

Run: `cd frontend && npm run dev`
Expected: 로그인 화면이 뜬다. 본인 이메일을 넣고 링크를 받아 로그인하면 Task 2의 디자인 토큰 화면으로 넘어간다.

**로그인 후 Supabase 대시보드 → Authentication → Users 에서 본인 계정의 UUID를 복사해 둔다. Task 15 시드에서 쓴다.**

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(auth): 매직링크 로그인과 인증 게이트"
```

---

## Task 11: 앱 셸 — 사이드바와 5탭

**Files:**
- Create: `frontend/src/components/Sidebar.tsx`
- Create: `frontend/src/pages/TodayPage.tsx`
- Create: `frontend/src/pages/WorkPage.tsx`
- Create: `frontend/src/pages/PlanPage.tsx`
- Create: `frontend/src/pages/RecordPage.tsx`
- Create: `frontend/src/pages/BasePage.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 자리표시 페이지 5개 작성**

`frontend/src/pages/TodayPage.tsx`

```tsx
export function TodayPage() {
  return (
    <div>
      <h1 className="text-[40px] leading-[1.1]">오늘</h1>
      <p className="text-body text-ink-mute mt-2">2단계에서 만듭니다.</p>
    </div>
  )
}
```

`frontend/src/pages/WorkPage.tsx`

```tsx
export function WorkPage() {
  return (
    <div>
      <h1 className="text-[40px] leading-[1.1]">업무</h1>
      <p className="text-body text-ink-mute mt-2">Task 13에서 채웁니다.</p>
    </div>
  )
}
```

`frontend/src/pages/PlanPage.tsx`

```tsx
export function PlanPage() {
  return (
    <div>
      <h1 className="text-[40px] leading-[1.1]">계획</h1>
      <p className="text-body text-ink-mute mt-2">3단계에서 만듭니다.</p>
    </div>
  )
}
```

`frontend/src/pages/RecordPage.tsx`

```tsx
export function RecordPage() {
  return (
    <div>
      <h1 className="text-[40px] leading-[1.1]">기록</h1>
      <p className="text-body text-ink-mute mt-2">2·4단계에서 만듭니다.</p>
    </div>
  )
}
```

`frontend/src/pages/BasePage.tsx`

```tsx
export function BasePage() {
  return (
    <div>
      <h1 className="text-[40px] leading-[1.1]">기준</h1>
      <p className="text-body text-ink-mute mt-2">Task 17에서 채웁니다.</p>
    </div>
  )
}
```

**5개 모두 named export다.** `App.tsx`가 `import { TodayPage } from './pages/TodayPage'` 형태로 가져온다.

- [ ] **Step 2: 사이드바 작성**

`frontend/src/components/Sidebar.tsx`

```tsx
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const MENU = [
  { to: '/', label: '오늘', icon: '📌', end: true },
  { to: '/work', label: '업무', icon: '📋' },
  { to: '/plan', label: '계획', icon: '🗓' },
  { to: '/record', label: '기록', icon: '✏️' },
  { to: '/base', label: '기준', icon: '📖' },
]

export function Sidebar({ children }: { children?: React.ReactNode }) {
  return (
    <aside className="w-[220px] shrink-0 bg-parchment border-r border-hairline min-h-screen px-4 py-6 flex flex-col">
      <p className="text-[10px] font-semibold tracking-[0.1em] text-ink-mute uppercase">
        Work Management
      </p>

      {children}

      <p className="text-[10px] font-semibold tracking-[0.1em] text-ink-mute uppercase mt-7 mb-2">
        메뉴
      </p>
      <nav className="flex flex-col gap-0.5">
        {MENU.map((m) => (
          <NavLink
            key={m.to}
            to={m.to}
            end={m.end}
            className={({ isActive }) =>
              [
                'rounded-sm px-3 py-2 text-body',
                isActive ? 'bg-canvas font-semibold' : 'text-ink-soft hover:bg-canvas/60',
              ].join(' ')
            }
          >
            <span className="mr-2">{m.icon}</span>
            {m.label}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={() => supabase.auth.signOut()}
        className="mt-auto text-caption text-ink-mute hover:text-ink text-left px-3"
      >
        로그아웃
      </button>
    </aside>
  )
}
```

- [ ] **Step 3: App.tsx 배선**

`frontend/src/App.tsx` 전체 교체.

```tsx
import { Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { TodayPage } from './pages/TodayPage'
import { WorkPage } from './pages/WorkPage'
import { PlanPage } from './pages/PlanPage'
import { RecordPage } from './pages/RecordPage'
import { BasePage } from './pages/BasePage'

export default function App() {
  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 px-10 py-8 max-w-[1200px]">
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/work" element={<WorkPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/record" element={<RecordPage />} />
          <Route path="/base" element={<BasePage />} />
        </Routes>
      </main>
    </div>
  )
}
```

- [ ] **Step 4: 탐색 확인**

Run: `cd frontend && npm run dev`
Expected: 좌측 사이드바에 5개 메뉴가 보이고, 클릭하면 각 페이지로 이동한다. 현재 메뉴는 흰 배경 + 굵게 표시된다.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat: 사이드바 5탭과 라우팅"
```

---

## Task 12: 업체 컨텍스트

**Files:**
- Create: `frontend/src/features/company/useCompany.ts`

설계서 §4.4 — 업체가 1개면 셀렉터를 숨긴다. 지금은 첫 업체를 자동 선택하기만 한다.

- [ ] **Step 1: 훅 작성**

`frontend/src/features/company/useCompany.ts`

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Tables } from '../../lib/supabase'

export type Company = Tables<'companies'>

export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: async (): Promise<Company[]> => {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('active', true)
        .order('sort_order')
      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * 현재 업체. 1단계에서는 첫 업체를 자동 선택한다.
 * 업체가 2개 이상이 되면 여기에 선택 상태를 넣고 사이드바에 셀렉터를 띄운다.
 */
export function useCurrentCompany() {
  const { data, ...rest } = useCompanies()
  return { ...rest, data: data?.[0] ?? null, count: data?.length ?? 0 }
}
```

- [ ] **Step 2: 타입 체크**

Run: `cd frontend && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 3: 커밋**

```bash
git add -A
git commit -m "feat: 업체 컨텍스트 훅"
```

---

## Task 13: 업무 API와 목록

**Files:**
- Create: `frontend/src/features/tasks/api.ts`
- Create: `frontend/src/features/tasks/hooks.ts`
- Create: `frontend/src/components/Badge.tsx`
- Create: `frontend/src/features/tasks/TaskList.tsx`
- Modify: `frontend/src/pages/WorkPage.tsx`

- [ ] **Step 1: API 작성**

`frontend/src/features/tasks/api.ts`

```ts
import { supabase } from '../../lib/supabase'
import type { Tables, Insert, Update } from '../../lib/supabase'

export type Task = Tables<'tasks'>

export async function listTasks(companyId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('company_id', companyId)
  if (error) throw error
  return data ?? []
}

export async function createTask(row: Insert<'tasks'>): Promise<Task> {
  const { data, error } = await supabase.from('tasks').insert(row).select().single()
  if (error) throw error
  return data
}

export async function updateTask(id: string, patch: Update<'tasks'>): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

/** 상태를 바꾸면 진행률과 완료시각도 함께 맞춘다. */
export const PROGRESS_BY_STATUS: Record<string, number> = {
  '할 일': 0, '진행중': 40, '검토요청': 80, '완료': 100, '보류': 0,
}

export function statusPatch(status: string): Update<'tasks'> {
  return {
    status,
    progress: PROGRESS_BY_STATUS[status] ?? 0,
    completed_at: status === '완료' ? new Date().toISOString() : null,
  }
}
```

- [ ] **Step 2: 훅 작성**

`frontend/src/features/tasks/hooks.ts`

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createTask, deleteTask, listTasks, updateTask, statusPatch } from './api'
import type { Task } from './api'
import type { Insert, Update } from '../../lib/supabase'

export function useTasks(companyId: string | undefined) {
  return useQuery({
    queryKey: ['tasks', companyId],
    queryFn: () => listTasks(companyId!),
    enabled: Boolean(companyId),
  })
}

export function useCreateTask(companyId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (row: Insert<'tasks'>) => createTask(row),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', companyId] }),
  })
}

export function useUpdateTask(companyId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Update<'tasks'> }) =>
      updateTask(id, patch),
    // 낙관적 업데이트 — 클릭이 즉시 반영된다
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ['tasks', companyId] })
      const prev = qc.getQueryData<Task[]>(['tasks', companyId])
      qc.setQueryData<Task[]>(['tasks', companyId], (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, ...patch } as Task : t)),
      )
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['tasks', companyId], ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks', companyId] }),
  })
}

export function useMoveTask(companyId: string | undefined) {
  const update = useUpdateTask(companyId)
  return (id: string, status: string) => update.mutate({ id, patch: statusPatch(status) })
}

export function useDeleteTask(companyId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', companyId] }),
  })
}
```

- [ ] **Step 3: 배지 컴포넌트**

`frontend/src/components/Badge.tsx`

```tsx
type Tone = 'action' | 'ink' | 'mute' | 'alert'

const TONE: Record<Tone, string> = {
  action: 'bg-action/10 text-action',
  ink: 'bg-ink/10 text-ink',
  mute: 'bg-ink-mute/15 text-ink-mute',
  alert: 'bg-alert/10 text-alert',
}

export function Badge({ children, tone = 'mute' }: { children: React.ReactNode; tone?: Tone }) {
  return (
    <span className={`inline-block rounded-[9999px] px-2 py-0.5 text-[12px] font-semibold ${TONE[tone]}`}>
      {children}
    </span>
  )
}

/** P0만 경고색. 나머지는 무채색 — 액센트는 파랑 하나라는 원칙을 지킨다. */
export const priorityTone = (p: string): Tone => (p === 'P0' ? 'alert' : p === 'P1' ? 'action' : 'mute')
```

- [ ] **Step 4: 목록 컴포넌트**

`frontend/src/features/tasks/TaskList.tsx`

```tsx
import { sortTasks } from '../../domain/sort'
import { daysUntil, ddayLabel, scheduleOf } from '../../domain/dday'
import { Badge, priorityTone } from '../../components/Badge'
import type { Task } from './api'

export function TaskList({ tasks }: { tasks: Task[] }) {
  const today = new Date()
  const rows = sortTasks(tasks, today)

  if (!rows.length) {
    return <p className="text-body text-ink-mute">등록된 업무가 없습니다.</p>
  }

  return (
    <div className="border border-hairline rounded-lg overflow-hidden">
      {rows.map((t) => {
        const d = daysUntil(t.due_date, today)
        const sch = scheduleOf(t, today)
        return (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3 border-b border-divider last:border-0">
            <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
            <span className={`flex-1 text-body ${t.status === '완료' ? 'text-ink-mute line-through' : ''}`}>
              {t.title}
            </span>
            {t.area && <span className="text-caption text-ink-mute">{t.area}</span>}
            <span className={`text-caption w-[86px] text-right ${sch === '지연' ? 'text-alert' : 'text-ink-mute'}`}>
              {ddayLabel(d)}
            </span>
            <span className="text-caption text-ink-mute w-[64px] text-right">{t.status}</span>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: 업무 페이지에 연결**

`frontend/src/pages/WorkPage.tsx` 전체 교체.

```tsx
import { useCurrentCompany } from '../features/company/useCompany'
import { useTasks } from '../features/tasks/hooks'
import { TaskList } from '../features/tasks/TaskList'

export function WorkPage() {
  const { data: company } = useCurrentCompany()
  const { data: tasks, isLoading, error } = useTasks(company?.id)

  return (
    <div>
      <h1 className="text-[40px] leading-[1.1] mb-6">업무</h1>
      {isLoading && <p className="text-body text-ink-mute">불러오는 중…</p>}
      {error && <p className="text-body text-alert">{(error as Error).message}</p>}
      {tasks && <TaskList tasks={tasks} />}
    </div>
  )
}
```

- [ ] **Step 6: 확인**

Run: `cd frontend && npm run dev` → `/work`
Expected: "등록된 업무가 없습니다." — 아직 데이터가 없으므로 정상이다. 콘솔에 오류가 없어야 한다.

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "feat(tasks): 업무 조회 API와 목록 화면"
```

---

## Task 14: 업무 등록 폼

**Files:**
- Create: `frontend/src/components/Field.tsx`
- Create: `frontend/src/features/tasks/TaskForm.tsx`
- Modify: `frontend/src/pages/WorkPage.tsx`

- [ ] **Step 1: 입력 필드 컴포넌트**

`frontend/src/components/Field.tsx`

```tsx
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-caption font-semibold text-ink-mute mb-1">{label}</span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full rounded-sm border border-hairline px-3 py-2 text-body outline-none focus:border-action bg-canvas'
```

- [ ] **Step 2: 등록 폼 작성**

`frontend/src/features/tasks/TaskForm.tsx`

```tsx
import { useState } from 'react'
import { Field, inputClass } from '../../components/Field'
import { AREAS, PRIORITIES, TASK_SOURCES } from '../../domain/types'
import { useCreateTask } from './hooks'

export function TaskForm({ companyId, userId }: { companyId: string; userId: string }) {
  const create = useCreateTask(companyId)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('P1')
  const [area, setArea] = useState<string>(AREAS[0])
  const [source, setSource] = useState<string>('내 발의')
  const [dueDate, setDueDate] = useState('')
  const [requester, setRequester] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    create.mutate(
      {
        user_id: userId,
        company_id: companyId,
        title: title.trim(),
        priority,
        area,
        source,
        due_date: dueDate || null,
        requester: source === '요청받음' ? requester || null : null,
      },
      {
        onSuccess: () => {
          setTitle('')
          setDueDate('')
          setRequester('')
        },
      },
    )
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-action text-white rounded-[9999px] px-[22px] py-[11px] text-body"
      >
        ＋ 새 업무
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="border border-hairline rounded-lg p-5 bg-canvas">
      <Field label="업무명">
        <input
          autoFocus
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 이카운트 품목 전수 추출"
        />
      </Field>

      <div className="grid grid-cols-4 gap-3 mt-4">
        <Field label="중요도">
          <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="업무영역">
          <select className={inputClass} value={area} onChange={(e) => setArea(e.target.value)}>
            {AREAS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="출처">
          <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value)}>
            {TASK_SOURCES.filter((s) => s === '내 발의' || s === '요청받음').map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="기한">
          <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>

      {source === '요청받음' && (
        <div className="mt-4">
          <Field label="요청자">
            <input
              className={inputClass}
              value={requester}
              onChange={(e) => setRequester(e.target.value)}
              placeholder="예: 권훈 (구매사업본부)"
            />
          </Field>
        </div>
      )}

      <div className="flex gap-2 mt-5">
        <button
          type="submit"
          disabled={create.isPending}
          className="bg-action text-white rounded-[9999px] px-[22px] py-[11px] text-body disabled:opacity-40"
        >
          {create.isPending ? '등록 중…' : '등록'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-[9999px] px-[22px] py-[11px] text-body text-action border border-action"
        >
          닫기
        </button>
      </div>
      {create.error && <p className="mt-3 text-caption text-alert">{(create.error as Error).message}</p>}
    </form>
  )
}
```

- [ ] **Step 3: 사용자 ID 훅**

`frontend/src/features/auth/useUserId.ts` 생성.

```ts
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export function useUserId(): string | null {
  const [id, setId] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setId(data.user?.id ?? null))
  }, [])
  return id
}
```

- [ ] **Step 4: 업무 페이지에 폼 연결**

`frontend/src/pages/WorkPage.tsx` 전체 교체.

```tsx
import { useCurrentCompany } from '../features/company/useCompany'
import { useUserId } from '../features/auth/useUserId'
import { useTasks } from '../features/tasks/hooks'
import { TaskList } from '../features/tasks/TaskList'
import { TaskForm } from '../features/tasks/TaskForm'

export function WorkPage() {
  const { data: company } = useCurrentCompany()
  const userId = useUserId()
  const { data: tasks, isLoading, error } = useTasks(company?.id)

  return (
    <div>
      <h1 className="text-[40px] leading-[1.1] mb-6">업무</h1>

      {company && userId && (
        <div className="mb-6">
          <TaskForm companyId={company.id} userId={userId} />
        </div>
      )}

      {isLoading && <p className="text-body text-ink-mute">불러오는 중…</p>}
      {error && <p className="text-body text-alert">{(error as Error).message}</p>}
      {tasks && <TaskList tasks={tasks} />}
    </div>
  )
}
```

- [ ] **Step 5: 확인**

시드가 아직 없어 업체가 없다. **Task 15를 먼저 실행한 뒤 돌아와 확인해도 된다.** 순서대로 간다면 지금은 폼이 안 보이는 게 정상이다.

Run: `cd frontend && npx tsc --noEmit`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat(tasks): 업무 등록 폼"
```

---

## Task 15: 시드 데이터

**Files:**
- Create: `supabase/migrations/20260809000003_stage1_seed.sql`

설계서 §10 — 제우스 업체 하나와 사업이해자료 §9 기반 지시사항 7건, 업무 12건.

- [ ] **Step 1: 시드 파일 작성**

`supabase/migrations/20260809000003_stage1_seed.sql`

**`<USER_ID>`를 Task 10 Step 4에서 복사한 본인 UUID로 바꾼다.**

```sql
-- 1단계 시드: 제우스 + 사업이해자료 §9 기반 지시사항·업무
-- 금액은 확정 회계수치가 아니라 원장·실사로 대사해야 할 참고값이다 (§0 데이터 규율)

do $$
declare
  uid  uuid := '<USER_ID>';
  cid  uuid;
  d01  uuid; d02 uuid; d03 uuid; d05 uuid; d06 uuid; d07 uuid; d11 uuid;
begin

insert into companies (user_id, name, color, sort_order)
values (uid, '제우스', '#0066cc', 0)
returning id into cid;

insert into directives (user_id, company_id, code, title, axis, area, source, summary, rationale, deadline_text, due_date, priority)
values
 (uid, cid, 'D-01', '품목구분(상품/제품/원재료) 정의 확정', '축1 농자재·데이터', '품목·가격', '사업이해자료 §9-1',
  '완제품(1)과 마더롤(0)의 품목구분 값이 다르다. 타이벡은 「상품 매입 → 상품 매출」이 원칙.',
  '구분이 섞이면 매출원가가 통째로 흔들린다. 2번(판매가)보다 먼저 해야 한다.', '2주', '2026-08-24', 'P0')
 returning id into d01;

insert into directives (user_id, company_id, code, title, axis, area, source, summary, rationale, deadline_text, due_date, priority)
values (uid, cid, 'D-02', '판매가(OUT_PRICE) 등록', '축1 농자재·데이터', '품목·가격', '사업이해자료 §9-2',
  '표본 2품목(E00166, E00663) 모두 판매가가 0으로 등록되어 있다.',
  '시스템이 마진을 계산하지 못한다.', '1개월', '2026-09-09', 'P0')
 returning id into d02;

insert into directives (user_id, company_id, code, title, axis, area, source, summary, rationale, deadline_text, due_date, priority)
values (uid, cid, 'D-03', '단위 환산 기준 수립 (㎡ ↔ ea ↔ 롤)', '축1 농자재·데이터', '원가·단위', '사업이해자료 §9-3',
  '㎡ 803원과 ea 516,000원은 그대로 비교할 수 없다.',
  '같은 자를 써야 원가 비교가 된다.', '2주', '2026-08-24', 'P0')
 returning id into d03;

insert into directives (user_id, company_id, code, title, axis, area, source, summary, rationale, deadline_text, due_date, priority)
values (uid, cid, 'D-05', '재고 장부 ↔ 실물 대조', '축1 농자재·데이터', '재고', '사업이해자료 §9-5',
  '농자재 재고 약 30.8억(타이벡 계열 22.7억)의 장부·실물 대조가 되어 있지 않다. 참고값이며 대사 대상이다.',
  '재고는 곧 현금이다.', '1~2개월', '2026-09-24', 'P0')
 returning id into d05;

insert into directives (user_id, company_id, code, title, axis, area, source, summary, rationale, deadline_text, due_date, priority)
values (uid, cid, 'D-06', '불용 재고 처분 계획 수립', '축1 농자재·데이터', '재고', '사업이해자료 §9-6',
  '불용재고 약 5.15억(마스크 1.54억 · 통들이 1.08억 · 기계류 0.4억 등). 참고값이다.',
  '팔리지 않는 재고가 창고와 장부를 차지한다.', '2개월', '2026-10-09', 'P0')
 returning id into d06;

insert into directives (user_id, company_id, code, title, axis, area, source, summary, rationale, deadline_text, due_date, priority)
values (uid, cid, 'D-07', '축별 손익 분리안 설계', '전사', '축별손익', '사업이해자료 §9-7 · §13 3주차',
  '현재 3대 사업축의 손익이 섞여 있다.',
  '어느 축이 버는지 모르면 결정을 할 수 없다.', '1개월', '2026-09-09', 'P0')
 returning id into d07;

insert into directives (user_id, company_id, code, title, axis, area, source, summary, rationale, deadline_text, due_date, priority)
values (uid, cid, 'D-11', '일일 현금표 양식 확정 후 가동', '전사', '자금·현금', '사업이해자료 §13 4주차',
  '계좌별 전일잔액·입금·출금·당일잔액·사용가능액 양식 1종 확정 후 운영 개시.',
  '축별 손익과 현금표가 회사의 결정 기준이 된다.', '4주차', '2026-09-04', 'P0')
 returning id into d11;

insert into tasks (user_id, company_id, directive_id, title, area, priority, status, source, start_date, due_date, progress) values
 (uid, cid, d01, '이카운트 품목 전수 추출 (품목구분·단위·분류)', '품목·가격', 'P0', '진행중', '내 발의', '2026-08-17', '2026-08-21', 40),
 (uid, cid, d01, '품목구분 코드 의미 확인 (0/1이 각각 무엇인가)', '품목·가격', 'P0', '할 일',  '요청받음', '2026-08-17', '2026-08-22', 0),
 (uid, cid, d01, '타이벡 계열 상품 매입/매출 원칙 문서화', '품목·가격', 'P0', '할 일', '내 발의', '2026-08-22', '2026-08-24', 0),
 (uid, cid, d02, '판매가 0 품목 전수 목록화', '품목·가격', 'P0', '할 일', '내 발의', '2026-08-24', '2026-08-30', 0),
 (uid, cid, d02, '채널별 기준 판매가·마진 기준선 수립', '품목·가격', 'P0', '할 일', '내 발의', '2026-08-30', '2026-09-09', 0),
 (uid, cid, d03, '㎡ ↔ ea ↔ 롤 환산표 작성', '원가·단위', 'P0', '진행중', '내 발의', '2026-08-17', '2026-08-24', 30),
 (uid, cid, d03, '환산원가 계산식 확정', '원가·단위', 'P1', '할 일', '내 발의', '2026-08-24', '2026-08-30', 0),
 (uid, cid, d05, '창고·품목별 장부수량 출력', '재고', 'P0', '할 일', '내 발의', '2026-08-31', '2026-09-07', 0),
 (uid, cid, d06, '불용재고 품목별 취득시기·상태 확인', '재고', 'P0', '할 일', '요청받음', '2026-09-07', '2026-09-24', 0),
 (uid, cid, d07, '계정별 사업축 귀속 기준 초안', '축별손익', 'P0', '할 일', '내 발의', '2026-08-24', '2026-08-27', 0),
 (uid, cid, d07, '축별 손익 분리안 대표 보고', '축별손익', 'P0', '할 일', '내 발의', '2026-09-07', '2026-09-09', 0),
 (uid, cid, d11, '일일 현금표 양식 확정', '자금·현금', 'P0', '할 일', '내 발의', '2026-08-31', '2026-09-03', 0);

insert into tasks (user_id, company_id, title, area, priority, status, source, requester, requester_dept, start_date, due_date, progress) values
 (uid, cid, '현장별 손익 양식 원본 및 작성 사례 제공', '현장손익', 'P0', '할 일', '요청받음', '진경모', '영업본부', '2026-08-11', '2026-08-21', 0),
 (uid, cid, '회생 제출자료 목록·기한표 정리', '회생지원', 'P0', '진행중', '요청받음', '변태보', '경영관리', '2026-08-10', '2026-08-24', 40);

insert into inbox (user_id, company_id, content, tag) values
 (uid, cid, '품목구분 0/1 의미 — 권훈에게 확인', '확인필요'),
 (uid, cid, '자금일보에 이해 안 되는 항목 4건', '질문');

end $$;
```

- [ ] **Step 2: 적용**

```bash
cd Work_Management
npx supabase db push
```

Expected: 성공. 대시보드 Table Editor에서 `companies` 1행, `directives` 7행, `tasks` 14행, `inbox` 2행이 보인다.

- [ ] **Step 3: 화면 확인**

Run: `cd frontend && npm run dev` → `/work`
Expected: 업무 14건이 목록에 보인다. 지연된 것이 위에, P0가 P2보다 위에 온다. "＋ 새 업무" 버튼이 보인다. 새 업무를 하나 등록해 목록에 추가되는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
cd Work_Management
git add supabase/
git commit -m "feat(db): 제우스 시드 — 지시사항 7건, 업무 14건, 인박스 2건"
```

---

## Task 16: 칸반 보드

**Files:**
- Create: `frontend/src/features/tasks/TaskCard.tsx`
- Create: `frontend/src/features/tasks/TaskBoard.tsx`
- Modify: `frontend/src/pages/WorkPage.tsx`

- [ ] **Step 1: 카드 컴포넌트**

`frontend/src/features/tasks/TaskCard.tsx`

```tsx
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { daysUntil, ddayLabel, scheduleOf } from '../../domain/dday'
import { Badge, priorityTone } from '../../components/Badge'
import type { Task } from './api'

export function TaskCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })
  const today = new Date()
  const d = daysUntil(task.due_date, today)
  const sch = scheduleOf(task, today)

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`bg-canvas border border-hairline rounded-lg p-3 cursor-grab active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
        {sch === '지연' && <Badge tone="alert">{ddayLabel(d)}</Badge>}
      </div>
      <p className="text-body leading-snug">{task.title}</p>
      <p className="text-caption text-ink-mute mt-2">
        {task.area ?? '미분류'}
        {task.due_date && ` · ${task.due_date}`}
      </p>
      {task.requester && (
        <p className="text-caption text-ink-mute mt-1">요청 {task.requester}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 보드 컴포넌트**

`frontend/src/features/tasks/TaskBoard.tsx`

```tsx
import { DndContext, closestCorners, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { BOARD_STATUSES } from '../../domain/types'
import { sortTasks } from '../../domain/sort'
import { TaskCard } from './TaskCard'
import { useMoveTask } from './hooks'
import type { Task } from './api'

function Column({ status, tasks }: { status: string; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-tagline font-semibold">{status}</h3>
        <span className="text-caption text-ink-mute">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`rounded-lg p-2 min-h-[120px] flex flex-col gap-2 ${
          isOver ? 'bg-action/5' : 'bg-parchment'
        }`}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((t) => <TaskCard key={t.id} task={t} />)}
        </SortableContext>
      </div>
    </div>
  )
}

export function TaskBoard({ tasks, companyId }: { tasks: Task[]; companyId: string }) {
  const move = useMoveTask(companyId)
  const today = new Date()

  function onDragEnd(e: DragEndEvent) {
    const taskId = String(e.active.id)
    const target = e.over ? String(e.over.id) : null
    if (!target) return
    // 열 위에 놓으면 그 열이, 카드 위에 놓으면 그 카드의 열이 목적지다
    const dropped = BOARD_STATUSES.find((s) => s === target)
      ?? tasks.find((t) => t.id === target)?.status
    if (!dropped) return
    const current = tasks.find((t) => t.id === taskId)?.status
    if (current === dropped) return
    move(taskId, dropped)
  }

  return (
    <DndContext collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <div className="flex gap-4">
        {BOARD_STATUSES.map((s) => (
          <Column key={s} status={s} tasks={sortTasks(tasks.filter((t) => t.status === s), today)} />
        ))}
      </div>
    </DndContext>
  )
}
```

- [ ] **Step 3: 보기 전환 붙이기**

`frontend/src/pages/WorkPage.tsx` 전체 교체.

```tsx
import { useState } from 'react'
import { useCurrentCompany } from '../features/company/useCompany'
import { useUserId } from '../features/auth/useUserId'
import { useTasks } from '../features/tasks/hooks'
import { TaskList } from '../features/tasks/TaskList'
import { TaskBoard } from '../features/tasks/TaskBoard'
import { TaskForm } from '../features/tasks/TaskForm'

export function WorkPage() {
  const { data: company } = useCurrentCompany()
  const userId = useUserId()
  const { data: tasks, isLoading, error } = useTasks(company?.id)
  const [view, setView] = useState<'board' | 'list'>('board')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[40px] leading-[1.1]">업무</h1>
        <div className="flex gap-1 bg-parchment rounded-[9999px] p-1">
          {(['board', 'list'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-[9999px] px-4 py-1.5 text-caption ${
                view === v ? 'bg-canvas font-semibold' : 'text-ink-mute'
              }`}
            >
              {v === 'board' ? '칸반' : '목록'}
            </button>
          ))}
        </div>
      </div>

      {company && userId && (
        <div className="mb-6">
          <TaskForm companyId={company.id} userId={userId} />
        </div>
      )}

      {isLoading && <p className="text-body text-ink-mute">불러오는 중…</p>}
      {error && <p className="text-body text-alert">{(error as Error).message}</p>}
      {tasks && company && (
        view === 'board'
          ? <TaskBoard tasks={tasks} companyId={company.id} />
          : <TaskList tasks={tasks} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: 드래그 확인**

Run: `cd frontend && npm run dev` → `/work`
Expected: 4열 칸반이 보인다. 카드를 「진행중」으로 끌어다 놓으면 **즉시** 이동하고(낙관적 업데이트), 새로고침해도 유지된다. 「칸반 / 목록」 전환이 동작한다.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(tasks): 드래그앤드롭 칸반 보드"
```

---

## Task 17: 지시사항 목록

**Files:**
- Create: `frontend/src/features/directives/api.ts`
- Create: `frontend/src/features/directives/hooks.ts`
- Create: `frontend/src/features/directives/DirectiveList.tsx`
- Modify: `frontend/src/pages/BasePage.tsx`

- [ ] **Step 1: API와 훅**

`frontend/src/features/directives/api.ts`

```ts
import { supabase } from '../../lib/supabase'
import type { Tables } from '../../lib/supabase'

export type Directive = Tables<'directives'>

export async function listDirectives(companyId: string): Promise<Directive[]> {
  const { data, error } = await supabase
    .from('directives')
    .select('*')
    .eq('company_id', companyId)
    .order('code')
  if (error) throw error
  return data ?? []
}
```

`frontend/src/features/directives/hooks.ts`

```ts
import { useQuery } from '@tanstack/react-query'
import { listDirectives } from './api'

export function useDirectives(companyId: string | undefined) {
  return useQuery({
    queryKey: ['directives', companyId],
    queryFn: () => listDirectives(companyId!),
    enabled: Boolean(companyId),
  })
}
```

- [ ] **Step 2: 목록 컴포넌트**

`frontend/src/features/directives/DirectiveList.tsx`

```tsx
import { rollupByDirective } from '../../domain/rollup'
import { daysUntil, ddayLabel } from '../../domain/dday'
import { Badge, priorityTone } from '../../components/Badge'
import type { Directive } from './api'
import type { Task } from '../tasks/api'

export function DirectiveList({ directives, tasks }: { directives: Directive[]; tasks: Task[] }) {
  const today = new Date()
  const rows = rollupByDirective(directives, tasks)

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => {
        const src = directives.find((d) => d.id === r.id)!
        const d = daysUntil(r.dueDate, today)
        return (
          <div key={r.id} className="border border-hairline rounded-lg p-5">
            <div className="flex items-center gap-2 mb-2">
              <Badge tone="ink">{r.code}</Badge>
              <Badge tone={priorityTone(src.priority)}>{src.priority}</Badge>
              <span className="text-caption text-ink-mute ml-auto">{src.source}</span>
            </div>

            <h3 className="text-tagline font-semibold">{r.title}</h3>
            {src.summary && <p className="text-body text-ink-soft mt-2">{src.summary}</p>}
            {src.rationale && (
              <p className="text-caption text-ink-mute mt-2">왜 먼저인가 — {src.rationale}</p>
            )}

            <div className="flex items-center gap-3 mt-4">
              <div className="flex-1 h-1.5 bg-divider rounded-[9999px] overflow-hidden">
                <div className="h-full bg-action rounded-[9999px]" style={{ width: `${r.progress}%` }} />
              </div>
              <span className="text-caption text-ink-mute w-[130px] text-right">
                {r.doneCount}/{r.totalCount}건 · {ddayLabel(d)}
              </span>
            </div>

            {r.startDate && (
              <p className="text-caption text-ink-mute mt-2">
                {r.startDate} → {r.dueDate}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: 기준 페이지에 연결**

`frontend/src/pages/BasePage.tsx` 전체 교체.

```tsx
import { useCurrentCompany } from '../features/company/useCompany'
import { useDirectives } from '../features/directives/hooks'
import { useTasks } from '../features/tasks/hooks'
import { DirectiveList } from '../features/directives/DirectiveList'

export function BasePage() {
  const { data: company } = useCurrentCompany()
  const { data: directives } = useDirectives(company?.id)
  const { data: tasks } = useTasks(company?.id)

  return (
    <div>
      <h1 className="text-[40px] leading-[1.1] mb-2">기준</h1>
      <p className="text-body text-ink-mute mb-6">
        지시사항 — 인수인계·연락처·설정은 3단계에서 붙습니다.
      </p>
      {directives && tasks && <DirectiveList directives={directives} tasks={tasks} />}
    </div>
  )
}
```

- [ ] **Step 4: 확인**

Run: `cd frontend && npm run dev` → `/base`
Expected: 지시사항 7건이 보인다. D-01은 진행률이 약 13%(3건 중 40%+0%+0% 평균), D-03은 15%로 표시된다. 기간이 `2026-08-17 → 2026-08-24` 형태로 나온다.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "feat(directives): 지시사항 목록과 진행률 집계"
```

---

## Task 18: 인박스

**Files:**
- Create: `frontend/src/features/inbox/api.ts`
- Create: `frontend/src/features/inbox/hooks.ts`
- Create: `frontend/src/features/inbox/InboxCapture.tsx`
- Create: `frontend/src/features/inbox/PromoteDialog.tsx`
- Create: `frontend/src/features/inbox/InboxList.tsx`
- Modify: `frontend/src/pages/WorkPage.tsx`

- [ ] **Step 1: API**

`frontend/src/features/inbox/api.ts`

```ts
import { supabase } from '../../lib/supabase'
import type { Tables, Insert } from '../../lib/supabase'
import { toTaskInsert, type PromoteChoice } from '../../domain/promote'

export type InboxItem = Tables<'inbox'>

export async function listInbox(companyId: string): Promise<InboxItem[]> {
  const { data, error } = await supabase
    .from('inbox')
    .select('*')
    .eq('company_id', companyId)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function addInbox(row: Insert<'inbox'>): Promise<InboxItem> {
  const { data, error } = await supabase.from('inbox').insert(row).select().single()
  if (error) throw error
  return data
}

export async function discardInbox(id: string): Promise<void> {
  const { error } = await supabase
    .from('inbox')
    .update({ resolved_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** 업무를 만들고 인박스 항목을 닫는다. 업무 생성이 실패하면 인박스는 그대로 둔다. */
export async function promoteInbox(item: InboxItem, choice: PromoteChoice): Promise<string> {
  const insert = toTaskInsert(item, choice)
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert(insert)
    .select('id')
    .single()
  if (taskError) throw taskError

  const { error: inboxError } = await supabase
    .from('inbox')
    .update({ promoted_task_id: task.id, resolved_at: new Date().toISOString() })
    .eq('id', item.id)
  if (inboxError) throw inboxError

  return task.id
}
```

- [ ] **Step 2: 훅**

`frontend/src/features/inbox/hooks.ts`

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addInbox, discardInbox, listInbox, promoteInbox } from './api'
import type { InboxItem } from './api'
import type { PromoteChoice } from '../../domain/promote'
import type { Insert } from '../../lib/supabase'

export function useInbox(companyId: string | undefined) {
  return useQuery({
    queryKey: ['inbox', companyId],
    queryFn: () => listInbox(companyId!),
    enabled: Boolean(companyId),
  })
}

export function useAddInbox(companyId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (row: Insert<'inbox'>) => addInbox(row),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox', companyId] }),
  })
}

export function useDiscardInbox(companyId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => discardInbox(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox', companyId] }),
  })
}

export function usePromoteInbox(companyId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ item, choice }: { item: InboxItem; choice: PromoteChoice }) =>
      promoteInbox(item, choice),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inbox', companyId] })
      qc.invalidateQueries({ queryKey: ['tasks', companyId] })
    },
  })
}
```

- [ ] **Step 3: 캡처 입력**

`frontend/src/features/inbox/InboxCapture.tsx`

```tsx
import { useState } from 'react'
import { inputClass } from '../../components/Field'
import { useAddInbox } from './hooks'

export function InboxCapture({ companyId, userId }: { companyId: string; userId: string }) {
  const add = useAddInbox(companyId)
  const [content, setContent] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const text = content.trim()
    if (!text) return
    add.mutate(
      { user_id: userId, company_id: companyId, content: text, origin: '직접' },
      { onSuccess: () => setContent('') },
    )
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        className={inputClass}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="떠오른 것을 던져두세요. 분류는 나중에."
      />
      <button
        type="submit"
        disabled={add.isPending}
        className="shrink-0 bg-action text-white rounded-[9999px] px-[22px] text-body disabled:opacity-40"
      >
        담기
      </button>
    </form>
  )
}
```

- [ ] **Step 4: 승격 대화상자**

`frontend/src/features/inbox/PromoteDialog.tsx`

```tsx
import { useState } from 'react'
import { Field, inputClass } from '../../components/Field'
import { AREAS, PRIORITIES } from '../../domain/types'
import { usePromoteInbox } from './hooks'
import type { InboxItem } from './api'

export function PromoteDialog({
  item, companyId, onClose,
}: { item: InboxItem; companyId: string; onClose: () => void }) {
  const promote = usePromoteInbox(companyId)
  const [priority, setPriority] = useState('P1')
  const [area, setArea] = useState<string>(AREAS[0])
  const [dueDate, setDueDate] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    promote.mutate(
      {
        item,
        choice: {
          priority: priority as 'P0' | 'P1' | 'P2',
          due_date: dueDate || null,
          area,
        },
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="fixed inset-0 bg-ink/30 flex items-center justify-center px-6 z-50" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="bg-canvas rounded-lg p-6 w-full max-w-[520px]"
      >
        <p className="text-caption font-semibold text-ink-mute mb-1">업무로 승격</p>
        <p className="text-body mb-5">{item.content}</p>

        <div className="grid grid-cols-3 gap-3">
          <Field label="중요도">
            <select className={inputClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="업무영역">
            <select className={inputClass} value={area} onChange={(e) => setArea(e.target.value)}>
              {AREAS.map((a) => <option key={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="기한">
            <input type="date" className={inputClass} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>

        <div className="flex gap-2 mt-6">
          <button
            type="submit"
            disabled={promote.isPending}
            className="bg-action text-white rounded-[9999px] px-[22px] py-[11px] text-body disabled:opacity-40"
          >
            {promote.isPending ? '만드는 중…' : '업무 만들기'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[9999px] px-[22px] py-[11px] text-body text-action border border-action"
          >
            취소
          </button>
        </div>
        {promote.error && (
          <p className="mt-3 text-caption text-alert">{(promote.error as Error).message}</p>
        )}
      </form>
    </div>
  )
}
```

- [ ] **Step 5: 인박스 목록**

`frontend/src/features/inbox/InboxList.tsx`

```tsx
import { useState } from 'react'
import { Badge } from '../../components/Badge'
import { useDiscardInbox, useInbox } from './hooks'
import { PromoteDialog } from './PromoteDialog'
import { InboxCapture } from './InboxCapture'
import type { InboxItem } from './api'

export function InboxList({ companyId, userId }: { companyId: string; userId: string }) {
  const { data: items } = useInbox(companyId)
  const discard = useDiscardInbox(companyId)
  const [target, setTarget] = useState<InboxItem | null>(null)

  return (
    <section>
      <div className="flex items-baseline gap-2 mb-1">
        <h2 className="text-tagline font-semibold">인박스</h2>
        <span className="text-caption text-ink-mute">{items?.length ?? 0}</span>
      </div>
      <p className="text-caption text-ink-mute italic mb-3">
        떠오른 것을 일단 던져두는 곳. 분류는 나중에.
      </p>

      <InboxCapture companyId={companyId} userId={userId} />

      <div className="mt-3 border border-hairline rounded-lg overflow-hidden">
        {!items?.length && (
          <p className="px-4 py-3 text-body text-ink-mute">비어 있습니다.</p>
        )}
        {items?.map((it) => (
          <div key={it.id} className="flex items-center gap-3 px-4 py-3 border-b border-divider last:border-0">
            <span className="flex-1 text-body">{it.content}</span>
            {it.tag && <Badge>{it.tag}</Badge>}
            <span className="text-caption text-ink-mute">{it.created_at.slice(5, 10)}</span>
            <button onClick={() => setTarget(it)} className="text-caption text-action">업무로</button>
            <button
              onClick={() => discard.mutate(it.id)}
              className="text-caption text-ink-mute hover:text-alert"
            >
              버림
            </button>
          </div>
        ))}
      </div>

      {target && (
        <PromoteDialog item={target} companyId={companyId} onClose={() => setTarget(null)} />
      )}
    </section>
  )
}
```

- [ ] **Step 6: 업무 페이지 하단에 붙이기**

`frontend/src/pages/WorkPage.tsx` 전체 교체.

```tsx
import { useState } from 'react'
import { useCurrentCompany } from '../features/company/useCompany'
import { useUserId } from '../features/auth/useUserId'
import { useTasks } from '../features/tasks/hooks'
import { TaskList } from '../features/tasks/TaskList'
import { TaskBoard } from '../features/tasks/TaskBoard'
import { TaskForm } from '../features/tasks/TaskForm'
import { InboxList } from '../features/inbox/InboxList'

export function WorkPage() {
  const { data: company } = useCurrentCompany()
  const userId = useUserId()
  const { data: tasks, isLoading, error } = useTasks(company?.id)
  const [view, setView] = useState<'board' | 'list'>('board')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[40px] leading-[1.1]">업무</h1>
        <div className="flex gap-1 bg-parchment rounded-[9999px] p-1">
          {(['board', 'list'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-[9999px] px-4 py-1.5 text-caption ${
                view === v ? 'bg-canvas font-semibold' : 'text-ink-mute'
              }`}
            >
              {v === 'board' ? '칸반' : '목록'}
            </button>
          ))}
        </div>
      </div>

      {company && userId && (
        <div className="mb-6">
          <TaskForm companyId={company.id} userId={userId} />
        </div>
      )}

      {isLoading && <p className="text-body text-ink-mute">불러오는 중…</p>}
      {error && <p className="text-body text-alert">{(error as Error).message}</p>}
      {tasks && company && (
        view === 'board'
          ? <TaskBoard tasks={tasks} companyId={company.id} />
          : <TaskList tasks={tasks} />
      )}

      {company && userId && (
        <div className="mt-10">
          <InboxList companyId={company.id} userId={userId} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: 승격 확인**

Run: `cd frontend && npm run dev` → `/work`
Expected:
1. 하단에 인박스 2건(시드)이 보인다
2. 입력창에 아무거나 넣고 「담기」 → 목록에 즉시 추가된다
3. 「업무로」 → 대화상자에서 중요도·영역·기한을 정하고 「업무 만들기」 → 인박스에서 사라지고 칸반 「할 일」 열에 나타난다
4. 「버림」 → 목록에서 사라진다

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "feat(inbox): 캡처·목록·업무 승격"
```

---

## Task 19: 빠른 입력과 오늘 한눈에

**Files:**
- Create: `frontend/src/components/QuickAdd.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

설계서 §3의 사이드바 상단 「빠른 입력」과 하단 「오늘 한눈에」. 1단계에서는 **새 업무만** 동작하고 회의록·전화메모는 비활성으로 둔다.

- [ ] **Step 1: 빠른 입력 컴포넌트**

`frontend/src/components/QuickAdd.tsx`

```tsx
import { useNavigate } from 'react-router-dom'
import { useCurrentCompany } from '../features/company/useCompany'
import { useTasks } from '../features/tasks/hooks'
import { useInbox } from '../features/inbox/hooks'
import { scheduleOf } from '../domain/dday'

export function QuickAdd() {
  const navigate = useNavigate()
  const { data: company } = useCurrentCompany()
  const { data: tasks } = useTasks(company?.id)
  const { data: inbox } = useInbox(company?.id)

  const today = new Date()
  const open = (tasks ?? []).filter((t) => t.status !== '완료')
  const overdue = open.filter((t) => scheduleOf(t, today) === '지연').length
  const waiting = open.filter((t) => t.source === '요청받음' && !t.reply).length

  return (
    <>
      <p className="text-[10px] font-semibold tracking-[0.1em] text-ink-mute uppercase mt-6 mb-2">
        빠른 입력
      </p>
      <div className="flex flex-col gap-1.5">
        <button
          onClick={() => navigate('/work')}
          className="bg-canvas border border-hairline rounded-[9999px] px-3 py-1.5 text-caption text-left"
        >
          ＋ 새 업무
        </button>
        <button
          disabled
          title="4단계에서 붙습니다"
          className="bg-canvas border border-hairline rounded-[9999px] px-3 py-1.5 text-caption text-left opacity-40 cursor-not-allowed"
        >
          ＋ 회의록
        </button>
        <button
          disabled
          title="3단계에서 붙습니다"
          className="bg-canvas border border-hairline rounded-[9999px] px-3 py-1.5 text-caption text-left opacity-40 cursor-not-allowed"
        >
          ＋ 전화메모
        </button>
      </div>

      <p className="text-[10px] font-semibold tracking-[0.1em] text-ink-mute uppercase mt-7 mb-2">
        오늘 한눈에
      </p>
      <p className="text-caption text-ink-soft leading-relaxed">
        할 일 <b>{open.length}</b> · 지연 <b className={overdue ? 'text-alert' : ''}>{overdue}</b>
        <br />
        회신 대기 <b>{waiting}</b> · 인박스 <b>{inbox?.length ?? 0}</b>
      </p>
    </>
  )
}
```

- [ ] **Step 2: 사이드바에 넣기**

`frontend/src/components/Sidebar.tsx` 전체 교체. `children` prop을 없애고 `<QuickAdd />`를 직접 넣는다.

```tsx
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { QuickAdd } from './QuickAdd'

const MENU = [
  { to: '/', label: '오늘', icon: '📌', end: true },
  { to: '/work', label: '업무', icon: '📋' },
  { to: '/plan', label: '계획', icon: '🗓' },
  { to: '/record', label: '기록', icon: '✏️' },
  { to: '/base', label: '기준', icon: '📖' },
]

export function Sidebar() {
  return (
    <aside className="w-[220px] shrink-0 bg-parchment border-r border-hairline min-h-screen px-4 py-6 flex flex-col">
      <p className="text-[10px] font-semibold tracking-[0.1em] text-ink-mute uppercase">
        Work Management
      </p>

      <QuickAdd />

      <p className="text-[10px] font-semibold tracking-[0.1em] text-ink-mute uppercase mt-7 mb-2">
        메뉴
      </p>
      <nav className="flex flex-col gap-0.5">
        {MENU.map((m) => (
          <NavLink
            key={m.to}
            to={m.to}
            end={m.end}
            className={({ isActive }) =>
              [
                'rounded-sm px-3 py-2 text-body',
                isActive ? 'bg-canvas font-semibold' : 'text-ink-soft hover:bg-canvas/60',
              ].join(' ')
            }
          >
            <span className="mr-2">{m.icon}</span>
            {m.label}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={() => supabase.auth.signOut()}
        className="mt-auto text-caption text-ink-mute hover:text-ink text-left px-3"
      >
        로그아웃
      </button>
    </aside>
  )
}
```

- [ ] **Step 3: 확인**

Run: `cd frontend && npm run dev`
Expected: 사이드바에 빠른 입력 3개(회의록·전화메모는 흐리게)와 「오늘 한눈에」 숫자가 보인다. 인박스에 항목을 담으면 숫자가 올라간다.

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "feat: 사이드바 빠른 입력과 오늘 한눈에"
```

---

## Task 20: 마무리 — 전체 검증과 구 앱 제거

**Files:**
- Delete: `../todo_app/` `../todo_app_v2/` `../todo_app_v3/`
- Create: `README.md`

- [ ] **Step 1: 전체 테스트**

```bash
cd Work_Management/frontend
npm test
npx tsc --noEmit
npm run build
```

Expected: 테스트 34개 통과, 타입 오류 없음, 빌드 성공.

- [ ] **Step 2: 수용 기준 확인**

`npm run dev`로 띄우고 아래를 하나씩 확인한다.

- [ ] 로그아웃 후 다시 로그인된다
- [ ] `/work` 칸반에서 카드를 끌어 옮기면 즉시 반영되고 새로고침해도 유지된다
- [ ] 「＋ 새 업무」로 등록한 업무가 목록·칸반에 나타난다
- [ ] 「요청받음」을 고르면 요청자 입력칸이 나타난다
- [ ] 인박스에 담고 → 업무로 승격하면 칸반 「할 일」에 생긴다
- [ ] `/base`에서 지시사항 7건과 진행률이 보인다
- [ ] 사이드바 「오늘 한눈에」 숫자가 실제 데이터와 맞는다
- [ ] 지연된 업무의 D-day가 빨간색으로 보인다

- [ ] **Step 3: 구 Streamlit 앱 제거**

```bash
cd C:/Users/sunwo/OneDrive/Desktop/jeus
rm -rf todo_app todo_app_v2 todo_app_v3
```

이 폴더들은 git 바깥이라 커밋에 영향이 없다.

- [ ] **Step 4: README 작성**

`Work_Management/README.md`

```markdown
# Work Management

제우스 경영지원 업무를 관리하는 개인용 웹 서비스.

- 설계서: `docs/specs/2026-08-09-personal-work-management-design.md`
- 구현 계획: `docs/plans/`

## 실행

```bash
cd frontend
npm install
npm run dev
```

`frontend/.env.local` 에 아래 두 값이 필요하다 (git 제외).

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

## 스택

React · Vite · TypeScript · Tailwind v4 · TanStack Query · dnd-kit · Supabase

## 마이그레이션

```bash
npx supabase db push
```

## 테스트

```bash
cd frontend && npm test
```

## 진행 상황

- [x] 1단계 — 뼈대와 업무 (인박스·칸반·지시사항)
- [ ] 2단계 — 하루의 흐름 (오늘 화면·업무일지·어제 이야기·반복업무)
- [ ] 3단계 — 계획과 기준 (주간·월간·마일스톤·인수인계·연락처)
- [ ] 4단계 — 녹음 (전사 워커·회의록 자동 생성)
```

- [ ] **Step 5: 커밋과 푸시**

```bash
cd Work_Management
git add -A
git commit -m "docs: README 추가, 1단계 완료"
git push origin main
```

---

## 완료 조건

1단계가 끝나면 다음이 가능하다.

- 매직링크로 로그인한다
- 떠오른 것을 인박스에 던져둔다
- 인박스 항목을 중요도·영역·기한을 정해 업무로 승격한다
- 업무를 칸반에서 드래그로 옮기고, 목록으로 전환해 정렬된 상태로 본다
- 지시사항 7건과 각각의 진행률·기간을 본다
- 사이드바에서 할 일·지연·회신 대기·인박스 건수를 한눈에 본다
