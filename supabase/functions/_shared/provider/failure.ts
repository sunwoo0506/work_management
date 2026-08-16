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
}

export function explainFailure(status: number, raw: string): Failure {
  let code = ''
  let message = ''
  try {
    const body = JSON.parse(raw)
    code = String(body?.error?.code ?? body?.error?.type ?? '')
    message = String(body?.error?.message ?? '')
  } catch {
    message = raw.slice(0, 300)
  }

  // 공급자가 한 말을 그대로 덧붙인다. 여기에 진짜 원인이 들어 있다
  const said = message ? ` — AI 쪽 설명: “${message.slice(0, 300)}”` : ''

  if (code === 'insufficient_quota' || /quota|billing|credit|payment/i.test(message)) {
    return {
      error:
        '**AI 크레딧 잔액이 없습니다.** 「이번 달 한도」가 아니라 **충전해 둔 잔액**을 확인해 주세요 ' +
        '(OpenAI › Settings › Billing › Credit balance). 한도가 남아 있어도 잔액이 0이면 거절됩니다.' +
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
  if (status === 429) {
    return { error: '요청이 몰려 잠시 거절됐습니다. 곧 다시 시도합니다.' + said, retryable: true }
  }
  if (status === 401 || status === 403) {
    return { error: 'AI 열쇠가 거부됐습니다. 열쇠가 맞는지 확인해 주세요.' + said, retryable: false }
  }
  if (status >= 500) {
    return { error: 'AI 쪽 서버에 문제가 있습니다. 곧 다시 시도합니다.' + said, retryable: true }
  }
  return { error: `AI 호출이 실패했습니다 (${status}).${said}`, retryable: false }
}
