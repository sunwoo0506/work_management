import type { ChatMessage, ChatResult, Provider, WebSource } from './types.ts'
import { explainFailure } from './failure.ts'

/**
 * OpenAI 어댑터.
 *
 * 모델명을 코드에 박지 않는다 (CLAUDE.md). 환경변수로 둔다 —
 *   AI_MODEL        판단이 섞인 일 (문서 초안, 절차 추출, 질문 답변)
 *   AI_MODEL_LIGHT  가벼운 일 (체크리스트 추리기 같은 뽑아내기)
 *
 * 아래 기본값은 **환경변수가 없을 때의 임시값**이다.
 * 어느 모델을 쓸지는 아직 정해지지 않았다 (설계서 §14 OQ-12).
 */
const DEFAULT_MODEL = 'gpt-5.6-sol'
const DEFAULT_MODEL_LIGHT = 'gpt-5.6-terra'

/**
 * 답 한도.
 *
 * ⚠️ 5.x 계열은 **추론형**이다. 답을 쓰기 전에 속으로 생각하는 데 토큰을 쓰고,
 *    그 생각 토큰도 이 한도에 함께 계산된다.
 *    실제로 재 보니 *"한 단어로만 답하세요"* 에 300~1700 토큰을 썼다.
 *
 *    한도를 짜게 잡으면 **생각하다 끝나서 빈 답**이 온다. 사용자에게는
 *    "AI가 이상하다"로만 보인다. 그래서 넉넉히 잡는다.
 *    답이 짧으면 안 쓴 토큰은 요금도 안 나간다 — 아껴서 얻는 게 없다.
 */
const MAX_TOKENS = 12_000

export function createOpenAI(): Provider {
  const key = Deno.env.get('OPENAI_API_KEY')
  if (!key) {
    throw new Error(
      'AI 열쇠(OPENAI_API_KEY)가 설정되지 않았습니다. ' +
        'Supabase 프로젝트 설정 > Edge Functions > Secrets 에 넣어 주세요.',
    )
  }

  const model = Deno.env.get('AI_MODEL') || DEFAULT_MODEL
  const modelLight = Deno.env.get('AI_MODEL_LIGHT') || DEFAULT_MODEL_LIGHT

  return {
    name: 'openai',

    async chat(messages: ChatMessage[], opts): Promise<ChatResult> {
      const used = opts?.light ? modelLight : model
      if (opts?.webSearch) return withWebSearch(key, used, messages, opts)

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: used,
          messages,
          max_completion_tokens: opts?.maxTokens ?? MAX_TOKENS,
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        // 숫자만 던지지 않는다 — 429 하나에 「몰림」과 「잔액 없음」이 같이 들어 있어서,
        // 사용자가 기다릴 일인지 충전할 일인지 화면만 보고는 알 수 없었다 (2026-08-16)
        throw new Error(explainFailure(res.status, body).error)
      }

      const json = await res.json()
      const choice = json?.choices?.[0]
      const text = choice?.message?.content

      if (typeof text !== 'string' || !text.trim()) {
        // 빈 답의 원인이 둘이다. 구분해서 말해 줘야 사용자가 뭘 할지 안다
        if (choice?.finish_reason === 'length') {
          throw new Error(
            'AI가 생각하다 한도에 걸려 답을 못 냈습니다. ' +
              '질문을 짧게 하시거나, 첨부파일을 하나만 골라 다시 물어보세요.',
          )
        }
        throw new Error(`AI가 빈 답을 돌려줬습니다 (${choice?.finish_reason ?? '이유 미상'}).`)
      }

      return {
        text: text.trim(),
        tokensIn: json?.usage?.prompt_tokens ?? null,
        tokensOut: json?.usage?.completion_tokens ?? null,
        model: used,
        webSources: [],
      }
    },
  }
}

/**
 * 웹에서도 찾아보는 길.
 *
 * ── 왜 다른 주소를 쓰나 ──────────────────────────────────
 * 웹 검색은 `/v1/chat/completions` 가 아니라 `/v1/responses` 에서만 된다.
 * 요청·응답 모양이 달라서 함수를 따로 뒀다. 바깥(화면·본체)은 이 차이를 모른다 —
 * 그러라고 어댑터를 둔 것이다.
 *
 * ── 무엇을 돌려주나 ──────────────────────────────────────
 * 답 글과 함께 **실제로 본 자리의 링크**를 같이 돌려준다.
 * 링크가 없으면 사용자가 확인할 방법이 없고, 확인할 수 없는 답은 못 믿는다
 * (CLAUDE.md — 「AI 답변에는 근거 출처를 표시한다」).
 */
async function withWebSearch(
  key: string,
  used: string,
  messages: ChatMessage[],
  opts: { maxTokens?: number },
): Promise<ChatResult> {
  // system 은 instructions 로, 나머지는 대화로 넘긴다
  const instructions = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
  const input = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: used,
      instructions,
      input,
      tools: [{ type: 'web_search' }],
      max_output_tokens: opts.maxTokens ?? MAX_TOKENS,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`웹 검색 호출 실패 (${res.status}) — ${body.slice(0, 400)}`)
  }

  const json = await res.json()
  const parts: string[] = []
  const sources = new Map<string, WebSource>()

  for (const item of json?.output ?? []) {
    if (item?.type !== 'message') continue
    for (const c of item?.content ?? []) {
      if (typeof c?.text === 'string') parts.push(c.text)
      for (const a of c?.annotations ?? []) {
        // 같은 자리를 여러 번 인용해도 목록에는 한 번만 (url 로 묶는다)
        if (a?.type === 'url_citation' && a?.url) {
          sources.set(a.url, { title: a.title ?? a.url, url: a.url })
        }
      }
    }
  }

  const text = parts.join('\n').trim()
  if (!text) {
    if (json?.status === 'incomplete') {
      throw new Error(
        '웹을 찾다가 한도에 걸려 답을 못 냈습니다. 질문을 조금 좁혀 다시 물어보세요.',
      )
    }
    throw new Error('웹 검색에서 빈 답이 왔습니다.')
  }

  return {
    text,
    tokensIn: json?.usage?.input_tokens ?? null,
    tokensOut: json?.usage?.output_tokens ?? null,
    model: used,
    webSources: [...sources.values()],
  }
}
