-- ============================================================
-- 전사 방식에 「녹음전사」를 더한다
--
-- 브라우저 내장 받아쓰기가 **폰에서 잘 안 됐다.** 삼성 인터넷에는 그 기능이
-- 아예 없고, 안드로이드 크롬은 한 마디마다 끊긴다. 실제로 폰에서 눌렀는데
-- 글자가 하나도 안 올라왔다.
--
-- 그래서 두 번째 길을 만들었다 — 브라우저는 **녹음만** 하고, 서버가 글로 바꾼다.
-- 어느 회의록이 어느 길로 만들어졌는지 남겨야 나중에 정확도를 비교할 수 있다.
-- ============================================================

-- 제약 이름이 자동으로 붙어 있어 이름을 찾아서 지운다
do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.meetings'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%transcript_source%';
  if c is not null then
    execute format('alter table public.meetings drop constraint %I', c);
  end if;
end $$;

alter table public.meetings
  add constraint meetings_transcript_source_check
  check (transcript_source in ('직접입력', '실시간받아쓰기', '녹음전사'));

comment on column public.meetings.transcript_source is
  '직접입력 | 실시간받아쓰기(브라우저) | 녹음전사(서버) — 회의록이 어느 길로 만들어졌나';
