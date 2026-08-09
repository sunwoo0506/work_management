import { useState } from 'react'
import { PillButton, TextArea, TextInput } from '../../components/Field'
import { Card, EmptyState } from '../../components/ui'
import { describeTrigger, nextDue } from '../../domain/trigger'
import { triggerOf } from './api'
import type { Procedure, ProcedureStep } from './api'
import {
  useProcedureMutations, useRuns, useStepMutations, useSteps, useStartRun,
} from './hooks'
import ProcedureForm from './ProcedureForm'
import RunPanel from './RunPanel'

export default function ProcedureDetail({
  procedure,
  onClose,
}: {
  procedure: Procedure
  onClose: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [openRun, setOpenRun] = useState<string | null>(null)
  const { data: steps } = useSteps(procedure.id)
  const { data: runs } = useRuns(procedure.id)
  const { update, remove } = useProcedureMutations()
  const start = useStartRun()

  const trigger = triggerOf(procedure)
  const due = nextDue(trigger, new Date())

  return (
    <div className="fixed inset-0 bg-ink/20 z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-canvas w-full max-w-[680px] h-full overflow-y-auto p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-caption text-ink-mute">
              {procedure.code ? `${procedure.code} · ` : ''}
              {describeTrigger(trigger)}
              {due && ` · 다음 ${due}`}
            </p>
            <h2 className="text-tagline font-semibold mt-0.5">{procedure.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-caption text-ink-mute shrink-0">
            닫기
          </button>
        </div>

        {editing ? (
          <div className="mt-6">
            <ProcedureForm
              initial={procedure}
              busy={update.isPending}
              onCancel={() => setEditing(false)}
              onSubmit={(v) =>
                update.mutate(
                  { id: procedure.id, patch: v },
                  { onSuccess: () => setEditing(false) },
                )
              }
            />
          </div>
        ) : (
          <>
            {procedure.purpose && (
              <p className="text-body text-ink-soft mt-4 leading-relaxed whitespace-pre-wrap">
                {procedure.purpose}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-5">
              <span className="text-caption text-ink-mute bg-parchment rounded-full px-2.5 py-1">
                {procedure.status}
              </span>
              <span className="text-caption text-ink-mute bg-parchment rounded-full px-2.5 py-1">
                {procedure.ai_delegation}
              </span>
              {procedure.area && (
                <span className="text-caption text-ink-mute bg-parchment rounded-full px-2.5 py-1">
                  {procedure.area}
                </span>
              )}
            </div>

            <div className="mt-6">
              <StepEditor procedureId={procedure.id} steps={steps ?? []} />
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <PillButton
                type="button"
                disabled={start.isPending || (steps?.length ?? 0) === 0}
                onClick={() =>
                  start.mutate({ procedure, steps: steps ?? [] })
                }
              >
                {start.isPending ? '시작하는 중…' : '이번 회차 시작'}
              </PillButton>
              <PillButton type="button" variant="ghost" onClick={() => setEditing(true)}>
                수정
              </PillButton>
              <PillButton
                type="button"
                variant="ghost"
                onClick={() => {
                  if (confirm('이 절차를 삭제할까요? 실행이력도 함께 지워집니다.')) {
                    remove.mutate(procedure.id, { onSuccess: onClose })
                  }
                }}
              >
                삭제
              </PillButton>
            </div>

            {(steps?.length ?? 0) === 0 && (
              <p className="text-caption text-ink-mute mt-2">
                단계를 하나 이상 적어야 회차를 시작할 수 있습니다.
              </p>
            )}

            <section className="mt-8">
              <h3 className="text-body font-semibold mb-3">
                실행이력 <span className="text-ink-mute font-normal">{runs?.length ?? 0}</span>
              </h3>
              {!runs?.length ? (
                <Card>
                  <EmptyState
                    message="아직 실행한 적이 없습니다."
                    hint="회차를 시작하면 여기에 쌓입니다. 이게 학습 데이터가 됩니다."
                  />
                </Card>
              ) : (
                <ul className="divide-y divide-divider border-t border-divider">
                  {runs.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setOpenRun(r.id)}
                        className="w-full text-left py-3 flex items-center gap-3 group"
                      >
                        <span className="text-caption text-ink-mute w-12">#{r.seq}</span>
                        <span className="text-body flex-1 group-hover:text-action">
                          {r.period_label ?? '—'}
                        </span>
                        <span className="text-caption text-ink-mute">{r.performer}</span>
                        <span
                          className={`text-caption w-14 text-right ${
                            r.result === '진행중' ? 'text-action font-semibold' : 'text-ink-mute'
                          }`}
                        >
                          {r.result}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {openRun && <RunPanel runId={openRun} onClose={() => setOpenRun(null)} />}
      </div>
    </div>
  )
}

/** 단계 편집. 판단기준이 AI에게 가장 중요하므로 눈에 띄게 둔다 */
function StepEditor({ procedureId, steps }: { procedureId: string; steps: ProcedureStep[] }) {
  const m = useStepMutations(procedureId)
  const [title, setTitle] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <section>
      <h3 className="text-body font-semibold mb-2">
        단계 <span className="text-ink-mute font-normal">{steps.length}</span>
      </h3>

      <ul className="divide-y divide-divider border-t border-divider">
        {steps.map((s) => (
          <li key={s.id} className="py-2.5">
            <div className="flex items-center gap-2.5">
              <span className="text-caption text-ink-mute w-5">{s.seq}</span>
              <button
                type="button"
                onClick={() => setOpenId(openId === s.id ? null : s.id)}
                className="text-body flex-1 text-left hover:text-action"
              >
                {s.title}
              </button>
              {s.decision_rule && (
                <span className="text-caption text-action" title="판단기준 있음">◆</span>
              )}
              <button
                type="button"
                onClick={() => m.remove.mutate(s.id)}
                className="text-caption text-ink-mute"
              >
                ×
              </button>
            </div>

            {openId === s.id && (
              <div className="mt-2.5 pl-7 space-y-2.5">
                <label className="block">
                  <span className="block text-caption text-ink-soft mb-1">하는 일</span>
                  <TextArea
                    rows={2}
                    defaultValue={s.what_to_do ?? ''}
                    onBlur={(e) =>
                      m.update.mutate({ id: s.id, patch: { what_to_do: e.target.value } })
                    }
                  />
                </label>
                <label className="block">
                  <span className="block text-caption text-ink-soft mb-1">
                    판단기준 <span className="text-action">◆</span>
                    <span className="text-ink-mute ml-1">
                      언제 멈춰야 하는지. AI에게 가장 중요합니다
                    </span>
                  </span>
                  <TextArea
                    rows={2}
                    placeholder="예: 대사 차이 10만원 초과 시 원인 규명 전 진행 금지"
                    defaultValue={s.decision_rule ?? ''}
                    onBlur={(e) =>
                      m.update.mutate({ id: s.id, patch: { decision_rule: e.target.value } })
                    }
                  />
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <span className="block text-caption text-ink-soft mb-1">필요 자료</span>
                    <TextInput
                      defaultValue={s.needed_input ?? ''}
                      onBlur={(e) =>
                        m.update.mutate({ id: s.id, patch: { needed_input: e.target.value } })
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="block text-caption text-ink-soft mb-1">예상 소요(분)</span>
                    <TextInput
                      type="number"
                      defaultValue={s.expected_min ?? ''}
                      onBlur={(e) =>
                        m.update.mutate({
                          id: s.id,
                          patch: { expected_min: e.target.value ? Number(e.target.value) : null },
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const v = title.trim()
          if (!v) return
          const seq = steps.length ? Math.max(...steps.map((s) => s.seq)) + 1 : 1
          m.add.mutate({ seq, title: v }, { onSuccess: () => setTitle('') })
        }}
        className="mt-2.5"
      >
        <TextInput
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="단계 추가 후 엔터"
          aria-label="절차 단계 추가"
        />
      </form>
    </section>
  )
}
