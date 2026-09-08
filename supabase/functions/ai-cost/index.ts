// deno-lint-ignore-file no-explicit-any
import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * 이번 달 **실제 청구액**을 공급자에게 직접 물어본다.
 *
 * ── 왜 별도 함수인가 (2026-09-08) ───────────────────────
 * 부장님 질문에서 나왔다 — *"실제 사용비용을 확인해줄 수는 없니"*
 *
 * 우리 표(`ai_usage`)는 **우리가 부른 것만** 안다. 그리고 금액은 단가표로
 * 곱한 **어림값**이라, 공급자가 단가를 바꾸면 어긋난다. 진짜 청구액은
 * 공급자만 안다.
 *
 * ── ★ 열쇠가 다르다. 그래서 자리도 다르다 ───────────────
 * 이 조회에는 **조직 관리자 열쇠**(OPENAI_ADMIN_KEY)가 필요하다.
 * 평소 쓰는 열쇠와 등급이 다르다 — 이건 **조직 전체의 청구 정보**를 본다.
 *
 * 그래서 ai-assist 에 얹지 않고 **함수를 따로 뒀다.** 한 함수에 두면
 * 회의록을 만들 때도 그 열쇠가 옆에 있게 된다. 열쇠는 필요한 자리에만 둔다.
 *
 * ⚠️ **열쇠가 없으면 없다고 답한다.** 오류로 만들지 않는다 —
 *    이건 부가 기능이고, 없다고 사용량 화면이 깨지면 안 된다.
 *
 * ⚠️ 조직 전체 금액이라 **이 툴이 쓴 것만이 아니다.** 같은 조직 열쇠를 쓰는
 *    다른 프로젝트(클론미·과제온)의 비용도 함께 잡힌다. 화면에서 그렇게 밝힌다.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return json({ error: '로그인이 필요합니다.' }, 401)

    // 로그인한 사람만 본다. 청구 정보는 아무나 보면 안 된다
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } },
    )
    const { data: userData } = await db.auth.getUser()
    if (!userData?.user) return json({ error: '로그인 정보를 확인하지 못했습니다.' }, 401)

    const key = Deno.env.get('OPENAI_ADMIN_KEY')
    if (!key) {
      /*
        열쇠가 없는 것은 **잘못이 아니다.** 아직 안 넣었을 뿐이다.
        화면이 「미설정」으로 보여 주고 넣는 법을 안내한다.
      */
      return json({
        configured: false,
        reason:
          '조직 관리자 열쇠(OPENAI_ADMIN_KEY)가 없습니다. ' +
          'OpenAI 대시보드에서 Admin key 를 만들어 Supabase > Edge Functions > Secrets 에 넣어 주세요.',
      })
    }

    // 이번 달 1일 0시(UTC 기준 초). 공급자가 초 단위로 받는다
    const now = new Date()
    const start = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000)

    const res = await fetch(
      `https://api.openai.com/v1/organization/costs?start_time=${start}&limit=180`,
      { headers: { Authorization: `Bearer ${key}` } },
    )

    if (!res.ok) {
      const raw = await res.text()
      return json(
        {
          configured: true,
          error:
            res.status === 401
              ? '관리자 열쇠가 거절당했습니다. 일반 열쇠가 아니라 **Admin key** 인지 확인해 주세요.'
              : `공급자가 거절했습니다 (${res.status}). ${raw.slice(0, 200)}`,
        },
        200,
      )
    }

    const body = await res.json()

    /*
      날짜별 묶음으로 온다. 우리는 이번 달 합계만 보여 주므로 전부 더한다.
      **화폐 단위를 그대로 들고 온다** — 달러를 원으로 바꾸지 않는다.
      환율을 어디서 가져올지가 또 문제가 되고, 틀린 환율로 바꾼 금액은
      맞는 달러보다 나쁘다.
    */
    let amount = 0
    let currency = 'usd'
    for (const bucket of body?.data ?? []) {
      for (const r of bucket?.results ?? []) {
        amount += Number(r?.amount?.value ?? 0)
        if (r?.amount?.currency) currency = String(r.amount.currency)
      }
    }

    return json({
      configured: true,
      amount,
      currency,
      since: new Date(start * 1000).toISOString().slice(0, 10),
    })
  } catch (e) {
    console.error(e)
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
