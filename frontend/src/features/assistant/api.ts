import { supabase } from '../../lib/supabase'
import type { Row } from '../../lib/supabase'
import type { Json } from '../../lib/database.types'

export type Thread = Row<'assistant_threads'>
export type Message = Row<'assistant_messages'>

export type Source = { kind: string; label: string }
/** 웹에서 찾아본 자리. kind 대신 url 이 있어 화면에서 눌러 확인할 수 있다 */
export type WebSource = { title: string; url: string }
export type ProposedItem = { label: string; why: string | null }

export type AssistReply = {
  mode: '질문' | '체크리스트'
  text: string
  items?: ProposedItem[]
  sources: Source[]
  webSources?: WebSource[]
  model: string
  tokensIn: number | null
  tokensOut: number | null
}

/**
 * AI 를 부른다.
 *
 * 열쇠는 브라우저에 없다 — Edge Function 이 대신 부른다.
 * 자료도 여기서 안 보낸다. 함수가 DB 를 직접 읽는다 (남의 것을 밀어 넣지 못하게).
 */
export async function callAssist(payload: {
  mode: '질문' | '체크리스트'
  taskId: string
  question?: string
  hint?: string
  attachmentIds?: string[]
  history?: { role: 'user' | 'assistant'; content: string }[]
  /** 웹에서도 찾아볼까. ⚠️ 켜면 질문 글이 밖으로 나간다 */
  webSearch?: boolean
}): Promise<AssistReply> {
  const { data, error } = await supabase.functions.invoke('ai-assist', { body: payload })

  if (error) {
    // 함수가 돌려준 우리말 오류를 꺼낸다. 못 꺼내면 원문을 그대로 보여 준다
    const detail = await readFunctionError(error)
    throw new Error(detail ?? error.message)
  }
  if (data?.error) throw new Error(String(data.error))
  return data as AssistReply
}

/** 함수가 돌려준 우리말 오류를 꺼낸다. 회의록 쪽에서도 같은 방식으로 쓴다 */
export async function readFunctionError(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: Response }).context
  if (!ctx || typeof ctx.json !== 'function') return null
  try {
    const body = await ctx.json()
    return typeof body?.error === 'string' ? body.error : null
  } catch {
    return null
  }
}

// ── 대화 기록 ─────────────────────────────────────────────
//
// 왜 남기나 — 「내가 무엇을 물었나」가 절차의 씨앗이다.
// 같은 걸 세 번 물었으면 그건 절차에 빠진 대목이다.
//
// ⚠️ 이 표는 AI 가 답변 근거로 **인용할 수 없다** (disclosure_policy).
//    내가 AI 에게 뭘 물었는지가 가장 사적인 기록이다.

export async function getThread(taskId: string): Promise<Thread | null> {
  const { data, error } = await supabase
    .from('assistant_threads')
    .select('*')
    .eq('task_id', taskId)
    .order('last_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function ensureThread(companyId: string, taskId: string, title: string): Promise<Thread> {
  const existing = await getThread(taskId)
  if (existing) return existing

  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('assistant_threads')
    .insert({ company_id: companyId, user_id: userId, task_id: taskId, title })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function listMessages(threadId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('assistant_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at')
  if (error) throw error
  return data
}

export async function addMessage(input: {
  companyId: string
  threadId: string
  role: '사람' | 'AI'
  content: string
  sources?: Source[]
  webSources?: WebSource[]
  tokensIn?: number | null
  tokensOut?: number | null
}): Promise<void> {
  const userId = await currentUserId()
  const { error } = await supabase.from('assistant_messages').insert({
    company_id: input.companyId,
    user_id: userId,
    thread_id: input.threadId,
    role: input.role,
    content: input.content,
    // 웹 출처도 같은 칸에 담는다 — url 이 있으면 웹, 없으면 이 업무 자료다.
    // 표를 하나 더 만들 만큼 다른 것이 아니다
    sources: [...(input.sources ?? []), ...(input.webSources ?? [])] as unknown as Json,
    tokens_in: input.tokensIn ?? null,
    tokens_out: input.tokensOut ?? null,
  })
  if (error) throw error

  await supabase
    .from('assistant_threads')
    .update({ last_at: new Date().toISOString() })
    .eq('id', input.threadId)
}

/**
 * 대화 한 줄 지우기.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────
 * 사용자 말: *"잘못된 답변은 나중에 독이 될 수도 있어"*.
 *
 * 맞다. 이 대화는 **나중에 절차의 재료**가 된다. 틀린 답이 섞여 있으면
 * 그 위에 쌓이는 절차도 틀린다. 「지난번엔 이렇게 하셨습니다」가
 * 틀린 말을 근거로 나오면 그건 없느니만 못하다.
 *
 * ── 왜 「틀림 표시」가 아니라 삭제인가 ───────────────────
 * 표시만 해 두면 나중에 그 표시를 존중하는 코드를 **모든 자리에서** 지켜야 한다.
 * 한 군데만 빠뜨려도 틀린 답이 새어 나온다. 지워 버리는 편이 확실하다.
 *
 * (대화 기록은 어차피 AI 가 답변 근거로 인용할 수 없는 자료다 — disclosure_policy.
 *  학습에만 쓰이므로, 학습에서 빼려면 지우는 게 맞다.)
 */
export async function deleteMessage(id: string): Promise<void> {
  const { error } = await supabase.from('assistant_messages').delete().eq('id', id)
  if (error) throw error
}

/** 대화 통째로 지우기. 메시지는 딸려서 함께 지워진다 (on delete cascade) */
export async function deleteThread(threadId: string): Promise<void> {
  const { error } = await supabase.from('assistant_threads').delete().eq('id', threadId)
  if (error) throw error
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('로그인 정보를 읽지 못했습니다.')
  return id
}
