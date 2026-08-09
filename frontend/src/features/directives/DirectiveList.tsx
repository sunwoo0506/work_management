import { useState } from 'react'
import { rollupByDirective } from '../../domain/rollup'
import { daysUntil, ddayLabel, scheduleOf } from '../../domain/dday'
import { PriorityBadge, ScheduleBadge } from '../../components/Badge'
import { useDirectives } from './hooks'
import { useTasks } from '../tasks/hooks'
import type { Task } from '../tasks/api'

/**
 * 지시사항별 진행 상황.
 *
 * 집계는 domain/rollup.ts 가 한다 — 시작일은 소속 업무의 최소 시작일,
 * 마감일은 최대 기한, 진행률은 평균. 화면에서 다시 계산하지 않는다.
 *
 * 줄을 누르면 상세가 열린다. 상세에 「배경」을 두는 이유 —
 * 몇 달 뒤에 이 지시사항을 다시 볼 때 필요한 건 무엇을 하라는 말이 아니라
 * **왜 그게 먼저인가**다. 그게 없으면 순서를 바꿔도 되는지 알 수 없다.
 */
export default function DirectiveList({
  today,
  onOpenTask,
}: {
  today: Date
  onOpenTask?: (task: Task) => void
}) {
  const { data: directives, isLoading } = useDirectives()
  const { data: tasks } = useTasks()
  const [openId, setOpenId] = useState<string | null>(null)

  if (isLoading) return <p className="text-caption text-ink-mute">불러오는 중…</p>
  if (!directives?.length) return <p className="text-body text-ink-mute">지시사항이 없습니다.</p>

  const rows = rollupByDirective(directives, tasks ?? [])

  return (
    <ul className="divide-y divide-divider">
      {rows.map((r) => {
        const d = daysUntil(r.dueDate, today)
        const directive = directives.find((x) => x.id === r.id)
        const open = openId === r.id
        const mine = (tasks ?? []).filter((t) => t.directive_id === r.id)

        return (
          <li key={r.id} className="py-4 px-2">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : r.id)}
              className="w-full text-left group"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-caption text-ink-mute font-semibold w-12 shrink-0">
                  {r.code}
                </span>
                <span className="text-body flex-1 group-hover:text-action">{r.title}</span>
                {directive?.source_ref && (
                  <span className="text-caption text-ink-mute shrink-0">{directive.source_ref}</span>
                )}
                <PriorityBadge priority={directive?.priority ?? 'P1'} />
                <span aria-hidden className="text-caption text-ink-mute w-3 text-center shrink-0">
                  {open ? '−' : '+'}
                </span>
              </div>

              <div className="flex items-center gap-3 mt-2 pl-14">
                <div className="h-1.5 flex-1 bg-divider rounded-full overflow-hidden">
                  <div className="h-full bg-action" style={{ width: `${r.progress}%` }} />
                </div>
                <span className="text-caption text-ink-mute w-10 text-right">{r.progress}%</span>
                <span className="text-caption text-ink-mute w-20 text-right">
                  업무 {r.doneCount}/{r.totalCount}
                </span>
                <span className="text-caption text-ink-mute w-20 text-right">
                  {r.totalCount > 0 ? ddayLabel(d) : '—'}
                </span>
              </div>
            </button>

            {open && directive && (
              <div className="mt-4 ml-14 border-l border-hairline pl-4 space-y-3">
                {directive.summary && (
                  <Block label="무엇을">{directive.summary}</Block>
                )}
                {directive.rationale && (
                  <Block label="왜 먼저인가">{directive.rationale}</Block>
                )}

                <dl className="grid grid-cols-[68px_1fr] gap-y-1.5 text-caption">
                  <dt className="text-ink-mute">영역</dt>
                  <dd className="text-ink-soft">{directive.area ?? '—'}</dd>
                  <dt className="text-ink-mute">지시 기한</dt>
                  <dd className="text-ink-soft">{directive.due_date ?? '—'}</dd>
                  {directive.source_ref && (
                    <>
                      <dt className="text-ink-mute">근거</dt>
                      <dd className="text-ink-soft">
                        사업이해자료 {directive.source_ref}
                      </dd>
                    </>
                  )}
                  <dt className="text-ink-mute">상태</dt>
                  <dd className="text-ink-soft">{directive.status}</dd>
                </dl>

                <div>
                  <p className="text-caption text-ink-mute mb-1.5">
                    딸린 업무 {mine.length}
                  </p>
                  {mine.length === 0 ? (
                    <p className="text-caption text-ink-mute">
                      아직 없습니다. 업무를 만들 때 이 지시사항에 연결하세요.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {mine.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            disabled={!onOpenTask}
                            onClick={() => onOpenTask?.(t)}
                            className="w-full text-left flex items-center gap-2 group/task disabled:cursor-default"
                          >
                            <span
                              aria-hidden
                              className={`text-caption w-3 shrink-0 ${
                                t.status === '완료' ? 'text-action' : 'text-ink-mute'
                              }`}
                            >
                              {t.status === '완료' ? '✓' : '·'}
                            </span>
                            <span
                              className={`text-caption flex-1 truncate ${
                                t.status === '완료'
                                  ? 'text-ink-mute line-through'
                                  : 'text-ink-soft group-hover/task:text-action'
                              }`}
                            >
                              {t.title}
                            </span>
                            <ScheduleBadge
                              schedule={scheduleOf(t, today)}
                              label={ddayLabel(daysUntil(t.due_date, today))}
                            />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-caption text-ink-mute mb-0.5">{label}</p>
      <p className="text-body text-ink-soft leading-relaxed whitespace-pre-wrap">{children}</p>
    </div>
  )
}
