// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { getProvider } from '../_shared/provider/index.ts'
import type { ChatMessage } from '../_shared/provider/index.ts'
import {
  ASK_RULES,
  ASK_RULES_WEB,
  CHECKLIST_RULES,
  FOCUS_REMINDER,
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
    if (mode !== '질문' && mode !== '체크리스트' && mode !== '회의록') {
      return json({ error: '모드는 「질문」·「체크리스트」·「회의록」 중 하나여야 합니다.' }, 400)
    }

    /**
     * 회의록만 자료를 **브라우저에서 받는다.**
     *
     * 다른 모드는 DB 를 여기서 다시 읽는다 — 브라우저가 보낸 걸 믿으면
     * 남의 업무 내용을 밀어 넣을 수 있기 때문이다. 회의록은 사정이 다르다.
     * 방금 받아쓴 글은 **아직 어디에도 저장돼 있지 않다.** 저장부터 하게 하면
     * 민감 회의(전사문을 저장하지 않는다 — 설계서 §5.8)에서 앞뒤가 맞지 않는다.
     *
     * 밀어 넣어도 새는 것이 없다 — 자기가 방금 말한 것을 자기가 요약받을 뿐이다.
     */
    if (mode === '회의록') return await minutes(body)

    if (!taskId) return json({ error: '어느 업무인지가 없습니다.' }, 400)

    const ctx = await buildContext(db, taskId, body?.attachmentIds ?? null)
    if (!ctx) return json({ error: '그 업무를 찾지 못했습니다.' }, 404)

    const provider = getProvider()

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
 * 회의록 초안 — 받아쓴 글을 네 칸으로 정리한다.
 *
 * 나눈 결과(요약·결정·할 일·확인 필요)를 여기서 파싱하지 않고 **글 그대로 돌려준다.**
 * 나누는 일은 `domain/transcript.ts` 가 한다 — 그래야 브라우저·AI 없이 시험할 수 있고,
 * 형식이 어긋나 못 나눴을 때 화면이 원문을 그대로 보여 줄 수 있다.
 */
async function minutes(body: any) {
  const transcript = String(body?.transcript ?? '').trim()
  if (!transcript) return json({ error: '받아쓴 글이 없습니다.' }, 400)

  const glossary: { term: string; means: string }[] = Array.isArray(body?.glossary)
    ? body.glossary
        .filter((g: any) => g && typeof g.term === 'string' && typeof g.means === 'string')
        .slice(0, 60)
    : []

  const head = [
    body?.title ? `회의 제목: ${String(body.title).slice(0, 200)}` : null,
    body?.attendees ? `참석: ${String(body.attendees).slice(0, 300)}` : null,
    body?.agenda ? `미리 정한 안건: ${String(body.agenda).slice(0, 500)}` : null,
    body?.myNotes ? `회의 중 사용자가 직접 적은 메모:\n${String(body.myNotes).slice(0, 2000)}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  /**
   * 사내 용어집 — 이번 회의에 나온 것만 화면이 골라 보낸다 (설계서 §5.8).
   * 「타이백」으로 받아써져도 회의록에는 「타이벡」으로 적히게 하는 자리다.
   */
  const terms = glossary.length
    ? `\n\n## 사내 용어집 (이 회의에 나온 것)\n` +
      glossary.map((g) => `- ${g.term}: ${g.means}`).join('\n') +
      `\n소리가 비슷하게 받아써진 대목은 이 표기로 고쳐 적고, 확신이 없으면 「확인 필요」에 적으세요.`
    : ''

  /**
   * 긴 회의는 화면이 구간으로 잘라 보낸다. 몇 번째 구간인지 알려 줘야
   * AI 가 그 구간만 보고 「목적」이나 「다음 회의」를 단정하지 않는다.
   */
  const part = Number(body?.part ?? 0)
  const parts = Number(body?.parts ?? 0)
  const partNote = parts > 1 && part > 0 ? MINUTES_PART_NOTE(part, parts) : ''

  const provider = getProvider()
  const result = await provider.chat(
    [
      { role: 'system', content: MINUTES_RULES },
      {
        role: 'user',
        content:
          `${head}${terms}\n\n## 받아쓴 글\n` +
          transcript.slice(0, TRANSCRIPT_MAX) +
          '\n\n위 글로 회의록 초안을 만들어 주세요.',
      },
    ],
    {},
  )

  return json({
    mode: '회의록',
    text: result.text,
    sources: [
      { kind: '전사문', label: `이번 회의 받아쓴 글 ${transcript.length.toLocaleString()}자` },
      ...(glossary.length ? [{ kind: '용어집', label: `사내 용어 ${glossary.length}개` }] : []),
    ],
    model: result.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    truncated: transcript.length > TRANSCRIPT_MAX,
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
