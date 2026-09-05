import { createGeminiTranscriber } from './gemini.ts'
import { createOpenAITranscriber } from './openai.ts'
import { MissingKeyError } from './types.ts'
import type { Transcriber } from './types.ts'

/**
 * 어느 회사 것으로 받아쓸지 **모델 이름을 보고** 고른다.
 *
 * ── 왜 「공급자」를 따로 안 받나 ─────────────────────────
 * 화면이 「제미나이」와 「gemini-3.5-transcribe」를 둘 다 보내면 **둘이 어긋날 수 있다.**
 * 실제로 어긋나면 사용자는 왜 다른 모델로 돌았는지 알 길이 없다.
 * 그래서 **보내는 값은 모델 이름 하나뿐**이고, 공급자는 여기서 정한다.
 */
export function pickTranscriber(model: string): Transcriber {
  return model.toLowerCase().startsWith('gemini')
    ? createGeminiTranscriber()
    : createOpenAITranscriber()
}

/**
 * 화면이 보낸 모델 이름을 확인한다.
 *
 * ── 왜 확인하나 ──────────────────────────────────────────
 * 이 값은 **브라우저에서 온다.** 엉뚱한 글자가 그대로 AI 공급자로 나가면
 * 사용자에게는 알 수 없는 오류로만 보인다. 여기서 걸러 우리말로 말해 준다.
 *
 * ── 왜 목록을 코드에 안 박나 ────────────────────────────
 * 모델은 몇 달마다 새로 나온다. 목록을 코드에 박으면 **새 모델을 써 보려고
 * 배포를 다시 해야 한다** (CLAUDE.md — 모델명을 코드에 박지 않는다).
 *
 * 대신 잠그고 싶으면 환경변수로 잠근다 —
 *   `npx supabase secrets set AI_TRANSCRIBE_MODELS=whisper-1,gemini-3.5-transcribe`
 * 안 넣으면 **모양만 맞으면 통과**시킨다.
 */
export function checkModel(model: string): string {
  const want = model.trim()
  if (!want) {
    throw new MissingKeyError('받아쓰기 모델이 지정되지 않았습니다.')
  }
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(want)) {
    throw new MissingKeyError(`받아쓰기 모델 이름이 이상합니다: ${want.slice(0, 40)}`)
  }

  const allowed = (Deno.env.get('AI_TRANSCRIBE_MODELS') ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)

  if (allowed.length > 0 && !allowed.includes(want)) {
    throw new MissingKeyError(
      `이 프로젝트에서 허용되지 않은 받아쓰기 모델입니다: ${want}. ` +
        `허용된 것 — ${allowed.join(', ')}`,
    )
  }
  return want
}

export { MissingKeyError, TranscribeError } from './types.ts'
export type { TranscribeResult, TranscribeSegment, Transcriber } from './types.ts'
