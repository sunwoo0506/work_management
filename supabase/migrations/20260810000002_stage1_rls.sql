-- ============================================================
-- 1단계 RLS — 본인 데이터만 보이게
--
-- 설계서: docs/specs/2026-08-09-work-management-design-v1.md §9 (수용 기준)
-- 계획서: docs/plans/2026-08-10-stage1-skeleton-and-tasks.md Task 2
--
-- 이게 없으면 anon 키를 가진 누구나 전체 데이터를 읽는다.
-- 브라우저에 들어가는 키가 anon 키이므로, 앱을 배포하는 순간 공개된다.
--
-- using       — 어떤 행을 "볼 수 있는가" (select / update / delete 대상)
-- with check  — 어떤 행을 "만들거나 바꿀 수 있는가" (insert / update 결과)
--
-- ⚠️ with check 를 빼면 읽기는 막히는데 남의 user_id 로 쓰기가 통과한다.
--    두 개를 반드시 같이 건다.
-- ============================================================

alter table public.companies         enable row level security;
alter table public.directives        enable row level security;
alter table public.tasks             enable row level security;
alter table public.checklist         enable row level security;
alter table public.inbox             enable row level security;
alter table public.activity          enable row level security;
alter table public.disclosure_policy enable row level security;


-- ------------------------------------------------------------
-- 사용자 소유 테이블 6개 — 본인 것만 전부 허용
--
-- (select auth.uid()) 로 감싼 이유:
--   함수 호출이 행마다 반복되지 않고 한 번만 평가된다.
--   행이 많아질수록 차이가 커진다.
-- ------------------------------------------------------------
create policy own_companies on public.companies
  for all
  to authenticated
  using       ((select auth.uid()) = user_id)
  with check  ((select auth.uid()) = user_id);

create policy own_directives on public.directives
  for all
  to authenticated
  using       ((select auth.uid()) = user_id)
  with check  ((select auth.uid()) = user_id);

create policy own_tasks on public.tasks
  for all
  to authenticated
  using       ((select auth.uid()) = user_id)
  with check  ((select auth.uid()) = user_id);

create policy own_checklist on public.checklist
  for all
  to authenticated
  using       ((select auth.uid()) = user_id)
  with check  ((select auth.uid()) = user_id);

create policy own_inbox on public.inbox
  for all
  to authenticated
  using       ((select auth.uid()) = user_id)
  with check  ((select auth.uid()) = user_id);

create policy own_activity on public.activity
  for all
  to authenticated
  using       ((select auth.uid()) = user_id)
  with check  ((select auth.uid()) = user_id);


-- ------------------------------------------------------------
-- disclosure_policy — 로그인한 사용자는 읽기만
--
-- 쓰기 정책을 아예 만들지 않는다.
-- RLS 가 켜진 테이블에 정책이 없는 동작은 "거부"이므로,
-- 앱에서는 이 표를 바꿀 수 없다. 바꾸려면 마이그레이션을 써야 한다.
--
-- 공개 정책은 사람이 화면에서 고칠 수 있으면 안 된다.
-- 실수로 「불가」를 「가능」으로 바꾸면 업무 내역이 새어 나간다.
-- ------------------------------------------------------------
create policy read_disclosure on public.disclosure_policy
  for select
  to authenticated
  using (true);
