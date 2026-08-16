import { supabase } from '../../lib/supabase'
import type { Json } from '../../lib/database.types'
import { readFunctionError } from '../assistant/api'
import type { Source } from '../assistant/api'
import type { GlossaryPair, Minutes } from '../../domain/transcript'

/**
 * 실시간 회의록이 밖과 주고받는 것.
 *
 * 두 가지뿐이다 — AI 에게 초안을 부탁하는 것, 그리고 회의록을 저장하는 것.
 */

export type MinutesReply = {
  /** AI 가 준 글 원본. 형식이 어긋나 못 나눴을 때 화면이 이걸 그대로 보여 준다 */
  text: string
  sources: Source[]
  model: string
  tokensIn: number | null
  tokensOut: number | null
  /** 회의가 너무 길어 뒷부분을 잘랐나 */
  truncated?: boolean
}

/**
 * 받아쓴 글로 회의록 초안을 부탁한다.
 *
 * ⚠️ 저장하지 않은 글을 그대로 보낸다. 다른 AI 기능은 함수가 DB 를 다시 읽지만
 *    이건 아직 어디에도 저장돼 있지 않기 때문이다 (민감 회의는 저장 자체를 안 한다).
 */
export async function callMinutes(payload: {
  transcript: string
  title?: string
  attendees?: string
  agenda?: string
  myNotes?: string
  glossary?: GlossaryPair[]
}): Promise<MinutesReply> {
  const { data, error } = await supabase.functions.invoke('ai-assist', {
    body: { mode: '회의록', ...payload },
  })
  if (error) {
    const detail = await readFunctionError(error)
    throw new Error(detail ?? error.message)
  }
  if (data?.error) throw new Error(String(data.error))
  return data as MinutesReply
}

/**
 * 녹음 토막 하나를 글로 바꾼다.
 *
 * 브라우저가 아니라 **서버가 받아쓴다.** 브라우저는 녹음만 하므로
 * 폰·태블릿을 가리지 않는다 (브라우저 내장 받아쓰기는 폰에서 잘 안 됐다).
 *
 * @param hint 이 회의에 나올 사내 용어. 미리 알려 주면 그 표기로 적힌다
 */
export async function transcribeChunk(blob: Blob, hint?: string): Promise<string> {
  // 몰려서 거절당하는 것은 **기다리면 풀린다.** 두 번까지 스스로 다시 해 본다.
  // 여기서 포기하면 그 45초 동안 한 말이 통째로 사라진다
  const waits = [4_000, 12_000]

  for (let attempt = 0; ; attempt++) {
    const form = new FormData()
    form.append('file', blob, 'chunk')
    if (hint) form.append('hint', hint)

    const { data, error } = await supabase.functions.invoke('transcribe', { body: form })

    if (!error && !data?.error) return String(data?.text ?? '')

    const failure = error ? await readFailure(error) : { error: String(data.error), retryable: false }
    if (failure.retryable && attempt < waits.length) {
      await new Promise((r) => setTimeout(r, waits[attempt]))
      continue
    }
    throw new Error(failure.error)
  }
}

/** 함수가 돌려준 본문을 통째로 읽는다 — 「다시 해도 되는 실패인가」가 거기 들어 있다 */
async function readFailure(error: unknown): Promise<{ error: string; retryable: boolean }> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (typeof body?.error === 'string') {
        return { error: body.error, retryable: body.retryable === true }
      }
    } catch {
      // 본문을 못 읽으면 아래로
    }
  }
  return { error: (error as Error).message, retryable: false }
}

export type SaveLiveMeetingInput = {
  companyId: string
  met_on: string
  title: string
  place: string
  attendees: string
  /** 사람이 고친 확정본 */
  agenda: string
  decisions: string
  transcript: string
  myNotes: string
  durationSec: number
  /** AI 초안 원본. 확정본과 둘 다 남긴다 — 그 차이가 학습 신호다 */
  aiDraft: { text: string; minutes: Minutes; model: string } | null
  /** 「인박스로」 체크한 것만 담겨 온다 */
  followUps: string[]
  /**
   * 민감 회의(회생·인사) 표시.
   *
   * 지금은 **막지 않는다** — 일반 회의와 같은 길로 간다 (사용자 판단, 2026-08-16).
   * 그래도 표시는 남긴다. 나중에 정책을 다시 세울 때 이 표시가 없으면
   * 쌓인 회의록을 전부 뒤져야 한다.
   */
  sensitive: boolean
  /** 어느 길로 받아썼나 — 나중에 두 길의 정확도를 비교하려면 남겨야 한다 */
  source: '실시간받아쓰기' | '녹음전사'
}

/**
 * 회의록을 저장하고, 체크한 할 일을 인박스로 보낸다.
 *
 * 할 일을 바로 업무로 만들지 않는다 — 인박스를 거친다.
 * 회의에서 나온 말이 전부 업무가 되지는 않기 때문이다 (설계서 §5.4).
 */
export async function saveLiveMeeting(v: SaveLiveMeetingInput): Promise<string> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')

  const { data: meeting, error } = await supabase
    .from('meetings')
    .insert({
      company_id: v.companyId,
      user_id: userId,
      met_on: v.met_on,
      title: v.title,
      place: v.place || null,
      attendees: v.attendees || null,
      agenda: v.agenda || null,
      decisions: v.decisions || null,
      transcript: v.transcript || null,
      my_notes: v.myNotes || null,
      duration_sec: v.durationSec > 0 ? Math.round(v.durationSec) : null,
      transcript_source: v.source,
      ai_draft: (v.aiDraft as unknown as Json) ?? null,
      follow_ups: v.followUps.map((text) => ({ text, task_id: null })) as unknown as Json,
      sensitive: v.sensitive,
    })
    .select('id')
    .single()
  if (error) throw error

  if (v.followUps.length > 0) {
    const { error: inboxError } = await supabase.from('inbox').insert(
      v.followUps.map((text) => ({
        company_id: v.companyId,
        user_id: userId,
        content: text,
        origin: '회의록',
        origin_ref: meeting.id,
      })),
    )
    if (inboxError) throw inboxError
  }

  return meeting.id
}

/** 사내 용어집. 「기준 › 설정」에서 관리하는 것을 그대로 읽는다 */
export async function loadGlossary(companyId: string): Promise<GlossaryPair[]> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('company_id', companyId)
    .eq('key', 'glossary')
    .maybeSingle()
  if (error) throw error

  const raw = data?.value
  if (!Array.isArray(raw)) return []
  return raw.flatMap((p) => {
    if (typeof p !== 'object' || p === null) return []
    const { term, means } = p as { term?: unknown; means?: unknown }
    return typeof term === 'string' && typeof means === 'string' ? [{ term, means }] : []
  })
}
