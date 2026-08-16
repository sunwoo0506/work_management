import { useState } from 'react'
import { Card, EmptyState, LaterNote, PageHeader } from '../components/ui'
import { PillButton } from '../components/Field'
import { describeTrigger, isDue, nextDue } from '../domain/trigger'
import { triggerOf } from '../features/procedures/api'
import type { Procedure } from '../features/procedures/api'
import {
  useLastPeriods, useOpenRuns, useProcedureMutations, useProcedures,
} from '../features/procedures/hooks'
import ProcedureForm from '../features/procedures/ProcedureForm'
import ProcedureDetail from '../features/procedures/ProcedureDetail'
import RunPanel from '../features/procedures/RunPanel'
import ExceptionInbox from '../features/exceptions/ExceptionInbox'

export default function ProcedurePage() {
  const { data: procedures, isLoading } = useProcedures()
  const { data: lastPeriods } = useLastPeriods()
  const { data: openRuns } = useOpenRuns()
  const { create } = useProcedureMutations()

  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<Procedure | null>(null)
  const [openRun, setOpenRun] = useState<string | null>(null)

  const today = new Date()
  const list = procedures ?? []

  const due = list.filter((p) => {
    if (p.status !== '확정') return false
    return isDue(triggerOf(p), today, lastPeriods?.[p.id] ?? null)
  })

  return (
    <div className="max-w-[1120px]">
      <PageHeader
        title="절차"
        description="이런 일은 이렇게 한다. 실행할 때마다 이력이 쌓여 학습 데이터가 됩니다."
        right={
          <PillButton type="button" onClick={() => setAdding(true)}>
            ＋ 새 절차
          </PillButton>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 mt-6 items-start">
        <div className="space-y-5">
          <Card title="절차" count={list.length}>
            {isLoading ? (
              <p className="text-caption text-ink-mute">불러오는 중…</p>
            ) : list.length === 0 ? (
              <EmptyState
                message="아직 절차가 없습니다."
                hint="아는 업무부터 적으세요. 부가세 신고, 월 마감처럼 매번 하는 일이면 됩니다."
                action={
                  <PillButton type="button" onClick={() => setAdding(true)}>
                    첫 절차 만들기
                  </PillButton>
                }
              />
            ) : (
              <ul className="divide-y divide-divider -mx-1">
                {list.map((p) => {
                  const t = triggerOf(p)
                  const nd = nextDue(t, today)
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setOpen(p)}
                        className="w-full text-left py-3 px-1 flex items-center gap-3 group"
                      >
                        <span className="text-caption text-ink-mute w-11 shrink-0">
                          {p.code ?? ''}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-body truncate group-hover:text-action">
                            {p.title}
                          </span>
                          <span className="text-caption text-ink-mute">
                            {describeTrigger(t)}
                            {nd && ` · 다음 ${nd}`}
                          </span>
                        </span>
                        {p.status !== '확정' && (
                          <span className="text-caption text-ink-mute bg-parchment rounded-full px-2 py-0.5">
                            {p.status}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <ExceptionInbox />
        </div>

        <div className="space-y-5">
          <Card title="절차 대기" count={due.length}>
            {due.length === 0 ? (
              <p className="text-caption text-ink-mute py-1">
                지금 도래한 절차가 없습니다.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {due.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(p)}
                      className="w-full text-left group"
                    >
                      <span className="block text-body group-hover:text-action">{p.title}</span>
                      <span className="text-caption text-action">지금 할 때입니다</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="진행 중 회차" count={openRuns?.length ?? 0}>
            {!openRuns?.length ? (
              <p className="text-caption text-ink-mute py-1">없습니다.</p>
            ) : (
              <ul className="space-y-2.5">
                {openRuns.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setOpenRun(r.id)}
                      className="w-full text-left text-body hover:text-action"
                    >
                      #{r.seq} · {r.period_label ?? '—'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="앞으로">
            <ul className="space-y-2.5">
              <li>
                <LaterNote stage={3}>
                  AI 업무 비서 — 대화에서 절차가 자랍니다
                </LaterNote>
              </li>
              <li>
                <LaterNote stage={3}>문서 초안 — 절차의 산출물</LaterNote>
              </li>
              <li>
                <LaterNote stage={5}>
                  3회차 절차 제안 — 반복되는 업무를 툴이 알아서 찾습니다
                </LaterNote>
              </li>
            </ul>
          </Card>
        </div>
      </div>

      {adding && (
        <div className="fixed inset-0 bg-ink/20 z-50 grid place-items-center px-6"
             onClick={() => setAdding(false)}>
          <div
            className="bg-canvas rounded-lg border border-hairline p-7 w-full max-w-[600px]
                       max-h-[86vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-tagline font-semibold mb-5">새 절차</h2>
            <ProcedureForm
              busy={create.isPending}
              onCancel={() => setAdding(false)}
              onSubmit={(v) => create.mutate(v, { onSuccess: () => setAdding(false) })}
            />
          </div>
        </div>
      )}

      {open && <ProcedureDetail procedure={open} onClose={() => setOpen(null)} />}
      {openRun && <RunPanel runId={openRun} onClose={() => setOpenRun(null)} />}
    </div>
  )
}
