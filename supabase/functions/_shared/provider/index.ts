import { createOpenAI } from './openai.ts'
import type { Provider } from './types.ts'

/**
 * 지금 쓰는 공급자를 고른다.
 *
 * 바꾸려면 환경변수 AI_PROVIDER 를 바꾸고 여기에 한 줄 추가한다.
 * 화면·DB 는 건드리지 않는다.
 */
export function getProvider(): Provider {
  const which = (Deno.env.get('AI_PROVIDER') || 'openai').toLowerCase()

  switch (which) {
    case 'openai':
      return createOpenAI()
    default:
      throw new Error(`모르는 AI 공급자입니다: ${which}`)
  }
}

export type { ChatMessage, ChatResult, Provider } from './types.ts'
