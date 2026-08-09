-- ============================================================
-- 1단계 시드 — 공개 정책 (설계서 §7)
--
-- 이 표만 마이그레이션에 넣는다. user_id 가 없는 시스템 규칙이라
-- 사용자마다 만들 필요가 없기 때문이다.
--
-- 업체와 지시사항은 user_id 가 필요하므로 앱에서 만든다
-- (frontend/src/features/seed/). SQL 에 특정 사용자 UUID 를 박으면
-- 다른 환경에서 안 돌아간다.
--
-- 아직 존재하지 않는 테이블 이름도 미리 넣는다. table_name 은 그냥
-- 문자열이라 테이블이 없어도 무방하고, 3단계에서 AI 를 붙이는 사람이
-- 설계서를 안 읽어도 정책이 이미 있어야 하기 때문이다.
-- ============================================================

insert into public.disclosure_policy
  (table_name, learn_allowed, quote_allowed, condition, reason)
values
  -- 인용 가능
  ('issue_publications', true, '가능',   null,
   '사용자가 직접 발행한 것'),
  ('directives',         true, '가능',   null,
   '대표가 준 것'),

  -- 조건부
  ('documents',          true, '조건부', '확정본 중 발송·제출한 것만',
   '초안은 미완성물이다'),
  ('periodic_reports',   true, '조건부', '사용자가 확정한 것만',
   '성과평가 자료'),

  -- 인용 불가 — 업무 노하우
  ('procedures',         true, '불가',   null, '업무 노하우'),
  ('procedure_steps',    true, '불가',   null, '업무 노하우'),
  ('document_templates', true, '불가',   null, '업무 노하우'),

  -- 인용 불가 — 소요시간이 새는 자리
  ('runs',               true, '불가',   null, '소요시간이 새는 자리'),
  ('run_steps',          true, '불가',   null, '소요시간이 새는 자리'),
  ('exceptions',         true, '불가',   null, '소요시간이 새는 자리'),

  -- 인용 불가 — 비공개 작업 내역
  ('tasks',              true, '불가',   null, '비공개 작업 내역'),
  ('checklist',          true, '불가',   null, '비공개 작업 내역'),
  ('inbox',              true, '불가',   null, '비공개 작업 내역'),
  ('daily_logs',         true, '불가',   null, '비공개 작업 내역'),
  ('log_todos',          true, '불가',   null, '비공개 작업 내역'),

  -- 인용 불가 — 가장 사적인 기록
  ('assistant_threads',  true, '불가',   null,
   '사용자가 AI 에게 무엇을 물었는지는 가장 사적인 기록이다'),
  ('assistant_messages', true, '불가',   null,
   '사용자가 AI 에게 무엇을 물었는지는 가장 사적인 기록이다')

on conflict (table_name) do nothing;
