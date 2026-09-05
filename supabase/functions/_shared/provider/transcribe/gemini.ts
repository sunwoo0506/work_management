// deno-lint-ignore-file no-explicit-any
import { encodeBase64 } from 'jsr:@std/encoding@1/base64'
import { MissingKeyError, TranscribeError } from './types.ts'
import type { TranscribeInput, TranscribeResult, Transcriber } from './types.ts'

/**
 * 제미나이 받아쓰기 어댑터.
 *
 * ── 왜 별도 파일인가 ─────────────────────────────────────
 * OpenAI 는 소리를 **파일 폼**으로 받는데, 제미나이는 **JSON 안에 글자로 바꿔 넣어**
 * 받는다. 주소도 다르고, 열쇠를 넣는 자리도 다르고, 답의 모양도 다르다.
 * 같은 함수 안에서 if 로 가르면 **어느 줄이 누구 것인지 알 수 없게 된다.**
 *
 * ── 무엇이 더 되나 ───────────────────────────────────────
 * 사내 용어를 **낱말 목록으로** 넘긴다 (`custom_vocabulary`, 1000개까지).
 * OpenAI 쪽은 「이런 말이 나올 것」이라는 한 줄 힌트라서 지켜지지 않을 때가 있는데,
 * 이쪽은 목록으로 받아 그 표기로 적는다. 「타이백 → 타이벡」이 더 잘 듣는 자리다.
 *
 * ── ⚠️ 무엇을 잃나 ───────────────────────────────────────
 * **토막마다의 「말없음확률」을 안 준다.** whisper-1 만 그 숫자를 준다.
 * 그래서 지어낸 말을 거르는 그물이 **낱말 목록 한 겹만** 남는다
 * (domain/hallucination.ts). 화면에서 이 사실을 사용자에게 밝힌다.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'

/**
 * 소리를 JSON 에 실어 보내는 한도.
 *
 * 소리를 글자로 바꿔 넣으면 (base64) **크기가 1.33배로 분다.** 제미나이 쪽
 * 한 번 요청의 한도가 20MB 라서, 원본은 14MB 를 넘으면 안 된다.
 *
 * 실제로는 걸릴 일이 없다 — 실시간 회의는 15초 토막(수십 KB)이고,
 * 녹음 파일 올리기도 5분씩 잘라 보내 9.6MB 다. **넘으면 그렇다고 말해 준다.**
 */
const MAX_INLINE_BYTES = 14 * 1024 * 1024

/** 답이 바로 안 올 때 몇 번이나 더 물어볼까 */
const POLL_TRIES = 8
const POLL_WAIT_MS = 1_200

export function createGeminiTranscriber(): Transcriber {
  return {
    name: 'gemini',

    async run({ file, hint, model }: TranscribeInput): Promise<TranscribeResult> {
      const key = Deno.env.get('GEMINI_API_KEY')
      if (!key) {
        throw new MissingKeyError(
          '제미나이 열쇠(GEMINI_API_KEY)가 설정되지 않았습니다. ' +
            'Supabase > Edge Functions > Secrets 에 넣어 주세요. ' +
            '넣기 전까지는 받아쓰기 모델을 whisper-1 로 되돌려 주세요.',
        )
      }

      if (file.size > MAX_INLINE_BYTES) {
        throw new MissingKeyError(
          '이 소리 조각은 제미나이로 한 번에 보내기엔 큽니다. 받아쓰기 모델을 whisper-1 로 바꿔 주세요.',
        )
      }

      const bytes = new Uint8Array(await file.arrayBuffer())

      const body: Record<string, unknown> = {
        model,
        input: [
          {
            type: 'audio',
            data: encodeBase64(bytes),
            mime_type: mimeType(file),
          },
        ],
        generation_config: {
          transcription_config: {
            // 한국어로 못 박는다. 비워 두면 알아서 찾지만, 짧은 토막에서
            // 영어로 잘못 잡는 일이 있다 — 회의는 늘 한국어다
            language_codes: ['ko-KR'],
            ...(hint ? { custom_vocabulary: vocabulary(hint) } : {}),
          },
        },
      }

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new TranscribeError(res.status, await res.text())

      let json = await res.json()

      // 바로 끝나지 않으면 몇 번 더 물어본다. 여기서 포기하면 그 토막이 통째로 사라진다
      for (let i = 0; i < POLL_TRIES && pending(json); i++) {
        await new Promise((r) => setTimeout(r, POLL_WAIT_MS))
        json = await reread(key, String(json?.id ?? ''))
        if (!json) break
      }

      return { text: readText(json), segments: [], model }
    },
  }
}

/** 아직 받아쓰는 중인가 */
function pending(json: any): boolean {
  const status = String(json?.status ?? '')
  if (!status || status === 'completed') return false
  return !!json?.id && status !== 'failed'
}

/** 아까 그 건이 끝났는지 다시 물어본다 */
async function reread(key: string, id: string): Promise<any> {
  if (!id) return null
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${id}`, {
    headers: { 'x-goog-api-key': key },
  })
  if (!res.ok) throw new TranscribeError(res.status, await res.text())
  return await res.json()
}

/**
 * 답에서 받아쓴 글만 꺼낸다.
 *
 * 한 자리에 다 들어 있지 않다 — 짧은 답은 `output_text` 에 통째로 오고,
 * 긴 답은 단계(`steps`)로 나뉘어 온다. **둘 다 본다.**
 */
function readText(json: any): string {
  const direct = String(json?.output_text ?? '').trim()
  if (direct) return direct

  const parts: string[] = []
  for (const step of json?.steps ?? []) {
    for (const c of step?.content ?? []) {
      if (typeof c?.text === 'string') parts.push(c.text)
    }
  }
  return parts.join(' ').trim()
}

/**
 * 사내 용어 한 줄을 낱말 목록으로 바꾼다.
 *
 * 화면은 「타이벡, 인박스, 경영지원부」처럼 쉼표로 이어 보낸다.
 * 제미나이는 목록으로 받으므로 여기서 가른다. 한도는 1000개다.
 */
function vocabulary(hint: string): string[] {
  return hint
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 1000)
}

/**
 * 소리 형식을 알려 준다.
 *
 * 브라우저가 붙여 주는 값에는 `audio/webm;codecs=opus` 처럼 **뒤에 꼬리가 붙는다.**
 * 제미나이는 그 꼬리를 모르므로 잘라 낸다. 폰마다 형식이 다르다 —
 * 안드로이드는 webm, 아이폰은 mp4 계열이고, 녹음 파일을 잘라 보낼 때는 wav 다.
 */
function mimeType(file: File): string {
  const type = (file.type || '').toLowerCase().split(';')[0].trim()
  if (type.includes('m4a')) return 'audio/m4a'
  if (type.includes('mp4') || type.includes('aac')) return 'audio/mp4'
  if (type.includes('ogg')) return 'audio/ogg'
  if (type.includes('mpeg') || type.includes('mp3')) return 'audio/mpeg'
  if (type.includes('wav')) return 'audio/wav'
  return 'audio/webm'
}
