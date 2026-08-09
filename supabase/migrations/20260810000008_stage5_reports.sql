-- ============================================================
-- 5단계 — 리포트
--
-- 설계서 §5.5, §6.6
--
-- 주간·월간·연간 리포트는 **밖으로 나가지 않는 내부 자료**다.
-- 사용자 본인의 모니터링과 연말 성과평가에 쓴다.
--
-- snapshot 이 굳는다는 것이 핵심이다. 나중에 업무를 수정해도 지난
-- 리포트는 변하지 않는다. 조인해서 실시간으로 다시 계산하는 구현은
-- 이 요구를 깨뜨린다.
-- ============================================================

create table public.periodic_reports (
  id           uuid        primary key default gen_random_uuid(),
  company_id   uuid        not null references public.companies(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,

  kind         text        not null check (kind in ('주간', '월간', '연간')),
  period_from  date        not null,
  period_to    date        not null,

  snapshot     jsonb       not null default '{}'::jsonb,  -- 굳은 자동집계
  narrative    text,                                       -- 숫자가 설명 못 하는 것

  closed_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint periodic_reports_unique unique (company_id, kind, period_from)
);

create index periodic_reports_company_idx
  on public.periodic_reports (company_id, period_from desc);

create trigger periodic_reports_set_updated_at
  before update on public.periodic_reports
  for each row execute function public.set_updated_at();

alter table public.periodic_reports enable row level security;

create policy own_periodic_reports on public.periodic_reports
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
