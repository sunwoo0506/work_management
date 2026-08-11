-- ============================================================
-- 업무에 두 가지를 더한다 — 부모·자식 관계와 「언제 끝났나」
--
-- 사용자가 실제로 써 보고 나온 요구다.
--   "회생지원처럼 큰 건은 하위업무가 필요하다. 부모 개념으로."
--   "완료하면 별도 아카이브로 가서 나중에 검색해 찾아볼 수 있게."
-- ============================================================


-- ------------------------------------------------------------
-- parent_task_id — 하위 업무
--
-- ⚠️ 중요한 전제 (사용자 말 그대로) —
--    *"각각의 세부업무는 별도로 존재하지만 업무창에서는 관련 세부업무가
--      하단에 보이는거지"*
--
--    즉 하위 업무는 부모에 딸린 부속품이 아니라 **제 몫을 하는 업무**다.
--    목록에도 제 줄로 나오고, 자기 기한·자기 체크리스트·자기 AI 대화를 갖는다.
--    부모 서랍에서는 그것들이 **모여 보일** 뿐이다.
--
--    그래서 체크리스트와 다르다. 체크리스트 항목은 한 줄짜리 표시이고
--    기한도 진행률도 못 붙는다. 하위 업무는 그게 다 붙는다.
--
-- on delete set null 인 이유 —
--   cascade 로 두면 부모를 지우는 순간 하위 업무가 **소리 없이** 사라진다.
--   하위 업무는 제 몫을 하는 업무이므로 그렇게 사라지면 안 된다.
--   부모만 사라지고 하위는 최상위로 올라온다. 삭제 확인창이 그 사실을 말해 준다.
--
-- 자기 자신을 부모로 두는 것만 막는다. 더 깊은 고리(A→B→A)는 화면에서 막는다.
-- ------------------------------------------------------------
alter table public.tasks
  add column parent_task_id uuid references public.tasks(id) on delete set null;

alter table public.tasks
  add constraint tasks_parent_not_self check (parent_task_id is null or parent_task_id <> id);

create index tasks_parent_idx on public.tasks (parent_task_id)
  where parent_task_id is not null;


-- ------------------------------------------------------------
-- completed_at — 언제 끝났나
--
-- 왜 updated_at 으로 안 되나 —
--   updated_at 은 오타 하나만 고쳐도 바뀐다. 아카이브를 「최근 끝난 순」으로
--   늘어놓는데 그 값을 쓰면, 3월에 끝낸 일을 8월에 한 글자 고쳤다고
--   맨 위로 올라온다.
--
-- 상태가 「완료」에서 다시 열리면 이 값을 비운다. 앱이 챙긴다 (api.changeStatus).
-- ------------------------------------------------------------
alter table public.tasks add column completed_at timestamptz;

create index tasks_completed_idx on public.tasks (company_id, completed_at desc)
  where completed_at is not null;

-- 이미 완료 상태인 업무에 값을 채워 둔다.
-- 언제 끝냈는지 진짜 시각은 알 수 없으므로 마지막 수정 시각을 쓴다.
-- 정확하지 않지만 비워 두면 아카이브에서 순서가 없다.
update public.tasks
   set completed_at = updated_at
 where status = '완료' and completed_at is null;
