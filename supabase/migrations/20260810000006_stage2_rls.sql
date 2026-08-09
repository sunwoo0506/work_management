-- ============================================================
-- 2단계 RLS — 본인 데이터만 보이게
--
-- 1단계와 같은 규칙이다. using 과 with check 를 반드시 같이 건다 —
-- using 만 걸면 읽기는 막히는데 남의 user_id 로 쓰기가 통과한다.
--
-- (select auth.uid()) 로 감싸 행마다 함수가 재평가되지 않게 한다.
-- ============================================================

alter table public.procedures      enable row level security;
alter table public.procedure_steps enable row level security;
alter table public.runs            enable row level security;
alter table public.run_steps       enable row level security;
alter table public.exceptions      enable row level security;

create policy own_procedures on public.procedures
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy own_procedure_steps on public.procedure_steps
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy own_runs on public.runs
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy own_run_steps on public.run_steps
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy own_exceptions on public.exceptions
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
