// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { explainFailure } from '../_shared/provider/failure.ts'

/**
 * 녹음 토막 하나를 글로 바꾼다.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────
 * 브라우저 내장 받아쓰기(설계서 §5.8ⓐ)는 **폰에서 잘 안 된다.**
 * 삼성 인터넷에는 아예 없고, 안드로이드 크롬은 한 마디마다 끊긴다.
 * 실제로 폰에서 「듣기 시작」을 눌렀는데 글자가 하나도 안 올라왔다.
 *
 * 그래서 **소리를 토막 내 여기로 보내고, 여기서 글로 바꿔 돌려준다.**
 * 브라우저가 하는 일은 녹음뿐이라 **어느 폰·태블릿에서도 똑같이 동작한다.**
 *
 * ⚠️ 음성이 AI 공급자로 나간다. 브라우저 받아쓰기(제조사 서버로 나감)와
 *    나가는 곳만 다르고 성격은 같다. 사용자가 「듣기 시작」을 눌렀을 때만 돈다.
 *
 * ── 왜 토막을 내나 ───────────────────────────────────────
 * ① 한 시간을 통째로 올리면 용량 한도에 걸린다
 * ② 토막마다 글이 돌아오므로 **회의 중에 글자가 쌓이는 것을 볼 수 있다**
 * ③ 중간에 끊겨도 그때까지 받은 글은 남는다
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

/**
 * 어느 모델로 받아쓸지.
 *
 * 코드에 박지 않는다 (CLAUDE.md). 아래는 환경변수가 없을 때의 값이다.
 * 바꾸려면 `npx supabase secrets set AI_MODEL_TRANSCRIBE=<모델명>`.
 */
const DEFAULT_TRANSCRIBE_MODEL = 'whisper-1'

/** 토막 하나의 상한. 이보다 크면 받지 않는다 — 요금과 시간이 튄다 */
const MAX_BYTES = 20 * 1024 * 1024

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: '로그인이 필요합니다.' }, 401)

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    )
    const { data: userData } = await db.auth.getUser()
    if (!userData?.user) return json({ error: '로그인 정보를 확인하지 못했습니다.' }, 401)

    const key = Deno.env.get('OPENAI_API_KEY')
    if (!key) {
      return json(
        { error: 'AI 열쇠(OPENAI_API_KEY)가 설정되지 않았습니다. Supabase > Edge Functions > Secrets 에 넣어 주세요.' },
        500,
      )
    }

    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return json({ error: '녹음 토막이 없습니다.' }, 400)
    if (file.size === 0) return json({ text: '' })
    if (file.size > MAX_BYTES) return json({ error: '녹음 토막이 너무 큽니다.' }, 413)

    /**
     * 사내 용어를 미리 알려 준다.
     *
     * 받아쓰기 모델은 「이런 말이 나올 것」이라는 힌트를 받으면 그 표기로 적는다.
     * 「타이백」이 아니라 「타이벡」으로 나오게 하는 자리다 (설계서 §5.8).
     * ⚠️ 브라우저 내장 받아쓰기로는 못 하던 일이다 — 이 길의 값어치 중 하나.
     */
    const hint = String(form?.get('hint') ?? '').slice(0, 800)

    const out = new FormData()
    out.append('file', file, fileName(file))
    out.append('model', Deno.env.get('AI_MODEL_TRANSCRIBE') || DEFAULT_TRANSCRIBE_MODEL)
    out.append('language', 'ko')
    out.append('response_format', 'json')
    /*
      ⚠️ 「지어내기」를 최대한 줄인다 (2026-08-19).

      받아쓰기 모델은 유튜브 자막을 대량으로 보고 배웠다. 그래서 **소리가 흐릿한
      토막**을 받으면 빈 답 대신 자막에서 흔한 문장을 지어낸다 —
      「시청해주셔서 감사합니다」가 실제로 회의록에 들어왔다.

      temperature 는 **얼마나 과감하게 지어낼지**를 정하는 값이다. 0 이면
      들린 대로만 적으려 한다. 기본값이 0 이 아니라서 명시적으로 넣는다.

      ⚠️ **재 봤더니 이 문제는 못 막았다.** 무음 15초를 넣어 네 가지로 시험했는데
         (기본/0 × 힌트 있음/없음) **네 번 다 「시청해주셔서 감사합니다」가 나왔다.**
         그래도 남긴 이유는, 소리가 **흐릿하게 있는** 토막에서 답이 덜 흔들리기
         때문이다. 지어내기를 막는 것은 아래 ①③ 이 한다.

      막는 것은 세 겹인데 **무게가 다르다** —
        ① 말이 없는 토막은 **아예 안 보낸다** (useRecorder.ts)  ← 이게 결정적이다
        ② 여기서 답이 덜 흔들리게 한다                        ← 보조
        ③ 그래도 나온 것은 글에서 거른다 (domain/hallucination.ts) ← 마지막 그물
    */
    out.append('temperature', '0')
    if (hint) out.append('prompt', hint)

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: out,
    })

    if (!res.ok) {
      const detail = await res.text()
      console.error('transcribe failed', res.status, detail)
      return json(explainFailure(res.status, detail), 502)
    }

    const body = await res.json()
    return json({ text: String(body?.text ?? '').trim() })
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})

/**
 * 파일 이름을 만들어 붙인다.
 *
 * 받아쓰기 쪽이 **확장자를 보고 소리 형식을 판단한다.** 이름이 없거나
 * 확장자가 엉뚱하면 "지원하지 않는 형식"으로 거절당한다.
 * 폰마다 녹음 형식이 다르다 — 안드로이드는 webm, 아이폰은 mp4 계열이다.
 */
function fileName(file: File): string {
  const type = (file.type || '').toLowerCase()
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'chunk.mp4'
  if (type.includes('ogg')) return 'chunk.ogg'
  if (type.includes('mpeg') || type.includes('mp3')) return 'chunk.mp3'
  if (type.includes('wav')) return 'chunk.wav'
  return 'chunk.webm'
}
