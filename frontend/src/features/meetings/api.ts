import { supabase } from '../../lib/supabase'
import type { Row, Update } from '../../lib/supabase'
import type { Json } from '../../lib/database.types'
import { readFunctionError } from '../assistant/api'
import type { Source } from '../assistant/api'
import type { GlossaryPair, Minutes } from '../../domain/transcript'
import type { MinutesDoc } from '../../domain/minutes'

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
  /** 업무 분류 후보. 「기준 › 설정 › 업무영역」 목록을 그대로 넘긴다 */
  areas?: string[]
  /** 긴 회의를 나눠 보낼 때, 이번이 몇 번째 구간인지 (1부터) */
  part?: number
  /** 전체 구간 수 */
  parts?: number
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
  /**
   * 어느 길로 받아썼나 — 나중에 두 길의 정확도를 비교하려면 남겨야 한다.
   * 받아쓴 글 없이 회의록 껍데기만 만들 때는 「직접입력」이다.
   */
  source: '실시간받아쓰기' | '녹음전사' | '직접입력'
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
    aiDraft?: { text: string; minutes: Minutes; model: string } | null
    followUps?: string[]
    /** 회의록 양식 본문 (결정사항 · Action Item 등) */
    minutes?: MinutesDoc | null
    writer?: string | null
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
  if (patch.writer !== undefined) row.writer = patch.writer
  if (patch.followUps !== undefined) {
    row.follow_ups = patch.followUps.map((text) => ({ text, task_id: null })) as unknown as Json
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

/**
 * 업무영역 목록. 「기준 › 설정 › 업무영역」에서 관리하는 것을 그대로 읽는다.
 *
 * 회의록 전용 분류를 따로 만들지 않는다 — 두 벌로 관리하면 반드시 어긋나고,
 * Action Item 이 업무가 될 때 영역을 다시 골라야 한다.
 */
export async function loadAreas(companyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('company_id', companyId)
    .eq('key', 'areas')
    .maybeSingle()
  if (error) throw error
  const raw = data?.value
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
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
  head: { met_on: string; title: string; place: string; attendees: string },
): Promise<void> {
  const { error } = await supabase
    .from('meetings')
    .update({
      met_on: head.met_on,
      title: head.title.trim(),
      place: head.place || null,
      attendees: head.attendees || null,
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
