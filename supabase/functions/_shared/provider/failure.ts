/**
 * AI 공급자가 거절했을 때, **왜 거절했는지를 우리말로 갈라 준다.**
 *
 * ── 왜 이게 따로 필요한가 ────────────────────────────────
 * 2026-08-16, 받아쓰기와 대화가 **둘 다 429** 로 막혔다. 그런데 사용자 계정에는
 * 이번 달 한도가 남아 있었다($2.54 / $10.00). 화면에는 숫자 `429` 만 떠서
 * **무엇을 확인해야 하는지 알 수가 없었다.**
 *
 * 429 는 서로 다른 세 가지를 한 숫자로 말한다 —
 *   ① 잠깐 몰렸다        → 기다리면 풀린다
 *   ② 쓸 돈이 떨어졌다    → 크레딧을 채워야 한다 (한도와 **잔액은 다르다**)
 *   ③ 이 모델은 못 쓴다   → 계정 등급 문제
 *
 * 공급자가 보낸 **원문 설명을 그대로 덧붙인다.** 우리가 짐작해서 요약하면
 * 정작 필요한 단서가 지워진다.
 */

export type Failure = {
  /** 화면에 보여 줄 우리말 */
  error: string
  /** 잠시 뒤 스스로 다시 해 볼 만한 실패인가 */
  retryable: boolean
  /**
   * 공급자가 **몇 초 뒤에 오라고 했는가.**
   *
   * 이걸 안 쓰면 우리가 짐작한 시간(4초·12초)만큼만 기다리는데,
   * 구글은 **46초 뒤에 오라**고 한 적이 있다. 짐작으로 두 번 두드리고
   * 포기하면 **그 토막 동안 한 말이 통째로 사라진다** (2026-09-05).
   */
  retryAfterMs?: number
}

/**
 * @param provider 어느 회사 것인지. 안내에 엉뚱한 회사 이름을 넣지 않으려고 받는다 —
 *                 실제로 구글 한도 문제에 「OpenAI 결제를 확인하세요」라고 띄운 적이 있다
 */
export function explainFailure(status: number, raw: string, provider = 'openai'): Failure {
  let code = ''
  let message = ''
  try {
    const body = JSON.parse(raw)
    code = String(body?.error?.code ?? body?.error?.type ?? body?.error?.status ?? '')
    message = String(body?.error?.message ?? '')
  } catch {
    message = raw.slice(0, 300)
  }

  // 공급자가 한 말을 그대로 덧붙인다. 여기에 진짜 원인이 들어 있다
  const said = message ? ` — AI 쪽 설명: “${message.slice(0, 300)}”` : ''

  /*
    ⚠️ **429 를 먼저 가른다** (2026-09-05).

    그전에는 「본문에 quota 라는 낱말이 있으면 잔액 부족」으로 봤다. 그런데
    구글의 **분당 한도 초과** 메시지에도 quota 가 들어 있다 —
      "Quota exceeded for metric: ...input_token_count, limit: 10000.
       Please retry in 46.6s"

    이건 **기다리면 풀리는 일**인데 「잔액이 없습니다 · 다시 시도 안 함」으로
    번역돼 나갔다. 게다가 **OpenAI 결제 화면을 확인하라**고 했다 — 구글 문제인데.
    사용자에게는 「받아쓰기가 아예 안 된다」로만 보였다.

    잔액이 진짜 없는 것은 **429 가 아니어도** 나므로 아래에서 따로 본다.
  */
  if (status === 429) {
    const wait = retryAfterSeconds(message)
    const perMinute = /rate limit|per minute|limit: *\d+|requests? per/i.test(message)
    return {
      error:
        (perMinute
          ? `**${vendor(provider)} 쪽 분당 한도에 걸렸습니다.** 잔액 문제가 아니라 **짧은 시간에 너무 많이 보낸 것**입니다.`
          : '요청이 몰려 잠시 거절됐습니다.') +
        (wait ? ` 약 ${Math.ceil(wait)}초 뒤에 다시 시도합니다.` : ' 곧 다시 시도합니다.') +
        said,
      retryable: true,
      retryAfterMs: wait ? Math.ceil(wait * 1000) : undefined,
    }
  }

  if (code === 'insufficient_quota' || /billing|credit balance|payment|결제/i.test(message)) {
    return {
      error:
        `**${vendor(provider)} 크레딧 잔액이 없습니다.** 「이번 달 한도」가 아니라 ` +
        `**충전해 둔 잔액**을 확인해 주세요 (${billingPath(provider)}). ` +
        '한도가 남아 있어도 잔액이 0이면 거절됩니다.' +
        said,
      retryable: false,
    }
  }
  if (code === 'model_not_found' || /does not exist|do not have access/i.test(message)) {
    return {
      error: '이 계정에서 못 쓰는 모델입니다. 모델 이름이나 계정 등급을 확인해 주세요.' + said,
      retryable: false,
    }
  }
  if (status === 401 || status === 403) {
    return { error: 'AI 열쇠가 거부됐습니다. 열쇠가 맞는지 확인해 주세요.' + said, retryable: false }
  }
  if (status >= 500) {
    return { error: 'AI 쪽 서버에 문제가 있습니다. 곧 다시 시도합니다.' + said, retryable: true }
  }
  return { error: `AI 호출이 실패했습니다 (${status}).${said}`, retryable: false }
}

/** 회사 이름을 우리말로. 안내에 엉뚱한 회사가 나오면 사용자가 엉뚱한 곳을 뒤진다 */
function vendor(provider: string): string {
  return provider.toLowerCase().startsWith('gemini') ? '구글' : 'OpenAI'
}

/** 잔액을 확인하러 갈 자리 */
function billingPath(provider: string): string {
  return provider.toLowerCase().startsWith('gemini')
    ? 'Google AI Studio › Billing'
    : 'OpenAI › Settings › Billing › Credit balance'
}

/**
 * 「몇 초 뒤에 오라」는 말을 숫자로 꺼낸다.
 *
 * 공급자마다 적는 모양이 다르다 —
 *   구글    "Please retry in 46.662644828s"
 *   OpenAI  "Please try again in 1.5s" / "in 20s"
 * 못 찾으면 undefined. 그때는 우리가 짐작한 시간으로 기다린다.
 */
function retryAfterSeconds(message: string): number | undefined {
  const m = message.match(/(?:retry|try again) in *([0-9]+(?:\.[0-9]+)?) *s/i)
  if (!m) return undefined
  const v = Number(m[1])
  // 너무 긴 값은 안 믿는다 — 회의 중에 5분을 기다리면 그건 멈춘 것과 같다
  return Number.isFinite(v) && v > 0 && v <= 120 ? v : undefined
}
