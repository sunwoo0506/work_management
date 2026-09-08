import { supabase } from '../../lib/supabase'
import type { Row, Update } from '../../lib/supabase'
import type { Json } from '../../lib/database.types'
import { readFunctionError } from '../assistant/api'
import type { Source } from '../assistant/api'
import type { GlossaryPair, Minutes } from '../../domain/transcript'
import type { MinutesDoc } from '../../domain/minutes'
import { mergeMinutes, parseMinutesDoc, splitTranscript } from '../../domain/minutes'
import { keepSpoken } from '../../domain/hallucination'
import { readTranscribeModel } from './transcribeModels'

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

/** 회의 두 걸음이 공통으로 넘기는 것 */
type MeetingHead = {
  title?: string
  attendees?: string
  agenda?: string
  myNotes?: string
  glossary?: GlossaryPair[]
  /** 긴 회의를 나눠 보낼 때, 이번이 몇 번째 구간인지 (1부터) */
  part?: number
  /** 전체 구간 수 */
  parts?: number
}

/**
 * ★ 1걸음 「채굴」 — 받아쓴 글에서 사실만 캐낸다. 요약하지 않는다.
 *
 * ── 왜 걸음을 나눴나 (2026-09-08) ───────────────────────
 * 전에는 받아쓴 글을 그대로 회의록으로 만들라고 한 번에 시켰다. 그랬더니
 * 회의록이 제목 목록처럼 얇았다. **「줄여라」와 「구성해라」를 동시에 시키면
 * 줄이는 쪽이 이기기 때문**이다 — 줄이라는 지시는 문장마다 바로 적용되고,
 * 구성하라는 지시는 다 읽은 뒤에야 쓸 수 있다.
 *
 * 그래서 이 걸음에서는 **줄이지 말라고만** 한다. 여기서 나온 글은 사람이
 * 읽지 않는다. 2걸음(callMinutes)의 재료다.
 */
export async function callMine(payload: MeetingHead & { transcript: string }): Promise<MinutesReply> {
  const { data, error } = await supabase.functions.invoke('ai-assist', {
    body: { mode: '채굴', ...payload },
  })
  if (error) {
    const detail = await readFunctionError(error)
    throw new Error(detail ?? error.message)
  }
  if (data?.error) throw new Error(String(data.error))
  return data as MinutesReply
}

/**
 * ★ 2걸음 「구성」 — 캐낸 사실 메모를 회사 양식으로 짠다.
 *
 * `mined` 를 넘기면 **회의 전체를 한 번에** 본다. 전에는 구간마다 회의록을
 * 만들어 합쳤기 때문에, 한 안건이 두 구간에 걸치면 앞 구간의 「현재상황」과
 * 뒤 구간의 「결론」이 따로 놀았다.
 *
 * `transcript` 만 넘기면 **예전처럼 한 번에** 만든다 — 1걸음이 실패했을 때의
 * 뒷걸음질이다. AI 가 죽어도 기록은 남아야 하듯, 한 걸음이 죽어도 회의록은 나와야 한다.
 *
 * ⚠️ 저장하지 않은 글을 그대로 보낸다. 다른 AI 기능은 함수가 DB 를 다시 읽지만
 *    이건 아직 어디에도 저장돼 있지 않기 때문이다 (민감 회의는 저장 자체를 안 한다).
 */
export async function callMinutes(
  payload: MeetingHead & {
    /** 1걸음이 캐낸 사실 메모 (구간별 결과를 이어 붙인 것) */
    mined?: string
    /** 뒷걸음질용 — 1걸음을 못 돌렸을 때의 받아쓴 글 원문 */
    transcript?: string
    /** 업무 분류 후보. 「기준 › 설정 › 업무영역」 목록을 그대로 넘긴다 */
    areas?: string[]
  },
): Promise<MinutesReply> {
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
 * 받아쓴 글 한 구간의 상한. 1시간 회의가 대략 2만 자다.
 *
 * 한 번에 다 넘기면 ① 한도에 걸리고 ② 넘어가도 **가운데가 묽어진다** —
 * 긴 글일수록 앞부분 지시를 흘린다.
 */
const PART_CHARS = 15_000

/** 지금 어느 걸음인가 — 화면이 버튼에 그대로 찍는다 */
export type MinutesProgress = { at: number; of: number; what: string }

/**
 * ★ 받아쓴 글 → 회의록 초안. **두 걸음을 여기서 다 돈다.**
 *
 * ── 왜 이 함수 하나로 모았나 ─────────────────────────────
 * 회의록 초안을 만드는 화면이 둘이다 — 지난 회의록(MeetingDetail)과
 * 실시간 회의(LiveMeeting). 전에는 **각자 부르고 있었고**, 그래서 지난 회의록
 * 화면에만 구간 나누기가 붙어 있었다. 실시간 화면은 두 시간짜리 회의도
 * 한 덩어리로 넘기고 있었다.
 *
 * 이 저장소는 같은 실수를 이미 겪었다 — 지어낸 말 걸러내기를 네 군데 중
 * 한 군데에만 붙였다가 나머지 세 길로 그대로 새어 나왔다(2026-08-19).
 * **부르는 쪽마다 붙이면 언젠가 한 곳을 빠뜨린다.** 그래서 길을 하나로 둔다.
 *
 * ── 두 걸음 ──────────────────────────────────────────────
 *   1걸음 「채굴」  구간별. **요약 금지.** 숫자·산출근거·버린 안·막힌 사유를 캐낸다
 *   2걸음 「구성」  캐낸 것을 이어 붙여 **회의 전체를 한 번에** 보고 양식으로 짠다
 *
 * 전에는 구간마다 회의록을 만들어 합쳤다. 그러면 한 안건이 구간 경계에 걸릴 때
 * 앞 구간의 「현재상황」과 뒤 구간의 「결론」이 따로 놀았다. 이제 2걸음이 전체를 본다.
 *
 * @param onStep 진행 표시. 1걸음이 길어서 아무 말이 없으면 멈춘 줄 안다
 */
export async function draftMinutes(v: {
  transcript: string
  title?: string
  attendees?: string
  agenda?: string
  myNotes?: string
  glossary?: GlossaryPair[]
  /** 업무 분류 후보. 「기준 › 설정 › 업무영역」 목록 */
  areas?: string[]
  onStep?: (p: MinutesProgress | null) => void
}): Promise<{
  doc: MinutesDoc
  /** AI 가 준 글 원본. 형식이 어긋나 못 나눴을 때 화면이 이걸 보여 준다 */
  text: string
  /** 1걸음이 캐낸 사실 메모 */
  mined: string
  model: string
  truncated?: boolean
}> {
  const transcript = v.transcript.trim()
  if (!transcript) throw new Error('받아쓴 글이 없습니다.')

  const areas = v.areas ?? []
  const head = {
    title: v.title,
    attendees: v.attendees,
    agenda: v.agenda,
    glossary: v.glossary,
  }
  const chunks = splitTranscript(transcript, PART_CHARS)
  // 걸음 수 = 채굴 구간 + 구성 1회
  const steps = chunks.length + 1

  /* ── 1걸음 「채굴」 ──────────────────────────────────── */
  const mined: string[] = []
  for (let i = 0; i < chunks.length; i++) {
    v.onStep?.({ at: i + 1, of: steps, what: '사실 캐내는 중' })
    const reply = await callMine({
      ...head,
      transcript: chunks[i],
      // 사용자가 회의 중 적은 메모는 **첫 구간에만** 붙인다.
      // 구간마다 붙이면 같은 메모가 여러 번 캐내져 회의록에 중복으로 남는다
      myNotes: i === 0 ? v.myNotes : undefined,
      part: i + 1,
      parts: chunks.length,
    })
    mined.push(reply.text)
  }
  const memo = mined.join('\n\n').trim()

  /* ── 2걸음 「구성」 ──────────────────────────────────── */
  /*
    캐낸 메모가 한 번에 안 들어갈 만큼 길 때만 갈린다. 보통은 한 덩어리다 —
    채굴 결과는 받아쓴 글의 1/4~1/3 이라 두 시간짜리 회의도 한 번에 들어간다.
    한도를 후하게 잡는 이유는 이미 걸러진 글이라 밀도가 높고,
    여기서 또 자르면 회의 전체를 보게 한 뜻이 없어지기 때문이다.
  */
  const memoChunks = splitTranscript(memo, PART_CHARS * 2)
  const texts: string[] = []
  const docs: MinutesDoc[] = []
  let model = ''
  let truncated = false

  for (let i = 0; i < memoChunks.length; i++) {
    v.onStep?.({
      at: steps,
      of: steps,
      what: memoChunks.length > 1 ? `회의록 짜는 중 ${i + 1}/${memoChunks.length}` : '회의록 짜는 중',
    })
    const reply = await callMinutes({
      ...head,
      // 1걸음이 통째로 실패해 캐낸 것이 없으면 받아쓴 글로 예전처럼 만든다.
      // AI 가 죽어도 기록은 남아야 하듯, 한 걸음이 죽어도 회의록은 나와야 한다
      ...(memo ? { mined: memoChunks[i] } : { transcript }),
      myNotes: i === 0 ? v.myNotes : undefined,
      areas,
      part: memoChunks.length > 1 ? i + 1 : 0,
      parts: memoChunks.length > 1 ? memoChunks.length : 0,
    })
    texts.push(reply.text)
    model = reply.model || model
    truncated = truncated || reply.truncated === true
    // 등록된 영역 목록을 함께 넘긴다 — 목록 밖의 분류는 여기서 비워진다.
    // AI 에게 「목록에서만 고르라」고도 하지만 규칙은 안 지켜질 수 있다
    docs.push(parseMinutesDoc(reply.text, areas))
  }

  v.onStep?.(null)
  return {
    doc: mergeMinutes(docs),
    text: texts.join('\n\n---\n\n'),
    mined: memo,
    model,
    truncated,
  }
}

/**
 * 녹음 토막 하나를 글로 바꾼다.
 *
 * 브라우저가 아니라 **서버가 받아쓴다.** 브라우저는 녹음만 하므로
 * 폰·태블릿을 가리지 않는다 (브라우저 내장 받아쓰기는 폰에서 잘 안 됐다).
 *
 * ── ★ 지어낸 말은 여기서 걸러 나간다 ─────────────────────
 * **거르는 자리를 이 함수 하나로 모았다.** 2026-08-19 에 걸러 내는 코드를
 * 만들고 **네 군데 중 한 군데에만** 붙였다가 나머지 세 길로 그대로 새어 나왔다 —
 * 실패한 토막 다시 보내기 · 녹음 파일 올리기 · 지난 회의록 다시 받아쓰기.
 *
 * 부르는 쪽마다 붙이면 **언젠가 한 곳을 빠뜨린다.** 실제로 그랬다.
 * 이제 받아쓰기를 부르는 길은 이 함수뿐이므로 **빠뜨릴 자리가 없다.**
 *
 * ── ★ 어느 모델로 받아쓸지도 여기서 붙인다 ───────────────
 * 부르는 쪽은 모델을 몰라도 된다. **안 넘기면 사용자가 화면에서 고른 값**을
 * 여기서 읽어 붙인다 (transcribeModels.ts). 거르는 자리를 하나로 모은 것과
 * 같은 이유다 — 네 길 중 한 곳에만 붙이면 나머지 세 길이 옛 모델로 돈다.
 *
 * @param hint 이 회의에 나올 사내 용어. 미리 알려 주면 그 표기로 적힌다
 * @param model 이번만 다른 모델로 받아쓰고 싶을 때. 안 주면 화면에서 고른 값
 */
export async function transcribeChunk(
  blob: Blob,
  hint?: string,
  model?: string,
): Promise<string> {
  const use = model || readTranscribeModel()

  /*
    몰려서 거절당하는 것은 **기다리면 풀린다.** 두 번까지 스스로 다시 해 본다.
    여기서 포기하면 그 토막 동안 한 말이 통째로 사라진다.

    ⚠️ 아래는 **짐작한 시간**이다. 공급자가 「몇 초 뒤에 오라」고 말해 주면
       그 말을 따른다 — 구글이 「46초 뒤」라고 한 적이 있는데, 짐작으로 4초·12초만
       기다리고 포기했다 (2026-09-05).
  */
  const waits = [4_000, 12_000]

  for (let attempt = 0; ; attempt++) {
    const form = new FormData()
    form.append('file', blob, 'chunk')
    if (hint) form.append('hint', hint)
    form.append('model', use)

    const { data, error } = await supabase.functions.invoke('transcribe', { body: form })

    if (!error && !data?.error) {
      // 확신도가 낮은 토막을 떨어내고 남은 글만 돌려준다.
      // 서버가 숫자를 안 주면(옛 판) 낱말 목록으로만 거른다
      return keepSpoken(String(data?.text ?? ''), data?.segments ?? null)
    }

    const failure = error ? await readFailure(error) : { error: String(data.error), retryable: false }
    if (failure.retryable && attempt < waits.length) {
      // 공급자가 말해 준 시간이 있으면 그걸 따른다. 없으면 짐작한 시간
      const wait = Math.max(failure.retryAfterMs ?? 0, waits[attempt])
      await new Promise((r) => setTimeout(r, wait))
      continue
    }
    throw new Error(failure.error)
  }
}

type Failure = { error: string; retryable: boolean; retryAfterMs?: number }

/** 함수가 돌려준 본문을 통째로 읽는다 — 「다시 해도 되는 실패인가」가 거기 들어 있다 */
async function readFailure(error: unknown): Promise<Failure> {
  const ctx = (error as { context?: Response }).context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json()
      if (typeof body?.error === 'string') {
        return {
          error: body.error,
          retryable: body.retryable === true,
          // 「몇 초 뒤에 오라」를 공급자가 말해 줬으면 그대로 받는다
          retryAfterMs: typeof body.retryAfterMs === 'number' ? body.retryAfterMs : undefined,
        }
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
  /**
   * AI 초안 원본. 확정본과 둘 다 남긴다 — 그 차이가 학습 신호다.
   * `mined` 는 1걸음(채굴)이 캐낸 사실 메모다.
   *
   * ── 왜 메모까지 남기나 ───────────────────────────────────
   * 초안과 확정본을 둘 다 저장하는 것과 같은 이유다. 회의록이
   * 얇게 나왔을 때 **어느 걸음에서 잃었는지**를 이것 없이는 알 수 없다 —
   * 캐낸 메모에 있는데 회의록에 없으면 2걸음(구성)이 버린 것이고,
   * 메모에도 없으면 1걸음(채굴)이 못 들은 것이다. 고칠 프롬프트가 갈린다.
   */
  aiDraft: { text: string; minutes: Minutes; model: string; mined?: string } | null
  /**
   * 「인박스로」 체크한 것만 담겨 온다.
   *
   * `area` 는 AI 가 고른 분류다. 인박스를 거쳐 **업무의 영역으로 이어진다** —
   * 여기서 안 넘기면 부장님이 업무로 올릴 때 영역을 다시 골라야 한다.
   */
  followUps: { text: string; area?: string }[]
  /**
   * 민감 회의(회생·인사) 표시.
   *
   * 지금은 **막지 않는다** — 일반 회의와 같은 길로 간다 (사용자 판단, 2026-08-16).
   * 그래도 표시는 남긴다. 나중에 정책을 다시 세울 때 이 표시가 없으면
   * 쌓인 회의록을 전부 뒤져야 한다.
   */
  sensitive: boolean
  /**
   * 어느 길로 받아썼나 — 나중에 두 길의 정확도를 비교하려면 남겨야 한다.
   * 받아쓴 글 없이 회의록 껍데기만 만들 때는 「직접입력」이다.
   */
  source: '실시간받아쓰기' | '녹음전사' | '직접입력'
  /**
   * 회의 시작·종료 벽시계 시각 「HH:MM」.
   *
   * 실시간 받아쓰기는 **손으로 안 적어도 된다** — 이미 시간을 재고 있으니
   * 화면이 찍어서 넘긴다. 붙여넣기·직접입력은 비어 있고 나중에 손으로 채운다.
   */
  startedAt?: string | null
  endedAt?: string | null
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
      started_at: v.startedAt || null,
      ended_at: v.endedAt || null,
      transcript_source: v.source,
      ai_draft: (v.aiDraft as unknown as Json) ?? null,
      follow_ups: v.followUps.map((f) => ({
        text: f.text,
        area: f.area || null,
        task_id: null,
      })) as unknown as Json,
      sensitive: v.sensitive,
    })
    .select('id')
    .single()
  if (error) throw error

  if (v.followUps.length > 0) {
    const { error: inboxError } = await supabase.from('inbox').insert(
      v.followUps.map((f) => ({
        company_id: v.companyId,
        user_id: userId,
        content: f.text,
        // 분류를 함께 보낸다 — 지난 회의록(sendToInbox)은 원래 보내고 있었는데
        // 실시간 쪽만 빠져 있었다 (2026-08-18 발견)
        tag: f.area?.trim() || null,
        origin: '회의록',
        origin_ref: meeting.id,
      })),
    )
    if (inboxError) throw inboxError
  }

  return meeting.id
}

/**
 * 저장된 회의록을 고친다.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────
 * 처음에는 **회의 직후에만** 고칠 수 있었다. 저장하고 나면 읽기만 됐다.
 * 그런데 실제로는 이런 일이 생긴다 —
 *   ① 받아쓰기가 사람 이름을 틀렸는데 나중에 발견한다
 *   ② AI 크레딧이 떨어져서 **초안을 나중에** 만들어야 한다
 *   ③ 회의 중엔 정신없어서 나중에 정리한다
 * 저장된 것을 못 고치면 **틀린 채로 굳는다.**
 */
export async function updateMeeting(
  id: string,
  patch: {
    transcript?: string | null
    agenda?: string | null
    decisions?: string | null
    my_notes?: string | null
    aiDraft?: { text: string; minutes: Minutes; model: string; mined?: string } | null
    /** 회의록 양식 본문 (결정사항 · Action Item 등) */
    minutes?: MinutesDoc | null
    /**
     * 인박스로 보낸 Action Item 기록.
     *
     * **분류를 함께 담는다.** 예전에는 글만 담아서, 인박스에는 분류가 갔는데
     * 회의록에 남는 기록에는 안 남았다. 나중에 「이 할 일이 어느 영역이었나」를
     * 회의록만 보고는 알 수 없었다. 저장할 때(saveLiveMeeting)와 **같은 모양**이다 —
     * 같은 것을 두 모양으로 두면 한쪽만 고치게 된다.
     */
    followUps?: { text: string; area?: string }[]
  },
): Promise<void> {
  // 저장 공간이 아는 칸만 담는 그릇. 아무 이름이나 담기면 오타가 그대로 나간다
  const row: Update<'meetings'> = {}
  if (patch.transcript !== undefined) row.transcript = patch.transcript || null
  if (patch.agenda !== undefined) row.agenda = patch.agenda || null
  if (patch.decisions !== undefined) row.decisions = patch.decisions || null
  if (patch.my_notes !== undefined) row.my_notes = patch.my_notes || null
  if (patch.aiDraft !== undefined) row.ai_draft = patch.aiDraft as unknown as Json
  if (patch.minutes !== undefined) row.minutes = patch.minutes as unknown as Json
  if (patch.followUps !== undefined) {
    row.follow_ups = patch.followUps.map((f) => ({
      text: f.text,
      area: f.area || null,
      task_id: null,
    })) as unknown as Json
  }
  if (Object.keys(row).length === 0) return

  const { error } = await supabase.from('meetings').update(row).eq('id', id)
  if (error) throw error
}

/**
 * 회의에서 나온 할 일을 인박스로 보낸다. 바로 업무로 만들지 않는다 (설계서 §5.4).
 *
 * **분류(업무영역)를 태그로 함께 보낸다.** 그래야 인박스에서 업무로 올릴 때
 * 영역이 미리 골라져 있고, 리포트가 영역별로 집계될 때 회의에서 나온 일도 제자리에 들어간다.
 */
export async function sendToInbox(
  companyId: string,
  meetingId: string,
  items: { text: string; area?: string }[],
): Promise<void> {
  if (items.length === 0) return
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')

  const { error } = await supabase.from('inbox').insert(
    items.map((it) => ({
      company_id: companyId,
      user_id: userId,
      content: it.text,
      tag: it.area?.trim() || null,
      origin: '회의록',
      origin_ref: meetingId,
    })),
  )
  if (error) throw error
}

// 업무영역 목록은 여기 없다 → `features/areas/useAreaOptions.ts`
// 회의록만의 것이 아니라 업무·절차·인박스가 함께 쓰는 것이어서 밖으로 옮겼다.
// 여기 두면 업무 화면이 회의록 파일을 가져다 써야 한다.

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

// ── 받아쓰지 못한 소리 ────────────────────────────────────
//
// 브라우저 안에만 두었더니 **폰에서 녹음한 것을 노트북에서 못 봤다.**
// 회의는 폰으로 하고 정리는 앉아서 하는데 그 흐름이 막혔다. 그래서 서버에 둔다.
//
// ⚠️ 글로 바꾸면 **파일과 기록을 함께 지운다.** 소리를 오래 들고 있을 이유가 없다.

const AUDIO_BUCKET = 'meeting-audio'

export type MeetingAudio = Row<'meeting_audio'>

/** 소리를 올린다. 경로 첫 칸이 본인 아이디라 남의 것은 손도 못 댄다 */
export async function uploadMeetingAudio(input: {
  companyId: string
  meetingId: string
  atMs: number
  reason: '받아쓰기 실패' | '안전망'
  blob: Blob
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')

  const ext = input.blob.type.includes('mp4')
    ? 'm4a'
    : input.blob.type.includes('ogg')
      ? 'ogg'
      : 'webm'
  const path = `${userId}/${input.meetingId}/${input.atMs}-${Date.now()}.${ext}`

  /*
    ⚠️ 형식 이름에서 **뒤에 붙은 설명을 떼고** 올린다.

    브라우저가 만드는 소리의 형식 이름은 `audio/webm;codecs=opus` 처럼
    세미콜론 뒤에 부속 설명이 붙는다. 그런데 보관함은 허용 목록(`audio/webm` 등)과
    **글자 그대로** 맞춰 보기 때문에, 그대로 보내면 「허용되지 않은 형식」으로 거절당한다.

    실제로 이것 때문에 소리가 한 개도 안 올라갔다 (2026-08-16).
    화면에는 회의록만 저장되고 소리는 조용히 사라졌다.
  */
  const contentType = (input.blob.type || 'audio/webm').split(';')[0].trim()

  const { error: upErr } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(path, input.blob, { contentType })
  if (upErr) throw upErr

  const { error } = await supabase.from('meeting_audio').insert({
    company_id: input.companyId,
    user_id: userId,
    meeting_id: input.meetingId,
    at_ms: Math.max(0, Math.round(input.atMs)),
    reason: input.reason,
    path,
    bytes: input.blob.size,
    mime: input.blob.type || null,
  })
  if (error) {
    // 표에 못 적으면 파일만 떠돌게 된다. 올린 것을 되돌린다
    await supabase.storage.from(AUDIO_BUCKET).remove([path])
    throw error
  }
}

/** 이 회의에 딸린 소리들. 시각 순서대로 */
export async function listMeetingAudio(meetingId: string): Promise<MeetingAudio[]> {
  const { data, error } = await supabase
    .from('meeting_audio')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('at_ms')
  if (error) throw error
  return data
}

/** 소리를 내려받는다 (다시 받아쓰기·저장용) */
export async function fetchMeetingAudio(path: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(AUDIO_BUCKET).download(path)
  if (error) throw error
  return data
}

/** 파일과 기록을 함께 지운다. 하나만 지우면 반쪽이 떠돈다 */
export async function deleteMeetingAudio(row: { id: string; path: string }): Promise<void> {
  await supabase.storage.from(AUDIO_BUCKET).remove([row.path])
  const { error } = await supabase.from('meeting_audio').delete().eq('id', row.id)
  if (error) throw error
}

/**
 * 회의록을 지운다.
 *
 * ⚠️ **소리 파일을 먼저 치운다.** 표의 기록은 회의가 지워질 때 딸려 사라지지만
 *    (on delete cascade) **보관함의 파일은 그렇지 않다.** 순서를 바꾸면
 *    어느 회의 것인지 모르는 파일이 보관함에 영원히 남는다.
 */
export async function deleteMeeting(id: string): Promise<void> {
  const { data: audios } = await supabase.from('meeting_audio').select('path').eq('meeting_id', id)
  const paths = (audios ?? []).map((a) => a.path)
  if (paths.length > 0) {
    await supabase.storage.from(AUDIO_BUCKET).remove(paths)
  }

  const { error } = await supabase.from('meetings').delete().eq('id', id)
  if (error) throw error
}

/** 회의의 겉면(제목·일자·장소·참석)을 고친다 */
export async function updateMeetingHead(
  id: string,
  head: {
    met_on: string
    title: string
    place: string
    attendees: string
    writer: string
    started_at: string
    ended_at: string
  },
): Promise<void> {
  const { error } = await supabase
    .from('meetings')
    .update({
      met_on: head.met_on,
      title: head.title.trim(),
      place: head.place || null,
      attendees: head.attendees || null,
      writer: head.writer.trim() || null,
      // 빈 칸은 null 로 — 빈 문자열을 넣으면 time 형이 안 받는다
      started_at: head.started_at || null,
      ended_at: head.ended_at || null,
    })
    .eq('id', id)
  if (error) throw error
}

/** 보관된 소리 전부 (어느 회의 것이든). 「전부 지우기」에서 쓴다 */
export async function listAllMeetingAudio(): Promise<MeetingAudio[]> {
  const { data, error } = await supabase
    .from('meeting_audio')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

/**
 * 보관된 소리를 **전부** 지운다.
 *
 * 파일과 기록을 함께 지운다. 하나만 지우면 반쪽이 보관함에 떠돈다.
 * 되돌릴 수 없으므로 화면에서 두 번 물어본 뒤에만 부른다.
 */
export async function deleteAllMeetingAudio(): Promise<number> {
  const rows = await listAllMeetingAudio()
  if (rows.length === 0) return 0

  const { error: rmErr } = await supabase.storage
    .from(AUDIO_BUCKET)
    .remove(rows.map((r) => r.path))
  if (rmErr) throw rmErr

  const { error } = await supabase
    .from('meeting_audio')
    .delete()
    .in('id', rows.map((r) => r.id))
  if (error) throw error
  return rows.length
}
