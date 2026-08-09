-- ============================================================
-- 7단계 스키마 — 계획 · 기준 · 회의록/전화메모
--
-- 설계서 §6.8
--
-- ⚠️ `recordings`(녹음 전사)는 여기 없다.
--    전사는 브라우저가 못 한다 — 로컬에서 도는 별도 프로그램이 필요하다.
--    회의록은 「전사문을 붙여넣는」 방식으로 먼저 만든다.
--    설계서 §14 OQ-14 으로 남긴다.
-- ============================================================

-- ============================================================
-- 계획 층
-- ============================================================

-- plans — 주간·월간 계획
--
-- 리포트(periodic_reports)와 헷갈리면 안 된다.
--   plans  = 앞을 본다. 이번 주에 무엇을 할 것인가
--   reports = 뒤를 본다. 지난 주에 무엇을 했나
-- 둘을 나란히 놓으면 "계획대로 됐나"가 보인다.
create table public.plans (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references public.companies(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,

  kind          text        not null check (kind in ('주간', '월간')),
  period_from   date        not null,
  period_to     date        not null,

  goals         jsonb       not null default '[]'::jsonb,  -- [{text, done}]
  memo          text,
  retro         text,                                       -- 기간이 끝난 뒤 적는 회고

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (company_id, kind, period_from)
);

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();


-- milestones — 여러 지시사항을 아우르는 관문
--
-- 지시사항보다 위에 있는 덩어리다.
-- 예: "회생 절차 종결" 은 지시사항 여러 개가 다 끝나야 도달한다.
create table public.milestones (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references public.companies(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,

  name          text        not null,
  category      text,
  start_date    date,
  target_date   date,
  done_criteria text,                                       -- 무엇이 되면 끝난 것인가
  status        text        not null default '진행'
                check (status in ('예정', '진행', '완료', '보류')),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index milestones_company_idx on public.milestones (company_id, target_date);

create trigger milestones_set_updated_at
  before update on public.milestones
  for each row execute function public.set_updated_at();

-- 지시사항을 마일스톤에 걸 수 있게 한다
alter table public.directives
  add column milestone_id uuid references public.milestones(id) on delete set null;


-- events — 정기 미팅 · 마감
--
-- 절차의 「주기 트리거」와 다르다.
--   절차 트리거 = 내가 해야 할 일이 돌아온 시점
--   events      = 시각이 정해진 약속 (내가 안 해도 그 시각에 일어난다)
create table public.events (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references public.companies(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,

  title         text        not null,
  kind          text        not null default '정기미팅'
                check (kind in ('정기미팅', '마감', '기타')),
  at            timestamptz not null,
  repeat_rule   text,                                       -- '매주 월', '매월 25일' 등 사람이 읽는 문장
  until         date,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index events_company_idx on public.events (company_id, at);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();


-- ============================================================
-- 기준 층
-- ============================================================

-- handover — 인수인계
--
-- 「물어볼 것」이 핵심 필드다.
-- 전임자에게 물어야 하는데 아직 못 물은 것이 여기 쌓인다.
-- 이게 비어야 인수인계가 끝난 것이다.
create table public.handover (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references public.companies(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,

  category      text,
  item          text        not null,
  counterpart   text,                                       -- 역할로 적는다. 실명 금지
  to_ask        text,
  status        text        not null default '미확인'
                check (status in ('미확인', '확인중', '완료')),
  due_date      date,
  memo          text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index handover_company_idx on public.handover (company_id, status);

create trigger handover_set_updated_at
  before update on public.handover
  for each row execute function public.set_updated_at();


-- contacts — 연락처
--
-- ⚠️ 실명을 넣지 않는다. 역할·부서로 적는다.
--    저장소는 외부 서버에 올라간다 (CLAUDE.md 보안 규칙).
create table public.contacts (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references public.companies(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,

  name          text        not null,                       -- 역할 표기 권장
  dept          text,
  role          text,
  phone         text,
  email         text,
  to_ask        text,                                       -- 이 사람에게 물어볼 것

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index contacts_company_idx on public.contacts (company_id, dept);

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();


-- settings — 업체별 키-값
--
-- 업무영역 목록, 사내 용어집처럼 「바뀌긴 하는데 자주는 아닌」 것들.
-- 테이블을 따로 만들 만큼은 아니라서 키-값으로 둔다.
create table public.settings (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references public.companies(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,

  key           text        not null,
  value         jsonb       not null default '{}'::jsonb,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (company_id, key)
);

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();


-- ============================================================
-- 회의록 · 전화메모
--
-- 녹음 전사는 아직 없다 (OQ-14). 전사문을 붙여넣는 것으로 시작한다.
-- 민감 회의(회생·인사)는 sensitive 를 켜고 transcript 를 비워 둔다 — 설계서 §5.8.
-- ============================================================
create table public.meetings (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references public.companies(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,

  met_on        date        not null,
  title         text        not null,
  place         text,
  attendees     text,                                       -- 역할로 적는다
  agenda        text,
  decisions     text,
  follow_ups    jsonb       not null default '[]'::jsonb,   -- [{text, task_id}]
  transcript    text,
  sensitive     boolean     not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index meetings_company_idx on public.meetings (company_id, met_on desc);

create trigger meetings_set_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();


create table public.calls (
  id            uuid        primary key default gen_random_uuid(),
  company_id    uuid        not null references public.companies(id) on delete cascade,
  user_id       uuid        not null references auth.users(id) on delete cascade,

  called_at     timestamptz not null default now(),
  counterpart   text,                                       -- 역할로 적는다
  org           text,
  phone         text,
  direction     text        not null default '수신'
                check (direction in ('수신', '발신')),
  content       text        not null,
  action        text,
  handled       boolean     not null default false,
  task_id       uuid        references public.tasks(id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index calls_company_idx on public.calls (company_id, called_at desc);

create trigger calls_set_updated_at
  before update on public.calls
  for each row execute function public.set_updated_at();


-- ============================================================
-- RLS — 전부 본인 것만
-- ============================================================
alter table public.plans      enable row level security;
alter table public.milestones enable row level security;
alter table public.events     enable row level security;
alter table public.handover   enable row level security;
alter table public.contacts   enable row level security;
alter table public.settings   enable row level security;
alter table public.meetings   enable row level security;
alter table public.calls      enable row level security;

create policy own_plans on public.plans
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy own_milestones on public.milestones
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy own_events on public.events
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy own_handover on public.handover
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy own_contacts on public.contacts
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy own_settings on public.settings
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy own_meetings on public.meetings
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy own_calls on public.calls
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);


-- ============================================================
-- 공개 정책 — 7단계 표들을 등록한다
--
-- 기본은 「인용 불가」다. 밖으로 나가는 것은 사용자가 「공유」를 누른 것뿐이다.
-- 회의록·전화메모·연락처는 특히 민감하다.
-- ============================================================
insert into public.disclosure_policy
  (table_name, learn_allowed, quote_allowed, condition, reason)
values
  ('plans',      true, '불가', null, '내 계획은 내부용이다'),
  ('milestones', true, '불가', null, '내부 진행 상황'),
  ('events',     true, '불가', null, '내부 일정'),
  ('handover',   true, '불가', null, '인수인계 미비점이 새면 안 된다'),
  ('contacts',   true, '불가', null, '개인정보'),
  ('settings',   true, '불가', null, '내부 설정'),
  ('meetings',   true, '불가', null, '회의 내용은 참석자 합의 없이 나갈 수 없다'),
  ('calls',      true, '불가', null, '통화 내용은 상대가 공개에 동의한 적이 없다')
on conflict (table_name) do nothing;
