import { useState } from 'react'
import { PillButton, TextInput } from '../../components/Field'
import { useRunSteps, useRunMutations } from './hooks'
import { supabase } from '../../lib/supabase'
import { useQuery } from '@tanstack/react-query'
import type { Run } from './api'

/**
 * 실행 진행 화면.
 *
 * 단계를 체크하면 완료 시각이 찍히고, 소요시간은 직접 적는다.
 * 자동 측정을 안 하는 이유 — 화면을 켜둔 채 다른 일을 하는 경우가 많아
 * 시작~완료 시각이 실제 소요와 다르다. 5단계의 소요시간 이탈 탐지가
 * 이 값을 보므로 부정확한 자동 측정보다 사람이 적는 편이 낫다.
 */
export default function RunPanel({ runId, onClose }: { runId: string; onClose: () => void }) {
  const { data: run } = useQuery({
    queryKey: ['run', runId],
    queryFn: async (): Promise<Run> => {
      const { data, error } = await supabase.from('runs').select('*').eq('id', runId).single()
      if (error) throw error
      return data
    },
  })
  const { data: steps } = useRunSteps(runId)
  const m = useRunMutations(runId)
  const [adhoc, setAdhoc] = useState('')

  if (!run) return null

  const doneCount = (steps ?? []).filter((s) => s.done).length
  const total = steps?.length ?? 0

  return (
    <div className="fixed inset-0 bg-ink/25 z-[60] grid place-items-center px-6" onClick={onClose}>
      <div
        className="bg-canvas rounded-lg border border-hairline w-full max-w-[600px] max-h-[86vh]
                   overflow-y-auto p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-caption text-ink-mute">
              #{run.seq} · {run.period_label ?? '—'} · {run.performer}
            </p>
            <h3 className="text-tagline font-semibold mt-0.5">실행 기록</h3>
          </div>
          <button type="button" onClick={onClose} className="text-caption text-ink-mute">닫기</button>
        </div>

        <div className="flex items-center gap-3 mt-4">
          <div className="h-1.5 flex-1 bg-divider rounded-full overflow-hidden">
            <div
              className="h-full bg-action"
              style={{ width: total ? `${(doneCount / total) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-caption text-ink-mute">{doneCount}/{total}</span>
        </div>

        <ul className="mt-5 divide-y divide-divider border-t border-divider">
          {(steps ?? []).map((s) => (
            <li key={s.id} className="py-3">
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={s.done}
                  disabled={run.result !== '진행중'}
                  onChange={(e) =>
                    m.updateStep.mutate({
                      id: s.id,
                      patch: {
                        done: e.target.checked,
                        done_at: e.target.checked ? new Date().toISOString() : null,
                      },
                    })
                  }
                  className="accent-[#0066cc] mt-1"
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-body ${s.done ? 'text-ink-mute line-through' : ''}`}>
                    {s.seq}. {s.title}
                    {s.procedure_step_id === null && (
                      <span className="text-caption text-action ml-1.5">추가된 단계</span>
                    )}
                  </p>
                  {run.result === '진행중' && (
                    <div className="grid grid-cols-[100px_1fr] gap-2 mt-2">
                      <TextInput
                        type="number"
                        placeholder="소요(분)"
                        defaultValue={s.actual_min ?? ''}
                        onBlur={(e) =>
                          m.updateStep.mutate({
                            id: s.id,
                            patch: {
                              actual_min: e.target.value ? Number(e.target.value) : null,
                            },
                          })
                        }
                      />
                      <TextInput
                        placeholder="산출물 · 메모"
                        defaultValue={s.output ?? ''}
                        onBlur={(e) =>
                          m.updateStep.mutate({ id: s.id, patch: { output: e.target.value } })
                        }
                      />
                    </div>
                  )}
                  {run.result !== '진행중' && (s.actual_min || s.output) && (
                    <p className="text-caption text-ink-mute mt-1">
                      {s.actual_min ? `${s.actual_min}분` : ''}
                      {s.actual_min && s.output ? ' · ' : ''}
                      {s.output ?? ''}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        {run.result === '진행중' && (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const v = adhoc.trim()
                if (!v) return
                const seq = (steps?.length ?? 0)
                  ? Math.max(...(steps ?? []).map((s) => s.seq)) + 1
                  : 1
                m.addAdhoc.mutate({ run, seq, title: v }, { onSuccess: () => setAdhoc('') })
              }}
              className="mt-3"
            >
              <TextInput
                value={adhoc}
                onChange={(e) => setAdhoc(e.target.value)}
                placeholder="절차에 없던 일을 했다면 여기에 (엔터)"
                aria-label="절차에 없던 단계 추가"
              />
              <p className="text-caption text-ink-mute mt-1.5">
                절차에 없던 단계는 5단계에서 예외로 잡힙니다. 그때 절차에 넣을지 정하면 됩니다.
              </p>
            </form>

            <div className="flex gap-2 mt-6">
              <PillButton
                type="button"
                disabled={m.finish.isPending}
                onClick={() => m.finish.mutate({ id: run.id, result: '완료' }, { onSuccess: onClose })}
              >
                회차 완료
              </PillButton>
              <PillButton
                type="button"
                variant="ghost"
                onClick={() => m.finish.mutate({ id: run.id, result: '중단' }, { onSuccess: onClose })}
              >
                중단
              </PillButton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
