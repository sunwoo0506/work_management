-- ============================================================
-- ai_usage — AI 를 부를 때마다 한 줄. **비용이 어디서 나가는지 알기 위해서다.**
--
-- ── 왜 필요한가 (2026-09-08) ────────────────────────────────
-- 공급자(OpenAI)의 결제 화면은 「이번 달 얼마 나갔나」를 알려 준다.
-- 그런데 **「어느 기능이 얼마 썼나」는 어디서도 알 수 없다.**
-- 「회의록 채굴이 이번 달 3만원 썼다」는 우리 코드만 아는 사실이다.
--
-- 그게 없으면 비용을 줄이려 할 때 **어디를 줄여야 할지 모른다.**
-- 총액만 보면 "많이 나가네"에서 멈춘다.
--
-- ── 왜 지금인가 ─────────────────────────────────────────────
-- 토큰 수를 이미 받고 있었는데 **챗봇 대화에만 저장**하고 있었다
-- (assistant_messages.tokens_in/out). 회의록·채굴·전사·체크리스트는
-- 공급자가 돌려준 값을 그대로 버렸다.
--
-- 하필 2026-09-08 에 회의록을 두 걸음으로 바꿔 **1.4배 비싸게** 만들었다.
-- 기록이 안 되는 쪽이었다. 그래서 이 표를 만든다.
--
-- ── 무엇을 안 담는가 ────────────────────────────────────────
-- **금액을 담지 않는다.** 단가는 공급자가 바꾸고, 넣어 두면 그때부터
-- 지난 기록이 틀린 금액을 말한다. 토큰·초 같은 **센 값**만 남기고
-- 금액은 볼 때 계산한다 (frontend/src/domain/aiUsage.ts).
--
-- **묻고 답한 내용을 담지 않는다.** 여기는 "얼마나 썼나"만 보는 자리다.
-- 대화 내용은 assistant_messages 에 있고 그건 공개 정책상 인용 불가다.
-- ============================================================
create table public.ai_usage (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,

  -- 어느 업체 일로 쓴 것인가. 업체를 고르지 않는 자리(회의록 초안 등)도
  -- 있어서 비워 둘 수 있다. 업체가 5개로 늘면 이 칸으로 갈라 본다
  company_id  uuid        references public.companies(id) on delete set null,

  -- ★ 이 표의 핵심 칸. 「어디서 나갔나」가 여기 있다.
  --   질문 · 체크리스트 · 채굴 · 회의록 · 전사
  --   ai-assist 의 mode 와 같은 말을 쓴다 — 두 벌로 부르면 반드시 어긋난다
  feature     text        not null,

  -- 실제로 부른 모델. 환경변수로 갈아끼우므로 **그때 무엇이었는지**를 남긴다.
  -- 모델을 바꾼 뒤 비용이 달라졌는지 보려면 이 칸이 있어야 한다
  model       text        not null default '',

  -- 글 부르기(chat)일 때. 전사는 비어 있다
  tokens_in   integer,
  tokens_out  integer,

  -- 소리 받아쓰기일 때 몇 초짜리였나. 전사 요금은 길이로 매겨진다.
  -- 글 부르기는 비어 있다
  audio_sec   integer,

  -- 실패한 호출도 남긴다. **실패해도 돈이 나가는 경우가 있고**,
  -- 무엇보다 "왜 이번 달 호출이 이렇게 많지"의 답이 재시도일 때가 있다
  ok          boolean     not null default true,

  created_at  timestamptz not null default now()
);

-- 「이번 달 어느 기능이 얼마」가 가장 잦은 질문이다. 그 순서로 건다
create index ai_usage_user_idx on public.ai_usage (user_id, created_at desc);
create index ai_usage_feature_idx on public.ai_usage (user_id, feature, created_at desc);

alter table public.ai_usage enable row level security;

create policy own_ai_usage on public.ai_usage
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
