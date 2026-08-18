-- 회의 「시작~종료 시각」
--
-- 부장님이 주신 회의록 양식 1번 기본정보에 있는 칸인데 담을 곳이 없었다.
-- 「작성자」(writer)는 2026-08-16 에 이미 만들어 뒀고 화면만 없었다.
--
-- ── 왜 date 가 아니라 time 인가 ────────────────────────────
-- 회의 날짜는 met_on 에 이미 있다. 여기 필요한 것은 **그날 몇 시부터 몇 시까지**다.
-- 시각까지 한 칸에 담으면(timestamptz) 시간대가 끼어든다. 이 저장소는 날짜에서
-- 실제로 결함이 났던 적이 있어(CLAUDE.md) 시간대가 안 끼어드는 쪽으로 둔다.
-- 회의는 벽시계 시각으로 기억하는 것이지 절대 시각으로 기억하지 않는다.
--
-- ── duration_sec 이 있는데 왜 또 두나 ──────────────────────
-- duration_sec 는 **받아쓰기가 실제로 돌아간 시간**이다. 중간에 멈췄다 켜면
-- 회의 길이와 다르다. 그리고 손으로 적는 회의록에는 그 값이 아예 없다.
-- 「몇 시에 모였나」는 그것과 별개의 사실이다.

alter table public.meetings
  add column if not exists started_at time,
  add column if not exists ended_at time;

comment on column public.meetings.started_at is '회의 시작 시각 (그날의 벽시계 시각)';
comment on column public.meetings.ended_at is '회의 종료 시각 (그날의 벽시계 시각)';
