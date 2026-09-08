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

  const { data, isLoading } = useQuery({
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

      {isLoading ? (
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
              호출 {s.calls.toLocaleString()}회
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
                  단가를 모르는 모델 {s.unpriced}건이 있어 금액에 안 들어갔습니다.
                  모델을 바꾸셨다면 <code>domain/aiUsage.ts</code> 의 단가표를 고쳐야 합니다.{' '}
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
        <p>
          <strong className="font-semibold">여기서 못 재는 것</strong> — 실제 청구액 ·
          저장소 용량 · DB 용량 · Edge Function 호출 수. 공급자 결제 화면에서 확인하세요.
        </p>
        <p>
          금액은 <strong className="font-semibold">어림값</strong>입니다. 단가표 기준일{' '}
          {PRICED_AT} · 공급자가 단가를 바꾸면 어긋납니다.
        </p>
      </div>
    </Card>
  )
}
