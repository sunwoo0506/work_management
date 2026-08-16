import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Row } from '../../lib/supabase'
import type { Json } from '../../lib/database.types'
import { PillButton, TextArea } from '../../components/Field'
import { Card, EmptyState, StatTile } from '../../components/ui'
import { buildReport, periodRange } from '../../domain/report'
import type { ReportKind, ReportSnapshot } from '../../domain/report'
import { useCompanyId } from '../companies/useCompany'

type Report = Row<'periodic_reports'>

const KINDS: ReportKind[] = ['주간', '월간', '연간']

/**
 * 리포트.
 *
 * 밖으로 나가지 않는 내부 자료다. 사용자 본인의 모니터링과 연말
 * 성과평가에 쓴다 (설계서 §5.5).
 *
 * 확정하면 스냅샷이 굳는다 — 나중에 업무를 수정해도 지난 리포트는
 * 변하지 않는다. 연말에 "3월에 뭐 했더라"를 되짚기 위해서다.
 */
export default function ReportPanel() {
  const companyId = useCompanyId()
  const qc = useQueryClient()
  const [kind, setKind] = useState<ReportKind>('주간')
  const today = new Date()
  const { from, to } = periodRange(kind, today)

  const { data: saved } = useQuery({
    queryKey: ['report', companyId, kind, from],
    queryFn: async (): Promise<Report | null> => {
      const { data, error } = await supabase
        .from('periodic_reports')
        .select('*')
        .eq('company_id', companyId as string)
        .eq('kind', kind)
        .eq('period_from', from)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!companyId,
  })

  /** 아직 확정 안 했을 때 미리 보여줄 집계 */
  const { data: preview } = useQuery({
    queryKey: ['report-preview', companyId, kind, from],
    queryFn: async (): Promise<ReportSnapshot> => {
      const [tasks, procs, runs, excs] = await Promise.all([
        supabase.from('tasks').select('*').eq('company_id', companyId as string),
        supabase.from('procedures').select('id').eq('company_id', companyId as string).eq('status', '확정'),
        supabase.from('runs').select('id, finished_at').eq('company_id', companyId as string).eq('result', '완료'),
        supabase.from('exceptions').select('id, confirm').eq('company_id', companyId as string).neq('confirm', '대기'),
      ])
      if (tasks.error) throw tasks.error

      const inRange = (iso: string | null) =>
        !!iso && iso.slice(0, 10) >= from && iso.slice(0, 10) <= to

      return buildReport(kind, today, {
        tasks: tasks.data,
        proceduresConfirmed: procs.data?.length ?? 0,
        runsFinishedInRange: (runs.data ?? []).filter((r) => inRange(r.finished_at)).length,
        exceptionsHandledInRange: excs.data?.length ?? 0,
      })
    },
    enabled: !!companyId && !saved?.closed_at,
  })

  const close = useMutation({
    mutationFn: async (narrative: string) => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')
      if (!preview) throw new Error('집계를 아직 불러오지 못했습니다.')

      const { error } = await supabase.from('periodic_reports').upsert(
        {
          company_id: companyId as string,
          user_id: userId,
          kind,
          period_from: from,
          period_to: to,
          snapshot: preview as unknown as Json,
          narrative: narrative || null,
          closed_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,kind,period_from' },
      )
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report'] }),
  })

  const [narrative, setNarrative] = useState('')
  const closed = !!saved?.closed_at
  const snap = closed
    ? (saved.snapshot as unknown as ReportSnapshot)
    : preview

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={[
                'text-caption rounded-full px-3 py-1.5 border',
                kind === k
                  ? 'text-action border-action font-semibold'
                  : 'text-ink-mute border-hairline hover:text-ink',
              ].join(' ')}
            >
              {k}
            </button>
          ))}
        </div>
        <p className="text-caption text-ink-mute">
          {from} ~ {to}
          {closed && <span className="text-action ml-2">확정됨</span>}
        </p>
      </div>

      {!snap ? (
        <Card><EmptyState message="집계를 불러오는 중…" /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="완료한 업무" value={snap.doneCount} />
            <StatTile label="기한 넘김" value={snap.overdueCount} warn />
            <StatTile label="끝낸 회차" value={snap.runsFinished} />
            <StatTile label="확인한 예외" value={snap.exceptionsHandled} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="영역별 완료">
              {snap.byArea.length === 0 ? (
                <p className="text-caption text-ink-mute py-1">완료한 업무가 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {snap.byArea.map((a) => (
                    <li key={a.area} className="flex items-center gap-3">
                      <span className="text-body flex-1 truncate">{a.area}</span>
                      <div className="h-1.5 w-24 bg-divider rounded-full overflow-hidden">
                        <div
                          className="h-full bg-action"
                          style={{ width: `${(a.count / snap.doneCount) * 100}%` }}
                        />
                      </div>
                      <span className="text-caption text-ink-mute w-6 text-right">{a.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="그밖에">
              <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-body">
                <dt className="text-caption text-ink-mute pt-0.5">중요도별</dt>
                <dd>{snap.byPriority.map((p) => `${p.priority} ${p.count}`).join(' · ') || '—'}</dd>
                <dt className="text-caption text-ink-mute pt-0.5">절차에서 나온 업무</dt>
                <dd>{snap.fromProcedure}건</dd>
                <dt className="text-caption text-ink-mute pt-0.5">확정된 절차</dt>
                <dd>{snap.proceduresConfirmed}개</dd>
              </dl>
            </Card>
          </div>

          <Card title={`완료한 업무 ${snap.doneTitles.length}`}>
            {snap.doneTitles.length === 0 ? (
              <p className="text-caption text-ink-mute py-1">없습니다.</p>
            ) : (
              <ul className="space-y-1">
                {snap.doneTitles.map((t, i) => (
                  <li key={`${t}-${i}`} className="text-body text-ink-soft flex gap-2">
                    <span aria-hidden className="text-ink-mute">·</span>
                    {t}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="서술">
            <p className="text-caption text-ink-mute mb-2">
              숫자가 설명하지 못하는 것. 연말 성과평가에서 이 부분이 쓰입니다.
            </p>
            {closed ? (
              <p className="text-body text-ink-soft whitespace-pre-wrap leading-relaxed">
                {saved.narrative || '(적지 않음)'}
              </p>
            ) : (
              <TextArea
                rows={4}
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                placeholder="이번 기간에 무엇이 잘 됐고 무엇이 막혔나"
              />
            )}
          </Card>

          {!closed && (
            <div className="flex items-center gap-3">
              <PillButton
                type="button"
                disabled={close.isPending}
                onClick={() => close.mutate(narrative)}
              >
                {close.isPending ? '확정 중…' : '리포트 확정'}
              </PillButton>
              <p className="text-caption text-ink-mute">
                확정하면 굳습니다. 나중에 업무를 고쳐도 이 리포트는 변하지 않습니다.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
