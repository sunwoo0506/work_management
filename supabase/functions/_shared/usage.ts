// deno-lint-ignore-file no-explicit-any
import type { ChatMessage, ChatOptions, ChatResult, Provider } from './provider/types.ts'

/**
 * AI 사용량 기록 — **부를 때마다 한 줄 남긴다.**
 *
 * ── 왜 필요한가 (2026-09-08) ────────────────────────────────
 * 공급자의 결제 화면은 「이번 달 얼마 나갔나」를 알려 준다. 그런데
 * **「어느 기능이 얼마 썼나」는 어디서도 알 수 없다.** 그건 우리 코드만 아는
 * 사실이고, 그게 없으면 비용을 줄이려 할 때 **어디를 줄일지 모른다.**
 *
 * 토큰 수는 이미 받고 있었는데 **챗봇 대화에만 저장**하고 나머지는 버렸다.
 * 하필 같은 날 회의록을 두 걸음으로 바꿔 1.4배 비싸게 만들었는데,
 * 그게 기록이 안 되는 쪽이었다.
 *
 * ── ★ 왜 「감싸는」 방식인가 ────────────────────────────────
 * 기록 코드를 **부르는 쪽마다 붙이면 언젠가 한 곳을 빠뜨린다.**
 * 이 저장소는 그걸 두 번 겪었다 —
 *   · 2026-08-19 지어낸 말 걸러내기를 네 길 중 한 곳에만 붙였다
 *   · 2026-09-08 구간 나누기가 회의록 화면에만 붙어 있었다
 *
 * 그래서 **공급자 자체를 감싼다.** AI 를 부르는 길은 `provider.chat()`
 * 하나뿐이므로, 그걸 감싸면 **빠져나갈 구멍이 없다.** 새 기능을 붙이는
 * 사람이 이 파일을 몰라도 기록은 남는다.
 */

/** 한 줄에 담는 것. 금액은 안 담는다 — 단가는 공급자가 바꾼다 */
export type UsageRow = {
  /** 질문 · 체크리스트 · 채굴 · 회의록 · 전사 */
  feature: string
  model: string
  tokensIn?: number | null
  tokensOut?: number | null
  /** 소리 받아쓰기일 때 몇 초짜리였나 */
  audioSec?: number | null
  /** 실패한 호출도 남긴다 — 실패해도 돈이 나가는 경우가 있다 */
  ok?: boolean
}

/**
 * 한 줄 적는다.
 *
 * ⚠️ **기록이 실패해도 AI 답은 나가야 한다.** 「AI 가 죽어도 업무 기록은
 *    정상 동작해야 한다」(CLAUDE.md)를 뒤집은 것이다 — 곁다리 기능이
 *    본 기능을 무너뜨리면 안 된다. 그래서 삼키고 로그만 남긴다.
 *
 * ⚠️ `company_id` 는 지금 채우지 않는다. 브라우저가 보내는 값을 그대로 믿는
 *    자리를 늘리고 싶지 않고, 지금은 업체가 하나라 갈라 볼 것도 없다.
 *    업체가 늘면 그때 **서버에서 확인해서** 채운다 (칸은 미리 만들어 뒀다).
 */
export async function recordUsage(db: any, userId: string, row: UsageRow): Promise<void> {
  try {
    await db.from('ai_usage').insert({
      user_id: userId,
      feature: row.feature,
      model: row.model || '',
      tokens_in: row.tokensIn ?? null,
      tokens_out: row.tokensOut ?? null,
      audio_sec: row.audioSec ?? null,
      ok: row.ok !== false,
    })
  } catch (e) {
    // 여기서 던지면 답을 다 만들어 놓고 사용자에게 오류를 준다. 그건 손해다
    console.error('사용량 기록 실패(무시):', e)
  }
}

/**
 * ★ 공급자를 감싸 **부를 때마다 기록하게** 만든다.
 *
 * 쓰는 쪽은 평소처럼 `provider.chat(...)` 만 부른다. 기록을 잊을 방법이 없다.
 *
 * 실패한 호출도 남기고 **오류는 그대로 다시 던진다** — 기록은 곁다리이지
 * 오류를 삼키는 자리가 아니다. 삼키면 진짜 문제가 조용히 묻힌다.
 *
 * @param feature 무엇에 쓴 호출인가. ai-assist 의 mode 를 그대로 넘긴다
 */
export function metered(
  provider: Provider,
  db: any,
  userId: string,
  feature: string,
): Provider {
  return {
    name: provider.name,
    async chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult> {
      try {
        const result = await provider.chat(messages, opts)
        await recordUsage(db, userId, {
          feature,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
        })
        return result
      } catch (e) {
        await recordUsage(db, userId, { feature, model: '', ok: false })
        throw e
      }
    },
  }
}
