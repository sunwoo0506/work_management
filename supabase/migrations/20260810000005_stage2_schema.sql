-- ============================================================
-- 2단계 스키마 — 절차와 실행이력
--
-- 설계서 §5.1~5.3, §6.2
-- 계획서 docs/plans/2026-08-10-stage2-procedures-and-runs.md
--
-- 이 제품이 남기려는 세 층 중 두 번째와 세 번째를 만든다.
--   무엇을 했나  → tasks           (1단계)
--   어떻게 했나  → procedures      (여기)
--   이번엔 어떻게 → runs           (여기)
--   왜 달랐나    → exceptions      (자리만. 탐지는 5단계)
-- ============================================================

-- ============================================================
-- procedures — 이런 일은 이렇게 한다
-- ============================================================
create table public.procedures (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references public.companies(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,

  code          text,
  title         text        not null,
  area          text,
  purpose       text,

  -- 언제 시작하나
  trigger_type  text        not null default '수동'
                check (trigger_type in ('일', '주', '월', '분기', '연', '이벤트', '수동')),
  -- 주기 트리거의 세부 규칙. 종류마다 쓰는 칸이 다르다.
  --   주   → weekday (0=일 … 6=토)
  --   월   → day_of_month
  --   분기 → offset_days (분기 종료일로부터 며칠 뒤)
  --   연   → month + day_of_month
  trigger_rule  jsonb       not null default '{}'::jsonb,

  inputs        jsonb       not null default '[]'::jsonb,  -- 입력자료 목록
  outputs       jsonb       not null default '[]'::jsonb,  -- 산출물 목록

  -- 나중에 AI 에게 넘길 때의 스위치. 지금부터 넣어둔다 (설계서 §6.2)
  ai_delegation text        not null default '사람만'
                check (ai_delegation in ('사람만', 'AI 초안 → 내가 승인', 'AI 자동')),

  version       integer     not null default 1,
  status        text        not null default '초안'
                check (status in ('초안', '확정', '폐기')),
  origin        text        not null default '직접작성'
                check (origin in ('직접작성', '자동제안')),

  sort_order    integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index procedures_company_idx on public.procedures (company_id, sort_order);
create index procedures_trigger_idx on public.procedures (company_id, trigger_type)
  where status = '확정';

create trigger procedures_set_updated_at
  before update on public.procedures
  for each row execute function public.set_updated_at();


-- ============================================================
-- procedure_steps — 단계별 정의
--
-- decision_rule(판단기준)이 AI 에게 가장 중요하다.
-- 순서만 있으면 따라는 하지만 언제 멈춰야 하는지를 모른다.
-- ============================================================
create table public.procedure_steps (
  id             uuid        primary key default gen_random_uuid(),
  company_id     uuid        not null references public.companies(id) on delete cascade,
  user_id        uuid        not null references auth.users(id) on delete cascade,
  procedure_id   uuid        not null references public.procedures(id) on delete cascade,

  seq            integer     not null,
  title          text        not null,
  what_to_do     text,
  decision_rule  text,                    -- 판단기준
  expected_min   integer,                 -- 예상 소요(분)
  needed_input   text,
  automatable    boolean     not null default false,
  required       boolean     not null default true,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint procedure_steps_seq_unique unique (procedure_id, seq)
);

create index procedure_steps_procedure_idx on public.procedure_steps (procedure_id, seq);

create trigger procedure_steps_set_updated_at
  before update on public.procedure_steps
  for each row execute function public.set_updated_at();


-- ============================================================
-- runs — 이번 회차에 실제로 돌린 기록
-- ============================================================
create table public.runs (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references public.companies(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  procedure_id  uuid        not null references public.procedures(id) on delete cascade,

  seq           integer     not null,              -- 회차. 1, 2, 3 …
  period_label  text,                              -- 대상기간 '2026-Q2' 등
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,

  performer     text        not null default '사람'
                check (performer in ('사람', 'AI', '혼합')),
  result        text        not null default '진행중'
                check (result in ('진행중', '완료', '중단')),

  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint runs_seq_unique unique (procedure_id, seq)
);

create index runs_procedure_idx on public.runs (procedure_id, seq desc);
create index runs_company_open_idx on public.runs (company_id) where result = '진행중';

create trigger runs_set_updated_at
  before update on public.runs
  for each row execute function public.set_updated_at();


-- ============================================================
-- run_steps — 단계별 실제 기록
--
-- 회차가 쌓이면 여기서 패턴이 나온다.
-- 5단계의 예외 탐지가 보는 것이 이 표다.
-- ============================================================
create table public.run_steps (
  id                 uuid        primary key default gen_random_uuid(),
  company_id         uuid        not null references public.companies(id) on delete cascade,
  user_id            uuid        not null references auth.users(id) on delete cascade,
  run_id             uuid        not null references public.runs(id) on delete cascade,
  -- 절차에 없는 단계가 실행될 수 있다 (예외 규칙 2번). 그때는 null.
  procedure_step_id  uuid        references public.procedure_steps(id) on delete set null,

  seq                integer     not null,          -- 실제 실행 순서
  title              text        not null,          -- 절차 단계가 바뀌어도 그때의 이름을 남긴다
  actual_min         integer,                       -- 실제 소요(분)
  output             text,                          -- 산출물
  note               text,
  human_intervened   boolean     not null default true,
  done               boolean     not null default false,
  done_at            timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index run_steps_run_idx  on public.run_steps (run_id, seq);
create index run_steps_step_idx on public.run_steps (procedure_step_id);

create trigger run_steps_set_updated_at
  before update on public.run_steps
  for each row execute function public.set_updated_at();


-- ============================================================
-- exceptions — 절차대로 안 됐을 때
--
-- 표는 지금 만들고 탐지는 5단계에서 붙인다.
-- 나중에 스키마부터 다시 만들지 않기 위해서다.
--
-- rule 값은 설계서 §5.4 의 6가지다.
-- ============================================================
create table public.exceptions (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references public.companies(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  run_id        uuid        not null references public.runs(id) on delete cascade,
  run_step_id   uuid        references public.run_steps(id) on delete set null,

  rule          text        not null
                check (rule in (
                  '단계 건너뜀', '단계 추가', '소요시간 이탈',
                  '산출물 누락', '사람 개입 증가', '순서 뒤바뀜'
                )),
  detected      text        not null,               -- 무엇이 달랐나 (툴이 적는다)
  confirm       text        not null default '대기'
                check (confirm in ('대기', '예외확정', '정상')),
  explanation   text,                               -- 사람이 한 줄 덧붙인다
  reflected     boolean     not null default false, -- 절차에 반영했나

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index exceptions_run_idx     on public.exceptions (run_id);
create index exceptions_pending_idx on public.exceptions (company_id) where confirm = '대기';

create trigger exceptions_set_updated_at
  before update on public.exceptions
  for each row execute function public.set_updated_at();


-- ============================================================
-- tasks 에 절차 연결 칸을 붙인다
--
-- 1단계에서는 참조할 표가 없어 미뤄뒀다.
-- 절차가 업무를 대체하는 게 아니라 업무를 만들어낸다.
-- ============================================================
alter table public.tasks
  add column procedure_id uuid references public.procedures(id) on delete set null,
  add column run_id       uuid references public.runs(id)       on delete set null;

create index tasks_procedure_idx on public.tasks (procedure_id);
create index tasks_run_idx       on public.tasks (run_id);
