import type { ChatMessage, ChatResult, Provider } from './types.ts'

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
const DEFAULT_MODEL = 'gpt-4.1'
const DEFAULT_MODEL_LIGHT = 'gpt-4.1-mini'

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

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: used,
          messages,
          max_completion_tokens: opts?.maxTokens ?? 2000,
        }),
      })

      if (!res.ok) {
        const body = await res.text()
        // 열쇠 값이 오류 메시지에 섞여 나가지 않게 앞부분만 잘라 올린다
        throw new Error(`AI 호출 실패 (${res.status}) — ${body.slice(0, 400)}`)
      }

      const json = await res.json()
      const text = json?.choices?.[0]?.message?.content
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error('AI가 빈 답을 돌려줬습니다.')
      }

      return {
        text: text.trim(),
        tokensIn: json?.usage?.prompt_tokens ?? null,
        tokensOut: json?.usage?.completion_tokens ?? null,
        model: used,
      }
    },
  }
}
