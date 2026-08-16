-- ============================================================
-- 실시간 회의록 (설계서 §5.8 · §14 OQ-14)
--
-- 회의 중에 브라우저가 말을 받아쓰고, 끝나면 AI 가 회의록 초안을 만든다.
--
-- ⚠️ 녹음 파일이 생기지 않는 방식이다. 소리는 흘러가고 글자만 남는다.
--    그래서 설계서 §7 에 예정돼 있던 `recordings` 표를 **만들지 않는다.**
--    (OQ-14 를 ④ 브라우저 내장 받아쓰기로 닫았다 —
--     기획서 docs/plans/2026-08-16-live-meeting-notes.md)
-- ============================================================

-- ------------------------------------------------------------
-- 1. meetings 에 칸 넷
-- ------------------------------------------------------------
alter table public.meetings
  -- 어느 길로 만든 회의록인가. 나중에 「받아쓰기가 쓸 만한가」를 비교하려면
  -- 그 회의록이 어느 쪽으로 만들어졌는지를 알아야 한다
  add column if not exists transcript_source text not null default '직접입력'
    check (transcript_source in ('직접입력', '실시간받아쓰기')),

  -- AI 가 준 초안 원본 {summary, decisions, followUps, checks, model, text}.
  -- 사람이 고친 확정본(agenda·decisions)과 **둘 다** 남긴다 —
  -- 그 차이가 "AI 가 뭘 놓쳤나"를 알려주는 유일한 신호다 (CLAUDE.md)
  add column if not exists ai_draft jsonb,

  -- 몇 분짜리 회의였나. 「1시간 회의가 회의록 세 줄」 같은 것이 보인다
  add column if not exists duration_sec integer,

  -- 회의 중 사람이 직접 적은 메모.
  -- 전사문과 같은 칸에 담지 않는다 — 섞이면 나중에
  -- 「누가 말한 것」과 「내가 판단한 것」이 구분되지 않는다
  add column if not exists my_notes text;

comment on column public.meetings.transcript_source is
  '직접입력 | 실시간받아쓰기 — 회의록이 어느 길로 만들어졌나';
comment on column public.meetings.ai_draft is
  'AI 회의록 초안 원본. 사람이 고치기 전 모습을 남긴다';

-- ------------------------------------------------------------
-- 2. 공개 정책 — 회의록·전화메모가 통째로 빠져 있었다
--
-- 지금까지는 사람이 요약해 적었으니 덜 위험했다. 받아쓰기가 붙으면
-- **대표·거래처의 발언이 토씨까지 남는다.** AI 가 답변 근거로 꺼내면 안 된다.
--
-- 「학습에는 쓰되 인용은 불가」 — CLAUDE.md 공개 정책 표와 같은 결이다.
-- ------------------------------------------------------------
insert into public.disclosure_policy
  (table_name, learn_allowed, quote_allowed, condition, reason)
values
  ('meetings', true, '불가', null,
   '남이 한 말이 토씨까지 남는다. 회생·인사 회의가 섞여 있을 수 있다'),
  ('calls',    true, '불가', null,
   '거래처·관계기관과 주고받은 말. 상대가 공개에 동의한 적이 없다')
on conflict (table_name) do nothing;
