// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getProvider } from '../_shared/provider/index.ts'
import { metered } from '../_shared/usage.ts'
import type { ChatMessage, Provider } from '../_shared/provider/index.ts'
import {
  ASK_RULES,
  ASK_RULES_WEB,
  CHECKLIST_RULES,
  FOCUS_REMINDER,
  MINE_PART_NOTE,
  MINE_RULES,
  MINUTES_AREA_NOTE,
  MINUTES_PART_NOTE,
  MINUTES_RULES,
} from './prompt.ts'

/**
 * AI 업무 비서 — 브라우저와 AI 공급자 사이에 서는 유일한 자리.
 *
 * 왜 여기를 거치나 — **AI 열쇠가 여기에만 있기 때문이다.**
 * 브라우저에 넣으면 화면 소스를 여는 누구나 그 열쇠로 요금을 쓴다.
 *
 * 자료를 브라우저에서 받지 않고 **여기서 DB 를 다시 읽는다.**
 * 브라우저가 보낸 걸 그대로 믿으면 남의 업무 내용을 밀어 넣을 수 있다.
 * 호출한 사람의 로그인 표를 그대로 써서 읽으므로, 본인 것만 읽힌다.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: '로그인이 필요합니다.' }, 401)

    // 호출한 사람의 자격으로 읽는다 → RLS 가 그대로 걸린다
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    )

    const { data: userData } = await db.auth.getUser()
    if (!userData?.user) return json({ error: '로그인 정보를 확인하지 못했습니다.' }, 401)

    const body = await req.json().catch(() => null)
    const mode: string = body?.mode
    const taskId: string = body?.taskId
    if (mode !== '질문' && mode !== '체크리스트' && mode !== '회의록' && mode !== '채굴') {
      return json(
        { error: '모드는 「질문」·「체크리스트」·「채굴」·「회의록」 중 하나여야 합니다.' },
        400,
      )
    }

    /*
      ★ AI 사용량 기록 — **공급자를 감싸서** 붙인다 (_shared/usage.ts).

      부르는 쪽마다 기록 코드를 붙이면 언젠가 한 곳을 빠뜨린다. 이 저장소는
      그걸 두 번 겪었다(8/19 걸러내기, 9/8 구간 나누기). AI 를 부르는 길은
      `provider.chat()` 하나뿐이므로 **그것만 감싸면 빠져나갈 구멍이 없다.**
      새 기능을 붙이는 사람이 usage.ts 를 몰라도 기록은 남는다.

      `mode` 를 그대로 「어느 기능이 썼나」로 남긴다 — 이름을 두 벌로 부르면
      반드시 어긋난다.
    */
    const provider = metered(getProvider(), db, userData.user.id, mode)

    /**
     * 회의 관련 두 모드(채굴 · 회의록)만 자료를 **브라우저에서 받는다.**
     *
     * 다른 모드는 DB 를 여기서 다시 읽는다 — 브라우저가 보낸 걸 믿으면
     * 남의 업무 내용을 밀어 넣을 수 있기 때문이다. 회의록은 사정이 다르다.
     * 방금 받아쓴 글은 **아직 어디에도 저장돼 있지 않다.** 저장부터 하게 하면
     * 민감 회의(전사문을 저장하지 않는다 — 설계서 §5.8)에서 앞뒤가 맞지 않는다.
     *
     * 밀어 넣어도 새는 것이 없다 — 자기가 방금 말한 것을 자기가 요약받을 뿐이다.
     */
    if (mode === '채굴') return await mine(body, provider)
    if (mode === '회의록') return await minutes(body, provider)

    if (!taskId) return json({ error: '어느 업무인지가 없습니다.' }, 400)

    const ctx = await buildContext(db, taskId, body?.attachmentIds ?? null)
    if (!ctx) return json({ error: '그 업무를 찾지 못했습니다.' }, 404)

    /**
     * 웹 검색은 **질문일 때만, 그리고 사용자가 켰을 때만** 켠다.
     *
     * 체크리스트 뽑기에는 안 켠다 — 그건 이 업무의 자료에서 할 일을 추리는 일이라
     * 인터넷이 끼어들면 일반론("계획을 세운다")이 섞인다.
     *
     * ⚠️ 켜면 질문 글이 밖으로 나간다. 그래서 기본이 꺼짐이고 화면에서 켠다 —
     *    「밖으로 나가는 것은 사용자가 누른 것뿐」(CLAUDE.md).
     */
    const webSearch = mode === '질문' && body?.webSearch === true

    const messages: ChatMessage[] =
      mode === '질문'
        ? [
            { role: 'system', content: webSearch ? ASK_RULES_WEB : ASK_RULES },
            { role: 'system', content: ctx.text },
            ...history(body?.history),
            {
              role: 'user',
              // 지킬 것을 **질문 바로 옆에** 한 번 더 붙인다.
              // 맨 위 규칙만으로는 안 들었다 — 그 사이에 첨부파일 수만 자가 끼어 묽어진다.
              content: String(body?.question ?? '').slice(0, 4000) + FOCUS_REMINDER,
            },
          ]
        : [
            { role: 'system', content: CHECKLIST_RULES },
            { role: 'system', content: ctx.text },
            {
              role: 'user',
              content:
                '위 자료를 근거로 이 업무의 체크리스트 초안을 뽑아 주세요.' +
                (body?.hint ? `\n특히 이 점을 봐 주세요: ${String(body.hint).slice(0, 500)}` : ''),
            },
          ]

    // 한도를 따로 주지 않는다 — 추론형 모델은 생각 토큰까지 이 한도에 들어가서
    // 짜게 잡으면 답이 통째로 비어 온다. 어댑터의 기본값(넉넉함)을 그대로 쓴다.
    const result = await provider.chat(messages, { light: mode === '체크리스트', webSearch })

    return json({
      mode,
      text: result.text,
      items: mode === '체크리스트' ? parseChecklist(result.text) : undefined,
      sources: ctx.sources,
      webSources: result.webSources,
      model: result.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
    })
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

/** 전사문 길이 상한. 1시간 회의가 대략 2만 자다. 2시간까지 받는다 */
const TRANSCRIPT_MAX = 40_000

/**
 * 회의에 딸려 오는 머리말 — 제목 · 참석 · 미리 정한 안건 · 사용자 메모.
 *
 * 채굴(1걸음)과 회의록(2걸음)이 **똑같이** 쓴다. 두 군데에 따로 적어 두었더니
 * 한쪽만 고치는 일이 생긴다. 한 곳으로 모은다.
 *
 * `myNotes`(회의 중 사용자가 직접 적은 메모)는 **첫 구간에만** 붙는다 —
 * 구간마다 붙이면 같은 메모가 여러 번 캐내져 회의록에 중복으로 남는다.
 */
function meetingHead(body: any): string {
  return [
    body?.title ? `회의 제목: ${String(body.title).slice(0, 200)}` : null,
    body?.attendees ? `참석: ${String(body.attendees).slice(0, 300)}` : null,
    body?.agenda ? `미리 정한 안건: ${String(body.agenda).slice(0, 500)}` : null,
    body?.myNotes
      ? `회의 중 사용자가 직접 적은 메모:\n${String(body.myNotes).slice(0, 2000)}`
      : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * 사내 용어집 — 이번 회의에 나온 것만 화면이 골라 보낸다 (설계서 §5.8).
 * 「타이백」으로 받아써져도 회의록에는 「타이벡」으로 적히게 하는 자리다.
 *
 * **채굴(1걸음)에서 고쳐 적히는 것이 원칙**이다. 2걸음에도 붙여 두는 이유는,
 * 1걸음이 놓친 표기를 마지막으로 한 번 더 걸러 주기 때문이다.
 */
function glossaryNote(body: any): string {
  const glossary: { term: string; means: string }[] = Array.isArray(body?.glossary)
    ? body.glossary
        .filter((g: any) => g && typeof g.term === 'string' && typeof g.means === 'string')
        .slice(0, 60)
    : []
  if (glossary.length === 0) return ''
  return (
    `\n\n## 사내 용어집 (이 회의에 나온 것)\n` +
    glossary.map((g) => `- ${g.term}: ${g.means}`).join('\n') +
    `\n소리가 비슷하게 받아써진 대목은 이 표기로 고쳐 적고, 확신이 없으면 「확인 필요」에 적으세요.`
  )
}

/** 넘어온 용어집 개수 — 근거 표시에만 쓴다 */
function glossaryCount(body: any): number {
  return Array.isArray(body?.glossary) ? Math.min(body.glossary.length, 60) : 0
}

/**
 * ★ 1걸음 「채굴」 — 받아쓴 글에서 사실만 캐낸다. 요약하지 않는다.
 *
 * ── 왜 이 걸음이 생겼나 (2026-09-08) ────────────────────
 * 전에는 받아쓴 글 → 회의록을 한 번에 시켰다. 그랬더니 회의록이 제목 목록처럼
 * 얇게 나왔다. 「줄여라」와 「구성해라」를 동시에 시키면 **줄이는 쪽이 이긴다** —
 * 줄이라는 지시는 문장마다 바로 적용되고, 구성하라는 지시는 다 읽은 뒤에야
 * 쓸 수 있기 때문이다. 그래서 숫자의 산출근거·버린 안·막힌 사유가 먼저 잘렸다.
 *
 * 이 걸음의 결과는 **사람이 읽지 않는다.** 2걸음의 재료다.
 * 그래서 형식을 파싱하지 않고 글 그대로 돌려준다 — 2걸음에 그대로 넘어간다.
 */
async function mine(body: any, provider: Provider) {
  const transcript = String(body?.transcript ?? '').trim()
  if (!transcript) return json({ error: '받아쓴 글이 없습니다.' }, 400)

  const part = Number(body?.part ?? 0)
  const parts = Number(body?.parts ?? 0)
  const partNote = parts > 1 && part > 0 ? MINE_PART_NOTE(part, parts) : ''

  const result = await provider.chat(
    [
      { role: 'system', content: MINE_RULES },
      {
        role: 'user',
        content:
          `${meetingHead(body)}${glossaryNote(body)}\n\n## 받아쓴 글\n` +
          transcript.slice(0, TRANSCRIPT_MAX) +
          // 구간 안내는 **받아쓴 글 뒤**에 붙인다. 앞에 두면 긴 글을 사이에 두고
          // 멀어져 묽어진다 — T-01 에서 겪었다.
          partNote +
          '\n\n위 글에서 사실을 캐내 주세요. 요약하지 마세요.',
      },
    ],
    {},
  )

  return json({
    mode: '채굴',
    text: result.text,
    model: result.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    truncated: transcript.length > TRANSCRIPT_MAX,
  })
}

/**
 * ★ 2걸음 「구성」 — 캐낸 사실 메모를 회사 양식으로 짠다.
 *
 * ── 무엇이 넘어오나 ──────────────────────────────────────
 * `mined` — 1걸음(채굴)이 구간별로 캐낸 것을 화면이 **하나로 이어 붙인 글**.
 * 그래서 이 걸음은 **회의 전체를 한 번에 본다.** 전에는 구간마다 회의록을
 * 만들어 합쳤기 때문에, 한 안건이 두 구간에 걸치면 앞 구간의 「현재상황」과
 * 뒤 구간의 「결론」이 따로 놀았다. 그 문제가 여기서 사라진다.
 *
 * `transcript` 는 **뒷걸음질용**이다 — 1걸음이 실패했을 때 화면이 받아쓴 글을
 * 그대로 넘겨 예전처럼 한 번에 만든다. AI 가 죽어도 기록은 남아야 하듯,
 * 한 걸음이 죽어도 회의록은 나와야 한다.
 *
 * 나눈 결과를 여기서 파싱하지 않고 **글 그대로 돌려준다.** 나누는 일은
 * `domain/minutes.ts` 가 한다 — 그래야 브라우저·AI 없이 시험할 수 있고,
 * 형식이 어긋나 못 나눴을 때 화면이 원문을 그대로 보여 줄 수 있다.
 */
async function minutes(body: any, provider: Provider) {
  const mined = String(body?.mined ?? '').trim()
  const transcript = String(body?.transcript ?? '').trim()
  const source = mined || transcript
  if (!source) return json({ error: '회의록으로 만들 글이 없습니다.' }, 400)

  /*
    캐낸 메모로 짤 때와 받아쓴 글로 바로 짤 때는 **머리말이 달라야 한다.**
    2걸음 규칙은 "넘어오는 것은 캐낸 사실 메모"라고 말하고 있으므로,
    뒷걸음질일 때 그대로 두면 받아쓴 글을 메모로 착각하고 또 줄인다.
  */
  const bodyLabel = mined
    ? '## 캐낸 사실 메모 (이 회의에서 나온 것 전부)'
    : '## 받아쓴 글 (사실 메모를 만들지 못해 원문을 그대로 넘깁니다)'

  /**
   * 캐낸 메모마저 한 번에 못 넘길 만큼 길 때만 구간이 갈린다.
   * 보통은 갈리지 않는다 — 채굴 결과는 받아쓴 글의 1/4~1/3 이다.
   */
  const part = Number(body?.part ?? 0)
  const parts = Number(body?.parts ?? 0)
  const partNote = parts > 1 && part > 0 ? MINUTES_PART_NOTE(part, parts) : ''

  /**
   * 업무 분류 목록. 화면이 「기준 › 설정 › 업무영역」에서 읽어 보낸다.
   * 없으면 분류를 요구하지 않는다 — 고를 것이 없으면 AI 는 지어낸다.
   */
  const areas: string[] = Array.isArray(body?.areas)
    ? body.areas.filter((a: unknown) => typeof a === 'string' && a.trim()).slice(0, 30)
    : []
  const areaNote = areas.length > 0 ? MINUTES_AREA_NOTE(areas) : ''

  const result = await provider.chat(
    [
      { role: 'system', content: MINUTES_RULES },
      {
        role: 'user',
        content:
          `${meetingHead(body)}${glossaryNote(body)}\n\n${bodyLabel}\n` +
          source.slice(0, TRANSCRIPT_MAX) +
          // ⚠️ 구간 안내와 분류 목록은 **글 뒤**에 붙인다.
          //    앞(규칙)에 두면 긴 글을 사이에 두고 멀어져 묽어진다 — T-01 에서 겪었다.
          //
          //    이 두 줄이 통째로 빠져 있었다(2026-08-18 발견). 값은 만들어 두고
          //    메시지에 넣지 않아, 분류 규칙과 구간 안내가 AI 에게 한 번도 간 적이 없다.
          //    「프롬프트를 써 놓는다고 지켜지지 않는다」보다 앞선 문제 —
          //    **보내지 않으면 애초에 지킬 것도 없다.**
          partNote +
          areaNote +
          '\n\n위 글로 회의록 초안을 만들어 주세요. 나온 만큼 남기세요.',
      },
    ],
    {},
  )

  const terms = glossaryCount(body)
  return json({
    mode: '회의록',
    text: result.text,
    sources: [
      mined
        ? { kind: '사실 메모', label: `받아쓴 글에서 캐낸 사실 ${mined.length.toLocaleString()}자` }
        : { kind: '전사문', label: `이번 회의 받아쓴 글 ${transcript.length.toLocaleString()}자` },
      ...(terms ? [{ kind: '용어집', label: `사내 용어 ${terms}개` }] : []),
    ],
    model: result.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    truncated: source.length > TRANSCRIPT_MAX,
  })
}

/**
 * AI 에게 넘길 자료를 모은다.
 *
 * 이 업무 하나에 붙은 것만 넘긴다 — 다른 업무·다른 절차는 넘기지 않는다.
 * "이 건에 3주 썼다"가 엉뚱한 자리에서 새어 나가지 않게 하는 가장 단순한 방법이다.
 */
async function buildContext(db: any, taskId: string, only: string[] | null) {
  const { data: task } = await db
    .from('tasks')
    .select('id, title, detail, notes, area, status, priority, due_date, start_date, source, requester')
    .eq('id', taskId)
    .maybeSingle()
  if (!task) return null

  const { data: checklist } = await db
    .from('checklist')
    .select('label, done')
    .eq('task_id', taskId)
    .order('sort_order')

  let q = db
    .from('attachments')
    .select('id, name, extracted_text, extract_status, extract_note')
    .eq('task_id', taskId)
  if (only && only.length > 0) q = q.in('id', only)
  const { data: files } = await q

  const sources: { kind: string; label: string }[] = []
  const parts: string[] = ['[참고 자료]']

  parts.push(
    `## 업무\n제목: ${task.title}\n영역: ${task.area ?? '—'}\n상태: ${task.status}\n` +
      `중요도: ${task.priority}\n기한: ${task.due_date ?? '없음'}\n출처: ${task.source}` +
      (task.requester ? `\n요청자: ${task.requester}` : ''),
  )
  sources.push({ kind: '업무', label: task.title })

  if (task.detail?.trim()) {
    parts.push(`## 상세 (이 일이 무엇인가)\n${task.detail}`)
    sources.push({ kind: '상세', label: '업무 상세' })
  }
  if (task.notes?.trim()) {
    parts.push(`## 작업 메모 (하면서 알게 된 것)\n${task.notes}`)
    sources.push({ kind: '메모', label: '작업 메모' })
  }
  if (checklist?.length) {
    parts.push(
      '## 이미 있는 체크리스트\n' +
        checklist.map((c: any) => `- [${c.done ? 'x' : ' '}] ${c.label}`).join('\n'),
    )
    sources.push({ kind: '체크리스트', label: `${checklist.length}개 항목` })
  }

  for (const f of files ?? []) {
    if (f.extract_status === '성공' && f.extracted_text) {
      parts.push(`## 첨부파일: ${f.name}\n${f.extracted_text}`)
      sources.push({ kind: '첨부', label: f.name })
    } else {
      // 못 읽은 파일도 알려 준다. 안 알려 주면 AI 가 "파일에 없습니다"라고 단정한다
      parts.push(`## 첨부파일: ${f.name}\n(읽지 못한 파일입니다 — ${f.extract_note ?? '이유 미상'})`)
    }
  }

  return { text: parts.join('\n\n'), sources }
}

/** 이어지는 대화. 너무 길면 앞을 자른다 — 비용과 정확도 둘 다 나빠진다 */
function history(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-8)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }))
}

/**
 * 「항목: … / 근거: …」 형태를 줄로 자른다.
 *
 * 형식이 어긋나도 죽지 않는다. 못 알아들으면 빈 배열을 돌려주고,
 * 화면은 원문을 그대로 보여 준다 — 사람이 읽고 손으로 담으면 된다.
 */
function parseChecklist(text: string): { label: string; why: string | null }[] {
  const out: { label: string; why: string | null }[] = []
  let current: { label: string; why: string | null } | null = null

  for (const line of text.split('\n')) {
    const item = line.match(/^\s*(?:항목|item)\s*[:：]\s*(.+)$/i)
    const why = line.match(/^\s*(?:근거|source)\s*[:：]\s*(.+)$/i)
    if (item) {
      if (current) out.push(current)
      current = { label: item[1].trim().slice(0, 200), why: null }
    } else if (why && current) {
      current.why = why[1].trim().slice(0, 300)
    }
  }
  if (current) out.push(current)
  return out.filter((i) => i.label.length > 0)
}
