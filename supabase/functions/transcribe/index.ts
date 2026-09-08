import { createClient } from 'jsr:@supabase/supabase-js@2'
import { recordUsage } from '../_shared/usage.ts'
import { explainFailure } from '../_shared/provider/failure.ts'
import { checkModel, pickTranscriber } from '../_shared/provider/transcribe/index.ts'
import { MissingKeyError, TranscribeError } from '../_shared/provider/transcribe/index.ts'

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
 *
 * ── 이 파일이 하는 일은 이제 넷뿐이다 (2026-09-05) ──────
 * 로그인 확인 · 토막 크기 확인 · **어느 모델로 받아쓸지 고르기** · 답 돌려주기.
 * 실제로 부르는 일은 `_shared/provider/transcribe/` 아래 어댑터가 한다 —
 * 사용자가 화면에서 모델을 고를 수 있게 되면서 공급자가 둘이 됐기 때문이다.
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
 * 화면이 모델을 안 보냈을 때 쓸 값.
 *
 * 코드에 박지 않는다 (CLAUDE.md). 아래는 환경변수도 없을 때의 마지막 값이다.
 * 바꾸려면 `npx supabase secrets set AI_MODEL_TRANSCRIBE=<모델명>`.
 *
 * ⚠️ **화면 쪽 기본값과 같아야 한다** (transcribeModels.ts).
 *    여기가 쓰이는 경우는 **옛 화면이 열려 있는 창**뿐인데, 두 값이 다르면
 *    같은 사람이 창에 따라 다른 모델로 받아쓰게 된다. 왜 문체가 다른지
 *    알아낼 방법이 없다.
 *
 * 2026-09-05 — 사용자 판단으로 whisper-1 에서 바꿨다. 셋을 같은 소리로 재 보니
 * 정확도·요금·무음에서 모두 제미나이가 앞섰다 (설계서 §5.8ⓑ).
 */
const DEFAULT_TRANSCRIBE_MODEL = 'gemini-3.5-transcribe'

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

    /**
     * **어느 모델로 받아쓸까 — 사용자가 화면에서 고른다** (2026-09-05).
     *
     * 그전에는 여기 한 줄에 박혀 있어서, 다른 모델을 견줘 보려면 환경변수를 바꾸고
     * 함수를 다시 배포해야 했다. **회의 하나를 두 모델로 받아써 볼 수가 없었다.**
     * 이제 화면이 모델 이름을 같이 보낸다. 안 보내면 옛날처럼 환경변수를 본다.
     */
    const model = checkModel(
      String(form?.get('model') ?? '').trim() ||
        Deno.env.get('AI_MODEL_TRANSCRIBE') ||
        DEFAULT_TRANSCRIBE_MODEL,
    )

    /*
      어느 회사 것인지 **손에 들고 있는다.** 실패했을 때 안내에 회사 이름이
      들어가는데, 구글 한도 문제에 「OpenAI 결제를 확인하세요」라고 띄운 적이
      있다 (2026-09-05). 사용자가 엉뚱한 곳을 뒤지게 된다.
    */
    /*
      이 토막이 몇 초짜리인가. **전사 요금은 길이로 매겨진다.**
      화면이 알고 있으므로(구간을 자른 쪽이 화면이다) 같이 보내 준다.
      안 보내면 비워 둔다 — 파일 크기로 짐작하면 코덱마다 달라 틀린 값이 남는다.
    */
    const seconds = Math.round(Number(form?.get('seconds') ?? 0)) || null

    /*
      화자 구분 받아쓰기를 켤까 (2026-09-08).
      제미나이만 되고, 나머지 모델은 조용히 무시한다 — 모델을 바꿨다고
      받아쓰기가 통째로 실패하면 안 된다.
    */
    const diarize = String(form?.get('diarize') ?? '') === '1'

    const transcriber = pickTranscriber(model)

    /*
      ★ 사용량 기록 (2026-09-08).

      **전사가 이 저장소에서 가장 비싼 길인데 한 줄도 안 남고 있었다.**
      ai-assist 는 공급자를 감싸서 기록하지만(_shared/usage.ts), 여기는
      부르는 자리가 이 한 곳뿐이라 감쌀 것도 없이 여기 붙인다.

      실패도 남긴다 — 「이번 달 호출이 왜 이렇게 많지」의 답이
      **다시 보내기**일 때가 있다 (몰려서 거절당하면 두 번까지 다시 한다).
    */
    let result
    try {
      result = await transcriber.run({ file, hint, model, diarize })
    } catch (e) {
      await recordUsage(db, userData.user.id, {
        feature: '전사',
        model,
        audioSec: seconds,
        ok: false,
      })
      throw e
    }
    await recordUsage(db, userData.user.id, { feature: '전사', model, audioSec: seconds })

    /*
      토막마다의 확신도를 **그대로 넘긴다.** 무엇을 버릴지는 화면이 정한다.
      ⚠️ **주는 모델과 안 주는 모델이 있다** — whisper-1 만 준다. 없으면 빈 배열이고,
         화면은 그때 낱말 목록으로만 거른다 (domain/hallucination.ts).
    */
    return json(result)
  } catch (e) {
    if (e instanceof TranscribeError) {
      console.error('transcribe failed', e.status, e.raw)
      return json(explainFailure(e.status, e.raw, e.provider), 502)
    }
    if (e instanceof MissingKeyError) {
      console.error('transcribe misconfigured', e.message)
      return json({ error: e.message }, 500)
    }
    console.error(e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
