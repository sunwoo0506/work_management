-- ============================================================
-- 회의록 양식 — 결정사항과 Action Item 을 나눠 담는다
--
-- 지금까지 회의록은 「안건」과 「결정사항」 두 칸의 줄글이었다. 사용자가 실무에서
-- 쓰는 양식을 가져왔는데, 핵심이 하나 있다 —
--
--   「A 시스템을 도입하기로 한다」        → 결정사항
--   「견적 3곳 비교 · 담당 · 8/21까지」  → Action Item
--
-- **이 둘을 반드시 나눈다.** 한 칸에 섞어 적으면 나중에 무엇을 해야 하는지
-- 회의록을 다시 읽어 찾아야 한다. 나눠 두면 Action Item 이 그대로 인박스로 넘어가
-- 업무가 된다 — 회의록이 기록으로 끝나지 않고 일로 이어지는 자리다.
--
-- 칸을 여덟 개로 쪼개 컬럼을 여덟 개 만들지 않는다. 양식은 앞으로도 손볼 것이고,
-- 그때마다 저장 공간을 고치면 무겁다. **한 칸(jsonb)에 통째로** 담는다.
-- ============================================================

alter table public.meetings
  -- { purpose[], agenda[], discussions[], decisions[], actions[], pending[], next{}, checks[] }
  add column if not exists minutes jsonb,
  -- 회의록을 누가 적었나. 양식 1번 칸
  add column if not exists writer text;

comment on column public.meetings.minutes is
  '회의록 양식 본문. 결정사항과 Action Item 을 나눠 담는다 (domain/minutes.ts)';

-- 예전 회의록(안건·결정사항 줄글)은 그대로 둔다. 두 칸은 계속 쓰인다 —
-- 목록에서 한 줄로 훑을 때와, 양식을 안 쓰고 간단히 적을 때.
