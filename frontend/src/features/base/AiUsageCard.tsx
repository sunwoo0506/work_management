import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui'
import { PRICED_AT, hours, monthStart, summarize, won } from '../../domain/aiUsage'
import type { UsageRow } from '../../domain/aiUsage'

/**
 * AI 사용량 — **어느 기능이 얼마나 썼나.**
 *
 * ── 이 화면이 답하는 질문 하나 ───────────────────────────
 * *"비용을 줄이려면 어디를 줄여야 하나."*
 *
 * 공급자의 결제 화면은 **총액**을 알려 준다. 그건 여기서 안 만든다 —
 * 이미 있는 것을 두 번 만들 이유가 없고, 우리가 만들면 진짜 청구액과
 * 어긋나서 오히려 헷갈린다.
 *
 * 대신 **공급자가 절대 알려 줄 수 없는 것**만 여기서 보여 준다.
 * 「회의록 채굴이 이번 달 얼마 썼나」는 우리 코드만 아는 사실이다.
 *
 * ── ★ 못 재는 것을 숨기지 않는다 ────────────────────────
 * 화면 아래에 **여기서 안 보이는 것**을 적어 둔다. 그게 없으면 사용자가
 * 이 숫자를 전부인 줄 알고, 실제 청구서를 보고 놀란다.
 * 「빈 칸은 눈에 띄지만 잘못 채운 칸은 틀린 줄 모르고 지나간다」와 같은 원칙이다.
 */
export default function AiUsageCard() {
  const from = monthStart().toISOString()

  /**
   * 공급자에게 물어본 **실제 청구액** (2026-09-08).
   *
   * 우리 표는 「우리가 부른 것」만 알고 금액도 어림값이다. 진짜 청구액은
   * 공급자만 안다. 관리자 열쇠가 없으면 「미설정」으로 나오고, 그때도
   * 아래 어림값은 그대로 보인다 — **부가 기능이 없다고 화면이 죽으면 안 된다.**
   */
  const { data: real } = useQuery({
    queryKey: ['ai-cost', from],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('ai-cost', { body: {} })
      if (error) return { configured: false, reason: '비용 조회를 부르지 못했습니다.' }
      return data as {
        configured: boolean
        amount?: number
        currency?: string
        reason?: string
        error?: string
      }
    },
    // 청구액은 자주 안 바뀐다. 화면을 열 때마다 부르지 않는다
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  const { data, isLoading, error } = useQuery({
    queryKey: ['ai-usage', from],
    queryFn: async (): Promise<UsageRow[]> => {
      const { data, error } = await supabase
        .from('ai_usage')
        .select('feature, model, tokens_in, tokens_out, audio_sec, ok, created_at')
        .gte('created_at', from)
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) throw error
      return (data ?? []) as UsageRow[]
    },
  })

  const rows = data ?? []
  const s = summarize(rows)
  const month = `${monthStart().getMonth() + 1}월`

  return (
    <Card title="AI 사용량" count={s.calls}>
      <p className="text-caption text-ink-mute mb-4">
        {month} 1일부터 지금까지. <strong className="font-semibold">어느 기능이 얼마나
        썼는지</strong>를 보는 자리입니다 — 실제 청구액은 공급자 결제 화면이 원본입니다.
      </p>

      {/*
        ★ 오류를 삼키지 않는다 (2026-09-08).
        전에는 읽기가 실패해도 「기록이 없습니다」로 보여서, 사용자가
        **안 쓴 줄 알았다.** 못 읽은 것과 안 쓴 것은 다르다.
      */}
      {error ? (
        <p className="text-caption text-alert">
          사용량을 읽지 못했습니다 — {(error as Error).message}
        </p>
      ) : isLoading ? (
        <p className="text-caption text-ink-mute">읽는 중…</p>
      ) : s.calls === 0 ? (
        <p className="text-caption text-ink-mute">
          {month}에 AI 를 부른 기록이 없습니다.
        </p>
      ) : (
        <>
          {/* 맨 위 한 줄 — 이것만 봐도 이번 달이 파악돼야 한다 */}
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 pb-4 mb-4 border-b border-hairline">
            <span className="text-metric leading-none font-semibold tracking-[-0.5px]">
              {won(s.won)}
            </span>
            <span className="text-caption text-ink-mute">
              이 툴 어림값 · 호출 {s.calls.toLocaleString()}회
              {s.failed > 0 && <> · 실패 {s.failed}회</>}
            </span>
          </div>

          {/*
            표를 좁은 화면에서 가로로 밀리게 두지 않는다 —
            폰에서도 보는 화면이다
          */}
          <div className="overflow-x-auto">
            <table className="w-full text-caption">
              <thead>
                <tr className="text-ink-mute text-left">
                  <th className="font-normal pb-2 pr-4">기능</th>
                  <th className="font-normal pb-2 pr-4 text-right">호출</th>
                  <th className="font-normal pb-2 pr-4 text-right">토큰 · 길이</th>
                  <th className="font-normal pb-2 text-right">어림 금액</th>
                </tr>
              </thead>
              <tbody>
                {s.totals.map((t) => (
                  <tr key={t.feature} className="border-t border-hairline">
                    <td className="py-2 pr-4">
                      {t.feature}
                      {t.failed > 0 && (
                        <span className="text-alert ml-1.5">실패 {t.failed}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {t.calls.toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-ink-mute">
                      {t.audioSec > 0
                        ? hours(t.audioSec)
                        : (t.tokensIn + t.tokensOut).toLocaleString()}
                    </td>
                    <td className="py-2 text-right tabular-nums font-semibold">
                      {t.unpriced > 0 ? '—' : won(t.won)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/*
            ★ 금액이 실제보다 적게 잡히는 경우를 **반드시 밝힌다.**
            이걸 안 적으면 사용자가 위 숫자를 그대로 믿는다.
          */}
          {(s.unpriced > 0 || s.unknownLength > 0) && (
            <p className="text-caption text-alert mt-3">
              {s.unpriced > 0 && (
                <>
                  단가를 모르는 모델 {s.unpriced}건이 있어 금액에 안 들어갔습니다 —{' '}
                  <strong className="font-semibold">
                    {s.unpricedModels.join(' · ')}
                  </strong>
                  . 이 이름을 <code>domain/aiUsage.ts</code> 의 단가표에 더해야 합니다.{' '}
                </>
              )}
              {s.unknownLength > 0 && (
                <>
                  길이를 모르는 받아쓰기 {s.unknownLength}건이 있습니다(실시간 받아쓰기).
                  그만큼 금액이 적게 잡혀 있습니다.
                </>
              )}
            </p>
          )}
        </>
      )}

      <div className="text-caption text-ink-mute mt-4 pt-4 border-t border-hairline space-y-1">
        {/* ★ 실제 청구액 — 어림값과 나란히 두지 않는다. 둘은 세는 범위가 다르다 */}
        {real?.configured && typeof real.amount === 'number' ? (
          <p>
            <strong className="font-semibold text-ink">
              공급자 실제 청구액 {real.amount.toFixed(2)} {(real.currency ?? 'usd').toUpperCase()}
            </strong>{' '}
            — 이번 달, <strong className="font-semibold">조직 전체</strong> 기준입니다.
            같은 열쇠를 쓰는 다른 프로젝트 비용도 함께 잡힙니다.
          </p>
        ) : real?.error ? (
          <p className="text-alert">실제 청구액을 못 읽었습니다 — {real.error}</p>
        ) : (
          <p>
            <strong className="font-semibold">실제 청구액 미설정</strong> — 보시려면
            OpenAI 대시보드에서 <strong className="font-semibold">Admin key</strong> 를 만들어
            Supabase Secrets 에 <code>OPENAI_ADMIN_KEY</code> 로 넣어 주세요.
            (평소 쓰는 열쇠와 등급이 다릅니다)
          </p>
        )}
        <p>
          <strong className="font-semibold">여기서 못 재는 것</strong> — 저장소 용량 ·
          DB 용량 · Edge Function 호출 수. 공급자 대시보드에서 확인하세요.
        </p>
        <p>
          금액은 <strong className="font-semibold">어림값</strong>입니다. 단가표 기준일{' '}
          {PRICED_AT} · 공급자가 단가를 바꾸면 어긋납니다.
        </p>
      </div>
    </Card>
  )
}
