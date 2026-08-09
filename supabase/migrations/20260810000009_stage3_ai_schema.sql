-- ============================================================
-- 3단계 스키마 — AI 비서와 문서
--
-- 설계서 §5.10, §6.3, §6.4
--
-- ⚠️ 스키마만 먼저 만든다. 화면과 AI 호출은 아래 둘이 정해진 뒤에 붙인다.
--     OQ-08  주기적으로 하는 행정 신고가 정확히 무엇인가
--     OQ-12  어느 모델을 쓸 것인가
--
-- 스키마를 먼저 만드는 이유 — 5단계까지 만들어 둔 마이그레이션 순서에
-- 나중에 끼워 넣는 것보다 지금 자리를 잡아두는 편이 낫다.
-- 표가 비어 있어도 앱은 정상 동작한다.
-- ============================================================

-- ============================================================
-- document_templates — 문서 양식
--
-- 공지·공문·행정 신고 서류의 틀.
-- 절차에 연결하면 그 절차의 산출물이 된다.
-- ============================================================
create table public.document_templates (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references public.companies(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,

  kind          text        not null default '공지'
                check (kind in ('공지', '공문', '신고서', '보고서', '기타')),
  title         text        not null,
  body          text,                                   -- 양식 본문
  needed_input  jsonb       not null default '[]'::jsonb, -- 필요한 입력자료
  procedure_id  uuid        references public.procedures(id) on delete set null,

  version       integer     not null default 1,
  active        boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index document_templates_company_idx on public.document_templates (company_id, kind);

create trigger document_templates_set_updated_at
  before update on public.document_templates
  for each row execute function public.set_updated_at();


-- ============================================================
-- documents — 만들어진 문서
--
-- 초안과 확정본을 **둘 다** 저장한다.
-- 그 차이가 "AI가 뭘 놓쳤나"를 알려주는 유일한 신호다.
-- 매번 같은 곳을 고치고 있으면 프롬프트나 양식이 잘못된 것이다.
--
-- 확정본이 다음 초안의 참고자료가 된다 — 열 번 쓰면 열한 번째가 좋아진다.
-- ============================================================
create table public.documents (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references public.companies(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,

  template_id   uuid        references public.document_templates(id) on delete set null,
  run_id        uuid        references public.runs(id) on delete set null,

  title         text        not null,
  draft_body    text,                                   -- AI 초안
  final_body    text,                                   -- 확정본
  status        text        not null default '초안'
                check (status in ('초안', '검토중', '확정', '발송', '폐기')),

  -- 이 초안을 만들 때 참고한 과거 확정 문서들
  referenced    jsonb       not null default '[]'::jsonb,

  finalized_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index documents_company_idx on public.documents (company_id, created_at desc);
create index documents_run_idx     on public.documents (run_id);
create index documents_final_idx   on public.documents (company_id, template_id)
  where status in ('확정', '발송');

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();


-- ============================================================
-- assistant_threads — AI 업무 비서와 오간 기록
--
-- 연결 대상이 있으면 그 업무·절차·회차가 대화의 근거로 들어간다.
-- ============================================================
create table public.assistant_threads (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references public.companies(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,

  title         text,
  task_id       uuid        references public.tasks(id) on delete set null,
  procedure_id  uuid        references public.procedures(id) on delete set null,
  run_id        uuid        references public.runs(id) on delete set null,

  status        text        not null default '진행'
                check (status in ('진행', '보관')),

  started_at    timestamptz not null default now(),
  last_at       timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index assistant_threads_company_idx on public.assistant_threads (company_id, last_at desc);
create index assistant_threads_task_idx    on public.assistant_threads (task_id);

create trigger assistant_threads_set_updated_at
  before update on public.assistant_threads
  for each row execute function public.set_updated_at();


-- ============================================================
-- assistant_messages — 대화 한 줄
--
-- sources — AI가 어느 절차·실행이력·문서를 보고 한 말인지.
--   근거가 없으면 사용자가 믿을 수 없다. 화면에 출처를 표시하는 데 쓰고,
--   답이 틀렸을 때 원인을 찾는 데도 쓴다.
--
-- reflected — 이 대화에서 나온 내용이 절차로 승격됐나.
--   이 표시가 붙은 메시지를 세면 "대화가 실제로 지식이 됐는가"를 알 수 있다.
--
-- tokens_in/out — 비용 추적. 챗봇이 사용량의 대부분을 차지한다.
-- ============================================================
create table public.assistant_messages (
  id             uuid        primary key default gen_random_uuid(),
  company_id     uuid        not null references public.companies(id) on delete cascade,
  user_id        uuid        not null references auth.users(id) on delete cascade,
  thread_id      uuid        not null references public.assistant_threads(id) on delete cascade,

  role           text        not null check (role in ('사람', 'AI')),
  content        text        not null,
  sources        jsonb       not null default '[]'::jsonb,

  reflected      boolean     not null default false,
  reflected_step_id uuid     references public.procedure_steps(id) on delete set null,

  tokens_in      integer,
  tokens_out     integer,

  created_at     timestamptz not null default now()
);

create index assistant_messages_thread_idx on public.assistant_messages (thread_id, created_at);


-- RLS — 1단계와 같은 규칙
alter table public.document_templates enable row level security;
alter table public.documents          enable row level security;
alter table public.assistant_threads  enable row level security;
alter table public.assistant_messages enable row level security;

create policy own_document_templates on public.document_templates
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy own_documents on public.documents
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy own_assistant_threads on public.assistant_threads
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy own_assistant_messages on public.assistant_messages
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);


-- ============================================================
-- 공개 정책 보강 — 3단계 표들이 실제로 생겼으므로 확인해 둔다
-- (이미 1단계 시드에 들어가 있다. 빠진 것만 채운다)
-- ============================================================
insert into public.disclosure_policy
  (table_name, learn_allowed, quote_allowed, condition, reason)
values
  ('periodic_reports', true, '조건부', '사용자가 확정한 것만', '성과평가 자료')
on conflict (table_name) do nothing;
