-- ============================================================
-- 1단계 스키마 — 뼈대와 업무
--
-- 설계서: docs/specs/2026-08-09-work-management-design-v1.md §6
-- 계획서: docs/plans/2026-08-10-stage1-skeleton-and-tasks.md Task 1
--
-- 이 마이그레이션이 만드는 것 (7개)
--   실행 층 : companies · directives · tasks · checklist · inbox
--   기록 층 : activity
--   정책 층 : disclosure_policy
--
-- 이 단계에서 안 만드는 것
--   발행 층 (issue_publications) — 연동 계약서 확정 후 6단계
--   학습 층 (procedures 등)       — 2단계
--   문서 층 · 대화 층              — 3단계
--   나머지 기록 층                 — 4·5·7단계
-- ============================================================

-- gen_random_uuid() 는 PostgreSQL 13 부터 코어에 들어와 있다.
-- pgcrypto 확장을 따로 설치하지 않는다 — 권한 문제를 만들 이유가 없다.

-- ------------------------------------------------------------
-- 공통 — updated_at 자동 갱신
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ============================================================
-- companies — 사업체
--   업체가 1개면 화면에서 셀렉터를 숨긴다 (설계서 §5.9)
-- ============================================================
create table public.companies (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  name        text        not null,
  color       text        not null default '#0066cc',
  active      boolean     not null default true,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index companies_user_idx on public.companies (user_id, sort_order);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();


-- ============================================================
-- directives — 지시사항 (D-01 ~ D-13)
--   source_ref 에는 사업이해자료의 조항 번호만 적는다.
--   본문을 옮겨 적지 않는다 (사외 반출 금지 자료)
-- ============================================================
create table public.directives (
  id          uuid        primary key default gen_random_uuid(),
  company_id  uuid        not null references public.companies(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  code        text        not null,
  title       text        not null,
  axis        text,
  area        text,
  source_ref  text,
  summary     text,
  rationale   text,
  due_date    date,
  priority    text        not null default 'P1'
              check (priority in ('P0', 'P1', 'P2')),
  status      text        not null default '진행중'
              check (status in ('대기', '진행중', '완료', '보류')),
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint directives_company_code_unique unique (company_id, code)
);

create index directives_company_idx on public.directives (company_id, sort_order);

create trigger directives_set_updated_at
  before update on public.directives
  for each row execute function public.set_updated_at();


-- ============================================================
-- tasks — 업무
--
--   source 값이 늘어날 수 있으므로 enum 이 아니라 text + check 를 쓴다.
--   enum 은 값 추가에 ALTER TYPE 이 필요하지만 check 는 떼고 새로 붙이면 된다.
--
--   procedure_id / run_id 는 2단계에서 추가한다.
--   참조할 procedures 테이블이 아직 없어 외래키를 걸 수 없다.
-- ============================================================
create table public.tasks (
  id              uuid        primary key default gen_random_uuid(),
  company_id      uuid        not null references public.companies(id) on delete cascade,
  user_id         uuid        not null references auth.users(id) on delete cascade,

  title           text        not null,
  detail          text,

  source          text        not null default '내 발의'
                  check (source in (
                    '내 발의', '요청받음', '일지', '인박스', '회의록', '대표지시', '절차'
                  )),

  -- 「요청받음」·「대표지시」일 때만 채워진다.
  -- requester 에는 실명이 아니라 역할·부서를 적는다.
  requester       text,
  requester_dept  text,
  intake_channel  text,
  reply_due       date,
  reply_body      text,

  directive_id    uuid        references public.directives(id) on delete set null,
  area            text,

  priority        text        not null default 'P1'
                  check (priority in ('P0', 'P1', 'P2')),
  status          text        not null default '할 일'
                  check (status in ('할 일', '진행중', '검토요청', '완료', '보류')),

  start_date      date,
  due_date        date,
  focus_date      date,   -- 「오늘 하기로 찍은 날」
  progress        integer     not null default 0
                  check (progress between 0 and 100),
  sort_order      integer     not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index tasks_company_status_idx on public.tasks (company_id, status);
create index tasks_directive_idx      on public.tasks (directive_id);
create index tasks_due_idx            on public.tasks (company_id, due_date);
create index tasks_focus_idx          on public.tasks (company_id, focus_date);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();


-- ============================================================
-- checklist — 업무 안의 체크 항목
-- ============================================================
create table public.checklist (
  id          uuid        primary key default gen_random_uuid(),
  company_id  uuid        not null references public.companies(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  task_id     uuid        not null references public.tasks(id) on delete cascade,
  label       text        not null,
  required    boolean     not null default false,
  done        boolean     not null default false,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index checklist_task_idx on public.checklist (task_id, sort_order);

create trigger checklist_set_updated_at
  before update on public.checklist
  for each row execute function public.set_updated_at();


-- ============================================================
-- inbox — 분류 전 메모
--
--   1단계에서는 origin = '직접' 만 들어온다.
--   '회의록'·'전화메모' 는 7단계, '경영관리서비스' 는 6단계에서 붙는다.
--   값은 지금 넣어두어 나중에 제약을 다시 만들 일이 없게 한다.
-- ============================================================
create table public.inbox (
  id                uuid        primary key default gen_random_uuid(),
  company_id        uuid        not null references public.companies(id) on delete cascade,
  user_id           uuid        not null references auth.users(id) on delete cascade,
  content           text        not null,
  tag               text,
  origin            text        not null default '직접'
                    check (origin in ('직접', '회의록', '전화메모', '경영관리서비스')),
  origin_ref        text,   -- 외부 이슈 번호 등
  promoted_task_id  uuid        references public.tasks(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index inbox_company_idx on public.inbox (company_id, created_at desc);

-- 아직 업무로 승격되지 않은 것만 목록에 보인다
create index inbox_pending_idx on public.inbox (company_id, created_at desc)
  where promoted_task_id is null;

create trigger inbox_set_updated_at
  before update on public.inbox
  for each row execute function public.set_updated_at();


-- ============================================================
-- activity — 무엇이 언제 바뀌었나
-- ============================================================
create table public.activity (
  id           uuid        primary key default gen_random_uuid(),
  company_id   uuid        not null references public.companies(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  target_type  text        not null
               check (target_type in ('task', 'directive', 'inbox', 'checklist')),
  target_id    uuid        not null,
  action       text        not null,   -- '생성' | '수정' | '상태변경' | '승격' | '삭제'
  detail       jsonb,
  occurred_at  timestamptz not null default now()
);

create index activity_company_time_idx on public.activity (company_id, occurred_at desc);
create index activity_target_idx       on public.activity (target_type, target_id);


-- ============================================================
-- disclosure_policy — AI 가 인용해도 되는 데이터 (설계서 §7)
--
--   ⚠️ 이 테이블만 company_id · user_id 가 없다.
--      사람별·업체별 정책이 아니라 시스템 규칙이기 때문이다.
--      CLAUDE.md 의 "모든 테이블에 둘 다 둔다" 규칙의 유일한 예외다.
--
--   AI 는 3단계에서 들어오지만 정책은 지금 넣는다.
--   나중에 AI 를 붙이는 사람이 설계서를 안 읽어도 사고가 안 나게 하기 위해서다.
--   행에는 아직 존재하지 않는 테이블 이름도 미리 넣는다 (문자열이므로 무방).
-- ============================================================
create table public.disclosure_policy (
  table_name     text        primary key,
  learn_allowed  boolean     not null default true,
  quote_allowed  text        not null
                 check (quote_allowed in ('가능', '불가', '조건부')),
  condition      text,
  reason         text        not null,
  updated_at     timestamptz not null default now(),

  -- '조건부' 이면 조건을 반드시 적는다
  constraint disclosure_policy_condition_required
    check (quote_allowed <> '조건부' or condition is not null)
);

create trigger disclosure_policy_set_updated_at
  before update on public.disclosure_policy
  for each row execute function public.set_updated_at();
