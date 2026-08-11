-- ============================================================
-- 업무 첨부파일
--
-- 왜 지금 —
--   사용자가 실제로 업무를 하나 넣어 돌려보고 나온 요구다.
--   "파일을 읽고 체크리스트를 추려주거나 모르는 부분을 묻는 용도"
--   → 파일이 없으면 AI 비서가 할 일이 절반으로 준다.
--
-- 파일 실물은 Storage 에, 그 파일이 무엇인지는 여기에 둔다.
-- Storage 만 쓰면 "어느 업무의 파일인가"를 경로 문자열로 추측해야 한다.
-- ============================================================

create table public.attachments (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references public.companies(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,
  task_id       uuid        not null references public.tasks(id) on delete cascade,

  name          text        not null,            -- 사용자가 올린 원래 파일 이름
  storage_path  text        not null unique,     -- Storage 안의 자리
  mime          text,
  size_bytes    bigint,

  -- 파일에서 뽑아낸 글.
  --
  -- 왜 DB 에 두나 — AI 에게 물을 때마다 파일을 내려받아 다시 뜯으면
  -- 같은 일을 매번 한다. PDF 한 장 뜯는 데 몇 초가 걸린다.
  -- 한 번 뽑아 두면 그 뒤로는 즉시 쓴다.
  --
  -- 못 뽑는 형식(hwp·이미지·엑셀)은 null 로 남는다. 그때는 AI 가
  -- "이 파일은 못 읽습니다"라고 말해야지 아는 척하면 안 된다.
  extracted_text  text,
  extract_status  text      not null default '대기'
                  check (extract_status in ('대기', '성공', '불가', '실패')),
  extract_note    text,                          -- 왜 못 읽었나

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index attachments_task_idx    on public.attachments (task_id, created_at);
create index attachments_company_idx on public.attachments (company_id, created_at desc);

create trigger attachments_set_updated_at
  before update on public.attachments
  for each row execute function public.set_updated_at();

alter table public.attachments enable row level security;

create policy own_attachments on public.attachments
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);


-- ============================================================
-- Storage 버킷 — 파일 실물
--
-- public = false. 공개로 두면 주소를 아는 누구나 받아 간다.
-- 화면에서는 짧게 사는 서명 주소(signed URL)로 내려받는다.
--
-- 경로 규칙:  {user_id}/{task_id}/{임의문자}-{파일이름}
--   맨 앞 칸이 사용자 id 인 것이 중요하다. 아래 정책이 그 칸만 보고
--   "네 폴더냐"를 판정한다.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-files', 'task-files', false, 26214400)   -- 25MB
on conflict (id) do nothing;

create policy "task-files 내 것만 읽기" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'task-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "task-files 내 폴더에만 올리기" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'task-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "task-files 내 것만 지우기" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'task-files'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );


-- ============================================================
-- 공개 정책 — 첨부파일은 업무의 일부다
--
-- 학습에는 쓰되 AI 가 답변 근거로 **인용하면 안 된다.**
-- 업무에 붙은 파일에는 계약서·급여대장 같은 것이 들어온다.
-- ============================================================
insert into public.disclosure_policy
  (table_name, learn_allowed, quote_allowed, condition, reason)
values
  ('attachments', true, '불가', null,
   '업무에 붙은 원본 파일. 계약서·급여대장 등이 들어오므로 밖으로 인용하지 않는다')
on conflict (table_name) do nothing;
