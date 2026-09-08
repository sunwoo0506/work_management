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
 * 실시간 회의는 15초 토막(수십 KB)이고, 잘라 보내는 녹음도 5분에 9.6MB 라
 * 여기 걸릴 일이 없다.
 *
 * **넘으면 구글 쪽 임시 보관소를 거친다**(upload). 화자 구분을 켜고 30분짜리를
 * 통째로 보낼 때가 그렇다 — 잘라 보내면 조각마다 화자 번호가 새로 매겨지기 때문이다.
 */
const MAX_INLINE_BYTES = 14 * 1024 * 1024

/** 답이 바로 안 올 때 몇 번이나 더 물어볼까 */
const POLL_TRIES = 8
const POLL_WAIT_MS = 1_200

export function createGeminiTranscriber(): Transcriber {
  return {
    name: 'gemini',

    async run({ file, hint, model, diarize, jobId }: TranscribeInput): Promise<TranscribeResult> {
      const key = Deno.env.get('GEMINI_API_KEY')
      if (!key) {
        throw new MissingKeyError(
          '제미나이 열쇠(GEMINI_API_KEY)가 설정되지 않았습니다. ' +
            'Supabase > Edge Functions > Secrets 에 넣어 주세요. ' +
            '넣기 전까지는 받아쓰기 모델을 whisper-1 로 되돌려 주세요.',
        )
      }

      /*
        ★ 아까 맡긴 일을 다시 물어보는 것이면 소리를 안 보낸다 (2026-09-08).
        저쪽이 이미 들고 있다. 30분짜리는 몇 분 걸리므로 화면이 나눠서 물어본다.
      */
      if (jobId) {
        const got = await reread(key, jobId)
        if (pending(got)) return { text: '', segments: [], model, pending: true, jobId }
        const text = diarize ? bySpeaker(got) || readText(got) : readText(got)
        return { text, segments: [], model }
      }

      /*
        ★ 큰 파일은 **먼저 올려 두고 주소로 넘긴다** (2026-09-08).

        소리를 JSON 안에 글자로 실으면 크기가 1.33배로 불어 20MB 한도에 걸린다.
        30분짜리는 그 방식으로 못 보낸다. 그래서 **구글 쪽 임시 보관소**에 먼저
        올리고 주소만 넘긴다(Gemini Files API).

        ⚠️ **우리 보관함과 다른 곳이다.** 우리 것(Supabase)에는 소리가 그대로
           남고, 구글 쪽 복사본만 **48시간 뒤 구글이 알아서 지운다.**
      */
      const input = file.size > MAX_INLINE_BYTES
        ? { type: 'audio', uri: await upload(key, file), mime_type: mimeType(file) }
        : {
            type: 'audio',
            data: encodeBase64(new Uint8Array(await file.arrayBuffer())),
            mime_type: mimeType(file),
          }

      const body: Record<string, unknown> = {
        model,
        input: [input],
        generation_config: {
          transcription_config: {
            // 한국어로 못 박는다. 비워 두면 알아서 찾지만, 짧은 토막에서
            // 영어로 잘못 잡는 일이 있다 — 회의는 늘 한국어다
            language_codes: ['ko-KR'],
            ...(hint ? { custom_vocabulary: vocabulary(hint) } : {}),
            /*
              ★ 화자 구분 (2026-09-08).

              「누가 말했는지」가 없으면 회의록을 만들 때 **조치사항의 담당을
              알 수 없다.** 「제가 하겠습니다」의 「제가」가 누구인지 글만 봐서는
              모른다. 실제로 그 때문에 담당 칸이 비었다.

              ⚠️ **verbatim 을 같이 켜야 한다.** 기본값인 다듬어 주는 모드
              (smart)와는 같이 못 쓴다 — 공급자 제약이다. 그래서 말버릇("어",
              "그러니까")이 그대로 남는데, 그건 다음 단계(채굴)가 걷어낸다.
            */
            ...(diarize
              ? { mode: { type: 'verbatim', diarization_mode: 'speaker' } }
              : {}),
          },
        },
      }

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new TranscribeError(res.status, await res.text(), 'gemini')

      let json = await res.json()

      // 바로 끝나지 않으면 몇 번 더 물어본다. 여기서 포기하면 그 토막이 통째로 사라진다
      const id = String(json?.id ?? '')
      for (let i = 0; i < POLL_TRIES && pending(json); i++) {
        await new Promise((r) => setTimeout(r, POLL_WAIT_MS))
        json = await reread(key, id)
        if (!json) break
      }

      /*
        여기까지 기다렸는데도 안 끝났으면 **붙잡고 있지 않는다.**
        서버 함수가 먼저 끊기면 그 일이 통째로 사라진다.
        번호를 돌려주면 화면이 이어서 물어본다.
      */
      if (pending(json) && id) {
        return { text: '', segments: [], model, pending: true, jobId: id }
      }

      /*
        화자를 갈라 달라고 했으면 **낱말 단위로 온 화자 표시**를 줄로 묶는다.
        묶지 못하면(공급자가 안 줬거나 형태가 바뀌었으면) 평소 글로 되돌아간다 —
        화자 표시를 못 얻었다고 받아쓴 글까지 잃으면 안 된다.
      */
      const text = diarize ? (bySpeaker(json) || readText(json)) : readText(json)
      return { text, segments: [], model }
    },
  }
}

/**
 * 큰 소리 파일을 **구글 쪽 임시 보관소에 올리고 주소를 받아 온다** (2026-09-08).
 *
 * ── 왜 필요한가 ──────────────────────────────────────────
 * 소리를 JSON 에 글자로 실어 보내는 방식은 20MB 에서 막힌다. 30분짜리
 * 회의는 그걸 넘는다. 그런데 **화자 구분은 통째로 보내야 쓸모가 있다** —
 * 잘라 보내면 조각마다 화자 번호가 새로 매겨져 누가 누군지 이어지지 않는다.
 *
 * 그래서 큰 파일은 구글 쪽 임시 보관소에 올리고 **주소만** 넘긴다.
 * 파일은 2GB 까지 되고 **48시간 뒤 구글이 알아서 지운다** — 우리가 치울 것이 없다.
 *
 * ⚠️ **우리 보관함(Supabase)과 헷갈리면 안 된다.** 소리는 두 군데에 있다 —
 *    우리 것은 그대로 남고(회의록에서 다시 받아쓸 수 있다), 구글 쪽은 임시다.
 *
 * ⚠️ 올리는 절차가 두 걸음이다. 먼저 「이만한 걸 올리겠다」고 알리면
 *    올릴 주소를 알려 주고, 거기에 실제 내용을 보낸다.
 */
async function upload(key: string, file: File): Promise<string> {
  const start = await fetch(
    'https://generativelanguage.googleapis.com/upload/v1beta/files',
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': key,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(file.size),
        'X-Goog-Upload-Header-Content-Type': mimeType(file),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: 'meeting-audio' } }),
    },
  )
  if (!start.ok) throw new TranscribeError(start.status, await start.text(), 'gemini')

  const where = start.headers.get('x-goog-upload-url')
  if (!where) {
    throw new TranscribeError(502, '파일 올릴 자리를 받지 못했습니다.', 'gemini')
  }

  const done = await fetch(where, {
    method: 'POST',
    headers: {
      'Content-Length': String(file.size),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: file,
  })
  if (!done.ok) throw new TranscribeError(done.status, await done.text(), 'gemini')

  const json = await done.json()
  const uri = String(json?.file?.uri ?? '')
  if (!uri) throw new TranscribeError(502, '올린 파일의 주소를 받지 못했습니다.', 'gemini')
  return uri
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
  if (!res.ok) throw new TranscribeError(res.status, await res.text(), 'gemini')
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
 * 낱말마다 붙어 온 화자 표시를 **말한 사람별 줄**로 묶는다.
 *
 * 공급자는 이렇게 준다 — 낱말 하나하나에 누가 말했는지가 붙어 있다.
 *
 *   { type: 'word_info', text: '안녕하세요', speaker: 'spk_1', ... }
 *
 * 그대로 두면 낱말 목록이라 읽을 수 없다. **화자가 바뀌는 자리에서 끊어**
 * 「화자1: …」 꼴로 묶는다.
 *
 * ⚠️ **번호는 이 구간 안에서만 유효하다.** 5분씩 잘라 보내므로 3번 구간의
 *    「화자1」과 4번 구간의 「화자1」이 같은 사람이라는 보장이 없다.
 *    그 사실은 회의록을 만드는 AI 에게 따로 알려 준다 (prompt.ts).
 *
 * 못 묶으면 빈 글을 돌려준다 — 부르는 쪽이 평소 글로 되돌아간다.
 */
function bySpeaker(json: any): string {
  const words: { speaker: string; text: string }[] = []

  for (const step of json?.steps ?? []) {
    for (const c of step?.content ?? []) {
      for (const a of c?.annotations ?? []) {
        if (a?.type !== 'word_info') continue
        const text = String(a?.text ?? '')
        if (!text.trim()) continue
        words.push({ speaker: String(a?.speaker ?? ''), text })
      }
    }
  }
  if (words.length === 0) return ''

  /*
    「spk_1」 을 「화자1」 로 바꾼다. 나온 순서대로 1번부터 매긴다 —
    공급자가 주는 번호가 1부터 시작한다는 보장이 없고, 건너뛰기도 한다.
  */
  const seen = new Map<string, number>()
  const label = (raw: string) => {
    if (!raw) return '화자?'
    if (!seen.has(raw)) seen.set(raw, seen.size + 1)
    return `화자${seen.get(raw)}`
  }

  const lines: string[] = []
  let who = ''
  let buf: string[] = []

  const flush = () => {
    if (buf.length === 0) return
    lines.push(`${label(who)}: ${buf.join(' ').replace(/\s+/g, ' ').trim()}`)
    buf = []
  }

  for (const w of words) {
    if (w.speaker !== who) {
      flush()
      who = w.speaker
    }
    buf.push(w.text)
  }
  flush()

  return lines.join('\n')
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
