-- ============================================================
-- 받아쓰지 못한 회의 소리를 서버에 보관한다
--
-- ── 왜 필요한가 ──────────────────────────────────────────
-- 받아쓰기가 실패하면 그동안 한 말이 통째로 사라졌다. 그래서 소리를 담아 뒀는데,
-- 그것을 **브라우저 안에만** 두었더니 새 문제가 생겼다 —
-- **폰에서 녹음한 것을 노트북에서 볼 수 없다.** 브라우저 저장소는 기기마다 따로다.
-- (크롬 계정 동기화는 북마크·비밀번호만 옮긴다. 사이트 데이터는 안 옮긴다.)
--
-- 회의는 폰으로 하고 정리는 노트북에서 앉아서 한다. 그 흐름이 막혔다.
-- 그래서 소리를 서버에 둔다 — 사용자 판단 (2026-08-16).
--
-- ⚠️ **소리는 글자보다 사적이다.** 목소리·말투·머뭇거림이 그대로 남는다.
--    그래서 ① 본인만 읽고 ② 글로 바꾸면 곧바로 지우고 ③ 공개 정책에 「인용 불가」로 박는다.
--    민감 회의(회생·인사)를 어떻게 가릴지는 OQ-16 에서 함께 다룬다.
-- ============================================================

-- ------------------------------------------------------------
-- 1. 파일을 담을 보관함 (비공개)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meeting-audio',
  'meeting-audio',
  false,                       -- 주소를 아는 누구나 여는 일이 없게
  52428800,                    -- 한 파일 50MB (1시간 회의가 대략 10MB)
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']
)
on conflict (id) do nothing;

-- 파일 경로의 첫 칸이 그 사람의 아이디다: <user_id>/<meeting_id>/<파일>
-- 그래서 첫 칸만 비교하면 남의 소리는 손도 못 댄다
create policy "meeting_audio_read_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'meeting-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "meeting_audio_write_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'meeting-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "meeting_audio_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'meeting-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ------------------------------------------------------------
-- 2. 어느 회의의 소리인가를 적어 두는 표
--
--    파일만 있으면 「이게 몇 분 지점의 소리인지」를 알 수 없다.
--    다시 받아썼을 때 **제자리에 끼워 넣으려면** 그 시각이 있어야 한다.
-- ------------------------------------------------------------
create table public.meeting_audio (
  id          uuid        primary key default gen_random_uuid(),
  company_id  uuid        not null references public.companies(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  meeting_id  uuid        not null references public.meetings(id) on delete cascade,

  -- 회의 시작으로부터 몇 밀리초 지점인가. 0 이면 회의 전체 녹음
  at_ms       integer     not null default 0,
  reason      text        not null
              check (reason in ('받아쓰기 실패', '안전망')),
  path        text        not null unique,
  bytes       integer     not null default 0,
  mime        text,

  created_at  timestamptz not null default now()
);

create index meeting_audio_meeting_idx on public.meeting_audio (meeting_id, at_ms);

alter table public.meeting_audio enable row level security;

create policy own_meeting_audio on public.meeting_audio
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

comment on table public.meeting_audio is
  '받아쓰지 못한 회의 소리. 글로 바꾸면 파일과 함께 지운다';

-- ------------------------------------------------------------
-- 3. 공개 정책 — 두말할 것 없이 인용 불가
-- ------------------------------------------------------------
insert into public.disclosure_policy
  (table_name, learn_allowed, quote_allowed, condition, reason)
values
  ('meeting_audio', false, '불가', null,
   '회의 소리 원본. 목소리·말투가 그대로 남는다. 학습에도 쓰지 않는다')
on conflict (table_name) do nothing;
