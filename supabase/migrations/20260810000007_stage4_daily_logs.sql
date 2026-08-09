-- ============================================================
-- 4단계 — 하루의 흐름 (업무일지)
--
-- 설계서 §5.7
--
-- 일지는 기록이 아니라 **어제와 오늘을 잇는 장치**다.
--   1. 오늘 진행한 업무 — 자동 수집. 스냅샷으로 굳는다
--   2. 이슈·막힌 것    — 다음날 「어제 이야기」에 올라온다
--   3. 내일 할 일      — 체크한 것만 업무가 된다
--   4. 메모
-- ============================================================

-- ============================================================
-- daily_logs — 하루 한 장
--
-- snapshot 이 이 표의 핵심이다.
-- 그날 상태가 바뀐 업무를 굳혀서 담는다. 나중에 업무를 수정해도
-- 그날 일지는 바뀌지 않는다 — 연말에 "3월에 뭐 했더라"를 되짚으려면
-- 그때의 기록이 그대로 남아 있어야 하기 때문이다.
--
-- 조인해서 실시간으로 다시 계산하는 구현은 이 요구를 깨뜨린다.
-- ============================================================
create table public.daily_logs (
  id          uuid        primary key default gen_random_uuid(),
  company_id  uuid        not null references public.companies(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,

  log_date    date        not null,
  snapshot    jsonb       not null default '[]'::jsonb,  -- 굳은 「오늘 진행한 업무」
  issues      text,                                       -- 이슈·막힌 것
  memo        text,
  spent_min   integer,                                    -- 투입시간(분)

  closed_at   timestamptz,                                -- 확정 시각. 굳은 뒤엔 스냅샷을 다시 만들지 않는다
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint daily_logs_company_date_unique unique (company_id, log_date)
);

create index daily_logs_company_date_idx on public.daily_logs (company_id, log_date desc);

create trigger daily_logs_set_updated_at
  before update on public.daily_logs
  for each row execute function public.set_updated_at();


-- ============================================================
-- log_todos — 내일 할 일
--
-- 줄마다 「업무로」 체크박스가 있다.
-- 체크한 것만 업무로 등록되어 다음날 「오늘 할 일」에 나타나고,
-- 체크 안 한 것은 다음날 「어제 이야기」에 *메모로 남긴 것*으로 표시된다.
--
-- 이 구분이 일지를 "적고 끝나는 것"에서 "다음날로 이어지는 것"으로 만든다.
-- ============================================================
create table public.log_todos (
  id                uuid        primary key default gen_random_uuid(),
  company_id        uuid        not null references public.companies(id) on delete cascade,
  user_id           uuid        not null references auth.users(id) on delete cascade,
  daily_log_id      uuid        not null references public.daily_logs(id) on delete cascade,

  title             text        not null,
  priority          text        not null default 'P1'
                    check (priority in ('P0', 'P1', 'P2')),
  promote           boolean     not null default false,   -- 「업무로」 체크했나
  promoted_task_id  uuid        references public.tasks(id) on delete set null,

  sort_order        integer     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index log_todos_log_idx on public.log_todos (daily_log_id, sort_order);

create trigger log_todos_set_updated_at
  before update on public.log_todos
  for each row execute function public.set_updated_at();


-- RLS
alter table public.daily_logs enable row level security;
alter table public.log_todos  enable row level security;

create policy own_daily_logs on public.daily_logs
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy own_log_todos on public.log_todos
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
